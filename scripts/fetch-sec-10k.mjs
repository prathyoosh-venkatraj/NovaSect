/**
 * fetch-sec-10k.mjs
 *
 * Standalone SEC EDGAR XBRL data fetcher for NovaSect-covered US tickers.
 * Outputs only to scripts/sec-output/ — does NOT touch any website source files.
 *
 * Usage:  node scripts/fetch-sec-10k.mjs
 * Output: scripts/sec-output/summary.json
 *         scripts/sec-output/raw/{ticker}.json
 *         scripts/sec-output/report.md
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// ─── Config ──────────────────────────────────────────────────────────────────

const USER_AGENT = 'NovaSect novasect.space@proton.me';
const RATE_LIMIT_MS = 110; // SEC allows ~10 req/s; 110ms keeps us under
const BASE_WWW  = 'https://www.sec.gov';   // company_tickers.json
const BASE_DATA = 'https://data.sec.gov';  // XBRL companyfacts API

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR   = join(__dirname, 'sec-output');
const RAW_DIR   = join(OUT_DIR, 'raw');

// ─── Tickers ─────────────────────────────────────────────────────────────────

const TICKERS = [
  // Energy — Integrated / Majors
  'XOM', 'CVX', 'COP', 'EOG', 'OXY',
  // Energy — Midstream
  'WMB', 'KMI',
  // Energy — Refining
  'MPC', 'VLO', 'PSX',
  // Energy — Services
  'SLB', 'HAL', 'BKR',
  // Utilities — Electric
  'NEE', 'DUK', 'SO', 'D', 'AEP', 'EXC', 'SRE', 'XEL', 'PCG', 'PEG', 'WEC',
  // Utilities — Water
  'AWK',
  // Industrials — Defense
  'LMT', 'GD', 'LHX', 'NOC', 'RTX',
  // Industrials — Diversified / Conglomerates
  'GE', 'HON', 'MMM',
  // Industrials — Transport / Logistics
  'UPS', 'UNP', 'LUV', 'DAL',
  // Industrials — Machinery / Equipment
  'CAT', 'DE',
  // Industrials — Aerospace
  'BA',
];

// ─── XBRL concept priority lists ─────────────────────────────────────────────
// Each list is tried in order; first non-null annual value wins.

const CONCEPTS = {
  revenue: [
    'Revenues',
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'SalesRevenueNet',
    'SalesRevenueGoodsNet',
    'RegulatedAndUnregulatedOperatingRevenue',
    'ElectricUtilityRevenue',
    'OilAndGasRevenue',
    'RevenuesNetOfInterestExpense',
  ],
  operatingIncome: [
    'OperatingIncomeLoss',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
  ],
  da: [
    'DepreciationDepletionAndAmortization',
    'DepreciationAndAmortization',
    'Depreciation',
  ],
  interestExpense: [
    'InterestExpense',
    'InterestAndDebtExpense',
    'FinanceLeaseInterestExpense',
  ],
  netIncome: [
    'NetIncomeLoss',
    'NetIncomeLossAvailableToCommonStockholdersBasic',
    'ProfitLoss',
  ],
  epsDiluted: [
    'EarningsPerShareDiluted',
    'EarningsPerShareBasic',
  ],
  longTermDebt: [
    'LongTermDebt',
    'LongTermDebtNoncurrent',
    'LongTermNotesPayable',
    'LongTermDebtAndCapitalLeaseObligations',
  ],
  shortTermDebt: [
    'ShortTermBorrowings',
    'DebtCurrent',
    'LongTermDebtCurrent',
    'ShortTermNotesPayable',
  ],
  cash: [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsAndShortTermInvestments',
    'CashAndShortTermInvestments',
  ],
  sharesOutstanding: [
    'CommonStockSharesOutstanding',
    'EntityCommonStockSharesOutstanding',
  ],
  equity: [
    'StockholdersEquity',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    'LiabilitiesAndStockholdersEquity',
  ],
  operatingCashFlow: [
    'NetCashProvidedByUsedInOperatingActivities',
    'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
  ],
  capex: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'CapitalExpenditureDiscontinuedOperations',
    'PaymentsForProceedsFromProductiveAssets',
  ],
  dividendsPaid: [
    'PaymentsOfDividends',
    'PaymentsOfDividendsCommonStock',
    'PaymentsOfOrdinaryDividends',
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJSON(url) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function fmt(n, decimals = 2) {
  if (n == null || isNaN(n)) return 'N/A';
  return n.toFixed(decimals);
}

function fmtBn(n) {
  if (n == null || isNaN(n)) return 'N/A';
  return `$${(n / 1e9).toFixed(2)}B`;
}

function fmtPct(n) {
  if (n == null || isNaN(n)) return 'N/A';
  return `${(n * 100).toFixed(1)}%`;
}

// ─── CIK lookup ──────────────────────────────────────────────────────────────

let _tickerMap = null;

async function getCIK(ticker) {
  if (!_tickerMap) {
    console.log('  [EDGAR] Fetching ticker→CIK map...');
    const data = await fetchJSON(`${BASE_WWW}/files/company_tickers.json`);
    await sleep(RATE_LIMIT_MS);
    _tickerMap = {};
    for (const entry of Object.values(data)) {
      _tickerMap[entry.ticker.toUpperCase()] = String(entry.cik_str).padStart(10, '0');
    }
  }
  const cik = _tickerMap[ticker.toUpperCase()];
  if (!cik) throw new Error(`CIK not found for ${ticker}`);
  return cik;
}

// ─── XBRL fact extraction ────────────────────────────────────────────────────

/**
 * From the XBRL companyfacts blob, extract the most recent annual (10-K) value
 * for a given concept name (trying both us-gaap and dei namespaces).
 */
