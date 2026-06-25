/**
 * Unit tests for Website/backtest/engine/simulate.mjs — the Node port of the
 * Osiris stochastic worker (identical math to components/osiris/stochasticWorker.js).
 *
 *   node scripts/test-osiris-sim.mjs
 *
 * Mixes deterministic checks (zero-vol paths are exact) with statistical
 * property checks at high path counts and generous tolerances, so the suite is
 * robust to the unseeded RNG.
 */
import { simulateOU, simulateGBMJump } from '../../backtest/engine/simulate.mjs';

let pass = 0, fail = 0;
const ok   = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const near = (a, b, eps) => a != null && Math.abs(a - b) <= eps;

const STEPS = 253;                     // 252 increments ≈ 1 trading year (dt = 1/252)
const term  = (res, p) => res.percentiles[p][res.percentiles[p].length - 1];
const PCTS  = ['p05', 'p10', 'p25', 'p45', 'p50', 'p55', 'p75', 'p90', 'p95'];

function monotonic(res) {
  for (let i = 1; i < PCTS.length; i++) if (term(res, PCTS[i]) < term(res, PCTS[i - 1]) - 1e-4) return false;
  return true;
}
function allFinite(res) {
  return PCTS.every(p => { const a = res.percentiles[p]; return a.every(v => Number.isFinite(v)); });
}

// ── Percentile ordering & basic invariants (GBM+jump) ─────────────────────────
{
  const r = simulateGBMJump(100, 0.05, 0.20, STEPS, 20000, 4, 0, false);
  ok(monotonic(r), 'GBM: terminal percentiles are monotonically ordered p05…p95');
  ok(r.pAboveSpot >= 0 && r.pAboveSpot <= 1, 'GBM: pAboveSpot ∈ [0,1]');
  ok(allFinite(r), 'GBM: no NaN/Inf in any percentile path');
}

// ── Zero-vol determinism: terminal = S0·e^(μ·T), all percentiles equal ─────────
// μ=0.10, T=1 → 100·e^0.10 = 110.517. (Float32 path storage → small tolerance.)
{
  const r = simulateGBMJump(100, 0.10, 0, STEPS, 64, 4, 0, false);
  ok(near(term(r, 'p05'), 110.517, 0.3) && near(term(r, 'p95'), 110.517, 0.3), 'GBM zero-vol: terminal ≈ 110.52');
  ok(near(term(r, 'p05'), term(r, 'p95'), 0.05), 'GBM zero-vol: all paths identical (p05 == p95)');
}
{
  const r = simulateOU(100, 0, 0, STEPS, 64, 2, 120, false);   // sigma=0 → deterministic reversion
  ok(near(term(r, 'p05'), term(r, 'p95'), 0.2), 'OU zero-vol: all paths identical');
  ok(term(r, 'p50') > 110 && term(r, 'p50') < 122, 'OU zero-vol: reverts toward longTermMean 120');
}

// ── GBM drift direction: median & pAboveSpot move with μ ───────────────────────
{
  const up = simulateGBMJump(100, 0.30, 0.15, STEPS, 20000, 4, 0, false);
  const dn = simulateGBMJump(100, -0.30, 0.15, STEPS, 20000, 4, 0, false);
  ok(term(up, 'p50') > 100, 'GBM strong +drift: median terminal > spot');
  ok(up.pAboveSpot > 0.5, 'GBM strong +drift: pAboveSpot > 0.5');
  ok(term(dn, 'p50') < 100, 'GBM strong −drift: median terminal < spot');
  ok(dn.pAboveSpot < 0.5, 'GBM strong −drift: pAboveSpot < 0.5');
}

// ── OU mean reversion both directions ─────────────────────────────────────────
// Deterministic part S(1) = μ + (S0−μ)·e^(−θ) ; θ=2 → e^-2 = 0.1353.
{
  const upTo120 = simulateOU(100, 0, 0.15, STEPS, 20000, 2, 120, false);   // → ~117.3
  ok(term(upTo120, 'p50') > 108 && term(upTo120, 'p50') < 124, 'OU: reverts up toward 120 (median ~117)');
  const dnTo80 = simulateOU(100, 0, 0.15, STEPS, 20000, 2, 80, false);     // → ~82.7
  ok(term(dnTo80, 'p50') < 92 && term(dnTo80, 'p50') > 74, 'OU: reverts down toward 80 (median ~83)');
}

// ── Antithetic mode still valid; GARCH stays stable ───────────────────────────
{
  const a = simulateGBMJump(100, 0.05, 0.25, STEPS, 20000, 4, 0, true);
  ok(monotonic(a) && allFinite(a) && a.pAboveSpot >= 0 && a.pAboveSpot <= 1, 'antithetic GBM: valid, finite, ordered');
  const g = simulateGBMJump(100, 0.05, 0.60, STEPS, 8000, 6, 0, false, 0.12, 0.86);  // high vol + persistent GARCH
  ok(allFinite(g), 'high-vol persistent GARCH: no NaN/Inf blow-up');
}

console.log('\n' + (fail === 0 ? '✓ ALL PASS' : '✗ FAILURES') + ` — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
