/**
 * NovaSect Global Search — small, self-contained header component.
 *
 * Loads on every NovaSect page via a single <script> tag. On
 * DOMContentLoaded it injects itself into the .nav-links cluster,
 * immediately to the left of the "Tools" dropdown, and provides
 * fuzzy ticker / company-name search across the 83-entry universe.
 * Picking a result navigates to brief.html?ticker=<symbol>.
 *
 * Match priority (same algorithm as the Osiris combobox):
 *   exact ticker > ticker prefix > name-word prefix > substring.
 *
 * No external dependencies. Styles injected as a single <style> tag.
 */
(() => {
    if (window.__novasectGlobalSearchInit) return;
    window.__novasectGlobalSearchInit = true;

    const STYLE = `
.gs-wrap {
    position: relative;
    margin-right: 1rem;
}
.gs-input-wrap {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: rgba(0, 18, 0, 0.55);
    border: 1px solid rgba(57, 255, 20, 0.3);
    border-radius: 3px;
    padding: 0 10px;
    height: 32px;
    width: 220px;
    transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.gs-input-wrap:focus-within {
    border-color: rgba(57, 255, 20, 0.7);
    box-shadow: 0 0 8px rgba(57, 255, 20, 0.25);
}
.gs-icon {
    color: rgba(57, 255, 20, 0.55);
    font-family: 'JetBrains Mono', monospace, monospace;
    font-size: 0.85rem;
}
.gs-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: rgba(255, 255, 255, 0.92);
    font-family: 'JetBrains Mono', monospace, monospace;
    font-size: 0.78rem;
    letter-spacing: 0.5px;
}
.gs-input::placeholder {
    color: rgba(255, 255, 255, 0.35);
    letter-spacing: 1px;
}
.gs-panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    width: 360px;
    max-height: 380px;
    overflow-y: auto;
    background: rgba(0, 12, 0, 0.97);
    border: 1px solid rgba(57, 255, 20, 0.35);
    border-radius: 3px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55), 0 0 18px rgba(57, 255, 20, 0.12);
    z-index: 9999;
    padding: 4px 0;
}
.gs-item {
    display: grid;
    grid-template-columns: 80px 1fr auto;
    gap: 10px;
    align-items: center;
    padding: 8px 12px;
    cursor: pointer;
    border-left: 2px solid transparent;
    text-decoration: none;
}
.gs-item:hover, .gs-item.active {
    background: rgba(57, 255, 20, 0.1);
    border-left-color: rgba(57, 255, 20, 1);
}
.gs-ticker {
    color: rgba(57, 255, 20, 1);
    font-family: 'JetBrains Mono', monospace, monospace;
    font-size: 0.8rem;
    font-weight: 700;
}
.gs-name {
    color: rgba(255, 255, 255, 0.85);
    font-family: 'Montserrat', sans-serif;
    font-size: 0.78rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.gs-sector {
    color: rgba(57, 255, 20, 0.55);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6rem;
    letter-spacing: 1px;
    text-transform: uppercase;
}
.gs-empty {
    padding: 16px;
    text-align: center;
    color: rgba(57, 255, 20, 0.4);
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
}
@media (max-width: 768px) {
    /* Mobile layout after the hamburger menu collapses Tools + About:
         [Logo]                       [Search]    [☰]
       The search now has ~half the row to itself, so we size it
       prominently — the cleanest way to make it the obvious primary
       affordance on phones. */
    .nav-links { gap: 0.85rem; }
    /* Don't let the search wrap stretch to fill — keep a comfortable
       gap between the logo and the search box. */
    .gs-wrap { margin-right: 0; flex: 0 1 auto; max-width: 180px; }
    .gs-input-wrap {
        width: 180px;
        height: 34px;
        padding: 0 10px;
    }
    .gs-icon { font-size: 0.95em; margin-right: 7px; }
    .gs-input {
        font-size: 0.82rem;
        letter-spacing: 0.3px;
    }
    /* Result panel anchored to right edge, comfortably wide. */
    .gs-panel {
        width: 320px;
        right: 0;
        max-height: 360px;
    }
    .gs-item { grid-template-columns: 78px 1fr auto; padding: 8px 12px; }
    .gs-ticker { font-size: 0.82rem; }
    .gs-name { font-size: 0.78rem; }
    .gs-sector { font-size: 0.58rem; }
}
@media (max-width: 380px) {
    /* iPhone SE-class — search shrinks but stays visible. */
    .gs-wrap { max-width: 150px; }
    .gs-input-wrap { width: 150px; }
    .gs-panel { width: 280px; }
}
`;

    const GENERIC_WORDS = new Set([
        'the', 'and', 'group', 'company', 'corp', 'corporation', 'inc',
        'plc', 'spa', 'se', 'ag', 'sa', 'nv', 'limited', 'ltd', 'holdings',
        'deutsche', 'american', 'general', 'national', 'public'
    ]);

    function rankMatch(item, q) {
        const t = item.ticker.toLowerCase();
        const n = (item.name || '').toLowerCase();
        if (t === q) return 100;
        if (t.startsWith(q)) return 80;
        const words = n.split(/[\s\-,&]+/).filter(Boolean);
        if (words.some(w => w.startsWith(q))) return 60;
        if (t.includes(q)) return 40;
        if (n.includes(q)) return 20;
        return -1;
    }

    let universeCache = null;
    async function loadUniverse() {
        if (universeCache) return universeCache;
        try {
            const res = await fetch('data/universe.json');
            if (!res.ok) return [];
            const data = await res.json();
            universeCache = Object.values(data.tickers || {}).map(t => ({
                ticker: t.ticker,
                name: t.name,
                sector: t.sector
            }));
            return universeCache;
        } catch (e) {
            return [];
        }
    }

    function injectStyles() {
        if (document.getElementById('gs-styles')) return;
        const s = document.createElement('style');
        s.id = 'gs-styles';
        s.textContent = STYLE;
        document.head.appendChild(s);
    }

    function buildElement() {
        const wrap = document.createElement('div');
        wrap.className = 'gs-wrap';
        wrap.innerHTML = `
            <div class="gs-input-wrap">
                <span class="gs-icon" aria-hidden="true">⌕</span>
                <input class="gs-input" type="text" placeholder="Search ticker or company..." autocomplete="off" spellcheck="false" />
            </div>
            <div class="gs-panel" hidden></div>
        `;
        return wrap;
    }

    function mount() {
        const nav = document.querySelector('.nav-links');
        if (!nav) return;
        injectStyles();
        const wrap = buildElement();
        // Insert as the first child so it sits to the LEFT of the
        // Tools dropdown and About us link.
        nav.insertBefore(wrap, nav.firstChild);

        const input = wrap.querySelector('.gs-input');
        const panel = wrap.querySelector('.gs-panel');
        let activeIdx = 0;
        let currentResults = [];

        function render(q) {
            if (!q) {
                panel.hidden = true;
                panel.innerHTML = '';
                return;
            }
            const ranked = universeCache
                .map(i => ({ item: i, r: rankMatch(i, q) }))
                .filter(x => x.r >= 0)
                .sort((a, b) => b.r - a.r || a.item.ticker.localeCompare(b.item.ticker))
                .slice(0, 12)
                .map(x => x.item);
            currentResults = ranked;
            activeIdx = 0;

            panel.hidden = false;
            if (ranked.length === 0) {
                panel.innerHTML = '<div class="gs-empty">No matches</div>';
                return;
            }
            panel.innerHTML = ranked.map((r, idx) => (
                '<a class="gs-item ' + (idx === activeIdx ? 'active' : '') +
                '" href="brief.html?ticker=' + encodeURIComponent(r.ticker) + '">' +
                '<span class="gs-ticker">' + r.ticker + '</span>' +
                '<span class="gs-name">' + (r.name || '') + '</span>' +
                '<span class="gs-sector">' + (r.sector || '') + '</span>' +
                '</a>'
            )).join('');
        }

        function updateActive() {
            Array.from(panel.children).forEach((el, idx) =>
                el.classList.toggle('active', idx === activeIdx)
            );
            const a = panel.children[activeIdx];
            if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest' });
        }

        input.addEventListener('focus', async () => {
            await loadUniverse();
            if (input.value.trim()) render(input.value.trim().toLowerCase());
        });
        input.addEventListener('input', async () => {
            await loadUniverse();
            render(input.value.trim().toLowerCase());
        });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (activeIdx < currentResults.length - 1) { activeIdx++; updateActive(); }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (activeIdx > 0) { activeIdx--; updateActive(); }
            } else if (e.key === 'Enter') {
                if (currentResults[activeIdx]) {
                    e.preventDefault();
                    window.location.href = 'brief.html?ticker=' + encodeURIComponent(currentResults[activeIdx].ticker);
                }
            } else if (e.key === 'Escape') {
                panel.hidden = true;
                input.blur();
            }
        });
        document.addEventListener('mousedown', (e) => {
            if (!wrap.contains(e.target)) panel.hidden = true;
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
