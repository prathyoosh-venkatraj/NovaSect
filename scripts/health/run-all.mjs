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
import {
    checkYahoo, checkFinnhub, checkUniverse, checkPublicAssets,
    checkFred, checkStaleAnchors, checkUniverseDrift, checkFinnhubAuthz,
    checkOsirisEngine, checkPdfRender
} from './checks.mjs';

const SITE_URL = (process.env.SITE_URL || 'https://novasect.space').replace(/\/$/, '');
const SMOKE_TEST = process.env.SMOKE_TEST === 'true';

// ── Smoke-test path ──────────────────────────────────────────────────
// Triggered from the Actions UI via the workflow_dispatch input. Posts
// a single explicit test embed and exits — does NOT touch dedup state,
// does NOT run real checks. Used to verify the webhook is alive after
// a channel/secret change without having to break a real check.
if (SMOKE_TEST) {
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    console.log('[health] smoke-test mode · ' + new Date().toISOString());
    if (!webhook) {
        console.error('[health] DISCORD_WEBHOOK_URL not set — cannot smoke-test');
        process.exit(1);
    }
    try {
        const res = await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                username: 'NovaSect Health',
                embeds: [{
                    title: 'Smoke test',
                    description: 'Webhook is wired up. This is a one-off test post triggered from GitHub Actions — no real check failed.',
                    color: 0x5DADE2,
                    fields: [
                        { name: 'Check',    value: '`smoke-test`',     inline: true },
                        { name: 'Severity', value: 'INFO',             inline: true },
                        { name: 'Source',   value: 'workflow_dispatch', inline: true }
                    ],
                    footer: { text: 'novasect-health · ' + new Date().toISOString() }
                }]
            })
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error('[health] smoke-test POST failed:', res.status, text.slice(0, 200));
            process.exit(1);
        }
        console.log('[health] smoke-test posted · HTTP ' + res.status);
        process.exit(0);
    } catch (e) {
        console.error('[health] smoke-test threw:', e.message);
        process.exit(1);
    }
}

// Order from cheapest → heaviest. Heavy ones (engine, PDF render)
// run last so transient external-API blips don't waste their compute.
const CHECKS = [
    { name: 'yahoo-canary',         fn: () => checkYahoo(SITE_URL) },
    { name: 'finnhub-canary',       fn: () => checkFinnhub(SITE_URL) },
    { name: 'fred-canary',          fn: () => checkFred(SITE_URL) },
    { name: 'universe-coverage',    fn: () => checkUniverse(SITE_URL) },
    { name: 'public-assets',        fn: () => checkPublicAssets(SITE_URL) },
    { name: 'finnhub-authz',        fn: () => checkFinnhubAuthz(SITE_URL) },
    { name: 'stale-anchors',        fn: () => checkStaleAnchors() },
    { name: 'universe-drift',       fn: () => checkUniverseDrift() },
    { name: 'osiris-engine',        fn: () => checkOsirisEngine() },
    { name: 'pdf-render',           fn: () => checkPdfRender(SITE_URL) }
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
