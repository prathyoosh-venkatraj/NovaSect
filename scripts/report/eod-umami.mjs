/**
 * NovaSect — End-of-Day Analytics Report
 *
 * Pulls last-7-days (rolling, including today) metrics from the Umami Cloud
 * API and posts a digest embed to Discord. Designed to run once daily from
 * .github/workflows/eod-report.yml (reuses the health-check Discord pattern).
 *
 * Env vars:
 *   UMAMI_API_KEY              (required) — Umami Cloud API key (Settings -> API)
 *   UMAMI_WEBSITE_ID           (optional) — defaults to the NovaSect site id
 *   UMAMI_API_BASE             (optional) — defaults to https://api.umami.is/v1
 *   DISCORD_REPORT_WEBHOOK_URL (optional) — falls back to DISCORD_WEBHOOK_URL
 *   DISCORD_WEBHOOK_URL        (optional) — existing health webhook
 *   SITE_URL                   (optional) — for the footer; defaults novasect.space
 *
 * Local dry-run (prints the embed instead of posting):
 *   UMAMI_API_KEY=... node scripts/report/eod-umami.mjs
 */

const API_BASE   = process.env.UMAMI_API_BASE  || 'https://api.umami.is/v1';
const WEBSITE_ID = process.env.UMAMI_WEBSITE_ID || '134ef845-3a61-49b4-b2f2-1a954fc62467';
const API_KEY    = process.env.UMAMI_API_KEY;
const WEBHOOK    = process.env.DISCORD_REPORT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
const SITE_URL   = process.env.SITE_URL || 'https://novasect.space';
const TZ         = 'Europe/Berlin';
const DAY_MS     = 24 * 60 * 60 * 1000;

// ── Umami API ───────────────────────────────────────────────────────────────

async function umami(path, params = {}) {
  const url = new URL(`${API_BASE}/websites/${WEBSITE_ID}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { 'x-umami-api-key': API_KEY, accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Umami ${path} -> ${res.status} ${body.slice(0, 200)}`);
  }
  return res.json();
}

const statVal = (s) => (s && typeof s.value === 'number' ? s.value : Number(s) || 0);

// Top-pages metric: Umami renamed the page metric `type` between versions
// ('url' on older, 'path' on current). Try both so this works regardless.
async function pageMetric(startAt, endAt) {
  for (const type of ['url', 'path']) {
    try {
      const rows = await umami('/metrics', { startAt, endAt, type, limit: 6 });
      if (Array.isArray(rows) && rows.length) return rows;
    } catch { /* try next type */ }
  }
  return [];
}

// ── Formatting helpers ────────────────────────────────────────────────────────

const fmtInt = (n) => Math.round(n).toLocaleString('en-US');
function fmtDuration(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '0s';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}
function delta(cur, prev) {
  if (!Number.isFinite(prev) || prev === 0) return cur > 0 ? '  (new)' : '';
  const pct = ((cur - prev) / prev) * 100;
  const arrow = pct > 0.5 ? '▲' : pct < -0.5 ? '▼' : '–';
  return `  ${arrow}${Math.abs(pct).toFixed(0)}%`;
}
function pad(s, n) { s = String(s); return s.length >= n ? s : s + ' '.repeat(n - s.length); }

// ── Build the report ──────────────────────────────────────────────────────────

