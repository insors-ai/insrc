<!-- insrc:artifact PLAN-792f9324fc43d95c-S001 -->

# Plan: E20261002792f9324:S001

## Summary

**Epic:** `lld-revision-supersedes-earlier-pass-whose`
**LLD run:** `wf-1790968373495-kfdah2`
**LLD effective hash:** `0bb28c0a6d51...`

One production file changes — the workflow id resolver — but it carries four separately-visible behaviour outcomes, so the work is cut by outcome rather than by file. The shape is: write five failing tests first, land two mechanical prerequisites unwired, then make the two independent fixes as two separate tasks so either can be reverted without losing the other, then rewrite three existing tests that currently assert the old behaviour as desired. The riskiest part is not the code, it is those rewrites: one of them is the test whose mis-asserted expectation let the defect ship in the first place, so every rewrite must be mutation-proved rather than merely made green.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Write five RED-FIRST acceptance tests for the genuinely-absent cases, committed red | S | — | integration: RED-FIRST (a), green at t4: the mirror direction — a DEF-anchored epic containing s1 plus an UNRELATED ISSUE-anchored epic on a different hash resolves `s1`; integration: RED-FIRST (b), green at t3: a single-epic repo asked for nonexistent `s9` refuses instead of minting a well-formed ref; integration: RED-FIRST (c), green at t3: an explicitly scoped label for a story the scoped epic lacks refuses — a scope asserts WHICH epic, not that the story exists; integration: RED-FIRST (d), green at t3: a hierarchical id naming a nonexistent story ordinal refuses; integration: RED-FIRST (e), green at t4: two feature epics where only ONE contains `s1` resolves — the additive gain, proved red-to-green rather than claimed | [[c1]] [[c5]] [[c6]] [[c7]] |
| 2 | **`t2`** Widen the artifact body type and add the definition-artifact reader, wired to nothing | S | — | unit: the reader returns a DEF when present and an ISSUE when the DEF is absent — the two-read order, mirroring readEpicIdentity; unit: first-READABLE-wins: a malformed DEF falls through to the ISSUE rather than aborting the read; unit: the reader never throws — a missing and a malformed file each yield an absence, not an exception; unit: behaviour-unchanged guard: the suite's pass/fail set after this task is identical to before it, with t1's five still red | [[c4]] [[c9]] [[c10]] |
| 3 | **`t3`** Verify story existence inside buildRef, only when a storyId is supplied | M | `t1`, `t2` | unit: a storyId with an LLD resolves; with a PLAN resolves; with neither artifact nor declaration refuses; unit: the declaration clause alone suffices — a story declared in a DEF's body.stories with no LLD and no PLAN resolves; unit: an ISSUE-anchored epic yields a reference for ordinal 1 and REFUSES for ordinal 2 — the boundary of the one convention; unit: s1 / S1 / S001 behave identically, inherited from storyIdToOrdinal; unit: an EPIC-level call (no storyId) is entirely unverified and unchanged; unit: task-level non-extension: a story that exists with a taskId absent from the PLAN still resolves with `task` undefined; unit: never-throws through buildRef: an unparseable label and a malformed definition artifact each yield a refusal; unit: per-clause degradation: a corrupt DEF does not disqualify its epic when an LLD for the story is intact; integration: the define-to-design window resolves — a DEF-declared story with no LLD and no PLAN; integration: a just-approved bugfix with no LLD yet — `S001` resolves against its ISSUE epic; unit: MUTATION PROOF: removing the verification turns t1's (b), (c) and (d) red again | [[c1]] [[c3]] [[c4]] [[c12]] |
| 4 | **`t6`** Assert the resolveByIssue no-op instead of assuming it | S | `t3` | integration: resolveByIssue is a NO-OP: issue-number resolution at task, story and epic levels behaves exactly as before; smoke: resolve.ts:294's DEF-only third pass is unmodified — diff-asserted, since item 5 of ISSUE-b955fa759c3c4309 owns it | [[c2]] |
| 5 | **`t4`** Switch the unscoped label branch from counting epics to keeping candidates that resolve | M | `t3` | integration: genuine ambiguity still refuses: two feature epics BOTH containing s1, unscoped → null; integration: a bugfix-only repo — `S001` refuses unscoped because every ISSUE epic has one, and resolves with an explicit scope; unit: listEpicHashes membership and ordering stay byte-identical — pins that the ISSUE was NOT demoted and this is not alternative a2; unit: MUTATION PROOF: restoring the `hashes.length !== 1` count rule turns t1's (a) and (e) red again | [[c5]] [[c7]] [[c8]] |
| 6 | **`t5`** Rewrite the three tests that encode the old behaviour — invert, do not delete | S | `t4` | unit: REWRITE of id-resolve.test.ts:459 — its scenario now RESOLVES, so the assertion inverts and the test is renamed to state the verification contract; the explicit-scope arm is KEPT; unit: REWRITE of id-resolve.test.ts:447 — the fixture gains an ISSUE artifact so the test named for regression protection actually exercises the widened enumeration; unit: REWRITE of tracker.test.ts:283 — the multi-epic arm restated in containment terms, single-epic arm still passing; unit: MUTATION PROOF per rewrite: reverting t3 or t4 turns each inverted assertion RED — a rewrite green under both rules proves nothing | [[c7]] [[c8]] [[c11]] |
| 7 | **`t7`** Full sweep, containment evidence, and the tiered criteria record | S | `t5`, `t6` | smoke: full sweep with no new failures, real counts recorded from actual output; smoke: neither render.ts nor bugfix/mount.ts required an edit; smoke: hierarchical-id tests for REAL stories pass untouched — evidence narrowing 2 is confined to nonexistent ones; smoke: CHANGED FILE SET asserted — production confined to resolve.ts, tests to the two known files, and no edit to orchestrator.ts, chain.ts, the ISSUE writer or task-level handling; smoke: all mutation proofs from t3, t4 and t5 re-run and still inverting | [[c1]] [[c2]] [[c6]] [[c12]] |

