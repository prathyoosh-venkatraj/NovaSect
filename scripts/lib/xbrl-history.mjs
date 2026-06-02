/**
 * xbrl-history.mjs — 5-year horizontal analysis from SEC companyfacts.
 *
 * generate-report.mjs already fetches the FULL companyfacts history and then
 * truncated it to 2 years. This module extracts a robust multi-year series per
 * concept (merging synonym tags by fiscal year) and builds a Five-Year
 * Financial Summary / Ratios / Growth-&-Trend markdown block that flows into
 * the existing DOCX table parser.
 *
 * Pure + exported so it can be unit-tested against a live companyfacts object.
 */

const ANNUAL_FORMS = ['10-K', '10-K/A', '20-F', '20-F/A'];
const UNIT_PREF = ['USD', 'EUR', 'GBP', 'NOK', 'BRL', 'shares', 'USD/shares', 'EUR/shares', 'pure'];

// US-GAAP concept synonym map (mirrors generate-report.mjs CONCEPTS). Exported
// so the live sec-proxy can extract the same series the offline pipeline uses.
export const US_GAAP_CONCEPTS = {
  revenue:            ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'RevenueFromContractWithCustomerIncludingAssessedTax', 'SalesRevenueNet', 'RegulatedAndUnregulatedOperatingRevenue', 'ElectricUtilityRevenue', 'OilAndGasRevenue'],
  operatingIncome:    ['OperatingIncomeLoss'],
  da:                 ['DepreciationDepletionAndAmortization', 'DepreciationAndAmortization', 'Depreciation'],
  interestExpense:    ['InterestExpense', 'InterestAndDebtExpense'],
  netIncome:          ['NetIncomeLoss', 'ProfitLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic'],
  epsDiluted:         ['EarningsPerShareDiluted', 'EarningsPerShareBasic'],
  longTermDebt:       ['LongTermDebt', 'LongTermDebtNoncurrent', 'LongTermDebtAndCapitalLeaseObligations'],
  shortTermDebt:      ['ShortTermBorrowings', 'DebtCurrent', 'LongTermDebtCurrent'],
  cash:               ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsAndShortTermInvestments'],
  sharesOut:          ['CommonStockSharesOutstanding', 'EntityCommonStockSharesOutstanding'],
  equity:             ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'],
  totalAssets:        ['Assets'],
  totalLiabilities:   ['Liabilities'],
  currentAssets:      ['AssetsCurrent'],
  currentLiabilities: ['LiabilitiesCurrent'],
  inventory:          ['InventoryNet', 'Inventories'],
  ocf:                ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex:              ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsForCapitalImprovements'],
  dividendsPaid:      ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock', 'PaymentsOfOrdinaryDividends'],
};

// All annual {value, end} for a single concept name, best available unit, desc by date.
export function extractAnnual(facts, name, ns = null) {
  const namespaces = ns ? [ns, 'dei'] : ['us-gaap', 'dei'];
  for (const namespace of namespaces) {
    const c = facts[namespace]?.[name];
    if (!c) continue;
    const units = [...UNIT_PREF, ...Object.keys(c.units || {})];
    for (const unit of units) {
      const entries = c.units?.[unit];
      if (!entries?.length) continue;
      const annual = entries
        .filter(e => ANNUAL_FORMS.includes(e.form) && e.end)
        .sort((a, b) => b.end.localeCompare(a.end));
      if (annual.length) return annual.map(e => ({ value: e.val, end: e.end }));
    }
  }
  return [];
}

// Merge a synonym list into one series keyed by fiscal year (priority = list
// order: the first synonym that provides a given year wins). Returns up to n
// most-recent {value, end}, desc.
export function pickSeries(facts, list, ns = null, n = 5) {
  const byYear = new Map();
  for (const name of list) {
    for (const e of extractAnnual(facts, name, ns)) {
      const yr = e.end.slice(0, 4);
      if (!byYear.has(yr)) byYear.set(yr, e);
    }
  }
  return Array.from(byYear.values())
    .sort((a, b) => b.end.localeCompare(a.end))
    .slice(0, n);
}

// ── formatting ──────────────────────────────────────────────────────────────
const fmtM = (n) => (n == null || isNaN(n))
  ? 'N/A'
  : (n < 0 ? '-' : '') + '$' + Math.round(Math.abs(n) / 1e6).toLocaleString('en-US') + 'M';
