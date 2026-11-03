<!-- insrc:artifact CR-7e0f65fc1a518722-s1 -->

# Code review: s1

Status: **passed** · task-based schema version 2

## review-7e0f65fc1a518722-s1-r1 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-03T08:09:56.244Z

3 selected task assessment(s): passed.
Native output diagnostics: [{"phase":"assessment","taskId":"t3","provider":"claude","resolved":true,"errors":[{"code":"MISSING_REQUIRED_FIELD","field":"taskId","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"status","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"summary","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"findings","correction":"Return findings as a top-level JSON array.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"testCoverage","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"limitations","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"advice","correction":"Return the required field in the JSON object.","occurrences":1},{"code":"MISSING_REQUIRED_FIELD","field":"inspectedReferences","correction":"Return the required field in the JSON object.","occurrences":1}]}]

### Submitted scope

- `e6f0ed2afa19be59dbfc187ea27201dedc61b056:src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` — [{"after":[1,193]}]
- `e6f0ed2afa19be59dbfc187ea27201dedc61b056:src/workflow/artifact-core/lifecycle-service.ts` — [{"after":[12,12]},{"after":[27,29]},{"after":[99,100]},{"after":[103,106]},{"after":[122,122]},{"after":[239,264]},{"after":[291,291]},{"after":[296,299]},{"after":[301,301]}]
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` — [{"after":[167,182]}]
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/workflow/artifact-core/lifecycle-service.ts` — [{"after":[196,196]},{"after":[198,198]},{"after":[202,205]},{"after":[252,256]},{"after":[258,258]},{"after":[260,260]}]
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/workflow/gates.ts` — [{"after":[633,633]},{"after":[956,956]}]
- `23c984c804c64be0ab4647b428c912080812f9eb:src/daemon/__tests__/lifecycle-adopt-wiring.test.ts` — [{"after":[1,130]}]
- `8d683c63cdac102acea4b7ae1d7cd7ffa33c224b:src/workflow/artifact-write-inventory.ts` — [{"after":[63,65]}]

### t1: passed

t1 adds the adoption step to LifecycleService.apply (and the parallel member-completion check) exactly as alternative a1 of the LLD specifies, plus a new six-case unit test file. Traced the control flow against checkIntegrity/checkHeadIntegrity (lifecycle.ts) and the per-artifact queue (store.ts enqueue/updateAndLog) to confirm the adopted entry is appended under the same queue slot, before the operation's own entry, only when head-ahead-of-log and the head's own hash holds and content differs from the last logged revision — matching every acceptance check. The commit touches only the two listed files; lifecycle-service.test.ts is verified byte-for-byte unchanged. Ran both files on the current checkout: all 6 lifecycle-adopt tests plus the unchanged integrity test pass.

Coverage: **verified** — All six Plan-named unit tests in lifecycle-adopt.test.ts were inspected body-and-assertion level and traced against the implementation: (1) single raw write adopted before approve, log order ['create','update','approve'] — confirmed adopt() is awaited inside the store.updateAndLog callback before it returns the operation's own change descriptor, and the fixture clock advances 1s per call so the adoption's timestamp sorts before the operation's; (2) review-then-complete reuses the same adoption and a second raw write after approval is adopted again; (3) the four-case refusal table (hand-edited number via equal contentHash, hash-mismatch via checkHeadIntegrity failing first, log-ahead-of-head, and a raw write that restores the logged hash) all hit the `adoption === undefined` branch and throw LifecycleConflictError with nothing written/logged, verified against checkIntegrity's actual ordering (own-hash check first, then number compare) in lifecycle.ts; (4) a head copied into a sidecar-less repo (no revision-bearing entry) short-circuits to {ok:true} in checkIntegrity with zero adoptions, and two consecutive raw writes still yield exactly one adopted entry at the final revision (adoptionOf only compares current head content against the log tail, revision 2 is never itself logged); (5) a History subclass that throws on the first 'adopted' append is used via Kit.restart sharing the same on-disk repo/sidecar, confirmed the throw happens before `writeUnlocked` so no head/log changes persist, and the second attempt succeeds with exactly one adopted entry; (6) the Story-completion member path reuses unitMembers()/completeMember() with RECORDS[0] (a real Story member kind) as the raw-written member, and a sibling 'stuck' kit with a hand-edited number on the same member kind proves the refusal propagates LifecycleConflictError('head-ahead-of-log') out of completeIfRolledUp. lifecycle-service.test.ts's single existing integrity test was confirmed unmodified by diff and still exercises the pre-existing refusal/approval paths untouched by this task. Executed both files on the current checkout (post t1-t3) as corroboration: 9/9 pass, including the 6 named here.


Optional verification and advice (nonblocking):

- Optional execution: did not isolate a worktree at commit e6f0ed2afa19be59dbfc187ea27201dedc61b056 to run t1's tests against that exact snapshot (the worktree-add command required an approval that wasn't granted in this session); instead ran the two test files against the current checkout (HEAD eb92d3351, which layers t2/t3 on top) and confirmed by diff that t2 only appends one new test to lifecycle-adopt.test.ts without touching the six t1 tests, so the pass result is equivalent corroboration.
- LOW/advisory, not a finding: adoptionOf's timestamp and the operation's own nextLifecycle timestamp both come from this.at(); on a real millisecond-resolution clock two timestamps minted a few awaits apart could in principle tie, and compareEntries would then fall back to comparing the (random, unordered) entry ids to decide log order. The LLD explicitly accepted system-actor/adoption-time semantics as designed, and the fixture's 1s/call clock cannot exercise this tie, so this is not a demonstrated defect — just worth keeping in mind if a future change ever assumes adoption always sorts strictly before the following entry under a real clock.

Inspected references:

- `eb92d33513936001fccefbc0a26f61dbd66be0c2:.insrc/artifacts/LLD-7e0f65fc1a518722-s1.json`
- `eb92d33513936001fccefbc0a26f61dbd66be0c2:.insrc/artifacts/PLAN-7e0f65fc1a518722-s1.json`
- `e6f0ed2afa19be59dbfc187ea27201dedc61b056:src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts`
- `e6f0ed2afa19be59dbfc187ea27201dedc61b056:src/workflow/artifact-core/lifecycle-service.ts`
- `e6f0ed2afa19be59dbfc187ea27201dedc61b056:src/workflow/artifact-core/__tests__/lifecycle-service.test.ts`
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts`

