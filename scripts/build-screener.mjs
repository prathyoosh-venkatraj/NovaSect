#!/usr/bin/env node
/**
 * build-screener.mjs — offline builder for data/screener.json.
 *
 * For each US filer in data/universe.json it fetches SEC XBRL companyfacts,
 * builds the 5-year history (shared xbrl-history lib) and computes a
 * deterministic analytics snapshot (no ML, no price feed): margins, ROE/ROA,
 * ROIC, leverage, interest coverage, FCF margin, revenue growth, and the
 * interest-coverage-implied credit tier. Foreign filers get rating/sector only.
 *
 * Output feeds the FinVault cross-company screener on reports.html. Refreshed by
 * .github/workflows/screener.yml.  Run:  node scripts/build-screener.mjs [--limit N]
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildSeries, historyData } from './lib/xbrl-history.mjs';

const SEC_UA = 'NovaSect novasect.space@proton.me';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = (() => { const i = process.argv.indexOf('--limit'); return i > -1 ? Number(process.argv[i + 1]) : Infinity; })();

const sleep = ms => new Promise(r => setTimeout(r, ms));
const last = a => { for (let i = (a || []).length - 1; i >= 0; i--) if (a[i] != null) return a[i]; return null; };
const round = (v, d = 4) => (v == null || isNaN(v)) ? null : Number(v.toFixed(d));

async function getCikMap() {
  const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: { 'User-Agent': SEC_UA, accept: 'application/json' } });
  if (!r.ok) throw new Error('company_tickers ' + r.status);
  const data = await r.json();
  const map = new Map();
  for (const row of Object.values(data)) if (row?.ticker && row?.cik_str != null) map.set(String(row.ticker).toUpperCase(), row.cik_str);
  return map;
}

// Deterministic analytics snapshot from the latest fiscal year (mirrors the
// report.html Tier 2 panel; no price → no valuation multiples here).
function analytics(history) {
  const s = history.summary, RA = history.ratios, c = history.cagr || {};
  const ni = last(s.netIncome), rev = last(s.revenue), ta = last(s.totalAssets), eq = last(s.equity),
        oi = last(s.operatingIncome), td = last(s.totalDebt), cash = last(s.cash), fcf = last(s.freeCashFlow);
  const TAX = 0.21;
  const invCap = (td != null || eq != null) ? ((td || 0) + (eq || 0) - (cash || 0)) : null;
  const roic = (oi != null && invCap && invCap > 0) ? (oi * (1 - TAX)) / invCap : null;
  const dupRoe = (ni != null && rev && ta && eq) ? (ni / rev) * (rev / ta) * (ta / eq) : null;
  const icv = last(RA.interestCoverage);
  const tier = icv == null ? null : (icv >= 12 ? 'AAA/AA' : icv >= 8 ? 'A' : icv >= 5 ? 'BBB' : icv >= 2.5 ? 'BB' : icv >= 1.5 ? 'B' : 'CCC');
  return {
    revenue: round(rev, 0),
    revGrowth: round(typeof c.revenue === 'number' ? c.revenue : null),
    netMargin: round(last(RA.netMargin)),
    operatingMargin: round(last(RA.operatingMargin)),
    roe: round(last(RA.roe) ?? dupRoe),
    roa: round(last(RA.roa)),
    roic: round(roic),
    debtToEquity: round(last(RA.debtToEquity)),
    netLeverage: round(last(RA.netLeverage)),
    interestCoverage: round(icv, 2),
    fcfMargin: round((fcf != null && rev) ? fcf / rev : null),
    impliedCredit: tier,
  };
}

async function main() {
  const universe = JSON.parse(readFileSync(join(ROOT, 'data', 'universe.json'), 'utf8')).tickers;
  let entries = Object.values(universe);
  if (LIMIT !== Infinity) entries = entries.slice(0, LIMIT);
  const cik = await getCikMap();
  const rows = [];
  let ok = 0, foreign = 0, fail = 0;

  for (const e of entries) {
    const base = {
      ticker: e.ticker, name: e.name, sector: e.sector, region: e.region,
      rating: e.sentinel?.rating ?? null, slug: e.finvault?.slug ?? null,
      reportUrl: e.finvault?.reportUrl ?? null, pdfReady: !!e.finvault?.pdfReady,
    };
    if (e.region !== 'US') { rows.push({ ...base, foreign: true }); foreign++; continue; }
    const cikNum = cik.get(String(e.ticker).toUpperCase());
    if (cikNum == null) { rows.push({ ...base }); fail++; console.warn(`  ${e.ticker}: no CIK`); continue; }
    try {
      await sleep(160); // SEC fair-access
      const c = String(cikNum).padStart(10, '0');
      const r = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${c}.json`, { headers: { 'User-Agent': SEC_UA, accept: 'application/json' } });
      if (!r.ok) { rows.push({ ...base }); fail++; console.warn(`  ${e.ticker}: companyfacts ${r.status}`); continue; }
      const facts = await r.json();
      const h = historyData(buildSeries(facts.facts));
      if (!h) { rows.push({ ...base }); fail++; console.warn(`  ${e.ticker}: <2y history`); continue; }
      const row = { ...base, ...analytics(h), latestFY: h.years?.[h.years.length - 1] ?? null };
      rows.push(row); ok++;
      console.log(`  ${e.ticker}: ROE ${row.roe != null ? (row.roe * 100).toFixed(1) + '%' : 'n/a'} · ROIC ${row.roic != null ? (row.roic * 100).toFixed(1) + '%' : 'n/a'} · credit ${row.impliedCredit || 'n/a'}`);
    } catch (err) { rows.push({ ...base }); fail++; console.warn(`  ${e.ticker}: ${err.message}`); }
  }

  const out = { generated: new Date().toISOString().slice(0, 10), source: 'SEC EDGAR XBRL', count: rows.length, ok, foreign, fail, rows };
  writeFileSync(join(ROOT, 'data', 'screener.json'), JSON.stringify(out, null, 1));
  console.log(`\nscreener.json written: ${rows.length} rows (${ok} US-computed, ${foreign} foreign, ${fail} no-data)`);
}

main().catch(e => { console.error('build-screener failed:', e); process.exit(1); });
