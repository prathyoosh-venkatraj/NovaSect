/**
 * Sentinel History — Vercel Serverless Function
 * Persists and retrieves 30-day G-spread snapshots per ticker via Vercel KV (Upstash Redis).
 *
 * GET  ?ticker=XOM             → JSON array of {date, spread} objects (up to 30 entries)
 * POST ?ticker=XOM&spread=285  → appends today's entry; LTRIM keeps last 30
 *                                REQUIRES Authorization: Bearer <SNAPSHOT_WRITE_SECRET>
 *
 * Security:
 *   - GET is public (read-only).
 *   - POST (Phase 1): writes are now SERVER-ONLY. They require a bearer token
 *     matching SNAPSHOT_WRITE_SECRET, compared in constant time. This closes
 *     the previous hole where any anonymous client could POST arbitrary
 *     spreads (1-5000) for any ticker and pollute the history shown to users.
 *     The browser no longer writes (tryPostDailySpread is a no-op); a future
 *     authenticated cron/Action repopulates history server-side.
 *   - IP rate limiting (60 req/min).
 * Graceful degradation: returns [] when KV store not yet provisioned.
 */

import { timingSafeEqual } from 'crypto';

const rateLimitMap = new Map();

// Constant-time bearer-token check against SNAPSHOT_WRITE_SECRET.
function isAuthorizedWrite(req) {
    const secret = process.env.SNAPSHOT_WRITE_SECRET;
    if (!secret) return false; // no secret configured → no writes accepted
    const header = req.headers['authorization'] || '';
    const presented = header.startsWith('Bearer ') ? header.slice(7) : '';
    const a = Buffer.from(presented);
    const b = Buffer.from(secret);
    if (a.length !== b.length) return false;
    try { return timingSafeEqual(a, b); } catch { return false; }
}

function isRateLimited(ip) {
    const WINDOW_MS = 60_000;
    const MAX = 60;
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

// Tickers: alphanumeric + dots, dashes, underscores, max 15 chars (covers 2222.SR, EMBR3.SA, etc.)
const TICKER_RE = /^[A-Za-z0-9.\-_]{1,15}$/;

function kvPipeline(kvUrl, kvToken, commands) {
    return fetch(`${kvUrl}/pipeline`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${kvToken}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(commands)
    });
}

export default async function handler(req, res) {
    const { ticker, spread } = req.query;
    // Vercel KV (legacy) names OR Upstash Marketplace names — whichever is present
    const kvUrl   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL;
    const kvToken = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!ticker || !TICKER_RE.test(ticker)) {
        return res.status(400).json({ error: 'E400: INVALID_TICKER' });
    }

    const ip = getClientIp(req);
    if (isRateLimited(ip)) {
        res.setHeader('Retry-After', '60');
        return res.status(429).json({ error: 'E429: RATE_LIMIT_EXCEEDED' });
    }

    // KV store not yet provisioned — fail open so the UI degrades gracefully
    if (!kvUrl || !kvToken) {
        if (req.method === 'GET') return res.status(200).json([]);
        return res.status(503).json({ error: 'E503: KV_NOT_CONFIGURED — set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in Vercel env vars' });
    }

    const key = `sh:${ticker.toUpperCase()}`;

    try {
        if (req.method === 'GET') {
            const r = await kvPipeline(kvUrl, kvToken, [['LRANGE', key, 0, -1]]);
            if (!r.ok) return res.status(200).json([]);
            const data = await r.json();
            const raw = data[0]?.result || [];
            const items = raw
                .map(s => { try { return JSON.parse(s); } catch { return null; } })
                .filter(x => x && x.date && typeof x.spread === 'number');
            // Deduplicate by date (last write per calendar day wins)
            const byDate = new Map();
            items.forEach(item => byDate.set(item.date, item));
            const history = Array.from(byDate.values());
            res.setHeader('Cache-Control', 'no-store');
            return res.status(200).json(history);
        }

        if (req.method === 'POST') {
            // Server-only write gate — closes the public arbitrary-write hole.
            if (!isAuthorizedWrite(req)) {
                return res.status(401).json({ error: 'E401: WRITE_UNAUTHORIZED' });
            }
            const spreadVal = parseInt(spread, 10);
            if (!spread || isNaN(spreadVal) || spreadVal < 1 || spreadVal > 5000) {
                return res.status(400).json({ error: 'E400: INVALID_SPREAD' });
            }
            const today = new Date().toISOString().slice(0, 10);
            const entry = JSON.stringify({ date: today, spread: spreadVal });
            // RPUSH new entry, LTRIM to keep only last 30 (oldest trimmed automatically)
            const r = await kvPipeline(kvUrl, kvToken, [
                ['RPUSH', key, entry],
                ['LTRIM', key, -30, -1]
            ]);
            if (!r.ok) return res.status(502).json({ error: 'E502: KV_WRITE_FAILED' });
            return res.status(200).json({ ok: true });
        }

        return res.status(405).json({ error: 'E405: METHOD_NOT_ALLOWED' });
    } catch (err) {
        console.error('sentinel-history error:', err);
        return res.status(502).json({ error: 'E502: KV_NETWORK_ERROR' });
    }
}
