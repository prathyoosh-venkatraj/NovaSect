/**
 * NovaSect Mobile Nav — hamburger menu for ≤768px viewports.
 *
 * On mobile: hides the desktop Tools dropdown + About us link and
 * exposes a single hamburger button. Tapping it opens a small panel
 * with the three Tools (Sentinel / FinVault / Osiris) flattened to
 * top-level entries + About us below a divider.
 *
 * On desktop (>768px) the hamburger stays hidden and the existing
 * nav-dropdown + .nav-link are visible — no change at all.
 *
 * Loads on every page via a single <script defer> tag in the page's
 * footer, alongside global-search.js. Self-contained: no external
 * deps, inline CSS.
 */
(() => {
    if (window.__novasectMobileNavInit) return;
    window.__novasectMobileNavInit = true;

    const STYLE = `
.mobile-hamburger {
    display: none;
    background: rgba(0, 18, 0, 0.4);
    color: var(--accent-green);
    border: 1px solid rgba(57, 255, 20, 0.35);
    padding: 4px 11px 5px;
    font-size: 1.05rem;
    line-height: 1;
    cursor: pointer;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
}
.mobile-hamburger:hover, .mobile-hamburger.open {
    background: rgba(57, 255, 20, 0.15);
    border-color: var(--accent-green);
    box-shadow: 0 0 8px rgba(57, 255, 20, 0.25);
}
.mnav-wrap {
    position: relative;
    display: inline-block;
}
.mobile-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    background: rgba(0, 12, 0, 0.97);
    border: 1px solid rgba(57, 255, 20, 0.35);
    border-radius: 3px;
    min-width: 200px;
    padding: 4px 0;
    display: none;
    z-index: 9998;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55), 0 0 18px rgba(57, 255, 20, 0.12);
}
.mobile-menu.open { display: block; }
.mobile-menu a {
    display: block;
    padding: 10px 18px;
    color: rgba(255, 255, 255, 0.92);
    text-decoration: none;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.85rem;
    letter-spacing: 1px;
    border-left: 2px solid transparent;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.mobile-menu a:hover {
    background: rgba(57, 255, 20, 0.12);
    color: var(--accent-green);
    border-left-color: var(--accent-green);
}
.mobile-menu-divider {
    height: 1px;
    background: rgba(57, 255, 20, 0.18);
    margin: 4px 12px;
}

@media (max-width: 768px) {
    /* Show the hamburger; hide all desktop nav items including Aurum button. */
    .mobile-hamburger { display: inline-flex; align-items: center; justify-content: center; }
    .nav-links > .nav-dropdown,
    .nav-links > a.nav-link,
    .nav-links > .aurum-nav-btn {
        display: none !important;
    }
}
`;

    function injectStyles() {
        if (document.getElementById('mnav-styles')) return;
        const s = document.createElement('style');
        s.id = 'mnav-styles';
        s.textContent = STYLE;
        document.head.appendChild(s);
    }

    function mount() {
        const nav = document.querySelector('.nav-links');
        if (!nav) return;
        injectStyles();

        const wrap = document.createElement('div');
        wrap.className = 'mnav-wrap';

        const btn = document.createElement('button');
        btn.className = 'mobile-hamburger';
        btn.type = 'button';
        btn.setAttribute('aria-label', 'Open navigation menu');
        btn.setAttribute('aria-expanded', 'false');
        btn.setAttribute('aria-controls', 'mnav-menu');
        btn.textContent = '☰';

        const menu = document.createElement('div');
        menu.className = 'mobile-menu';
        menu.id = 'mnav-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = [
            '<a href="sentinel.html" role="menuitem">Sentinel</a>',
            '<a href="reports.html" role="menuitem">FinVault</a>',
            '<a href="osiris.html" role="menuitem">Osiris</a>',
            '<div class="mobile-menu-divider"></div>',
            '<a href="about.html" role="menuitem">About us</a>',
            '<div class="mobile-menu-divider"></div>',
            '<a href="https://aurum.novasect.space" role="menuitem" target="_blank" rel="noopener noreferrer">Aurum ↗</a>'
        ].join('');

        wrap.appendChild(btn);
        wrap.appendChild(menu);
        // Append so the hamburger sits at the right edge of the nav cluster.
        nav.appendChild(wrap);

        function close() {
            menu.classList.remove('open');
            btn.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        }
        function toggle() {
            const willOpen = !menu.classList.contains('open');
            menu.classList.toggle('open', willOpen);
            btn.classList.toggle('open', willOpen);
            btn.setAttribute('aria-expanded', String(willOpen));
        }

        btn.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
        document.addEventListener('mousedown', (e) => { if (!wrap.contains(e.target)) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
