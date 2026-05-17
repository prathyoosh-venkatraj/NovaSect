/**
 * The four Layer-1 canaries. Each returns a result object:
 *
 *   { severity: 'pass' | 'HIGH', title: string, evidence?: string }
 *
 * Severity is HIGH or pass — no medium/low for the minimal slice
 * (all four were declared HIGH-severity at planning time).
 *
 * All checks hit the live production deployment so failures reflect
 * what real users actually see. SITE_URL defaults to novasect.space.
 */

const REQUEST_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url, init = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
        return await fetch(url, { ...init, signal: ctrl.signal });
    } finally {
        clearTimeout(t);
    }
}

async function timed(fn) {
    const t0 = Date.now();
    const res = await fn();
    return { res, ms: Date.now() - t0 };
}

const ok = (title) => ({ severity: 'pass', title });
const fail = (title, evidence) => ({ severity: 'HIGH', title, evidence });

// ── 1. Yahoo proxy canary ──────────────────────────────────────────
//   GET /api/yahoo-proxy?mode=quote-summary&symbol=XOM
//   Asserts 200 + the modules we actually consume in the FinVault /
//   Brief flows (trailingPE drops from defaultKeyStatistics).
export async function checkYahoo(siteUrl) {
    const url = siteUrl + '/api/yahoo-proxy?mode=quote-summary&symbol=XOM';
    let t;
    try { t = await timed(() => fetchWithTimeout(url)); }
    catch (e) { return fail('Yahoo proxy unreachable', e.message); }
    if (!t.res.ok) {
        return fail('Yahoo proxy returned ' + t.res.status, url + ' in ' + t.ms + ' ms');
    }
    let data;
    try { data = await t.res.json(); }
    catch { return fail('Yahoo proxy payload not JSON', '(' + t.ms + ' ms)'); }
    // Schema is { trailingPE, forwardPE, priceToBook, enterpriseToEbitda } per the proxy.
    if (data == null || typeof data !== 'object') {
        return fail('Yahoo proxy returned non-object payload', JSON.stringify(data).slice(0, 200));
    }
    if (typeof data.trailingPE !== 'number' && data.trailingPE !== null) {
        return fail('Yahoo proxy missing trailingPE field', JSON.stringify(data).slice(0, 200));
    }
    return ok('Yahoo proxy healthy (' + t.ms + ' ms)');
}

// ── 2. Finnhub proxy canary ────────────────────────────────────────
//   GET /api/finnhub-proxy?endpoint=stock/metric&symbol=AAPL
//   Asserts 200 + the TTM block we depend on for live multiples.
export async function checkFinnhub(siteUrl) {
    const url = siteUrl + '/api/finnhub-proxy?endpoint=stock/metric&symbol=AAPL';
    let t;
    try { t = await timed(() => fetchWithTimeout(url)); }
    catch (e) { return fail('Finnhub proxy unreachable', e.message); }
    if (!t.res.ok) {
        return fail('Finnhub proxy returned ' + t.res.status, url + ' in ' + t.ms + ' ms');
    }
    let data;
    try { data = await t.res.json(); }
    catch { return fail('Finnhub proxy payload not JSON', '(' + t.ms + ' ms)'); }
    if (!data || !data.metric || typeof data.metric.peExclExtraTTM !== 'number') {
        return fail('Finnhub proxy missing metric.peExclExtraTTM',
            JSON.stringify(data).slice(0, 200));
    }
    return ok('Finnhub proxy healthy (' + t.ms + ' ms)');
}

// ── 3. Universe coverage ───────────────────────────────────────────
//   Fetches the live data/universe.json and verifies every ticker has
//   the keystone fields the brief / finvault / sentinel / osiris
//   pages depend on. Catches silent data rot from build-universe runs.
export async function checkUniverse(siteUrl) {
    const url = siteUrl + '/data/universe.json';
    let res;
    try { res = await fetchWithTimeout(url); }
    catch (e) { return fail('universe.json unreachable', e.message); }
    if (!res.ok) return fail('universe.json returned ' + res.status, url);

    let data;
    try { data = await res.json(); }
    catch { return fail('universe.json malformed (not JSON)', ''); }
    if (!data || !data.tickers || typeof data.tickers !== 'object') {
        return fail('universe.json malformed (no .tickers)', '');
    }
    const tickers = Object.values(data.tickers);
    if (tickers.length === 0) return fail('universe.json has zero tickers', '');

    const issues = [];
    for (const t of tickers) {
        if (!t.ticker)                                        issues.push('<unknown>: no ticker key');
        if (!t.name)                                          issues.push(t.ticker + ': no name');
        if (!t.sentinel || typeof t.sentinel.baseSpread !== 'number')
                                                              issues.push(t.ticker + ': no sentinel.baseSpread');
        if (!t.osiris   || typeof t.osiris.baselineVolatility !== 'number')
                                                              issues.push(t.ticker + ': no osiris.baselineVolatility');
    }
    if (issues.length) {
        const sample = issues.slice(0, 10).join('\n');
        const more = issues.length > 10 ? '\n…and ' + (issues.length - 10) + ' more' : '';
        return fail(issues.length + ' universe coverage gaps across ' + tickers.length + ' tickers',
            '```\n' + sample + more + '\n```');
    }
    return ok(tickers.length + ' tickers, all required fields present');
}

// ── 4. Public asset HEAD check ─────────────────────────────────────
//   HEADs each page + the two static config files. Catches deploy
//   regressions (404s, 500s, redirect loops) before users do.
export async function checkPublicAssets(siteUrl) {
    const assets = [
        '/', '/index.html',
        '/sentinel.html', '/osiris.html', '/reports.html', '/report.html',
        '/brief.html', '/energy.html', '/industrials.html', '/about.html',
        '/data/universe.json', '/physics-config.json'
    ];
    const failures = [];
    await Promise.all(assets.map(async (a) => {
        try {
            const res = await fetchWithTimeout(siteUrl + a, { method: 'HEAD' });
            if (!res.ok) failures.push(a + ' → ' + res.status);
        } catch (e) {
            failures.push(a + ' → ' + e.message);
        }
    }));
    if (failures.length) {
        return fail(failures.length + '/' + assets.length + ' public assets non-200',
            '```\n' + failures.join('\n') + '\n```');
    }
    return ok(assets.length + ' public assets returning 200');
}
