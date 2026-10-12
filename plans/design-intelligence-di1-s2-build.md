# DI1 S002 build verification

The user approved the S002 implementation plan on 12 October 2026. The insrc approval stamp is `2026-10-12T04:49:42.032Z`; no artifact was skipped. S001 completion and S002 LLD were already approved. This story implements sc3 only; coverage, catalog installation and guideline workflows remain downstream.

## T001 — strict source contracts and validation

Added the pure `src/design/corpus/sources/` entry, exact sc3 TypeBox/AJV contracts, internal reviewed-policy and lineage schemas, canonical tuple-based source IDs, and detached bounded input validation. Repository URLs must already use canonical HTTPS or SSH spellings without credentials/query/fragment; no URL is fetched. Full 40/64-character commit IDs and portable paths are required. Caller-supplied eligibility metadata is structurally validated, never treated as authorization.

The two planned node:test cases pass under Node 22.23.2. TypeScript checking (`npx tsc --noEmit`) passes. Parity tests compare local NFC/case and UTC-date rules against S001 public validators, including control characters, invalid dates and timezone/precision variants. S001 production code is unchanged.

The required full-suite run is recorded at `/tmp/di1-s2-t1-full.log`. Final totals: 5,459 tests, 5,330 passed, one failed, 125 skipped, three todo, zero cancelled. The sole failure is the already documented unrelated SQLite temporalTrend integer overflow at sqlite.ts:344 / rdbms-common.ts:1937. No full-suite pass is claimed. The new planned tests pass; daemon task validation is next.

T001 daemon validation passed: every acceptance check, typecheck and both mapped test cases passed. Commit: `152a7c48`.

## T002 — reviewed eligibility and evidence closure

Implemented pure per-file policy decisions over detached policy/request inputs and copied byte buffers. Admission requires allowlisting, a complete reviewed category/profile and matching file/evidence digests. Unknown terms, missing reviewer/category, unreviewed expressions/fonts and stale dependencies remain unresolved; explicit exclusions remain excluded. Only eligible requested files and their complete evidence closure produce staged bytes. Reports are deterministic and exclude rejected bytes. The three planned tests pass, including independent-source survival when shared evidence becomes stale. TypeScript checking passes.

T002 full suite: 5,462 tests; 5,332 passed, two failed, 125 skipped, three todo. Failures: known SQLite temporalTrend overflow and unrelated MCPSection polling/unmount timing assertion (5 vs 4). The isolated MCPSection rerun passed. Logs: `/tmp/di1-s2-t2-full.log`, `/tmp/di1-s2-t2-mcp-retry.log`; concise durable evidence is in `plans/reviews/design-intelligence-di1-s2-t2-verification.txt`.

T002 daemon validation passed every acceptance check and all three mapped tests. Commit: `7fd440ce`.

## T003 — pinned binary Git acquisition

Added a separate `git-reader.ts` I/O entry. It verifies full commit, tree and blob object hashes and binary framing, then traverses exact selected tree entries without reading the worktree or invoking filters. Both SHA-1 and SHA-256 Git repositories are covered. Symlinks/submodules fail the request; LFS pointer bytes remain recognizable as unresolved by the pure eligibility stage. Selected unsafe/colliding paths fail before spawning Git, while unselected unsafe names have no effect. Git environment overrides, replacement objects and lazy network acquisition are disabled.

All five planned integration tests passed and TypeScript checking passed. Tests include dirty worktree/branch movement, corrupt framing, missing objects, replacement refs, filter/fsmonitor configuration and a missing promisor object with a blocked transport.

T003 full suite: 5,467 tests, 5,338 passed, one known SQLite overflow failure, 125 skipped, three todo. Log: `/tmp/di1-s2-t3-full.log`.
