import {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  Table, TableRow, TableCell, WidthType, BorderStyle,
  AlignmentType, PageBreak, ShadingType, convertInchesToTwip,
  NumberFormat, Header, Footer, PageNumber
} from 'docx';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'NovaSect_Technical_Reference.docx');

// ── Helpers ───────────────────────────────────────────────────────────────────

const COLORS = {
  heading1bg: '0A0F1E',
  heading2bg: '111827',
  heading3bg: '1E293B',
  accent:     '38BDF8',
  white:      'FFFFFF',
  light:      'E2E8F0',
  muted:      '94A3B8',
  rowAlt:     'F1F5F9',
  border:     'CBD5E1',
  codebg:     'F8FAFC',
  codetext:   '1E3A5F',
};

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 200 },
    shading: { type: ShadingType.SOLID, color: COLORS.heading1bg, fill: COLORS.heading1bg },
    indent: { left: convertInchesToTwip(0.15), right: convertInchesToTwip(0.15) },
    children: [new TextRun({
      text,
      color: COLORS.white,
      bold: true,
      size: 32,
      font: 'Calibri',
    })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 160 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: COLORS.accent, space: 4 } },
    children: [new TextRun({
      text,
      color: COLORS.heading1bg,
      bold: true,
      size: 26,
      font: 'Calibri',
    })],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({
      text,
      color: '1D4ED8',
      bold: true,
      size: 22,
      font: 'Calibri',
    })],
  });
}

function body(text, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80, line: 320 },
    children: [new TextRun({
      text,
      size: 20,
      font: 'Calibri',
      color: '1E293B',
      ...opts,
    })],
  });
}

function bullet(text, level = 0) {
  return new Paragraph({
    bullet: { level },
    spacing: { before: 40, after: 40, line: 300 },
    indent: { left: convertInchesToTwip(0.25 + level * 0.25) },
    children: [new TextRun({ text, size: 20, font: 'Calibri', color: '1E293B' })],
  });
}

function code(text) {
  return new Paragraph({
    spacing: { before: 60, after: 60 },
    shading: { type: ShadingType.SOLID, color: COLORS.codebg, fill: COLORS.codebg },
    indent: { left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
    border: {
      left: { style: BorderStyle.SINGLE, size: 12, color: '38BDF8', space: 6 },
    },
    children: [new TextRun({
      text,
      size: 18,
      font: 'Courier New',
      color: COLORS.codetext,
    })],
  });
}

function pageBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

function spacer() {
  return new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun('')] });
}

function tableRow(cells, isHeader = false) {
  return new TableRow({
    tableHeader: isHeader,
    children: cells.map((text, i) => new TableCell({
      shading: isHeader
        ? { type: ShadingType.SOLID, color: COLORS.heading1bg, fill: COLORS.heading1bg }
        : i % 2 === 0 ? undefined : { type: ShadingType.SOLID, color: COLORS.rowAlt, fill: COLORS.rowAlt },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({
        children: [new TextRun({
          text,
          bold: isHeader,
          color: isHeader ? COLORS.white : '1E293B',
          size: isHeader ? 18 : 18,
          font: 'Calibri',
        })],
      })],
    })),
  });
}

function makeTable(headers, rows, colWidths) {
  const totalWidth = 9200;
  const widths = colWidths
    ? colWidths.map(w => ({ size: Math.round(totalWidth * w), type: WidthType.DXA }))
    : headers.map(() => ({ size: Math.round(totalWidth / headers.length), type: WidthType.DXA }));

  return new Table({
    width: { size: totalWidth, type: WidthType.DXA },
    borders: {
      top:          { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      bottom:       { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      left:         { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      right:        { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      insideH:      { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
      insideV:      { style: BorderStyle.SINGLE, size: 4, color: COLORS.border },
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((text, i) => new TableCell({
          shading: { type: ShadingType.SOLID, color: COLORS.heading1bg, fill: COLORS.heading1bg },
          width: widths[i],
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({
            children: [new TextRun({ text, bold: true, color: COLORS.white, size: 18, font: 'Calibri' })],
          })],
        })),
      }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((text, ci) => new TableCell({
          shading: ri % 2 === 1
            ? { type: ShadingType.SOLID, color: COLORS.rowAlt, fill: COLORS.rowAlt }
            : undefined,
          width: widths[ci],
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({
            children: [new TextRun({ text, size: 18, font: 'Calibri', color: '1E293B' })],
          })],
        })),
      })),
    ],
  });
}

// ── Title Page ─────────────────────────────────────────────────────────────────

