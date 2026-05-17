/**
 * NovaSect Downloads — per-tool report exporter.
 *
 * Mounts a fixed top-right "Download ▾" dropdown on the four downloadable
 * pages and exposes three formats per page:
 *   - PDF  (branded, tabular layout via jspdf-autotable)
 *   - JSON (structured snapshot)
 *   - CSV  (flat Section / Field / Value table)
 *
 * Pages and their snapshot shapes:
 *   - brief.html       — per-ticker synthesis (FinVault + Sentinel + Osiris bands)
 *   - report.html      — per-company full FinVault report (?company=slug)
 *   - osiris.html      — per-ticker simulation state + oracle outputs
 *   - sentinel.html    — universe-wide credit dashboard (all 83 tickers)
 *
 * Data sources used per page:
 *   - brief / report   — live DOM (stable IDs the page populates after fetch)
 *   - osiris           — DOM (combobox value + oracle readout) + universe.json
 *                        for the static physics block
 *   - sentinel         — data/universe.json directly (dashboard is universe-wide,
 *                        DOM scrape would miss filtered-out cards)
 *
 * jsPDF + autotable are lazy-loaded from cdnjs on the first PDF click only;
 * JSON / CSV stay zero-cost.
 *
 * Methodology + asOf + disclaimer are baked into every PDF page footer; the
 * cover page adapts (per-ticker vs dashboard wordmark) based on snap.tool.
 */
