/**
 * NSCreditSpread — shared, scenario-aware credit-spread compute (window global).
 *
 * Canonical browser mirror of Sentinel's CreditEngine.calculateCurrentSpread at
 * the default Unsecured · 10Y instrument (seniority/tenure multipliers = 1.0).
 * Used by scenario.html (multi-issuer) so every shocked spread reconciles with
 * the dossier + the Sentinel dashboard. Pure given its inputs.
 *
 *   macros   = { ust, vix, ratingIdxBps, sectorVol }   (live, or fallbacks)
 *   scenario = NSState scenario or null  { rateBps, vix, sectorVolPct, sovereignBps, commodityPct }
 *
 * Scenario semantics:
 *   rateBps      additive shock to the UST base (bps)
 *   vix          absolute VIX level override (>0 uses it; else live)
 *   sectorVolPct relative % bump to sector volatility
 *   sovereignBps additive bps to the country sovereign spread
 *   commodityPct equity-vol / Osiris input — no direct Sentinel leg
 */
(() => {
    if (window.NSCreditSpread) return;

    const SOV = { US: 0, DE: 0, FR: 0, NO: 45, ES: 80, IT: 145, UK: 0, SE: 0, AU: 0, JP: 0, SA: 100, BR: 250, IN: 250 };

    function tierFromSpread(spread) {
        if (spread < 200) return { tier: 'NOMINAL', cls: 'green' };
        if (spread < 400) return { tier: 'CAUTION', cls: 'amber' };
        if (spread < 800) return { tier: 'ELEVATED', cls: 'amber' };
        return { tier: 'CRITICAL', cls: 'red' };
    }

    function compute(sentinel, country, macros, scenario) {
        const s = sentinel || {};
        const sc = scenario || {};
        const m = macros || {};
        const ust = (typeof m.ust === 'number' ? m.ust : 4.25) + (Number(sc.rateBps) || 0) / 100;
        const vix = (Number(sc.vix) > 0) ? Number(sc.vix) : (typeof m.vix === 'number' ? m.vix : 15);
        const sectorVol = (typeof m.sectorVol === 'number' ? m.sectorVol : 22) * (1 + (Number(sc.sectorVolPct) || 0) / 100);
        const ratingIdxBps = typeof m.ratingIdxBps === 'number' ? m.ratingIdxBps : 0;

        const cFactor = Math.min(0.8, Math.max(0, (vix - 25) / 25));
        const effSectorBeta = (1 - cFactor) * s.sectorBeta + cFactor;
        const effMarketBeta = (1 - cFactor) * s.marketBeta + cFactor;
        const proxyVol = sectorVol * effSectorBeta;
        const merton = 1.5 + 1.0 / (1 + Math.exp(-0.4 * (proxyVol - 35)));
        const sens = s.type === 'IG' ? 0.35 : 1.0;
        const anchor = Math.max(s.baseSpread, ratingIdxBps);
        const volPrem = proxyVol * merton * sens;
        const mktComp = effMarketBeta * 50 * sens;
        const spread = Math.round(anchor + volPrem + mktComp);

        const sov = (SOV[country] || 0) + (Number(sc.sovereignBps) || 0);
        const yld = ust + (sov + spread) / 100;
        return { spread, yield: yld, tier: tierFromSpread(spread), proxyVol };
    }

    window.NSCreditSpread = { compute, tierFromSpread, SOV };
})();