const titlePage = [
  spacer(), spacer(), spacer(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text: 'NOVASECT', bold: true, size: 72, font: 'Calibri', color: COLORS.heading1bg })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 200 },
    children: [new TextRun({ text: 'Platform Technical Reference', size: 40, font: 'Calibri', color: '475569' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COLORS.accent, space: 4 } },
    children: [new TextRun({ text: ' ', size: 24, font: 'Calibri' })],
  }),
  spacer(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: 'Data Extraction · Processing Logic · Output Engines', size: 24, font: 'Calibri', color: '64748B', italics: true })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: 'FinVault  ·  Sentinel  ·  Osiris', size: 28, font: 'Calibri', bold: true, color: '1D4ED8' })],
  }),
  spacer(), spacer(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: `Version 1.0  ·  May 2026`, size: 20, font: 'Calibri', color: '94A3B8' })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: 'novasect.space', size: 20, font: 'Calibri', color: '38BDF8' })],
  }),
  pageBreak(),
];

// ── Part I: FinVault ──────────────────────────────────────────────────────────

const partFinVault = [
  h1('PART I — FINVAULT'),
  body('FinVault is the equity research layer of the platform. It renders structured deep-dive reports on individual companies covering financial health, capital structure, and sector-specific operating metrics. Reports are pre-generated documents stored as static assets and are not computed in real time on the client.'),
  spacer(),

  h2('1.1  Report Generation Pipeline  (generate-report.mjs)'),
  body('Reports are produced offline via a Node.js pipeline that chains SEC EDGAR, XBRL, and the Claude API across eight sequential steps.'),
  spacer(),

  h3('Step 1 — CIK Resolution'),
  body('The pipeline fetches the SEC company_tickers.json index and maps the input ticker string to a Central Index Key (CIK). This is required for all subsequent EDGAR queries.'),

  h3('Step 2 — 10-K Filing Retrieval'),
  body('Using the CIK, the pipeline queries EDGAR\'s submissions endpoint to locate the most recent 10-K annual filing. It extracts the accession number, filing date, and reporting period.'),

  h3('Step 3 — 10-K Text Extraction'),
  body('Three sections are extracted from the 10-K filing, each capped at 35,000 characters:'),
  bullet('Item 1 — Business description'),
  bullet('Item 1A — Risk factors'),
  bullet('Item 7 — Management Discussion & Analysis'),

  h3('Step 4 — XBRL Financial Data (fetchXBRL2)'),
  body('Two years of structured financial data are fetched from the XBRL inline viewer. Each line item is resolved against a primary GAAP concept name plus a list of fallback synonyms to handle variations in company reporting taxonomy. Approximately 30 GAAP concepts are mapped this way.'),
  spacer(),
  body('Example fallback chains:', { bold: true }),
  bullet('Revenue: Revenues → RevenueFromContractWithCustomerExcludingAssessedTax → SalesRevenueNet'),
  bullet('Operating Income: OperatingIncomeLoss → IncomeLossFromContinuingOperationsBeforeIncomeTaxes'),

  h3('Step 5 — Ratio Computation'),
  body('The following ratios are computed from the resolved XBRL values:'),
  spacer(),
  makeTable(
    ['Ratio', 'Formula'],
    [
      ['EBITDA',            'OperatingIncome + Depreciation'],
      ['Net Debt',          'TotalDebt − Cash'],
      ['Current Ratio',     'CurrentAssets / CurrentLiabilities'],
      ['Quick Ratio',       '(CurrentAssets − Inventory) / CurrentLiabilities'],
      ['Debt-to-Equity',    'TotalDebt / Equity'],
      ['Net Leverage',      'NetDebt / EBITDA'],
      ['Interest Coverage', 'EBITDA / InterestExpense'],
      ['Operating Margin',  'OperatingIncome / Revenue'],
      ['Net Margin',        'NetIncome / Revenue'],
      ['ROA',               'NetIncome / TotalAssets'],
      ['ROE',               'NetIncome / Equity'],
    ],
    [0.35, 0.65]
  ),
  spacer(),

  h3('Step 6 — Markdown Table Construction'),
  body('The computed values are structured into six Markdown tables passed to the language model: Income Statement, Balance Sheet, Cash Flow, Liquidity, Solvency, and Profitability.'),

  h3('Step 7 — Claude API Report Generation'),
  body('The pipeline calls the Claude API with a structured system prompt defining the analytical framework (forensic accounting lens, sector-specific KPIs, capital structure critique) and a user message containing the 10-K text extracts plus the six financial tables. The model returns a full-length Markdown report draft.'),

  h3('Step 8 — DOCX Output'),
  body('The Markdown draft is converted to a .docx file. The output is stamped with the company name, ticker, and report date.'),
  spacer(),

  h2('1.2  Static Data Layer  (data/universe.json)'),
  body('Each covered company has a structured entry in universe.json. The stats field is a positional 15-element array rendered directly into the report display:'),
  spacer(),
  makeTable(
    ['Index', 'Metric'],
    [
      ['0',  'Current Ratio'],
      ['1',  'Quick Ratio'],
      ['2',  'Cash Ratio'],
      ['3',  'Debt-to-Equity'],
      ['4',  'Net Leverage'],
      ['5',  'Dividend Yield'],
      ['6',  'Trailing P/E (formatted as "Xx")'],
      ['7',  'EV/EBITDA'],
      ['8',  'Forward P/E'],
      ['9',  'P/FCF'],
      ['10', 'P/B'],
      ['11', 'Operating Margin'],
      ['12', 'Net Margin'],
      ['13', 'ROA'],
      ['14', 'ROE'],
    ],
    [0.2, 0.8]
  ),
  spacer(),

  h2('1.3  Coverage Scan  (scan-brief-coverage.js)'),
  body('A maintenance script that probes each ticker in universe.json against the Finnhub /stock/metric endpoint and reports field presence for: Trailing P/E, Forward P/E, EV/EBITDA, P/B, 5-Year Revenue Growth, 5-Year EPS Growth, and Operating Margin. Used to validate data completeness before publishing.'),

  pageBreak(),
];