Test: `npx tsx --test --test-force-exit src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts src/workflow/artifact-core/__tests__/lifecycle-service.test.ts` — pass
Ran on the current checkout (HEAD eb92d3351, t1+t2+t3 applied); all 9 tests in the two files passed (6 from lifecycle-adopt.test.ts's t1 scope, 1 added by t2, 2 pre-existing in lifecycle-service.test.ts). Confirmed by diff that t2's change to lifecycle-adopt.test.ts is a pure appended test, so this corroborates t1's own six cases unmodified.

Test: `npx tsx --test --test-force-exit src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts src/workflow/artifact-core/__tests__/lifecycle-service.test.ts` — pass
Same run as above; confirmed by git diff that this file is byte-for-byte unchanged between the t1 parent commit and t1's commit.

### t2: passed

t2 adds LifecycleService.inspect's opt-in `adoptable` flag, wires it into gates.ts's two approve-adjacent call sites, fixes the adopted entry's timestamp/id ordering so it reliably sorts before the operation entry it precedes, and adds the daemon-level integration tests (lifecycle-adopt-wiring.test.ts) plus the unit test for inspect's new option. All three acceptance checks are met, the deviation from the LLD (inspect needing the adoptable option, since the approve path pre-checks inspect before apply runs) is accurately and specifically documented in docs/plans/core-data-model.md and team-workflow.md, and I independently re-ran both the unit test (lifecycle-adopt.test.ts) and the new integration test (lifecycle-adopt-wiring.test.ts): all pass, matching the builder-reported TESTS.md record exactly. A full `tsc --noEmit` also passed clean.

Coverage: **verified** — Inspected every test body and assertion in scope: the unit test 'inspect answers the strict integrity unless the caller is about to approve and asks for adoptable, and logs nothing either way' (lifecycle-adopt.test.ts:167-182) exercises both the strict and adoptable paths of inspect, and the not-adoptable (hand-raised number) case, and asserts the log gains no entry. The three new daemon integration tests in lifecycle-adopt-wiring.test.ts exercise the real production call paths: handleWorkflowApprove -> approveWorkflowTarget -> lifecycle.inspect(id,{adoptable:true}) (gates.ts:633/956) for both a direct approve and a review-decision approve, and a third test covers both raw-write shapes relevant to production writers (a full-body replace, matching synthesize.ts's pattern, and an appended-field write, matching resolve-comment.ts's pattern) through the same real service/store, confirming the fix is writer-agnostic. I independently reran all three integration tests and all seven lifecycle-adopt.test.ts cases against the committed code (HEAD matches the reviewed commits) and they pass, matching the daemon-executed TESTS.md record for t2. I also traced the ordering fix (adoptionOf's timestamp/id change) against the real log comparator (sidecar-store.ts's compareEntries/timeOf/entryIdOf) and confirmed other log entries use full-random 32-hex ids (store.ts:322) so the '0000'-prefixed adoption id reliably sorts first, matching the documented design intent.


Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsx --test --test-force-exit src/daemon/__tests__/lifecycle-adopt-wiring.test.ts` and `npx tsx --test --test-force-exit src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` myself against the committed code; both suites passed (3/3 and 7/7), matching the daemon-executed TESTS.md record.
- Optional execution: ran `npx tsc --noEmit -p .` for a full-repo typecheck; it completed with no errors.
- Minor/LOW observation (non-blocking): the third wiring test's docstring says the design-run writer's and resolve-comment's redrafts are made 'in the shape each makes them,' but the test uses one shared `rawRedraft` helper calling `writeArtifact` directly rather than invoking the real synthesize.ts/resolve-comment.ts modules. The body shapes it uses (full replace vs. appended `openQuestions`) do accurately mirror those writers' real behavior (confirmed by reading gates.ts:222, workflow-rpc.ts:348, resolve-comment.ts:277), so this is a documentation-precision nit, not a coverage gap.

Inspected references:

- `eb92d33513936001fccefbc0a26f61dbd66be0c2:.insrc/artifacts/LLD-7e0f65fc1a518722-s1.json`
- `eb92d33513936001fccefbc0a26f61dbd66be0c2:.insrc/artifacts/PLAN-7e0f65fc1a518722-s1.json`
- `eb92d33513936001fccefbc0a26f61dbd66be0c2:.insrc/artifacts/TASK-7e0f65fc1a518722-s1-t2.json`
- `eb92d33513936001fccefbc0a26f61dbd66be0c2:.insrc/artifacts/TESTS-7e0f65fc1a518722-s1.json`
- `eb92d33513936001fccefbc0a26f61dbd66be0c2:docs/standalone/keep-artifact-log-step-raw-content-E202611027e0f65fc/S001/BUILD.md`
- `eb92d33513936001fccefbc0a26f61dbd66be0c2:docs/standalone/keep-artifact-log-step-raw-content-E202611027e0f65fc/S001/TESTS.md`
- `8d683c63cdac102acea4b7ae1d7cd7ffa33c224b:docs/plans/core-data-model.md`
- `a2486c15e7dd3d2939ba5e64571287b5f281f38f:docs/plans/team-workflow.md`
- `8d683c63cdac102acea4b7ae1d7cd7ffa33c224b:src/workflow/artifact-write-inventory.ts`
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/workflow/artifact-core/lifecycle-service.ts`
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts`
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/workflow/gates.ts`
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/workflow/artifact-core/lifecycle.ts`
- `23c984c804c64be0ab4647b428c912080812f9eb:src/daemon/__tests__/lifecycle-adopt-wiring.test.ts`
- `23c984c804c64be0ab4647b428c912080812f9eb:src/daemon/__tests__/lifecycle-wiring.test.ts`
- `23c984c804c64be0ab4647b428c912080812f9eb:src/workflow/artifact-core/__tests__/store-kit.ts`
- `23c984c804c64be0ab4647b428c912080812f9eb:src/daemon/workflow-approve.ts`
- `23c984c804c64be0ab4647b428c912080812f9eb:src/workflow/artifact-core/history.ts`
- `23c984c804c64be0ab4647b428c912080812f9eb:src/workflow/artifact-core/sidecar-store.ts`
- `23c984c804c64be0ab4647b428c912080812f9eb:src/workflow/artifact-core/store.ts`
- `23c984c804c64be0ab4647b428c912080812f9eb:src/workflow/review-decision.ts`

Test: `npx tsx --test --test-force-exit src/daemon/__tests__/lifecycle-adopt-wiring.test.ts` — pass
Reviewer-run directly against the committed working tree (clean, matching commit 23c984c80 for this file): all 3 tests passed in 571.8ms.

Test: `npx tsx --test --test-force-exit src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts` — pass
Reviewer-run directly against the committed working tree: all 7 tests passed in 400.1ms.

### t3: passed

Task t3's in-scope code change (8d683c63c, src/workflow/artifact-write-inventory.ts) adds a clause to the `note` field of exactly the three content-class entries that are genuinely gated (not exempt) by assertMayAuthor/assertMayReviseDraft — synthesize.ts, workflow-rpc.ts, resolve-comment.ts — stating that a redraft leaving the head one revision past its log is adopted by LifecycleService.apply at the next approve/review/complete. This is a pure documentation-string change (no logic, no detector-rule change); I verified the claim against the actual t1 (e6f0ed2af) and t2 (e921a001c) implementation commits and it is accurate, including the approve-path deviation (inspect's 'adoptable' answer in gates.ts) the functional summary calls out. The semicolon-joined-clause style matches the file's existing convention throughout. I ran the write-inventory test and the directly affected lifecycle-core tests at the current checkout — all pass, confirming acceptance check 2 and corroborating the broader no-regression claim recorded in the (out-of-code-scope) docs sweep commit ef4b779f8.

Coverage: **verified** — The task's named test (artifact-write-inventory.test.ts) asserts `class`/`gatedBy` equality per file, not `note` string content, so the note-text change cannot affect its pass/fail outcome — confirmed by executing the file (10/10 pass) at the current checkout (eb92d3351). I additionally ran the directly related lifecycle-adopt.test.ts and lifecycle-service.test.ts (9/9 pass) to corroborate the sweep claim recorded in the Story's docs commit for the files this note change touches. No new test was required for a pure documentation-string edit, and none was planned.


Optional verification and advice (nonblocking):

- Optional execution: ran `npx tsx --test --test-force-exit src/workflow/__tests__/artifact-write-inventory.test.ts` (10/10 pass) and the artifact-core lifecycle unit tests at the current checkout as corroboration; did not re-run the full cross-checkout sweep (artifact-core/workflow/daemon suites against the pre-Story base) that the docs commit ef4b779f8 records, since that record and its underlying commits are docs/plans scope, explicitly excluded from this code review's scope by the functional summary.

Inspected references:

- `8d683c63cdac102acea4b7ae1d7cd7ffa33c224b:src/workflow/artifact-write-inventory.ts`
- `23c984c804c64be0ab4647b428c912080812f9eb:src/workflow/__tests__/artifact-write-inventory.test.ts`
- `e6f0ed2afa19be59dbfc187ea27201dedc61b056:src/workflow/artifact-core/lifecycle-service.ts`
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/workflow/artifact-core/lifecycle-service.ts`
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/workflow/gates.ts`
- `e921a001c56162010a208d185c2d931d6f8bdd7e:src/daemon/__tests__/lifecycle-wiring.test.ts`
- `eb92d33513936001fccefbc0a26f61dbd66be0c2:.insrc/artifacts/PLAN-7e0f65fc1a518722-s1.json`
- `eb92d33513936001fccefbc0a26f61dbd66be0c2:.insrc/artifacts/TASK-7e0f65fc1a518722-s1-t3.json`
- `eb92d33513936001fccefbc0a26f61dbd66be0c2:docs/standalone/keep-artifact-log-step-raw-content-E202611027e0f65fc/S001/BUILD.md`
- `eb92d33513936001fccefbc0a26f61dbd66be0c2:docs/standalone/keep-artifact-log-step-raw-content-E202611027e0f65fc/S001/TESTS.md`
- `ef4b779f8cc2c46bdcdf343f04441dfce3b6b281:docs/plans/core-data-model.md`
- `8d683c63cdac102acea4b7ae1d7cd7ffa33c224b:docs/plans/team-workflow.md`

Test: `npx tsx --test --test-force-exit src/workflow/__tests__/artifact-write-inventory.test.ts` — pass
Executed directly against the current checkout (HEAD eb92d3351); all 10 cases passed in 1449.9ms.

Test: `npx tsx --test --test-force-exit src/workflow/artifact-core/__tests__/lifecycle-adopt.test.ts src/workflow/artifact-core/__tests__/lifecycle-service.test.ts` — pass
Executed directly against the current checkout (HEAD eb92d3351); all 9 cases across both files passed in 427ms.
