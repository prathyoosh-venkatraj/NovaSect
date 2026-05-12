/**
 * Project Osiris - Data Pipeline
 *
 * Live wiring (Phase 0):
 *   - Historical price series: GET /api/yahoo-proxy?symbol=X&mode=history&range=1y
 *   - Macro hubs (US10Y, VIX):  GET /api/fred-proxy?series_id=DGS10|VIXCLS
 *
 * Caching layers:
 *   1. IndexedDB (OsirisTickerCache, store: historical_data) — 24h TTL per ticker
 *   2. localStorage (osiris_macro_hubs) — 24h TTL
 *   3. Vercel edge cache on proxies (24h on history mode, 1h on FRED — shared with Sentinel)
 *
 * `_lastFetchInfo` exposes the freshness/source of the most recent reads so the
 * orchestrator can surface "DATA: LIVE / CACHED / FALLBACK" status in the UI.
 */

const MACRO_CACHE_KEY = 'osiris_macro_hubs';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const osirisIngestion = {
    _lastFetchInfo: {
        history: { source: null, date: null, ticker: null },
        macro:   { source: null, date: null }
    },

    getLastFetchInfo() {
        return this._lastFetchInfo;
    },

    // ── Macro hubs: live US10Y + VIX from FRED ─────────────────────────────
    async getMacroHubs() {
        const cached = localStorage.getItem(MACRO_CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp < CACHE_EXPIRY_MS) {
                    console.log('[OSIRIS] Loaded macro hubs from local cache');
                    this._lastFetchInfo.macro = {
                        source: parsed.data._fallback ? 'fallback' : 'cached',
                        date: parsed.data._latestDate || new Date(parsed.timestamp).toISOString().split('T')[0]
                    };
                    return parsed.data;
                }
            } catch (e) {
                console.error('[OSIRIS] Error parsing macro cache:', e);
            }
        }

        console.log('[OSIRIS] Fetching fresh macro hubs from FRED');
        const data = await this._fetchMacroHubsFromAPI();

        localStorage.setItem(MACRO_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));

        this._lastFetchInfo.macro = {
            source: data._fallback ? 'fallback' : 'live',
            date: data._latestDate || new Date().toISOString().split('T')[0]
        };
        return data;
    },

    async _fetchMacroHubsFromAPI() {
        // Fallback values used only if FRED is unreachable / key missing
        const fallback = { US10Y: 0.045, VIX: 15.2, _fallback: true };

        try {
            const [us10yRes, vixRes] = await Promise.allSettled([
                fetch('/api/fred-proxy?series_id=DGS10').then(r => r.json()),
                fetch('/api/fred-proxy?series_id=VIXCLS').then(r => r.json())
            ]);

            const result = {};
            let latestDate = null;
            let us10yLive = false;
            let vixLive = false;

            if (us10yRes.status === 'fulfilled' && typeof us10yRes.value.value === 'number') {
                // FRED returns DGS10 as a percent (e.g. 4.25). Convert to decimal drift.
                result.US10Y = us10yRes.value.value / 100;
                latestDate = us10yRes.value.date || latestDate;
                us10yLive = true;
            } else {
                console.warn('[OSIRIS] US10Y fetch failed, using fallback', us10yRes);
                result.US10Y = fallback.US10Y;
            }

            if (vixRes.status === 'fulfilled' && typeof vixRes.value.value === 'number') {
                result.VIX = vixRes.value.value;
                latestDate = vixRes.value.date || latestDate;
                vixLive = true;
            } else {
                console.warn('[OSIRIS] VIX fetch failed, using fallback', vixRes);
                result.VIX = fallback.VIX;
            }

            result._latestDate = latestDate;
            result._fallback = !(us10yLive || vixLive);
            return result;
        } catch (e) {
            console.error('[OSIRIS] Macro fetch error:', e);
            return fallback;
        }
    },

    // ── Historical ticker data: 1y daily adjusted close from Yahoo ─────────
    async _initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('OsirisTickerCache', 1);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('historical_data')) {
                    db.createObjectStore('historical_data', { keyPath: 'ticker' });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    async getHistoricalData(ticker) {
        const db = await this._initIndexedDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['historical_data'], 'readonly');
            const store = transaction.objectStore('historical_data');
            const request = store.get(ticker);

            request.onsuccess = async () => {
                const cachedRecord = request.result;
                const now = Date.now();

                if (cachedRecord && (now - cachedRecord.lastUpdated < CACHE_EXPIRY_MS)) {
                    console.log(`[OSIRIS] Loaded ${ticker} history from IndexedDB`);
                    this._lastFetchInfo.history = {
                        source: 'cached',
                        date: cachedRecord.latestDate,
                        ticker: ticker
                    };
                    resolve(cachedRecord.data);
                    return;
                }

                console.log(`[OSIRIS] Fetching fresh historical data for ${ticker}`);
                try {
                    const freshData = await this._fetchTickerHistoryFromAPI(ticker);
                    const latestDate = freshData.length > 0 ? freshData[freshData.length - 1].date : null;
                    const realizedSigma = this._computeAnnualizedRealizedVol(freshData);

                    const writeTx = db.transaction(['historical_data'], 'readwrite');
                    const writeStore = writeTx.objectStore('historical_data');
                    writeStore.put({
                        ticker: ticker,
                        lastUpdated: now,
                        latestDate: latestDate,
                        realizedSigma: realizedSigma,
                        data: freshData
                    });

                    this._lastFetchInfo.history = {
                        source: 'live',
                        date: latestDate,
                        ticker: ticker
                    };
                    resolve(freshData);
                } catch (e) {
                    reject(e);
                }
            };

            request.onerror = () => reject(request.error);
        });
    },

    async _fetchTickerHistoryFromAPI(ticker) {
        const url = `/api/yahoo-proxy?symbol=${encodeURIComponent(ticker)}&mode=history&range=1y`;
        const response = await fetch(url);
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Yahoo proxy returned ${response.status}: ${errData.error || 'unknown'}`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload.series) || payload.series.length < 2) {
            throw new Error('Yahoo proxy returned empty or invalid series');
        }
        return payload.series;
    },

    // Annualized log-return standard deviation. Cached on the ticker record
    // so downstream phases (#1 σ replacement, #5 OU calibration) read it free.
    _computeAnnualizedRealizedVol(series) {
        if (!series || series.length < 2) return null;
        const returns = [];
        for (let i = 1; i < series.length; i++) {
            const prev = series[i - 1].adjClose;
            const curr = series[i].adjClose;
            if (prev > 0 && curr > 0) {
                returns.push(Math.log(curr / prev));
            }
        }
        if (returns.length < 2) return null;
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (returns.length - 1);
        return Math.sqrt(variance) * Math.sqrt(252);
    },

    // Helper for Phase 1 to read the realized σ without re-fetching.
    async getRealizedSigma(ticker) {
        const db = await this._initIndexedDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['historical_data'], 'readonly');
            const store = transaction.objectStore('historical_data');
            const request = store.get(ticker);
            request.onsuccess = () => resolve(request.result?.realizedSigma || null);
            request.onerror = () => reject(request.error);
        });
    }
};
