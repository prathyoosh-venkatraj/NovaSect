# ADR-0005 — Landing "ENTER THE VAULT" → single FinVault vault CTA; remove staples

- **Status:** Accepted
- **Date:** 2026-06-05
- **Scope:** NovaSect · `index.html`, `style.css`, `reports.html`, Osiris, `physics-config.json`

## Context
The landing section used two swipeable sector cards (Energy+Utilities / Industrials) linking to
`energy.html` / `industrials.html`. They were a **redundant second entry point** to FinVault
(`reports.html`), **omitted** Utilities-as-its-own and Consumer Staples, and read as consumer-app
rather than institutional. Separately, Consumer Staples coverage was empty/no-data.

## Decision
- Replace the two cards with a **single holographic green Fallout-cog "FINVAULT" door** → `reports.html`,
  where sector filtering already lives (sector grids + the Tier-3 screener chips). The `ENTER`
  CTA is integrated as a **pulsing reactor core** (no separate button); the whole cog is the link.
- **Remove Consumer Staples across all tools** (FinVault section, Osiris cohort/chip/optgroup,
  `physics-config.json` cohort, deleted `consumer-staples.html`). Sentinel had none.

## Alternatives considered
- **Keep the cards** — rejected: redundant, incomplete coverage, less professional.
- **Cinematic 3D vault** — rejected: heavier build/perf, harder reduced-motion story.

## Consequences
- One branded entrance that scales (new sectors are just filters); `energy.html` / `industrials.html`
  retained as deep links. Reduced-motion users get a static cog. Staples re-addable later.