// ── Part II: Sentinel ─────────────────────────────────────────────────────────

const partSentinel = [
  h1('PART II — SENTINEL'),
  body('Sentinel is a real-time credit intelligence monitor. It calculates synthetic credit spreads and implied yields for each covered company, surfacing credit stress signals that do not appear in standard equity metrics. All computation runs client-side in the browser using live data fetched from FRED and Alpha Vantage via Vercel API proxy routes.'),
  spacer(),

  h2('2.1  Company Registry'),
  body('The COMPANIES array in sentinel.v2.js holds 83 entries. Each entry carries: ticker, name, sector, credit type (IG/HY), rating, region, country, base_rate_type (UST/BUND/GILT), baseSpread (bps), marketBeta, sectorBeta, residual, lastVerified, netLeverage, and interestCoverage.'),
  body('baseSpread is the hand-calibrated anchor spread for the company under neutral macro conditions, updated quarterly.'),
  spacer(),

  h2('2.2  External Data Sources'),
  h3('FRED Series'),
  makeTable(
    ['Series ID', 'Description', 'Used For'],
    [
      ['DGS10',               'US 10-Year Treasury',       'UST base rate'],
      ['IRLTLT01DEM156N',     'German Bund 10Y',           'BUND base rate'],
      ['IRLTLT01GBM156N',     'UK Gilt 10Y',               'GILT base rate'],
      ['BAMLC0A1CAAA',        'ICE BofA AAA OAS',          'Rating index floor'],
      ['BAMLC0A2CAA',         'ICE BofA AA OAS',           'Rating index floor'],
      ['BAMLC0A3CA',          'ICE BofA A OAS',            'Rating index floor'],
      ['BAMLC0A4CBBB',        'ICE BofA BBB OAS',          'Rating index floor'],
      ['BAMLH0A0HYM2',        'ICE BofA HY OAS',           'Rating index floor'],
      ['VIXCLS',              'CBOE VIX Index',            'Stress regime detection'],
    ],
    [0.3, 0.4, 0.3]
  ),
  spacer(),

  h3('Alpha Vantage Sector ETF Volatilities'),
  makeTable(
    ['ETF', 'Sector', 'Fallback Value'],
    [
      ['XLE', 'Energy',      '25.5%'],
      ['XLU', 'Utilities',   '18.2%'],
      ['XLI', 'Industrials', '22.1%'],
    ],
    [0.15, 0.5, 0.35]
  ),
  body('Sector volatility is computed as 30-day annualized realized volatility: stdDev(logReturns) × √252. Cached 12 hours. Fallback mocks activate if the API is unavailable.'),
  spacer(),

  h2('2.3  Spread Calculation Engine'),
  body('The spread is assembled from three named legs. The sensitivity factor governs how strongly each company reacts to volatility: 0.35 for IG, 1.0 for HY.'),
  spacer(),

  h3('Leg 1 — Macro Anchor'),
  code('macroAnchor = max(baseSpread, ratingIndexBps)'),
  body('ratingIndexBps is the live ICE BofA OAS index for the company\'s credit rating category. This floors the spread at the broader market level for that rating cohort, preventing spreads tighter than the index average during stress.'),
  spacer(),

  h3('Leg A — VIX Beta-Shift'),
  body('When VIX rises above 25, effective betas blend toward 1.0 (market-neutral) to capture the regime shift where idiosyncratic factors compress and systemic correlation dominates:'),
  code('cFactor = min(0.8, max(0, (VIX − 25) / 25))'),
  code('effectiveSectorBeta = (1 − cFactor) × sectorBeta + cFactor × 1.0'),
  code('effectiveMarketBeta = (1 − cFactor) × marketBeta + cFactor × 1.0'),
  body('At VIX = 50, cFactor = 1.0 and all betas converge to 1.0.'),
  spacer(),

  h3('Leg B — Volatility Premium'),
  body('Proxy Volatility:', { bold: true }),
  code('proxyVol = sectorVol × effectiveSectorBeta + residual'),
  spacer(),
  body('Merton Convexity Scalar:', { bold: true }),
  body('A sigmoid function maps proxy volatility to a nonlinear multiplier, capturing the accelerating convexity of credit risk as volatility rises. The scalar ranges from 1.5 (low vol) to 2.5 (high vol):'),
  code('mertonScalar = 1.5 + 1.0 / (1 + exp(−0.4 × (proxyVol − 35)))'),
  spacer(),
  body('Volatility Premium:', { bold: true }),
  code('volatilityPremium = proxyVol × mertonScalar × stressMultiplier × sensitivity'),
  spacer(),
  body('Market Component:', { bold: true }),
  code('marketComponent = effectiveMarketBeta × 50 × stressMultiplier × sensitivity'),
  spacer(),

  h3('Leg C — Seniority and Tenure Adjustments'),
  body('Applied when the user selects a specific instrument type and tenor in the UI:'),
  code('seniorityMultiplier: Secured = 0.85 | Unsecured = 1.00 | Subordinated = 1.5 + (baseTotal / 200)'),
  code('tenureMultiplier = 1 + (selectedTenure − 10) × 0.03'),
  spacer(),

  h3('Final Spread and Yield Assembly'),
  code('liveSpread = (macroAnchor + volatilityPremium + marketComponent) × seniorityMultiplier × tenureMultiplier'),
  code('impliedYield = sovereignRate + liveSpread / 100'),
  spacer(),

  h3('Probability of Default (PoD)'),
  code('PoD = 1 − exp(−spread/10000 × 10)'),
  body('This assumes a 10-year horizon with implicit LGD = 100%. It overstates PoD for IG names — acceptable for relative signal comparison, not absolute valuation.'),
  spacer(),

  h2('2.4  Spread Driver Decomposition'),
  body('The getSpreadDrivers function decomposes the total live spread into six labelled components, expressed as both basis points and percentage of total:'),
  spacer(),
  makeTable(
    ['Component', 'Definition'],
    [
      ['Anchor',          'max(baseSpread, ratingIndexBps)'],
      ['Market',          'effectiveMarketBeta × 50 × stressMultiplier × sensitivity'],
      ['Volatility Pure', 'proxyVol × mertonScalar × stressMultiplier × sensitivity'],
      ['Residual',        'Auto-calibrated correction term (bps)'],
      ['Seniority',       'Additive delta from seniority multiplier'],
      ['Tenure',          'Additive delta from tenure multiplier'],
    ],
    [0.3, 0.7]
  ),
  spacer(),

  h2('2.5  Auto-Calibration Loop'),
  body('Every 2 hours, Sentinel spot-checks 3 randomly selected companies from the registry:'),
  bullet('Fetch 30-day actual realized volatility from Yahoo Finance for the ticker'),
  bullet('Compute proxy volatility using current sector vol × company beta'),
  bullet('Convert vol error to spread basis points: volError (%) × 1.5 bps per 1%'),
  bullet('Set company.residual += volError'),
  bullet('Lerp the residual adjustment smoothly over 50 steps (5 seconds) to avoid UI jumps'),
  spacer(),
  body('Market Pulse states set per company post-calibration:', { bold: true }),
  bullet('STABLE — vol error < 3%'),
  bullet('VOL SPIKE — sector vol increased > 10% since last check'),
  bullet('CONVEX TRIGGER — mertonScalar crossed the inflection zone (proxyVol ≈ 35)'),
  spacer(),

  h2('2.6  Rating Band Validation'),
  makeTable(
    ['Rating', 'Expected Range (bps)'],
    [
      ['AAA', '30 – 150'],
      ['AA',  '50 – 200'],
      ['A',   '70 – 250'],
      ['BBB', '100 – 350'],
      ['HY',  '200 – 700'],
    ],
    [0.3, 0.7]
  ),
  spacer(),

  h2('2.7  Sovereign Spread Adjustments'),
  body('Country-specific sovereign spread premiums (bps over the reference base rate) are added for non-core jurisdictions:'),
  spacer(),
  makeTable(
    ['Country / Region', 'Premium (bps)'],
    [
      ['US, DE, FR, UK, SE', '0'],
      ['Norway (NO)',         '45'],
      ['Spain (ES)',          '80'],
      ['Italy (IT)',          '145'],
      ['Saudi Arabia (SA)',   '100'],
      ['Brazil / India',      '250'],
    ],
    [0.5, 0.5]
  ),
  spacer(),

  h2('2.8  Risk Level Thresholds'),
  makeTable(
    ['Level', 'Spread Range'],
    [
      ['NOMINAL',  '< 200 bps'],
      ['CAUTION',  '200 – 400 bps'],
      ['ELEVATED', '400 – 800 bps'],
      ['CRITICAL', '> 800 bps'],
    ],
    [0.4, 0.6]
  ),
  spacer(),

  h2('2.9  Refresh and Batching Architecture'),
  bullet('Default refresh cycle: 5 seconds'),
  bullet('Batch size: 5 companies per cycle'),
  bullet('Batches alternate between Energy/Utilities and Industrials cohorts'),
  bullet('Modal (focus) mode: 5-second cycle for the selected company only'),
  bullet('Background (stale) mode: 60-second cycle for companies not currently viewed'),
  spacer(),

  h2('2.10  Verification Status'),
  makeTable(
    ['Age', 'Status'],
    [
      ['< 60 days',  'Fresh (green)'],
      ['60–90 days', 'Aging (amber)'],
      ['> 90 days',  'Stale (red)'],
    ],
    [0.4, 0.6]
  ),

  pageBreak(),
];

