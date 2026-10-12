# DI1 S001 build verification

Date: 11 October 2026. Scope: sc1/sc2 corpus contracts, deterministic identities, pure record/release validation and publication preflight. No source import, corpus curation, retrieval service, project guidelines, or catalog mutation is implemented by this story.

The user approved S001 BUILD completion on 12 October 2026 at 04:44:27 UTC after the independent daemon review. All six tasks passed their insrc validation gates. The code-review WARN remains recorded without override; the chronology below preserves the earlier gates and evidence limitations.

## Implementation

- `src/design/corpus/contracts.ts`: closed TypeBox/AJV schemas with derived types, exact domain/UI vocabularies and stable diagnostics.
- `canonical.ts`: bounded canonical JSON and SHA-256 record/candidate/review/release identities.
- `validate.ts`: complete guidance, platform examples, provenance, domain payloads, content-bound reviews, exact regular-file inventories, relationship DAGs and downstream assessment composition.
- `index.ts`: foundational public exports with no runtime service dependency.
- `__tests__/`: independently authored fixtures, negative contracts, independently calculated digest vectors, acceptance coverage and compiled-process isolation.

Task commits: `a8fbd5b8`, `26634ca9`, `a03cbac1`, `25c394f9`, `90971c1f`, `bdbb7267`. Review fixes: `5d835fcb`.

## Historical verification before digest correction

Counts below belong to earlier commits and are superseded by the final 33-test result in the digest-correction section. The 24-test entry precedes the snapshot regressions that raised the suite to 27; the digest correction raised it to 33. No tests were removed.

- All six insrc task gates: PASS, including daemon-run mapped tests and strict typecheck.
- `npm run build`: PASS ([saved build log](reviews/design-intelligence-di1-s1-build.log)).
- Focused corpus suite: 27 passed, zero failed ([saved focused log](reviews/design-intelligence-di1-s1-focused.log)).
- Isolation test first compiles the current corpus sources into a fresh private temporary output tree. A separate child process imports its compiled `out/design/corpus/index.js`, evaluates valid/invalid preflight, and observes zero forbidden I/O calls. Writes, networking, subprocesses and native module loading are blocked before import; application filesystem reads are also blocked during validation.
- Canonical record/candidate/review/release golden hashes independently recomputed with Python `json.dumps` and `hashlib.sha256` from the ASCII fixture bytes.
- Full suite under Node 22, with force-exit and a 120-second test timeout: 5,345 tests; 5,216 passed, 2 failed, 124 skipped, 3 todo. No cancellations. Log: `/tmp/di1-s1-full-final.log`.

The full suite is **not green**. Its two failures are outside the corpus module:

1. `src/daemon/db/__tests__/sqlite-driver.test.ts`: temporal trend regression throws SQLite `integer overflow`. It reproduces in isolation against the unchanged database implementation.
2. `src/workflow/delivery/__tests__/handlers.test.ts`: snapshot traversal races a disappearing temporary `.git/objects/maintenance.lock` (`ENOENT`). The suite passes on the isolated rerun.

The isolated rerun had 19 passes and the one reproducible SQLite failure (`/tmp/di1-s1-baseline-recheck.log`). An earlier unbounded full-suite run stalled and was terminated; the bounded final run above completed. No unrelated code was changed to address these failures.

## Independent review

The initial review selected five unrelated pre-existing dirty files instead of the committed corpus implementation. It returned BLOCK and explicitly reported this grounding mismatch. The [raw result](reviews/design-intelligence-di1-s1-wrong-scope-review.json) is preserved; it cannot establish S001 adherence or coverage.

Unrelated tracked edits were temporarily preserved in a named git stash. The final task gate was rerun so BUILD accurately records the full 15-file corpus change set and commit. A fresh independent review of that range is pending. The original edits will be restored and their SHA-256 hashes checked before handoff.

### Scoped review and corrections

The scoped daemon review (Claude Opus, all 15 corpus files) returned WARN: zero HIGH, four MED, eight LOW. The [raw review](reviews/design-intelligence-di1-s1-initial-scoped-review.json) is preserved. Its code findings were corrected in `5d835fcb`:

- Literal enum tuples now preserve exact Static-derived TypeScript unions.
- Isolation always compiles current source into private output before import, removing the stale/missing shared-output dependency.
- Manifest and inventory diagnostic pointers are distinct. Decoded JSON errors point to the containing bytes and identify the decoded field in the message.
- The inventory path set is built once per release rather than once per record.
- Availability decoding, custom/invalid manifest paths, and resolvable diagnostic pointers have additional tests.
- The unused test fixture export was removed and both dense-array checks enforce index bounds.

