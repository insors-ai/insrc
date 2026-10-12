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

T005's corrected daemon gate passed every acceptance check and all three mapped tests without override. Correction commit: `93251dac`.

## T006 — deterministic notices and evidence

Added pure source-manifest, lineage and NOTICE generation. NOTICE is versioned UTF-8 text containing canonical readable JSON metadata for every source, redistribution condition and modification notice requirement. Evidence files retain exact raw bytes (including BOM/CRLF), are addressed by SHA-256 and deduplicated while retaining every source association. Malformed UTF-8 evidence, stale/missing evidence, policy mismatch and path collisions fail. Rejected staging outcomes stay outside distributed metadata.

Three planned tests pass, including explicit upstream NOTICE evidence, multiple attributions/modifications, shared-evidence deduplication, independent expected notice bytes, and malformed text rejection. TypeScript checking passes. A full sweep at concurrency 4 is running because the previous default-concurrency sweep exposed unrelated process aborts; reduced-concurrency reruns had also reproduced those aborts.

T006 full suite at concurrency 4: 5,367 executed tests, 5,226 passed, 13 failures (SQLite overflow plus 12 unrelated daemon/MCP/review test-file SIGABRTs), 125 skipped, three todo. Reduced concurrency did not eliminate the broader native process failures; no full-suite pass is claimed. Log: `/tmp/di1-s2-t6-full.log`.

T006 daemon validation passed every acceptance check and all three mapped tests. Commit: `da79b06a`.

## T007 — staging and independent candidate assessment

Added pure `assessment.ts` and separate I/O `stage.ts`. Local staging validates selected/evidence paths before acquisition, enforces combined budgets and returns only admitted-byte snapshots. Assessment recomputes source eligibility from the separately reviewed policy and acquisition bytes, reconstructs expected source/lineage/notice/evidence inventory, checks exact packaged bytes, classifies every output and compares packaged lineage to its reviewed descriptor. It never trusts caller-provided pass flags.

`prepareEligibilityCandidate` assembles output and source metadata bytes against an explicit manifest/coverage-path declaration and refuses to drop declared files. Assessment privately supplies a minimal structural coverage envelope and temporary release seal to S001 validation so all non-cyclic invariants can be checked before S003 coverage completion. Those private bytes are never returned, installed or used to emit a coverage assessment. Final coverage hashing preserves the candidate digest; missing/duplicate coverage membership returns ValidationResult failure instead of an empty assessment binding.

All three planned tests pass, including metadata/role/profile/output/evidence mutations and S001 preflight with explicitly synthetic finalized coverage. TypeScript checking passes. Full sweep `/tmp/di1-s2-t7-full.log`: 5,370 executed tests, 5,229 passed, 13 failures (known SQLite overflow plus the same 12 daemon/MCP/review SIGABRT files), 125 skipped, three todo. The final assembly helper was also checked by the focused suite after wiring; T008 performs the final source/build sweep.

T007 daemon validation passed every acceptance check and all three mapped tests. Commit: `21319c59`.

## T008 — acceptance, isolation and maintainer handoff

Added local-Git end-to-end acceptance covering mixed eligibility, sanitized reassessment snapshots, exact pinned identity and complete exported notices through S001 preflight. Added original-only and multi-source derived package cases with omitted-contributor mutations. The compiled isolation test builds fresh private output, imports the pure corpus/source entries, then exercises valid/invalid source assessment and publication preflight with application filesystem/network/subprocess/native loading blocked; the Git entry is checked separately. Maintainer sequencing, review inputs, bounds, error behavior and downstream S003/S004/S005 ownership are documented in the corpus README. No storage migration is needed.

The isolation harness initially passed its extra `review` payload into S001's closed candidate input, which correctly rejected that extra field. The harness now sends only manifest/files to S001; no production relaxation was made. Also tightened sc3's inferred TypeScript eligibility type to the exact literal union (`as const`); its runtime schema is unchanged.

Final focused corpus result: **58 passed, zero failures/skips** under Node 22.23.2. `npm run build` passed. Full unabridged focused/build output is preserved in `plans/reviews/design-intelligence-di1-s2-final-verification.txt`; full-suite results follow separately.

