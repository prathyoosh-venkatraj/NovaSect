/**
 * _xbrl-history.js — server-only XBRL 5-year extraction for the sec-proxy.
 *
 * Same-directory copy of the extraction logic in scripts/lib/xbrl-history.mjs,
 * placed under api/ (underscore = not a route) so Vercel reliably bundles it
 * into the function. Cross-directory imports into ../scripts were not bundled.
 * Keep in sync with scripts/lib/xbrl-history.mjs (offline pipeline copy).
 */

const ANNUAL_FORMS = ['10-K', '10-K/A', '20-F', '20-F/A'];
const UNIT_PREF = ['USD', 'EUR', 'GBP', 'NOK', 'BRL', 'shares', 'USD/shares', 'EUR/shares', 'pure'];

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
  retainedEarnings:   ['RetainedEarningsAccumulatedDeficit'],
  receivables:        ['AccountsReceivableNetCurrent', 'ReceivablesNetCurrent', 'AccountsAndOtherReceivablesNetCurrent'],
  ppeNet:             ['PropertyPlantAndEquipmentNet'],
  cogs:               ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'],
  grossProfit:        ['GrossProfit'],
  sga:                ['SellingGeneralAndAdministrativeExpense', 'SellingGeneralAndAdministrativeExpenses', 'GeneralAndAdministrativeExpense'],
  ocf:                ['NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations'],
  capex:              ['PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsForCapitalImprovements'],
  dividendsPaid:      ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock', 'PaymentsOfOrdinaryDividends'],
  pretaxIncome:       ['IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments', 'IncomeLossFromContinuingOperationsBeforeIncomeTaxes'],
};