Two LOW observations concern tiny local comparator/array checks; they do not change behavior and do not justify a broader utility abstraction in this foundational story. The remaining review verification warnings reflect the review subprocess sandbox and absent graph test edges, not failed tests: the separate insrc task gates ran mapped tests and typechecks successfully. A fresh code review is pending after corrections.

### Second scoped review corrections

The next review had zero HIGH findings, eleven MED verification caveats (the review context omitted the existing BUILD/TESTS records), and two MED code observations. The [raw result](reviews/design-intelligence-di1-s1-second-scoped-review.json) is retained. `65e82b7f` rejects metadata/record files as specimens, ensuring every specimen belongs to candidate-bound content. It also rejects NFC-equivalent path collisions, tests malformed coverage bytes, separates relationship and coverage passes, and tidies test imports, indentation and headers. All 24 corpus tests and `npm run build` pass. The release-validation gate passed again with all seven manifest cases.

The module README now links the machine-written BUILD/TESTS records and explains the independent schema/validation/preflight boundaries. The final task gate was refreshed at `b58f5240`; all six tasks remain passed. Final independent review is pending.

### Completion hold and revised design

The final scoped review returned WARN (0 HIGH, 4 MED, 8 LOW), saved despite the MCP client timing out. Its two remaining code findings were live-input validation and incomplete candidate metadata binding. `2477a0c8` fixes the first with detached canonical JSON and copied native file bytes, with Proxy/mutation regressions; it also covers C1 controls, invalid canonical limits and reviewed drafts. The record and release task gates passed again.

The second finding is a gap in the **approved digest specification**. A direct reproduction confirms that swapping source/notices roles preserves the existing candidate hash and still accepts the old assessments after resealing the release. It requires the [candidate identity amendment](design-intelligence-di1-s1-digest-amendment.md), now authored as a revised S001 LLD through the eight-step insrc design.story workflow. The revised LLD awaits independent review and explicit approval. The implementation still uses the original formula; BUILD is not complete or approved. PLAN must be refreshed after revised LLD approval.

The original approved LLD and PLAN and prior independent reviews are archived under `plans/reviews/`. All seven unrelated tracked edits were restored and verified byte-for-byte against their original SHA-256 values; the temporary stash was removed only after verification.

### HLD alignment

Review of the proposed LLD found that the HLD also normatively specified the old projection, plus an undefined missing/duplicate coverage-entry case. The six-step insrc design.epic workflow produced a revised HLD preserving all seven interface sketches, all story boundaries, the chosen immutable-package architecture and rollout. Its normative candidate step now covers all non-cyclic manifest metadata and defines malformed coverage membership as noncomputable/stale. HLD independent review is pending. The proposed LLD remains unapproved and must be rebased to the approved corrected HLD; no BUILD completion is requested.

### HLD ready for approval

The revised HLD's independent review reported two MED findings: a nonexistent main Config type reference retained from the old HLD, and the missing explicit rollout gate for the hash correction. Both were corrected in the artifact and resolved through `resolveReviewFinding(..., 'accept', evidenceNote)`. Effective review verdict: PASS, zero unresolved blocking findings; raw review retained, no override/deferral/approval applied. The HLD now explicitly introduces a typed strict-true flag accessor in S004 and withholds S001 completion/S003-S004 identity consumption until the revised digest and regressions are implemented and reviewed.

Final focused rerun under Node 22: 27 passed, zero failed. Shared contract shapes, story boundaries, nonfunctional targets and component diagram match the archived approved HLD exactly. The next required user action is approval of the corrected HLD. The LLD still needs rebasing and the malformed-coverage rule after that approval; then PLAN refresh, hash implementation and final code review.

### HLD approved; S001 LLD rebased

The user's explicit approval was recorded on the corrected HLD at 2026-10-11T18:02:53.157Z. No artifacts were skipped. The eight-step design.story workflow regenerated S001's LLD against that approved HLD, retaining sc1/sc2 interfaces and adjacent boundaries. It now defines empty internal candidate identity for zero/multiple coverage entries, stale results for every supplied assessment, and independently computable manifestDigest. The test strategy adds those regressions and requires a staged coverage path/mediaType entry before candidate hashing. Independent LLD review is running; LLD approval, PLAN refresh, implementation and final code review remain outstanding.

