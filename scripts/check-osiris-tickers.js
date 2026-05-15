#!/usr/bin/env node
/**
 * Osiris ticker pre-flight validator.
 *
 * Hits the public Yahoo v8 chart endpoint for every symbol in
 * physics-config.json, checks that:
 *   1. The symbol exists (HTTP 200 + non-empty chart.result)
 *   2. Historical data is actually returned (close points > 0)
 *   3. Yahoo's reported name vaguely matches the name in our config
 *      (catches mislabeled tickers like NGE.PA / DTE.DE)
 *
 * Independent of our Vercel proxy — tests Yahoo's view of the symbol.
 *
 * Usage:
 *   node scripts/check-osiris-tickers.js              (full report)
 *   node scripts/check-osiris-tickers.js --fails-only (only problems)
 */
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const CONCURRENCY = 4;

async function checkTicker(symbol) {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': UA } });
        if (!res.ok) return { symbol, ok: false, reason: `HTTP ${res.status}` };
        const json = await res.json();
        const result = json && json.chart && json.chart.result && json.chart.result[0];
        if (!result) {
            const err = json && json.chart && json.chart.error;
            return { symbol, ok: false, reason: err ? `${err.code}: ${err.description}` : 'empty result' };
        }
        const meta = result.meta || {};
        const closes = ((result.indicators || {}).quote || [{}])[0].close || [];
        const dataPoints = closes.filter(c => c !== null && c !== undefined).length;
        return {
            symbol,
            ok: dataPoints > 0,
            yahooName: meta.longName || meta.shortName || '',
            exchange: meta.exchangeName || '',
            currency: meta.currency || '',
            lastPrice: meta.regularMarketPrice,
            dataPoints,
            reason: dataPoints === 0 ? 'no price data in last 1mo' : null
        };
    } catch (e) {
        return { symbol, ok: false, reason: e.message };
    }
}

const GENERIC_WORDS = new Set([
    'the', 'and', 'group', 'company', 'corp', 'corporation', 'inc', 'incorporated',
    'plc', 'spa', 'se', 'ag', 'sa', 'nv', 'limited', 'ltd', 'holdings', 'holding',
    'deutsche', 'american', 'general', 'national', 'public', 'international', 'co'
]);

function nameLikelyMismatch(configName, yahooName) {
    if (!yahooName) return false;
    const tokenize = s => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
    const cTokens = tokenize(configName);
    const yTokens = tokenize(yahooName);
    const cSig = cTokens.filter(w => !GENERIC_WORDS.has(w) && w.length > 2);
    const ySig = yTokens.filter(w => !GENERIC_WORDS.has(w) && w.length > 2);
    if (cSig.length === 0 || ySig.length === 0) return false;
    return !cSig.some(c => ySig.some(y => c === y || c.includes(y) || y.includes(c)));
}

async function runConcurrent(items, limit, fn) {
    const out = [];
    let i = 0;
    async function worker() {
        while (i < items.length) {
            const idx = i++;
            out[idx] = await fn(items[idx]);
        }
    }
    await Promise.all(Array.from({ length: limit }, worker));
    return out;
}

function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length); }

async function main() {
    const failsOnly = process.argv.includes('--fails-only');
    const configPath = path.join(__dirname, '..', 'physics-config.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

    const all = [];
    for (const cohortName in config.cohorts) {
        for (const t of config.cohorts[cohortName].tickers) {
            all.push({ symbol: t.symbol, configName: t.name, cohort: cohortName });
        }
    }

    console.log(`Pre-flight: ${all.length} Osiris tickers against Yahoo (concurrency=${CONCURRENCY})\n`);
    const results = await runConcurrent(all.map(t => t.symbol), CONCURRENCY, checkTicker);

    const fails = [];
    const warns = [];
    const passes = [];
    for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const meta = all[i];
        const enriched = { ...r, configName: meta.configName, cohort: meta.cohort };
        if (!r.ok) fails.push(enriched);
        else if (nameLikelyMismatch(meta.configName, r.yahooName)) warns.push(enriched);
        else passes.push(enriched);
    }

    if (fails.length > 0) {
        console.log('─'.repeat(78));
        console.log('FAILED — Yahoo returned no usable data');
        console.log('─'.repeat(78));
        console.log('  ' + pad('Symbol', 10) + pad('Config name', 28) + 'Reason');
        fails.forEach(f => {
            console.log('  ' + pad(f.symbol, 10) + pad(f.configName.slice(0, 26), 28) + f.reason);
        });
        console.log('');
    }

    if (warns.length > 0) {
        console.log('─'.repeat(78));
        console.log('NAME MISMATCH — symbol exists but Yahoo name differs from config');
        console.log('─'.repeat(78));
        console.log('  ' + pad('Symbol', 10) + pad('Config name', 28) + 'Yahoo name');
        warns.forEach(w => {
            console.log('  ' + pad(w.symbol, 10) + pad(w.configName.slice(0, 26), 28) + (w.yahooName || '—'));
        });
        console.log('');
    }

    if (!failsOnly && passes.length > 0) {
        console.log('─'.repeat(78));
        console.log('PASSED');
        console.log('─'.repeat(78));
        console.log('  ' + pad('Symbol', 10) + pad('Yahoo name', 32) + pad('Exch', 8) + pad('Cur', 5) + 'Pts');
        passes.forEach(p => {
            console.log('  ' + pad(p.symbol, 10) + pad((p.yahooName || '—').slice(0, 30), 32) + pad(p.exchange, 8) + pad(p.currency, 5) + p.dataPoints);
        });
        console.log('');
    }

    console.log('─'.repeat(78));
    console.log(`Summary: ${passes.length} ok · ${warns.length} name-mismatch · ${fails.length} failed (of ${results.length})`);
    if (fails.length > 0 || warns.length > 0) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exit(2); });
