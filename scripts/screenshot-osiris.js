#!/usr/bin/env node
/**
 * screenshot-osiris.js
 * Spins up a local static HTTP server, loads osiris.html in headless Chrome,
 * and captures the above-the-fold landing section as a 1080×1080 JPEG at
 * 3× device pixel ratio (3240×3240 output).
 *
 * Usage:  npm run screenshot-osiris
 * Output: Website/osiris-landing.jpg
 */

const puppeteer = require('puppeteer-core');
const http      = require('http');
const fs        = require('fs');
const path      = require('path');

const BROWSER_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const SERVE_ROOT   = path.resolve(__dirname, '..');          // FinVault/
const OUT_FILE     = path.resolve(__dirname, '..', '..', 'osiris-landing.jpg');
const PORT         = 3791;

// Dimensions
const PAGE_W    = 1080;   // viewport width — desktop layout at 1080px
const PAGE_H    = 1500;   // tall enough to avoid clipping the controls
const CROP_H    = 1080;   // final square crop height
const DPR       = 3;      // 3× → 3240×3240 output

const MIME = {
    '.html' : 'text/html; charset=utf-8',
    '.css'  : 'text/css',
    '.js'   : 'application/javascript',
    '.mjs'  : 'application/javascript',
    '.json' : 'application/json',
    '.png'  : 'image/png',
    '.jpg'  : 'image/jpeg',
    '.jpeg' : 'image/jpeg',
    '.svg'  : 'image/svg+xml',
    '.webp' : 'image/webp',
    '.woff' : 'font/woff',
    '.woff2': 'font/woff2',
    '.ico'  : 'image/x-icon',
    '.map'  : 'application/json',
};

function startServer() {
    return new Promise((resolve, reject) => {
        const server = http.createServer((req, res) => {
            const urlPath = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
            let filePath = path.join(SERVE_ROOT, urlPath);
            if (filePath.endsWith(path.sep)) filePath += 'index.html';

            const ext = path.extname(filePath).toLowerCase();
            const contentType = MIME[ext] || 'application/octet-stream';

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404: ' + urlPath);
                    return;
                }
                res.writeHead(200, { 'Content-Type': contentType, 'Cache-Control': 'no-cache' });
                res.end(data);
            });
        });

        server.listen(PORT, '127.0.0.1', () => {
            console.log(`Static server → http://localhost:${PORT}`);
            resolve(server);
        });
        server.on('error', reject);
    });
}

(async () => {
    const server = await startServer();

    console.log('Launching Chrome…');
    const browser = await puppeteer.launch({
        executablePath: BROWSER_PATH,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: PAGE_W, height: PAGE_H, deviceScaleFactor: DPR });

        console.log('Loading osiris.html…');
        await page.goto(`http://localhost:${PORT}/osiris.html`, {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });

        // Wait for the matrix canvas animation and font rendering to settle
        await new Promise(r => setTimeout(r, 2000));

        console.log('Taking screenshot…');
        await page.screenshot({
            path: OUT_FILE,
            type: 'jpeg',
            quality: 100,
            clip: { x: 0, y: 0, width: PAGE_W, height: CROP_H },
        });

        console.log(`\nSaved  → ${OUT_FILE}`);
        console.log(`Output → ${PAGE_W * DPR} × ${CROP_H * DPR} px  (${DPR}× DPR)`);
    } finally {
        await browser.close();
        server.close();
        console.log('Server closed.');
    }
})().catch(err => {
    console.error('Failed:', err.message);
    process.exit(1);
});