### 1.1 E20261002792f9324:S001:T001 — Write five RED-FIRST acceptance tests for the genuinely-absent cases, committed red

CRITIQUE APPLIED — these are RED-FIRST ACCEPTANCE TESTS, not characterisations. The distinction is load-bearing in this repo: the immediately-preceding Story used 'characterisation' for a test that PASSES while asserting today's WRONG behaviour and is inverted later. These do the opposite — they assert the DESIRED behaviour and FAIL now. Writing them the other way would assert the defect as desired, which is exactly the mis-asserted test that produced this Story's blocking review finding. Five cases: (a) the MIRROR direction of the reported defect — the label lives in the DEF-anchored epic with an unrelated ISSUE-anchored epic on a different hash; (b) a single-epic repo asked for a story that does not exist; (c) an explicitly scoped label for a story the scoped epic lacks; (d) a hierarchical id naming a nonexistent story ordinal; (e) CRITIQUE APPLIED, moved from t4 — two feature epics where only ONE contains the label. CRITICAL: do NOT write a test for the id-resolve.test.ts:459 arrangement; it is already covered there asserting the regressed expectation and is INVERTED at t5, not duplicated. Extend setupRepo / setupBugfixRepo (the latter already takes a withIssue flag) rather than adding a parallel helper.

**Acceptance checks:**
- Five new tests exist and FAIL on unmodified HEAD, each naming the task that turns it green
- Each test name or comment states it asserts DESIRED behaviour and currently fails — so no reader mistakes it for a characterisation of today's behaviour
- (a) the mirror direction resolves — label in the DEF epic, unrelated ISSUE epic on a different hash — goes green at t4
- (b) a single-epic repo refuses a nonexistent story, where today it returns a well-formed ref — goes green at t3
- (c) an explicitly scoped label for a missing story refuses — APPROVED narrowing one — goes green at t3
- (d) a hierarchical id naming a nonexistent ordinal refuses — APPROVED narrowing two — goes green at t3
- (e) two feature epics, only one containing the label, resolves — the additive gain — goes green at t4
- NO test is added for the id-resolve.test.ts:459 arrangement; confirmable by diff that :459 is untouched here
- Fixtures reuse setupRepo / setupBugfixRepo rather than introducing a parallel helper

