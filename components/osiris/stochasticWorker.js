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

// Engine A: Ornstein-Uhlenbeck + GARCH(1,1) volatility
//
// dS = θ(μ − S)dt + σ_t·S·dW  where σ²_t evolves via GARCH(1,1).
// GARCH(1,1): varT_{t+1} = ω + α·z²_t·varT_t + β·varT_t
//   ω = varT0·(1 − α − β), anchoring the long-run variance to the input sigma.
//   Default parameters α=0.10, β=0.85 are typical for equity daily returns.
//   For steps=2 (1-day backtest) GARCH has no effect since only the initial
//   variance is consumed. The benefit appears for multi-day UI simulations.
function simulateOU(initialPrice, drift, sigma, steps, paths, theta, longTermMean, antithetic, intradaySteps, garchAlpha, garchBeta) {
    const dt = 1 / (252 * (intradaySteps || 1));
    const reversionTarget = (typeof longTermMean === 'number' && longTermMean > 0)
        ? longTermMean
        : initialPrice * Math.exp(drift);
    const pathsMatrix = new Float32Array(paths * steps);
    const isZeroVol = (sigma <= 1e-8);
    const chunkSize = Math.max(1, Math.floor(paths / PROGRESS_TICKS));

    const ga = garchAlpha ?? 0.10;
    const gb = garchBeta  ?? 0.85;
    const varT0 = sigma * sigma * dt;
    const omega  = varT0 * (1.0 - ga - gb);

    if (antithetic && !isZeroVol) {
        const pairs = paths >> 1;
        for (let pp = 0; pp < pairs; pp++) {
            const idx1 = (pp * 2) * steps;
            const idx2 = (pp * 2 + 1) * steps;
            let S1 = initialPrice, S2 = initialPrice;
            let varT = varT0;
            pathsMatrix[idx1] = S1;
            pathsMatrix[idx2] = S2;
            for (let i = 1; i < steps; i++) {
                const z = randomNormal();
                const sqrtVar = Math.sqrt(varT);
                // Twins share varT because z² is sign-symmetric.
                S1 += theta * (reversionTarget - S1) * dt + sqrtVar * S1 *  z;
                S2 += theta * (reversionTarget - S2) * dt + sqrtVar * S2 * -z;
                pathsMatrix[idx1 + i] = Math.max(0, S1);
                pathsMatrix[idx2 + i] = Math.max(0, S2);
                varT = Math.max(omega + (ga * z * z + gb) * varT, 1e-10);
            }
            postProgress(pp * 2, paths, chunkSize);
        }
        if (paths & 1) {
            const lastIdx = (paths - 1) * steps;
            let S = initialPrice, varT = varT0;
            pathsMatrix[lastIdx] = S;
            for (let i = 1; i < steps; i++) {
                const z = randomNormal();
                S += theta * (reversionTarget - S) * dt + Math.sqrt(varT) * S * z;
                pathsMatrix[lastIdx + i] = Math.max(0, S);
                varT = Math.max(omega + (ga * z * z + gb) * varT, 1e-10);
            }
        }
    } else {
        for (let p = 0; p < paths; p++) {
            let S = initialPrice, varT = varT0;
            pathsMatrix[p * steps] = S;
            for (let i = 1; i < steps; i++) {
                if (isZeroVol) {
                    S += theta * (reversionTarget - S) * dt;
                } else {
                    const z = randomNormal();
                    S += theta * (reversionTarget - S) * dt + Math.sqrt(varT) * S * z;
                    varT = Math.max(omega + (ga * z * z + gb) * varT, 1e-10);
                }
                pathsMatrix[p * steps + i] = Math.max(0, S);
            }
            postProgress(p, paths, chunkSize);
        }
    }
    return extractPercentilePaths(pathsMatrix, steps, paths, initialPrice);
}

