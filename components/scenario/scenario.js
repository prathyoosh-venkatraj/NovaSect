/**
 * NovaSect Scenario — site-wide "Scenario" nav link + the persistent
 * "SCENARIO MODE" banner.
 *
 * The macro-shock controls now live on the full scenario.html page (the former
 * side-panel drawer has been removed). Injected on every page, this component
 * (a) adds the "Scenario" nav item that opens scenario.html, and (b) shows a
 * banner whenever a non-baseline scenario is active so shocked numbers are never
 * mistaken for live ones. State lives in window.NSState ('scenario' event).
 */
(() => {
    if (window.__nsScenarioInit) return;
    window.__nsScenarioInit = true;

    // Labels/units for the banner summary — must match scenario.html controls.
    // [key, label, unit, kind]  kind: 'delta' | 'level' | 'pct'
    const CONTROLS = [
        ['rateBps', 'Rate shock', 'bp', 'delta'],
        ['vix', 'VIX level', '', 'level'],
        ['sectorVolPct', 'Sector vol', '%', 'pct'],
        ['sovereignBps', 'Sovereign', 'bp', 'delta'],
        ['commodityPct', 'Commodity / FX', '%', 'pct'],
    ];

    const STYLE = `
.scn-nav { color:var(--accent-green); text-shadow:0 0 8px rgba(57,255,20,0.55); }
.scn-nav:hover { color:var(--accent-green); text-shadow:0 0 12px rgba(57,255,20,0.9); }
.scn-nav.on { text-shadow:0 0 14px rgba(57,255,20,1); }
.scn-banner { position:fixed; top:0; left:0; right:0; z-index:9998; background:rgba(0,18,0,0.96); border-bottom:1px solid #39FF14; color:#39FF14; font-family:'JetBrains Mono',monospace; font-size:0.72rem; letter-spacing:0.5px; padding:6px 14px; display:flex; align-items:center; justify-content:center; gap:14px; flex-wrap:wrap; }
.scn-banner b { color:#fff; }
.scn-banner a.scn-edit { color:#39FF14; }
.scn-banner button { background:none; border:1px solid #39FF14; color:#39FF14; border-radius:3px; font-size:0.62rem; padding:2px 8px; cursor:pointer; font-family:inherit; }
`;

    function fmt(v, kind, unit) {
        if (kind === 'level') return v > 0 ? String(v) : 'live';
        return v === 0 ? '0' + unit : (v > 0 ? '+' : '') + v + unit;
    }
    function activeShocks(sc) {
        return CONTROLS.filter(([k]) => Number(sc[k])).map(([k, label, unit, kind]) => label + ' ' + fmt(Number(sc[k]), kind, unit));
    }

    let banner, navBtn;
    const readScenario = () => (window.NSState && window.NSState.getScenario()) || {};

    function renderBanner() {
        const shocks = activeShocks(readScenario());
        if (shocks.length) {
            banner.style.display = 'flex';
            banner.innerHTML = '<span><b>⚡ SCENARIO MODE</b> — values are shocked, not live</span>'
                + '<span>' + shocks.join(' · ') + '</span>'
                + '<a class="scn-edit" href="scenario.html">Edit</a>'
                + '<button data-scn-exit>Exit</button>';
            document.body.style.paddingTop = banner.offsetHeight + 'px';
            if (navBtn) navBtn.classList.add('on');
        } else {
            banner.style.display = 'none';
            document.body.style.paddingTop = '';
            if (navBtn) navBtn.classList.remove('on');
        }
    }

    function build() {
        const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);

        // Nav item — opens the full Scenario Lab page (no drawer).
        const nav = document.querySelector('.nav-links');
        if (nav) {
            navBtn = document.createElement('a');
            navBtn.className = 'nav-link scn-nav';
            navBtn.textContent = 'Scenario';
            navBtn.title = 'Scenario Lab';
            navBtn.href = 'scenario.html';
            const wl = nav.querySelector('.gs-wl');
            if (wl) nav.insertBefore(navBtn, wl.nextSibling); else nav.insertBefore(navBtn, nav.firstChild);
        }

        banner = document.createElement('div'); banner.className = 'scn-banner'; banner.style.display = 'none';
        document.body.appendChild(banner);

        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-scn-exit]') && window.NSState) window.NSState.setScenario(null);
        });

        const wire = () => { if (!window.NSState) { setTimeout(wire, 150); return; } window.NSState.on('scenario', renderBanner); renderBanner(); };
        wire();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
})();
