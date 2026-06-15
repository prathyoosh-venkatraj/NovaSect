/**
 * Unit tests for scripts/lib/forensic-scores.mjs
 * Expected values are hand-computed in the test comments so the assertions are
 * an independent check of the formulas, not a tautology.
 *   node scripts/test-forensic-scores.mjs
 */
import { forensicScores } from './lib/forensic-scores.mjs';

let pass = 0, fail = 0;
const ok   = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const near = (a, b, eps = 0.01) => a != null && Math.abs(a - b) <= eps;

// Build buildSeries-shaped object from { '2024': {concept:val}, '2023': {...} }.
function series(fix) {
  const x = {};
  for (const [y, row] of Object.entries(fix))
    for (const [k, v] of Object.entries(row)) (x[k] ||= []).push({ end: y + '-12-31', value: v });
  return x;
}

// ── Fixture firm (2 annual years) ────────────────────────────────────────────
const FIX = {
  '2024': {
    totalAssets: 1000, currentAssets: 400, currentLiabilities: 200, retainedEarnings: 300,
    operatingIncome: 150, totalLiabilities: 500, equity: 500, revenue: 800, netIncome: 100,
    ocf: 180, longTermDebt: 300, receivables: 120, ppeNet: 500, cogs: 560, da: 50, sga: 80, sharesOut: 1000,
  },
  '2023': {
    totalAssets: 900, currentAssets: 360, currentLiabilities: 180, retainedEarnings: 250,
    operatingIncome: 120, totalLiabilities: 480, equity: 420, revenue: 700, netIncome: 80,
    ocf: 150, longTermDebt: 320, receivables: 100, ppeNet: 460, cogs: 504, da: 45, sga: 70, sharesOut: 1000,
  },
};
const X = series(FIX);

// ── Altman Z'' (Energy → non-manufacturer) ───────────────────────────────────
// X1=0.20 X2=0.30 X3=0.15 X4=BVE/TL=1.00 → 6.56·.2+3.26·.3+6.72·.15+1.05·1 = 4.348 → Safe
{
  const r = forensicScores(X, { sector: 'Energy' });
  const a = r.altman;
  ok(a.model.includes("Z''"), "Energy uses Z'' model");
  ok(near(a.components.X1, 0.20) && near(a.components.X2, 0.30) && near(a.components.X3, 0.15) && near(a.components.X4, 1.00), "Z'' components correct");
  ok(near(a.score, 4.348), "Z'' score ≈ 4.348 (got " + a.score?.toFixed(3) + ')');
  ok(a.band === 'Safe', "Z'' band = Safe");
  ok(a.components.X5 === null, "Z'' has no X5 (sales/TA term dropped)");
}

// ── Altman original Z (Industrials, with market cap) ──────────────────────────
// X4=MVE/TL=900/500=1.8  X5=Sales/TA=0.8 → 1.2·.2+1.4·.3+3.3·.15+0.6·1.8+1·0.8 = 3.035 → Safe
{
  const r = forensicScores(X, { sector: 'Industrials', marketCap: 900 });
  const a = r.altman;
  ok(a.model.toLowerCase().includes('original'), 'Industrials uses original Z model');
  ok(near(a.components.X4, 1.80) && near(a.components.X5, 0.80), 'original-Z X4/X5 correct');
  ok(near(a.score, 3.035), 'original Z ≈ 3.035 (got ' + a.score?.toFixed(3) + ')');
  ok(a.band === 'Safe', 'original Z band = Safe');
}
// Industrials without market cap → falls back to book equity + note
{
  const a = forensicScores(X, { sector: 'Industrials' }).altman;
  ok(a.note && /book equity/i.test(a.note), 'industrials w/o mktCap notes book-equity fallback');
}

// ── Piotroski F ───────────────────────────────────────────────────────────────
// 8/9: all pass except currentRatioUp (2.0 vs 2.0, not strictly greater)
{
  const f = forensicScores(X, { sector: 'Energy' }).piotroski;
  ok(f.score === 8, 'Piotroski F = 8 (got ' + f.score + ')');
  ok(f.band === 'Strong', 'Piotroski band = Strong');
  ok(f.signals.currentRatioUp === false, 'currentRatioUp correctly false (2.0 vs 2.0)');
  ok(f.signals.roaImproving === true && f.signals.leverageDown === true && f.signals.grossMarginUp === true, 'key improving signals true');
}

// ── Beneish M ─────────────────────────────────────────────────────────────────
// Hand sum ≈ −2.647 → below −1.78 → Unlikely
{
  const b = forensicScores(X, { sector: 'Energy' }).beneish;
  ok(near(b.score, -2.647, 0.01), 'Beneish M ≈ −2.647 (got ' + b.score?.toFixed(3) + ')');
  ok(b.flag === 'Unlikely', 'Beneish flag = Unlikely');
  ok(near(b.indices.DSRI, 1.05) && near(b.indices.TATA, -0.08), 'Beneish DSRI/TATA components correct');
}

// ── Graceful degradation (only one year) ─────────────────────────────────────
{
  const oneYear = series({ '2024': FIX['2024'] });
  const r = forensicScores(oneYear, { sector: 'Energy' });
  ok(r.altman.available === true, 'Altman works with a single year');
  ok(r.beneish.available === false, 'Beneish needs two years → unavailable');
  ok(r.piotroski.available === false, 'Piotroski needs two years → unavailable');
}

// ── Missing inputs (no retained earnings) → Altman degrades, not crashes ──────
{
  const noRE = JSON.parse(JSON.stringify(FIX));
  delete noRE['2024'].retainedEarnings; delete noRE['2023'].retainedEarnings;
  const a = forensicScores(series(noRE), { sector: 'Energy' }).altman;
  ok(a.available === false, 'missing retained earnings → Altman unavailable (no wrong number)');
}

console.log('\n' + (fail === 0 ? '✓ ALL PASS' : '✗ FAILURES') + ` — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
