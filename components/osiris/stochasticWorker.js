/**
 * Project Osiris - Stochastic Worker
 * Handles Monte Carlo simulations off the main thread.
 * Zero external dependencies.
 *
 * Phase 1 math corrections:
 *   - dt = 1/252 (calendar-time scaling, decoupled from horizon length)
 *   - Merton jump compensator on GBM (removes systematic upward P50 bias)
 *   - Empirical pAboveSpot computed from the 5000 terminals directly
 *     (replaces a non-normal Φ(z) approximation in the Oracle)
 *
 * Phase B (HI-FI mode):
 *   - Optional antithetic variates — pair each Brownian path with its
 *     sign-flipped twin to halve Monte Carlo variance at zero compute
 *     overhead. Only the Gaussian diffusion shocks are paired; jumps
 *     stay independent so we don't destroy the Poisson distribution.
 *   - Chunked progress messages so the UI can render a progress bar
 *     during long high-path runs (50K / 100K / 250K).
 */

// Progress chunk: emit ~10 ticks across the whole run regardless of N.
const PROGRESS_TICKS = 10;

// Box-Muller standard-normal sample
function randomNormal() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function postProgress(p, paths, chunkSize) {
    if (chunkSize <= 0) return;
    if (p > 0 && (p % chunkSize) === 0) {
        self.postMessage({ progress: p / paths });
    }
}

function extractPercentilePaths(pathsMatrix, steps, paths, initialPrice) {
    const terminalValues = new Array(paths);
    let countAbove = 0;
    for (let p = 0; p < paths; p++) {
        const terminal = pathsMatrix[p * steps + (steps - 1)];
        terminalValues[p] = { index: p, value: terminal };
        if (terminal > initialPrice) countAbove++;
    }

    terminalValues.sort((a, b) => a.value - b.value);

    function getPath(percentile) {
        const pathIndex = terminalValues[Math.floor(paths * percentile)].index;
        const path = new Float32Array(steps);
        for (let t = 0; t < steps; t++) {
            path[t] = pathsMatrix[pathIndex * steps + t];
        }
        return path;
    }

    return {
        percentiles: {
            p05: getPath(0.05),
            p10: getPath(0.10),
            p25: getPath(0.25),
            p45: getPath(0.45),
            p50: getPath(0.50),
            p55: getPath(0.55),
            p75: getPath(0.75),
            p90: getPath(0.90),
            p95: getPath(0.95)
        },
        pAboveSpot: countAbove / paths
    };
}

// Engine A: Ornstein-Uhlenbeck
// longTermMean is the calibrated reversion target (1y arithmetic mean of
// adjClose, supplied via physicsParams.longTermMean). Falls back to the old
// initialPrice * exp(drift) formula if the calibrated value is unavailable.
// intradaySteps (default 1) collapses dt below the daily floor — when > 1,
// each output step represents 1/(intradaySteps) of a trading day. Sigma is
// expected to be annualised regardless; the dt rescaling handles the math.
function simulateOU(initialPrice, drift, sigma, steps, paths, theta, longTermMean, antithetic, intradaySteps) {
    const dt = 1 / (252 * (intradaySteps || 1)); // sub-daily when intradaySteps > 1
    const reversionTarget = (typeof longTermMean === 'number' && longTermMean > 0)
        ? longTermMean
        : initialPrice * Math.exp(drift);
    const pathsMatrix = new Float32Array(paths * steps);
    const isZeroVol = (sigma <= 1e-8);
    const chunkSize = Math.max(1, Math.floor(paths / PROGRESS_TICKS));
    const sigSqrtDt = sigma * Math.sqrt(dt);

    if (antithetic && !isZeroVol) {
        // Pair every two output paths: shared Brownian sequence, sign-flipped
        // on the twin. Halves the underlying RNG work and ~halves variance.
        const pairs = paths >> 1; // floor(paths/2)
        for (let pp = 0; pp < pairs; pp++) {
            const idx1 = (pp * 2) * steps;
            const idx2 = (pp * 2 + 1) * steps;
            let S1 = initialPrice, S2 = initialPrice;
            pathsMatrix[idx1] = S1;
            pathsMatrix[idx2] = S2;
            for (let i = 1; i < steps; i++) {
                const z = randomNormal();
                const shock = sigSqrtDt * z;
                S1 += theta * (reversionTarget - S1) * dt + shock;
                S2 += theta * (reversionTarget - S2) * dt - shock;
                pathsMatrix[idx1 + i] = Math.max(0, S1);
                pathsMatrix[idx2 + i] = Math.max(0, S2);
            }
            postProgress(pp * 2, paths, chunkSize);
        }
        // Odd leftover when paths is odd — one un-paired path.
        if (paths & 1) {
            const lastIdx = (paths - 1) * steps;
            let S = initialPrice;
            pathsMatrix[lastIdx] = S;
            for (let i = 1; i < steps; i++) {
                const shock = sigSqrtDt * randomNormal();
                S += theta * (reversionTarget - S) * dt + shock;
                pathsMatrix[lastIdx + i] = Math.max(0, S);
            }
        }
    } else {
        for (let p = 0; p < paths; p++) {
            let S = initialPrice;
            pathsMatrix[p * steps] = S; // t=0
            for (let i = 1; i < steps; i++) {
                const shock = isZeroVol ? 0 : (sigSqrtDt * randomNormal());
                const dS = theta * (reversionTarget - S) * dt + shock;
                S += dS;
                pathsMatrix[p * steps + i] = Math.max(0, S); // Price cannot be negative
            }
            postProgress(p, paths, chunkSize);
        }
    }
    return extractPercentilePaths(pathsMatrix, steps, paths, initialPrice);
}

