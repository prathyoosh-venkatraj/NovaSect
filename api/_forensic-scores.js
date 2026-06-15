/**
 * _forensic-scores.js — server-only forensic-accounting scores for the sec-proxy.
 *
 * Same-directory copy of scripts/lib/forensic-scores.mjs (underscore = not a
 * route) so Vercel reliably bundles it into the function. Cross-directory
 * imports into ../scripts are not bundled. KEEP IN SYNC with the lib copy
 * (which is the unit-tested source of truth: scripts/test-forensic-scores.mjs).
 *
 * Altman Z (sector-aware), Beneish M, Piotroski F — pure, every input traces to
 * a 10-K line item. References: Altman (1968 / 2000 Z''); Beneish (1999);
 * Piotroski (2000).
 */

const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;
const div = (a, b) => (a != null && b != null && b !== 0) ? a / b : null;
const sub = (a, b) => (a != null && b != null) ? a - b : null;
function wsum(pairs) {
  let s = 0;
  for (const [coef, val] of pairs) { if (val == null) return null; s += coef * val; }
  return s;
}

function yearMaps(seriesX) {
  const maps = {};
  for (const k of Object.keys(seriesX || {})) {
    const m = new Map();
    for (const e of (seriesX[k] || [])) if (e && e.end != null && e.value != null) m.set(e.end.slice(0, 4), e.value);
    maps[k] = m;
  }
  return maps;
}

function yearsDesc(maps) {
  const ys = new Set();
  for (const k of ['totalAssets', 'revenue', 'netIncome']) for (const y of (maps[k]?.keys?.() || [])) ys.add(y);
  return [...ys].sort((a, b) => Number(b) - Number(a));
}

function grossMargin(maps, y) {
  const sales = num(maps.revenue?.get(y));
  if (sales == null || sales === 0) return null;
  const gp = num(maps.grossProfit?.get(y));
  if (gp != null) return gp / sales;
  const cogs = num(maps.cogs?.get(y));
  return cogs != null ? (sales - cogs) / sales : null;
}

function altman(maps, y, sector, marketCap) {
  const g = k => num(maps[k]?.get(y));
  const TA = g('totalAssets');
  if (TA == null || TA === 0) return { available: false, reason: 'no total assets' };

  const X1 = div(sub(g('currentAssets'), g('currentLiabilities')), TA);
  const X2 = div(g('retainedEarnings'), TA);
  // EBIT: operating income, or (pretax + interest) fallback for filers (common
  // in energy) that don't tag OperatingIncomeLoss.
  const ebit = g('operatingIncome') != null ? g('operatingIncome')
             : (g('pretaxIncome') != null && g('interestExpense') != null) ? g('pretaxIncome') + g('interestExpense')
             : null;
  const X3 = div(ebit, TA);
  const TL = g('totalLiabilities');
  const BVE = g('equity');

  const isIndustrial = /industr/i.test(sector || '');
  let model, score, band, note = null;
  let X4, X5 = null;

  if (isIndustrial) {
    model = 'Z (original · manufacturer)';
    let mve = num(marketCap);
    if (mve == null) { mve = BVE; if (BVE != null) note = 'X4 uses book equity (market cap unavailable)'; }
    X4 = div(mve, TL);
    X5 = div(g('revenue'), TA);
    score = wsum([[1.2, X1], [1.4, X2], [3.3, X3], [0.6, X4], [1.0, X5]]);
    band = score == null ? null : score > 2.99 ? 'Safe' : score >= 1.81 ? 'Grey' : 'Distress';
  } else {
    model = "Z'' (non-manufacturer)";
    X4 = div(BVE, TL);
    score = wsum([[6.56, X1], [3.26, X2], [6.72, X3], [1.05, X4]]);
    band = score == null ? null : score > 2.6 ? 'Safe' : score >= 1.1 ? 'Grey' : 'Distress';
  }

  return {
    available: score != null,
    reason: score == null ? 'missing inputs' : undefined,
    model, score, band, note,
    components: { X1, X2, X3, X4, X5 },
  };
}