// ── Part III: Osiris ──────────────────────────────────────────────────────────

const partOsiris = [
  h1('PART III — OSIRIS'),
  body('Osiris is a stochastic simulation engine that runs multi-path Monte Carlo models to generate probabilistic price trajectory distributions for each covered company. It produces probability-weighted price targets and uncertainty ranges, not single-point estimates.'),
  spacer(),

  h2('3.1  Physics Model Assignment'),
  body('Each company is assigned a physics model based on its economic sector:'),
  spacer(),
  makeTable(
    ['Cohort', 'Physics Model', 'Rationale'],
    [
      ['Energy & Utilities',      'Ornstein-Uhlenbeck (OU)',       'Mean-reverting; commodity cycle dynamics'],
      ['Industrials & Defense',   'GBM + Jump Diffusion (Merton)', 'Trend-following; discrete contract/shock events'],
    ],
    [0.3, 0.35, 0.35]
  ),
  body('Model parameters are stored in physics-config.json (schema v1.8-consumer-staples) per ticker. Parameters requiring live market data — beta, dividend yield, and long-term mean price — are computed dynamically at simulation time by osirisIngestion.js.'),
  spacer(),

  h2('3.2  Data Ingestion  (osirisIngestion.js)'),
  h3('Caching Architecture'),
  makeTable(
    ['Layer', 'Store', 'TTL', 'Key'],
    [
      ['Historical prices', 'IndexedDB (OsirisTickerCache)', '24 hours',  'ticker + schema version'],
      ['Macro hubs',        'localStorage',                  '24 hours',  'osiris_macro_hubs'],
      ['Intraday vol',      'Session memo',                  'Session',   'ticker'],
      ['Earnings date',     'Session memo',                  '24 hours',  'ticker'],
    ],
    [0.25, 0.3, 0.2, 0.25]
  ),
  spacer(),

  h3('Historical Data Fetch'),
  body('Route: yahoo-proxy.js?mode=history&range=1y'),
  body('Returns: series [{date, adjClose}] — daily adjusted close prices for 1 year; dividends [{date, amount}] — cash dividends with ex-dates; currentPrice — latest market price.'),
  spacer(),

  h3('Beta Computation (OLS vs SPY)'),
  bullet('Fetch SPY historical series using the same route'),
  bullet('Align dates between stock and benchmark (intersection, minimum 30 shared days)'),
  bullet('Compute log-returns for both: r_t = log(P_t / P_{t−1})'),
  spacer(),
  code('β = cov(stockReturns, SPYReturns) / var(SPYReturns)'),
  spacer(),

  h3('Dividend Yield'),
  code('dividendYield = sum(dividends in trailing 365 days) / currentPrice'),
  spacer(),

  h3('Long-Term Mean Price'),
  code('longTermMeanPrice = arithmetic mean of adjClose over 1 year  (min. 30 observations)'),
  body('Used as the OU mean-reversion target.'),
  spacer(),

  h3('Annualized Realized Volatility (Daily)'),
  code('σ_annual = stdDev(dailyLogReturns) × √252'),
  spacer(),

  h3('Intraday Realized Volatility (Short Horizons ≤ 7 Days)'),
  body('When the simulation horizon is 7 calendar days or fewer, the engine switches from daily to intraday volatility:'),
  bullet('Fetch 5-minute bars (30-day history, 5-minute interval)'),
  bullet('Group bars by UTC trading date'),
  bullet('Per-day realized variance including overnight gap:'),
  spacer(),
  code('RV_day = Σ(log(bar_t / bar_{t−1}))² + (log(open_today / close_yesterday))²'),
  spacer(),
  bullet('Mean of last 20 trading days (minimum 10 intraday bars per day required)'),
  code('σ_annual = √(mean(RV_daily) × 252)'),
  body('Falls back to daily RV if 5-minute data is unavailable.'),
  spacer(),

  h3('Macro Hubs'),
  code('US10Y = FRED DGS10 / 100        (fallback: 0.045)'),
  code('VIX   = FRED VIXCLS             (fallback: 15.2)'),
  spacer(),

  h3('Earnings Catalyst'),
  body('Route: yahoo-proxy.js?mode=earnings&symbol=X. If the next earnings date falls within the simulation horizon (horizon ≤ 21 days), volatility is multiplied by 2.5× at that step to model earnings uncertainty.'),
  spacer(),

  h2('3.3  Simulation Parameters'),
  makeTable(
    ['Parameter', 'Source'],
    [
      ['initialPrice',        'currentPrice from ingestion'],
      ['drift',               'US10Y (live) − dividendYield (live)'],
      ['volatility',          'σ_annual from ingestion (daily or intraday)'],
      ['steps',               '252 (annual) or intraday step count'],
      ['paths',               'Device-capped (see §3.4)'],
      ['physicsType',         'OU or GBM_JUMP per ticker'],
      ['physicsParams',       'From physics-config.json per ticker'],
      ['antithetic',          'true (variance reduction enabled)'],
      ['intradaySteps',       '78 (1-day), 2 (1-week), 1 otherwise'],
    ],
    [0.35, 0.65]
  ),
  spacer(),

  h2('3.4  Device Path Limits'),
  makeTable(
    ['Device Class', 'Condition', 'Standard Paths', 'HI-FI Paths'],
    [
      ['Mobile',       'Coarse pointer OR width < 768px OR ≤ 2 GB RAM', '10,000',  'N/A'],
      ['Desktop Low',  '< 8 GB or < 8 cores',                           '25,000',  '50,000'],
      ['Desktop High', '≥ 8 GB and ≥ 8 cores',                          '25,000',  'up to 250,000'],
    ],
    [0.2, 0.38, 0.21, 0.21]
  ),
  spacer(),

  h2('3.5  Stochastic Engines  (stochasticWorker.js)'),
  h3('Normal Random Variate Generation (Box-Muller)'),
  code('u, v ~ Uniform(0, 1)'),
  code('Z = √(−2 · ln(u)) · cos(2π · v)'),
  spacer(),

  h3('Antithetic Variance Reduction'),
  body('For each pair of paths (2i, 2i+1), the Brownian shock for path 2i+1 is the sign-flip of path 2i:'),
  code('Z_{2i+1} = −Z_{2i}'),
  body('Jump events are drawn independently for each path to preserve jump distribution properties.'),
  spacer(),

  h3('Ornstein-Uhlenbeck Process (Energy & Utilities)'),
  body('Discrete-time proportional form:'),
  code('S_{t+1} = S_t + θ(μ − S_t)dt + σ · S_t · Z · √dt'),
  spacer(),
  makeTable(
    ['Parameter', 'Description', 'Typical Range'],
    [
      ['θ', 'Mean reversion speed (reversionSpeedTheta)', '0.10 – 0.20'],
      ['μ', 'Long-term mean price (1-year arithmetic mean)', 'Computed live'],
      ['σ', 'Annualized volatility', '0.15 – 0.32'],
      ['dt', '1 / (252 × intradaySteps)', 'Step-size dependent'],
      ['Z', 'Standard normal variate (Box-Muller)', 'Sampled per step'],
    ],
    [0.1, 0.55, 0.35]
  ),
  body('The proportional shock term σ · S_t makes volatility scale with price level, preventing negative prices.'),
  spacer(),

  h3('GBM + Jump Diffusion Process — Merton (1976)  (Industrials & Defense)'),
  body('Exact discrete form with Itô correction and Merton jump compensator:'),
  spacer(),
  body('Jump compensator (maintains martingale property):', { bold: true }),
  code('compensator = λ · (exp(jumpMu + 0.5 · σ_J²) − 1)'),
  spacer(),
  body('Price evolution per step:', { bold: true }),
  code('logJump = N(jumpMu, σ_J²)  if U(0,1) < λ·dt  else 0'),
  code('S_{t+1} = S_t · exp((drift − compensator) · dt + σ · √dt · Z + logJump)'),
  spacer(),
  makeTable(
    ['Parameter', 'Description', 'Typical Range'],
    [
      ['λ',      'Jump frequency (events/year)',              '4 – 7'],
      ['jumpMu', 'Mean log-jump size (positive skew)',        '0.008 – 0.025'],
      ['σ_J',    'Jump vol (jumpStd), fixed 0.07 (7%)',       'Calibrated constant'],
      ['Z',      'Standard normal Brownian shock',            'Sampled per step'],
    ],
    [0.12, 0.55, 0.33]
  ),
  spacer(),

  h3('Percentile Extraction'),
  body('Terminal values (all paths at the final step) are sorted ascending. The following percentiles are extracted:'),
  spacer(),
  makeTable(
    ['Label', 'Percentile', 'Interpretation'],
    [
      ['p05',         '5th',  'Stress floor'],
      ['p10',         '10th', 'Deep downside'],
      ['p25',         '25th', 'Bear case'],
      ['p45 – p55',   '45th – 55th', 'Central range (innermost band)'],
      ['p50',         '50th', 'Median / expected outcome'],
      ['p75',         '75th', 'Bull case'],
      ['p90',         '90th', 'Strong upside'],
      ['p95',         '95th', 'Upside ceiling'],
      ['pAboveSpot',  '—',    'count(S_T > S_0) / totalPaths'],
    ],
    [0.2, 0.25, 0.55]
  ),
  spacer(),

  h2('3.6  Oracle — Probability Synthesis  (osirisOracle.js)'),
  h3('Win Probability'),
  body('Primary: pAboveSpot from the worker (exact empirical count over all paths).'),
  spacer(),
  body('Fallback (Gaussian approximation — Abramowitz & Stegun 7.1.26):', { bold: true }),
  code('impliedSigma = (p95 − p05) / (2 × 1.645)'),
  code('z = (p50 − currentPrice) / impliedSigma'),
  code('probability = Φ(z)  clamped to [1%, 99%]'),
  spacer(),

  h3('Output Structure'),
  bullet('Headline: "X% probability that [TICKER] trades above $[spot] by Day [N]"'),
  bullet('Badge row: Upside (p95), Expected (p50), Stress (p05) — each as % change from spot'),
  bullet('Model assumptions: historical σ baseline, physics engine type, credit rating, beta, dividend yield'),
  spacer(),

  h2('3.7  Rendering Engine  (osirisCloudCanvas.js)'),
  h3('Pass 1 — Background Layer'),
  bullet('Dark background fill with scanline texture'),
  bullet('Temporal anchor lines: Q1 (step 63), Q2 (126), Q3 (189), Terminal (252)'),
  bullet('Spatial anchor lines: baseline price (dashed yellow), long-term mean (dashed cyan)'),
  bullet('Axis labels and grid'),
  spacer(),

  h3('Pass 2 — Stochastic Layer'),
  body('OU mode (Energy/Utilities):', { bold: true }),
  bullet('Graduated heatmap bands from p95–p05 (outermost, most transparent) to p45–p55 (densest)'),
  bullet('P50 rendered as bold stroke'),
  bullet('Terminal percentile badges at the right edge'),
  spacer(),
  body('GBM+Jump mode (Industrials):', { bold: true }),
  bullet('Gain zone: green fill above the baseline price'),
  bullet('Loss zone: red fill below the baseline price'),
  bullet('Jump arrows on P50 path where step-to-step delta > 4%: green arrow up, red arrow down'),
  bullet('Hover crosshair scrubber: vertical line with percentile labels, day counter at bottom'),
  spacer(),

  h3('Coordinate Mapping'),
  code('x = paddingLeft + (step / maxSteps) × drawWidth'),
  code('y = height − paddingBottom − ((value − minValue) / (maxValue − minValue)) × drawHeight'),
  body('Canvas is DPI-scaled using window.devicePixelRatio.'),

  pageBreak(),
];