The independent LLD review completed with one MED finding: the missing coverage entry already reports reference.missing, whereas duplicates report inventory.invalid. The LLD now preserves those distinct existing diagnostics. The framework recorded this actual correction as resolved (no override/deferral); effective review PASS with zero remaining blocking findings. The LLD's base run matches the newly approved HLD. The revised LLD is ready for explicit approval; implementation still uses the old digest formula and BUILD remains incomplete.

### Digest correction implemented — 12 October 2026 (Kolkata)

The user approved the revised LLD and refreshed PLAN. Implementation commits:

- `cb78619d`: complete-manifest candidate identity with exactly three cyclic exclusions; staged coverage entry, metadata regressions and independently recomputed golden vectors.
- `839b36d5`: a noncomputable candidate cannot match an empty coverage binding; missing/duplicate inventory diagnostics retained.
- `4f03c64e`: stale role/metadata assessment regressions, missing/duplicate coverage preflight, and detached manifest fallback.

The daemon passed the revised t2, t4, t5 and t6 gates. Final focused suite: 33 passed, zero failed (`/tmp/di1-digest-final.log`); strict build passed (`/tmp/di1-digest-final-build.log`). The full suite at the digest correction ran 5,450 tests: 5,321 passed, one failed, 125 skipped, three todo. Its sole failure is the already observed SQLite temporalTrend integer overflow at sqlite.ts:344/rdbms-common.ts:1937 (`/tmp/di1-digest-full.log`). Subsequent release/preflight changes passed their daemon gates and the final full corpus suite.

Independent Python canonicalization/hash recomputation preserved the record golden and produced candidate `5691f92a44d349401cadc1627ad74e4abd71488a0e288f0eb1636ca6ab627571`, review `d14f50250c702486cdef9238d977a33b4dc3c0ddb7fb35b4772d630d7dffaeab`, and release `9bfd98dbd4d2db3c4a4f197d1212ed90d432067d528a755a206ae6acb581acc3`.

Fresh code review was requested through insrc, with the committed change range and no dirty-source substitution. The daemon waited for its stale index, then failed because its Claude CLI session quota was exhausted (reported reset: 1:40 a.m. Kolkata). No fresh review was recorded. The previous CR does not certify these corrections, and BUILD is not approved or complete. A Codex-provider alternative was offered to the user; no provider settings have been changed.

S002 design has started through the eight-step design.story workflow. Its draft LLD covers reviewed file-level policy, bounded local pinned Git extraction, source-to-output lineage and deterministic notices. It remains unreviewed/unapproved, with no S002 implementation or real source imports.


### Fresh independent review retry — 12 October 2026

After quota became available, Claude Opus in the insrc daemon completed S001 code review: WARN, 0 HIGH / 4 MED / 4 LOW. Grounding is degraded because the index stayed stale. Three MED coverage findings report that the review context omitted BUILD evidence and usable hunks; they are not failing tests or identified digest defects. The actual daemon-run task checks remain in BUILD/TESTS, and the final test/build output is preserved in [durable verification evidence](reviews/design-intelligence-di1-s1-digest-verification.txt). The review's MED stale-roadmap finding is corrected in the program roadmap. Historical counts above are now explicitly marked as superseded. The HTML/Markdown PRD parity concern is retained as a LOW maintenance observation; neither PRD was changed in this correction.

This records the review faithfully; it does not convert WARN to PASS, claim the missing graph evidence exists, or approve BUILD. S001 completion remains a separate user approval gate.


S002's subsequent independent design review found two MED ambiguities (private-helper reuse and digest-mismatch failure scope) plus one LOW path-grammar clarification. The LLD now specifies local primitives with S001 behavioral parity tests, per-file unresolved outcomes for stale reviewed digests, request failure for acquisition-integrity errors, and pre-I/O rejection of any explicitly selected non-portable path. All three were corrected and resolved through the framework: effective PASS, no override/deferral, no approval.


### Completion approved; S002 planning

The user explicitly approved both S001 BUILD and the corrected S002 LLD on 12 October 2026. The insrc approval tool stamped both artifacts, skipped none and retained S001 code-review WARN. The [S002 PLAN](../docs/epics/di1-open-source-design-corpus-retrieval-E202610117e0ae92e/S002/PLAN.md) now contains eight ordered tasks and complete mappings for all 12 LLD test subjects. Its separate approval gate remains pending before S002 implementation.
