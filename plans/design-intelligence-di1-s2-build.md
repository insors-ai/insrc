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

T003 daemon validation passed every acceptance check and all five mapped tests. Commit: `5a036847`.

## T004 — bounded acquisition lifecycle

Reader limits can only lower the hard limits: 10,000 selected paths, 64 MiB source/evidence bytes, a separate 64 MiB metadata cache, 64 KiB stderr and 30 seconds per child. Source paths are bounded by length/depth before I/O. Shared evidence paths are deduplicated by the closure builder; distinct upstream paths remain separate identities and count separately even if bytes match. Verified commit/tree objects are cached within the bounded request.

Controlled process tests prove exact/over-limit behavior, failure without admitted output, kill-on-timeout/cancellation/output overflow, stream/spawn/exit failures and removal of abort listeners. Three planned limit tests plus the five pinned-reader tests pass. TypeScript checking passes. Full-suite evidence will follow.

T004 full suite: 5,470 tests, 5,341 passed, one known SQLite overflow failure, 125 skipped, three todo. Log: `/tmp/di1-s2-t4-full.log`.

T004 daemon validation passed every acceptance check and all three mapped tests. Commit: `fd652b27`.

## T005 — output lineage

Added deterministic lineage serialization and validation for all non-metadata/evidence output files. Imported copies must match upstream digests; derived outputs retain all reviewed source IDs, transformation/reviewer and modification notes. Original and independently inferred records require matching explicit author/rationale declarations. Record provenance is checked against the union of contributors and modifications from its own output and specimens. Missing bindings, unknown contributors, absent outputs, conflicting declarations and changed bytes fail closed. Shared source identities across import stages are deduplicated only when their metadata, reviewed profiles and bytes agree.

All three planned lineage tests pass; TypeScript checking passes. Full regression results will follow.

T005 full suite: 5,473 tests, 5,344 passed, one known SQLite overflow failure, 125 skipped, three todo. Log: `/tmp/di1-s2-t5-full.log`.

T005's first daemon gate returned failed despite passing tests/typecheck: metadata/evidence partitioning was left implicit and lineage bytes were not explicitly inserted into the manifest. Corrected with `classifyPackageFiles` (roles/evidence derived from trusted manifest/source context), `bindLineageToManifest` (fixed path, digest and media type, rejecting role/path conflicts), and `validatePackagedLineage` (compare packaged contributor claims against the separate reviewed descriptor even without a record). Added assertions for manifest membership, explicit categories, omitted contributors and unbound/undeclared third-party specimens in original-labelled records. No gate result was overridden.

T005 correction regression: 5,421 executed tests, 5,283 passed, ten failures (existing SQLite overflow plus nine unrelated MCP/review test files aborting with SIGABRT), 125 skipped, three todo. All nine aborts reproduced at concurrency 2; analyze-step-handler also aborted alone and in a temporary archived pre-T005 commit (`fd652b27`). This is not a full-suite pass; the broader environment/test-process failure remains unresolved. S002 named tests passed. The initial failed gate is preserved in `plans/reviews/design-intelligence-di1-s2-t5-initial-gate.json`.
