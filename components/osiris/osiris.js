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
        } catch (e) {
            console.error('[OSIRIS] Failed to load physics-config.json', e);
        }

        // Cache Macro Hubs on Initialization
        await osirisIngestion.getMacroHubs();

        // Bind UI Controls (assuming there's a button to trigger simulation)
        const triggerBtn = document.getElementById('osiris-trigger-btn');
        if (triggerBtn) {
            triggerBtn.addEventListener('click', () => {
                const tickerInput = document.getElementById('osiris-ticker-input').value.toUpperCase() || 'XOM';
                this.runSimulation(tickerInput);
            });
        }
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
        let physicsParams = null;
        let isFound = false;

        for (const cohortName in this.physicsConfig.cohorts) {
            const cohort = this.physicsConfig.cohorts[cohortName];
            const tickerData = cohort.tickers.find(t => t.symbol === tickerSymbol);
            if (tickerData) {
                physicsType = cohort.physics;
                physicsParams = tickerData;
                isFound = true;
                break;
            }
        }

        if (!isFound) {
            console.warn(`[OSIRIS] Ticker ${tickerSymbol} not found in config. Using defaults.`);
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
            const volatility = macros.XLE_VOL || 0.22;

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
                this.canvas.renderCloud(percentiles);

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
                steps: this.physicsConfig.timeHorizonDays,
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
