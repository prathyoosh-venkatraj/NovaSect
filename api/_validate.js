/**
 * NovaSect — shared request validators (server-only; underscore prefix keeps it
 * out of the Vercel function router).
 *
 * Single source of truth for the ticker format so the proxies cannot drift apart
 * (sec-proxy and sentinel-history previously disagreed on whether '_' was
 * allowed). Covers global exchange suffixes: 2222.SR, EMBR3.SA, BRK-B, etc.
 * No underscore — no real equity ticker uses one.
 */

export const TICKER_RE = /^[A-Za-z0-9.\-]{1,15}$/;

export function isValidTicker(t) {
  return typeof t === 'string' && TICKER_RE.test(t);
}
