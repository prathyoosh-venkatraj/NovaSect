#!/usr/bin/env node
/**
 * One-off probe: ask TradingView's symbol-search API whether each
 * FinVault TradingView ticker resolves to a real symbol on the
 * expected exchange. Used to identify which report pages will show
 * an empty / "symbol not found" chart.
 *
 * Run: node scripts/check-tv-tickers.js
 */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const all = [
    // Existing 9
    ['chevron',         'Chevron',              'NYSE:CVX'],
    ['exxonmobil',      'ExxonMobil',           'NYSE:XOM'],
    ['iberdrola',       'Iberdrola',            'BME:IBE'],
    ['lockheedmartin',  'Lockheed Martin',      'NYSE:LMT'],
    ['northropgrumman', 'Northrop Grumman',     'NYSE:NOC'],
    ['generaldynamics', 'General Dynamics',     'NYSE:GD'],
    ['l3harris',        'L3Harris',             'NYSE:LHX'],
    ['rheinmetall',     'Rheinmetall',          'XETR:RHM'],
    ['rtx',             'RTX Corp',             'NYSE:RTX'],
    // Energy skeletons
    ['shel',        'Shell PLC',           'NYSE:SHEL'],
    ['eqnr',        'Equinor',             'NYSE:EQNR'],
    ['mpc',         'Marathon Petroleum',  'NYSE:MPC'],
    ['bp',          'BP PLC',              'NYSE:BP'],
    ['tte',         'TotalEnergies',       'NYSE:TTE'],
    ['cop',         'ConocoPhillips',      'NYSE:COP'],
    ['eog',         'EOG Resources',       'NYSE:EOG'],
    ['slb',         'SLB',                 'NYSE:SLB'],
    ['hal',         'Halliburton',         'NYSE:HAL'],
    ['bkr',         'Baker Hughes',        'NASDAQ:BKR'],
    ['vlo',         'Valero Energy',       'NYSE:VLO'],
    ['psx',         'Phillips 66',         'NYSE:PSX'],
    ['oxy',         'Occidental',          'NYSE:OXY'],
    ['wmb',         'Williams Cos',        'NYSE:WMB'],
    ['kmi',         'Kinder Morgan',       'NYSE:KMI'],
    ['eni-mi',      'Eni SpA',             'MIL:ENI'],
    ['pbr',         'Petrobras',           'NYSE:PBR'],
    ['2222-sr',     'Saudi Aramco',        'TADAWUL:2222'],
    ['reliance-ns', 'Reliance Industries', 'NSE:RELIANCE'],
    ['wds-ax',      'Woodside Energy',     'ASX:WDS'],
    ['rep-mc',      'Repsol',              'BME:REP'],
    ['dvn',         'Devon Energy',        'NYSE:DVN'],
    ['fang',        'Diamondback Energy',  'NASDAQ:FANG'],
    // Utilities skeletons
    ['engi-pa',     'Engie',               'EURONEXT:ENGI'],
    ['enel-mi',     'Enel SpA',            'MIL:ENEL'],
    ['nee',         'NextEra Energy',      'NYSE:NEE'],
    ['duk',         'Duke Energy',         'NYSE:DUK'],
    ['so',          'Southern Co',         'NYSE:SO'],
    ['d',           'Dominion Energy',     'NYSE:D'],
    ['aep',         'American Electric',   'NASDAQ:AEP'],
    ['exc',         'Exelon Corp',         'NASDAQ:EXC'],
    ['sre',         'Sempra Energy',       'NYSE:SRE'],
    ['xel',         'Xcel Energy',         'NASDAQ:XEL'],
    ['pcg',         'PGE Corp',            'NYSE:PCG'],
    ['peg',         'Public Service',      'NYSE:PEG'],
    ['wec',         'WEC Energy',          'NYSE:WEC'],
    ['awk',         'American Water Works','NYSE:AWK'],
    ['ntgy-mc',     'Naturgy',             'BME:NTGY'],
    ['sse-l',       'SSE PLC',             'LSE:SSE'],
    ['ng-l',        'National Grid',       'LSE:NG.'],
    ['9501-t',      'Tokyo Electric Power','TSE:9501'],
    ['ntpc-ns',     'NTPC',                'NSE:NTPC'],
    ['org-ax',      'Origin Energy',       'ASX:ORG'],
    ['eoan-de',     'E.ON',                'XETR:EOAN'],
    ['rwe-de',      'RWE',                 'XETR:RWE'],
    ['etr',         'Entergy',             'NYSE:ETR'],
    // Industrials skeletons
    ['ldo-mi',      'Leonardo SpA',        'MIL:LDO'],
    ['ba',          'Boeing',              'NYSE:BA'],
    ['air-pa',      'Airbus SE',           'EURONEXT:AIR'],
    ['ge',          'GE Aerospace',        'NYSE:GE'],
    ['hon',         'Honeywell',           'NASDAQ:HON'],
    ['ups',         'United Parcel',       'NYSE:UPS'],
    ['unp',         'Union Pacific',       'NYSE:UNP'],
    ['cat',         'Caterpillar',         'NYSE:CAT'],
    ['de',          'Deere and Co',        'NYSE:DE'],
    ['luv',         'Southwest Airlines',  'NYSE:LUV'],
    ['dal',         'Delta Air Lines',     'NYSE:DAL'],
    ['mmm',         '3M Company',          'NYSE:MMM'],
    ['emr',         'Emerson Electric',    'NYSE:EMR'],
    ['etn',         'Eaton Corp',          'NYSE:ETN'],
    ['saf-pa',      'Safran SA',           'EURONEXT:SAF'],
    ['rr-l',        'Rolls-Royce',         'LSE:RR.'],
    ['vow3-de',     'Volkswagen',          'XETR:VOW3'],
    ['sie-de',      'Siemens AG',          'XETR:SIE'],
    ['dhl-de',      'DHL Group',           'XETR:DHL'],
    ['ba-l',        'BAE Systems',         'LSE:BA.'],
    ['ho-pa',       'Thales',              'EURONEXT:HO'],
    ['7011-t',      'Mitsubishi Heavy',    'TSE:7011'],
    ['6301-t',      'Komatsu',             'TSE:6301'],
    ['lt-ns',       'Larsen and Toubro',   'NSE:LT'],
    ['embj3-sa',    'Embraer',             'BMFBOVESPA:EMBJ3'],
    ['atco-a-st',   'Atlas Copco',         'OMXSTO:ATCO_A'],
    ['volv-b-st',   'Volvo Group',         'OMXSTO:VOLV_B'],
    ['hwm',         'Howmet Aerospace',    'NYSE:HWM']
];

