/**
 * FRED Proxy - Vercel Serverless Function
 * Resolves CORS and secures the FRED_API_KEY
 * Telemetry v1.2 - Advanced Diagnostics: 2026-04-20
 *
 * Security: IP rate limiting (30 req/min) + series_id format validation.
 */

// In-process sliding-window rate limiter (persists across warm invocations).
const rateLimitMap = new Map();

function isRateLimited(ip) {
    const WINDOW_MS = 60_000;
    const MAX = 30;
    const now = Date.now();
    const entry = rateLimitMap.get(ip);
    if (!entry || now - entry.windowStart > WINDOW_MS) {
        rateLimitMap.set(ip, { count: 1, windowStart: now });
        return false;
    }
    if (entry.count >= MAX) return true;
    entry.count++;
    return false;
}

function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    return xff ? xff.split(',')[0].trim() : (req.headers['x-real-ip'] || 'unknown');
}

// FRED series IDs: alphanumeric + underscores, max 20 chars (e.g. DGS10, VIXCLS).
const SERIES_ID_RE = /^[A-Za-z0-9_]{1,20}$/;

export default async function handler(req, res) {
    const { series_id } = req.query;
    const apiKey = process.env.FRED_API_KEY;

    if (!series_id) {
        return res.status(400).json({ error: 'E400: Missing series_id' });
    }
    if (!SERIES_ID_RE.test(series_id)) {
        return res.status(400).json({ error: 'E400: INVALID_SERIES_ID_FORMAT' });
    }

    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'E429: RATE_LIMIT_EXCEEDED' });
    }

    if (!apiKey) {
        console.warn('FRED_API_KEY missing from environment');
        return res.status(500).json({ error: 'E500: ENVAR_MISSING (Check Dashboard)' });
    }

    try {
        const fredUrl = `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(series_id)}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=1`;
        const response = await fetch(fredUrl);
        
        if (response.status === 403 || response.status === 401) {
             return res.status(401).json({ error: 'E401: API_KEY_INVALID (Check Key Integrity)' });
        }

        if (!response.ok) {
            return res.status(response.status).json({ error: `E${response.status}: FRED_API_REJECTED` });
        }

        const data = await response.json();

        if (data.observations && data.observations.length > 0) {
            const latest = data.observations[0];
            // FRED series are daily-published; 6h edge TTL refreshes 4×/day,
            // dropping upstream from ~216/day to ~36/day across the 9 series.
            res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=21600');
            return res.status(200).json({
                value: parseFloat(latest.value),
                date: latest.date,
                series: series_id,
                source: 'FRED Live'
            });
        } else {
            return res.status(404).json({ error: 'E404: NO_OBSERVATIONS' });
        }
    } catch (error) {
        console.error('FRED Proxy Error:', error);
        return res.status(502).json({ error: 'E502: NETWORK_HANDSHAKE_FAILED' });
    }
}