### 1.2 E20261002792f9324:S001:T002 — Widen the artifact body type and add the definition-artifact reader, wired to nothing

Two mechanical prerequisites, landed as unwired code so each is reviewable alone and revertible without touching behaviour. ArtifactShape's body type (currently exactly `readonly body?: { readonly tasks?: readonly PlanTask[] };`) gains `stories`, because clause (ii)'s DEF branch reads a DEF's declared stories. And a reader for the epic's definition artifact BODY: two reads in order, DEF-<hash>.json then ISSUE-<hash>.json, first-readable-wins. readEpicIdentity cannot be reused — it returns {epicSlug, createdAt, tracker?}, identity only — but its read ORDER is the precedent to copy, so no precedence rule is invented. Verified during planning that tsconfig sets no noUnusedLocals, so the unwired reader will not fail the typecheck.

**Acceptance checks:**
- ArtifactShape's body type carries `stories`, and tsc is clean
- A reader returns the epic's definition artifact, reading DEF-<hash>.json first then ISSUE-<hash>.json, mirroring readEpicIdentity's existing order
- First-READABLE-wins: a malformed DEF falls through to the ISSUE rather than aborting, since readArtifact returns null on a parse failure
- It never throws — an unreadable or malformed file yields an absence
- readEpicIdentity is NOT modified and its identity-field logic is not duplicated
- Behaviour unchanged: the suite's pass/fail set is identical to before this task and t1's five tests are still red

### 1.3 E20261002792f9324:S001:T003 — Verify story existence inside buildRef, only when a storyId is supplied

The dummy-ref fix, applying to EVERY entry point. buildRef returns a story- or task-level reference only when that story exists — either a story-scoped artifact resolves for (epic, ordinal) via the existing storyArtifactPath, or the epic's definition artifact declares it (a DEF via body.stories, an ISSUE as exactly one story at ordinal 1). Applied ONLY when storyId is supplied, so epic-level calls stay untouched and resolveByIssue's epic sub-case keeps working. NOT extended to tasks: `task` stays absent for an unknown id. Kept separate from t4 because this task alone closes the dummy-ref defect on all paths and t4 alone closes the reported label defect — either can be reverted without losing the other.

**Acceptance checks:**
- buildRef returns null when a supplied storyId names a story with neither a story-scoped artifact nor a declaration on the definition artifact
- t1's (b), (c) and (d) turn GREEN — the nonexistent story, the scoped-label narrowing, the hierarchical-id narrowing
- An EPIC-level call (no storyId) behaves exactly as before — asserted, not assumed
- A story declared in a DEF's body.stories with no LLD and no PLAN still resolves — the define-to-design window
- An ISSUE-anchored epic yields a reference for ordinal 1 and REFUSES for ordinal 2
- s1 / S1 / S001 behave identically, via the existing storyIdToOrdinal rather than a reimplementation
- Task-level behaviour unchanged: a story that exists with an unknown taskId still resolves with `task` absent
- CRITIQUE APPLIED — error path: an unparseable story label REFUSES and does not throw, exercised through buildRef, since the module never throws and no external consumer has a handler
- CRITIQUE APPLIED — error path: an epic whose DEF body is unreadable but whose LLD for the story is intact STILL RESOLVES — degrade per-clause, never per-call
- MUTATION PROOF, run and recorded: removing the verification turns t1's (b), (c) and (d) red again
- t1's (a) and (e) are still RED — this task does not touch the label count rule

### 1.4 E20261002792f9324:S001:T006 — Assert the resolveByIssue no-op instead of assuming it

