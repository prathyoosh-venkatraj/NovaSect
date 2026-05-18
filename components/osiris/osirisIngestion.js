/**
 * Project Osiris - Data Pipeline
 *
 * Live wiring:
 *   - Historical price series + dividend events:
 *       GET /api/yahoo-proxy?symbol=X&mode=history&range=1y
 *   - Macro hubs (US10Y, VIX):
 *       GET /api/fred-proxy?series_id=DGS10|VIXCLS
 *
 * Phase-2 spike: per-ticker `beta` and `dividendYield` are now computed at
 * runtime from cached data:
 *   - beta = cov(stockReturns, benchmarkReturns) / var(benchmarkReturns)
 *     using 1y daily log-returns against SPY (cached the same way as any
 *     ticker, edge-cached on the proxy, so SPY is fetched ~1x/day site-wide).
 *   - dividendYield = sum(TTM dividend events) / currentPrice.
 * Only `creditRating` remains hand-filled in physics-config.json (no clean
 * free API for that — see ratingLastVerified for staleness visibility).
 *
 * Caching:
 *   1. IndexedDB store `historical_data` keyed by ticker — 24h TTL. The
 *      record now also caches beta/yield/sigma so we don't recompute on
 *      every read. Records are tagged with RECORD_SCHEMA_VERSION; mismatches
 *      force a refresh.
 *   2. localStorage `osiris_macro_hubs` — 24h TTL.
 *   3. Vercel edge cache on proxies (24h for history mode).
 */

