#!/usr/bin/env node
/**
 * Quarterly review helper for Sentinel anchors.
 *
 * Prints a triaged table of which COMPANIES entries are due for refresh
 * (based on lastVerified), and flags any baseSpread values that fall
 * outside the validation band for their rating bucket.
 *
 * Usage:
 *   node scripts/check-stale-anchors.js              (full report)
 *   node scripts/check-stale-anchors.js --out-of-band (only out-of-band rows)
 *   node scripts/check-stale-anchors.js --overdue     (only overdue rows)
 *
 * Source of truth: sentinel.v2.js (parsed in-place; no separate config).
 */
const fs = require('fs');
const path = require('path');

const FRESH_DAYS = 60;
const AGING_DAYS = 90;

function loadFromSentinel() {
    const file = path.join(__dirname, '..', 'sentinel.v2.js');
    const src = fs.readFileSync(file, 'utf8');

    const compMatch = src.match(/const COMPANIES = (\[[\s\S]*?\n\]);/);
    if (!compMatch) throw new Error('Could not locate COMPANIES literal in sentinel.v2.js');
    const COMPANIES = eval(compMatch[1]);

    const bandsMatch = src.match(/const RATING_BANDS = (\{[\s\S]*?\n\});/);
    if (!bandsMatch) throw new Error('Could not locate RATING_BANDS literal in sentinel.v2.js');
    const RATING_BANDS = eval('(' + bandsMatch[1] + ')');

    return { COMPANIES, RATING_BANDS };
}

function daysSince(dateStr) {
    if (!dateStr) return Infinity;
    const ms = new Date(dateStr).getTime();
    if (isNaN(ms)) return Infinity;
    return Math.floor((Date.now() - ms) / 86400000);
}

function tier(days) {
    if (days < FRESH_DAYS) return 'fresh';
    if (days < AGING_DAYS) return 'aging';
    return 'overdue';
}

function pad(s, n) {
    s = String(s);
    return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function printGroup(title, rows) {
    console.log(`\n${title}`);
    if (rows.length === 0) {
        console.log('  (none)');
        return;
    }
    console.log('  ' + pad('Ticker', 12) + pad('Rating', 8) + pad('baseSpread', 14) + pad('Last verified', 16) + pad('Days', 6));
    console.log('  ' + '─'.repeat(56));
    rows.forEach(r => {
        console.log('  ' + pad(r.ticker, 12) + pad(r.rating, 8) + pad(r.baseSpread + ' bps', 14) + pad(r.lastVerified || '—', 16) + pad(r.days, 6));
    });
}

function main() {
    const args = process.argv.slice(2);
    const onlyOOB = args.includes('--out-of-band');
    const onlyOverdue = args.includes('--overdue');

    const { COMPANIES, RATING_BANDS } = loadFromSentinel();
    const today = new Date().toISOString().slice(0, 10);

    const enriched = COMPANIES.map(c => {
        const days = daysSince(c.lastVerified);
        const band = RATING_BANDS[c.rating];
        const oob = !band || c.baseSpread < band.min || c.baseSpread > band.max;
        return { ...c, days, tier: tier(days), outOfBand: oob, band };
    });

    console.log('─'.repeat(60));
    console.log(`Sentinel Anchor Refresh Audit · ${today}`);
    console.log('─'.repeat(60));

    if (onlyOOB) {
        const oob = enriched.filter(r => r.outOfBand);
        printGroup('OUT-OF-BAND baseSpreads', oob);
        console.log(`\nSummary: ${oob.length} of ${enriched.length} out of band.`);
        return;
    }

    const overdue = enriched.filter(r => r.tier === 'overdue').sort((a, b) => b.days - a.days);
    const aging   = enriched.filter(r => r.tier === 'aging').sort((a, b) => b.days - a.days);
    const fresh   = enriched.filter(r => r.tier === 'fresh').sort((a, b) => a.days - b.days);
    const oob     = enriched.filter(r => r.outOfBand);

    if (onlyOverdue) {
        printGroup('OVERDUE (>90 days)', overdue);
        console.log(`\nSummary: ${overdue.length} of ${enriched.length} overdue.`);
        return;
    }

    printGroup('OVERDUE (>90 days)', overdue);
    printGroup('REFRESH DUE (60-90 days)', aging);
    printGroup('FRESH (<60 days)', fresh);

    console.log('\n' + '─'.repeat(60));
    console.log('Out-of-band baseSpreads');
    console.log('─'.repeat(60));
    if (oob.length === 0) {
        console.log('  (none)');
    } else {
        oob.forEach(r => {
            const b = r.band ? `[${r.band.min}, ${r.band.max}]` : 'NO BAND DEFINED';
            console.log(`  · ${r.ticker} (${r.rating}): baseSpread ${r.baseSpread} bps outside ${b}`);
        });
    }

    console.log(`\nSummary: ${overdue.length} overdue · ${aging.length} due · ${fresh.length} fresh · ${oob.length} out-of-band`);
    if (overdue.length > 0) process.exitCode = 1;
}

main();
