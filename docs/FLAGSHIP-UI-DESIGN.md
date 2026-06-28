# NovaSect Flagship UI — Design Document

*Wireframe-level spec for the four flagship additions, the foundational layer
they share, and the access/navigation model that ties them to the existing
global search.*

Status: **draft for sign-off** · Scope: NovaSect only (Aurum paused)

---

## 0. Purpose

Translate the four flagship features into concrete, buildable UI:

1. **Unified Company Dossier** — evolve `brief.html` into the canonical per-ticker hub.
2. **Structural credit–equity bridge** — make the Osiris-σ → Sentinel-spread link visible.
3. **Scenario Lab** — one macro-shock console that drives all three engines.
4. **Cross-engine watchlist + change digest** — persistent, shareable baskets.

This doc specifies the **information architecture / access model first** (because
the global search is the spine that connects everything), then the **foundational
layer**, then a **section-by-section spec** for each flagship with real IDs/classes.

---

## 1. Current state (what we build on)

| Asset | Today | Implication |
|---|---|---|
| `brief.html` | A 3-band dossier (`#brief-finvault`, `#brief-sentinel`, `#brief-osiris`), each `.brief-band` with a `.brief-band-head` + "Open in X →" `.brief-band-btn`; reads `?ticker=`; empty state points to global search | The dossier is ~70% built. Flagships extend it, not replace it. |
| `components/global-search/global-search.js` | Injects `.gs-wrap` into `.nav-links` on every page; fuzzy-ranks `universe.json`; routes to `brief.html?ticker=`; keyboard nav; mobile-responsive | **This is the access spine.** We extend it into a command/aggregation hub. |
| Header / nav | Copy-pasted `<header class="header">` in all ~8 pages; Tools dropdown → Sentinel/FinVault/Osiris | Must be componentized before adding nav items, or every flagship multiplies edits. |
| Design tokens | `:root` has only `--accent-green (#39FF14)`; amber/red status colors hardcoded inline | Need status + delta tokens for chips/badges/deltas. |
| Routing | brief/sentinel/osiris use `?ticker=`; `report.html` uses `?company=<key>` | Unify to `?ticker=` for cross-linking + watchlist. |
| `data/universe.json` | Per-ticker `{ ticker, name, sector, country, finvault, sentinel, osiris, … }` | Search can show **precomputed status chips** without extra fetches. |

---

## 2. Information architecture & access model

### 2.1 The model in one line

> **Global search → Company Dossier (`brief.html`) is the primary loop.** The
> dossier is the hub; the three tool pages become "deep dives" reachable from it;
> the watchlist and scenario lab are cross-cutting layers reachable from the same
> search bar and header.

```
                         ┌─────────────────────────────┐
        (any page)  ───► │  GLOBAL SEARCH / COMMAND BAR │ ◄── keyboard:  /  or  ⌘K
                         └──────────────┬──────────────┘
            recents · watchlist · ranked results (w/ status chips) · quick-actions
                                        │
                  pick name             │  pick name + band            quick-add ★
                     ▼                  ▼                                  ▼
        brief.html?ticker=XOM   brief.html?ticker=XOM#sentinel       (watchlist set)
                     │
        ┌────────────┴───────────────────────────────────────────┐
        │                 COMPANY DOSSIER (hub)                    │
        │  verdict strip · FinVault · Forensic · Sentinel · Osiris │
        │   each band → "Open in <tool> →"  +  "★ watchlist"       │
        └───┬──────────────┬──────────────┬───────────────────────┘
            ▼              ▼               ▼
       report.html    sentinel.html   osiris.html      (deep dives, ?ticker=)
```

### 2.2 Global search → the access hub (the key integration)

The existing `global-search.js` already does fuzzy match → `brief.html?ticker=`.
We **promote it from a "search box" to the command/aggregation bar** — the single
affordance through which users reach every new view. Concrete extensions
(all additive to the current component):

