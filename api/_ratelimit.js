/**
 * NovaSect — Shared rate limiter (server-only; underscore prefix keeps it out
 * of the Vercel function router).
 *
 * Phase 0: helper created. In-memory fallback works today.
 * Phase 3: when UPSTASH_REDIS_REST_URL/KV_REST_API_URL (+ token) are set, uses
 *          a distributed fixed-window counter via Upstash Redis so limits hold
 *          across all warm Lambda instances and survive cold starts.
 *
 * Usage:  if (await isRateLimited(getClientIp(req), 'history', 60, 60)) { 429 }
 */

const memory = new Map();

function memoryLimited(key, limit, windowSec) {
    const now = Date.now();
    const windowMs = windowSec * 1000;
    const entry = memory.get(key);
    if (!entry || now - entry.windowStart > windowMs) {
        memory.set(key, { count: 1, windowStart: now });
        return false;
    }
    if (entry.count >= limit) return true;
    entry.count++;
    return false;
}

async function redisLimited(key, limit, windowSec, url, token) {
    const redisKey = `rl:${key}`;
    try {
        const r = await fetch(`${url}/pipeline`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([['INCR', redisKey], ['EXPIRE', redisKey, String(windowSec), 'NX']]),
        });
        if (!r.ok) return memoryLimited(key, limit, windowSec);
        const data = await r.json();
        const count = Number(data?.[0]?.result ?? 0);
        return count > limit;
    } catch {
        return memoryLimited(key, limit, windowSec);
    }
}

// Warn once per cold start if we're rate-limiting in production WITHOUT a shared
// store. The in-memory counter is per-Lambda-instance, so under scale-out the
// effective limit becomes (limit × instance_count) — i.e. ineffective. This
// surfaces the misconfiguration in the function logs instead of failing silently.
let _warnedInMemoryProd = false;
function warnInMemoryFallback() {
    if (_warnedInMemoryProd) return;
    _warnedInMemoryProd = true;
    const isProd = process.env.VERCEL_ENV === 'production' || process.env.NODE_ENV === 'production';
    if (isProd) {
        console.warn('[ratelimit] No Upstash/KV configured in production — using per-instance in-memory limiter. ' +
                     'Limits will NOT hold across Lambda instances. Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN.');
    }
}

export async function isRateLimited(id, bucket, limit, windowSec) {
    const key = `${bucket}:${id}`;
    const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (url && token) return redisLimited(key, limit, windowSec, url, token);
    warnInMemoryFallback();
    return memoryLimited(key, limit, windowSec);
}

export function getClientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (xff) return xff.split(',')[0].trim();
    return req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}
