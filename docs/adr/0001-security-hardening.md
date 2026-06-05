# ADR-0001 — Security hardening (sessions, CSP, rate limiting, write-gating)

- **Status:** Accepted (retroactive record)
- **Date:** 2026-05-29 → 2026-06-01 (phases 0–5)
- **Scope:** NovaSect · `api/*`, `vercel.json`

## Context
A free, public static + serverless app exposing proxy endpoints (SEC/Yahoo/Finnhub/FRED) and a
writable `sentinel-history` snapshot store. Needed defense-in-depth without a backend/session DB.

## Decision (phased 0→5)
- **Sessions:** HMAC-signed cookies with in-code expiry and `SESSION_VERSION` revocation; constant-time
  comparison (`timingSafeEqual`).
- **CSP report-only + SRI:** Content-Security-Policy in report-only mode first (observe before
  enforce), Subresource Integrity on CDN scripts (three.js, Chart.js), HTML-escape data-sourced
  strings.
- **Rate limiting:** Upstash Redis distributed limiter with correct client-IP extraction, in-memory
  fallback; applied to every proxy + login.
- **Write-gating:** `sentinel-history` POST requires a Bearer `SNAPSHOT_WRITE_SECRET`; reads are public.
- Secrets live only in Vercel / GitHub Actions env.

## Alternatives considered
- **Enforce CSP immediately** — rejected: risk of breaking third-party embeds; report-only first,
  promote to enforce after observing violations.
- **Server-side sessions** — rejected: adds state to a stateless deployment.

## Consequences
- Layered, low-overhead protection. **Open item:** promote CSP from report-only to enforce once the
  violation stream is clean.
