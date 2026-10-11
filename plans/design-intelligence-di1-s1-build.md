# DI1 S001 build verification

Date: 11 October 2026. Scope: sc1/sc2 corpus contracts, deterministic identities, pure record/release validation and publication preflight. No source import, corpus curation, retrieval service, project guidelines, or catalog mutation is implemented by this story.

The user approved the S001 PLAN. All six tasks passed their insrc validation gates; BUILD completion requires the independent code-review result and a separate user approval.

## Implementation

- `src/design/corpus/contracts.ts`: closed TypeBox/AJV schemas with derived types, exact domain/UI vocabularies and stable diagnostics.
- `canonical.ts`: bounded canonical JSON and SHA-256 record/candidate/review/release identities.
- `validate.ts`: complete guidance, platform examples, provenance, domain payloads, content-bound reviews, exact regular-file inventories, relationship DAGs and downstream assessment composition.
- `index.ts`: foundational public exports with no runtime service dependency.
- `__tests__/`: independently authored fixtures, negative contracts, independently calculated digest vectors, acceptance coverage and compiled-process isolation.

Task commits: `a8fbd5b8`, `26634ca9`, `a03cbac1`, `25c394f9`, `90971c1f`, `bdbb7267`. Review fixes: `5d835fcb`.

## Verification

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