**A. Command-palette ergonomics**
- Global key binding: `/` or `⌘K` / `Ctrl-K` focuses the bar from any page (today it's mouse-only). Add to `mount()`.
- `Esc` already blurs. Keep ↑/↓/Enter.

**B. Empty-state content (when focused, no query)** — turns the panel into a launcher:
```
┌─ search panel (.gs-panel) ───────────────────────┐
│  ★ WATCHLIST                                       │
│   XOM   Exxon Mobil           ●BBB  Z 3.1  +4.2%  │   ← status chips from universe.json
│   RHM   Rheinmetall           ●HY   Z 2.0  −1.1%  │
│  ─────────────────────────────────────────────   │
│  RECENT                                            │
│   AAPL  Apple                                      │
│   NEE   NextEra Energy                             │
└───────────────────────────────────────────────────┘
```
- **Watchlist** section (from the new state store) pinned at top.
- **Recents** section (localStorage, last ~6) below.
- Both are zero-typing launch targets.

**C. Result rows become mini-aggregations**
Each `.gs-item` gains a compact **status cluster** drawn from `universe.json`
precomputed fields (no extra network): credit-tier dot (green/amber/red),
Altman band, and a small move/return. The search itself starts answering
"how's this name doing?" before you even open the dossier.
```
.gs-item  grid:  [ticker 80px] [name 1fr] [●tier] [Z x.x] [sector] [★]
```

**D. Quick-actions per row**
- **★ toggle** — add/remove from watchlist inline (no navigation). Click the star, stay in flow.
- **Band deep-links** — small chips `FV · SEN · OSI` that route to `brief.html?ticker=XOM#<band>` (anchor scroll to that band). Lets a credit user jump straight to Sentinel.

**E. Scenario awareness**
- If a scenario is active (see §5.3), the bar shows a small `⚡scenario` pill, and
  selecting a name carries the scenario into the dossier via
  `brief.html?ticker=XOM&scenario=<encoded>` so the dossier opens shocked, not live.

**F. Multi-select → compare (future hook)**
- Shift-click rows to stage 2–4 tickers; an action chip "Compare →" opens a
  compare view. Out of scope for v1 but the data model should not preclude it.

> **Net effect:** the top-right search becomes the one thing a user must learn.
> Everything new (dossier, a specific band, watchlist add, scenario-carried view)
> is reachable from it. This directly answers "how does the user access these
> aggregations" — the answer is *the same bar they already use, made smarter.*

### 2.3 Secondary entry points

| Entry | Routes to | Change needed |
|---|---|---|
| Header nav "Company Dossier" | `brief.html` (or last ticker) | add item to componentized nav |
| Header **★ Watchlist** (count badge) | `watchlist.html` | new nav item |
| Header **⚡ Scenario** | opens scenario drawer (overlay, no nav) | new nav item / icon |
| `reports.html` company cards | `brief.html?ticker=` (was `report.html?company=`) | re-point + add ★ on cards |
| `sentinel.html` issuer rows | `brief.html?ticker=…#sentinel` + ★ | row click + star |
| `osiris.html` selector | `brief.html?ticker=…#osiris` cross-link | "view full dossier" link |
| Deep links / shares | `brief.html?ticker=XOM#sentinel&scenario=…` | URL scheme (below) |

### 2.4 URL scheme (canonical)

```
brief.html?ticker=<SYM>[#finvault|#forensic|#sentinel|#osiris][&scenario=<b64>]
watchlist.html[?list=<b64>]            # shareable watchlist
report.html?ticker=<SYM>               # deep FinVault/PDF view (migrated from ?company=)
```
- Bands already have IDs (`#brief-finvault`, `#brief-sentinel`, `#brief-osiris`); add `#brief-forensic`. These double as scroll anchors for the search deep-links and the in-page TOC.

---

## 3. Foundational layer (build first — every flagship depends on it)

### 3.1 `components/chrome/chrome.js` — injected header/nav
- Mirrors the `global-search.js` pattern (self-inject on DOMContentLoaded).
- Replaces the copy-pasted `<header>` in every page with a single source.
- Renders: logo · Tools dropdown · **Company Dossier** · **★ Watchlist (count)** · **⚡ Scenario** · About · Aurum↗.
- API: `window.NSChrome.setActive('dossier'|'sentinel'|…)`, reads watchlist count from `NSState`.
- Migration: delete inline `<header>` blocks; add `<script src="/components/chrome/chrome.js" defer>` (alongside the existing global-search script).

### 3.2 `components/state/state.js` — shared store
```js
NSState = {
  // watchlist (localStorage: ns.watchlist = ["XOM","RHM",…])
  getWatchlist(): string[],
  isWatched(ticker): boolean,
  toggleWatchlist(ticker): boolean,        // returns new state, emits 'change'
  // recents (localStorage: ns.recents)
  pushRecent(ticker): void,
  getRecents(n=6): string[],
  // scenario (in-memory + optional URL)
  getScenario(): Scenario|null,
  setScenario(s): void,                    // emits 'scenario'
  encodeScenario(s): string,               // → base64 for URL/share
  decodeScenario(b64): Scenario,
  // last-seen snapshot for change detection (localStorage: ns.seen)
  getSeen(ticker): Snapshot|null,
  setSeen(ticker, snapshot): void,
  // pub/sub
  on(evt, fn), off(evt, fn)
}
```
- Pure, no DOM. localStorage-backed, URL-encodable. Unit-testable like the other `scripts/lib` modules.

### 3.3 Design tokens (`:root` in `style.css`)
```css
--status-green:  #39FF14;   /* safe / nominal / unlikely / strong */
--status-amber:  #FFB000;   /* grey / caution / moderate */
--status-red:    #FF4D4D;   /* distress / critical / likely / weak */
--status-neutral:#9AA5B1;   /* n/a */
--delta-pos:     #39FF14;
--delta-neg:     #FF4D4D;
--scenario-accent:#7DD3FC;  /* "scenario active" cyan — distinct from green */
```
Replace inline `#FFAA00`/`#FF4444` usages with the tokens.

### 3.4 Reusable primitives (CSS + tiny helpers)
| Class | Use |
|---|---|
| `.ns-chip` (+ `.is-green/amber/red`) | status pill (verdict strip, search rows, watchlist) |
| `.ns-delta` (+ `.pos/.neg`) | baseline→scenario Δ badge |
| `.ns-tag` | provenance label (e.g. "equity-linked", "sector proxy") — same idea as the `betaSource` tag already in report.html |
| `.ns-star` (+ `.is-on`) | watchlist toggle |
| `.ns-dot` | "changed since last visit" indicator |
| `.ns-drawer` | right slide-over (scenario lab, future compare) |

---

## 4. Flagship 1 — Unified Company Dossier

Evolve `brief.html`. New/changed regions in document order:

```
┌──────────────────────────────────────────────────────────────┐
│  NOVASECT BRIEF                                    [★ watch]   │  ← .brief-page-title + star
│  XOM  Exxon Mobil   Energy · US · NYSE · Integrated Oil & Gas  │  ← existing #brief-header
│                                                                │
│  ┌─ VERDICT STRIP  (#dossier-summary)  ───────────────────┐   │  ◄── NEW
│  │ Credit ●BBB  ·  Altman 3.1 Safe  ·  Beneish −2.6 OK     │   │
│  │ Piotroski 7/9 Strong  ·  Osiris 1Y +8% (▲62% > spot)    │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  ⟨ FinVault · Forensic · Sentinel · Osiris ⟩   ← sticky TOC    │  ◄── NEW (#dossier-tabs)
│                                                                │
│  ── FinVault  ───────────────────────  [Open in FinVault →]    │  existing #brief-finvault
│     chart · market · multiples · ratios · growth               │
│  ── Forensic  ───────────────────────  [Open in FinVault →]    │  ◄── NEW #brief-forensic
│     Altman card · Beneish card · Piotroski card                │
│  ── Sentinel  ───────────────────────  [Open in Sentinel →]    │  existing + bridge panel (F2)
│  ── Osiris    ───────────────────────  [Open in Osiris →]      │  existing #brief-osiris
└──────────────────────────────────────────────────────────────┘
```

### 4.1 New: Verdict strip `#dossier-summary`
- A single row of `.ns-chip`s summarizing the cross-engine read.
- Sources (all already computed somewhere): credit tier (`#sn-credit-tier`),
  Altman/Beneish/Piotroski (`renderForensicScores`), Osiris 1Y (`#os-1y-ev`, pAboveSpot).
- Each chip colored via status tokens; clicking a chip scrolls to its band.
- Renders progressively: chips fill in as each engine resolves (skeleton chip → value).

### 4.2 New: Forensic band `#brief-forensic`
- Port `renderForensicScores` + `#forensic-section`/`#forensic-grid` (today in `report.html`) into a `.brief-band`.
- Three cards (Altman / Beneish / Piotroski) using the existing `.forensic-card` markup; band header "Open in FinVault →".

### 4.3 New: Sticky in-page TOC `#dossier-tabs`
- Sticky under the header; anchors to `#brief-finvault | #brief-forensic | #brief-sentinel | #brief-osiris`.
- Highlights the band in view (IntersectionObserver). Doubles as the target for search deep-links (§2.2-D).

### 4.4 Modify: band headers + watchlist
- `.brief-band-head` already has the "Open in X →" button; add a `.ns-star` to the page header (`#brief-header`).
- Ensure each "Open in X →" uses the unified `?ticker=` scheme.

### 4.5 States & resilience
- Per-band **skeletons** while the 3 async engines load.
- **Partial failure**: one engine down → that band shows a degraded note (reuse the `betaSource`/`rfSource` provenance-label pattern), others still render. The dossier never blanks on a single failure.
- **Freshness/provenance** `.ns-tag` per band ("live", "as-of", "fallback").
- **Responsive**: `.brief-grid` 4-col → 2-col (tablet) → 1-col (phone).

---

## 5. Flagship 2 — Structural credit–equity bridge

Low UI footprint; the goal is to make the computed link **visible and explainable**.

### 5.1 New: bridge panel (in the Sentinel band + sentinel.html detail)
```
┌─ How this spread is formed ───────────────────────────────┐
│  Osiris σ (equity vol)   →   Merton scalar   →   spread    │
│      28.4%                      1.58×            +412 bps   │
│  [ live equity-linked ]  ← provenance .ns-tag              │
└───────────────────────────────────────────────────────────┘
```
- A 3-step inline flow. Values from the same math (`proxyVol`, `mertonScalar`, final spread).

### 5.2 Modify: driver decomposition
- Sentinel's `getSpreadDrivers` bars (anchor/market/vol/residual/seniority/tenure) gain a `.ns-tag` on the vol leg: **"equity-linked"** vs **"static proxy"** (mirrors the WACC β `(sector proxy)` tag already shipped).
- `sentinel.html` issuer detail: a toggle **static vol ↔ equity-linked vol** showing the spread Δ as an `.ns-delta`.

### 5.3 Optional chart
- Per-issuer equity-vol vs spread (dual-axis history) using the existing chart stack.

---

## 6. Flagship 3 — Scenario Lab

A global `.ns-drawer` (right slide-over) opened from the header **⚡ Scenario** item,
plus an optional full-screen `scenario.html` for multi-issuer views.

```
                                        ┌─ ⚡ SCENARIO LAB (.ns-drawer) ─────┐
  ╔═══════════════════════════════════╗ │  Presets:                          │
  ║  ⚡ SCENARIO MODE — values shocked ║ │  [Baseline][2008][COVID][+200bp]   │
  ╚═══════════════════════════════════╝ │  [Soft landing]                    │  ◄── #scenario-banner (sticky)
       (banner shows on every page       │                                    │
        while a scenario is active)      │  Rate shock     ●——————  +200 bp   │
                                         │  VIX level      ———●————  32        │
   Sentinel spread   412 → 596  ▲+184   │  Sector vol     ——●—————  +20%      │
   FinVault WACC     8.1% → 9.4% ▲+1.3  │  Sovereign      ●———————  +0        │
   Osiris 1Y EV      +8% → −3%  ▼        │  Oil / FX       ——●—————  −15%      │
        (Δ badges everywhere)           │                       [ Reset ]     │
                                         └────────────────────────────────────┘
```

### 6.1 Controls
- Sliders: rate, VIX, sector vol, sovereign, commodity/FX. Preset chips. Reset.
- Sentinel already exposes `currentRateShock`/`currentSovereignShock`/`currentBetaScaling` (+ `#rate-slider`/`#beta-slider` on sentinel.html) — fold these into the unified console as the Sentinel adapter.

### 6.2 Propagation & display
- On change (debounced), `NSState.setScenario(s)` emits; each engine adapter recomputes:
  - **Sentinel** → re-price spreads/yields.
  - **Osiris** → re-run cone with shocked drift/vol (reuse the HI-FI progress indicator).
  - **FinVault** → recompute WACC/DCF.
- Every shocked surface shows **baseline → scenario** with an `.ns-delta` badge.

### 6.3 Mode safety (critical)
- A persistent **`#scenario-banner`** ("SCENARIO MODE — values are shocked, not live") on every page while a non-baseline scenario is active, in `--scenario-accent`. Prevents mistaking shocked numbers for live ones.
- The search bar shows the `⚡scenario` pill (§2.2-E) and carries scenario into opened dossiers.

---

## 7. Flagship 4 — Watchlist + change digest

### 7.1 Affordance (everywhere)
- `.ns-star` on: dossier header, search rows (inline toggle), `reports.html` cards, `sentinel.html` rows, `osiris.html` selector.
- Backed by `NSState.toggleWatchlist`; header badge updates live.

### 7.2 `watchlist.html`
```
┌─ WATCHLIST  (12)                      [Share ↗]  [Export CSV] ┐
│  ★  Ticker  Name           Tier   Altman   Osiris1Y   Δsince  │
│  ★  XOM     Exxon Mobil    ●BBB   3.1 Safe  +8%        ● ▲spd │  ← .ns-dot = changed
│  ★  RHM     Rheinmetall    ●HY    2.0 Grey  +15%       —      │
│     (sortable columns; click row → dossier)                   │
└───────────────────────────────────────────────────────────────┘
```
- Columns aggregate the three engines (mostly from `universe.json` precompute + light live).
- **Change indicators**: compare current vs `NSState.getSeen(ticker)`; dot + reason ("spread widened", "Z → distress").
- **Share**: `watchlist.html?list=<b64>` (encodes the ticker set) — consistent with the shareable-state theme.

### 7.3 Digest (mostly backend)
- Reuse the existing Discord/health cron to post a weekly "what flipped" digest across the watched set (or the full universe for the owner).
- UI surface is minimal (no per-user accounts): a "view latest digest" link. Personalized digests are out of scope without auth.

---

## 8. Component API summary

| Module | Type | Responsibility |
|---|---|---|
| `components/chrome/chrome.js` | injected UI | one header/nav for all pages; active state; watchlist badge |
| `components/state/state.js` | pure lib | watchlist · recents · scenario · seen-snapshots · encode/decode · pub-sub |
| `components/global-search/global-search.js` | **extend** | command palette, recents+watchlist launcher, status chips, ★ + band quick-actions, scenario-aware routing |
| `components/scenario/scenario.js` | injected UI | drawer, presets, sliders, mode banner; emits via NSState |
| engine adapters (Sentinel/Osiris/FinVault) | per-page | subscribe to `scenario`; render baseline→Δ |
| `scripts/lib/*` tests | tests | state encode/decode, change-detection, scenario math — same harness as forensic/xbrl/sentinel-spread |

---

## 9. Build sequence (phased, low-risk first)

| Phase | Ships | Unblocks |
|---|---|---|
| **0 — Foundation** | chrome.js, NSState, tokens, primitives, `?ticker=` unification | everything |
| **1 — Search hub** | extend global-search (palette, recents, watchlist launcher, status chips, ★, band deep-links) | access model; watchlist add |
| **2 — Dossier** | verdict strip, forensic band, sticky TOC, resilience/skeletons | the hub |
| **3 — Watchlist** | watchlist.html, ★ everywhere, change dots, share/export | retention |
| **4 — Bridge** | bridge panel + provenance tags in Sentinel | explainability moat |
| **5 — Scenario Lab** | drawer, presets, propagation, mode banner | the showpiece |

Each phase is independently shippable and testable; phases 4–5 are the most
compute-heavy (Osiris re-runs) and benefit from browser verification on a live
deploy.

---

## 10. Resolved decisions (signed off)

1. **Dossier vs report** → `brief.html` is the **canonical hub**; `report.html` is the deep/PDF view (linked from the dossier's FinVault band).
2. **Routing** → **migrate** `reports.html` cards to `?ticker=`; `report.html` accepts `?ticker=` (with a `?company=` back-compat shim).
3. **Scenario scope** → **multi-issuer if structurally feasible** (`scenario.html`) in addition to the per-name drawer.
4. **Digest** → **not now** (skip the watchlist change-digest backend; the watchlist UI + change dots still ship).
5. **Search chips** → **light live backfill, bandwidth-aware** (see policy below).

### 10.1 Bandwidth policy (resolves #5)

Per-IP proxy limits are tight (sec 20/min, fred 30, yahoo 30, finnhub 30, alpha 10)
and the search panel re-renders per keystroke with up to 12 rows. Therefore:

- **Search rows → `universe.json` precompute only** (zero network): rating/tier chip + spread.
- **Light live backfill → the *focused* row only**, debounced 350 ms, sessionStorage-cached, a single `sec-proxy` call (24 h edge cache) → adds the Altman band chip. Degrades silently when offline / rate-limited.
- **Watchlist view (Phase 3)** → bounded live backfill (the user's saved set), sequential + cached.
- **Never** per-row-per-keystroke backfill; **no** Osiris worker sims in search/watchlist rows (dossier only).

---

## 11. Implementation status

| Phase | Status |
|---|---|
| 0 — Foundation: `NSState` (+ `ns-state-core.mjs` + 27 tests), status/delta tokens | ✅ shipped |
| 1 — Search hub: launcher (watchlist + recents), precompute chips, inline ★, band deep-links, `/`·⌘K palette, scenario-aware routing, focused-row backfill | ✅ shipped, browser-verified |
| 2 — Dossier: verdict strip, forensic band, sticky TOC, header watchlist ★ + recents | ✅ shipped, browser-verified |
| Routing migration: `reports.html` cards → `brief.html?ticker=` (data-driven rewrite + MutationObserver), `report.html` accepts `?ticker=`, dossier accepts `?company=` shim, deep-links use `?ticker=` | ✅ shipped (82/83 cards; 1 unmapped slug left on legacy route) |
| 3 — Watchlist: `watchlist.html` (sortable, progressive backfill, change dots, share `?list=` + CSV), site-wide nav ★+count | ✅ shipped, browser-verified |
| 4 — Credit–equity bridge: dossier Sentinel band shows live equity σ → Merton → spread with an "equity-linked" provenance tag (graceful "sector proxy" fallback) | ✅ shipped, browser-verified |
| 5 — Scenario Lab: global drawer (presets + sliders), SCENARIO-MODE banner site-wide, shared `NSCreditSpread` engine, multi-issuer `scenario.html` (baseline→Δ across 83 issuers), dossier Sentinel propagation | ✅ shipped, browser-verified |

**All five flagship phases shipped.** The Scenario Lab uses a shared, scenario-aware
`NSCreditSpread` (canonical browser mirror of Sentinel's CreditEngine) so the
dossier overlay, the multi-issuer table, and the Sentinel dashboard all reconcile.

> Preview caveat: the static preview's browser caches `global-search.js`, so the
> self-injected scenario drawer/banner only appear after a hard refresh there; on
> deploy the content-changed file re-fetches normally. The scenario *compute*
> (spread Δ everywhere) was verified directly.

> Phase-4 scope note: the bridge ships on the dossier's Sentinel band (the hub's
> Sentinel surface) and is displayed alongside — not replacing — the canonical
> sector-based headline spread, so it never diverges from the Sentinel dashboard.
> Wiring the same provenance tag into the sentinel.html dashboard's driver
> decomposition (sentinel.v2.js) is a possible follow-on (heavier, needs live
> verification).

> Known data nit (out of scope): the Embraer card slug `embj3-sa` in reports.html
> doesn't match its `finvault.slug` in universe.json, so it stays on the legacy
> `report.html?company=` route. Align the slug in a later data pass.

> Note: Phase-1 self-injects `components/state/state.js` when `window.NSState` is
> absent, so no per-page `<head>` edits were needed yet. Phase 2 adds the explicit
> site-wide script tag (and the componentized header).

---

*End of design doc.*