const fmtPct = (n) => (n == null || isNaN(n)) ? 'N/A' : (n * 100).toFixed(1) + '%';
const fmtX  = (n) => (n == null || isNaN(n) || !isFinite(n)) ? 'N/A' : n.toFixed(2) + 'x';
const fmtEps = (n) => (n == null || isNaN(n)) ? 'N/A' : `$${n.toFixed(2)}`;
const normShares = (v) => (v != null && v < 5_000_000) ? v * 1000 : v;

// Build concept -> Map(year -> value) from the per-concept series object `x`.
function toYearMaps(x) {
  const maps = {};
  for (const k of Object.keys(x)) {
    const m = new Map();
    for (const e of (x[k] || [])) if (e && e.end != null) m.set(e.end.slice(0, 4), e.value);
    maps[k] = m;
  }
  return maps;
}

// All derived metrics for one fiscal year.
function ratiosForYear(maps, yr) {
  const g = (k) => { const v = maps[k]?.get(yr); return (v == null || isNaN(v)) ? null : v; };
  const rev = g('revenue'), oi = g('operatingIncome'), da = g('da'), ie = g('interestExpense');
  const ni = g('netIncome'), eps = g('epsDiluted');
  const ltd = g('longTermDebt'), std = g('shortTermDebt'), cash = g('cash');
  const eq = g('equity'), ta = g('totalAssets');
  const ca = g('currentAssets'), cl = g('currentLiabilities'), inv = g('inventory');
  const ocf = g('ocf'), capex = g('capex'), div = g('dividendsPaid');

  const ebitda = (oi != null && da != null) ? oi + da : null;
  const td = (ltd ?? 0) + (std ?? 0);
  const nd = td - (cash ?? 0);
  const fcf = (ocf != null && capex != null) ? ocf - Math.abs(capex) : null;

  return {
    rev, oi, ebitda, ni, eps, fcf, div,
    td: (ltd == null && std == null) ? null : td,
    nd: (ltd == null && std == null && cash == null) ? null : nd,
    cash, eq, ta,
    om: (oi != null && rev) ? oi / rev : null,
    nm: (ni != null && rev) ? ni / rev : null,
    roa: (ni != null && ta) ? ni / ta : null,
    roe: (ni != null && eq) ? ni / Math.abs(eq) : null,
    cr: (ca && cl) ? ca / cl : null,
    qr: (ca && cl) ? (inv != null ? ca - inv : ca) / cl : null,
    de: (td && eq) ? td / Math.abs(eq) : null,
    netLev: (ebitda && ebitda > 0) ? nd / ebitda : null,
    ic: (ebitda && ie && ie > 0) ? ebitda / ie : null,
  };
}

function cagr(oldV, newV, periods) {
  if (oldV == null || newV == null || periods < 1) return null;
  if (oldV <= 0 || newV <= 0) return null; // sign change → not meaningful
  return Math.pow(newV / oldV, 1 / periods) - 1;
}

function trendArrow(oldV, newV) {
  if (oldV == null || newV == null) return '–';
  const d = newV - oldV;
  return d > 0 ? '▲ rising' : d < 0 ? '▼ falling' : '– flat';
}

/**
 * Build the Five-Year markdown block (financials, ratios, growth & trend).
 * Returns '' if fewer than 2 distinct annual years are available.
 */
