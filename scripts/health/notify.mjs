/**
 * Discord notification helper for NovaSect health checks.
 *
 * Posts to the channel webhook URL supplied via DISCORD_WEBHOOK_URL.
 * Adds two hygiene rules so the channel stays useful:
 *
 *   1. Dedup window — the same failing title for the same check is
 *      suppressed for 6 hours. Prevents a single broken endpoint
 *      from spamming every workflow run.
 *
 *   2. Recovery posts — when a previously-failing check passes
 *      again, a single green "Recovered" message is posted so the
 *      channel reader knows the alarm closed.
 *
 * State (last status + title + timestamp per check) lives in
 * .health/state.json. The workflow persists this between runs via
 * actions/cache so the dedup window survives across schedules.
 */
import fs from 'fs/promises';
import path from 'path';

const STATE_PATH = '.health/state.json';
const DEDUP_WINDOW_MS = 6 * 60 * 60 * 1000; // 6 hours

// Discord embed colour ints — same value Discord uses internally
// (decimal of the hex RGB).
const COLORS = {
    HIGH:      0xE74C3C, // red
    MEDIUM:    0xF1C40F, // amber
    LOW:       0x5DADE2, // blue
    RECOVERED: 0x57F287  // green
};

async function loadState() {
    try {
        const raw = await fs.readFile(STATE_PATH, 'utf8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}
async function saveState(state) {
    await fs.mkdir(path.dirname(STATE_PATH), { recursive: true });
    await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

async function postEmbed(webhook, payload) {
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

function alertEmbed({ check, severity, title, description, evidence }) {
    const fields = [
        { name: 'Check',    value: '`' + check + '`', inline: true },
        { name: 'Severity', value: severity,          inline: true }
    ];
    if (evidence) {
        fields.push({ name: 'Evidence', value: evidence.length > 1000 ? evidence.slice(0, 1000) + '…' : evidence });
    }
    return {
        username: 'NovaSect Health',
        embeds: [{
            title,
            description: description || undefined,
            color: COLORS[severity] || COLORS.LOW,
            fields,
            footer: { text: 'novasect-health · ' + new Date().toISOString() }
        }]
    };
}

function recoveryEmbed(check, prevTitle) {
    return {
        username: 'NovaSect Health',
        embeds: [{
            title: 'Recovered: ' + prevTitle,
            description: '`' + check + '` is healthy again.',
            color: COLORS.RECOVERED,
            footer: { text: 'novasect-health · ' + new Date().toISOString() }
        }]
    };
}

/**
 * @param {{check:string, severity:'pass'|'HIGH'|'MEDIUM'|'LOW', title:string, description?:string, evidence?:string}} input
 */
export async function notify(input) {
    const webhook = process.env.DISCORD_WEBHOOK_URL;
    if (!webhook) {
        console.warn('[health] DISCORD_WEBHOOK_URL not set — dry run for', input.check, input.severity, '·', input.title);
        return;
    }

    const state = await loadState();
    const last = state[input.check];
    const now = Date.now();
    const isPass = input.severity === 'pass';

    if (isPass) {
        // Was previously failing → close the loop with a recovery post.
        if (last && last.status === 'fail') {
            await postEmbed(webhook, recoveryEmbed(input.check, last.title));
        }
        state[input.check] = { status: 'ok', ts: now };
        await saveState(state);
        return;
    }

    // FAIL path. Suppress identical failure within dedup window.
    if (last && last.status === 'fail' && last.title === input.title
        && (now - last.ts) < DEDUP_WINDOW_MS) {
        // Refresh the timestamp so a persistent failure doesn't suddenly
        // re-alert at hour-6+ε of the same incident.
        state[input.check].ts = now;
        await saveState(state);
        return;
    }

    await postEmbed(webhook, alertEmbed(input));
    state[input.check] = { status: 'fail', title: input.title, ts: now };
    await saveState(state);
}