// Engine B: Geometric Brownian Motion + Jump Diffusion (Merton)
// jumpMu is the log-jump mean (Phase 4): a positive value introduces upward
// skew representing contract-driven flow asymmetry. Defaults to 0 (symmetric)
// when not supplied for backward compatibility with non-industrial callers.
function simulateGBMJump(initialPrice, mu, sigma, steps, paths, lambda, jumpMu, antithetic, intradaySteps) {
    const dt = 1 / (252 * (intradaySteps || 1)); // sub-daily when intradaySteps > 1
    const pathsMatrix = new Float32Array(paths * steps);
    const isZeroVol = (sigma <= 1e-8);
    const chunkSize = Math.max(1, Math.floor(paths / PROGRESS_TICKS));

    // Jump size distribution: log-jump ~ N(jumpMean, jumpStd^2)
    const jumpMean = (typeof jumpMu === 'number') ? jumpMu : 0;
    const jumpStd = isZeroVol ? 0 : sigma * 1.5;

    // Merton compensator: subtracts λ·E[J - 1] from the drift so the expected
    // log-price growth rate is unchanged by the jump process. Re-derived with
    // the (now-asymmetric) jumpMean: E[J] = exp(μ_J + ½σ_J²).
    const compensator = isZeroVol
        ? 0
        : lambda * (Math.exp(jumpMean + 0.5 * jumpStd * jumpStd) - 1);
    const sigSqrtDt = sigma * Math.sqrt(dt);
    const driftPerStep = (mu - compensator - 0.5 * sigma * sigma) * dt;

    if (antithetic && !isZeroVol) {
        // Only the Gaussian diffusion shock is paired (sign-flipped on twin).
        // Jumps stay independent — pairing them would collapse the Poisson
        // distribution and break the Merton compensator.
        const pairs = paths >> 1;
        for (let pp = 0; pp < pairs; pp++) {
            const idx1 = (pp * 2) * steps;
            const idx2 = (pp * 2 + 1) * steps;
            let S1 = initialPrice, S2 = initialPrice;
            pathsMatrix[idx1] = S1;
            pathsMatrix[idx2] = S2;
            for (let i = 1; i < steps; i++) {
                let jumpFactor1 = 1, jumpFactor2 = 1;
                if (Math.random() < lambda * dt) jumpFactor1 = Math.exp(randomNormal() * jumpStd + jumpMean);
                if (Math.random() < lambda * dt) jumpFactor2 = Math.exp(randomNormal() * jumpStd + jumpMean);
                const z = randomNormal();
                const shock = sigSqrtDt * z;
                S1 = S1 * Math.exp(driftPerStep + shock) * jumpFactor1;
                S2 = S2 * Math.exp(driftPerStep - shock) * jumpFactor2;
                pathsMatrix[idx1 + i] = Math.max(0, S1);
                pathsMatrix[idx2 + i] = Math.max(0, S2);
            }
            postProgress(pp * 2, paths, chunkSize);
        }
        if (paths & 1) {
            const lastIdx = (paths - 1) * steps;
            let S = initialPrice;
            pathsMatrix[lastIdx] = S;
            for (let i = 1; i < steps; i++) {
                let jumpFactor = 1;
                if (Math.random() < lambda * dt) jumpFactor = Math.exp(randomNormal() * jumpStd + jumpMean);
                const shock = sigSqrtDt * randomNormal();
                S = S * Math.exp(driftPerStep + shock) * jumpFactor;
                pathsMatrix[lastIdx + i] = Math.max(0, S);
            }
        }
    } else {
        for (let p = 0; p < paths; p++) {
            let S = initialPrice;
            pathsMatrix[p * steps] = S; // t=0
            for (let i = 1; i < steps; i++) {
                let jumpFactor = 1;
                if (Math.random() < lambda * dt) {
                    jumpFactor = isZeroVol ? 1 : Math.exp(randomNormal() * jumpStd + jumpMean);
                }

                const shock = isZeroVol ? 0 : (sigSqrtDt * randomNormal());
                S = S * Math.exp(driftPerStep + shock) * jumpFactor;
                pathsMatrix[p * steps + i] = Math.max(0, S);
            }
            postProgress(p, paths, chunkSize);
        }
    }
    return extractPercentilePaths(pathsMatrix, steps, paths, initialPrice);
}

self.onmessage = function(e) {
    const { initialPrice, drift, volatility, steps, paths, physicsType, physicsParams, antithetic, intradaySteps } = e.data;

    let result;
    const intradayStepsResolved = Math.max(1, intradaySteps || 1);

    try {
        if (physicsType === 'Ornstein-Uhlenbeck') {
            const theta = physicsParams?.reversionSpeedTheta || 0.15;
            const longTermMean = (typeof physicsParams?.longTermMean === 'number')
                ? physicsParams.longTermMean
                : null;
            result = simulateOU(initialPrice, drift, volatility, steps, paths, theta, longTermMean, !!antithetic, intradayStepsResolved);
        } else if (physicsType === 'Geometric Brownian Motion + Jump Diffusion') {
            const lambda = physicsParams?.jumpFrequencyLambda || 4;
            const jumpMu = (typeof physicsParams?.jumpMu === 'number') ? physicsParams.jumpMu : 0;
            result = simulateGBMJump(initialPrice, drift, volatility, steps, paths, lambda, jumpMu, !!antithetic, intradayStepsResolved);
        } else {
            self.postMessage({ error: 'Unknown physicsType: ' + physicsType });
            return;
        }

        self.postMessage({
            percentiles: result.percentiles,
            pAboveSpot: result.pAboveSpot
        });
    } catch (err) {
        self.postMessage({ error: err.message });
    }
};
