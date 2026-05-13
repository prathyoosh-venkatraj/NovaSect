#!/usr/bin/env node
/**
 * One-off (re-runnable) image conversion: PNG/JPEG → WebP @ quality 80.
 *
 * Usage:  npm run convert-images
 *
 * Re-running is safe: outputs are deterministic, original files are read-only.
 * After running, delete the source files manually if happy with the WebP output.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const TARGETS = [
    'sentinel_prime_mesh_asset_1776583258739.png',
    'assets/reactor.png',
    'assets/f15.png',
    'assets/novasect-pfp-coin.jpeg',
    'assets/website-picture.jpeg'
];

(async () => {
    let totalBefore = 0;
    let totalAfter = 0;
    for (const file of TARGETS) {
        const abs = path.resolve(file);
        if (!fs.existsSync(abs)) {
            console.warn(`SKIP — missing: ${file}`);
            continue;
        }
        const before = fs.statSync(abs).size;
        const out = file.replace(/\.(png|jpe?g)$/i, '.webp');
        const info = await sharp(abs).webp({ quality: 80, effort: 6 }).toFile(out);
        const reduction = ((1 - info.size / before) * 100).toFixed(1);
        console.log(`${file}  (${(before / 1024).toFixed(0)} KB)  →  ${out}  (${(info.size / 1024).toFixed(0)} KB)  −${reduction}%`);
        totalBefore += before;
        totalAfter += info.size;
    }
    console.log(`\nTotal: ${(totalBefore / 1024).toFixed(0)} KB  →  ${(totalAfter / 1024).toFixed(0)} KB  (saved ${((totalBefore - totalAfter) / 1024).toFixed(0)} KB, ${((1 - totalAfter / totalBefore) * 100).toFixed(1)}%)`);
})().catch(err => {
    console.error('Conversion failed:', err);
    process.exit(1);
});
