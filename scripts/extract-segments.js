#!/usr/bin/env node
/**
 * One-off script: extract text from 10-K PDFs and dump snippets around
 * "segment" / "reportable segments" / "operating segments" keywords so
 * we can find the revenue-by-segment disclosure quickly.
 *
 * Usage:  node scripts/extract-segments.js <path/to/file.pdf>
 *         node scripts/extract-segments.js --dump <path>  (full text)
 */
const fs = require('fs');
const path = require('path');

(async () => {
    const args = process.argv.slice(2);
    const dumpAll = args[0] === '--dump';
    const filePath = dumpAll ? args[1] : args[0];

    if (!filePath || !fs.existsSync(filePath)) {
        console.error('Usage: node scripts/extract-segments.js [--dump] <path/to/pdf>');
        process.exit(1);
    }

    const pdfParse = require('pdf-parse');
    const buffer = fs.readFileSync(filePath);
    const data = await pdfParse(buffer);
    const text = data.text;

    if (dumpAll) {
        process.stdout.write(text);
        return;
    }

    console.log(`File: ${path.basename(filePath)}`);
    console.log(`Total pages: ${data.numpages}`);
    console.log(`Total chars: ${text.length}`);
    console.log('─'.repeat(60));

    // Look for segment-related sections; output with context.
    const lines = text.split('\n');
    const segmentRegex = /^.*\b(reportable\s+segments?|operating\s+segments?|business\s+segments?|segment\s+(information|reporting|revenue|results|earnings))\b.*$/i;

    const seen = new Set();
    let count = 0;
    for (let i = 0; i < lines.length; i++) {
        if (segmentRegex.test(lines[i])) {
            const key = Math.floor(i / 30); // dedupe nearby hits
            if (seen.has(key)) continue;
            seen.add(key);
            count++;
            if (count > 8) break; // cap output
            const start = Math.max(0, i - 2);
            const end = Math.min(lines.length, i + 50);
            console.log(`\n──── MATCH @ line ${i} (${lines[i].trim().slice(0, 80)}…) ────\n`);
            for (let j = start; j < end; j++) {
                console.log(lines[j]);
            }
        }
    }

    if (count === 0) {
        console.log('No segment keywords found. Try --dump for full text.');
    }
})().catch(err => {
    console.error('Extraction failed:', err);
    process.exit(1);
});
