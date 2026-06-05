# Changelog

All notable changes to NovaSect (Sentinel · Osiris · FinVault). Format follows
[Keep a Changelog](https://keepachangelog.com); commits follow
[Conventional Commits](https://www.conventionalcommits.org). The *why* behind
architectural decisions lives in [`docs/adr/`](docs/adr/).

## [Unreleased]

### Added
- **Change-evidence system** — `scripts/changelog.mjs` (git-log → Discord push embed / markdown
  changelog) and `.github/workflows/push-report.yml`, posting per-push summaries to the
  `#updates-and-implementation` Discord channel. See `docs/adr/`.

## Historical (auto-generated from git log)

### 2026-06-05
- 🔹 integrate ENTER into a glowing reactor core (no separate button) (`64ba0c4`)
- 🔹 move the ENTER button into the cog centre and shrink it (`25be3df`)
- 🔹 headline now reads FINVAULT; remove center text from the cog (`7b4b59b`)
- 🔹 holographic Fallout cog redesign, white FINVAULT, remove staples (`1bb4162`)
- 🔹 replace sector cards with a single FinVault vault-door CTA (`d6f9d8e`)
- 🔹 FinVault Tier 4: forward-looking depth (DCF scenario band + earnings track record) (`72036b0`)
- 🔹 FinVault Tier 3: cross-company screener (precomputed dataset + cron) (`59fabda`)
- 🔹 FinVault Tier 2 fix: EBIT proxy for filers without OperatingIncomeLoss (`78c7e2d`)
- 🔹 FinVault Tier 2: deterministic analytics panel (DuPont, ROIC vs WACC, DCF) (`f8a014b`)
- 🔹 FinVault Tier 1: surface existing 5-yr data (horizontal table, live ratios, P/E band) (`de23cb8`)

### 2026-06-04
- 🔹 About page: professional polish (space, typography, parity) — page-scoped (`e8676f4`)
- 🔹 Landing page: fluidity & polish layer (scroll-reveal, header, parallax, polish) (`79b7369`)

### 2026-06-03
- 📝 add README with prominent handbook link (NovaSect) (`5f57b13`)
- 📝 add NovaSect platform handbook & quant reference (`9a322e0`)

### 2026-06-02
- ✨ **security** bundle + minify Osiris client (Tier 2, NovaSect) (`34fee25`)
- ✨ **finvault** 5-year panel on ALL report pages (Yahoo fallback for non-US) (`107de19`)
- ✨ **finvault** live 5-year trend charts in report.html (`031290c`)
- ✨ **finvault** 5-year horizontal financial analysis (Phase 1) (`6258493`)
- ✨ **analytics** instrument key click events for Umami (`5759c5c`)
- ✨ **analytics** end-of-day Umami report to Discord (GitHub Actions cron) (`bad94ca`)
- 🐛 **deploy** buildCommand must be shell-safe (remove parens) (`e76b736`)
- 🐛 **deploy** no-op buildCommand so deploys succeed with scripts/ excluded (`744fd0f`)
- 🐛 **finvault** sec-proxy crashed in prod — use same-dir module (`1e4aa8b`)
- 🐛 **analytics** robust top-pages metric across Umami versions (`105613a`)
- ✅ kept-probe deploy signal (will be removed) (`90110e3`)
- ✅ temporary .vercelignore probe (will be removed) (`8927427`)
- 🔧 **security** stop serving source/build files (Tier 1 source-exposure) (`bc07dee`)
- 🔧 **ci** bump actions to Node-24 majors (clear deprecation warning) (`2c12047`)
- 💄 **finvault** solid black box behind Five-Year Trends panel (`6982bb9`)

### 2026-05-29
- ✨ **phase-5** resync tech reference to code + reduced-motion a11y (`db5e9fe`)
- ✨ **phase-3** distributed rate-limiting + IP fix + no-mock-as-live (`15fe944`)
- ✨ **phase-2** CSP (report-only), SRI on pinned CDNs, escape card HTML (`02a4712`)
- ✨ **phase-1** make sentinel-history writes server-only (close public write) (`d087e39`)
- ♻️ **scripts** de-eval build tooling via safe AST literal parser (`908495b`)
- 🔧 **phase-0** add shared distributed rate-limit helper (`6fae81c`)

### 2026-05-27
- 🔹 Calibrate all 74 overdue Sentinel anchors to Q1-Q3 2025 data (`552b47e`)
- 🔹 restore honest lastVerified dates — 74 companies correctly marked overdue (`9e041dc`)
- 🔹 populate net leverage and interest coverage for all 100 companies (`f4b6ff4`)
- 🔹 live-fetch net leverage and interest coverage from Finnhub for null entries (`7b3af7c`)
- 🔹 Add Sentinel G-spread history, screener tables, Consumer Staples cohort, Osiris backtest badges, and cross-links (`a8f905d`)
- 🔹 Add GARCH(1,1) dynamic volatility to both simulation engines (`4803642`)
- 🔹 Fix mobile nav: hide Aurum button on mobile, add to dropdown (`50c56c7`)

### 2026-05-25
- 🔹 Add Umami analytics and Sentry error tracking to all pages (`4e3c20c`)

### 2026-05-24
- 🔹 Hide Aurum nav button on mobile to restore original header layout (`249003c`)
- 🔹 fix header overlap on mobile, add padding-top to main (`3de95e9`)
- 🔹 add HI-FI mode hover tooltip explaining run-to-run variance (`865f54a`)
- 🔹 change P95 upside ceiling colour from teal to blue (#0096ff) (`c4a3dcc`)
- 🔹 Perf optimisations + Osiris UI: button placement, chart colours, extract CSS (`f64c691`)

### 2026-05-22
- 🔹 Add Aurum nav button to landing page (`e3af1cf`)

### 2026-05-20
- 🔹 Fix 7 pre-launch data and security blockers (`e65e39c`)

### 2026-05-19
- 🔹 Make Spread Heatmap toggle button visible (`6a8a7f3`)
- 🔹 Add net leverage, interest coverage, PoD, spread direction, sector heatmap to Sentinel (`3a97056`)
- 🔹 Add earnings date, debt maturity, sentinel badge, dividend history, peer market cap to FinVault report (`4515e70`)
- 🔹 Add live Market Cap to report page Market Context section (`3f576d1`)
- 🔹 Add OG preview image for social sharing (`04ff737`)

### 2026-05-18
- 🔹 Pre-launch security and compliance hardening (`a42d833`)
- 🔹 Add legal disclaimers across all nine pages ahead of public launch (`18f07ef`)
- 🔹 Phase D — 1-Day mode + earnings catalyst overlay (`03451d3`)
- 🔹 fix OU diffusion — proportional shock (×S), not absolute (`f8e094d`)
- 🔹 Phase C — intraday-RV σ + sub-daily dt for 1-Week sims (`2e145db`)
- 🔹 switch from per-failure alerts to full-state digests (`93486b9`)
- 🔹 health/pdf-render: lower threshold 50KB→20KB + add diagnostic capture (`4f31fad`)

### 2026-05-17
- 🔹 refresh lastVerified on the 9 fully-built FinVault anchors (`d9c401a`)
- 🔹 health/pdf-render: wait for hydration signal instead of a fixed sleep (`0cfb9bf`)
- 🔹 add remaining 6 canaries (FRED, stale-anchors, universe-drift, finnhub-authz, osiris-engine, pdf-render) (`3badaaa`)
- 🔹 add smoke-test mode to verify Discord webhook from the UI (`450b674`)
- 🔹 Layer-1 cron canaries + Discord webhook (Yahoo, Finnhub, universe, public assets) (`36c051f`)
- 🔹 hardware discrimination (Phase A) + HI-FI mode (Phase B) (`f8dbe95`)
- 🔹 bump default paths 5K -> 25K, add 1-week / 1-month horizons (`e551fed`)
- 🔹 add LinkedIn icon under the founder image (`9876e4b`)
- 🔹 audit fixes 1-4 (CSV injection, observer race, modal safety, blank canvas, hydration warning, oracle classes) (`5ede70f`)
- 🔹 re-tint waterfall for print + enlarge in PDF (`276fc2f`)
- 🔹 dark backplate for Sentinel waterfall chart in PDFs (`f63d2f6`)
- 🔹 charts in PDFs · Sentinel per-card buttons · FinVault profile (`b187962`)
- 🔹 downloads (phase 2/3): roll out per-tool exports to all four pages (`42b0882`)
- 🔹 tabular PDF layout via jspdf-autotable (`4b736c1`)
- 🔹 downloads (phase 1): per-tool brief exports — PDF / JSON / CSV (`adcc283`)

### 2026-05-16
- 🔹 global-search: shrink mobile search box to keep gap from logo (`c094331`)
- 🔹 hamburger menu on mobile + roomier search bar (`a9e2764`)
- 🔹 global-search: revert mobile wrap — shrink inline instead, keep logo axis intact (`f1faed7`)
- 🔹 global-search: drop to a second row on mobile so the nav cluster breathes (`60d0dc2`)
- 🔹 tighten mobile layout — fewer columns, less crowded (`0bb51b9`)
- 🔹 center-align header band + match NOVASECT BRIEF font to promo-hdr (`c7d3205`)
- 🔹 add "NOVASECT BRIEF" wordmark at the top of every brief page (`f605d33`)
- 🔹 respect cascade priority — Finnhub no longer overwrites hand-curated (`853f183`)
- 🔹 share live-price source + localStorage cache with FinVault report (`b0651ee`)
- 🔹 align Trailing/Forward P/E with FinVault report (same hand-curated math) (`863c071`)
- 🔹 hand-curated EV/EBITDA + P/B precision layer (Fix 3 of 3) (`9d61818`)
- 🔹 brief + yahoo-proxy: Yahoo quoteSummary cascade (Fix 2 of 3) (`640fe70`)
- 🔹 brief + report: epsGrowth3Y fallback for cyclicals (Fix 1 of 3) (`f72b038`)
- 🔹 kill duplicate metrics between FinVault report sections + scan tool (`871c06d`)
- 🔹 open-in-X buttons launch new tabs + fix Forward P/E and EV/EBITDA (`8c7242f`)
- 🔹 add chart + ratios to FinVault, restructure Sentinel + Osiris bands (`d5cba26`)
- 🔹 Phase 1+2 — brief.html synthesis page + global search header bar (`982fe8f`)
- 🔹 deep links between FinVault, Sentinel, Osiris (`97fd76e`)
- 🔹 Sentinel risk badge on every FinVault report (`6c02a6a`)
- 🔹 data/universe.json — single source of truth for cross-tool features (`c57d06e`)
- 🔹 align OSIRIS heading with SENTINEL + bump promo-hdr font size (`cab8753`)
- 🔹 SENTINEL / OSIRIS headings — match ENTER THE VAULT style, drop animations (`3fb71e3`)
- 🔹 SENTINEL / OSIRIS headings — keep text white on hover, brighten white glow (`c0372d3`)
- 🔹 drop green glow on Sentinel/Osiris promo-hdr hover (`19188c9`)
- 🔹 3-tier news cascade so every report has at least one article link (`3964881`)
- 🔹 disclaimer strip under fallback chart, fallback tickers only (`8db1dcd`)
- 🔹 expand TradingView-restricted set to cover Asian / EM exchanges (`dc02481`)
- 🔹 expand toYahooSymbol + native chart fallback for restricted TV symbols (`b021f26`)
- 🔹 fix 11 TradingView ticker prefixes so every report chart renders (`b9103f1`)
- 🔹 ENTER THE VAULT sector pages now mirror the 83-ticker universe (`95d185a`)
- 🔹 scale to 83 tickers; live-data-only reports for the 74 without PDFs (`034ead2`)
- 🔹 fundamentalsLastVerified per ticker; flag RHM as unverified (`138c71b`)
- 🔹 document fundamentals schema above companyData literal (`be81ceb`)
- 🔹 add EV/EBITDA, EV/Sales, P/B to the multiples panel (`d690907`)
- 🔹 drop static dividendYield strings, single-source the yield calc (`3c15cf9`)
- 🔹 N/M guard on multiples for negative/zero denominators (`9422934`)
- 🔹 declutter Sentinel section, amplify radar to fill viewport (`b3de6b5`)
- 🔹 opaque controls panel, brighter matrix bg, rename headings (`dda1efe`)
- 🔹 replace path-trace background with classic Matrix rain (`a346431`)
- 🔹 ambient stochastic-path background (desktop only) (`9356bc8`)
- 🔹 mobile-responsive layout for the controls panel (`77753ce`)

### 2026-05-15
- 🔹 move TradingView chart above Market Context, below Company Profile (`67e6779`)
- 🔹 add Osiris Engine line to "What is NovaSect" copy (`50ad194`)
- 🔹 add TOOL 3 Project Osiris to the Segments terminal (`c83aab1`)
- 🔹 searchable ticker combobox (replaces native select for 83 names) (`caff18b`)
- 🔹 button-only simulation trigger + prominent CTA styling (`39a3afd`)
- 🔹 Industrials expansion (commit 3 of 3) — global slate complete (`c5cd308`)
- 🔹 Utilities expansion (commit 2 of 3) (`0cfb5f1`)
- 🔹 Energy expansion + scaffolding (commit 1 of 3) (`3f86ffe`)
- 🔹 ticker validator + fix EDF/Engie/SLB across Sentinel + Osiris (`283fe96`)
- 🔹 scale universe from 8 to 61 tickers to match Sentinel (`10a465a`)

### 2026-05-14
- 🔹 quarterly anchor verification system (#9 schema pass) (`9d73a19`)

### 2026-05-13
- 🔹 redesign Sentinel Brief with structured, intuitive layout (`13fa27b`)
- 🔹 RAF-coalesce refresh, ICE BofA floor, staleness UI (`0580b18`)
- 🔹 restore Three.js, smooth Merton scalar, OU residual, recalibrate IG/HY, rebase risk thresholds (`72a6f51`)
- 🔹 validate segments + ratios for 5 new 10-Ks (NOC, L3, RHM, GD, CVX) (`d6bfe65`)
- 🔹 validate revenue segments against 10-K filings (XOM, LMT, RTX, IBE) (`d130430`)
- 🔹 drop synthesized BUY/HOLD/SELL label, show raw analyst counts (`499cfac`)
- 🔹 yahoo-proxy: add mode=quote-summary for analyst price targets (`05c2b95`)
- 🔹 Company Profile + Revenue Segments (recommendation #6) (`1a4aa0a`)
- 🔹 Fundamentals Highlights panel (recommendation #5) (`df496d4`)
- 🔹 finnhub-proxy: whitelist /stock/metric for TTM fundamentals (`a38298f`)
- 🔹 Forward Estimates panel (recommendation #4) (`4f52dd3`)
- 🔹 Peer Snapshot table (recommendation #3) (`68f3442`)
- 🔹 finnhub-proxy: defensive env-var lookup (any casing or finnhub-containing name) (`e4c1fe6`)
- 🔹 Finnhub proxy + News Feed panel (recommendation #2) (`ed7b8ed`)
- 🔹 Market Context panel — live metrics cross-leveraged from OSIRIS (`0885530`)
- 🔹 FinVault report.html: compact ratios + chart + multiples for sidebar layout (`acf46d7`)
- 🔹 FinVault report.html: sticky-sidebar PDF + 60/40 layout mock (`2f30d8d`)
- 🔹 vercel.json: disable build auto-detection, deploy from git tree (`429a23f`)
- 🔹 esbuild minification + sentinel-bg.js cleanup (item 7 of perf audit) (`a403db3`)
- 🔹 Gate canvas RAF loops with IntersectionObserver (item 4 of perf audit) (`856d647`)
- 🔹 WebP conversion: 1296KB → 382KB across 5 assets (items 1 + 8 of perf audit) (`6c43aa9`)
- 🔹 sentinel.html: drop unused Three.js CDN load (item 2 of perf audit) (`4b2148b`)
- 🔹 remove dead asset duplicates (items 5 + 6 of perf audit) (`7423474`)

### 2026-05-12
- 🔹 API edge-cache hygiene: longer TTLs, kill the report.html cache-buster (`e2a660d`)
- 🔹 Osiris Phase 4: asymmetric (positively-skewed) jumps for industrials (`56e2427`)
- 🔹 Osiris Phase 3: drift = US10Y - dividendYield, calibrated OU long-term mean (`bbd6a3c`)
- 🔹 Osiris spike: auto-compute beta + dividend yield (drop hand-fill) (`6bbf7d8`)
- 🔹 Osiris Phase 2: per-ticker creditRating / beta / dividendYield + honest Oracle text (`e4d3a5d`)
- 🔹 Osiris Oracle: drop unused pctChange/direction/directionColor vars (`f90cd44`)
- 🔹 Osiris Phase 1: dt=1/252, Merton compensator, empirical win probability (`b58a812`)
- 🔹 Osiris Phase 0: wire live Yahoo + FRED data sources, rotate Alpha key (`4e2abc6`)
- 🔹 Osiris tagline: "Stock price speculator" -> "Stochastic stock price speculator" (`9753428`)
- 🔹 Sentinel promo: HUD reticle, sonar pulses, EKG heartbeat, holographic readouts (`8999b5e`)
- 🔹 Osiris promo: Monte Carlo path fan, breathing histogram, hover sim readout (`33afed4`)
- 🔹 Align desktop dimensions of ENTER THE VAULT, SENTINEL, and OSIRIS sections (`21bd454`)
- 🔹 missing closing brace in mousemove handler causing syntax error (`1bea554`)
- 🔹 OU engine: add graduated probability heatmap and crosshair scrubber for energy/utility tickers (`fac9b01`)
- 🔹 GBM canvas upgrade: graduated probability heatmap, gain/loss zones, directional jump arrows, crosshair scrubber (`d2783ba`)
- 🔹 Calibrate per-ticker baselineVolatility: DUK 0.15 -> GE 0.32, replacing flat 0.22 hardcode (`741238a`)

### 2026-05-11
- 🔹 Refactor Oracle: Deterministic componentized readout with win probability, metric badges, and dynamic assumptions (`8dff44a`)
- 🔹 Refactor Osiris UX: Abstracted mathematical sliders into semantic Dropdowns and Quick-Select timeline pills (`a9625d4`)
- 🔹 Update Navigation: Move Osiris to dedicated section and add to global Tools dropdown (`3f4b9f6`)
- 🔹 Refactor Osiris UI: Sector-grouped dropdown, auto-binding sliders, and debounced orchestration (`3c84d62`)
- 🔹 Enhance Osiris Canvas with temporal anchors, spatial baselines, and jump detection nodes (`be6176e`)
- 🔹 Implement Project Osiris - Stochastic Monte Carlo Engine (`cfa4114`)

### 2026-05-08
- 🔹 Fix proxy failures and UI animations for Multiples (`8c66844`)
- 🔹 Add dividendAmount to all remaining companies (`312ee84`)
- 🔹 Implement dynamic dividend yield basis (`9b1a024`)
- 🔹 Update Chevron forward EPS (`ec0292c`)
- 🔹 Update Chevron stats and fundamentals (`402f34d`)
- 🔹 Add Chevron report and page structure (`fea0c4d`)

### 2026-05-07
- 🔹 Remove mouse movement from background animation (`43c7203`)
- 🔹 Inline sentinel background script to bypass cache (`768dba3`)
- 🔹 Move Three.js logic to inline script inside sentinel.html to completely avoid file caching issues (`34f367a`)
- 🔹 Cache bust sentinel.html resources to bypass browser cache (`0eccfa0`)
- 🔹 Fix DOMContentLoaded to ensure background script fires (`5aafc77`)
- 🔹 Increase opacity of background animations. (`d524c02`)
- 🔹 Fix visibility issues by adjusting z-indexes and adding safety checks. (`c4cff6f`)
- 🔹 Implement 3D Cyber-Grid background animation for Sentinel page. (`0ef6aa2`)

### 2026-04-28
- ✨ replace email button with stylish text box (`985d43d`)
- ✨ make footer email button interactive with new business email (`c825ded`)
- ✨ implement dynamic filtering and sorting for Sentinel dashboard (`4e7fc2c`)
- ✨ sentinel hub-and-spoke engine integration (`a0466c4`)
- 🐛 improve mailto link reliability (`28820a6`)
- 📝 append active construction notice to disclaimer (`dc80b25`)
- 🔹 Use provided Alpha Vantage API key and enhance fallback mock handling (`af5154e`)
- 🔹 Fix alpha-proxy failing offline due to demo API key restrictions (`26fbd1b`)
- 🔹 Add API health check indicators for Alpha Vantage and YFinance (`002a68a`)
- 🔹 Populate COMPANIES list with 42 additional tickers across Energy, Industrials, Utilities (`879342a`)
- 🔹 Update synthetic diff style to match credit spread (`8c3f111`)
- 🔹 Update sentinel UI: improve synthetic normalization diff visibility, remove analyst perspective (`4191970`)

### 2026-04-27
- ✨ Hub-and-Spoke Volatility Engine Architecture (`89cccc2`)
- 🐛 route Alpha Vantage Sector ETF proxy through Yahoo Finance to bypass strict limits (`e890ba6`)

### 2026-04-23
- 🔹 Fix beta calculation: Baseline contribution now scales relative to 1.0 instead of 0.0 (`9820af8`)
- 🔹 UI tweak: Remove redundant 'Yield' text from Yield Stack on Sentinel cards (`858642e`)
- 🔹 UI tweak: Increase font size and add glow to Yield Stack on Sentinel cards (`1ab65db`)

### 2026-04-22
- 🔹 Fix Vercel build error by removing custom build script (`fa38ea6`)
- 🔹 Added SEO essentials: robots.txt, dynamic sitemap generator, and index.html canonical link (`f3238ce`)
- 🔹 Added glowing highlight to specific keyword parameters in terminal typewriters (`a896de8`)
- 🔹 Changed Project FinVault and Project Sentinel to uppercase in terminal (`dcdf22d`)
- 🔹 Added interactive typewriter animation for Project Sentinel (`170e647`)
- 🔹 Updated FinVault log text and removed underlines from terminal tools (`f7c770f`)
- 🔹 Added interactive typewriter animation to Project FinVault terminal element (`8b02719`)
- 🔹 Updated methodology terminal section to feature tools instead of steps (`908e77a`)
- 🔹 Updated rotating coin in About Us page to feature the pfp image (`2f48917`)
- 🔹 Updated rotating holographic coin in About Us page to feature the new NovaSect logo image (`531e56c`)
- 🔹 Updated word choice in founder bio section (`161d569`)
- 🔹 Applied bold neon green styling to key phrases in 'What is NovaSect' section (`9294a77`)
- 🔹 Updated 'What is NovaSect' description messaging on landing page (`0f201fb`)
- 🔹 Standardized header navigation dropdown in report.html (`f15b8cc`)

### 2026-04-21
- 🔹 Remove duplicate nested FinVault folder to fix Vercel deploy cache (`75ebc81`)

### 2026-04-20
- 🔹 Update Sentinel UI labels to reflect v2.0 Synthetic Credit Engine and Index Anchoring. (`e6966f6`)
- 🔹 Implement 4-Step Synthetic Credit Engine with Index Anchoring, Panic Latency, and Convex Leverage Physics. (`d9ee39a`)
- 🔹 Optimized site navigation: Consolidated 'Sentinel' and 'FinVault' into a 'Tools' dropdown across all pages. Improved mobile responsiveness and header clarity. (`b092955`)
- 🔹 Restored missing fetch logic and error handling in sovereign anchor sync (`a6a2bf1`)
- 🔹 Diagnostic Push: Added granular FRED error codes for dashboard telemetry (`7366e46`)
- 🔹 Resolved syntax error in sentinel.v2.js and optimized init sequence for instant rendering (`5eb1781`)
- 🔹 Emergency Fix: Resolved Vercel deployment error and bypassed browser cache with sentinel.v2.js (`a0b4a86`)
- 🔹 Restore fleet, harden UI logic, and configure Vercel API routing (`4ea1a3f`)
- 🔹 Synchronize Telemetry with FRED live key (`1204332`)
- 🔹 Live FRED Sovereign Anchors integration with Vercel Proxy (`3ac2a3c`)
- 🔹 Simplified sector section titles (`7980499`)
- 🔹 Sentinel Upgrade: High-Scale Engine, Hierarchical Stress Tests & Black Swan Control (`15bfbba`)
- 🔹 Resolved syntax error in sentinel.js that caused the dashboard to stall on initialization (`0e04317`)
- 🔹 Sentinel Logic Refinement: Switched Shell to UK Gilt benchmark (4.15%) and verified Bund logic for Iberdrola (`bdd6fff`)
- 🔹 Sentinel Dual-Layer Logic: Implemented instrument-level seniority/tenure simulators, regional benchmarks (Bund vs Treasury), and contagion risk physics (`78c6208`)
- 🔹 Sentinel Logic Update: Enforced mathematical cross-footing, true attribution waterfall, yield stack methodology, and synthetic benchmark alignment (`5d0a3a0`)

### 2026-04-19
- 🔹 UI Refinement: Scaled down Sentinel header font size for optimized visual balance (`dfb50f1`)
- 🔹 Global Navigation Update: Added Sentinel button to top-right header across all pages (`1e04863`)
- 🔹 Final Sentinel Refinement: Verified typographic order and maximized neon glow for credit monitor (`e25cdfd`)
- 🔹 Sentinel Section Refinement: Selective text glow and reordered typography for cleaner holographic illusion (`cedbbd5`)
- 🔹 Sentinel Promo Update: Removed description, static robot, and added Matrix digital bits attraction (`38329b3`)
- 🔹 Complete restoration of original site layout and styles while retaining high-fidelity Sentinel Mesh Promo (`327aabb`)
- 🔹 Finalizing Sentinel remodel and search feature with assets (`f082583`)
- 🔹 Remodeled Sentinel landing page section with a 3D mesh robot (Sentinel Prime inspired) and bold neon typography. (`29f43ac`)
- 🔹 Implemented dynamic company search feature. Added terminal-style search box and real-time filtering logic. (`4302122`)
- 🔹 Mobile optimization update v1.0.3_ALPHA. Improved responsiveness for charts, header, and modal. added touch-friendly close buttons and vertical stacking for mobile viewports. (`0939ad6`)
- 🔹 Fixed bug in modal perspective logic by preventing DOM element destruction. Added unique IDs for dynamic components. (`d5d4d91`)
- 🔹 Implemented revised IG/HY classification system with Treasury-dominance logic and differentiated spread sensitivity. (`800e518`)
- 🔹 Updated Sentinel dashboard version tag to (Alpha). (`b8ad78c`)
- 🔹 Fixing template literal rendering issue in sentinel.js. Removed accidental escaping of template strings. (`c84d659`)
- 🔹 Deploying Sentinel Beta-Analysis & Credit Monitor module. Includes terminal UI updates, real-time stress test logic, and Chart.js visualizations. (`14d9f5b`)

### 2026-04-17
- 🔹 Added AI usage disclosure to the disclaimer section (`33e5abf`)
- 🔹 Swapped 'Enter the Vault' and 'Info/Methodology' sections for better landing page flow (`7805239`)
- 🔹 Recalibrated Rheinmetall fundamentals with 2026 analyst estimates to fix inflated multiples (`be82874`)
- 🔹 Forced cache refresh for valuation multiples by using yahooSymbol in cacheKey (`46120ad`)
- 🔹 Fixed Rheinmetall valuation multiples by mapping ticker to RHM.DE for Yahoo Finance (`a19d360`)
- 🔹 Integrated Rheinmetall report: added PDF, financial data, and updated navigation links (`b509e1c`)
- 🔹 Fixed broken link for General Dynamics in reports.html (was using '#' placeholder) (`031098f`)
- 🔹 Updated report tiles: removed Honeywell and Leonardo Spa, added Chevron, Equinor, Marathon Petroleum, and Shell placeholders (`a2b7a10`)
- 🔹 Populated financial ratios for General Dynamics (`9e0e24d`)
- 🔹 Updated reports page title and heading to FINVAULT (`24337bd`)
- 🔹 Adjusted NOVASECT text position to be more central in the hero area (`458609d`)
- 🔹 Rebranding updates: Renamed Reports to FinVault, updated segments section to 'ENTER THE VAULT', and hero text to 'NOVASECT' (`6f94552`)

### 2026-04-13
- 🔹 Move disclaimer to the very bottom of the index page (`4304fca`)
- 🔹 Add animated construction coming soon section to landing page (`00e8f10`)
- 🔹 Update What is NovaSect description text (`248af75`)
- 🔹 Animate holographic mosaic to pan left to right and increase opacity (`6da3ada`)
- 🔹 Add mosaic bg to founder section and revert secondary text highlighting (`75160d4`)
- 🔹 Highlight sectors and add Prathyoosh founder bio text box (`2d13ef2`)
- 🔹 Implement holographic rotating coin and Founder section (`76cd667`)
- 🔹 Update About Us layout: circular small image below Who Are We text (`04c560a`)
- 🔹 Embed website picture onto About Us page (`136faa7`)
- 🔹 Complete NovaSect rebranding and layout updates (`51ca843`)

### 2026-04-10
- 🔹 Update Instagram handle to NovaSect (`b9c183d`)
- 🔹 Rebrand entire platform to NovaSect: Updated headers, titles, and body content while preserving relative links (`afe85d8`)
- 🔹 Fix malformed Yahoo Finance query URL in multiples logic (`cae399c`)
- 🔹 Final multiples optimization: /raw proxy, after-hours fallback, and 1-hour cache (`2fe1c3d`)
- 🔹 Optimize multiples loading with LocalStorage caching for instant page loads (`d460e64`)
- 🔹 Fix multiples N/A issue with robust proxy fallback system (`425ecb2`)
- 🔹 Add General Dynamics report with dynamic multiples and stock chart (`cf3a007`)

### 2026-04-09
- 🔹 Implement dynamic multiples for LMT, NOC, RTX, and LHX (`67602ce`)
- 🔹 Fix Multiples fetch logic and add Iberdrola fundamentals (`75246b1`)

### 2026-04-03
- 🔹 Add Dynamic Multiples section to ExxonMobil report page with real-time Yahoo Finance fallback (`e1588d4`)
- 🔹 Switch TradingView widget to Mini Symbol Overview to fix neon green line color rendering (`1fee6ae`)
- 🔹 Fix TradingView chart line color to neon green (`47cc727`)
- 🔹 Add dynamic live 52-week stock charts (TradingView) to company report pages (`b14070f`)
- 🔹 Update Lockheed Martin Payables turnover ratio (`d7ae888`)
- 🔹 Update Lockheed Martin research report PDF with the latest FinVault analysis (`7e6d052`)
- 🔹 Refine mobile PDF viewer: remove black bars and swipe hints (`ff53816`)

### 2026-04-02
- 🔹 Fix mobile card layout to be square and implement horizontal swipe PDF viewer (`168588e`)
- 🔹 Optimize website for mobile responsiveness (stacking layouts, scaling typography, grid adjustments) (`58b05d6`)
- 🔹 Populated L3Harris financial ratios (`2358cf0`)
- 🔹 Updated L3Harris report PDF with the Financial Statement Analysis version (`4cff9c1`)
- 🔹 Populated RTX Corp financial ratios (`1681fb2`)
- 🔹 Updated RTX Corp report PDF with the Financial Statement Analysis version (`b275594`)
- 🔹 Populated Lockheed Martin financial ratios (`608347f`)
- 🔹 Corrected Instagram link on landing page (`5ab76ee`)
- 🔹 Update Instagram link on landing page (`9b0468d`)
- 🔹 Update YouTube link on landing page (`540fdba`)
- 🔹 Initial commit of FinVault website project with reports and assets (`bf0c832`)

### 2026-03-27
- 🔹 Initial commit (`f088474`)