// ── Part IV: API Proxy Layer ──────────────────────────────────────────────────

const partAPI = [
  h1('PART IV — API PROXY LAYER'),
  body('All external API calls are routed through Vercel serverless functions to protect API keys and apply server-side caching. No API keys are exposed to the browser.'),
  spacer(),

  h2('4.1  yahoo-proxy.js'),
  makeTable(
    ['Mode', 'Data Returned', 'Cache TTL'],
    [
      ['(default)',      '30-day annualized RV: stdDev(logReturns) × √252',                    '30 min'],
      ['history',        'Daily adjusted-close series + dividends + currentPrice',              '24 hours'],
      ['quote-summary',  'Analyst price targets, trailing P/E, key statistics',                 '6 hours'],
      ['earnings',       'Next earnings date (ISO string)',                                     '12 hours'],
      ['news',           'Yahoo RSS parsed to Finnhub-compatible shape',                       '30 min'],
    ],
    [0.2, 0.55, 0.25]
  ),
  spacer(),

  h2('4.2  finnhub-proxy.js'),
  body('Whitelisted endpoints: company-news, company-profile2, stock/recommendation, stock/price-target, stock/earnings, stock/insider-transactions, stock/financials-reported, stock/metric, stock/dividend.'),
  spacer(),
  makeTable(
    ['Endpoint', 'Cache TTL'],
    [
      ['company-news',              '30 minutes'],
      ['company-profile2',          '24 hours'],
      ['stock/recommendation',      '6 hours'],
      ['stock/earnings',            '6 hours'],
      ['stock/financials-reported', '24 hours'],
      ['stock/metric',              '6 hours'],
      ['stock/dividend',            '24 hours'],
    ],
    [0.55, 0.45]
  ),
  body('Rate-limit handling: HTTP 401/403 rejected immediately; HTTP 429 queued for retry.'),
  spacer(),

  h2('4.3  fred-proxy.js'),
  body('Single-purpose FRED API wrapper. Accepts a series_id parameter, queries the St. Louis Fed observations endpoint, and returns the latest observation value. Cache TTL: 6 hours. This reduces upstream FRED calls from ~216/day to ~36/day for the 9 series polled by Sentinel.'),
  spacer(),

  h2('4.4  alpha-proxy.js'),
  body('Calls Alpha Vantage TIME_SERIES_DAILY for three sector ETFs (XLE, XLU, XLI). Computes 30-day annualized realized volatility: stdDev(logReturns) × √252. Cache TTL: 12 hours. On API failure or rate-limit, returns hardcoded fallback values. 404 responses return { error: "E404: NO_DATA_FOUND" } without leaking upstream response fields.'),

  pageBreak(),
];

