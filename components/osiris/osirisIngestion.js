/**
 * Project Osiris - Data Pipeline Protocol
 * Handles Lazy Load + Local Caching via localStorage and IndexedDB
 */

const MACRO_CACHE_KEY = 'osiris_macro_hubs';
const MACRO_CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export const osirisIngestion = {
    /**
     * Checks if macro hubs exist in localStorage and are valid (under 24h old).
     * If not, fetches from the API.
     */
    async getMacroHubs() {
        const cached = localStorage.getItem(MACRO_CACHE_KEY);
        if (cached) {
            try {
                const parsed = JSON.parse(cached);
                if (Date.now() - parsed.timestamp < MACRO_CACHE_EXPIRY_MS) {
                    console.log('[OSIRIS] Loaded macro hubs from local cache');
                    return parsed.data;
                }
            } catch (e) {
                console.error('[OSIRIS] Error parsing macro cache:', e);
            }
        }

        console.log('[OSIRIS] Fetching fresh macro hubs from API');
        // Fallback mock fetch if API is not fully wired, replace with actual endpoint
        // Example endpoints: /api/fred-proxy for US10Y, /api/yahoo-proxy for VIX
        const data = await this._fetchMacroHubsFromAPI();
        
        localStorage.setItem(MACRO_CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: data
        }));

        return data;
    },

    async _fetchMacroHubsFromAPI() {
        // Stub implementation - to be replaced with actual proxy calls
        // In real execution, this would call /api/fred-proxy.js and /api/yahoo-proxy.js
        return {
            US10Y: 0.045, // 4.5%
            VIX: 15.2,
            XLE_VOL: 0.22,
            XLI_VOL: 0.18
        };
    },

    /**
     * IndexedDB Initialization
     */
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

    /**
     * Fetches 1-year adjusted close data for a specific ticker.
     * Uses IndexedDB to cache historicals and fetches only missing deltas.
     */
    async getHistoricalData(ticker) {
        const db = await this._initIndexedDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(['historical_data'], 'readonly');
            const store = transaction.objectStore('historical_data');
            const request = store.get(ticker);

            request.onsuccess = async () => {
                let cachedRecord = request.result;
                const now = new Date();
                
                // If we have a cached record and it's from today (ignoring weekends for simplicity in this stub)
                // In a robust system, we would check if the last date matches the latest market close.
                if (cachedRecord && (now.getTime() - cachedRecord.lastUpdated < MACRO_CACHE_EXPIRY_MS)) {
                    console.log(`[OSIRIS] Loaded ${ticker} history from IndexedDB`);
                    resolve(cachedRecord.data);
                    return;
                }

                // If not cached or stale, fetch from API (handling delta fetch is ideal, but full 1Y fetch is safer fallback)
                console.log(`[OSIRIS] Fetching fresh historical data for ${ticker}`);
                try {
                    const freshData = await this._fetchTickerHistoryFromAPI(ticker);
                    
                    // Save to IndexedDB
                    const writeTx = db.transaction(['historical_data'], 'readwrite');
                    const writeStore = writeTx.objectStore('historical_data');
                    writeStore.put({
                        ticker: ticker,
                        lastUpdated: now.getTime(),
                        data: freshData
                    });

                    resolve(freshData);
                } catch (e) {
                    reject(e);
                }
            };
            
            request.onerror = () => reject(request.error);
        });
    },

    async _fetchTickerHistoryFromAPI(ticker) {
        // Mock fetch implementation. In production, calls /api/yahoo-proxy.js or similar
        // We simulate returning an array of objects for the last 252 days
        const mockData = [];
        let price = 100; // Base mock price
        for (let i = 0; i < 252; i++) {
            price = price * (1 + (Math.random() - 0.5) * 0.02);
            mockData.push({ date: new Date(Date.now() - (252 - i) * 86400000).toISOString(), adjClose: price });
        }
        return mockData;
    }
};
