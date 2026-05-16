#!/usr/bin/env node
/**
 * Per-brief-page coverage scan.
 *
 * For every entry in data/universe.json, hit the same data endpoints
 * the brief page would call and report which fields populate vs come
 * back empty. Identifies systematic gaps so we can prioritise fixes.
 *
 * Usage: node scripts/scan-brief-coverage.js
 *        node scripts/scan-brief-coverage.js --gaps-only
 *
 * Probes (per ticker):
 *   1. Finnhub /stock/metric — drives Multiples + Growth grids
 *   2. universe.json finvault.stats — drives Financial Ratios table
 *
 * (Yahoo + FRED + Alpha Vantage coverage is already validated by
 *  scripts/check-osiris-tickers.js and Sentinel calibration scans.)
 */
const fs = require('fs');
const path = require('path');

// Hit the deployed proxy so we don't need the Finnhub key locally
// and benefit from the existing edge cache. Override with --base=…
// or NOVASECT_BASE env var if pointing at a preview deploy.
const BASE = process.env.NOVASECT_BASE
    || (process.argv.find(a => a.startsWith('--base=')) || '').split('=')[1]
    || 'https://novasect.space';

const universe = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'data', 'universe.json'), 'utf8')
);
const tickers = Object.values(universe.tickers);

const FIELDS = [
    { key: 'trailingPE', src: m => m.peExclExtraTTM || m.peTTM || m.peNormalizedAnnual },
    { key: 'forwardPE',  src: m => m.forwardPe || m.peInclExtraAnnual || m.peNormalizedAnnual },
    { key: 'evEbitda',   src: m => m['currentEv/ebitdaTTM'] || m['currentEv/ebitdaAnnual'] || m.enterpriseValueEbitdaTtm || m.evEbitdaTtm },
    { key: 'pb',         src: m => m.pbAnnual || m.pbTTM },
    { key: 'revG5Y',     src: m => m.revenueGrowth5Y },
    { key: 'epsG5Y',     src: m => m.epsGrowth5Y },
    { key: 'opMargin',   src: m => m.operatingMarginTTM }
];

function isPresent(v) {
    return typeof v === 'number' && isFinite(v) && v !== 0;
}

async function probe(entry) {
    const yahoo = entry.exchanges.yahoo;
    const url = `${BASE}/api/finnhub-proxy?endpoint=stock/metric&symbol=${encodeURIComponent(yahoo)}&metric=all`;
    try {
        const r = await fetch(url);
        if (!r.ok) return { ticker: entry.ticker, error: `HTTP ${r.status}` };
        const data = await r.json();
        const m = data && data.metric ? data.metric : null;
        if (!m) return { ticker: entry.ticker, error: 'no metric payload' };

        const result = { ticker: entry.ticker, sector: entry.sector };
        for (const f of FIELDS) {
            result[f.key] = isPresent(f.src(m));
        }
        result.hasStats = Array.isArray(entry.finvault && entry.finvault.stats);
        return result;
    } catch (e) {
        return { ticker: entry.ticker, error: e.message };
    }
}

async function run() {
    const gapsOnly = process.argv.includes('--gaps-only');
    const results = [];
    let i = 0;
    for (const entry of tickers) {
        const r = await probe(entry);
        results.push(r);
        i++;
        process.stderr.write(`\rscanned ${i}/${tickers.length}  `);
        // Light pacing for the free tier.
        await new Promise(res => setTimeout(res, 110));
    }
    process.stderr.write('\n\n');

    // Per-field summary
    const totals = {};
    for (const f of FIELDS) totals[f.key] = 0;
    totals.hasStats = 0;
    totals.errors = 0;

    for (const r of results) {
        if (r.error) { totals.errors++; continue; }
        for (const f of FIELDS) if (r[f.key]) totals[f.key]++;
        if (r.hasStats) totals.hasStats++;
    }

    const ok = results.length - totals.errors;
    console.log('─'.repeat(72));
    console.log(`Brief Coverage Scan · ${results.length} tickers · ${ok} reachable · ${totals.errors} error`);
    console.log('─'.repeat(72));
    console.log('');
    console.log('Field coverage (% of reachable tickers populating this cell):');
    const cols = [...FIELDS.map(f => f.key), 'hasStats'];
    const label = { trailingPE: 'Trailing P/E', forwardPE: 'Forward P/E', evEbitda: 'EV/EBITDA', pb: 'P/B', revG5Y: 'Rev Growth 5Y', epsG5Y: 'EPS Growth 5Y', opMargin: 'Operating Margin', hasStats: 'Financial Ratios (stats)' };
    for (const c of cols) {
        const pct = ok === 0 ? 0 : Math.round((totals[c] / ok) * 100);
        console.log(`  ${label[c].padEnd(26)} ${String(totals[c]).padStart(3)}/${ok}  (${pct}%)`);
    }
    console.log('');

    // Per-ticker gaps
    console.log('─'.repeat(72));
    console.log('Per-ticker gaps');
    console.log('─'.repeat(72));
    for (const r of results) {
        if (r.error) {
            console.log(`  ${r.ticker.padEnd(14)} ERROR: ${r.error}`);
            continue;
        }
        const missing = [];
        for (const f of FIELDS) if (!r[f.key]) missing.push(f.key);
        if (gapsOnly && missing.length === 0 && r.hasStats) continue;
        const tags = [];
        if (missing.length > 0) tags.push('missing: ' + missing.join(', '));
        if (!r.hasStats) tags.push('no stats array (skeleton)');
        if (tags.length === 0) tags.push('all fields present');
        console.log(`  ${r.ticker.padEnd(14)} ${('[' + r.sector + ']').padEnd(14)} ${tags.join(' · ')}`);
    }
}

run().catch(err => { console.error(err); process.exit(2); });
