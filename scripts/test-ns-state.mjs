/**
 * Unit tests for scripts/lib/ns-state-core.mjs — the pure client-state helpers
 * behind the watchlist, recents, scenario lab, and change-detection dots.
 *
 *   node scripts/test-ns-state.mjs
 */
import {
  toggleInList, pushRecent, encodeState, decodeState,
  diffSnapshots, normalizeScenario, tierFromSentinel,
} from './lib/ns-state-core.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ── toggleInList ──────────────────────────────────────────────────────────────
ok(eq(toggleInList([], 'XOM'), ['XOM']), 'toggle adds to empty list');
ok(eq(toggleInList(['XOM'], 'XOM'), []), 'toggle removes when present');
ok(eq(toggleInList(['A'], 'B'), ['A', 'B']), 'toggle appends a new item');
ok(eq(toggleInList(null, 'X'), ['X']), 'toggle is null-safe');

// ── pushRecent ────────────────────────────────────────────────────────────────
ok(eq(pushRecent(['B', 'C'], 'A'), ['A', 'B', 'C']), 'recent: most-recent first');
ok(eq(pushRecent(['A', 'B'], 'A'), ['A', 'B']), 'recent: de-dupes, promotes to front');
ok(pushRecent(['A', 'B', 'C', 'D', 'E', 'F'], 'G').length === 6, 'recent: capped at max (6)');
ok(eq(pushRecent(['A', 'B', 'C'], 'X', 2), ['X', 'A']), 'recent: respects custom cap');

// ── encode / decode round-trip (JSON layer; base64 done in the runtime) ───────
{
  const obj = { rateBps: 200, vix: 32 };
  ok(eq(decodeState(encodeState(obj)), obj), 'encode→decode round-trips');
  ok(decodeState('not json') === null, 'decode bad JSON → null');
  ok(decodeState('') === null && decodeState(null) === null, 'decode empty/null → null');
  // base64 layer (what the browser does with btoa/atob) round-trips via Buffer.
  const b64 = Buffer.from(encodeState(obj)).toString('base64');
  ok(eq(decodeState(Buffer.from(b64, 'base64').toString()), obj), 'base64 wrap round-trips');
}

// ── diffSnapshots ─────────────────────────────────────────────────────────────
ok(eq(diffSnapshots({ spreadBps: 100 }, { spreadBps: 120 }), ['spread widened']), 'detects spread widening (+20%)');
ok(eq(diffSnapshots({ spreadBps: 100 }, { spreadBps: 80 }), ['spread tightened']), 'detects spread tightening');
ok(eq(diffSnapshots({ spreadBps: 100 }, { spreadBps: 102 }), []), 'ignores noise within ±5%');
ok(eq(diffSnapshots({ tier: 'NOMINAL' }, { tier: 'CRITICAL' }), ['tier NOMINAL→CRITICAL']), 'detects tier change');
ok(eq(diffSnapshots({ altmanBand: 'Grey' }, { altmanBand: 'Distress' }), ['Altman Grey→Distress']), 'detects Altman band change');
ok(eq(diffSnapshots(null, { spreadBps: 100 }), []), 'no prior snapshot → no change');
{
  const reasons = diffSnapshots({ spreadBps: 100, tier: 'A' }, { spreadBps: 130, tier: 'B' });
  ok(reasons.length === 2, 'reports multiple simultaneous changes');
}

// ── normalizeScenario ─────────────────────────────────────────────────────────
ok(normalizeScenario(null) === null, 'null scenario → null (baseline)');
ok(normalizeScenario({ rateBps: 0, vix: 0 }) === null, 'all-zero scenario → null (baseline)');
{
  const s = normalizeScenario({ rateBps: 200, vix: 'x', junk: 9 });
  ok(s.rateBps === 200 && s.vix === 0 && !('junk' in s), 'coerces NaN→0, drops unknown keys');
}

// ── tierFromSentinel ──────────────────────────────────────────────────────────
ok(tierFromSentinel({ type: 'IG', rating: 'AA', baseSpread: 125 }).cls === 'green', 'IG AA → green');
ok(tierFromSentinel({ type: 'IG', rating: 'BBB', baseSpread: 300 }).cls === 'amber', 'IG BBB → amber');
ok(tierFromSentinel({ type: 'HY', rating: 'BB', baseSpread: 450 }).cls === 'red', 'HY → red');
ok(tierFromSentinel(null).cls === 'neutral', 'missing sentinel → neutral');
ok(tierFromSentinel({ type: 'IG', rating: 'AA', baseSpread: 125 }).spread === '125bp', 'spread label formatted');

console.log('\n' + (fail === 0 ? '✓ ALL PASS' : '✗ FAILURES') + ` — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
