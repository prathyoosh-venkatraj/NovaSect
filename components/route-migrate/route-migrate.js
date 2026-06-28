/**
 * Route migration — rewrite legacy report.html?company=<slug> links to the
 * canonical dossier brief.html?ticker=<SYM>.
 *
 * Per the flagship IA the Company Dossier (brief.html) is the hub; report.html
 * is its deep / PDF view, reached from the dossier's FinVault band. Data-driven
 * (universe.json slug→ticker) so we never hand-edit the ~80 card links, and a
 * MutationObserver catches cards the FinVault explorer renders dynamically.
 * Rewriting the href (vs. intercepting clicks) means right-click / open-in-new-
 * tab also lands on the dossier.
 */
(() => {
    if (window.__nsRouteMigrateInit) return;
    window.__nsRouteMigrateInit = true;

    let slugToTicker = null;

    async function loadMap() {
        if (slugToTicker) return slugToTicker;
        slugToTicker = {};
        try {
            const r = await fetch('data/universe.json');
            if (r.ok) {
                const u = await r.json();
                for (const sym of Object.keys(u.tickers || {})) {
                    const e = u.tickers[sym];
                    if (e.finvault && e.finvault.slug) slugToTicker[e.finvault.slug] = e.ticker;
                }
            }
        } catch { /* leave empty → links left untouched (still functional) */ }
        return slugToTicker;
    }

    function rewrite() {
        const map = slugToTicker || {};
        document.querySelectorAll('a[href*="report.html?company="]').forEach(a => {
            try {
                const u = new URL(a.getAttribute('href'), location.href);
                const slug = u.searchParams.get('company');
                const ticker = slug && map[slug];
                if (ticker) a.setAttribute('href', 'brief.html?ticker=' + encodeURIComponent(ticker));
            } catch { /* skip malformed href */ }
        });
    }

    async function run() {
        await loadMap();
        rewrite();
        const obs = new MutationObserver(muts => {
            for (const m of muts) if (m.addedNodes && m.addedNodes.length) { rewrite(); break; }
        });
        if (document.body) obs.observe(document.body, { childList: true, subtree: true });
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
    else run();
})();
