/**
 * NovaSect landing-page enhancement layer — additive, reversible, dependency-free.
 *
 *   A1  scroll-reveal     — elements fade/rise into view as they enter the viewport
 *   A2  scroll-header     — the fixed header condenses + blurs once the page scrolls
 *   A4  background-parallax — decorative backdrops drift slightly slower than scroll
 *
 * Everything here is purely cosmetic and gated:
 *   • No-JS users        → markup is unstyled-hidden by nothing; content is visible.
 *   • Reduced-motion     → reveal is skipped entirely (content stays visible/static).
 *   • No IntersectionObserver → reveal is skipped (content stays visible).
 * Only transform/opacity are animated (compositor-only, no layout reflow), and all
 * scroll work is rAF-throttled so the Three.js / canvas frame budget is untouched.
 */
(function () {
    'use strict';

    var motionOK = !window.matchMedia ||
        window.matchMedia('(prefers-reduced-motion: no-preference)').matches;

    var vh = window.innerHeight || document.documentElement.clientHeight;

    /* ── A2 + A4: scroll-reactive header & background parallax (one handler) ── */
    var header = document.querySelector('.header');
    // Parallax only when motion is allowed; targets carry data-parallax="<factor>".
    var pxEls = motionOK
        ? Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'))
        : [];
    var MAX_PX = 40; // hard clamp so an oversized backdrop can never expose an edge
    var ticking = false;

    var sync = function () {
        if (header) header.classList.toggle('scrolled', window.scrollY > 40);
        for (var i = 0; i < pxEls.length; i++) {
            var el = pxEls[i];
            var f = parseFloat(el.getAttribute('data-parallax')) || 0.06;
            var r = el.getBoundingClientRect();
            var off = (vh / 2 - (r.top + r.height / 2)) * f;
            if (off > MAX_PX) off = MAX_PX; else if (off < -MAX_PX) off = -MAX_PX;
            el.style.setProperty('--parallax', off.toFixed(1) + 'px');
        }
        ticking = false;
    };
    var onScroll = function () {
        if (ticking) return;
        ticking = true;
        window.requestAnimationFrame(sync);
    };

    if (header || pxEls.length) {
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', function () {
            vh = window.innerHeight || document.documentElement.clientHeight;
            onScroll();
        }, { passive: true });
        sync(); // set initial state (e.g. on reload mid-page)
    }

    /* ── FinVault vault door: play the one-time "open" sequence in view ────── */
    var vault = document.querySelector('[data-vault]');
    if (vault && motionOK && ('IntersectionObserver' in window)) {
        var vio = new IntersectionObserver(function (entries) {
            for (var i = 0; i < entries.length; i++) {
                if (!entries[i].isIntersecting) continue;
                entries[i].target.classList.add('vault--open');
                vio.unobserve(entries[i].target);
            }
        }, { threshold: 0.4 });
        vio.observe(vault);
    }

    /* ── A1: scroll-reveal ────────────────────────────────────────────────── */
    var els = document.querySelectorAll('.reveal, .reveal-soft');
    if (!els.length) return;

    // Bail out to fully-visible static content when motion is off or unsupported.
    if (!motionOK || !('IntersectionObserver' in window)) return;

    var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
            var e = entries[i];
            if (!e.isIntersecting) continue;
            e.target.classList.remove('reveal--armed');
            e.target.classList.add('reveal--in');
            io.unobserve(e.target);
        }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });

    els.forEach(function (el) {
        var top = el.getBoundingClientRect().top;
        // Already at/above the fold on load → show immediately (no arming, no flash).
        if (top < vh * 0.9) {
            el.classList.add('reveal--in');
        } else {
            el.classList.add('reveal--armed');
            io.observe(el);
        }
    });
})();