(() => {
    if (window.__novasectDownloadsInit) return;
    window.__novasectDownloadsInit = true;

    // ── Constants ──────────────────────────────────────────────────
    const JSPDF_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    const AUTOTABLE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
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
/* Fixed top-right placement so the same offset works across every tool
   page regardless of the page's own padding / layout. Sits below the
   fixed nav header (z-index 1000) but above all page content. */
.dl-wrap {
    position: fixed;
    top: 5.5rem;
    right: 1.75rem;
    z-index: 90;
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

/* ── Per-card Sentinel download button ──────────────────────────────
   Lives inside each .bg-card-bg credit card (which is position:relative).
   Positioned just left of the .stale-dot indicator so it doesn't
   overlap. Click is stop-propagation'd so it doesn't fire the card's
   onclick="openModal()" handler. */
.dl-card-btn {
    position: absolute;
    top: 6px;
    right: 22px;
    background: rgba(0, 18, 0, 0.55);
    color: rgba(57, 255, 20, 0.95);
    border: 1px solid rgba(57, 255, 20, 0.35);
    border-radius: 3px;
    padding: 1px 6px 2px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.78rem;
    line-height: 1.05;
    cursor: pointer;
    z-index: 6;
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
}
.dl-card-btn:hover, .dl-card-btn.open {
    background: rgba(57, 255, 20, 0.18);
    border-color: rgba(57, 255, 20, 0.85);
    box-shadow: 0 0 6px rgba(57, 255, 20, 0.4);
    color: #39FF14;
}
.dl-card-menu {
    position: absolute;
    top: 30px;
    right: 8px;
    min-width: 130px;
    background: rgba(0, 12, 0, 0.97);
    border: 1px solid rgba(57, 255, 20, 0.4);
    border-radius: 3px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.6), 0 0 14px rgba(57, 255, 20, 0.15);
    padding: 3px 0;
    display: none;
    z-index: 11;
}
.dl-card-menu.open { display: block; }
.dl-card-menu button {
    display: block;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    border-left: 2px solid transparent;
    color: rgba(255, 255, 255, 0.92);
    padding: 6px 14px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.7rem;
    letter-spacing: 0.5px;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease, border-color 0.15s ease;
}
.dl-card-menu button:hover {
    background: rgba(57, 255, 20, 0.12);
    color: #39FF14;
    border-left-color: #39FF14;
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
            tool: 'brief',
            displayName: 'NovaSect Brief',
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

    // Cached universe.json — shared by FinVault / Osiris / Sentinel
    // snapshots so we don't refetch on every click.
    let universeCache = null;
    async function loadUniverse() {
        if (universeCache) return universeCache;
        try {
            const res = await fetch('data/universe.json');
            if (!res.ok) return null;
            universeCache = await res.json();
            return universeCache;
        } catch (e) { return null; }
    }

    // ── FinVault report snapshot (report.html?company=slug) ────────
    async function snapshotFinVault() {
        const params = new URLSearchParams(window.location.search);
        const slug = params.get('company') || '';
        const universe = await loadUniverse();
        let ticker = '', name = '', sector = '', country = '', industry = '', exchange = '';
        if (universe && universe.tickers) {
            for (const [t, entry] of Object.entries(universe.tickers)) {
                if (entry.finvault && entry.finvault.slug === slug) {
                    ticker = t;
                    name = entry.name;
                    sector = entry.sector;
                    country = entry.country;
                    industry = (entry.finvault && entry.finvault.industry) || entry.sector;
                    exchange = (entry.exchanges && entry.exchanges.tradingView)
                        ? entry.exchanges.tradingView.split(':')[0] : '';
                    break;
                }
            }
        }
        // DOM fallback if universe lookup didn't find a match (skeleton
        // entries still render the page even without a universe row).
        if (!name) name = txt('company-name');
        if (!industry) industry = txt('company-industry');

        const cellTxt = (id) => asNumOrText(txt(id));
        // 15-row ratios table; report.html renders <tr><td>Label</td><td>Value</td></tr>
        // into #stats-body. Labels are stable and match the brief / build-universe set.
        const ratios = {};
        const ratioRows = document.querySelectorAll('#stats-body tr');
        ratioRows.forEach(tr => {
            const cells = tr.querySelectorAll('td');
            if (cells.length >= 2) {
                const k = (cells[0].textContent || '').trim();
                const v = (cells[1].textContent || '').trim();
                if (k) ratios[k] = v;
            }
        });
        // Company profile + revenue segments — both populated by the
        // page's profile loader. Description sits as plain text in
        // #profile-description; segments render as .segment-row blocks
        // with .segment-label + .segment-share children.
        const description = txt('profile-description');
        const segments = [];
        document.querySelectorAll('#segment-list .segment-row').forEach(row => {
            const name = (row.querySelector('.segment-label') || {}).textContent || '';
            const share = (row.querySelector('.segment-share') || {}).textContent || '';
            if (name.trim()) segments.push({ name: name.trim(), share: share.trim() });
        });

        return {
            tool: 'finvault',
            displayName: 'NovaSect FinVault',
            slug,
            ticker,
            name,
            sector,
            country,
            industry,
            exchange,
            asOf: new Date().toISOString(),
            methodologyVersion: METHODOLOGY,
            profile: {
                description: description || null,
                segments
            },
            marketContext: {
                currentPrice: cellTxt('mc-current-price'),
                week52Range: cellTxt('mc-52w-range'),
                realizedVolatility: cellTxt('mc-realized-vol'),
                betaVsSPY: cellTxt('mc-beta'),
                ttmDividendYield: cellTxt('mc-div-yield'),
                lastDividend: cellTxt('mc-last-div'),
                sentinelRisk: cellTxt('mc-sentinel-risk')
            },
            forwardEstimates: {
                breakdown: cellTxt('fe-breakdown'),
                targetMedian: cellTxt('fe-target-median'),
                targetRange: cellTxt('fe-target-range'),
                targetUpside: cellTxt('fe-target-upside'),
                analystCount: cellTxt('fe-target-count')
            },
            multiples: {
                trailingPE: cellTxt('val-trailing-pe'),
                forwardPE: cellTxt('val-leading-pe'),
                priceFCF: cellTxt('val-price-fcf'),
                dividendYield: cellTxt('val-div-yield'),
                evEbitda: cellTxt('val-ev-ebitda'),
                evSales: cellTxt('val-ev-sales'),
                priceToBook: cellTxt('val-pb')
            },
            ratios,
            fundamentalsHighlights: {
                week52Return: cellTxt('fh-52w-return'),
                revenueGrowth5Y: cellTxt('fh-revenue-growth'),
                epsGrowth5Y: cellTxt('fh-eps-growth')
            }
        };
    }

    // ── Osiris snapshot (osiris.html — per-ticker simulation state) ─
    async function snapshotOsiris() {
        const select = document.getElementById('osiris-ticker-select');
        const ticker = (select && select.value) || '';
        const universe = await loadUniverse();
        const entry = (universe && universe.tickers && universe.tickers[ticker]) || null;
        const physics = entry && entry.osiris ? entry.osiris : null;
        const cellTxt = (id) => asNumOrText(txt(id));

        // Oracle outputs — rendered by osirisOracle.js as a headline +
        // three badges (Upside / Expected / Stress). We scrape the
        // human-formatted prices and the headline text so PDF/JSON/CSV
        // mirror what the user sees post-simulation.
        const oracleEl = document.getElementById('oracle-readout');
        const oracle = {};
        if (oracleEl) {
            const headlineEl = oracleEl.querySelector('.oracle-headline');
            if (headlineEl) {
                oracle.headline = (headlineEl.textContent || '').replace(/\s+/g, ' ').trim();
            }
            oracleEl.querySelectorAll('.oracle-badge').forEach(b => {
                const labelEl = b.children[0];
                const priceEl = b.children[2];
                const label = labelEl ? (labelEl.textContent || '').trim() : '';
                const price = priceEl ? (priceEl.textContent || '').trim() : '';
                if (/upside/i.test(label)) oracle.upsideCeiling = price;
                else if (/expected/i.test(label)) oracle.expectedValue = price;
                else if (/stress/i.test(label)) oracle.stressFloor = price;
            });
        }

        return {
            tool: 'osiris',
            displayName: 'NovaSect Osiris',
            ticker,
            name: entry ? entry.name : '',
            sector: entry ? entry.sector : '',
            country: entry ? entry.country : '',
            asOf: new Date().toISOString(),
            methodologyVersion: METHODOLOGY,
            simulatorState: {
                volatility: cellTxt('val-volatility'),
                physicsParam: cellTxt('val-physics-param'),
                horizon: cellTxt('val-horizon'),
                volatilityRegime: (document.getElementById('osiris-volatility-regime') || {}).value || null,
                operationalShock: (document.getElementById('osiris-operational-shock') || {}).value || null,
                dataSource: cellTxt('osiris-metadata-readout')
            },
            physics: physics ? {
                cohort: physics.cohort,
                baselineVolatility: physics.baselineVolatility,
                reversionSpeedTheta: physics.reversionSpeedTheta,
                jumpFrequencyLambda: physics.jumpFrequencyLambda,
                jumpMu: physics.jumpMu,
                creditRating: physics.creditRating,
                ratingLastVerified: physics.ratingLastVerified
            } : null,
            oracle
        };
    }

    // ── Sentinel snapshot (sentinel.html — per-ticker, card-driven) ──
    // The download button lives on each company card and downloads the
    // credit data for that specific ticker — static calibration anchors
    // from universe.json plus the live spread / yield / risk values the
    // card has already computed.
    async function snapshotSentinelTicker(ticker) {
        const universe = await loadUniverse();
        const entry = universe && universe.tickers ? universe.tickers[ticker] : null;
        const s = entry && entry.sentinel ? entry.sentinel : {};

        // Live values straight off the card — same source of truth as the
        // on-screen number so the PDF/JSON/CSV never disagree with the UI.
        const card = document.getElementById('card-' + ticker);
        const cardTxt = (sel) => {
            if (!card) return null;
            const el = card.querySelector(sel);
            return el ? (el.textContent || '').trim() || null : null;
        };

        return {
            tool: 'sentinel',
            displayName: 'NovaSect Sentinel',
            view: 'Normalized 10Y Senior Unsecured',
            ticker,
            name: entry ? entry.name : '',
            sector: entry ? entry.sector : '',
            country: entry ? entry.country : '',
            asOf: new Date().toISOString(),
            methodologyVersion: METHODOLOGY,
            sentinel: {
                type: s.type || null,
                rating: s.rating || null,
                baseSpreadBps: s.baseSpread != null ? s.baseSpread : null,
                marketBeta: s.marketBeta != null ? s.marketBeta : null,
                sectorBeta: s.sectorBeta != null ? s.sectorBeta : null,
                baseRateType: s.baseRateType || null,
                anchorsLastVerified: s.lastVerified || null
            },
            live: {
                currentSpread: cardTxt('.spread-val'),
                impliedYield: cardTxt('.yield-val'),
                riskLevel: cardTxt('.risk-val'),
                lastCalibrated: cardTxt('.last-calibrated'),
                marketPulse: cardTxt('.market-pulse-badge')
            }
        };
    }

    // ── Filename helper ────────────────────────────────────────────
    function makeFilename(snap, ext) {
        const tool = snap.tool || 'report';
        const id = snap.tool === 'sentinel'
            ? 'dashboard'
            : (snap.ticker || snap.slug || 'unknown').replace(/[^A-Za-z0-9._-]/g, '_');
        const date = new Date().toISOString().slice(0, 10);
        return 'novasect-' + tool + '-' + id + '-' + date + '.' + ext;
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

    // ── Canvas-to-PDF capture helpers ──────────────────────────────
    // toDataURL throws SecurityError on tainted (cross-origin) canvases
    // and returns a data URL for same-origin ones. TradingView is the
    // only cross-origin chart we touch; everything else is captureable.
    function captureCanvasImage(canvas) {
        if (!canvas || typeof canvas.toDataURL !== 'function') return null;
        if (!canvas.width || !canvas.height) return null;
        try { return canvas.toDataURL('image/png'); }
        catch (e) { return null; }
    }

    // Add a captured canvas to the PDF at the current cursor. Fits to
    // page width minus margins, capped at maxHeight. Returns true if
    // the image was added, false if there's nothing to capture.
    function addChartImage(state, canvas, opts) {
        const dataURL = captureCanvasImage(canvas);
        if (!dataURL) return false;
        const W = state.doc.internal.pageSize.getWidth();
        const margin = 14;
        const maxW = W - margin * 2;
        const maxH = (opts && opts.maxHeight) || 75; // mm
        const aspect = canvas.width / canvas.height;
        let imgW = maxW;
        let imgH = imgW / aspect;
        if (imgH > maxH) { imgH = maxH; imgW = imgH * aspect; }
        ensureSpace(state, imgH + 6);
        state.doc.addImage(dataURL, 'PNG', margin + (maxW - imgW) / 2, state.y, imgW, imgH);
        state.y += imgH + 6;
        return true;
    }

    function tryCaptureFinVaultChart(state) {
        // The FinVault page either renders a TradingView iframe (cross-
        // origin, can't capture) OR a same-origin fallback canvas. We
        // grab any <canvas> child of #stock-chart-section.
        const section = document.getElementById('stock-chart-section');
        if (!section) return;
        const canvas = section.querySelector('canvas');
        if (!canvas) return;
        sectionHeader(state, 'Price Chart');
        if (!addChartImage(state, canvas, { maxHeight: 70 })) {
            // Surfaced label so users understand why the chart slot is
            // empty for TradingView-backed tickers.
            ensureSpace(state, 10);
            state.doc.setFont('helvetica', 'italic');
            state.doc.setFontSize(8);
            state.doc.setTextColor(...BRAND_MUTED);
            state.doc.text('Chart preview available in-app only (third-party embed).', 14, state.y);
            state.y += 6;
        }
    }

    function tryCaptureOsirisChart(state) {
        const canvas = document.getElementById('osiris-canvas');
        if (!canvas) return;
        sectionHeader(state, 'Price Simulation');
        if (!addChartImage(state, canvas, { maxHeight: 90 })) {
            ensureSpace(state, 10);
            state.doc.setFont('helvetica', 'italic');
            state.doc.setFontSize(8);
            state.doc.setTextColor(...BRAND_MUTED);
            state.doc.text('Run a simulation to populate the chart.', 14, state.y);
            state.y += 6;
        }
    }

    // For Sentinel per-card downloads we need to render the waterfall
    // chart for a given ticker. The chart lives inside #focus-modal,
    // which Chart.js can't paint into when display:none. We briefly
    // open the modal off-screen (hidden by an inline opacity + pointer-
    // events override) so Chart.js can size and paint, capture, then
    // restore. The whole round-trip is ~700ms.
    async function captureSentinelWaterfall(ticker) {
        if (typeof window.openModal !== 'function') return null;
        const modal = document.getElementById('focus-modal');
        if (!modal) return null;
        const origStyle = modal.getAttribute('style') || '';
        modal.setAttribute('style',
            origStyle + ';opacity:0 !important;pointer-events:none !important;');
        try {
            window.openModal(ticker);
            // updateModal awaits the credit-engine call (~300ms-ish) then
            // calls renderWaterfall synchronously. Wait long enough that
            // Chart.js has actually painted into the canvas.
            await new Promise(r => setTimeout(r, 750));
            const canvas = document.getElementById('waterfall-chart');
            // Capture dataURL + dims BEFORE closing the modal — Chart.js
            // may resize/destroy the canvas on hide.
            const dataURL = captureCanvasImage(canvas);
            const out = (dataURL && canvas)
                ? { dataURL, width: canvas.width, height: canvas.height }
                : null;
            if (typeof window.closeModal === 'function') window.closeModal();
            return out;
        } finally {
            modal.setAttribute('style', origStyle);
        }
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
        push('Header', 'Tool', snap.displayName);
        push('Header', 'Ticker', snap.ticker || '');
        push('Header', 'Name', snap.name || '');
        push('Header', 'Sector', snap.sector || '');
        push('Header', 'Country', snap.country || '');
        push('Header', 'Industry', snap.industry || '');
        push('Header', 'Exchange', snap.exchange || '');
        push('Header', 'As Of', snap.asOf);
        push('Header', 'Methodology Version', snap.methodologyVersion);

        if (snap.tool === 'brief') {
            const fv = snap.finvault;
            for (const k of Object.keys(fv.marketContext)) push('FinVault · Market Context', k, fv.marketContext[k]);
            for (const k of Object.keys(fv.multiples)) push('FinVault · Multiples', k, fv.multiples[k]);
            for (const k of Object.keys(fv.ratios)) push('FinVault · Ratios', k, fv.ratios[k]);
            for (const k of Object.keys(fv.growth5Y)) push('FinVault · Growth (5Y)', k, fv.growth5Y[k]);
            const sn = snap.sentinel;
            for (const k of Object.keys(sn)) push('Sentinel', k, sn[k]);
            push('Osiris · 6-Month', 'Expected Value', snap.osiris.sixMonth.expectedValue);
            push('Osiris · 6-Month', 'Upside Ceiling', snap.osiris.sixMonth.upsideCeiling);
            push('Osiris · 6-Month', 'Stress Floor', snap.osiris.sixMonth.stressFloor);
            push('Osiris · 1-Year', 'Expected Value', snap.osiris.oneYear.expectedValue);
            push('Osiris · 1-Year', 'Upside Ceiling', snap.osiris.oneYear.upsideCeiling);
            push('Osiris · 1-Year', 'Stress Floor', snap.osiris.oneYear.stressFloor);
        } else if (snap.tool === 'finvault') {
            if (snap.profile && snap.profile.description) {
                push('Company Profile', 'Description', snap.profile.description);
            }
            if (snap.profile && snap.profile.segments) {
                snap.profile.segments.forEach(seg => push('Revenue Segments', seg.name, seg.share));
            }
            for (const k of Object.keys(snap.marketContext)) push('Market Context', k, snap.marketContext[k]);
            for (const k of Object.keys(snap.forwardEstimates)) push('Forward Estimates', k, snap.forwardEstimates[k]);
            for (const k of Object.keys(snap.multiples)) push('Multiples', k, snap.multiples[k]);
            for (const k of Object.keys(snap.ratios)) push('Financial Ratios', k, snap.ratios[k]);
            for (const k of Object.keys(snap.fundamentalsHighlights)) push('Fundamentals Highlights', k, snap.fundamentalsHighlights[k]);
        } else if (snap.tool === 'osiris') {
            for (const k of Object.keys(snap.simulatorState)) push('Simulator State', k, snap.simulatorState[k]);
            if (snap.physics) {
                for (const k of Object.keys(snap.physics)) push('Physics', k, snap.physics[k]);
            }
            for (const k of Object.keys(snap.oracle)) push('Oracle', k, snap.oracle[k]);
        } else if (snap.tool === 'sentinel') {
            push('Header', 'View', snap.view || '');
            for (const k of Object.keys(snap.live)) push('Yield Stack (live)', k, snap.live[k]);
            for (const k of Object.keys(snap.sentinel)) push('Credit Calibration', k, snap.sentinel[k]);
        }

        const body = rows.map(r => r.map(csvEscape).join(',')).join('\n');
        triggerDownload(makeFilename(snap, 'csv'), 'text/csv;charset=utf-8', body);
    }

    // ── jsPDF + AutoTable lazy loader ──────────────────────────────
    function injectScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.async = true;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Failed to load ' + src));
            document.head.appendChild(s);
        });
    }
    let pdfStackPromise = null;
    function loadJsPDF() {
        // jsPDF must load first because autotable registers itself onto
        // jsPDF.API at script-eval time.
        if (window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable) {
            return Promise.resolve(window.jspdf.jsPDF);
        }
        if (pdfStackPromise) return pdfStackPromise;
        pdfStackPromise = (async () => {
            if (!window.jspdf || !window.jspdf.jsPDF) await injectScript(JSPDF_URL);
            if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('jsPDF global missing after load');
            if (!window.jspdf.jsPDF.API.autoTable) await injectScript(AUTOTABLE_URL);
            return window.jspdf.jsPDF;
        })();
        return pdfStackPromise;
    }

    // ── PDF rendering helpers ──────────────────────────────────────
    function fmtAsOf(iso) {
        try {
            const d = new Date(iso);
            return d.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).toUpperCase();
        } catch (e) { return iso; }
    }

    function toolBrandLabel(snap) {
        switch (snap.tool) {
            case 'brief': return 'NOVASECT  ·  BRIEF';
            case 'finvault': return 'NOVASECT  ·  FINVAULT';
            case 'osiris': return 'NOVASECT  ·  OSIRIS';
            case 'sentinel': return 'NOVASECT  ·  SENTINEL';
            default: return 'NOVASECT';
        }
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
        doc.text(toolBrandLabel(snap), margin, 9);
        doc.setTextColor(...BRAND_INK);
        if (snap.ticker) doc.text(snap.ticker, W - margin, 9, { align: 'right' });

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
        state.doc.setFontSize(8.5);
        state.doc.setTextColor(...BRAND_INK);
        state.doc.text(label, margin, state.y);
        state.y += 3.5;
    }

    // Two-column key/value table — used for Market Context, Multiples,
    // Ratios, Growth, Sentinel.
    function kvTable(state, body, opts) {
        const cols = (opts && opts.headers) || ['Metric', 'Value'];
        return writeTable(state, [cols], body, {
            columnStyles: { 0: { cellWidth: 'auto' }, 1: { halign: 'right', cellWidth: 50, fontStyle: 'bold' } }
        });
    }

    // Generic table wrapper around autoTable with the brand styling.
    // Updates state.y to the cursor position below the table.
    function writeTable(state, head, body, opts) {
        ensureSpace(state, 18);
        const W = state.doc.internal.pageSize.getWidth();
        state.doc.autoTable({
            startY: state.y,
            head,
            body,
            theme: 'grid',
            styles: {
                font: 'helvetica',
                fontSize: 9,
                cellPadding: { top: 2, right: 3, bottom: 2, left: 3 },
                textColor: BRAND_INK,
                lineColor: BRAND_RULE,
                lineWidth: 0.15,
                overflow: 'linebreak'
            },
            headStyles: {
                fillColor: BRAND_GREEN,
                textColor: [255, 255, 255],
                fontStyle: 'bold',
                fontSize: 8.5,
                halign: 'left'
            },
            alternateRowStyles: { fillColor: [247, 252, 247] },
            margin: { left: 14, right: 14, top: 22, bottom: 22 },
            tableWidth: W - 28,
            columnStyles: (opts && opts.columnStyles) || {},
            didDrawPage: () => drawPageFrame(state.doc, state.snap)
        });
        state.y = state.doc.lastAutoTable.finalY + 5;
    }

    function coverWordmark(snap) {
        switch (snap.tool) {
            case 'brief': return 'NOVASECT  ·  BRIEF REPORT';
            case 'finvault': return 'NOVASECT  ·  FINVAULT REPORT';
            case 'osiris': return 'NOVASECT  ·  OSIRIS REPORT';
            case 'sentinel': return 'NOVASECT  ·  SENTINEL REPORT';
            default: return 'NOVASECT REPORT';
        }
    }

    function drawCover(state) {
        const doc = state.doc;
        const snap = state.snap;
        const W = doc.internal.pageSize.getWidth();
        drawPageFrame(doc, snap);

        let y = 70;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...BRAND_GREEN);
        doc.text(coverWordmark(snap), W / 2, y, { align: 'center' });
        y += 4;
        doc.setDrawColor(...BRAND_GREEN);
        doc.setLineWidth(0.6);
        doc.line(W / 2 - 45, y, W / 2 + 45, y);
        y += 22;

        // Hero block — ticker (all four tools are now per-ticker).
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

        state.y = doc.internal.pageSize.getHeight() - 24;
    }

    // ── Per-tool PDF body builders ─────────────────────────────────
    function buildBriefBody(state) {
        const snap = state.snap;
        sectionHeader(state, 'FinVault');
        const mc = snap.finvault.marketContext;
        subHeader(state, 'Market Context');
        kvTable(state, [
            ['Current Price', mc.currentPrice || '—'],
            ['52-Week Range', mc.week52Range || '—'],
            ['Beta vs SPY', mc.betaVsSPY || '—'],
            ['TTM Dividend Yield', mc.ttmDividendYield || '—']
        ]);
        const mu = snap.finvault.multiples;
        subHeader(state, 'Multiples');
        kvTable(state, [
            ['Trailing P/E', mu.trailingPE || '—'],
            ['Forward P/E', mu.forwardPE || '—'],
            ['EV / EBITDA', mu.evEbitda || '—'],
            ['P / B', mu.priceToBook || '—']
        ]);
        const ratioKeys = Object.keys(snap.finvault.ratios);
        if (ratioKeys.length) {
            subHeader(state, 'Financial Ratios');
            kvTable(state,
                ratioKeys.map(k => [k, snap.finvault.ratios[k] || '—']),
                { headers: ['Ratio', 'Value'] }
            );
        }
        const g = snap.finvault.growth5Y;
        subHeader(state, 'Growth (5Y trailing)');
        kvTable(state, [
            ['52W Return', g.week52Return || '—'],
            ['Revenue Growth 5Y', g.revenueGrowth5Y || '—'],
            ['EPS Growth 5Y', g.epsGrowth5Y || '—']
        ]);

        sectionHeader(state, 'Sentinel');
        const sn = snap.sentinel;
        const creditSpreadCell = (sn.creditSpread || '—') +
            (sn.creditTier ? '   (' + sn.creditTier + ')' : '');
        kvTable(state, [
            ['Implied Total Yield', sn.impliedTotalYield || '—'],
            ['Base UST (10Y)', sn.baseUST10Y || '—'],
            ['Credit Spread', creditSpreadCell],
            ['Synthetic Normalization Differential', sn.syntheticNormalizationDifferential || '—'],
            ['Seniority', sn.seniority || '—'],
            ['Duration', sn.duration || '—']
        ]);

        sectionHeader(state, 'Osiris');
        const o6 = snap.osiris.sixMonth;
        const o1 = snap.osiris.oneYear;
        writeTable(state,
            [['Horizon', 'Expected (median)', 'Upside (95th)', 'Stress (5th)']],
            [
                ['6-Month', o6.expectedValue || '—', o6.upsideCeiling || '—', o6.stressFloor || '—'],
                ['1-Year', o1.expectedValue || '—', o1.upsideCeiling || '—', o1.stressFloor || '—']
            ],
            {
                columnStyles: {
                    0: { fontStyle: 'bold', cellWidth: 28 },
                    1: { halign: 'right' },
                    2: { halign: 'right' },
                    3: { halign: 'right' }
                }
            }
        );
    }

    function buildFinVaultBody(state) {
        const snap = state.snap;

        // ── Company Profile (description + revenue segments) ──
        // Goes at the very top so the report reads in narrative order:
        // who/what the company is, then market data, then the math.
        if (snap.profile && (snap.profile.description || snap.profile.segments.length)) {
            sectionHeader(state, 'Company Profile');
            if (snap.profile.description) {
                ensureSpace(state, 18);
                const W = state.doc.internal.pageSize.getWidth();
                state.doc.setFont('helvetica', 'normal');
                state.doc.setFontSize(9);
                state.doc.setTextColor(...BRAND_INK);
                const lines = state.doc.splitTextToSize(snap.profile.description, W - 28);
                state.doc.text(lines, 14, state.y);
                state.y += lines.length * 4.2 + 4;
            }
            if (snap.profile.segments && snap.profile.segments.length) {
                subHeader(state, 'Revenue Segments');
                writeTable(state,
                    [['Segment', 'Share']],
                    snap.profile.segments.map(s => [s.name, s.share]),
                    {
                        columnStyles: {
                            0: { cellWidth: 'auto' },
                            1: { halign: 'right', cellWidth: 28, fontStyle: 'bold' }
                        }
                    }
                );
            }
        }

        // ── Price Chart (only if a fallback canvas is rendered) ──
        // TradingView embed is a cross-origin iframe and cannot be
        // captured; for the ~22 restricted tickers report.html paints a
        // fallback canvas which is same-origin and can be exported.
        tryCaptureFinVaultChart(state);

        sectionHeader(state, 'Market Context');
        const mc = snap.marketContext;
        kvTable(state, [
            ['Current Price', mc.currentPrice || '—'],
            ['52-Week Range', mc.week52Range || '—'],
            ['Realized Volatility', mc.realizedVolatility || '—'],
            ['Beta vs SPY', mc.betaVsSPY || '—'],
            ['TTM Dividend Yield', mc.ttmDividendYield || '—'],
            ['Last Dividend', mc.lastDividend || '—'],
            ['Sentinel Risk Tier', mc.sentinelRisk || '—']
        ]);

        const fe = snap.forwardEstimates;
        const hasFE = Object.values(fe).some(v => v != null);
        if (hasFE) {
            sectionHeader(state, 'Forward Estimates');
            kvTable(state, [
                ['Breakdown', fe.breakdown || '—'],
                ['Target Median', fe.targetMedian || '—'],
                ['Target Range', fe.targetRange || '—'],
                ['Target Upside', fe.targetUpside || '—'],
                ['Analyst Count', fe.analystCount || '—']
            ]);
        }

        sectionHeader(state, 'Multiples');
        const m = snap.multiples;
        kvTable(state, [
            ['Trailing P/E', m.trailingPE || '—'],
            ['Forward P/E', m.forwardPE || '—'],
            ['Price / FCF', m.priceFCF || '—'],
            ['Dividend Yield', m.dividendYield || '—'],
            ['EV / EBITDA', m.evEbitda || '—'],
            ['EV / Sales', m.evSales || '—'],
            ['P / B', m.priceToBook || '—']
        ]);

        const ratioKeys = Object.keys(snap.ratios);
        if (ratioKeys.length) {
            sectionHeader(state, 'Financial Ratios');
            kvTable(state,
                ratioKeys.map(k => [k, snap.ratios[k] || '—']),
                { headers: ['Ratio', 'Value'] }
            );
        }

        sectionHeader(state, 'Fundamentals Highlights');
        const fh = snap.fundamentalsHighlights;
        kvTable(state, [
            ['52W Return', fh.week52Return || '—'],
            ['Revenue Growth 5Y', fh.revenueGrowth5Y || '—'],
            ['EPS Growth 5Y', fh.epsGrowth5Y || '—']
        ]);

    }

    function buildOsirisBody(state) {
        const snap = state.snap;

        // Price-simulation chart goes first if a simulation has been run.
        tryCaptureOsirisChart(state);

        sectionHeader(state, 'Simulator State');
        const s = snap.simulatorState;
        kvTable(state, [
            ['Volatility (σ)', s.volatility || '—'],
            ['Physics Parameter', s.physicsParam || '—'],
            ['Time Horizon', s.horizon || '—'],
            ['Volatility Regime', s.volatilityRegime || '—'],
            ['Operational Shock', s.operationalShock || '—'],
            ['Data Source', s.dataSource || '—']
        ]);

        if (snap.physics) {
            sectionHeader(state, 'Physics');
            const p = snap.physics;
            kvTable(state, [
                ['Cohort', p.cohort || '—'],
                ['Baseline Volatility', p.baselineVolatility != null ? String(p.baselineVolatility) : '—'],
                ['Reversion Speed (θ)', p.reversionSpeedTheta != null ? String(p.reversionSpeedTheta) : '—'],
                ['Jump Frequency (λ)', p.jumpFrequencyLambda != null ? String(p.jumpFrequencyLambda) : '—'],
                ['Jump Mean (μ)', p.jumpMu != null ? String(p.jumpMu) : '—'],
                ['Credit Rating', p.creditRating || '—'],
                ['Rating Last Verified', p.ratingLastVerified || '—']
            ]);
        }

        const o = snap.oracle || {};
        const hasOracle = Object.keys(o).length > 0;
        if (hasOracle) {
            sectionHeader(state, 'Oracle Output');
            if (o.headline) {
                ensureSpace(state, 12);
                const W = state.doc.internal.pageSize.getWidth();
                state.doc.setFont('helvetica', 'normal');
                state.doc.setFontSize(9);
                state.doc.setTextColor(...BRAND_INK);
                const lines = state.doc.splitTextToSize(o.headline, W - 28);
                state.doc.text(lines, 14, state.y);
                state.y += lines.length * 4.2 + 3;
            }
            kvTable(state, [
                ['Upside Ceiling (95th)', o.upsideCeiling || '—'],
                ['Expected Value (median)', o.expectedValue || '—'],
                ['Stress Floor (5th)', o.stressFloor || '—']
            ]);
        }
    }

    async function buildSentinelBody(state) {
        const snap = state.snap;

        // Live snapshot from the card — the yield/spread the user sees.
        sectionHeader(state, 'Yield Stack (live)');
        kvTable(state, [
            ['Implied Total Yield', snap.live.impliedYield || '—'],
            ['Current Spread', snap.live.currentSpread || '—'],
            ['Risk Level', snap.live.riskLevel || '—'],
            ['Market Pulse', snap.live.marketPulse || '—'],
            ['Last Calibrated', snap.live.lastCalibrated || '—']
        ]);

        // Regression Attribution Waterfall — opens the modal off-screen
        // for ~700ms so Chart.js can paint, captures the canvas, closes.
        sectionHeader(state, 'Regression Attribution Waterfall');
        try {
            const chart = await captureSentinelWaterfall(snap.ticker);
            if (chart && chart.dataURL) {
                const W = state.doc.internal.pageSize.getWidth();
                const margin = 14;
                const maxW = W - margin * 2;
                const maxH = 85;
                const aspect = chart.width / chart.height;
                let imgW = maxW;
                let imgH = imgW / aspect;
                if (imgH > maxH) { imgH = maxH; imgW = imgH * aspect; }
                ensureSpace(state, imgH + 6);
                state.doc.addImage(chart.dataURL, 'PNG',
                    margin + (maxW - imgW) / 2, state.y, imgW, imgH);
                state.y += imgH + 6;
            } else {
                ensureSpace(state, 10);
                state.doc.setFont('helvetica', 'italic');
                state.doc.setFontSize(8);
                state.doc.setTextColor(...BRAND_MUTED);
                state.doc.text('Waterfall chart unavailable.', 14, state.y);
                state.y += 6;
            }
        } catch (e) {
            console.warn('[Downloads] waterfall capture failed', e);
        }

        // Static calibration anchors from universe.json.
        sectionHeader(state, 'Credit Calibration');
        const s = snap.sentinel;
        kvTable(state, [
            ['Instrument Type', s.type || '—'],
            ['Rating', s.rating || '—'],
            ['Base Spread (bps)', s.baseSpreadBps != null ? String(s.baseSpreadBps) : '—'],
            ['Market Beta', s.marketBeta != null ? Number(s.marketBeta).toFixed(2) : '—'],
            ['Sector Beta', s.sectorBeta != null ? Number(s.sectorBeta).toFixed(2) : '—'],
            ['Base Rate Type', s.baseRateType || '—'],
            ['Anchors Last Verified', s.anchorsLastVerified || '—'],
            ['Reference View', snap.view || '—']
        ]);
    }

    async function downloadPDF(snap) {
        const jsPDF = await loadJsPDF();
        const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true });
        const state = { doc, snap, y: 24 };

        drawCover(state);
        doc.addPage();
        drawPageFrame(doc, snap);
        state.y = 24;

        switch (snap.tool) {
            case 'brief': buildBriefBody(state); break;
            case 'finvault': buildFinVaultBody(state); break;
            case 'osiris': buildOsirisBody(state); break;
            case 'sentinel': await buildSentinelBody(state); break;
            default: throw new Error('Unknown snapshot tool: ' + snap.tool);
        }

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

    // ── Page detection ─────────────────────────────────────────────
    // Returns a descriptor describing how to mount on the current page,
    // or null when the page is not a download surface.
    //   - { kind: 'global', tool, snapshotFn, requireTicker } — single
    //     top-right dropdown (brief / finvault / osiris)
    //   - { kind: 'sentinel-cards' } — per-card buttons injected as
    //     credit cards render (sentinel)
    function detectPage() {
        if (document.getElementById('brief-page')) {
            return { kind: 'global', tool: 'brief', snapshotFn: snapshotBrief, requireTicker: true };
        }
        if (document.getElementById('company-name') && document.getElementById('stats-body')) {
            return { kind: 'global', tool: 'finvault', snapshotFn: snapshotFinVault, requireTicker: false };
        }
        if (document.getElementById('osiris-canvas')) {
            return { kind: 'global', tool: 'osiris', snapshotFn: snapshotOsiris, requireTicker: true };
        }
        if (document.getElementById('sector-alpha-grid')) {
            return { kind: 'sentinel-cards' };
        }
        return null;
    }

    // ── Mount: Sentinel per-card buttons ───────────────────────────
    function runExport(fmt, snap, ticker) {
        // Centralised handler used by both global dropdown and per-card.
        return (async () => {
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
                toast('Download failed (' + (ticker || 'unknown') + ')', true);
            }
        })();
    }

    function injectCardButton(card) {
        if (!card || card.nodeType !== 1) return;
        if (!card.id || !card.id.startsWith('card-')) return;
        if (card.querySelector('.dl-card-btn')) return; // already injected
        const ticker = card.id.slice(5);

        const btn = document.createElement('button');
        btn.className = 'dl-card-btn';
        btn.type = 'button';
        btn.title = 'Download ' + ticker + ' credit report';
        btn.setAttribute('aria-label', 'Download ' + ticker + ' credit report');
        btn.setAttribute('aria-haspopup', 'true');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = '⤓';

        const menu = document.createElement('div');
        menu.className = 'dl-card-menu';
        menu.setAttribute('role', 'menu');
        menu.innerHTML = [
            '<button type="button" data-fmt="pdf" role="menuitem">PDF</button>',
            '<button type="button" data-fmt="json" role="menuitem">JSON</button>',
            '<button type="button" data-fmt="csv" role="menuitem">CSV</button>'
        ].join('');

        const close = () => {
            menu.classList.remove('open');
            btn.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
        };

        // stopPropagation is critical — the card's onclick="openModal()"
        // would otherwise fire and pop the modal whenever the button is
        // clicked. Same goes for menu clicks.
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            // Close any other open card menus first.
            document.querySelectorAll('.dl-card-menu.open').forEach(m => {
                if (m !== menu) m.classList.remove('open');
            });
            document.querySelectorAll('.dl-card-btn.open').forEach(b => {
                if (b !== btn) b.classList.remove('open');
            });
            const willOpen = !menu.classList.contains('open');
            menu.classList.toggle('open', willOpen);
            btn.classList.toggle('open', willOpen);
            btn.setAttribute('aria-expanded', String(willOpen));
        });

        menu.addEventListener('click', async (e) => {
            e.stopPropagation();
            const t = e.target.closest('button[data-fmt]');
            if (!t) return;
            const fmt = t.getAttribute('data-fmt');
            close();
            const snap = await snapshotSentinelTicker(ticker);
            await runExport(fmt, snap, ticker);
        });

        card.appendChild(btn);
        card.appendChild(menu);
    }

    function mountSentinelCards() {
        const grids = ['sector-alpha-grid', 'sector-beta-grid']
            .map(id => document.getElementById(id))
            .filter(Boolean);
        if (grids.length === 0) return;

        // Process any cards already present (unlikely on first paint, but
        // safe if the script runs after grid render — defer wouldn't
        // catch every order).
        grids.forEach(grid => Array.from(grid.children).forEach(injectCardButton));

        // Cards are JS-rendered into the grids after the credit engine
        // resolves. Observe for additions and inject as they arrive.
        const obs = new MutationObserver(mutations => {
            for (const m of mutations) {
                for (const n of m.addedNodes) injectCardButton(n);
            }
        });
        grids.forEach(grid => obs.observe(grid, { childList: true }));

        // Global dismiss for any open card menu.
        document.addEventListener('mousedown', (e) => {
            if (e.target.closest('.dl-card-menu') || e.target.closest('.dl-card-btn')) return;
            document.querySelectorAll('.dl-card-menu.open').forEach(m => m.classList.remove('open'));
            document.querySelectorAll('.dl-card-btn.open').forEach(b => b.classList.remove('open'));
        });
        document.addEventListener('keydown', (e) => {
            if (e.key !== 'Escape') return;
            document.querySelectorAll('.dl-card-menu.open').forEach(m => m.classList.remove('open'));
            document.querySelectorAll('.dl-card-btn.open').forEach(b => b.classList.remove('open'));
        });
    }

    // ── Mount ──────────────────────────────────────────────────────
    function mount() {
        const page = detectPage();
        if (!page) return;
        injectStyles();

        if (page.kind === 'sentinel-cards') {
            mountSentinelCards();
            return;
        }

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
        document.body.appendChild(wrap);

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
            try {
                const snap = await Promise.resolve(page.snapshotFn());
                if (page.requireTicker && !snap.ticker) {
                    toast('No ticker selected', true);
                    return;
                }
                await runExport(fmt, snap, snap.ticker);
            } catch (err) {
                console.error('[Downloads] snapshot failed', err);
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
