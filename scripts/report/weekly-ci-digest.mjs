/**
 * weekly-ci-digest.mjs
 *
 * Posts a weekly summary of GitHub Actions workflow FAILURES over the last 7
 * days to Discord — "what broke this week" across all workflows. Replaces the
 * old daily Umami EOD report.
 *
 * Env (provided by the workflow):
 *   GH_TOKEN  — GITHUB_TOKEN with actions:read (read workflow runs)
 *   GH_REPO   — owner/repo (github.repository)
 *   DISCORD_REPORT_WEBHOOK_URL (preferred) or DISCORD_WEBHOOK_URL
 *
 * Local dry-run (prints the embed, no post):
 *   GH_TOKEN=$(gh auth token) GH_REPO=prathyoosh-venkatraj/NovaSect node scripts/report/weekly-ci-digest.mjs
 *
 * Exits 0 on every error path: failures are logged in the Actions run, never
 * emailed to the repo owner as a workflow-failure notification.
 */

const TOKEN   = process.env.GH_TOKEN;
const REPO    = process.env.GH_REPO;
const WEBHOOK = process.env.DISCORD_REPORT_WEBHOOK_URL || process.env.DISCORD_WEBHOOK_URL;
const DAYS    = 7;
const FAIL_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);

async function gh(path) {
  const res = await fetch('https://api.github.com' + path, {
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'novasect-weekly-ci',
    },
  });
  if (!res.ok) throw new Error('GitHub ' + path + ' -> ' + res.status + ' ' + (await res.text().catch(() => '')).slice(0, 160));
  return res.json();
}

(async () => {
  if (!TOKEN || !REPO) {
    console.error('[ci] GH_TOKEN / GH_REPO not set — skipping.');
    process.exit(0);
  }

  const since = new Date(Date.now() - DAYS * 86400000).toISOString().slice(0, 10);

  // Fetch every run created in the window (paginate; cap at 5 pages = 500 runs).
  const runs = [];
  try {
    for (let page = 1; page <= 5; page++) {
      const q = '/repos/' + REPO + '/actions/runs?created=' + encodeURIComponent('>=' + since) + '&per_page=100&page=' + page;
      const data = await gh(q);
      const batch = data.workflow_runs || [];
      runs.push(...batch);
      if (batch.length < 100) break;
    }
  } catch (e) {
    console.error('[ci] could not fetch workflow runs:', e.message);
    process.exit(0);
  }

  // Aggregate by workflow name.
  const byWf = new Map();
  for (const r of runs) {
    const wf = r.name || 'unknown';
    if (!byWf.has(wf)) byWf.set(wf, { total: 0, failed: 0, lastFail: null });
    const e = byWf.get(wf);
    e.total++;
    if (FAIL_CONCLUSIONS.has(r.conclusion)) {
      e.failed++;
      if (!e.lastFail || r.created_at > e.lastFail.created_at) e.lastFail = r;
    }
  }

  const totalRuns   = runs.length;
  const totalFailed = [...byWf.values()].reduce((s, e) => s + e.failed, 0);
  const failedWfs   = [...byWf.entries()].filter(([, e]) => e.failed > 0).sort((a, b) => b[1].failed - a[1].failed);
  const healthy     = [...byWf.keys()].length - failedWfs.length;

  const green = 0x57F287, red = 0xE74C3C;
  const embed = {
    title: totalFailed > 0
      ? '⚠ Weekly CI — ' + totalFailed + ' failed run' + (totalFailed === 1 ? '' : 's') + ' in the last 7 days'
      : '✓ Weekly CI — all green over the last 7 days',
    color: totalFailed > 0 ? red : green,
    description: totalRuns + ' runs across ' + byWf.size + ' workflows · ' + since + ' → today'
               + (totalFailed > 0 ? '  ·  ' + healthy + ' workflow' + (healthy === 1 ? '' : 's') + ' clean' : ''),
    fields: failedWfs.slice(0, 20).map(([wf, e]) => ({
      name: wf,
      value: e.failed + ' failed / ' + e.total + ' runs'
           + (e.lastFail ? ' — [last failure](' + e.lastFail.html_url + ')' : ''),
    })),
    footer: { text: 'novasect-weekly-ci · ' + new Date().toISOString() },
  };

  if (!WEBHOOK) {
    console.log('[ci] No Discord webhook set — dry-run. Embed:');
    console.log(JSON.stringify(embed, null, 2));
    process.exit(0);
  }

  try {
    const res = await fetch(WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'NovaSect CI', embeds: [embed] }),
    });
    if (!res.ok) console.error('[ci] Discord POST failed:', res.status, (await res.text().catch(() => '')).slice(0, 160));
    else console.log('[ci] Weekly CI digest posted to Discord (' + totalFailed + ' failures).');
  } catch (e) {
    console.error('[ci] Discord POST threw:', e.message);
  }
  process.exit(0);
})();