function extractLatestAnnual(facts, conceptName) {
  for (const ns of ['us-gaap', 'dei']) {
    const concept = facts[ns]?.[conceptName];
    if (!concept) continue;

    // Prefer USD unit; fall back to shares, pure
    for (const unit of ['USD', 'shares', 'USD/shares', 'pure']) {
      const entries = concept.units?.[unit];
      if (!entries || entries.length === 0) continue;

      // Filter to 10-K filings (annual), prefer most recent end date
      const annual = entries
        .filter((e) => e.form === '10-K' && e.end)
        .sort((a, b) => b.end.localeCompare(a.end));

      if (annual.length > 0) return { value: annual[0].val, unit, end: annual[0].end };
    }
  }
  return null;
}

// Collect candidates from ALL concepts in the list and return whichever
// has the most recent end date — avoids returning a 2010 value when a
// company switched to a different XBRL concept name in 2018.
function pickConcept(facts, conceptList) {
  let best = null;
  for (const name of conceptList) {
    const candidate = extractLatestAnnual(facts, name);
    if (candidate === null) continue;
    if (best === null || candidate.end > best.end) best = candidate;
  }
  return best;
}

// Some companies report shares in thousands rather than individual units.
// Heuristic: if value < 5_000_000 (5M) it was almost certainly filed in
// thousands — scale up by 1000. All real share counts for large-caps are >100M.
function normaliseShares(raw) {
  if (raw === null) return null;
  const v = raw.value;
  return v < 5_000_000 ? v * 1000 : v;
}

// ─── Per-ticker fetch ─────────────────────────────────────────────────────────

async function fetchTicker(ticker) {
  const cik = await getCIK(ticker);
  await sleep(RATE_LIMIT_MS);

  const factsUrl = `${BASE_DATA}/api/xbrl/companyfacts/CIK${cik}.json`;
  const data = await fetchJSON(factsUrl);
  await sleep(RATE_LIMIT_MS);

  const facts = data.facts ?? {};
  const raw = {};

  for (const [key, conceptList] of Object.entries(CONCEPTS)) {
    raw[key] = pickConcept(facts, conceptList);
  }

  return { ticker, cik, raw };
}

// ─── Derived metrics ─────────────────────────────────────────────────────────

function derive(raw) {
  const get = (key) => raw[key]?.value ?? null;

  const revenue          = get('revenue');
  const operatingIncome  = get('operatingIncome');
  const da               = get('da');
  const interestExpense  = get('interestExpense');
  const netIncome        = get('netIncome');
  const epsDiluted       = get('epsDiluted');
  const longTermDebt     = get('longTermDebt');
  const shortTermDebt    = get('shortTermDebt');
  const cash             = get('cash');
  const sharesOut        = normaliseShares(raw['sharesOutstanding']);
  const equity           = get('equity');
  const ocf              = get('operatingCashFlow');
  const capex            = get('capex');
  const dividendsPaid    = get('dividendsPaid');

  const totalDebt   = (longTermDebt ?? 0) + (shortTermDebt ?? 0);
  const netDebt     = totalDebt - (cash ?? 0);
  const ebitda      = operatingIncome != null && da != null ? operatingIncome + da : null;

  const netLeverage      = ebitda != null && ebitda > 0 ? netDebt / ebitda : null;
  const interestCoverage = ebitda != null && interestExpense != null && interestExpense > 0
    ? ebitda / interestExpense : null;

  const fcf           = ocf != null && capex != null ? ocf - Math.abs(capex) : null;
  const fcfPerShare   = fcf != null && sharesOut != null && sharesOut > 0 ? fcf / sharesOut : null;
  const bookValuePS   = equity != null && sharesOut != null && sharesOut > 0 ? equity / sharesOut : null;
  const dividendPS    = dividendsPaid != null && sharesOut != null && sharesOut > 0
    ? Math.abs(dividendsPaid) / sharesOut : null;

  const ebitdaMargin  = revenue != null && ebitda != null && revenue > 0 ? ebitda / revenue : null;
  const netMargin     = revenue != null && netIncome != null && revenue > 0 ? netIncome / revenue : null;

  return {
    revenue,
    operatingIncome,
    ebitda,
    interestExpense,
    netIncome,
    epsDiluted,
    totalDebt,
    netDebt,
    cash,
    equity,
    ocf,
    fcf,
    // derived
    netLeverage,
    interestCoverage,
    fcfPerShare,
    bookValuePerShare: bookValuePS,
    dividendPerShare: dividendPS,
    ebitdaMargin,
    netMargin,
  };
}

