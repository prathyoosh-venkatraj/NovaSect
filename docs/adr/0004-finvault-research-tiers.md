# ADR-0004 — FinVault equity-research depth (Tiers 1–4)

- **Status:** Accepted
- **Date:** 2026-06-05
- **Scope:** NovaSect · `report.html`, `reports.html`, `api/_xbrl-history.js`, `scripts/build-screener.mjs`

## Context
FinVault surfaced rich data only for ~9 hand-curated names; the live page showed a fraction of what
the SEC-XBRL pipeline already computes, and offered no deterministic analytics. Constraints:
no ML (explainability), no new paid data feeds, free-tier API rate limits.

## Decision
- **Tier 1 — surface existing data:** full 5-year horizontal table, live ratios backfilled for all
  US filers, trailing-P/E band; `_xbrl-history` emits `quickRatio`/`debtToEquity`/`endDates`.
- **Tier 2 — deterministic analytics:** DuPont, ROIC vs book-WACC, DCF + reverse-DCF, FCF/dividend
  coverage, implied credit tier — all transparent formulas over XBRL + FRED.
- **Tier 3 — screener:** a **precomputed `data/screener.json`** (offline `build-screener.mjs` over SEC
  XBRL) + weekly cron, because live-fetching ~108 names on page load would blow rate limits.
- **Tier 4 — forward-looking:** earnings track record (Finnhub) + DCF bear/bull scenario band.
- **EBIT proxy:** when a filer omits `OperatingIncomeLoss` (e.g. oil majors), derive EBIT = pretax +
  interest so EBITDA/ROIC/coverage populate.

## Alternatives considered
- **Live-fetch the screener** — rejected: rate-limit infeasible at ~108 names.
- **ML estimates** — rejected: breaks the explainable-models ethos.

## Consequences
- Every analytic is a transparent, unit-tested formula; screener freshness via cron.
- **Known gap:** the 1-year backtest is in-sample; walk-forward OOS is a future enhancement.