Final full sweep: 5,373 executed tests, 5,231 passed, 14 failures, 125 skipped, three todo. Failures are the known SQLite overflow, the same 12 unrelated daemon/MCP/review SIGABRT files, and a DaemonSection async-render timing failure. The isolated DaemonSection rerun passed all 11 tests. No full-suite pass is claimed. Full source test/build evidence and the exact failed test list are in the final verification file. Code-review and explicit BUILD approval are still pending.

T008 daemon validation passed all acceptance checks and mapped acceptance/isolation tests; it independently inspected the durable 58-test/build evidence. All eight S002 tasks have passed their insrc gates. T008 commit: `693088dc`. Independent code-review is next; BUILD is not yet approved.

## Initial daemon review and corrections

Independent daemon review `cr-1791783446612-au7dme` returned WARN (0 HIGH, 5 MED, 8 LOW), with degraded graph grounding. Its unmodified result is archived in `plans/reviews/design-intelligence-di1-s2-initial-code-review.json`.

Corrected the three MED code findings: child errors/timeouts now settle once and clean up without depending on a close event; all public assessment paths snapshot reviewed fields without invoking getters/proxies; each pinned-source request has a five-minute deadline in addition to the 30-second child limit. Tests exercise no-close errors/timeouts, a stalled runner, listener cleanup and hostile review inputs.

Corrected actionable LOW findings: inferred records with derived bindings require matching reviewed author/rationale; categories/profiles must explicitly record conditions; missing record/lineage lookups return precise issues; admitted and requested evidence use one closure walk; I/O staging and pure assessment share aggregate-budget accounting. Added direct aggregate count/byte and closure-overflow regressions. The closure limit is now checked at insertion, though the previous dynamic queue loop would also visit newly appended items: the original review's claim that the final insertion escaped checking was not reproduced.

Retained the approved LLD choice to mirror S001's private path/date primitives with public-behavior parity tests. Exporting S001 internals to remove that duplication would change the approved boundary.

The two MED coverage findings are evidence caveats: BUILD/TESTS records exist on disk and all task gates passed, but the review grounding omitted BUILD and its test rerun was denied. The named smoke promise says **full corpus regression suite**, not full repository suite, and is reported via the supported smoke-test protocol. The focused corpus suite/build pass; the documented broader failures remain unresolved. We have not overridden the review verdict or claimed a full-repository pass. Review-fix evidence is in `plans/reviews/design-intelligence-di1-s2-review-fixes-verification.txt`.

Correction commit `16df4f8a`: affected gates T001, T002, T004, T005, T007 and T008 all revalidated PASS through the daemon. T008 independently confirmed the durable 58-test corpus/build evidence and the supported reported smoke protocol. Fresh independent review is next; BUILD completion remains unapproved.

## Second independent review

Daemon review `cr-1791784576567-a9tv5m` returned WARN (0 HIGH, 1 MED, 10 LOW). The MED is the missing BUILD record in review grounding, despite persisted BUILD/TESTS records and successful daemon gates. The raw review is preserved in `plans/reviews/design-intelligence-di1-s2-second-code-review.json`.

Corrected the new compound-license finding: a profile must supply atomic resolved identifiers, never OR/AND/WITH/parenthesized expressions; tests require a maintainer's explicit MIT choice before the dual-license fixture can be admitted. Added local orchestration tests for aggregate preflight count overflow, relative repository rejection, exact byte limit, zero remaining bytes and subsequent-request overflow. The post-acquisition budget charge remains a defensive check; readPinnedSources enforces the remaining budget first, so a valid reader result cannot trigger that later failure.

Other LOW corrections: typed staged helper errors now return ValidationResult failures; internal evaluation reuses detached review snapshots instead of recopying at each helper call; evidence invalidation uses a reverse-dependency worklist with a chain regression; redundant derived-modification and role-collision diagnostics were removed. Candidate preparation still independently reassesses its generated outputs by design. Evidence classification and evidence serialization remain separate checks: classification associates digest paths with contributor IDs, while serialization resolves exact identities, validates raw digests/UTF-8 and emits bytes. Unifying those computations would reduce the independence of reconstruction, so that maintainability suggestion is deferred rather than represented as a correctness fix.

All 58 corpus tests and npm run build pass after these corrections. The full logs are in `plans/reviews/design-intelligence-di1-s2-final-review-verification.txt`. No S001 public API was changed. Fresh gate validation and independent review follow; BUILD remains unapproved.