CRITIQUE APPLIED — moved to order 4, directly after t3 and BEFORE the label switch and the test rewrites. The resolveByIssue no-op is the claim that bounds the entire blast radius to two paths; if t3 broke it, that must surface immediately rather than after the riskiest edits have landed. The LLD reasons from code that resolveByIssue is unaffected — its three passes each reach buildRef with the story already evidenced by the real PLAN, LLD or DEF that carried the matched ref, and its epic-level sub-case passes no storyId — and 'unaffected' is cheap to assert and expensive to be wrong about.

**Acceptance checks:**
- Issue-number resolution at TASK level behaves exactly as before
- Issue-number resolution at STORY level behaves exactly as before
- Issue-number resolution at EPIC level behaves exactly as before — the sub-case that passes no storyId
- resolveByIssue's DEF-only third pass at resolve.ts:294 is NOT modified — confirmed by diff, since it is owned by item 5 of ISSUE-b955fa759c3c4309

### 1.5 E20261002792f9324:S001:T004 — Switch the unscoped label branch from counting epics to keeping candidates that resolve

The reported defect's fix. resolveByLabel's unscoped branch stops reading `hashes.length !== 1` and instead attempts a reference per enumerated candidate, resolving when exactly one succeeds and refusing on zero or more than one. The enumeration is UNCHANGED — deduped, DEF-anchored first, ISSUE-anchored after — so a bugfix definition artifact stays a full epic peer and is not demoted; it simply cannot evidence a story it does not have. No separate containment notion: candidate selection and reference construction are the same operation. The explicit-epicHash branch keeps prefix-match semantics and inherits t3's verification. This task makes the two tests encoding today's behaviour go RED; they are rewritten at t5, not here, so review sees the behaviour change and the test rewrite as separate acts.

**Acceptance checks:**
- t1's (a) turns GREEN — the mirror direction of the reported defect resolves
- t1's (e) turns GREEN — two feature epics, only one containing the label, resolves. CRITIQUE APPLIED: this is now a check t4 must SATISFY, written red at t1, rather than a claim t4 introduces
- Two feature epics that BOTH contain the label still refuse when unscoped — genuine ambiguity still refuses
- The explicit-epicHash branch still resolves via prefix-match, and still verifies the story
- listEpicHashes is NOT narrowed: membership and ordering byte-identical, pinned so a later reader cannot mistake this for the rejected alternative a2
- id-resolve.test.ts:459 and tracker.test.ts:283's multi-epic arm are RED at the end of this task, and left red
- MUTATION PROOF, run and recorded: restoring the count rule turns t1's (a) and (e) red again

### 1.6 E20261002792f9324:S001:T005 — Rewrite the three tests that encode the old behaviour — invert, do not delete

Three edits that look destructive in review and must be visible as their own task. (1) id-resolve.test.ts:459 asserts the regressed expectation as desired; its assertion INVERTS and the test is renamed to state the verification contract — its second arm, that an explicit scope disambiguates, stays valid and must be KEPT. (2) id-resolve.test.ts:447 is named for regression protection but uses setupRepo(), whose fixture has NO ISSUE file, so it cannot exercise the widened enumeration; its fixture gains one. (3) tracker.test.ts:283's multi-epic arm is restated: it refuses because both epics contain the label, not because two epics exist.

**Acceptance checks:**
- id-resolve.test.ts:459's assertion is inverted and the test renamed; its explicit-scope arm is preserved, not dropped
- id-resolve.test.ts:447's fixture contains an ISSUE artifact, so the test named for regression protection actually exercises the widened enumeration
- tracker.test.ts:283's multi-epic arm is restated in containment terms, and its single-epic arm still passes
- No test is DELETED — confirmable by diff that all three survive as rewrites
- MUTATION PROOF per rewrite, run and recorded: reverting t3 or t4 turns each rewritten assertion RED. A rewrite that passes under both the old and new rules proves nothing and must be redone

### 1.7 E20261002792f9324:S001:T007 — Full sweep, containment evidence, and the tiered criteria record

