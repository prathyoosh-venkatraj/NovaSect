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
 * ES-module components under components/osiris/ are intentionally skipped:
 * they're small, frequently edited, and per-file minification would require
 * rewriting their relative import paths. Bundling would change the file
 * structure beyond what the deploy expects.
 */
const esbuild = require('esbuild');
const fs = require('fs');

const JS_TARGETS = [
    'script.js',
    'osiris-bg.js',
    'sentinel-promo.js',
    'sentinel.v2.js'
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

    console.log(`\nTotal:  ${fmt(totalBefore)}  →  ${fmt(totalAfter)}  (saved ${fmt(totalBefore - totalAfter)}, ${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%)`);
})().catch(err => {
    console.error('Build failed:', err);
    process.exit(1);
});
