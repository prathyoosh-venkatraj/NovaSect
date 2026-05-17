/**
 * NovaSect Downloads — per-tool report exporter.
 *
 * Phase 1 — brief.html only. Adds a "Download ▾" dropdown anchored top-
 * right of the brief page exposing three formats:
 *   - PDF  (branded, multi-section, methodology + disclaimer footer)
 *   - JSON (structured snapshot of the brief)
 *   - CSV  (flat Section / Field / Value table)
 *
 * Data source: the live brief DOM. We read text content from the stable
 * IDs that brief.html populates (fv-price, sn-total-yield, os-6m-ev, …),
 * plus a small meta blob exposed via `window.__briefMeta` containing the
 * ticker / name / sector / asOf the page has already resolved. Reading
 * the DOM means downloads always match what the user is looking at —
 * including any live price / multiples that backfilled after page load.
 *
 * jsPDF is lazy-loaded from the cdnjs CDN on first PDF click only, so
 * non-PDF flows stay zero-cost. No CSS framework dependency.
 *
 * Methodology + disclaimer + asOf are baked into every PDF page footer.
 * Future phases will reuse this module on sentinel.html, osiris.html and
 * report.html with tool-specific snapshot collectors.
 */
(() => {
    if (window.__novasectDownloadsInit) return;
    window.__novasectDownloadsInit = true;

    // ── Constants ──────────────────────────────────────────────────
    const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    const METHODOLOGY = 'Sentinel v2 · Osiris v1 · FinVault v1';
    const DISCLAIMER = 'For informational purposes only. Not investment advice. ' +
        'NovaSect is not a registered investment advisor. Data sourced from third-party ' +
        'providers; figures may differ from primary sources. Past performance and modeled ' +
        'scenarios are not indicative of future results.';
    const BRAND_GREEN = [22, 163, 74];   // #16A34A — darker than UI green for print contrast
    const BRAND_INK = [17, 24, 39];      // #111827 — body text
    const BRAND_MUTED = [107, 114, 128]; // #6B7280 — secondary text
    const BRAND_RULE = [200, 215, 200];  // soft greenish rule

    // ── Styles ─────────────────────────────────────────────────────
    const STYLE = `
/* Sits just below the fixed page header, aligned with the brief-page's
   right padding. brief-page has padding-top: 6rem on desktop / 5rem on
   mobile, so we tuck the dropdown into that gutter above the wordmark. */
.dl-wrap {
    position: absolute;
    top: 5.2rem;
    right: 1.5rem;
    z-index: 50;
}
.dl-btn {
    background: rgba(0, 18, 0, 0.55);
    color: rgba(57, 255, 20, 0.95);
    border: 1px solid rgba(57, 255, 20, 0.35);
    padding: 5px 11px 6px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 1.2px;
    border-radius: 3px;
    cursor: pointer;
    text-transform: uppercase;
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
}
.dl-btn:hover, .dl-btn.open {
    background: rgba(57, 255, 20, 0.12);
    border-color: rgba(57, 255, 20, 0.75);
    box-shadow: 0 0 8px rgba(57, 255, 20, 0.25);
}
.dl-menu {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 160px;
    background: rgba(0, 12, 0, 0.97);
    border: 1px solid rgba(57, 255, 20, 0.35);
    border-radius: 3px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55), 0 0 18px rgba(57, 255, 20, 0.12);
    padding: 4px 0;
    display: none;
}
.dl-menu.open { display: block; }
.dl-menu button {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-left: 2px solid transparent;
    color: rgba(255, 255, 255, 0.92);
    padding: 8px 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    letter-spacing: 1px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.dl-menu button:hover {
    background: rgba(57, 255, 20, 0.12);
    color: rgba(57, 255, 20, 1);
    border-left-color: rgba(57, 255, 20, 1);
}
.dl-menu .dl-fmt-hint {
    color: rgba(255, 255, 255, 0.35);
    font-size: 0.6rem;
    margin-left: 6px;
}
.dl-toast {
    position: fixed;
    bottom: 1.5rem;
    right: 1.5rem;
    background: rgba(0, 12, 0, 0.97);
    border: 1px solid rgba(57, 255, 20, 0.45);
    color: rgba(57, 255, 20, 0.95);
    padding: 10px 14px;
    border-radius: 3px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.72rem;
    letter-spacing: 1px;
    z-index: 10000;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.55), 0 0 18px rgba(57, 255, 20, 0.18);
    opacity: 0;
    transition: opacity 0.25s ease;
    pointer-events: none;
}
.dl-toast.show { opacity: 1; }
@media (max-width: 768px) {
    .dl-wrap { top: 4rem; right: 0.85rem; }
    .dl-btn { font-size: 0.62rem; padding: 4px 8px 5px; letter-spacing: 0.8px; }
    .dl-menu { min-width: 140px; }
    .dl-menu button { padding: 7px 12px; font-size: 0.72rem; }
}
`;

    function injectStyles() {
        if (document.getElementById('dl-styles')) return;
        const s = document.createElement('style');
        s.id = 'dl-styles';
        s.textContent = STYLE;
        document.head.appendChild(s);
    }

    // ── Snapshot — read the live brief DOM into a plain object ─────
    function txt(id) {
        const el = document.getElementById(id);
        if (!el) return '';
        return (el.textContent || '').trim();
    }
    function asNumOrText(v) {
        // Keep string form for human display; downloads stay faithful
        // to what the user sees. JSON consumers can re-parse.
        if (!v || v === '—') return null;
        return v;
    }

    function snapshotBrief() {
        const meta = window.__briefMeta || {};
        const ratios = collectRatios();
        return {
            tool: 'NovaSect Brief',
            ticker: meta.ticker || txt('b-ticker'),
            name: meta.name || txt('b-name'),
            sector: meta.sector || '',
            country: meta.country || '',
            industry: meta.industry || '',
            exchange: meta.exchange || '',
            asOf: new Date().toISOString(),
            methodologyVersion: METHODOLOGY,
            finvault: {
                marketContext: {
                    currentPrice: asNumOrText(txt('fv-price')),
                    week52Range: asNumOrText(txt('fv-52w')),
                    betaVsSPY: asNumOrText(txt('fv-beta')),
                    ttmDividendYield: asNumOrText(txt('fv-dy'))
                },
                multiples: {
                    trailingPE: asNumOrText(txt('fv-tpe')),
                    forwardPE: asNumOrText(txt('fv-fpe')),
                    evEbitda: asNumOrText(txt('fv-ev')),
                    priceToBook: asNumOrText(txt('fv-pb'))
                },
                ratios: ratios,
                growth5Y: {
                    week52Return: asNumOrText(txt('fv-52wret')),
                    revenueGrowth5Y: asNumOrText(txt('fv-revg')),
                    epsGrowth5Y: asNumOrText(txt('fv-epsg'))
                }
            },
            sentinel: {
                impliedTotalYield: asNumOrText(txt('sn-total-yield')),
                baseUST10Y: asNumOrText(txt('sn-base-ust')),
                creditSpread: asNumOrText(txt('sn-credit-spread')),
                creditTier: asNumOrText(txt('sn-credit-tier')),
                syntheticNormalizationDifferential: asNumOrText(txt('sn-norm-diff')),
                seniority: 'Unsecured',
                duration: '10Y'
            },
            osiris: {
                sixMonth: {
                    expectedValue: asNumOrText(txt('os-6m-ev')),
                    upsideCeiling: asNumOrText(txt('os-6m-up')),
                    stressFloor: asNumOrText(txt('os-6m-down'))
                },
                oneYear: {
                    expectedValue: asNumOrText(txt('os-1y-ev')),
                    upsideCeiling: asNumOrText(txt('os-1y-up')),
                    stressFloor: asNumOrText(txt('os-1y-down'))
                }
            }
        };
    }

    function collectRatios() {
        const wrap = document.getElementById('fv-ratios');
        if (!wrap) return {};
        const out = {};
        wrap.querySelectorAll('.brief-ratio-row').forEach(row => {
            const label = (row.querySelector('.brief-ratio-label') || {}).textContent || '';
            const value = (row.querySelector('.brief-ratio-value') || {}).textContent || '';
            if (label) out[label.trim()] = (value || '').trim();
        });
        return out;
    }

    // ── Filename helper ────────────────────────────────────────────
    function makeFilename(snap, ext) {
        const safe = (snap.ticker || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
        const date = new Date().toISOString().slice(0, 10);
        return 'novasect-brief-' + safe + '-' + date + '.' + ext;
    }

    function triggerDownload(filename, mime, body) {
        const blob = body instanceof Blob ? body : new Blob([body], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 250);
    }

    // ── JSON ───────────────────────────────────────────────────────
    function downloadJSON(snap) {
        const body = JSON.stringify(snap, null, 2);
        triggerDownload(makeFilename(snap, 'json'), 'application/json', body);
    }

    // ── CSV ────────────────────────────────────────────────────────
    function csvEscape(v) {
        const s = v == null ? '' : String(v);
        if (s.includes(',') || s.includes('"') || s.includes('\n')) {
            return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
    }
    function downloadCSV(snap) {
        const rows = [['Section', 'Field', 'Value']];
        const push = (section, field, value) => rows.push([section, field, value == null ? '' : value]);
        push('Header', 'Ticker', snap.ticker);
        push('Header', 'Name', snap.name);
        push('Header', 'Sector', snap.sector);
        push('Header', 'Country', snap.country);
        push('Header', 'Industry', snap.industry);
        push('Header', 'Exchange', snap.exchange);
        push('Header', 'As Of', snap.asOf);
        push('Header', 'Methodology Version', snap.methodologyVersion);
        // FinVault
        const fv = snap.finvault;
        for (const k of Object.keys(fv.marketContext)) push('FinVault · Market Context', k, fv.marketContext[k]);
        for (const k of Object.keys(fv.multiples)) push('FinVault · Multiples', k, fv.multiples[k]);
        for (const k of Object.keys(fv.ratios)) push('FinVault · Ratios', k, fv.ratios[k]);
        for (const k of Object.keys(fv.growth5Y)) push('FinVault · Growth (5Y)', k, fv.growth5Y[k]);
        // Sentinel
        const sn = snap.sentinel;
        for (const k of Object.keys(sn)) push('Sentinel', k, sn[k]);
        // Osiris
        push('Osiris · 6-Month', 'Expected Value', snap.osiris.sixMonth.expectedValue);
        push('Osiris · 6-Month', 'Upside Ceiling', snap.osiris.sixMonth.upsideCeiling);
        push('Osiris · 6-Month', 'Stress Floor', snap.osiris.sixMonth.stressFloor);
        push('Osiris · 1-Year', 'Expected Value', snap.osiris.oneYear.expectedValue);
        push('Osiris · 1-Year', 'Upside Ceiling', snap.osiris.oneYear.upsideCeiling);
        push('Osiris · 1-Year', 'Stress Floor', snap.osiris.oneYear.stressFloor);

        const body = rows.map(r => r.map(csvEscape).join(',')).join('\n');
        triggerDownload(makeFilename(snap, 'csv'), 'text/csv;charset=utf-8', body);
    }

    // ── jsPDF lazy loader ──────────────────────────────────────────
    let jspdfPromise = null;
    function loadJsPDF() {
        if (window.jspdf && window.jspdf.jsPDF) return Promise.resolve(window.jspdf.jsPDF);
        if (jspdfPromise) return jspdfPromise;
        jspdfPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = JSPDF_URL;
            s.async = true;
            s.onload = () => {
                if (window.jspdf && window.jspdf.jsPDF) resolve(window.jspdf.jsPDF);
                else reject(new Error('jsPDF loaded but global missing'));
            };
            s.onerror = () => reject(new Error('Failed to load jsPDF'));
            document.head.appendChild(s);
        });
        return jspdfPromise;
    }

    // ── PDF rendering helpers ──────────────────────────────────────
    function fmtAsOf(iso) {
        try {
            const d = new Date(iso);
            return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase();
        } catch (e) { return iso; }
    }

    function drawPageFrame(doc, snap, opts) {
        const W = doc.internal.pageSize.getWidth();
        const H = doc.internal.pageSize.getHeight();
        const margin = 14;

        // Top brand strip
        doc.setFillColor(...BRAND_GREEN);
        doc.rect(0, 0, W, 1.6, 'F');

        // Top header — wordmark left, ticker right
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...BRAND_GREEN);
        doc.text('NOVASECT  ·  BRIEF', margin, 9);
        if (snap.ticker) {
            doc.setTextColor(...BRAND_INK);
            doc.text(snap.ticker, W - margin, 9, { align: 'right' });
        }

        // Footer rule
        doc.setDrawColor(...BRAND_RULE);
        doc.setLineWidth(0.2);
        doc.line(margin, H - 14, W - margin, H - 14);

        // Footer text — methodology + asOf left, page number right, disclaimer wrap below
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...BRAND_MUTED);
        doc.text(snap.methodologyVersion + '  ·  AS OF ' + fmtAsOf(snap.asOf), margin, H - 9);
        const pg = opts && opts.pageNum ? opts.pageNum : doc.internal.getNumberOfPages();
        doc.text('Page ' + pg, W - margin, H - 9, { align: 'right' });

        doc.setFontSize(6);
        const disclaimerLines = doc.splitTextToSize(DISCLAIMER, W - margin * 2);
        doc.text(disclaimerLines, margin, H - 5);
    }

    function ensureSpace(state, needed) {
        const H = state.doc.internal.pageSize.getHeight();
        const limit = H - 24; // leave room for footer block (~14mm rule + 10mm text)
        if (state.y + needed > limit) {
            state.doc.addPage();
            drawPageFrame(state.doc, state.snap);
            state.y = 24; // top margin under brand strip
        }
    }

    function sectionHeader(state, label) {
        ensureSpace(state, 14);
        const W = state.doc.internal.pageSize.getWidth();
        const margin = 14;
        state.doc.setFont('helvetica', 'bold');
        state.doc.setFontSize(11);
        state.doc.setTextColor(...BRAND_GREEN);
        state.doc.text(label.toUpperCase(), margin, state.y);
        state.doc.setDrawColor(...BRAND_GREEN);
        state.doc.setLineWidth(0.4);
        state.doc.line(margin, state.y + 1.4, W - margin, state.y + 1.4);
        state.y += 7;
    }

    function subHeader(state, label) {
        ensureSpace(state, 9);
        const margin = 14;
        state.doc.setFont('helvetica', 'bold');
        state.doc.setFontSize(8);
        state.doc.setTextColor(...BRAND_INK);
        state.doc.text(label, margin, state.y);
        state.y += 4.5;
    }

    function row(state, label, value, opts) {
        ensureSpace(state, 5.5);
        const W = state.doc.internal.pageSize.getWidth();
        const margin = 14;
        const tabRight = W - margin;
        state.doc.setFont('helvetica', 'normal');
        state.doc.setFontSize(9);
        state.doc.setTextColor(...BRAND_INK);
        state.doc.text(label, margin + (opts && opts.indent ? 4 : 0), state.y);
        state.doc.setFont('helvetica', 'bold');
        state.doc.setTextColor(...BRAND_INK);
        state.doc.text(value || '—', tabRight, state.y, { align: 'right' });
        state.y += 5;
    }

    function divider(state, gap) {
        ensureSpace(state, (gap || 4));
        state.y += (gap || 4);
    }

    function drawCover(state) {
        const doc = state.doc;
        const snap = state.snap;
        const W = doc.internal.pageSize.getWidth();
        drawPageFrame(doc, snap);

        // Vertical centering for the cover block
        let y = 70;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...BRAND_GREEN);
        doc.text('NOVASECT  ·  BRIEF REPORT', W / 2, y, { align: 'center' });
        y += 4;
        doc.setDrawColor(...BRAND_GREEN);
        doc.setLineWidth(0.6);
        doc.line(W / 2 - 40, y, W / 2 + 40, y);
        y += 22;

        doc.setFont('courier', 'bold');
        doc.setFontSize(42);
        doc.setTextColor(...BRAND_INK);
        doc.text(snap.ticker || '—', W / 2, y, { align: 'center' });
        y += 12;

        if (snap.name) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(16);
            doc.setTextColor(...BRAND_INK);
            doc.text(snap.name, W / 2, y, { align: 'center' });
            y += 9;
        }

        const metaParts = [snap.sector, snap.country, snap.exchange, snap.industry].filter(Boolean);
        if (metaParts.length) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(...BRAND_MUTED);
            doc.text(metaParts.join('  ·  '), W / 2, y, { align: 'center' });
            y += 18;
        } else {
            y += 9;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND_MUTED);
        doc.text('AS OF', W / 2, y, { align: 'center' });
        y += 4;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(...BRAND_INK);
        doc.text(fmtAsOf(snap.asOf), W / 2, y, { align: 'center' });
        y += 12;

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...BRAND_MUTED);
        doc.text('Methodology  ·  ' + snap.methodologyVersion, W / 2, y, { align: 'center' });

        // Move cursor below cover content so the page footer can render.
        state.y = doc.internal.pageSize.getHeight() - 24;
    }

    async function downloadPDF(snap) {
        const jsPDF = await loadJsPDF();
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        const state = { doc, snap, y: 24 };

        // Page 1: cover
        drawCover(state);

        // Page 2+: data
        doc.addPage();
        drawPageFrame(doc, snap);
        state.y = 24;

        // FinVault
        sectionHeader(state, 'FinVault');
        subHeader(state, 'Market Context');
        const mc = snap.finvault.marketContext;
        row(state, 'Current Price', mc.currentPrice, { indent: true });
        row(state, '52-Week Range', mc.week52Range, { indent: true });
        row(state, 'Beta vs SPY', mc.betaVsSPY, { indent: true });
        row(state, 'TTM Dividend Yield', mc.ttmDividendYield, { indent: true });
        divider(state);

        subHeader(state, 'Multiples');
        const mu = snap.finvault.multiples;
        row(state, 'Trailing P/E', mu.trailingPE, { indent: true });
        row(state, 'Forward P/E', mu.forwardPE, { indent: true });
        row(state, 'EV / EBITDA', mu.evEbitda, { indent: true });
        row(state, 'P / B', mu.priceToBook, { indent: true });
        divider(state);

        const ratioKeys = Object.keys(snap.finvault.ratios);
        if (ratioKeys.length) {
            subHeader(state, 'Financial Ratios');
            for (const k of ratioKeys) row(state, k, snap.finvault.ratios[k], { indent: true });
            divider(state);
        }

        subHeader(state, 'Growth (5Y trailing)');
        const g = snap.finvault.growth5Y;
        row(state, '52W Return', g.week52Return, { indent: true });
        row(state, 'Revenue Growth 5Y', g.revenueGrowth5Y, { indent: true });
        row(state, 'EPS Growth 5Y', g.epsGrowth5Y, { indent: true });
        divider(state, 6);

        // Sentinel
        sectionHeader(state, 'Sentinel');
        const sn = snap.sentinel;
        row(state, 'Implied Total Yield', sn.impliedTotalYield);
        row(state, 'Base UST (10Y)', sn.baseUST10Y);
        row(state, 'Credit Spread', sn.creditSpread + (sn.creditTier ? '   (' + sn.creditTier + ')' : ''));
        row(state, 'Synthetic Normalization Differential', sn.syntheticNormalizationDifferential);
        row(state, 'Seniority', sn.seniority);
        row(state, 'Duration', sn.duration);
        divider(state, 6);

        // Osiris
        sectionHeader(state, 'Osiris');
        subHeader(state, '6-Month Horizon');
        const o6 = snap.osiris.sixMonth;
        row(state, 'Expected Value (median)', o6.expectedValue, { indent: true });
        row(state, 'Upside Ceiling (95th)', o6.upsideCeiling, { indent: true });
        row(state, 'Stress Floor (5th)', o6.stressFloor, { indent: true });
        divider(state);
        subHeader(state, '1-Year Horizon');
        const o1 = snap.osiris.oneYear;
        row(state, 'Expected Value (median)', o1.expectedValue, { indent: true });
        row(state, 'Upside Ceiling (95th)', o1.upsideCeiling, { indent: true });
        row(state, 'Stress Floor (5th)', o1.stressFloor, { indent: true });

        // Final page-number stamps (re-run frame on every page so numbers
        // pick up the real total — only matters if we want a "Page X of N"
        // someday; for now Page X is enough).
        doc.save(makeFilename(snap, 'pdf'));
    }

    // ── Toast helper for async feedback ────────────────────────────
    let toastEl = null;
    function toast(msg, isError) {
        if (!toastEl) {
            toastEl = document.createElement('div');
            toastEl.className = 'dl-toast';
            document.body.appendChild(toastEl);
        }
        toastEl.textContent = msg;
        toastEl.style.borderColor = isError ? 'rgba(239, 68, 68, 0.6)' : 'rgba(57, 255, 20, 0.45)';
        toastEl.style.color = isError ? 'rgba(255, 120, 120, 0.95)' : 'rgba(57, 255, 20, 0.95)';
        toastEl.classList.add('show');
        clearTimeout(toastEl._t);
        toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 2400);
    }

    // ── Mount ──────────────────────────────────────────────────────
    function mount() {
        // Brief-page only for phase 1. Identified by the brief-page section.
        const briefPage = document.getElementById('brief-page');
        if (!briefPage) return;
        injectStyles();

        // Make sure the brief-page is a positioning context for our
        // absolute-positioned dropdown — it's already styled with auto
        // margins but doesn't set `position`. Adding it on the parent
        // is safer than mutating the existing rule.
        const computed = window.getComputedStyle(briefPage).position;
        if (computed === 'static') briefPage.style.position = 'relative';

        const wrap = document.createElement('div');
        wrap.className = 'dl-wrap';

        const btn = document.createElement('button');
        btn.className = 'dl-btn';
        btn.type = 'button';
        btn.textContent = 'Download ▾';
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');

        const menu = document.createElement('div');
        menu.className = 'dl-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = [
            '<button type="button" data-fmt="pdf" role="menuitem">PDF<span class="dl-fmt-hint">branded</span></button>',
            '<button type="button" data-fmt="json" role="menuitem">JSON<span class="dl-fmt-hint">data</span></button>',
            '<button type="button" data-fmt="csv" role="menuitem">CSV<span class="dl-fmt-hint">flat</span></button>'
        ].join('');

        wrap.appendChild(btn);
        wrap.appendChild(menu);
        briefPage.appendChild(wrap);

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

        menu.addEventListener('click', async (e) => {
            const t = e.target.closest('button[data-fmt]');
            if (!t) return;
            close();
            const fmt = t.getAttribute('data-fmt');
            const snap = snapshotBrief();
            if (!snap.ticker) {
                toast('No ticker selected', true);
                return;
            }
            try {
                if (fmt === 'json') { downloadJSON(snap); toast('JSON ready'); }
                else if (fmt === 'csv') { downloadCSV(snap); toast('CSV ready'); }
                else if (fmt === 'pdf') {
                    toast('Building PDF…');
                    await downloadPDF(snap);
                    toast('PDF ready');
                }
            } catch (err) {
                console.error('[Downloads] export failed', err);
                toast('Download failed', true);
            }
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mount);
    } else {
        mount();
    }
})();