// ── Part V: Consolidated Formula Reference ────────────────────────────────────

const partFormulas = [
  h1('PART V — CONSOLIDATED FORMULA REFERENCE'),
  spacer(),
  makeTable(
    ['Formula', 'Engine', 'Expression'],
    [
      ['Credit Spread',           'Sentinel',       'max(baseSpread, ratingIndex) + proxyVol × mertonScalar × stress × sensitivity + effectiveMarketBeta × 50 × stress × sensitivity'],
      ['Implied Yield',           'Sentinel',       'sovereignRate + liveSpread / 100'],
      ['Probability of Default',  'Sentinel',       '1 − exp(−spread/10000 × 10)'],
      ['Merton Convexity Scalar', 'Sentinel',       '1.5 + 1.0 / (1 + exp(−0.4 × (proxyVol − 35)))'],
      ['Proxy Volatility',        'Sentinel',       'sectorVol × effectiveSectorBeta + residual'],
      ['VIX Beta-Shift Factor',   'Sentinel',       'cFactor = min(0.8, max(0, (VIX − 25) / 25))'],
      ['Effective Beta',          'Sentinel',       '(1 − cFactor) × baseBeta + cFactor × 1.0'],
      ['OU Price Process',        'Osiris Worker',  'S_{t+1} = S_t + θ(μ − S_t)dt + σ·S_t·Z·√dt'],
      ['GBM+Jump Price Process',  'Osiris Worker',  'S_{t+1} = S_t · exp((drift − compensator)·dt + σ√dt·Z + logJump)'],
      ['Merton Jump Compensator', 'Osiris Worker',  'λ · (exp(jumpMu + 0.5·σ_J²) − 1)'],
      ['Drift',                   'Osiris',         'US10Y − dividendYield'],
      ['Beta (OLS)',               'Osiris Ingest',  'cov(stockReturns, SPYReturns) / var(SPYReturns)'],
      ['Dividend Yield',          'Osiris Ingest',  'sum(TTM dividends) / currentPrice'],
      ['Annualized Daily RV',     'Osiris/Sentinel','stdDev(logReturns) × √252'],
      ['Intraday Daily RV',       'Osiris Ingest',  'Σ(log(bar_t/bar_{t−1}))² + (log(open/prev_close))²'],
      ['Box-Muller Normal',       'Osiris Worker',  'Z = √(−2·ln(u)) · cos(2π·v)'],
      ['Win Probability',         'Osiris Oracle',  'count(S_T > S_0) / totalPaths'],
      ['Win Prob (fallback)',      'Osiris Oracle',  'Φ((p50 − S_0) / ((p95 − p05) / 3.29))'],
      ['Net Leverage',            'FinVault',       '(TotalDebt − Cash) / EBITDA'],
      ['Interest Coverage',       'FinVault',       'EBITDA / InterestExpense'],
      ['ROE',                     'FinVault',       'NetIncome / Equity'],
      ['ROA',                     'FinVault',       'NetIncome / TotalAssets'],
    ],
    [0.28, 0.2, 0.52]
  ),
];

