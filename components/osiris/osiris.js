import { osirisIngestion } from './osirisIngestion.js';
import { OsirisCloudCanvas } from './osirisCloudCanvas.js';
import { OsirisOracle } from './osirisOracle.js';

class OsirisOrchestrator {
    constructor() {
        this.activeWorker = null;
        this.physicsConfig = null;
        this.canvas = null;
        this.oracle = null;

        this.init();
    }

    async init() {
        // Initialize DOM Elements
        const canvasEl = document.getElementById('osiris-canvas');
        const oracleEl = document.getElementById('oracle-readout');

        if (!canvasEl || !oracleEl) {
            console.error('[OSIRIS] Required DOM elements missing.');
            return;
        }

        this.canvas = new OsirisCloudCanvas(canvasEl);
        this.oracle = new OsirisOracle(oracleEl);

        // Directive 1: ResizeObserver
        const resizeObserver = new ResizeObserver(() => {
            if (this.canvas) {
                this.canvas.resize(); // This will also redraw the cached percentiles automatically
            }
        });
        resizeObserver.observe(canvasEl);

        // Load configuration
        try {
            const configRes = await fetch('/physics-config.json');
            this.physicsConfig = await configRes.json();
            console.log('[OSIRIS] Physics configuration loaded', this.physicsConfig.version);
            
            const tickerSelect = document.getElementById('osiris-ticker-select');
            if (tickerSelect) {
                this.syncUIState(tickerSelect.value);
            }
        } catch (e) {
            console.error('[OSIRIS] Failed to load physics-config.json', e);
        }

        // Cache Macro Hubs on Initialization
        await osirisIngestion.getMacroHubs();

        // Bind UI Controls
        const triggerBtn = document.getElementById('osiris-trigger-btn');
        const tickerSelect = document.getElementById('osiris-ticker-select');
        const sliderVol = document.getElementById('slider-volatility');
        const valVol = document.getElementById('val-volatility');
        const sliderPhysics = document.getElementById('slider-physics-param');
        const valPhysics = document.getElementById('val-physics-param');
        const sliderHorizon = document.getElementById('slider-horizon');
        const valHorizon = document.getElementById('val-horizon');

        const timePills = document.querySelectorAll('.time-pill');
        const customDaysInput = document.getElementById('osiris-custom-days');
        const volatilityRegime = document.getElementById('osiris-volatility-regime');
        const operationalShock = document.getElementById('osiris-operational-shock');

        sliderVol.addEventListener('input', (e) => valVol.innerText = e.target.value);
        sliderPhysics.addEventListener('input', (e) => valPhysics.innerText = e.target.value);
        sliderHorizon.addEventListener('input', (e) => valHorizon.innerText = e.target.value);

        let debounceTimer = null;
        const triggerSimulationDebounced = () => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.runSimulation(tickerSelect.value);
            }, 150);
        };

        tickerSelect.addEventListener('change', (e) => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.syncUIState(e.target.value);
            }, 150);
        });

        // Phase 1 Events
        timePills.forEach(pill => {
            pill.addEventListener('click', (e) => {
                timePills.forEach(p => p.classList.remove('active'));
                e.target.classList.add('active');
                const days = e.target.getAttribute('data-value');
                customDaysInput.value = days;
                sliderHorizon.value = days;
                valHorizon.innerText = days;
                triggerSimulationDebounced();
            });
        });

        customDaysInput.addEventListener('input', (e) => {
            timePills.forEach(p => p.classList.remove('active'));
            let val = parseInt(e.target.value, 10);
            if (!isNaN(val)) {
                sliderHorizon.value = val;
                valHorizon.innerText = val;
                triggerSimulationDebounced();
            }
        });

        // Phase 2 Events
        volatilityRegime.addEventListener('change', triggerSimulationDebounced);
        operationalShock.addEventListener('change', triggerSimulationDebounced);

        // Raw slider overrides
        sliderVol.addEventListener('change', triggerSimulationDebounced);
        sliderPhysics.addEventListener('change', triggerSimulationDebounced);

        if (triggerBtn) {
            triggerBtn.addEventListener('click', () => {
                this.runSimulation(tickerSelect.value);
            });
        }
    }

    syncUIState(tickerSymbol) {
        if (!this.physicsConfig) return;

        let physicsType = 'Ornstein-Uhlenbeck';
        let physicsParams = null;

        for (const cohortName in this.physicsConfig.cohorts) {
            const cohort = this.physicsConfig.cohorts[cohortName];
            const tickerData = cohort.tickers.find(t => t.symbol === tickerSymbol);
            if (tickerData) {
                physicsType = cohort.physics;
                physicsParams = tickerData;
                break;
            }
        }

        if (!physicsParams) return;

        const sliderPhysics = document.getElementById('slider-physics-param');
        const valPhysics = document.getElementById('val-physics-param');
        const labelPhysics = document.getElementById('label-physics-param');
        const metadataReadout = document.getElementById('osiris-metadata-readout');
        const operationalShock = document.getElementById('osiris-operational-shock');

        if (physicsType === 'Ornstein-Uhlenbeck') {
            sliderPhysics.min = 0.01;
            sliderPhysics.max = 1.00;
            sliderPhysics.step = 0.01;
            sliderPhysics.value = physicsParams.reversionSpeedTheta;
            labelPhysics.innerText = 'REVERSION SPEED (θ)';
            metadataReadout.dataset.baseText = 'TETHERED HUB: BRENT CRUDE BASIS';
            metadataReadout.innerText = metadataReadout.dataset.baseText;
            
            if (operationalShock) {
                operationalShock.innerHTML = `
                    <option value="1.0">Standard Regulatory Gravity</option>
                    <option value="1.5">Tight Commodity Bounds</option>
                    <option value="0.5">Structural Decoupling</option>
                `;
            }
        } else {
            sliderPhysics.min = 1;
            sliderPhysics.max = 20;
            sliderPhysics.step = 1;
            sliderPhysics.value = physicsParams.jumpFrequencyLambda;
            labelPhysics.innerText = 'JUMP FREQUENCY (λ)';
            metadataReadout.dataset.baseText = 'TETHERED HUB: US10Y TREASURY BASIS';
            metadataReadout.innerText = metadataReadout.dataset.baseText;
            
            if (operationalShock) {
                operationalShock.innerHTML = `
                    <option value="1.0">Standard Procurement Cycle</option>
                    <option value="2.0">Aggressive Contract Wins</option>
                    <option value="0.0">Stagnant Backlog</option>
                `;
            }
        }
        valPhysics.innerText = sliderPhysics.value;
    }

    async runSimulation(tickerSymbol) {
        if (!this.physicsConfig) return;

        // Directive 2: Singleton Worker Termination
        if (this.activeWorker) {
            console.log('[OSIRIS] Terminating stale background worker.');
            this.activeWorker.terminate();
            this.activeWorker = null;
        }

        // Determine Cohort & Physics
        let physicsType = 'Ornstein-Uhlenbeck';
        for (const cohortName in this.physicsConfig.cohorts) {
            const cohort = this.physicsConfig.cohorts[cohortName];
            if (cohort.tickers.find(t => t.symbol === tickerSymbol)) {
                physicsType = cohort.physics;
                break;
            }
        }

        // Baseline parameters — now ticker-specific
        let baseline_sigma = 0.22; // Fallback default
        let baseline_physics_param = 0.15;

        // Extract base from JSON if available (to allow slider to be independent base)
        const cohort = this.physicsConfig.cohorts[Object.keys(this.physicsConfig.cohorts).find(c => this.physicsConfig.cohorts[c].tickers.some(t => t.symbol === tickerSymbol))];
        if (cohort) {
            const tData = cohort.tickers.find(t => t.symbol === tickerSymbol);
            if (tData) {
                baseline_physics_param = physicsType === 'Ornstein-Uhlenbeck' ? tData.reversionSpeedTheta : tData.jumpFrequencyLambda;
                if (tData.baselineVolatility) {
                    baseline_sigma = tData.baselineVolatility;
                }
            }
        }

        const advancedDetails = document.querySelector('.advanced-greeks');
        const isAdvancedOpen = advancedDetails && advancedDetails.open;

        let final_sigma, final_physics_param, final_steps;

        if (isAdvancedOpen) {
            // Use raw slider values directly if advanced section is open
            final_sigma = parseFloat(document.getElementById('slider-volatility').value);
            final_physics_param = parseFloat(document.getElementById('slider-physics-param').value);
            final_steps = parseInt(document.getElementById('slider-horizon').value, 10);
        } else {
            // Phase 3: Mathematical Multiplier Reconciliation
            const volRegRegime = document.getElementById('osiris-volatility-regime');
            const opShock = document.getElementById('osiris-operational-shock');
            const customDays = document.getElementById('osiris-custom-days');

            const volRegimeMult = volRegRegime ? parseFloat(volRegRegime.value) : 1.0;
            const opShockMult = opShock ? parseFloat(opShock.value) : 1.0;
            
            final_sigma = baseline_sigma * volRegimeMult;
            final_physics_param = baseline_physics_param * opShockMult;
            final_steps = customDays ? parseInt(customDays.value, 10) : 252;
            
            // Sync sliders visually
            document.getElementById('slider-volatility').value = final_sigma;
            document.getElementById('val-volatility').innerText = final_sigma.toFixed(2);
            document.getElementById('slider-physics-param').value = final_physics_param;
            document.getElementById('val-physics-param').innerText = final_physics_param.toFixed(2);
            document.getElementById('slider-horizon').value = final_steps;
            document.getElementById('val-horizon').innerText = final_steps;
        }

        let physicsParams = {};
        if (physicsType === 'Ornstein-Uhlenbeck') {
            physicsParams = { reversionSpeedTheta: final_physics_param };
        } else {
            physicsParams = { jumpFrequencyLambda: final_physics_param };
        }

        // Fetch Data
        this.oracle._clearContainer();
        this.oracle.container.innerHTML = `> ACQUIRING HISTORICAL DATA FOR ${tickerSymbol}... <span class="blinking-cursor">_</span>`;
        
        try {
            const history = await osirisIngestion.getHistoricalData(tickerSymbol);
            const macros = await osirisIngestion.getMacroHubs();

            // Surface data-source status (LIVE / CACHED / FALLBACK) next to the basis label
            const metadataReadout = document.getElementById('osiris-metadata-readout');
            if (metadataReadout) {
                const baseText = metadataReadout.dataset.baseText || metadataReadout.innerText;
                const info = osirisIngestion.getLastFetchInfo();
                const histTag = (info.history.source || 'unknown').toUpperCase();
                const macroTag = (info.macro.source || 'unknown').toUpperCase();
                metadataReadout.innerText = `${baseText}  ·  DATA[HIST: ${histTag} ${info.history.date || '—'} · MACRO: ${macroTag} ${info.macro.date || '—'}]`;
            }

            const initialPrice = history.length > 0 ? history[history.length - 1].adjClose : 100.0;

            // Simplified derived drift/volatility
            const drift = macros.US10Y || 0.045;
            const volatility = final_sigma;

            // Instantiate New Worker
            this.activeWorker = new Worker('/components/osiris/stochasticWorker.js');

            this.oracle.container.innerHTML = `> ALLOCATING ${this.physicsConfig.defaultPaths} PATHS TO COMPUTE SANDBOX... <span class="blinking-cursor">_</span>`;

            this.activeWorker.onmessage = (e) => {
                if (e.data.error) {
                    console.error('[OSIRIS] Worker Error:', e.data.error);
                    this.oracle.container.innerHTML = `<span style="color: red;">> SYSTEM FAULT: WORKER EXCEPTION.</span>`;
                    return;
                }

                const percentiles = e.data.percentiles;

                // Render Cloud
                this.canvas.renderCloud({
                    percentiles: percentiles,
                    initialPrice: initialPrice,
                    physicsType: physicsType,
                    physicsParams: physicsParams,
                    drift: drift
                });

                // Run Oracle Synthesis
                const lastIdx = percentiles.p50.length - 1;
                this.oracle.requestSynthesis({
                    ticker: tickerSymbol,
                    currentPrice: initialPrice,
                    p50: percentiles.p50[lastIdx],
                    p05: percentiles.p05[lastIdx],
                    p95: percentiles.p95[lastIdx],
                    pAboveSpot: e.data.pAboveSpot,
                    physicsType: physicsType,
                    volatility: volatility,
                    physicsParams: physicsParams,
                    horizonDays: final_steps
                });

                // Cleanup worker after successful completion
                this.activeWorker.terminate();
                this.activeWorker = null;
            };

            this.activeWorker.postMessage({
                initialPrice: initialPrice,
                drift: drift,
                volatility: volatility,
                steps: final_steps,
                paths: this.physicsConfig.defaultPaths,
                physicsType: physicsType,
                physicsParams: physicsParams
            });

        } catch (error) {
            console.error('[OSIRIS] Simulation Initialization Error:', error);
            this.oracle.container.innerHTML = `<span style="color: red;">> SYSTEM FAULT: DATA ACQUISITION FAILED.</span>`;
        }
    }
}

// Boot
window.addEventListener('DOMContentLoaded', () => {
    new OsirisOrchestrator();
});
