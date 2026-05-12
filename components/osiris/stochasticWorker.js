/**
 * Project Osiris - Stochastic Worker
 * Handles Monte Carlo simulations off the main thread.
 * Zero external dependencies.
 */

// Optimized Box-Muller Transform for Random Normal generation
function randomNormal() {
    let u = 0, v = 0;
    while (u === 0) u = Math.random(); // Converting [0,1) to (0,1)
    while (v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function extractPercentilePaths(pathsMatrix, steps, paths) {
    const terminalValues = new Array(paths);
    for (let p = 0; p < paths; p++) {
        terminalValues[p] = {
            index: p,
            value: pathsMatrix[p * steps + (steps - 1)]
        };
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
        p05: getPath(0.05),
        p10: getPath(0.10),
        p25: getPath(0.25),
        p45: getPath(0.45),
        p50: getPath(0.50),
        p55: getPath(0.55),
        p75: getPath(0.75),
        p90: getPath(0.90),
        p95: getPath(0.95)
    };
}

// Engine A: Ornstein-Uhlenbeck
function simulateOU(initialPrice, drift, sigma, steps, paths, theta) {
    const dt = 1 / steps;
    const longTermMean = initialPrice * Math.exp(drift); // Simplified long-term mean based on drift assumption
    const pathsMatrix = new Float32Array(paths * steps);
    const isZeroVol = (sigma <= 1e-8);

    for (let p = 0; p < paths; p++) {
        let S = initialPrice;
        pathsMatrix[p * steps] = S; // t=0
        for (let i = 1; i < steps; i++) {
            const shock = isZeroVol ? 0 : (sigma * Math.sqrt(dt) * randomNormal());
            const dS = theta * (longTermMean - S) * dt + shock;
            S += dS;
            pathsMatrix[p * steps + i] = Math.max(0, S); // Price cannot be negative
        }
    }
    return extractPercentilePaths(pathsMatrix, steps, paths);
}

// Engine B: Geometric Brownian Motion + Jump Diffusion
function simulateGBMJump(initialPrice, mu, sigma, steps, paths, lambda) {
    const dt = 1 / steps;
    const pathsMatrix = new Float32Array(paths * steps);
    const isZeroVol = (sigma <= 1e-8);

    // Jump parameters (mean and std of the jump size)
    const jumpMean = 0; // Jumps can be up or down
    const jumpStd = isZeroVol ? 0 : sigma * 1.5; // Jump severity relative to volatility

    for (let p = 0; p < paths; p++) {
        let S = initialPrice;
        pathsMatrix[p * steps] = S; // t=0
        for (let i = 1; i < steps; i++) {
            let jumpFactor = 1;
            // Poisson process for jumps: check if jump occurs in dt
            if (Math.random() < lambda * dt) {
                // Apply a localized Gaussian shock
                jumpFactor = isZeroVol ? 1 : Math.exp(randomNormal() * jumpStd + jumpMean);
            }
            
            const shock = isZeroVol ? 0 : (sigma * Math.sqrt(dt) * randomNormal());
            S = S * Math.exp((mu - 0.5 * sigma * sigma) * dt + shock) * jumpFactor;
            pathsMatrix[p * steps + i] = Math.max(0, S);
        }
    }
    return extractPercentilePaths(pathsMatrix, steps, paths);
}

self.onmessage = function(e) {
    const { initialPrice, drift, volatility, steps, paths, physicsType, physicsParams } = e.data;
    
    let resultPercentiles;

    try {
        if (physicsType === 'Ornstein-Uhlenbeck') {
            const theta = physicsParams?.reversionSpeedTheta || 0.15;
            resultPercentiles = simulateOU(initialPrice, drift, volatility, steps, paths, theta);
        } else if (physicsType === 'Geometric Brownian Motion + Jump Diffusion') {
            const lambda = physicsParams?.jumpFrequencyLambda || 4;
            resultPercentiles = simulateGBMJump(initialPrice, drift, volatility, steps, paths, lambda);
        } else {
            self.postMessage({ error: 'Unknown physicsType: ' + physicsType });
            return;
        }

        // Send only the condensed percentiles back to the main thread
        self.postMessage({
            percentiles: resultPercentiles
        });
    } catch (err) {
        self.postMessage({ error: err.message });
    }
};
