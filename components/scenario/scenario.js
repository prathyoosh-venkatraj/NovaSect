/**
 * NovaSect Scenario Lab — the global macro-shock console.
 *
 * Injected site-wide (global-search ensures it loads). Adds a "⚡ Scenario" nav
 * item, a right slide-over drawer (sliders + presets + reset), and a persistent
 * "SCENARIO MODE" banner shown on every page while a non-baseline scenario is
 * active — so shocked numbers are never mistaken for live ones. State lives in
 * window.NSState (URL-hydratable, shareable); engines subscribe to 'scenario'.
 */
(() => {
    if (window.__nsScenarioInit) return;
    window.__nsScenarioInit = true;

    // [key, label, min, max, step, unit, kind]  kind: 'delta' | 'level' | 'pct'
    const CONTROLS = [
        ['rateBps', 'Rate shock', -300, 300, 25, 'bp', 'delta'],
        ['vix', 'VIX level', 10, 90, 1, '', 'level'],
        ['sectorVolPct', 'Sector vol', -30, 60, 5, '%', 'pct'],
        ['sovereignBps', 'Sovereign', 0, 300, 10, 'bp', 'delta'],
        ['commodityPct', 'Commodity / FX', -60, 60, 5, '%', 'pct'],
    ];
    const PRESETS = {
        'Baseline': { rateBps: 0, vix: 0, sectorVolPct: 0, sovereignBps: 0, commodityPct: 0 },
        '2008 GFC': { rateBps: -150, vix: 80, sectorVolPct: 30, sovereignBps: 50, commodityPct: -40 },
        'COVID 2020': { rateBps: -100, vix: 65, sectorVolPct: 25, sovereignBps: 20, commodityPct: -50 },
        'Rate +200': { rateBps: 200, vix: 25, sectorVolPct: 5, sovereignBps: 0, commodityPct: 0 },
        'Soft landing': { rateBps: -50, vix: 14, sectorVolPct: -5, sovereignBps: 0, commodityPct: 0 },
    };

    const STYLE = `
.scn-nav { display:inline-flex; align-items:center; gap:4px; color:#7DD3FC; text-decoration:none; font-family:'JetBrains Mono',monospace; font-size:0.9rem; margin-right:1rem; cursor:pointer; }
.scn-nav:hover { filter:brightness(1.2); } .scn-nav.on { text-shadow:0 0 8px rgba(125,211,252,0.6); }
.scn-banner { position:fixed; top:0; left:0; right:0; z-index:9998; background:rgba(8,30,46,0.96); border-bottom:1px solid #7DD3FC; color:#7DD3FC; font-family:'JetBrains Mono',monospace; font-size:0.72rem; letter-spacing:0.5px; padding:6px 14px; display:flex; align-items:center; justify-content:center; gap:14px; }
.scn-banner b { color:#fff; } .scn-banner button { background:none; border:1px solid #7DD3FC; color:#7DD3FC; border-radius:3px; font-size:0.62rem; padding:2px 8px; cursor:pointer; font-family:inherit; }
.scn-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:10000; opacity:0; pointer-events:none; transition:opacity 0.2s ease; }
.scn-overlay.open { opacity:1; pointer-events:auto; }
.scn-drawer { position:fixed; top:0; right:0; height:100%; width:360px; max-width:90vw; background:rgba(2,10,16,0.98); border-left:1px solid rgba(125,211,252,0.4); box-shadow:-8px 0 30px rgba(0,0,0,0.5); z-index:10001; transform:translateX(100%); transition:transform 0.22s ease; overflow-y:auto; padding:1.4rem; }
.scn-drawer.open { transform:translateX(0); }
.scn-h { font-family:'JetBrains Mono',monospace; color:#7DD3FC; font-size:0.95rem; letter-spacing:2px; text-transform:uppercase; display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem; }
.scn-h button { background:none; border:none; color:rgba(255,255,255,0.5); font-size:1.3rem; cursor:pointer; }
.scn-sub { font-family:'JetBrains Mono',monospace; font-size:0.62rem; color:rgba(255,255,255,0.4); margin-bottom:1.2rem; }
.scn-presets { display:flex; flex-wrap:wrap; gap:6px; margin-bottom:1.4rem; }
.scn-preset { font-family:'JetBrains Mono',monospace; font-size:0.66rem; color:#7DD3FC; background:rgba(125,211,252,0.08); border:1px solid rgba(125,211,252,0.35); border-radius:4px; padding:5px 9px; cursor:pointer; }
.scn-preset:hover { border-color:#7DD3FC; }
.scn-ctrl { margin-bottom:1.1rem; }
.scn-ctrl-top { display:flex; justify-content:space-between; font-family:'JetBrains Mono',monospace; font-size:0.7rem; color:rgba(255,255,255,0.75); margin-bottom:5px; }
.scn-ctrl-val { color:#7DD3FC; }
.scn-ctrl input[type=range] { width:100%; accent-color:#7DD3FC; }
.scn-actions { display:flex; gap:8px; margin-top:1.4rem; }
.scn-btn { flex:1; font-family:'JetBrains Mono',monospace; font-size:0.72rem; padding:8px; border-radius:4px; cursor:pointer; background:rgba(125,211,252,0.1); border:1px solid rgba(125,211,252,0.4); color:#7DD3FC; }
.scn-btn.reset { background:rgba(255,77,77,0.08); border-color:rgba(255,77,77,0.4); color:#FF4D4D; }
@media (max-width:768px){ .scn-nav span.scn-label{display:none;} }
`;

    function fmt(v, kind, unit) {
        if (kind === 'level') return v > 0 ? String(v) : 'live';
        const s = (v > 0 ? '+' : '') + v;
        return v === 0 ? '0' + unit : s + unit;
    }

    let drawer, overlay, banner, navBtn;

    function readScenario() { return (window.NSState && window.NSState.getScenario()) || {}; }

    function syncControls() {
        const sc = readScenario();
        CONTROLS.forEach(([k, , , , , unit, kind]) => {
            const input = drawer.querySelector('input[data-k="' + k + '"]');
            const val = drawer.querySelector('.scn-ctrl-val[data-k="' + k + '"]');
            if (input) { input.value = Number(sc[k]) || 0; if (val) val.textContent = fmt(Number(input.value), kind, unit); }
        });
    }

    function activeShocks(sc) {
        return CONTROLS.filter(([k]) => Number(sc[k])).map(([k, label, , , , unit, kind]) => label + ' ' + fmt(Number(sc[k]), kind, unit));
    }

    function renderBanner() {
        const sc = readScenario();
        const shocks = activeShocks(sc);
        if (shocks.length) {
            banner.style.display = 'flex';
            banner.innerHTML = '<span><b>⚡ SCENARIO MODE</b> — values are shocked, not live</span><span>' + shocks.join(' · ') + '</span><button data-scn-exit>Exit</button>';
            document.body.style.paddingTop = banner.offsetHeight + 'px';
            if (navBtn) navBtn.classList.add('on');
        } else {
            banner.style.display = 'none';
            document.body.style.paddingTop = '';
            if (navBtn) navBtn.classList.remove('on');
        }
    }

    function apply() {
        const sc = {};
        CONTROLS.forEach(([k]) => { const input = drawer.querySelector('input[data-k="' + k + '"]'); sc[k] = Number(input.value) || 0; });
        if (window.NSState) window.NSState.setScenario(sc);   // emits 'scenario'
    }

    function openDrawer() { syncControls(); overlay.classList.add('open'); drawer.classList.add('open'); }
    function closeDrawer() { overlay.classList.remove('open'); drawer.classList.remove('open'); }

    function build() {
        const style = document.createElement('style'); style.textContent = STYLE; document.head.appendChild(style);

        // Nav item
        const nav = document.querySelector('.nav-links');
        if (nav) {
            navBtn = document.createElement('a');
            navBtn.className = 'scn-nav';
            navBtn.innerHTML = '⚡<span class="scn-label">Scenario</span>';
            navBtn.title = 'Scenario Lab';
            navBtn.addEventListener('click', openDrawer);
            // place after the watchlist star if present, else first
            const wl = nav.querySelector('.gs-wl');
            if (wl) nav.insertBefore(navBtn, wl.nextSibling); else nav.insertBefore(navBtn, nav.firstChild);
        }

        overlay = document.createElement('div'); overlay.className = 'scn-overlay';
        drawer = document.createElement('div'); drawer.className = 'scn-drawer';
        drawer.innerHTML =
            '<div class="scn-h">⚡ Scenario Lab <button data-scn-close aria-label="Close">×</button></div>'
            + '<div class="scn-sub">Shock the macro inputs; Sentinel, Osiris and the multi-issuer table recompute. <a href="scenario.html" style="color:#7DD3FC;">Open full table →</a></div>'
            + '<div class="scn-presets">' + Object.keys(PRESETS).map(p => '<button class="scn-preset" data-preset="' + p + '">' + p + '</button>').join('') + '</div>'
            + CONTROLS.map(([k, label, min, max, step, unit, kind]) =>
                '<div class="scn-ctrl"><div class="scn-ctrl-top"><span>' + label + '</span><span class="scn-ctrl-val" data-k="' + k + '">' + fmt(0, kind, unit) + '</span></div>'
                + '<input type="range" data-k="' + k + '" min="' + min + '" max="' + max + '" step="' + step + '" value="0"></div>').join('')
            + '<div class="scn-actions"><button class="scn-btn reset" data-scn-reset>Reset to baseline</button><a class="scn-btn" href="scenario.html" style="text-align:center;text-decoration:none;line-height:1.6;">Multi-issuer →</a></div>';

        banner = document.createElement('div'); banner.className = 'scn-banner'; banner.style.display = 'none';
        document.body.appendChild(overlay); document.body.appendChild(drawer); document.body.appendChild(banner);

        overlay.addEventListener('click', closeDrawer);
        drawer.addEventListener('input', (e) => { if (e.target.matches('input[type=range]')) { const k = e.target.dataset.k; const c = CONTROLS.find(x => x[0] === k); const val = drawer.querySelector('.scn-ctrl-val[data-k="' + k + '"]'); if (val) val.textContent = fmt(Number(e.target.value), c[6], c[5]); apply(); } });
        drawer.addEventListener('click', (e) => {
            const p = e.target.closest('.scn-preset');
            if (p) { const preset = PRESETS[p.dataset.preset]; if (window.NSState) window.NSState.setScenario(preset); syncControls(); return; }
            if (e.target.closest('[data-scn-close]')) closeDrawer();
            if (e.target.closest('[data-scn-reset]')) { if (window.NSState) window.NSState.setScenario(null); syncControls(); }
        });
        document.addEventListener('click', (e) => { if (e.target.closest('[data-scn-exit]')) { if (window.NSState) window.NSState.setScenario(null); syncControls(); } });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });

        // React to scenario changes (from here, URL hydrate, or other surfaces).
        const wire = () => { if (!window.NSState) { setTimeout(wire, 150); return; } window.NSState.on('scenario', renderBanner); renderBanner(); };
        wire();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
})();