// Engine B: GBM + Merton Jump Diffusion + GARCH(1,1) volatility
//
// Log-return per step: Δlog(S) = (μ−compensator)·dt − ½·varT + √varT·z + jump
// GARCH(1,1): varT_{t+1} = ω + α·z²_t·varT_t + β·varT_t
//   Ito correction is time-varying (−½·varT) so expected price path is unchanged.
//   With antithetic paths, both twins share varT because z² is sign-symmetric.
function simulateGBMJump(initialPrice, mu, sigma, steps, paths, lambda, jumpMu, antithetic, intradaySteps, garchAlpha, garchBeta) {
    const dt = 1 / (252 * (intradaySteps || 1));
    const pathsMatrix = new Float32Array(paths * steps);
    const isZeroVol = (sigma <= 1e-8);
    const chunkSize = Math.max(1, Math.floor(paths / PROGRESS_TICKS));

    // Jump size: fixed at 0.07 (7% std) — see simulate.mjs for calibration note.
    const jumpMean = (typeof jumpMu === 'number') ? jumpMu : 0;
    const jumpStd  = isZeroVol ? 0 : 0.07;
    const compensator = isZeroVol
        ? 0
        : lambda * (Math.exp(jumpMean + 0.5 * jumpStd * jumpStd) - 1);
    // Constant drift component; Ito correction is now time-varying via varT.
    const driftDt = (mu - compensator) * dt;

    const ga = garchAlpha ?? 0.10;
    const gb = garchBeta  ?? 0.85;
    const varT0 = sigma * sigma * dt;
    const omega  = varT0 * (1.0 - ga - gb);

    if (antithetic && !isZeroVol) {
        // Gaussian shocks paired; jumps independent (preserves Poisson structure).
        const pairs = paths >> 1;
        for (let pp = 0; pp < pairs; pp++) {
            const idx1 = (pp * 2) * steps;
            const idx2 = (pp * 2 + 1) * steps;
            let S1 = initialPrice, S2 = initialPrice;
            let varT = varT0;
            pathsMatrix[idx1] = S1;
            pathsMatrix[idx2] = S2;
            for (let i = 1; i < steps; i++) {
                let jf1 = 1, jf2 = 1;
                if (Math.random() < lambda * dt) jf1 = Math.exp(randomNormal() * jumpStd + jumpMean);
                if (Math.random() < lambda * dt) jf2 = Math.exp(randomNormal() * jumpStd + jumpMean);
                const z = randomNormal();
                const halfVar = 0.5 * varT;
                const sqrtVar = Math.sqrt(varT);
                S1 = S1 * Math.exp(driftDt - halfVar + sqrtVar *  z) * jf1;
                S2 = S2 * Math.exp(driftDt - halfVar + sqrtVar * -z) * jf2;
                pathsMatrix[idx1 + i] = Math.max(0, S1);
                pathsMatrix[idx2 + i] = Math.max(0, S2);
                varT = Math.max(omega + (ga * z * z + gb) * varT, 1e-10);
            }
            postProgress(pp * 2, paths, chunkSize);
        }
        if (paths & 1) {
            const lastIdx = (paths - 1) * steps;
            let S = initialPrice, varT = varT0;
            pathsMatrix[lastIdx] = S;
            for (let i = 1; i < steps; i++) {
                let jf = 1;
                if (Math.random() < lambda * dt) jf = Math.exp(randomNormal() * jumpStd + jumpMean);
                const z = randomNormal();
                S = S * Math.exp(driftDt - 0.5 * varT + Math.sqrt(varT) * z) * jf;
                pathsMatrix[lastIdx + i] = Math.max(0, S);
                varT = Math.max(omega + (ga * z * z + gb) * varT, 1e-10);
            }
        }
    } else {
        for (let p = 0; p < paths; p++) {
            let S = initialPrice, varT = varT0;
            pathsMatrix[p * steps] = S;
            for (let i = 1; i < steps; i++) {
                if (isZeroVol) {
                    S = S * Math.exp(driftDt);
                } else {
                    let jf = 1;
                    if (Math.random() < lambda * dt) jf = Math.exp(randomNormal() * jumpStd + jumpMean);
                    const z = randomNormal();
                    S = S * Math.exp(driftDt - 0.5 * varT + Math.sqrt(varT) * z) * jf;
                    varT = Math.max(omega + (ga * z * z + gb) * varT, 1e-10);
                }
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

    // GARCH(1,1) parameters — configurable per cohort via physicsParams,
    // defaulting to empirically typical equity values (α=0.10, β=0.85).
    const garchAlpha = physicsParams?.garchAlpha ?? 0.10;
    const garchBeta  = physicsParams?.garchBeta  ?? 0.85;

    try {
        if (physicsType === 'Ornstein-Uhlenbeck') {
            const theta = physicsParams?.reversionSpeedTheta || 0.15;
            const longTermMean = (typeof physicsParams?.longTermMean === 'number')
                ? physicsParams.longTermMean
                : null;
            result = simulateOU(initialPrice, drift, volatility, steps, paths, theta, longTermMean, !!antithetic, intradayStepsResolved, garchAlpha, garchBeta);
        } else if (physicsType === 'Geometric Brownian Motion + Jump Diffusion') {
            const lambda = physicsParams?.jumpFrequencyLambda || 4;
            const jumpMu = (typeof physicsParams?.jumpMu === 'number') ? physicsParams.jumpMu : 0;
            result = simulateGBMJump(initialPrice, drift, volatility, steps, paths, lambda, jumpMu, !!antithetic, intradayStepsResolved, garchAlpha, garchBeta);
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
