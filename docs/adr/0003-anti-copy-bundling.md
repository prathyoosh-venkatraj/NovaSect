# ADR-0003 — Protect source: bundle/minify + `.vercelignore` + no-op Vercel build

- **Status:** Accepted (retroactive record)
- **Date:** 2026-06-02
- **Scope:** NovaSect · `scripts/build.js`, `.vercelignore`, `vercel.json`

## Context
Raw client source (sentinel, Osiris ES-module client, `stochasticWorker`, styles) was served
verbatim and trivially copyable. Separately, `package.json` had a `build` script, so Vercel
auto-ran `npm run build` on deploy — which failed because build tooling is excluded from the deploy.

## Decision
1. **esbuild** bundles/minifies the client offline (`scripts/build.js`): Osiris ESM clients bundled
   (imports inlined) → `*.min.js`, `stochasticWorker` minified in place, CSS minified; no source maps.
2. **`.vercelignore`** excludes raw sources, `scripts/`, `.github/`, `*.map`, `*.md`, `*.docx`.
3. **`vercel.json` `buildCommand: "echo skip-build"`** — a no-op so Vercel never runs the (absent)
   build tooling; committed `.min.*` files are authoritative.

## Alternatives considered
- **Private repo** — rejected (loses public visibility; doesn't stop copying of served assets).
- **Leave Vercel to auto-build** — impossible: build tooling is intentionally not deployed.

## Consequences
- Only minified bundles ship. **Rule:** re-run `npm run build` + commit `.min.*` after client edits.
- Pitfall fixed: the first no-op build command had unquoted parentheses → shell parse error →
  changed to a plain `echo skip-build`.