function beneish(maps, y, p) {
  const gy = k => num(maps[k]?.get(y));
  const gp = k => num(maps[k]?.get(p));

  const salesY = gy('revenue'), salesP = gp('revenue');
  const DSRI = div(div(gy('receivables'), salesY), div(gp('receivables'), salesP));
  const GMI  = div(grossMargin(maps, p), grossMargin(maps, y));

  const assetQuality = (CA, PPE, TA) => (CA != null && PPE != null && TA != null && TA !== 0) ? 1 - (CA + PPE) / TA : null;
  const AQI = div(assetQuality(gy('currentAssets'), gy('ppeNet'), gy('totalAssets')),
                  assetQuality(gp('currentAssets'), gp('ppeNet'), gp('totalAssets')));

  const SGI = div(salesY, salesP);

  const depRate = (dep, ppe) => (dep != null && ppe != null && (dep + ppe) !== 0) ? dep / (dep + ppe) : null;
  const DEPI = div(depRate(gp('da'), gp('ppeNet')), depRate(gy('da'), gy('ppeNet')));

  const SGAI = div(div(gy('sga'), salesY), div(gp('sga'), salesP));
  const LVGI = div(div(gy('totalLiabilities'), gy('totalAssets')), div(gp('totalLiabilities'), gp('totalAssets')));
  const TATA = div(sub(gy('netIncome'), gy('ocf')), gy('totalAssets'));

  const idx = { DSRI, GMI, AQI, SGI, DEPI, SGAI, LVGI, TATA };
  const M = wsum([
    [1, -4.84], [0.92, DSRI], [0.528, GMI], [0.404, AQI], [0.892, SGI],
    [0.115, DEPI], [-0.172, SGAI], [4.679, TATA], [-0.327, LVGI],
  ]);
  return M == null
    ? { available: false, reason: 'missing inputs', indices: idx, missing: Object.keys(idx).filter(k => idx[k] == null) }
    : { available: true, score: M, flag: M > -1.78 ? 'Likely manipulator' : 'Unlikely', indices: idx };
}

function piotroski(maps, y, p) {
  const gy = k => num(maps[k]?.get(y));
  const gp = k => num(maps[k]?.get(p));

  const roaY = div(gy('netIncome'), gy('totalAssets'));
  const roaP = div(gp('netIncome'), gp('totalAssets'));
  const crY = div(gy('currentAssets'), gy('currentLiabilities'));
  const crP = div(gp('currentAssets'), gp('currentLiabilities'));
  const levY = div(gy('longTermDebt'), gy('totalAssets'));
  const levP = div(gp('longTermDebt'), gp('totalAssets'));
  const atoY = div(gy('revenue'), gy('totalAssets'));
  const atoP = div(gp('revenue'), gp('totalAssets'));
  const gmY = grossMargin(maps, y), gmP = grossMargin(maps, p);

  const gt0 = v => v == null ? null : v > 0;
  const inc = (a, b) => (a == null || b == null) ? null : a > b;
  const dec = (a, b) => (a == null || b == null) ? null : a < b;

  const signals = {
    roaPositive:     gt0(roaY),
    cfoPositive:     gt0(gy('ocf')),
    roaImproving:    inc(roaY, roaP),
    accrualQuality:  (gy('ocf') == null || gy('netIncome') == null) ? null : gy('ocf') > gy('netIncome'),
    leverageDown:    dec(levY, levP),
    currentRatioUp:  inc(crY, crP),
    noNewShares:     (gy('sharesOut') == null || gp('sharesOut') == null) ? null : gy('sharesOut') <= gp('sharesOut') * 1.001,
    grossMarginUp:   inc(gmY, gmP),
    assetTurnoverUp: inc(atoY, atoP),
  };

  const evaluable = Object.values(signals).filter(v => v !== null).length;
  const F = Object.values(signals).filter(v => v === true).length;
  return {
    available: evaluable > 0,
    score: F, max: 9, evaluable,
    band: F >= 7 ? 'Strong' : F <= 2 ? 'Weak' : 'Moderate',
    signals,
  };
}

export function forensicScores(seriesX, opts = {}) {
  const maps = yearMaps(seriesX);
  const yrs = yearsDesc(maps);
  if (!yrs.length) return null;
  const y = yrs[0], p = yrs[1] || null;
  return {
    asOf: y,
    altman: altman(maps, y, opts.sector, opts.marketCap),
    beneish: p ? beneish(maps, y, p) : { available: false, reason: 'needs two annual periods' },
    piotroski: p ? piotroski(maps, y, p) : { available: false, reason: 'needs two annual periods' },
  };
}
