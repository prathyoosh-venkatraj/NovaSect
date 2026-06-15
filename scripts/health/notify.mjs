/**
 * Discord notification helper — digest mode.
 *
 * The orchestrator (run-all.mjs) calls postDigest(results, siteUrl)
 * once at the end of a cron run with the array of per-check results.
 * We post a single embed containing:
 *
 *   - A title showing N/total passing
 *   - A coloured sidebar (green all-pass · red any HIGH · amber MEDIUM-only)
 *   - A monospace table showing every check + status + severity + reason
 *   - When any check failed, a second "Failure details" block with the
 *     long evidence (truncated to fit Discord's 1024-char per-field limit)
 *
 * Persistent failures intentionally re-appear in every digest — the
 * channel is meant to reflect current system state at each 2-hour
 * heartbeat, not deltas only.
 */

const COLORS = {
    ALL_PASS:    0x57F287, // green
    HIGH_FAIL:   0xE74C3C, // red
    MEDIUM_FAIL: 0xF1C40F, // amber
    LOW_FAIL:    0x5DADE2  // blue (no checks use LOW currently)
};

function pickColor(results) {
    const fails = results.filter(r => r.severity !== 'pass');
    if (fails.length === 0) return COLORS.ALL_PASS;
    if (fails.some(r => r.severity === 'HIGH')) return COLORS.HIGH_FAIL;
    if (fails.some(r => r.severity === 'MEDIUM')) return COLORS.MEDIUM_FAIL;
    return COLORS.LOW_FAIL;
}

function pad(s, n) {
    s = String(s);
    if (s.length >= n) return s.slice(0, n);
    return s + ' '.repeat(n - s.length);
}

function buildTable(results) {
    // Column widths chosen so the longest realistic check name + a
    // ~40-char reason still fit on a Discord desktop code-block line.
    // Mobile users horizontal-scroll — width isn't truncated.
    const W_CHECK  = 18;
    const W_STATUS = 8;
    const W_SEV    = 7;
    const W_REASON = 40;

    const rule = '─'.repeat(W_CHECK + W_STATUS + W_SEV + W_REASON + 6);
    const header = pad('Check', W_CHECK) + '  '
                 + pad('Status', W_STATUS) + '  '
                 + pad('Sev', W_SEV) + '  '
                 + 'Reason';
    const rows = [header, rule];
    for (const r of results) {
        const isPass = r.severity === 'pass';
        const status = isPass ? '✓ PASS' : '✗ FAIL';
        const sev = isPass ? '—' : r.severity;
        const reason = (r.title || '').slice(0, W_REASON);
        rows.push(
            pad(r.check, W_CHECK) + '  '
            + pad(status, W_STATUS) + '  '
            + pad(sev, W_SEV) + '  '
            + reason
        );
    }
    return rows.join('\n');
}

function buildDetails(results) {
    // Compact evidence for failing checks; fits in a single 1024-char
    // Discord field. Truncate aggressively if multiple failures all
    // have long diagnostic blocks.
    const fails = results.filter(r => r.severity !== 'pass' && r.evidence);
    if (fails.length === 0) return null;

    const MAX_CHARS = 950; // leave headroom under 1024
    const blocks = [];
    let used = 0;
    for (const r of fails) {
        const header = '── ' + r.check + ' ──\n';
        const remaining = MAX_CHARS - used - header.length - 4;
        if (remaining <= 50) {
            blocks.push('…' + (fails.length - blocks.length) + ' more failure(s) truncated');
            break;
        }
        // Strip nested triple-backticks — many check evidence blocks
        // already wrap their diagnostics in ``` for the per-alert path
        // that no longer exists, and those would break Discord's outer
        // code block when we re-wrap here.
        const cleanEv = r.evidence.replace(/```/g, '');
        const ev = cleanEv.length > remaining ? cleanEv.slice(0, remaining) + '\n…' : cleanEv;
        const block = header + ev;
        blocks.push(block);
        used += block.length + 2;
    }
    return blocks.join('\n\n');
}

export async function postDigest(results, siteUrl, meta = {}) {
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    const passCount = results.filter(r => r.severity === 'pass').length;
    const total = results.length;
    const tableText = buildTable(results);
    const detailsText = buildDetails(results);

    // Title/description adapt to why we're posting:
    //   reason 'change'    → a check flipped state (alert-on-change run)
    //   reason 'heartbeat' → the once-a-day full snapshot (or a manual run)
    const setLabel = (meta.setLabel && meta.setLabel !== 'all') ? ' (' + meta.setLabel + ')' : '';
    const title = (meta.reason === 'change' ? 'Health change' : 'Health digest')
                + setLabel + ' · ' + passCount + '/' + total + ' passing';
    let description;
    if (meta.reason === 'change') {
        const parts = [];
        if (meta.newly && meta.newly.length)         parts.push('🔴 new fail: ' + meta.newly.join(', '));
        if (meta.recovered && meta.recovered.length) parts.push('🟢 recovered: ' + meta.recovered.join(', '));
        if (parts.length) description = parts.join('   ·   ');
    }

    if (!webhook) {
        console.log('[health] DISCORD_WEBHOOK_URL not set — digest dry-run: ' + title);
        if (description) console.log(description);
        console.log(tableText);
        if (detailsText) console.log('\n' + detailsText);
        return;
    }

    const fields = [
        { name: 'Checks', value: '```\n' + tableText + '\n```' }
    ];
    if (detailsText) {
        fields.push({ name: 'Failure details', value: '```\n' + detailsText + '\n```' });
    }

    const embed = {
        title,
        color: pickColor(results),
        fields,
        footer: { text: 'novasect-health · ' + (siteUrl || '') + ' · ' + new Date().toISOString() }
    };
    if (description) embed.description = description;

    const payload = {
        username: 'NovaSect Health',
        embeds: [embed]
    };

    try {
        const res = await fetch(webhook, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.warn('[health] Discord POST failed:', res.status, text.slice(0, 200));
        }
    } catch (e) {
        console.warn('[health] Discord POST threw:', e.message);
    }
}
