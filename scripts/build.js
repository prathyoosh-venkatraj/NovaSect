#!/usr/bin/env node
/**
 * Minify standalone JS + CSS to `*.min.js` / `*.min.css` alongside source.
 *
 * Usage:  npm run build
 *
 * HTML files reference the `.min.*` outputs. Source files remain editable;
 * re-run this script after any edit. Sourcemaps are intentionally NOT emitted
 * — a public .map de-minifies the bundle back to original source.
 *
 * The Osiris ES-module client (components/osiris/) is bundled + minified here:
 * osiris.js and osirisIngestion.js → single ESM .min.js files (imports inlined);
 * the classic stochasticWorker.js is minified in place. The HTML/import sites
 * load the .min outputs and the raw sources are excluded from the deploy.
 */
const esbuild = require('esbuild');
const fs = require('fs');

const JS_TARGETS = [
    'script.js',
    'osiris-bg.js',
    'sentinel-promo.js',
    'sentinel.v2.js',
    'enhance.js'
];

const CSS_TARGETS = [
    'style.css'
];

function fmt(n) { return (n / 1024).toFixed(1) + ' KB'; }

(async () => {
    let totalBefore = 0;
    let totalAfter = 0;

    for (const file of JS_TARGETS) {
        if (!fs.existsSync(file)) {
            console.warn(`SKIP — missing: ${file}`);
            continue;
        }
        const out = file.replace(/\.js$/, '.min.js');
        await esbuild.build({
            entryPoints: [file],
            outfile: out,
            minify: true,
            sourcemap: false,
            target: 'es2020',
            bundle: false,
            legalComments: 'none'
        });
        const before = fs.statSync(file).size;
        const after = fs.statSync(out).size;
        totalBefore += before;
        totalAfter += after;
        console.log(`${file}  (${fmt(before)})  →  ${out}  (${fmt(after)})  −${((1 - after / before) * 100).toFixed(1)}%`);
    }

    for (const file of CSS_TARGETS) {
        if (!fs.existsSync(file)) {
            console.warn(`SKIP — missing: ${file}`);
            continue;
        }
        const out = file.replace(/\.css$/, '.min.css');
        await esbuild.build({
            entryPoints: [file],
            outfile: out,
            minify: true,
            sourcemap: false,
            loader: { '.css': 'css' }
        });
        const before = fs.statSync(file).size;
        const after = fs.statSync(out).size;
        totalBefore += before;
        totalAfter += after;
        console.log(`${file}  (${fmt(before)})  →  ${out}  (${fmt(after)})  −${((1 - after / before) * 100).toFixed(1)}%`);
    }

    // ── Osiris ES-module client — bundled (imports inlined) + minified ────
    // osiris.js is the entry (imports ingestion/cloudCanvas/oracle);
    // osirisIngestion.js is also imported directly by report.html + brief.html.
    const OSIRIS_BUNDLES = [
        'components/osiris/osiris.js',
        'components/osiris/osirisIngestion.js',
    ];
    for (const file of OSIRIS_BUNDLES) {
        if (!fs.existsSync(file)) { console.warn(`SKIP — missing: ${file}`); continue; }
        const out = file.replace(/\.js$/, '.min.js');
        await esbuild.build({
            entryPoints: [file], outfile: out,
            bundle: true, minify: true, format: 'esm', target: 'es2020',
            sourcemap: false, legalComments: 'none',
        });
        const before = fs.statSync(file).size, after = fs.statSync(out).size;
        totalBefore += before; totalAfter += after;
        console.log(`${file}  (${fmt(before)})  →  ${out}  (${fmt(after)})  bundled`);
    }
    // stochasticWorker.js is a classic worker (no imports) — minify only.
    {
        const file = 'components/osiris/stochasticWorker.js';
        if (fs.existsSync(file)) {
            const out = file.replace(/\.js$/, '.min.js');
            await esbuild.build({
                entryPoints: [file], outfile: out,
                bundle: false, minify: true, target: 'es2020',
                sourcemap: false, legalComments: 'none',
            });
            const before = fs.statSync(file).size, after = fs.statSync(out).size;
            totalBefore += before; totalAfter += after;
            console.log(`${file}  (${fmt(before)})  →  ${out}  (${fmt(after)})  worker`);
        }
    }

    console.log(`\nTotal:  ${fmt(totalBefore)}  →  ${fmt(totalAfter)}  (saved ${fmt(totalBefore - totalAfter)}, ${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%)`);
})().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
