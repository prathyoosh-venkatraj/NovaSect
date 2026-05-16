/**
 * Yahoo Finance Proxy - Vercel Serverless Function
 *
 * Four modes:
 *   - Default (no `mode` query param): returns a 30-day realized volatility summary.
 *     Cache: 1h edge. Used by Sentinel's auto-calibration spot-checks.
 *   - mode=history (with `range`, default '1y'): returns the full daily adjusted-close
 *     series + dividend events for the requested range. Cache: 24h edge.
 *     Used by Osiris for initial-price + realized-σ + OU calibration.
 *   - mode=quote-summary: returns analyst price targets + recommendation mean
 *     from Yahoo's quoteSummary endpoint. Requires a cookie+crumb auth flow.
 *     Cache: 6h edge. Used by FinVault Forward Estimates panel as a free-tier
 *     substitute for Finnhub's premium-only /stock/price-target.
 *   - mode=news: parses Yahoo's public RSS headline feed and returns up to
 *     20 items in Finnhub /company-news shape. Cache: 30min edge. Used by
 *     FinVault News Feed as a fallback when Finnhub returns nothing (most
 *     non-US tickers on the free tier).
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';

// Yahoo's v10/quoteSummary endpoint requires session cookie + crumb auth.
// Two-step bootstrap: hit fc.yahoo.com to grab an A3 cookie, then exchange
// it for a crumb. Auth is fetched per-request; the Vercel edge cache on
// the proxy's response (6h) makes this cheap in aggregate.
async function getYahooAuth() {
    const cookieRes = await fetch('https://fc.yahoo.com/', { headers: { 'User-Agent': UA } });
    const setCookie = cookieRes.headers.get('set-cookie') || '';
    const a3Match = setCookie.match(/A3=([^;]+)/);
    if (!a3Match) throw new Error('Failed to obtain Yahoo session cookie');
    const cookieValue = 'A3=' + a3Match[1];

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': UA, 'Cookie': cookieValue }
    });
    const crumb = (await crumbRes.text()).trim();
    if (!crumb || crumb.length < 5) throw new Error('Failed to obtain Yahoo crumb');
    return { cookie: cookieValue, crumb };
}

function unwrap(obj) {
    return (obj && typeof obj === 'object' && 'raw' in obj) ? obj.raw : null;
}

export default async function handler(req, res) {
    const { symbol, mode, range } = req.query;

    if (!symbol) {
        return res.status(400).json({ error: 'E400: Missing symbol' });
    }

    // ── quote-summary mode: analyst targets + recommendation mean ──────
    if (mode === 'quote-summary') {
        try {
            const { cookie, crumb } = await getYahooAuth();
            const summaryUrl = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${symbol}` +
                `?modules=financialData&crumb=${encodeURIComponent(crumb)}`;
            const response = await fetch(summaryUrl, {
                headers: { 'User-Agent': UA, 'Cookie': cookie }
            });
            if (!response.ok) {
                return res.status(response.status).json({ error: `E${response.status}: YAHOO_API_REJECTED` });
            }
            const data = await response.json();
            const fd = data.quoteSummary?.result?.[0]?.financialData;
            if (!fd) {
                return res.status(404).json({ error: 'E404: NO_DATA_FOUND' });
            }
            res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=21600');
            return res.status(200).json({
                symbol: symbol,
                mode: 'quote-summary',
                currentPrice:      unwrap(fd.currentPrice),
                targetMean:        unwrap(fd.targetMeanPrice),
                targetMedian:      unwrap(fd.targetMedianPrice),
                targetHigh:        unwrap(fd.targetHighPrice),
                targetLow:         unwrap(fd.targetLowPrice),
                numberOfAnalysts:  unwrap(fd.numberOfAnalystOpinions),
                recommendationMean: unwrap(fd.recommendationMean),
                recommendationKey: fd.recommendationKey || null,
                source: 'Yahoo Finance Live'
            });
        } catch (error) {
            console.error('Yahoo quote-summary error:', error);
            return res.status(502).json({ error: 'E502: YAHOO_AUTH_FAILED' });
        }
    }

    // ── news mode: parse Yahoo Finance's public RSS headline feed ─────
    // No auth required. Returns up to 20 items in the same shape Finnhub's
    // /company-news endpoint produces, so the FinVault UI can render
    // either source through the same code path. Used as a fallback when
    // Finnhub returns nothing — which it does for most non-US tickers.
    if (mode === 'news') {
        try {
            const rssUrl = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(symbol)}&region=US&lang=en-US`;
            const rssRes = await fetch(rssUrl, { headers: { 'User-Agent': UA, 'Accept': 'application/rss+xml, application/xml, text/xml' } });
            if (!rssRes.ok) {
                return res.status(rssRes.status).json({ error: `E${rssRes.status}: YAHOO_RSS_REJECTED` });
            }
            const xml = await rssRes.text();

            // Minimal RSS extractor — no XML library needed for this shape.
            const stripCdata = s => s.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
            const getTag = (block, tag) => {
                const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i');
                const m = re.exec(block);
                return m ? stripCdata(m[1]) : '';
            };

            const items = [];
            const itemRe = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
            let m;
            while ((m = itemRe.exec(xml)) !== null && items.length < 20) {
                const block = m[1];
                const title = getTag(block, 'title');
                const link = getTag(block, 'link');
                const pubDate = getTag(block, 'pubDate');
                const description = getTag(block, 'description');
                let source = getTag(block, 'source');
                if (!source) source = 'Yahoo Finance';
                const ts = pubDate
                    ? Math.floor(new Date(pubDate).getTime() / 1000) || Math.floor(Date.now() / 1000)
                    : Math.floor(Date.now() / 1000);
                if (!title || !link) continue;
                items.push({
                    headline: title,
                    url: link,
                    source,
                    datetime: ts,
                    summary: description
                });
            }

            // 30 min cache — Yahoo's RSS refreshes ~hourly.
            res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=1800');
            return res.status(200).json(items);
        } catch (error) {
            console.error('Yahoo RSS news error:', error);
            return res.status(502).json({ error: 'E502: YAHOO_RSS_FAILED' });
        }
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