function stripEm(s) { return (s || '').replace(/<\/?em>/g, ''); }

async function check(slug, name, tv) {
    const [exch, sym] = tv.split(':');
    const u = 'https://symbol-search.tradingview.com/symbol_search/?text=' +
        encodeURIComponent(sym) + '&hl=1&exchange=' + encodeURIComponent(exch) + '&lang=en';
    try {
        const r = await fetch(u, {
            headers: {
                'User-Agent': UA,
                'Origin': 'https://www.tradingview.com',
                'Referer': 'https://www.tradingview.com/'
            }
        });
        if (!r.ok) return { slug, name, tv, ok: false, reason: 'HTTP ' + r.status };
        const data = await r.json();
        if (!Array.isArray(data) || data.length === 0) {
            return { slug, name, tv, ok: false, reason: 'no match' };
        }
        const exact = data.find(d =>
            (d.exchange === exch || d.source_id === exch) &&
            (stripEm(d.symbol) === sym)
        );
        if (exact) return { slug, name, tv, ok: true };
        const sample = data.slice(0, 3)
            .map(d => (d.exchange || d.source_id) + ':' + stripEm(d.symbol))
            .join(', ');
        return { slug, name, tv, ok: false, reason: 'no exact match — top results: ' + sample };
    } catch (e) {
        return { slug, name, tv, ok: false, reason: 'ERR ' + e.message };
    }
}

(async () => {
    const fails = [];
    let i = 0;
    for (const [slug, name, tv] of all) {
        const r = await check(slug, name, tv);
        i++;
        if (!r.ok) fails.push(r);
        // Light pacing to avoid rate limit.
        await new Promise(res => setTimeout(res, 120));
    }

    console.log('');
    console.log('=== TradingView ticker resolution check ==='.padEnd(78, '='));
    console.log('Total tickers: ' + all.length + ' · Failed: ' + fails.length);
    console.log('-'.repeat(78));
    if (fails.length === 0) {
        console.log('All TradingView symbols resolved cleanly.');
    } else {
        for (const f of fails) {
            console.log('  ' + f.tv.padEnd(22) + f.name.padEnd(26) + '[' + f.slug + ']');
            console.log('    ' + (f.reason || '?'));
        }
    }
})();