// ─── Report generation ───────────────────────────────────────────────────────

function buildMarkdown(results) {
  const lines = [
    '# NovaSect — SEC EDGAR 10-K Data Pull',
    `> Generated: ${new Date().toISOString()}`,
    `> Tickers: ${results.length}`,
    '',
    '## Key Metrics Comparison',
    '',
    '| Ticker | Revenue | EBITDA | EBITDA Margin | Net Income | Net Margin | EPS (Diluted) | Net Leverage | Int. Coverage | FCF/Share | Book Value/Share | Div/Share |',
    '|--------|---------|--------|---------------|------------|------------|---------------|--------------|---------------|-----------|-----------------|-----------|',
  ];

  for (const { ticker, derived } of results) {
    const d = derived;
    lines.push(
      `| ${ticker.padEnd(6)} | ${fmtBn(d.revenue)} | ${fmtBn(d.ebitda)} | ${fmtPct(d.ebitdaMargin)} | ${fmtBn(d.netIncome)} | ${fmtPct(d.netMargin)} | ${fmt(d.epsDiluted)} | ${fmt(d.netLeverage)}x | ${fmt(d.interestCoverage)}x | ${fmt(d.fcfPerShare)} | ${fmt(d.bookValuePerShare)} | ${fmt(d.dividendPerShare)} |`
    );
  }

  lines.push('');
  lines.push('## Balance Sheet Summary');
  lines.push('');
  lines.push('| Ticker | Total Debt | Net Debt | Cash | Equity | OCF | FCF |');
  lines.push('|--------|-----------|---------|------|--------|-----|-----|');

  for (const { ticker, derived: d } of results) {
    lines.push(
      `| ${ticker.padEnd(6)} | ${fmtBn(d.totalDebt)} | ${fmtBn(d.netDebt)} | ${fmtBn(d.cash)} | ${fmtBn(d.equity)} | ${fmtBn(d.ocf)} | ${fmtBn(d.fcf)} |`
    );
  }

  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- All figures sourced from SEC EDGAR XBRL companyfacts API (latest 10-K filing).');
  lines.push('- Net Leverage = Net Debt / EBITDA. Negative = net cash position.');
  lines.push('- Interest Coverage = EBITDA / Interest Expense.');
  lines.push('- FCF = Operating Cash Flow − Capital Expenditure.');
  lines.push('- Forward EPS is not available via XBRL (analyst estimates only — use Finnhub).');
  lines.push('- N/A = concept not reported or not found in XBRL for this filer.');

  return lines.join('\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  // Ensure output dirs exist
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  if (!existsSync(RAW_DIR)) mkdirSync(RAW_DIR, { recursive: true });

  console.log(`\nNovaSect SEC 10-K Fetcher — ${TICKERS.length} tickers\n`);

  const results = [];
  const errors  = [];

  for (let i = 0; i < TICKERS.length; i++) {
    const ticker = TICKERS[i];
    process.stdout.write(`[${String(i + 1).padStart(2)}/${TICKERS.length}] ${ticker.padEnd(5)} ... `);

    try {
      const { cik, raw } = await fetchTicker(ticker);
      const derived = derive(raw);

      // Save raw facts
      const rawPath = join(RAW_DIR, `${ticker}.json`);
      writeFileSync(rawPath, JSON.stringify({ ticker, cik, raw }, null, 2));

      results.push({ ticker, cik, derived });
      console.log(`OK  (${raw.revenue?.end ?? 'date unknown'})`);
    } catch (err) {
      console.log(`FAIL — ${err.message}`);
      errors.push({ ticker, error: err.message });
    }
  }

  // Write summary.json
  const summary = { generated: new Date().toISOString(), tickers: results, errors };
  writeFileSync(join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`\nWrote: sec-output/summary.json`);

  // Write report.md
  const md = buildMarkdown(results);
  writeFileSync(join(OUT_DIR, 'report.md'), md, 'utf8');
  console.log(`Wrote: sec-output/report.md`);

  // Write raw files summary
  console.log(`Wrote: sec-output/raw/{ticker}.json (${results.length} files)`);

  if (errors.length > 0) {
    console.log(`\nFailed (${errors.length}):`);
    for (const { ticker, error } of errors) {
      console.log(`  ${ticker}: ${error}`);
    }
  }

  console.log(`\nDone. ${results.length}/${TICKERS.length} tickers fetched successfully.\n`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
