#!/usr/bin/env node
/**
 * Phase C smoke test — compares daily realized σ against intraday
 * realized σ (the new estimator landing in osirisIngestion) for a few
 * representative tickers. Hits the production proxy directly so the
 * comparison reflects what users actually see.
 *
 *   node scripts/smoke-intraday-vol.mjs
 *   node scripts/smoke-intraday-vol.mjs XOM CVX LMT
 *
 * Reports:
 *   - σ_daily   (annualised stdev of daily log returns over ~1y)
 *   - σ_intraday (annualised √(mean RV × 252) using 5-min bars + overnight
 *                 bridge over the most recent 20 trading days)
 *   - ratio     (intraday / daily — > 1.0 typically; flag if < 0.7 or > 1.6)
 *
 * Exit code: 1 if any ticker's ratio falls outside the plausibility band,
 *            0 otherwise.
 */
const SITE = process.env.SITE_URL || 'https://novasect.space';
const DEFAULT_TICKERS = ['XOM', 'CVX', 'LMT', 'AAPL', 'IBE.MC', 'RHM.DE'];
const RV_WINDOW = 20;

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(url + ' → ' + res.status);
    return res.json();
}

function dailyRealizedVol(series) {
    if (!Array.isArray(series) || series.length < 2) return null;
    const rets = [];
    for (let i = 1; i < series.length; i++) {
        const a = series[i - 1].adjClose, b = series[i].adjClose;
        if (a > 0 && b > 0) rets.push(Math.log(b / a));
    }
    if (rets.length < 2) return null;
    const m = rets.reduce((a, b) => a + b, 0) / rets.length;
    const v = rets.reduce((a, b) => a + (b - m) * (b - m), 0) / (rets.length - 1);
    return Math.sqrt(v) * Math.sqrt(252);
}

function intradayRealizedVol(intradayBars, dailySeries, windowDays) {
    if (!Array.isArray(intradayBars) || intradayBars.length < 50) return null;
    if (!Array.isArray(dailySeries) || dailySeries.length < windowDays) return null;
    const byDate = new Map();
    for (const bar of intradayBars) {
        const date = new Date(bar.ts * 1000).toISOString().split('T')[0];
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date).push(bar.close);
    }
    const dailyByDate = new Map(dailySeries.map(p => [p.date, p.adjClose]));
    const dates = [...byDate.keys()].filter(d => byDate.get(d).length >= 10).sort();
    if (dates.length < Math.max(5, Math.floor(windowDays / 2))) return null;
    const windowDates = dates.slice(-windowDays);
    const dailyRVs = [];
    let prevDate = null;
    for (const date of windowDates) {
        const bars = byDate.get(date);
        let rv = 0;
        for (let i = 1; i < bars.length; i++) {
            const r = Math.log(bars[i] / bars[i - 1]);
            if (isFinite(r)) rv += r * r;
        }
        if (prevDate && dailyByDate.has(prevDate) && bars.length > 0) {
            const overnight = Math.log(bars[0] / dailyByDate.get(prevDate));
            if (isFinite(overnight)) rv += overnight * overnight;
        }
        dailyRVs.push(rv);
        prevDate = date;
    }
    if (dailyRVs.length < 5) return null;
    const mean = dailyRVs.reduce((a, b) => a + b, 0) / dailyRVs.length;
    return Math.sqrt(mean * 252);
}

const tickers = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TICKERS;
console.log('Phase C σ comparison · site=' + SITE + ' · window=' + RV_WINDOW + 'd');
console.log('Ticker    σ_daily    σ_intraday   ratio    sample_days   verdict');
console.log('─'.repeat(75));

let exitCode = 0;
for (const ticker of tickers) {
    let dailySeries, intradayBars;
    try {
        const dailyResp = await fetchJSON(SITE + '/api/yahoo-proxy?symbol=' + encodeURIComponent(ticker) + '&mode=history&range=1y');
        dailySeries = dailyResp.series;
    } catch (e) {
        console.log(ticker.padEnd(10) + ' DAILY FETCH FAILED · ' + e.message);
        exitCode = 1;
        continue;
    }
    try {
        const intradayResp = await fetchJSON(SITE + '/api/yahoo-proxy?symbol=' + encodeURIComponent(ticker) + '&mode=history&interval=5m&range=30d');
        intradayBars = intradayResp.series;
    } catch (e) {
        console.log(ticker.padEnd(10) + ' INTRADAY FETCH FAILED · ' + e.message);
        exitCode = 1;
        continue;
    }
    const sigmaDaily = dailyRealizedVol(dailySeries);
    const sigmaIntraday = intradayRealizedVol(intradayBars, dailySeries, RV_WINDOW);
    if (sigmaDaily == null || sigmaIntraday == null) {
        console.log(ticker.padEnd(10) + ' NULL σ · daily=' + sigmaDaily + ' intraday=' + sigmaIntraday);
        exitCode = 1;
        continue;
    }
    const ratio = sigmaIntraday / sigmaDaily;
    const sampleDays = new Set(intradayBars.map(b => new Date(b.ts * 1000).toISOString().split('T')[0])).size;
    let verdict = 'ok';
    if (ratio < 0.7 || ratio > 1.6) { verdict = 'OUT-OF-BAND'; exitCode = 1; }
    console.log(
        ticker.padEnd(10) +
        (sigmaDaily * 100).toFixed(2).padStart(8) + '%   ' +
        (sigmaIntraday * 100).toFixed(2).padStart(8) + '%   ' +
        ratio.toFixed(3).padStart(6) + '   ' +
        String(sampleDays).padStart(9) + '     ' +
        verdict
    );
}
process.exit(exitCode);