async function buildReport() {
  const endAt   = Date.now();
  const startAt = endAt - 7 * DAY_MS;          // last 7 days incl. today (rolling)
  const prevEnd = startAt;
  const prevStart = startAt - 7 * DAY_MS;       // prior 7 days, for WoW deltas

  const [stats, prev, urls, referrers, events, series] = await Promise.all([
    umami('/stats',   { startAt, endAt }),
    umami('/stats',   { startAt: prevStart, endAt: prevEnd }).catch(() => null),
    pageMetric(startAt, endAt),
    umami('/metrics', { startAt, endAt, type: 'referrer', limit: 5 }).catch(() => []),
    umami('/metrics', { startAt, endAt, type: 'event',    limit: 6 }).catch(() => []),
    umami('/pageviews', { startAt, endAt, unit: 'day', timezone: TZ }).catch(() => null),
  ]);

  const views    = statVal(stats.pageviews);
  const visitors = statVal(stats.visitors);
  const visits   = statVal(stats.visits);
  const bounces  = statVal(stats.bounces);
  const totaltime = statVal(stats.totaltime);
  const bounceRate = visits > 0 ? (bounces / visits) * 100 : 0;
  const avgVisit   = visits > 0 ? totaltime / visits : 0;

  const pViews    = prev ? statVal(prev.pageviews) : NaN;
  const pVisitors = prev ? statVal(prev.visitors)  : NaN;
  const pVisits   = prev ? statVal(prev.visits)    : NaN;
  const pBounceR  = prev && statVal(prev.visits) > 0 ? (statVal(prev.bounces) / statVal(prev.visits)) * 100 : NaN;

  // ── Field 1: traffic summary (code block) ──
  const summary = [
    `${pad('Views',        13)} ${pad(fmtInt(views), 8)}${delta(views, pViews)}`,
    `${pad('Visitors',     13)} ${pad(fmtInt(visitors), 8)}${delta(visitors, pVisitors)}`,
    `${pad('Visits',       13)} ${pad(fmtInt(visits), 8)}${delta(visits, pVisits)}`,
    `${pad('Bounce rate',  13)} ${pad(bounceRate.toFixed(1) + '%', 8)}${delta(bounceRate, pBounceR)}`,
    `${pad('Avg. visit',   13)} ${pad(fmtDuration(avgVisit), 8)}`,
  ].join('\n');

  // ── Field 2: per-day views (from the day series) ──
  let dailyText = 'n/a';
  if (series && Array.isArray(series.pageviews) && series.pageviews.length) {
    const max = Math.max(...series.pageviews.map(p => p.y), 1);
    dailyText = series.pageviews.slice(-7).map(p => {
      const label = new Date(p.x).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', timeZone: TZ });
      const bar = '█'.repeat(Math.round((p.y / max) * 16));
      return `${pad(label, 8)} ${pad(fmtInt(p.y), 6)} ${bar}`;
    }).join('\n');
  }

  const listOrNone = (rows, empty) =>
    (rows && rows.length)
      ? rows.map(r => `${pad(String(r.x).slice(0, 28), 30)} ${fmtInt(r.y)}`).join('\n')
      : empty;

  const fields = [
    { name: 'Traffic · last 7 days', value: '```\n' + summary + '\n```' },
    { name: 'Daily views',           value: '```\n' + dailyText + '\n```' },
    { name: 'Top pages',             value: '```\n' + listOrNone(urls, '(none)') + '\n```' },
    { name: 'Top referrers',         value: '```\n' + listOrNone(referrers, '(direct / none)') + '\n```' },
    { name: 'Top events (clicks)',   value: '```\n' + listOrNone(events, 'no custom events tracked yet') + '\n```' },
  ];

  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: TZ });
  return {
    username: 'NovaSect Analytics',
    embeds: [{
      title: `NovaSect — Daily Analytics · ${today}`,
      description: `Rolling 7-day window (incl. today). Deltas vs the prior 7 days.`,
      color: 0xF5C518,
      fields,
      footer: { text: `umami · ${SITE_URL} · ${new Date().toISOString()}` },
    }],
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  // Exit 0 on every error path: this report posts to Discord, so a failure
  // should be logged in the Actions run (not emailed to the repo owner as a
  // GitHub "workflow failed" notification). Genuine breakages show in the logs.
  if (!API_KEY) {
    console.error('[eod] UMAMI_API_KEY not set — cannot fetch analytics; skipping.');
    process.exit(0);
  }
  let payload;
  try {
    payload = await buildReport();
  } catch (e) {
    console.error('[eod] Failed to build report:', e.message);
    process.exit(0);
  }

  if (!WEBHOOK) {
    console.log('[eod] No Discord webhook set — dry-run. Embed payload:');
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  try {
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error('[eod] Discord POST failed:', res.status, (await res.text().catch(() => '')).slice(0, 200));
      process.exit(0);
    }
    console.log('[eod] Report posted to Discord.');
  } catch (e) {
    console.error('[eod] Discord POST threw:', e.message);
    process.exit(0);
  }
})();
