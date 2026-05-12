/**
 * Yahoo Finance Proxy - Vercel Serverless Function
 *
 * Two modes:
 *   - Default (no `mode` query param): returns a 30-day realized volatility summary.
 *     Cache: 1h edge. Used by Sentinel's auto-calibration spot-checks.
 *   - mode=history (with `range`, default '1y'): returns the full daily adjusted-close
 *     series for the requested range. Cache: 24h edge (daily-close data does not
 *     change intraday). Used by Osiris for initial-price + realized-σ + OU calibration.
 */
export default async function handler(req, res) {
    const { symbol, mode, range } = req.query;

    if (!symbol) {
        return res.status(400).json({ error: 'E400: Missing symbol' });
    }

    const isHistoryMode = mode === 'history';
    const fetchRange = isHistoryMode ? (range || '1y') : '1mo';

    try {
        // In history mode, also request dividend events so the client can
        // compute trailing-12-month dividend yield without an extra round-trip.
        const eventsParam = isHistoryMode ? '&events=div' : '';
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${fetchRange}${eventsParam}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        if (!response.ok) {
            return res.status(response.status).json({ error: `E${response.status}: YAHOO_API_REJECTED` });
        }

        const data = await response.json();
        const result = data.chart?.result?.[0];

        if (!result || !result.indicators?.quote?.[0]?.close) {
            return res.status(404).json({ error: 'E404: NO_DATA_FOUND' });
        }

        const timestamps = result.timestamp || [];
        const closes = result.indicators.quote[0].close;
        const adjcloseArr = result.indicators?.adjclose?.[0]?.adjclose || closes;

        // ── History mode: full daily series for Osiris ─────────────────────
        if (isHistoryMode) {
            const series = [];
            for (let i = 0; i < timestamps.length; i++) {
                const ac = adjcloseArr[i];
                const c = closes[i];
                if (ac == null && c == null) continue; // skip null bars (holidays, halts)
                series.push({
                    date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
                    adjClose: ac != null ? ac : c
                });
            }

            if (series.length < 2) {
                return res.status(400).json({ error: 'E400: INSUFFICIENT_DATA' });
            }

            const latest = series[series.length - 1];
            const currentPrice = result.meta?.regularMarketPrice
                || result.meta?.previousClose
                || latest.adjClose;

            // Dividend events (Yahoo keys them by unix timestamp under events.dividends)
            const divEvents = result.events?.dividends || {};
            const dividends = Object.values(divEvents)
                .filter(d => d && typeof d.amount === 'number' && typeof d.date === 'number')
                .map(d => ({
                    date: new Date(d.date * 1000).toISOString().split('T')[0],
                    amount: d.amount
                }))
                .sort((a, b) => a.date.localeCompare(b.date));

            // 24h edge cache for daily-close data
            res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=43200');
            return res.status(200).json({
                symbol: symbol,
                mode: 'history',
                range: fetchRange,
                latestDate: latest.date,
                currentPrice: currentPrice,
                series: series,
                dividends: dividends,
                source: 'Yahoo Finance Live'
            });
        }

        // ── Default mode (unchanged): 30-day realized-vol summary ──────────
        const validCloses = closes.filter(c => c !== null);
        if (validCloses.length < 2) {
            return res.status(400).json({ error: 'E400: INSUFFICIENT_DATA' });
        }

        const returns = [];
        for (let i = 1; i < validCloses.length; i++) {
            returns.push(Math.log(validCloses[i] / validCloses[i - 1]));
        }

        const meanReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - meanReturn, 2), 0) / (returns.length - 1);
        const stdDev = Math.sqrt(variance);
        const annualizedVol = stdDev * Math.sqrt(252);
        const volatilityPercentage = parseFloat((annualizedVol * 100).toFixed(2));

        const lastClose = validCloses[validCloses.length - 1];
        const prevClose = validCloses[validCloses.length - 2];
        const dailyPriceChangePct = parseFloat((((lastClose - prevClose) / prevClose) * 100).toFixed(2));

        const latestDate = new Date(timestamps[timestamps.length - 1] * 1000).toISOString().split('T')[0];

        res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
        return res.status(200).json({
            symbol: symbol,
            volatility: volatilityPercentage,
            dailyPriceChangePct: dailyPriceChangePct,
            latestDate: latestDate,
            price: result.meta?.regularMarketPrice || result.meta?.previousClose || lastClose,
            source: 'Yahoo Finance Live'
        });

    } catch (error) {
        console.error('Yahoo Proxy Error:', error);
        return res.status(502).json({ error: 'E502: NETWORK_HANDSHAKE_FAILED' });
    }
}
