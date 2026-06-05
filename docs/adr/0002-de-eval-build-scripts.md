# ADR-0002 — De-eval build scripts (acorn AST literal parsing)

- **Status:** Accepted (retroactive record)
- **Date:** 2026-06-01
- **Scope:** NovaSect · `scripts/`, `scripts/lib/safe-literal.js`

## Context
Offline build tooling parsed config/literal data using `eval` / `new Function`. Even in build-only
code this is an arbitrary-code-execution and CSP hygiene hazard, and a poor signal in a security-
conscious project.

## Decision
Replace every `eval` / `new Function` with a **safe literal parser built on the `acorn` AST**
(`scripts/lib/safe-literal.js`): parse the source to an AST and evaluate only literal nodes
(objects, arrays, strings, numbers, booleans, null), rejecting anything executable. Output is
**byte-identical** to the previous behaviour for valid inputs.

## Alternatives considered
- **`JSON.parse`** — rejected: the inputs are JS object literals (trailing commas, unquoted keys,
  comments), not strict JSON.
- **Keep `eval`** — rejected: unsafe and contradicts the security posture.

## Consequences
- No `eval`/`new Function` anywhere in the build path.
- Verified byte-identical outputs before/after on existing data; no functional change to artifacts.
