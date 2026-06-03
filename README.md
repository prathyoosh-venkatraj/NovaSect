# NovaSect

**A free, transparent equity-research platform.** Three tools, one philosophy: explainable models
over live public data — no black boxes in the browser.

🌐 **Live:** [novasect.space](https://novasect.space)

## 📖 Documentation

> **[docs/HANDBOOK.md](docs/HANDBOOK.md)** — the full platform handbook & quant reference:
> every engine, the exact formulas behind each number, the data flow, the security posture,
> assumptions, and a curated reading list. **Start here.**

The formal spec is auto-generated at `NovaSect_Technical_Reference.docx`
(via `scripts/generate-tech-doc.mjs`).

## The three tools

| Tool | What it does |
|---|---|
| **Sentinel** | Real-time synthetic **credit-spread** engine — macro anchor + volatility premium (Merton-sigmoid) + market/seniority/tenure legs → implied yield & probability of default, refreshed every ~5 s. |
| **Osiris** | **Monte-Carlo** price-trajectory simulator — Ornstein-Uhlenbeck / GBM-jump physics in a Web Worker → probability-weighted price distributions. |
| **FinVault** | **Equity research** — SEC-XBRL + 10-K deep-dive reports, live multiples/fundamentals, and 5-year horizontal analysis. |

## Stack

Vanilla JS (ES modules) · Chart.js + Canvas · TradingView embeds · Vercel (static + serverless
proxies) · Sentry + Umami. Client is bundled/minified with esbuild.

```
*.html                     ← pages
sentinel.v2.js, components/osiris/, components/…   ← clients (→ *.min.* served)
api/                       ← serverless proxies (hide keys, edge cache)
scripts/                   ← offline build/report/CI tooling (not served)
data/, physics-config.json ← static data fetched at runtime
```

## Development

```bash
npm run build          # esbuild: minify/bundle the client → commit the .min outputs
npm run generate-report -- <TICKER>   # offline FinVault report pipeline (needs SEC + Claude key)
npm run sitemap        # regenerate sitemap.xml
```
> The deployed `.min.*` files are committed and authoritative — Vercel runs a no-op build, so
> **re-run `npm run build` and commit the outputs after any client-source edit.**

## Notes

Secrets live in Vercel / GitHub Actions env (never in the repo). Source, build tooling, maps and
docs are kept off the public site via `.vercelignore`.

---

*NovaSect is an analytical and educational platform. All models are transparent approximations over
third-party public data and are **not investment advice**.*
