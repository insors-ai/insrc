<!-- insrc:artifact ISSUE-db9c6369d10fdfda -->

# Make backend failure assertions match public error contracts

## Reproduction

The failed-lookups test demands EACCES but installed ripgrep returns Permission denied (os error 13), correctly framed as a failed lookup. The DuckDB path-escape test demands resolves outside the repo root but receives the current ManagementInputError public message. Both wording mismatches reproduce in focused runs.

## Root cause

Assertions couple expected diagnostics to the Node fallback spelling or an earlier internal error instead of the currently supported failure shape. The audit shows refusal, not a successful forbidden access.

## Fix intent

Assert portable semantic failure codes/shapes and supported diagnostics for permission and path-escape refusals, with both ripgrep and fallback controls where available. Acceptance: protected cases still refuse and readable/allowed-path cases succeed; no raw sensitive detail is exposed to satisfy an old regular expression. Short-deadline search readiness belongs to the harness batch, not a weakened failure assertion.

## Citations

- **[[c1]]** `doc` `docs/plans/failing-tests-2026-11-20.md`
- **[[c2]]** `code` `src/analyze/explore/__tests__/failed-lookups.test.ts`