function extractAnnual(facts, name, ns = null) {
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

export function buildSeries(facts, conceptMap = US_GAAP_CONCEPTS, ns = null, n = 5) {
  const x = {};
  for (const [k, list] of Object.entries(conceptMap)) x[k] = pickSeries(facts, list, ns, n);
  return x;
}

function toYearMaps(x) {
  const maps = {};
  for (const k of Object.keys(x)) {
    const m = new Map();
    for (const e of (x[k] || [])) if (e && e.end != null) m.set(e.end.slice(0, 4), e.value);
    maps[k] = m;
  }
  return maps;
}

function ratiosForYear(maps, yr) {
  const g = (k) => { const v = maps[k]?.get(yr); return (v == null || isNaN(v)) ? null : v; };
  const rev = g('revenue'), oi = g('operatingIncome'), da = g('da'), ie = g('interestExpense');
  const ni = g('netIncome'), eps = g('epsDiluted');
  const ltd = g('longTermDebt'), std = g('shortTermDebt'), cash = g('cash');
  const eq = g('equity'), ta = g('totalAssets');
  const ca = g('currentAssets'), cl = g('currentLiabilities'), inv = g('inventory');
  const ocf = g('ocf'), capex = g('capex');
  const div = g('dividendsPaid');
  const pti = g('pretaxIncome');
  // EBIT proxy when a filer doesn't tag OperatingIncomeLoss (e.g. oil majors):
  // pretax income + interest expense.
  const oiEff = (oi != null) ? oi : (pti != null ? pti + (ie || 0) : null);

  const ebitda = (oiEff != null && da != null) ? oiEff + da : null;
  const td = (ltd ?? 0) + (std ?? 0);
  const nd = td - (cash ?? 0);
  const fcf = (ocf != null && capex != null) ? ocf - Math.abs(capex) : null;

  return {
    rev, oi: oiEff, ebitda, ni, eps, fcf, div, ie, sharesOut: g('sharesOut'),
    td: (ltd == null && std == null) ? null : td,
    nd: (ltd == null && std == null && cash == null) ? null : nd,
    cash, eq, ta,
    om: (oiEff != null && rev) ? oiEff / rev : null,
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
  if (oldV <= 0 || newV <= 0) return null;
  return Math.pow(newV / oldV, 1 / periods) - 1;
}

// Build the same 5Y history shape from Yahoo quoteSummary statement-history
// modules (fallback for non-US filers with no SEC XBRL). Yahoo provides ~4
// annual years; operatingIncome is often absent for foreign filers (operating
// margin then shows as a gap), but revenue/net income/equity/cash-flow do
// populate → net margin, ROE, and CAGRs render.
export function historyFromYahoo(income = [], balance = [], cashflow = []) {
  const keys = ['revenue', 'operatingIncome', 'netIncome', 'equity', 'totalAssets',
    'currentAssets', 'currentLiabilities', 'cash', 'longTermDebt', 'shortTermDebt',
    'inventory', 'ocf', 'capex', 'dividendsPaid', 'da', 'interestExpense', 'epsDiluted'];
  const x = {};
  for (const k of keys) x[k] = [];
  const num = (o) => (o && typeof o === 'object' && typeof o.raw === 'number') ? o.raw : null;
  const endOf = (s) => s?.endDate?.fmt
    || (typeof s?.endDate?.raw === 'number' ? new Date(s.endDate.raw * 1000).toISOString().slice(0, 10) : null);
  const push = (arr, val, end) => { if (val != null && !isNaN(val) && end) arr.push({ value: val, end }); };

  for (const s of income) {
    const e = endOf(s);
    push(x.revenue, num(s.totalRevenue), e);
    push(x.operatingIncome, num(s.operatingIncome), e);
    push(x.netIncome, num(s.netIncome), e);
    push(x.interestExpense, num(s.interestExpense), e);
  }
  for (const s of balance) {
    const e = endOf(s);
    const eqRaw = num(s.totalStockholderEquity);
    const ta = num(s.totalAssets);
    const tl = num(s.totalLiab);
    // Foreign filers often omit totalStockholderEquity → derive from A − L.
    push(x.equity, eqRaw != null ? eqRaw : (ta != null && tl != null ? ta - tl : null), e);
    push(x.totalAssets, ta, e);
    push(x.currentAssets, num(s.totalCurrentAssets), e);
    push(x.currentLiabilities, num(s.totalCurrentLiabilities), e);
    push(x.cash, num(s.cash), e);
    push(x.longTermDebt, num(s.longTermDebt), e);
    push(x.shortTermDebt, num(s.shortLongTermDebt), e);
    push(x.inventory, num(s.inventory), e);
  }
  for (const s of cashflow) {
    const e = endOf(s);
    push(x.ocf, num(s.totalCashFromOperatingActivities), e);
    push(x.capex, num(s.capitalExpenditures), e);
    const d = num(s.dividendsPaid);
    push(x.dividendsPaid, d != null ? Math.abs(d) : null, e); // report as positive payment
  }
  return historyData(x);
}

export function historyData(x) {
  const maps = toYearMaps(x);
  const yearsDesc = Array.from(maps.revenue?.keys?.() || maps.netIncome?.keys?.() || [])
    .sort((a, b) => Number(b) - Number(a)).slice(0, 5);
  if (yearsDesc.length < 2) return null;

  // Full fiscal-year-end date per year (for aligning prices → valuation bands).
  const endByYear = new Map();
  for (const k of Object.keys(x)) for (const e of (x[k] || [])) {
    if (e && e.end) { const y = e.end.slice(0, 4); if (!endByYear.has(y)) endByYear.set(y, e.end); }
  }

  const chrono = [...yearsDesc].sort((a, b) => Number(a) - Number(b));
  const R = chrono.map(y => ratiosForYear(maps, y));
  const pick = k => R.map(r => (r[k] == null || isNaN(r[k]) ? null : r[k]));
  const oldest = R[0], latest = R[R.length - 1], periods = chrono.length - 1;

  return {
    years: chrono.map(y => 'FY ' + y),
    endDates: chrono.map(y => endByYear.get(y) || (y + '-12-31')),
    summary: {
      revenue: pick('rev'), operatingIncome: pick('oi'), ebitda: pick('ebitda'),
      netIncome: pick('ni'), eps: pick('eps'), freeCashFlow: pick('fcf'),
      totalDebt: pick('td'), netDebt: pick('nd'), equity: pick('eq'),
      totalAssets: pick('ta'), cash: pick('cash'), interestExpense: pick('ie'),
      dividendsPaid: pick('div'), sharesOutstanding: pick('sharesOut'),
    },
    ratios: {
      operatingMargin: pick('om'), netMargin: pick('nm'), roe: pick('roe'),
      roa: pick('roa'), currentRatio: pick('cr'), quickRatio: pick('qr'),
      debtToEquity: pick('de'), netLeverage: pick('netLev'),
      interestCoverage: pick('ic'),
    },
    cagr: {
      revenue: cagr(oldest.rev, latest.rev, periods),
      netIncome: cagr(oldest.ni, latest.ni, periods),
      eps: cagr(oldest.eps, latest.eps, periods),
      fcf: cagr(oldest.fcf, latest.fcf, periods),
      dividends: cagr(oldest.div, latest.div, periods),
      bookValue: cagr(oldest.eq, latest.eq, periods),
    },
  };
}
