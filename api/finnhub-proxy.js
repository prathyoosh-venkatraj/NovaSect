/**
 * Finnhub Proxy - Vercel Serverless Function
 * Wraps https://finnhub.io/api/v1/{endpoint} with edge caching and an
 * endpoint whitelist (prevents accidental abuse of paid-tier endpoints
 * by anyone hitting our proxy).
 *
 * Usage:
 *   GET /api/finnhub-proxy?endpoint=company-news&symbol=XOM&from=2026-04-01&to=2026-05-01
 *   GET /api/finnhub-proxy?endpoint=stock/recommendation&symbol=XOM
 *   GET /api/finnhub-proxy?endpoint=stock/price-target&symbol=XOM
 *   GET /api/finnhub-proxy?endpoint=company-profile2&symbol=XOM
 *
 * Env var:  FINNHUB_API_KEY  (falls back to FINNHUB if that's the name used)
 */

// Whitelist of free-tier endpoints. Extend cautiously — Finnhub's premium
// endpoints will 403 anyway but we'd prefer to fail fast at the proxy.
const ALLOWED_ENDPOINTS = new Set([
    'company-news',
    'company-profile2',
    'stock/recommendation',
    'stock/price-target',
    'stock/earnings',
    'stock/insider-transactions',
    'stock/financials-reported'
]);

// Cache TTL (seconds) per endpoint. News refreshes faster than profile data.
const CACHE_TTL = {
    'company-news':                1800,   // 30 min — relatively fresh
    'company-profile2':           86400,   // 24h   — rarely changes
    'stock/recommendation':       21600,   // 6h    — analyst recs trickle in
    'stock/price-target':         21600,   // 6h
    'stock/earnings':             21600,   // 6h
    'stock/insider-transactions':  3600,   // 1h    — Form 4 filings
    'stock/financials-reported':  86400    // 24h   — quarterly reports
};

export default async function handler(req, res) {
    const { endpoint, ...params } = req.query;
    const apiKey = process.env.FINNHUB_API_KEY || process.env.FINNHUB;

    if (!endpoint) {
        return res.status(400).json({ error: 'E400: Missing endpoint' });
    }
    if (!ALLOWED_ENDPOINTS.has(endpoint)) {
        return res.status(400).json({ error: 'E400: ENDPOINT_NOT_ALLOWED' });
    }
    if (!apiKey) {
        console.warn('FINNHUB_API_KEY missing from environment');
        return res.status(500).json({ error: 'E500: ENVAR_MISSING (Check Dashboard)' });
    }

    const upstream = new URL(`https://finnhub.io/api/v1/${endpoint}`);
    upstream.searchParams.set('token', apiKey);
    for (const [k, v] of Object.entries(params)) {
        if (typeof v === 'string' && v.length > 0) {
            upstream.searchParams.set(k, v);
        }
    }

    try {
        const response = await fetch(upstream.toString());

        if (response.status === 401 || response.status === 403) {
            return res.status(401).json({ error: 'E401: API_KEY_INVALID_OR_RESTRICTED' });
        }
        if (response.status === 429) {
            return res.status(429).json({ error: 'E429: RATE_LIMIT' });
        }
        if (!response.ok) {
            return res.status(response.status).json({ error: `E${response.status}: FINNHUB_REJECTED` });
        }

        const data = await response.json();
        const ttl = CACHE_TTL[endpoint] || 3600;

        res.setHeader('Cache-Control', `s-maxage=${ttl}, stale-while-revalidate=${ttl}`);
        return res.status(200).json(data);
    } catch (error) {
        console.error('Finnhub Proxy Error:', error);
        return res.status(502).json({ error: 'E502: NETWORK_HANDSHAKE_FAILED' });
    }
}
