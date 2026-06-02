/**
 * SEC Proxy — Vercel Serverless Function
 * Resolves a ticker to its SEC CIK, fetches the full XBRL companyfacts, and
 * returns a COMPACT 5-year horizontal-analysis payload (a few KB) computed
 * server-side via the shared xbrl-history module. The multi-MB companyfacts
 * blob never reaches the browser.
 *
 *   GET /api/sec-proxy?ticker=XOM
 *     -> { ticker, cik, history: { years, summary, ratios, cagr } }
 *
 * SEC requires a descriptive User-Agent and does not send CORS headers, so a
 * browser cannot call data.sec.gov directly — hence this proxy.
 *
 * Security: IP rate limiting + ticker format validation. 24h edge cache.
 */

import { isRateLimited, getClientIp } from './_ratelimit.js';
import { buildSeries, historyData } from '../scripts/lib/xbrl-history.mjs';

// SEC asks for a UA identifying the app + a contact address.
const SEC_UA = 'NovaSect FinVault (novasect.space) contact@novasect.space';
const TICKER_RE = /^[A-Za-z0-9.\-]{1,15}$/;

// company_tickers.json is ~1.5MB and changes rarely; cache the ticker->CIK map
// in module scope so it's fetched at most once per warm instance.
let _tickerMap = null;
let _tickerMapAt = 0;
const TICKER_TTL = 24 * 60 * 60 * 1000;

async function getCik(ticker) {
  const now = Date.now();
  if (!_tickerMap || now - _tickerMapAt > TICKER_TTL) {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': SEC_UA, accept: 'application/json' },
    });
    if (!r.ok) throw new Error(`company_tickers ${r.status}`);
    const data = await r.json();
    const map = new Map();
    for (const k of Object.keys(data)) {
      const row = data[k];
      if (row?.ticker && row?.cik_str != null) map.set(String(row.ticker).toUpperCase(), row.cik_str);
    }
    _tickerMap = map;
    _tickerMapAt = now;
  }
  return _tickerMap.get(ticker.toUpperCase()) ?? null;
}

export default async function handler(req, res) {
  const { ticker } = req.query;
  if (!ticker || !TICKER_RE.test(ticker)) {
    return res.status(400).json({ error: 'E400: INVALID_TICKER' });
  }

  const ip = getClientIp(req);
  if (await isRateLimited(ip, 'sec', 20, 60)) {
    res.setHeader('Retry-After', '60');
    return res.status(429).json({ error: 'E429: RATE_LIMIT_EXCEEDED' });
  }

  try {
    const cikNum = await getCik(ticker);
    if (cikNum == null) {
      // Not a US SEC filer (e.g. foreign/PDF-sourced company) — no XBRL history.
      return res.status(404).json({ error: 'E404: NO_SEC_FILER' });
    }
    const cik = String(cikNum).padStart(10, '0');

    const factsRes = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: { 'User-Agent': SEC_UA, accept: 'application/json' },
    });
    if (factsRes.status === 404) return res.status(404).json({ error: 'E404: NO_COMPANYFACTS' });
    if (!factsRes.ok) return res.status(502).json({ error: `E502: SEC_${factsRes.status}` });

    const data = await factsRes.json();
    const facts = data.facts ?? {};
    const x = buildSeries(facts);          // US-GAAP concepts, 5 years
    const history = historyData(x);
    if (!history) return res.status(404).json({ error: 'E404: INSUFFICIENT_HISTORY' });

    // companyfacts only changes on a new filing — cache hard at the edge.
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=43200');
    return res.status(200).json({ ticker: ticker.toUpperCase(), cik, history });
  } catch (e) {
    console.error('SEC Proxy Error:', e.message);
    return res.status(502).json({ error: 'E502: SEC_NETWORK_ERROR' });
  }
}