Close the Story with evidence rather than assertion. Run the full sweep and record real counts from actual output. Confirm containment where the LLD claims it: hierarchical-id tests for REAL stories pass untouched (the second narrowing is confined to nonexistent stories), and neither render.ts nor bugfix/mount.ts needed an edit (the public signature held). Record the criteria provenance split decided at the open-question gate: k1-k4 binding because the user stated them — an ISSUE is a DEF, 13ebd04's widening was correct, the defect is counting rather than containment, buildRef must verify — while k5-k8 and ac1-ac10 are LLD-authored and provisional.

**Acceptance checks:**
- Full sweep run with real pass/fail/skip counts from actual output, and no new failures beyond the known pre-existing sqlite-driver native-ABI one
- Hierarchical-id tests for REAL stories pass untouched — the second narrowing is confined to nonexistent stories
- Neither render.ts nor bugfix/mount.ts required an edit — the public signature held
- CRITIQUE APPLIED — CHANGED FILE SET asserted, covering the three otherwise-unguarded fences: production changes confined to src/workflow/tracker/resolve.ts; test changes confined to the two known test files; and NO edit to orchestrator.ts, chain.ts, the ISSUE writer, or buildRef's task-level handling
- Every mutation proof from t3, t4 and t5 re-run at the end and still inverting, confirming no later task neutralised an earlier guard
- The criteria provenance split is recorded: k1-k4 binding and user-grounded, k5-k8 and ac1-ac10 LLD-authored and provisional
- The report states plainly that a clean `tsc --noEmit` is NOT evidence about the tests, because tsconfig excludes them
- The report states plainly that a follow-up ISSUE for the out-of-module body.stories readers (orchestrator.ts, chain.ts) is OWED and NOT YET FILED

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| a storyId naming a story with an LLD resolves; with a PLAN resolves; with neither and no declaration refuses | `t3` |
| a story DECLARED in a DEF's body.stories with no LLD/PLAN resolves — the declaration clause alone suffices | `t3` |
| an ISSUE-anchored epic yields a reference for ordinal 1 and REFUSES for ordinal 2 — the boundary of the one convention this design leans on | `t3` |
| s1 / S1 / S001 behave identically | `t3` |
| an EPIC-level call (no storyId) is unchanged | `t3` |
| task-level: a story that exists with a taskId absent from the PLAN still resolves with `task` undefined | `t3` |
| never-throws: an unparseable label and a malformed definition artifact each yield a refusal | `t2`, `t3` |
| per-clause degradation: a corrupt DEF does not disqualify its epic when an LLD for the story exists | `t2`, `t3` |
| THE REPORTED DEFECT. The arrangement is NOT untested — id-resolve.test.ts:459 already builds an ISSUE-anchored epic plus a DEF-anchored epic on different hashes and asks a bare label, but asserts the REGRESSED expectation (null); that test must be INVERTED, not duplicated. The genuinely untested MIRROR direction is what to add: one DEF-anchored epic containing s1 plus one UNRELATED ISSUE-anchored epic on a different hash — `s1` resolves | `t1`, `t4`, `t5` |
| the additive gain: two feature epics, only one containing s1 — resolves | `t1`, `t4` |
| genuine ambiguity still refuses: two feature epics BOTH containing s1, unscoped | `t4` |
| NARROWING 1, the asymmetry removal: an explicitly scoped label for a story the scoped epic lacks — refuses, where it previously resolved | `t1`, `t3` |
| NARROWING 2, inherited: a hierarchical id naming a nonexistent story ordinal — refuses | `t1`, `t3` |
| a single-epic repo asked for nonexistent `s9` — refuses, where it previously minted a ref | `t1`, `t3` |
| define-to-design window: a DEF-declared story with no LLD/PLAN — resolves | `t3` |
| a just-approved bugfix with no LLD — `S001` resolves against its ISSUE epic | `t3` |
| a bugfix-only repo — `S001` refuses unscoped, resolves with a scope | `t4` |
| resolveByIssue is a NO-OP: issue-number resolution at task, story and epic levels behaves exactly as before | `t6` |
| id-resolve.test.ts:459 — its scenario now RESOLVES, so the assertion inverts and the test is renamed to state the verification contract; its explicit-scope arm stays valid and must be KEPT | `t5` |
| id-resolve.test.ts:447 — the test NAMED for regression protection whose fixture contains no ISSUE file; its fixture must gain one or it keeps advertising protection it does not provide | `t5` |
| tracker.test.ts:283 — the multi-epic arm restated: it refuses because both epics contain the label, not because two epics exist | `t5` |
| full sweep with no new failures, real counts recorded from actual output | `t7` |
| neither render.ts nor bugfix/mount.ts required an edit | `t7` |
| hierarchical-id tests for REAL stories pass untouched — evidence narrowing 2 is confined to nonexistent ones | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 §2.1 buildRef + §3.2 the ResolvedRef invariant-change` — "buildRef's story-scoped reads are optional-chained and conditionally spread, so a missing story yields a reference merely lacking storyRef/task rather than a refusal — the dummy ref. The new invariant"
- **[[c2]]** `prior-artifact` `LLD S001 §2.1 postconditions — the resolveByIssue no-op` — "resolveByIssue is unaffected: its three passes each arrive with the story already evidenced by the artifact that carried the matched ref, and its epic sub-case passes no storyId. This bounds the blast"
- **[[c3]]** `prior-artifact` `LLD S001 §2.4 storyArtifactPath + §3.1 existence clause (i)` — "An LLD or PLAN exists for (E, N), read with the existing storyArtifactPath plus an existence check, so s1 / S1 / S001 unify by ordinal without new code."
- **[[c4]]** `prior-artifact` `LLD S001 §2.5 readEpicIdentity + §3.1 existence clause (ii)` — "read DEF-<E>.json → does body.stories declare ordinal N? else ISSUE-<E>.json → then N === 1. The read sequence IS the discriminator; DEF-first already settles a dual-anchored hash; meta.standalone is "
- **[[c5]]** `prior-artifact` `LLD S001 §2.2 resolveByLabel — the count-versus-containment gate` — "The unscoped branch replaces `hashes.length !== 1` with: attempt a reference per candidate, resolve iff exactly one succeeded. Candidate selection and reference construction are the same operation."
- **[[c6]]** `prior-artifact` `LLD S001 §2.3 resolveByHier — the second, inherited narrowing` — "It derives story ordinals from the parsed id and never confirmed them, so a hierarchical id naming a nonexistent story resolves today and will now refuse. A SECOND change on a different path from the "
- **[[c7]]** `prior-artifact` `LLD S001 §5 test strategy — the corrected account of id-resolve.test.ts:459` — "The arrangement is NOT untested — id-resolve.test.ts:459 already builds an ISSUE-anchored epic plus a DEF-anchored epic on different hashes and asks a bare label, but asserts the REGRESSED expectation"
- **[[c8]]** `prior-artifact` `LLD S001 §5 test strategy — tracker.test.ts:283 restated in containment terms` — "the multi-epic arm restated: it refuses because both epics contain the label, not because two epics exist"
- **[[c9]]** `prior-artifact` `LLD S001 §3.1 — the ArtifactShape body-type consequence` — "ArtifactShape's `body` is typed `{ tasks?: PlanTask[] }` (resolve.ts:98) and gains `stories`. No new helper concept, no new convention."
- **[[c10]]** `prior-artifact` `LLD S001 §2.5 — readEpicIdentity cannot be reused` — "CANNOT be reused by the existence check: it returns {epicSlug, createdAt, tracker?}, the identity fields only. Clause (ii) needs the definition artifact's BODY, so it reads the artifact itself."
- **[[c11]]** `prior-artifact` `LLD S001 §5 test strategy — id-resolve.test.ts:447's fixture has no ISSUE file` — "the test NAMED for regression protection whose fixture contains no ISSUE file; its fixture must gain one or it keeps advertising protection it does not provide"
- **[[c12]]** `stakeholder` `User ruling carried into LLD S001 as premise 4, and the two approved narrowings` — "buildRef should verify, dummy stories aren't acceptable. Verification belongs IN buildRef so it covers every entry point with NO trusted-caller asymmetry — approving both narrowings, each with a pinni"