// ── Assemble Document ─────────────────────────────────────────────────────────

const doc = new Document({
  creator: 'NovaSect',
  title: 'NovaSect Platform Technical Reference',
  description: 'Data extraction, processing logic, and output engines for FinVault, Sentinel, and Osiris',
  styles: {
    default: {
      document: {
        run: { font: 'Calibri', size: 20, color: '1E293B' },
        paragraph: { spacing: { line: 320 } },
      },
    },
  },
  sections: [{
    properties: {
      page: {
        margin: {
          top:    convertInchesToTwip(1.0),
          bottom: convertInchesToTwip(1.0),
          left:   convertInchesToTwip(1.1),
          right:  convertInchesToTwip(1.1),
        },
      },
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border, space: 4 } },
            children: [
              new TextRun({ text: 'NovaSect  ·  Platform Technical Reference', size: 16, font: 'Calibri', color: '94A3B8' }),
            ],
          }),
        ],
      }),
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: COLORS.border, space: 4 } },
            children: [
              new TextRun({ text: 'Page ', size: 16, font: 'Calibri', color: '94A3B8' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, font: 'Calibri', color: '94A3B8' }),
              new TextRun({ text: '  ·  novasect.space  ·  Confidential', size: 16, font: 'Calibri', color: '94A3B8' }),
            ],
          }),
        ],
      }),
    },
    children: [
      ...titlePage,
      ...partFinVault,
      ...partSentinel,
      ...partOsiris,
      ...partAPI,
      ...partFormulas,
    ],
  }],
});

Packer.toBuffer(doc).then(buf => {
  writeFileSync(OUT, buf);
  console.log(`Written: ${OUT}`);
});
