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

        sliderVol.addEventListener('input', (e) => valVol.innerText = e.target.value);
        sliderPhysics.addEventListener('input', (e) => valPhysics.innerText = e.target.value);
        sliderHorizon.addEventListener('input', (e) => valHorizon.innerText = e.target.value);

        let debounceTimer = null;
        tickerSelect.addEventListener('change', (e) => {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                this.syncUIState(e.target.value);
            }, 150);
        });

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

        if (physicsType === 'Ornstein-Uhlenbeck') {
            sliderPhysics.min = 0.01;
            sliderPhysics.max = 1.00;
            sliderPhysics.step = 0.01;
            sliderPhysics.value = physicsParams.reversionSpeedTheta;
            labelPhysics.innerText = 'REVERSION SPEED (θ)';
            metadataReadout.innerText = 'TETHERED HUB: BRENT CRUDE BASIS';
        } else {
            sliderPhysics.min = 1;
            sliderPhysics.max = 20;
            sliderPhysics.step = 1;
            sliderPhysics.value = physicsParams.jumpFrequencyLambda;
            labelPhysics.innerText = 'JUMP FREQUENCY (λ)';
            metadataReadout.innerText = 'TETHERED HUB: US10Y TREASURY BASIS';
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

        const sliderVol = parseFloat(document.getElementById('slider-volatility').value);
        const sliderPhysics = parseFloat(document.getElementById('slider-physics-param').value);
        const sliderHorizon = parseInt(document.getElementById('slider-horizon').value, 10);

        let physicsParams = {};
        if (physicsType === 'Ornstein-Uhlenbeck') {
            physicsParams = { reversionSpeedTheta: sliderPhysics };
        } else {
            physicsParams = { jumpFrequencyLambda: sliderPhysics };
        }

        // Fetch Data
        this.oracle._clearContainer();
        this.oracle.container.innerHTML = `> ACQUIRING HISTORICAL DATA FOR ${tickerSymbol}... <span class="blinking-cursor">_</span>`;
        
        try {
            const history = await osirisIngestion.getHistoricalData(tickerSymbol);
            const macros = await osirisIngestion.getMacroHubs();

            const initialPrice = history.length > 0 ? history[history.length - 1].adjClose : 100.0;
            
            // Simplified derived drift/volatility
            const drift = macros.US10Y || 0.045;
            const volatility = sliderVol;

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
                    physicsType: physicsType
                });

                // Cleanup worker after successful completion
                this.activeWorker.terminate();
                this.activeWorker = null;
            };

            this.activeWorker.postMessage({
                initialPrice: initialPrice,
                drift: drift,
                volatility: volatility,
                steps: sliderHorizon,
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
