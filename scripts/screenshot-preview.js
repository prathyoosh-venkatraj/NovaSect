#!/usr/bin/env node
/**
 * screenshot-preview.js
 * Renders osiris-marketing-preview.html at 2× device pixel ratio and saves
 * a full-resolution JPEG.  Uses the system Chrome install (puppeteer-core)
 * so no ~170 MB Chromium download is required.
 *
 * Usage:  npm run screenshot
 * Output: Website/osiris-preview.jpg  (2160 × 2700 px, quality 100)
 */

const puppeteer = require('puppeteer-core');
const path      = require('path');
const fs        = require('fs');

const BROWSER_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const HTML_FILE    = path.resolve(__dirname, '..', '..', 'osiris-marketing-preview.html');
const OUT_FILE     = path.resolve(__dirname, '..', '..', 'osiris-preview.jpg');

// Page dimensions — must match the body size in the HTML
const PAGE_W = 1080;
const PAGE_H = 1080;
// 3× DPR → 3240 × 3240 output pixels (maximum quality for Instagram square)
const DPR    = 3;

(async () => {
    if (!fs.existsSync(HTML_FILE)) {
        console.error('HTML file not found:', HTML_FILE);
        process.exit(1);
    }

    console.log('Launching Chrome…');
    const browser = await puppeteer.launch({
        executablePath: BROWSER_PATH,
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-web-security',   // allows loading local file resources
            '--allow-file-access-from-files',
        ]
    });

    try {
        const page = await browser.newPage();

        // Set exact viewport + retina DPR
        await page.setViewport({ width: PAGE_W, height: PAGE_H, deviceScaleFactor: DPR });

        const fileUrl = 'file:///' + HTML_FILE.replace(/\\/g, '/');
        console.log('Loading page…');

        // networkidle2 waits until ≤2 network connections for 500 ms
        // (allows Google Fonts to finish loading)
        await page.goto(fileUrl, { waitUntil: 'networkidle2', timeout: 20000 });

        // Extra settle time for Canvas rendering and font paint
        await new Promise(r => setTimeout(r, 800));

        console.log('Taking screenshot…');
        await page.screenshot({
            path:    OUT_FILE,
            type:    'jpeg',
            quality: 100,
            clip: { x: 0, y: 0, width: PAGE_W, height: PAGE_H }
        });

        console.log(`\nSaved → ${OUT_FILE}`);
        console.log(`Size   → ${PAGE_W * DPR} × ${PAGE_H * DPR} px  (${DPR}× DPR)`);
    } finally {
        await browser.close();
    }
})().catch(err => {
    console.error('Screenshot failed:', err.message);
    process.exit(1);
});
