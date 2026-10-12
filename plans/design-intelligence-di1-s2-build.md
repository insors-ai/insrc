# DI1 S002 build verification

The user approved the S002 implementation plan on 12 October 2026. The insrc approval stamp is `2026-10-12T04:49:42.032Z`; no artifact was skipped. S001 completion and S002 LLD were already approved. This story implements sc3 only; coverage, catalog installation and guideline workflows remain downstream.

## T001 — strict source contracts and validation

Added the pure `src/design/corpus/sources/` entry, exact sc3 TypeBox/AJV contracts, internal reviewed-policy and lineage schemas, canonical tuple-based source IDs, and detached bounded input validation. Repository URLs must already use canonical HTTPS or SSH spellings without credentials/query/fragment; no URL is fetched. Full 40/64-character commit IDs and portable paths are required. Caller-supplied eligibility metadata is structurally validated, never treated as authorization.

The two planned node:test cases pass under Node 22.23.2. TypeScript checking (`npx tsc --noEmit`) passes. Parity tests compare local NFC/case and UTC-date rules against S001 public validators, including control characters, invalid dates and timezone/precision variants. S001 production code is unchanged.

The required full-suite run is recorded at `/tmp/di1-s2-t1-full.log`. Final totals: 5,459 tests, 5,330 passed, one failed, 125 skipped, three todo, zero cancelled. The sole failure is the already documented unrelated SQLite temporalTrend integer overflow at sqlite.ts:344 / rdbms-common.ts:1937. No full-suite pass is claimed. The new planned tests pass; daemon task validation is next.
