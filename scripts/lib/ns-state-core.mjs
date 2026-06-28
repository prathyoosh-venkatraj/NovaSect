/**
 * ns-state-core.mjs — pure helpers for NovaSect client state.
 *
 * The browser runtime (components/state/state.js) wraps these against
 * localStorage + the URL; this module holds the genuinely-pure, testable logic
 * (watchlist toggle, recents, scenario normalisation, change-detection diff,
 * encode/decode). No DOM, no storage, no base64 — the runtime supplies those at
 * the edge. Same pure-module + tests pattern as forensic-scores / sentinel-spread.
 */

/** Add item if absent, remove if present. Returns a new array. */
export function toggleInList(list, item) {
  const arr = Array.isArray(list) ? list.slice() : [];
  const i = arr.indexOf(item);
  if (i >= 0) arr.splice(i, 1); else arr.push(item);
  return arr;
}

/** Most-recent-first, de-duplicated, capped. Returns a new array. */
export function pushRecent(list, item, max = 6) {
  const arr = (Array.isArray(list) ? list : []).filter(x => x !== item);
  arr.unshift(item);
  return arr.slice(0, Math.max(0, max));
}

/** JSON encode/decode that never throws. */
export function encodeState(obj) {
  try { return JSON.stringify(obj); } catch { return null; }
}
export function decodeState(str) {
  if (typeof str !== 'string' || !str) return null;
  try { const v = JSON.parse(str); return (v && typeof v === 'object') ? v : null; } catch { return null; }
}

/**
 * Per-ticker change reasons for watchlist "changed since last visit" dots.
 * Snapshot shape (all optional): { spreadBps, tier, altmanBand, pricePct }.
 */
export function diffSnapshots(prev, curr) {
  if (!prev || !curr) return [];
  const out = [];
  const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
  const ps = num(prev.spreadBps), cs = num(curr.spreadBps);
  if (ps != null && cs != null) {
    if (cs >= ps * 1.05) out.push('spread widened');
    else if (cs <= ps * 0.95) out.push('spread tightened');
  }
  if (prev.tier && curr.tier && prev.tier !== curr.tier) out.push(`tier ${prev.tier}→${curr.tier}`);
  if (prev.altmanBand && curr.altmanBand && prev.altmanBand !== curr.altmanBand) out.push(`Altman ${prev.altmanBand}→${curr.altmanBand}`);
  return out;
}

/** Scenario shock dimensions the lab exposes. */
export const SCENARIO_KEYS = ['rateBps', 'vix', 'sectorVolPct', 'sovereignBps', 'commodityPct'];

/**
 * Coerce a scenario object to known numeric keys. Returns null when every shock
 * is zero (i.e. baseline — no scenario active), so callers can treat null as
 * "live values".
 */
export function normalizeScenario(s) {
  if (!s || typeof s !== 'object') return null;
  const out = {};
  let any = false;
  for (const k of SCENARIO_KEYS) {
    const v = Number(s[k]);
    out[k] = isFinite(v) ? v : 0;
    if (out[k] !== 0) any = true;
  }
  return any ? out : null;
}

/** A precompute status chip for the search/watchlist rows, from universe.json. */
export function tierFromSentinel(sentinel) {
  if (!sentinel) return { label: '—', cls: 'neutral' };
  const rating = sentinel.rating || '—';
  // IG (AAA..BBB) → green/amber by bucket; HY → red.
  const ig = sentinel.type === 'IG';
  const cls = !ig ? 'red'
            : /^(AAA|AA|A)$/i.test(rating) ? 'green'
            : 'amber';
  return { label: rating, cls, spread: sentinel.baseSpread != null ? sentinel.baseSpread + 'bp' : null };
}
