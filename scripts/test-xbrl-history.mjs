/**
 * Unit tests for scripts/lib/xbrl-history.mjs — the SEC-XBRL 5-year series
 * builder that feeds FinVault's horizontal analysis and forensic screens.
 *
 *   node scripts/test-xbrl-history.mjs
 *
 * Builds minimal companyfacts blobs so the assertions exercise the real
 * synonym-merge / ratio / CAGR logic, not mocks.
 */
import {
  pickSeries, buildSeries, historyData, buildHistoryMarkdown,
  normShares, US_GAAP_CONCEPTS,
} from './lib/xbrl-history.mjs';

let pass = 0, fail = 0;
const ok   = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const near = (a, b, eps = 1e-6) => a != null && Math.abs(a - b) <= eps;

// Build a us-gaap companyfacts blob from { Concept: { '2024': val, ... } }.
function facts(map) {
  const g = {};
  for (const [concept, years] of Object.entries(map)) {
    g[concept] = { units: { USD: Object.entries(years).map(([y, v]) => ({ form: '10-K', end: `${y}-12-31`, val: v })) } };
  }
  return { 'us-gaap': g };
}

// ── Synonym-merge priority (list order wins per fiscal year) ───────────────────
// revenue list = ['Revenues', …, 'SalesRevenueNet', …]. 2024 present in both →
// 'Revenues' (earlier in list) wins; 2023 only in SalesRevenueNet → it fills.
{
  const f = { 'us-gaap': {
    Revenues:        { units: { USD: [{ form: '10-K', end: '2024-12-31', val: 800 }] } },
    SalesRevenueNet: { units: { USD: [{ form: '10-K', end: '2024-12-31', val: 999 }, { form: '10-K', end: '2023-12-31', val: 700 }] } },
  }};
  const s = pickSeries(f, US_GAAP_CONCEPTS.revenue);
  const y2024 = s.find(e => e.end.startsWith('2024'));
  const y2023 = s.find(e => e.end.startsWith('2023'));
  ok(y2024 && y2024.value === 800, 'synonym priority: Revenues (800) wins 2024 over SalesRevenueNet (999)');
  ok(y2023 && y2023.value === 700, 'synonym fill: 2023 sourced from SalesRevenueNet (700)');
}

// ── Only ANNUAL forms are extracted (10-Q ignored) ────────────────────────────
{
  const f = { 'us-gaap': { Revenues: { units: { USD: [
    { form: '10-K', end: '2024-12-31', val: 1000 },
    { form: '10-Q', end: '2024-09-30', val: 250 },
  ] } } } };
  const s = pickSeries(f, ['Revenues']);
  ok(s.length === 1 && s[0].value === 1000, 'extractAnnual ignores 10-Q rows');
}

// ── EBIT fallback for filers without OperatingIncomeLoss (oil majors) ──────────
// oiEff = pretax(200) + interest(50) = 250; ebitda = 250 + da(100) = 350
// interestCoverage = 350/50 = 7; netLev = (LTD1000 - cash300)/350 = 2.0
{
  const f = facts({
    Revenues: { '2024': 1000, '2023': 900 },
    IncomeLossFromContinuingOperationsBeforeIncomeTaxes: { '2024': 200, '2023': 180 },
    InterestExpense: { '2024': 50, '2023': 45 },
    NetIncomeLoss: { '2024': 150, '2023': 120 },
    Assets: { '2024': 5000, '2023': 4500 },
    StockholdersEquity: { '2024': 2000, '2023': 1800 },
    DepreciationDepletionAndAmortization: { '2024': 100, '2023': 90 },
    LongTermDebt: { '2024': 1000, '2023': 1100 },
    CashAndCashEquivalentsAtCarryingValue: { '2024': 300, '2023': 250 },
  });
  const h = historyData(buildSeries(f));
  const last = a => a[a.length - 1];
  ok(near(last(h.summary.operatingIncome), 250), 'EBIT fallback: oiEff = pretax + interest = 250');
  ok(near(last(h.summary.ebitda), 350), 'EBITDA = oiEff + D&A = 350');
  ok(near(last(h.ratios.interestCoverage), 7), 'interest coverage = EBITDA/IE = 7');
  ok(near(last(h.ratios.netLeverage), 2.0), 'net leverage = netDebt/EBITDA = 2.0');
}

// ── CAGR sign-change guard → null (a compound rate is meaningless) ─────────────
{
  const f = facts({
    Revenues: { '2024': 1000, '2023': 900 },
    NetIncomeLoss: { '2024': 150, '2023': -50 },   // loss → profit
    Assets: { '2024': 5000, '2023': 4500 },
    StockholdersEquity: { '2024': 2000, '2023': 1800 },
  });
  const h = historyData(buildSeries(f));
  ok(h.cagr.netIncome === null, 'CAGR null when prior value ≤ 0 (sign change)');
  ok(h.cagr.revenue != null, 'CAGR computed for clean positive series');
}

// ── Guards: < 2 annual years degrades, does not crash ─────────────────────────
{
  const oneYr = facts({ Revenues: { '2024': 1000 }, NetIncomeLoss: { '2024': 150 } });
  ok(historyData(buildSeries(oneYr)) === null, 'historyData null with < 2 years');
  ok(buildHistoryMarkdown(buildSeries(oneYr)) === '', 'markdown empty with < 2 years');
}

// ── IFRS (ifrs-full) filer — 20-F populates via the appended IFRS synonyms ─────
{
  const ifrs = (map) => {
    const g = {};
    for (const [c, ys] of Object.entries(map)) g[c] = { units: { USD: Object.entries(ys).map(([y, v]) => ({ form: '20-F', end: `${y}-12-31`, val: v })) } };
    return { 'ifrs-full': g };
  };
  const f = ifrs({
    Revenue: { '2024': 2000, '2023': 1800 },
    ProfitLoss: { '2024': 300, '2023': 250 },          // → netIncome
    Assets: { '2024': 9000, '2023': 8500 },            // shared tag, namespace fallthrough
    Equity: { '2024': 4000, '2023': 3700 },
    CurrentAssets: { '2024': 3000, '2023': 2800 },
    CurrentLiabilities: { '2024': 1500, '2023': 1400 },
  });
  const h = historyData(buildSeries(f));
  const last = a => a[a.length - 1];
  ok(h !== null, 'IFRS filer: historyData built from ifrs-full namespace');
  ok(h && near(last(h.summary.revenue), 2000), 'IFRS: Revenue tag mapped');
  ok(h && near(last(h.summary.netIncome), 300), 'IFRS: ProfitLoss → netIncome');
  ok(h && near(last(h.ratios.currentRatio), 2.0), 'IFRS: current ratio from ifrs-full');
}

// ── normShares: thousands-filer heuristic ─────────────────────────────────────
ok(normShares(4_000_000) === 4_000_000_000, 'shares < 5M scaled ×1000 (reported in thousands)');
ok(normShares(8_000_000) === 8_000_000, 'shares ≥ 5M left as-is');
ok(normShares(null) === null, 'normShares passes null through');

console.log('\n' + (fail === 0 ? '✓ ALL PASS' : '✗ FAILURES') + ` — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
