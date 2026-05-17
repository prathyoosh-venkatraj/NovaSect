#!/usr/bin/env node
/**
 * Layer-1 health check orchestrator. Runs all four canaries serially,
 * routes results through the Discord notifier (with dedup + recovery
 * posts), and exits non-zero if anything failed so the GitHub Actions
 * run shows red in the UI even when Discord suppressed the alert.
 *
 * Invocation:
 *   DISCORD_WEBHOOK_URL=... SITE_URL=https://novasect.space node scripts/health/run-all.mjs
 *
 * Without DISCORD_WEBHOOK_URL the script runs in dry-run mode — it
 * still hits all endpoints and logs to stdout, but skips the Discord
 * POST. Useful for local testing.
 */
import { notify } from './notify.mjs';
import { checkYahoo, checkFinnhub, checkUniverse, checkPublicAssets } from './checks.mjs';

const SITE_URL = (process.env.SITE_URL || 'https://novasect.space').replace(/\/$/, '');

const CHECKS = [
    { name: 'yahoo-canary',      fn: () => checkYahoo(SITE_URL) },
    { name: 'finnhub-canary',    fn: () => checkFinnhub(SITE_URL) },
    { name: 'universe-coverage', fn: () => checkUniverse(SITE_URL) },
    { name: 'public-assets',     fn: () => checkPublicAssets(SITE_URL) }
];

let anyFailed = false;
console.log('[health] starting · site=' + SITE_URL + ' · ' + new Date().toISOString());

for (const { name, fn } of CHECKS) {
    let result;
    try {
        result = await fn();
    } catch (e) {
        result = { severity: 'HIGH', title: 'Check threw uncaught error', evidence: e.stack || e.message };
    }

    console.log('  [' + name + '] ' + result.severity + ' · ' + result.title);

    await notify({
        check: name,
        severity: result.severity,
        title: result.title,
        evidence: result.evidence
    });

    if (result.severity !== 'pass') anyFailed = true;
}

console.log('[health] done · status=' + (anyFailed ? 'fail' : 'ok'));
process.exit(anyFailed ? 1 : 0);