export function buildHistoryMarkdown(x) {
  const maps = toYearMaps(x);
  const years = Array.from(maps.revenue?.keys?.() || maps.netIncome?.keys?.() || [])
    .sort((a, b) => Number(b) - Number(a))
    .slice(0, 5);
  if (years.length < 2) return '';

  const chrono = [...years].sort((a, b) => Number(a) - Number(b)); // oldest → newest
  const cols = chrono.map(y => `FY ${y}`);
  const R = chrono.map(y => ratiosForYear(maps, y));
  const oldest = R[0], latest = R[R.length - 1];
  const periods = chrono.length - 1;

  const L = [];
  const row = (...c) => L.push('| ' + c.join(' | ') + ' |');
  const sep = (n) => L.push('|' + Array(n).fill('---|').join(''));
  const line = (label, fn) => row(label, ...R.map(fn));

  L.push('### Five-Year Financial Summary', '');
  row('Line Item', ...cols); sep(cols.length + 1);
  line('Total Revenue',     r => fmtM(r.rev));
  line('Operating Income',  r => fmtM(r.oi));
  line('EBITDA',            r => fmtM(r.ebitda));
  line('Net Income',        r => fmtM(r.ni));
  line('EPS (Diluted)',     r => fmtEps(r.eps));
  line('Free Cash Flow',    r => fmtM(r.fcf));
  line('Total Debt',        r => fmtM(r.td));
  line('Net Debt',          r => fmtM(r.nd));
  line('Total Equity',      r => fmtM(r.eq));
  L.push('');

  L.push('### Five-Year Ratios & Margins', '');
  row('Metric', ...cols); sep(cols.length + 1);
  line('Operating Margin',          r => fmtPct(r.om));
  line('Net Profit Margin',         r => fmtPct(r.nm));
  line('Return on Equity (ROE)',    r => fmtPct(r.roe));
  line('Return on Assets (ROA)',    r => fmtPct(r.roa));
  line('Current Ratio',             r => fmtX(r.cr));
  line('Net Leverage (ND/EBITDA)',  r => fmtX(r.netLev));
  line('Interest Coverage',         r => fmtX(r.ic));
  L.push('');

  const pp = (oldV, newV) => (oldV == null || newV == null) ? 'N/A'
    : ((newV - oldV) >= 0 ? '+' : '') + ((newV - oldV) * 100).toFixed(1) + ' pp';

  L.push('### Five-Year Growth & Trend', '');
  row('Measure', `${periods}-Yr CAGR / Δ`, 'Trend'); sep(3);
  const cg = (label, key) => {
    const c = cagr(oldest[key], latest[key], periods);
    row(label, c == null ? 'n/m' : fmtPct(c), trendArrow(oldest[key], latest[key]));
  };
  cg('Revenue CAGR',        'rev');
  cg('Net Income CAGR',     'ni');
  cg('EPS CAGR',            'eps');
  cg('Free Cash Flow CAGR', 'fcf');
  cg('Dividends Paid CAGR', 'div');
  cg('Book Value CAGR',     'eq');
  row('Operating Margin Δ', pp(oldest.om, latest.om), trendArrow(oldest.om, latest.om));
  row('Net Leverage Δ',     oldest.netLev == null || latest.netLev == null ? 'N/A'
        : ((latest.netLev - oldest.netLev) >= 0 ? '+' : '') + (latest.netLev - oldest.netLev).toFixed(2) + 'x',
        trendArrow(oldest.netLev, latest.netLev));
  L.push('');
  L.push(`*Horizontal analysis across ${cols[0]}–${cols[cols.length - 1]} from SEC EDGAR XBRL annual filings. ` +
         `CAGR shown as "n/m" where a sign change makes a compound rate meaningless.*`, '');

  return L.join('\n');
}

// Extract the per-concept series object `x` directly from a companyfacts blob.
export function buildSeries(facts, conceptMap = US_GAAP_CONCEPTS, ns = null, n = 5) {
  const x = {};
  for (const [k, list] of Object.entries(conceptMap)) x[k] = pickSeries(facts, list, ns, n);
  return x;
}

// Structured 5-year data for client charting (compact; raw numbers, client
// formats). Returns null when fewer than 2 annual years are available.
export function historyData(x) {
  const maps = toYearMaps(x);
  const yearsDesc = Array.from(maps.revenue?.keys?.() || maps.netIncome?.keys?.() || [])
    .sort((a, b) => Number(b) - Number(a)).slice(0, 5);
  if (yearsDesc.length < 2) return null;

  const chrono = [...yearsDesc].sort((a, b) => Number(a) - Number(b));
  const R = chrono.map(y => ratiosForYear(maps, y));
  const pick = k => R.map(r => (r[k] == null || isNaN(r[k]) ? null : r[k]));
  const oldest = R[0], latest = R[R.length - 1], periods = chrono.length - 1;

  return {
    years: chrono.map(y => 'FY ' + y),
    summary: {
      revenue:         pick('rev'),
      operatingIncome: pick('oi'),
      ebitda:          pick('ebitda'),
      netIncome:       pick('ni'),
      eps:             pick('eps'),
      freeCashFlow:    pick('fcf'),
      totalDebt:       pick('td'),
      netDebt:         pick('nd'),
      equity:          pick('eq'),
    },
    ratios: {
      operatingMargin:  pick('om'),
      netMargin:        pick('nm'),
      roe:              pick('roe'),
      roa:              pick('roa'),
      currentRatio:     pick('cr'),
      netLeverage:      pick('netLev'),
      interestCoverage: pick('ic'),
    },
    cagr: {
      revenue:   cagr(oldest.rev, latest.rev, periods),
      netIncome: cagr(oldest.ni,  latest.ni,  periods),
      eps:       cagr(oldest.eps, latest.eps, periods),
      fcf:       cagr(oldest.fcf, latest.fcf, periods),
      dividends: cagr(oldest.div, latest.div, periods),
      bookValue: cagr(oldest.eq,  latest.eq,  periods),
    },
  };
}

export { normShares };