const MACRO_CACHE_KEY = 'osiris_macro_hubs';
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000;
const RECORD_SCHEMA_VERSION = 2; // bumped when record shape changes
const BENCHMARK_SYMBOL = 'SPY';

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

    // ── Historical ticker data + derived metrics ───────────────────────────
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

    async _readRecord(db, ticker) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['historical_data'], 'readonly');
            const store = tx.objectStore('historical_data');
            const req = store.get(ticker);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    },

    async _writeRecord(db, record) {
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['historical_data'], 'readwrite');
            const store = tx.objectStore('historical_data');
            const req = store.put(record);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },

    _isRecordFresh(record) {
        if (!record) return false;
        if (record._schemaVersion !== RECORD_SCHEMA_VERSION) return false;
        if (Date.now() - record.lastUpdated >= CACHE_EXPIRY_MS) return false;
        return true;
    },

    /**
     * Core fetcher: returns a complete cached record (raw series + dividends +
     * derived beta + dividendYield + realizedSigma). All other public methods
     * route through this. Recursion-safe: a request for the benchmark itself
     * does not re-fetch the benchmark.
     */
    async _getRecord(ticker) {
        const db = await this._initIndexedDB();
        const cached = await this._readRecord(db, ticker);

        if (this._isRecordFresh(cached)) {
            console.log(`[OSIRIS] Loaded ${ticker} record from IndexedDB`);
            this._lastFetchInfo.history = {
                source: 'cached',
                date: cached.latestDate,
                ticker: ticker
            };
            return cached;
        }

        console.log(`[OSIRIS] Fetching fresh data for ${ticker}`);
        const { series, dividends, currentPrice } = await this._fetchTickerPayloadFromAPI(ticker);
        const latestDate = series.length > 0 ? series[series.length - 1].date : null;

        // Compute derived metrics
        const realizedSigma = this._computeAnnualizedRealizedVol(series);
        const dividendYield = this._computeTTMDividendYield(dividends, currentPrice ?? (series[series.length - 1]?.adjClose));
        const longTermMeanPrice = this._computeLongTermMeanPrice(series);

        let beta = null;
        if (ticker === BENCHMARK_SYMBOL) {
            beta = 1.0; // benchmark beta vs itself
        } else {
            try {
                const benchmarkRecord = await this._getRecord(BENCHMARK_SYMBOL);
                beta = this._computeBeta(series, benchmarkRecord.data);
            } catch (e) {
                console.warn(`[OSIRIS] Beta computation failed for ${ticker}:`, e);
                beta = null;
            }
        }

        const record = {
            ticker: ticker,
            _schemaVersion: RECORD_SCHEMA_VERSION,
            lastUpdated: Date.now(),
            latestDate: latestDate,
            currentPrice: currentPrice ?? (series[series.length - 1]?.adjClose ?? null),
            data: series,
            dividends: dividends,
            beta: beta,
            dividendYield: dividendYield,
            realizedSigma: realizedSigma,
            longTermMeanPrice: longTermMeanPrice
        };

        await this._writeRecord(db, record);

        this._lastFetchInfo.history = {
            source: 'live',
            date: latestDate,
            ticker: ticker
        };
        return record;
    },

    async getHistoricalData(ticker) {
        const record = await this._getRecord(ticker);
        return record.data;
    },

    async getTickerMetrics(ticker) {
        const record = await this._getRecord(ticker);
        // Last dividend = most recent entry in the ascending-sorted dividends array.
        const divs = Array.isArray(record.dividends) ? record.dividends : [];
        const lastDividend = divs.length > 0
            ? { amount: divs[divs.length - 1].amount, date: divs[divs.length - 1].date }
            : null;
        return {
            beta: record.beta,
            dividendYield: record.dividendYield,
            realizedSigma: record.realizedSigma,
            longTermMeanPrice: record.longTermMeanPrice ?? null,
            lastDividend: lastDividend,
            latestDate: record.latestDate,
            currentPrice: record.currentPrice
        };
    },

    // Legacy entry point — retained for Phase 1 callers
    async getRealizedSigma(ticker) {
        const record = await this._getRecord(ticker);
        return record.realizedSigma ?? null;
    },

    // ── Intraday realised volatility (Phase C) ────────────────────────────
    // Computes annualised σ from 5-minute realised variance + overnight
    // bridge over the last ~20 trading days. Cached in-module per session
    // (cheap — a few thousand multiplications). Silent fallback to the
    // existing daily σ when intraday data is unavailable (sparse coverage
    // on some international tickers, freshly listed names, schema drift).
    _intradayVolCache: new Map(),
    INTRADAY_RV_WINDOW_DAYS: 20,

    async getIntradayVolatility(ticker) {
        // Per-session memo — IndexedDB caching would be overkill since
        // the proxy already 6h-edge-caches the raw 5m bars.
        const cached = this._intradayVolCache.get(ticker);
        if (cached && Date.now() - cached.ts < CACHE_EXPIRY_MS) return cached.value;

        try {
            const intradaySeries = await this._fetchIntradayBars(ticker);
            const dailyRecord = await this._getRecord(ticker);
            const sigma = this._computeAnnualizedRVFromIntraday(
                intradaySeries,
                dailyRecord.data,
                this.INTRADAY_RV_WINDOW_DAYS
            );
            if (typeof sigma === 'number' && isFinite(sigma) && sigma > 0) {
                this._intradayVolCache.set(ticker, { value: sigma, ts: Date.now() });
                return sigma;
            }
            console.log(`[OSIRIS] Intraday RV computation produced invalid sigma for ${ticker}, falling back to daily`);
            return dailyRecord.realizedSigma ?? null;
        } catch (e) {
            // Silent fallback per user preference — surface to console only.
            console.log(`[OSIRIS] Intraday σ unavailable for ${ticker} (${e.message}); falling back to daily σ`);
            try {
                const dailyRecord = await this._getRecord(ticker);
                return dailyRecord.realizedSigma ?? null;
            } catch (e2) {
                return null;
            }
        }
    },

    async _fetchIntradayBars(ticker) {
        const url = `/api/yahoo-proxy?symbol=${encodeURIComponent(ticker)}&mode=history&interval=5m&range=30d`;
        const response = await fetch(url);
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(`Yahoo intraday proxy ${response.status}: ${errData.error || 'unknown'}`);
        }
        const payload = await response.json();
        if (!Array.isArray(payload.series) || payload.series.length < 50) {
            throw new Error('intraday series too short (' + (payload.series?.length || 0) + ' bars)');
        }
        return payload.series;
    },

    /**
     * Realised-variance estimator with overnight bridge.
     *
     *   RV_day = Σ (log return of each intraday 5-min bar)²
     *          + (log(open_today / close_yesterday))²        ← overnight gap
     *
     *   σ_annual = √(mean(RV_day over last N days) × 252)
     *
     * The overnight gap is taken from the *daily* close-to-open series
     * (the intraday endpoint only returns ticks during market hours).
     * Both inputs are required; if the daily series lacks the date
     * boundary, that day's overnight term is treated as 0 (under-states
     * variance slightly but never overshoots).
     */
    _computeAnnualizedRVFromIntraday(intradayBars, dailySeries, windowDays) {
        if (!Array.isArray(intradayBars) || intradayBars.length < 50) return null;
        if (!Array.isArray(dailySeries) || dailySeries.length < windowDays) return null;

        // Group 5-min bars by UTC date (YYYY-MM-DD). Yahoo timestamps
        // are unix epoch seconds. The trading session falls on a single
        // UTC date for: US (14:30-21:00Z), LSE/XETR/MIL (08:00-16:30Z),
        // NSE (03:45-10:00Z), TSE (00:00-06:00Z). ASX is the exception
        // (~23:00-05:00Z), splitting one session across two UTC dates;
        // for WDS/ORG that produces a ~30% σ underestimate. Acceptable
        // for v1 (only 2 of 83 tickers; silent fallback handles worse
        // cases). Future fix: bucket by gaps > 30 min between bars.
        const byDate = new Map();
        for (const bar of intradayBars) {
            const date = new Date(bar.ts * 1000).toISOString().split('T')[0];
            if (!byDate.has(date)) byDate.set(date, []);
            byDate.get(date).push(bar.close);
        }

        // Daily series for overnight bridge — keyed by date.
        const dailyByDate = new Map(dailySeries.map(p => [p.date, p.adjClose]));

        // Sort calendar dates descending; take the most recent windowDays
        // that have ≥ 10 intraday bars (to skip half-sessions / holidays).
        const dates = [...byDate.keys()]
            .filter(d => byDate.get(d).length >= 10)
            .sort();
        if (dates.length < Math.max(5, Math.floor(windowDays / 2))) return null;

        const windowDates = dates.slice(-windowDays);
        const dailyRVs = [];
        let prevDate = null;

        for (const date of windowDates) {
            const bars = byDate.get(date);
            let rv = 0;
            for (let i = 1; i < bars.length; i++) {
                const r = Math.log(bars[i] / bars[i - 1]);
                if (isFinite(r)) rv += r * r;
            }
            // Overnight bridge — open_today / close_yesterday from daily.
            // First intraday bar of the day is a reasonable proxy for the
            // session open; we use it against yesterday's daily close.
            if (prevDate && dailyByDate.has(prevDate) && bars.length > 0) {
                const overnight = Math.log(bars[0] / dailyByDate.get(prevDate));
                if (isFinite(overnight)) rv += overnight * overnight;
            }
            dailyRVs.push(rv);
            prevDate = date;
        }

        if (dailyRVs.length < 5) return null;
        const meanRV = dailyRVs.reduce((a, b) => a + b, 0) / dailyRVs.length;
        return Math.sqrt(meanRV * 252);
    },

    async _fetchTickerPayloadFromAPI(ticker) {
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
        return {
            series: payload.series,
            dividends: Array.isArray(payload.dividends) ? payload.dividends : [],
            currentPrice: typeof payload.currentPrice === 'number' ? payload.currentPrice : null
        };
    },

    // ── Derived metrics ────────────────────────────────────────────────────

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

    /**
     * OLS beta vs benchmark using daily log-returns over the overlapping
     * date range. Returns null on insufficient data.
     */
    _computeBeta(stockSeries, benchmarkSeries) {
        if (!stockSeries || !benchmarkSeries) return null;

        const stockMap = new Map(stockSeries.map(p => [p.date, p.adjClose]));
        const benchMap = new Map(benchmarkSeries.map(p => [p.date, p.adjClose]));

        const sharedDates = [...stockMap.keys()].filter(d => benchMap.has(d)).sort();
        if (sharedDates.length < 30) return null;

        const stockReturns = [];
        const marketReturns = [];
        for (let i = 1; i < sharedDates.length; i++) {
            const sPrev = stockMap.get(sharedDates[i - 1]);
            const sCurr = stockMap.get(sharedDates[i]);
            const mPrev = benchMap.get(sharedDates[i - 1]);
            const mCurr = benchMap.get(sharedDates[i]);
            if (sPrev > 0 && sCurr > 0 && mPrev > 0 && mCurr > 0) {
                stockReturns.push(Math.log(sCurr / sPrev));
                marketReturns.push(Math.log(mCurr / mPrev));
            }
        }

        const n = stockReturns.length;
        if (n < 30) return null;

        const stockMean = stockReturns.reduce((a, b) => a + b, 0) / n;
        const marketMean = marketReturns.reduce((a, b) => a + b, 0) / n;

        let covSum = 0;
        let varSum = 0;
        for (let i = 0; i < n; i++) {
            const dS = stockReturns[i] - stockMean;
            const dM = marketReturns[i] - marketMean;
            covSum += dS * dM;
            varSum += dM * dM;
        }

        if (varSum <= 0) return null;
        return covSum / varSum;
    },

    /**
     * Long-term mean price for the OU mean-reversion target. Currently the
     * arithmetic mean of adjClose over the cached 1y window — matches the
     * arithmetic OU formulation in stochasticWorker (dS = θ(μ − S)dt + σdW).
     * A longer window (3-5y) would be more stable but would require extending
     * the Yahoo proxy's range; Phase 3 ships with 1y as the available data.
     */
    _computeLongTermMeanPrice(series) {
        if (!series || series.length < 30) return null;
        let sum = 0;
        let n = 0;
        for (const point of series) {
            if (point.adjClose > 0) {
                sum += point.adjClose;
                n++;
            }
        }
        if (n < 30) return null;
        return sum / n;
    },

    /**
     * Trailing-12-month dividend yield. Sums dividend events with ex-div
     * date in the 365 calendar days preceding the series' latest date.
     */
    _computeTTMDividendYield(dividends, latestPrice) {
        if (!Array.isArray(dividends) || dividends.length === 0) return 0;
        if (!(latestPrice > 0)) return null;

        const cutoff = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000)
            .toISOString().split('T')[0];

        const ttmTotal = dividends
            .filter(d => d.date >= cutoff)
            .reduce((sum, d) => sum + d.amount, 0);

        return ttmTotal / latestPrice;
    }
};
