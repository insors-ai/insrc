<!-- insrc:artifact LLD-792f9324fc43d95c-S001 -->

# LLD: E20261002792f9324:S001

## Summary

**Epic:** `lld-revision-supersedes-earlier-pass-whose`
**HLD base run:** `wf-1790968373495-kfdah2`
**HLD effective hash:** `0bb28c0a6d51...`

A reference to a story is only ever minted when that story actually exists — no more well-formed references to stories nobody created. The check lives in the one function that assembles every reference, so every way of naming a story inherits it: hierarchical id, slug, issue number, and an explicitly scoped label alike. Because 'this epic contains that story' and 'a reference can be built for it' become the same statement, the bare-label path stops counting how many epics exist and simply keeps the candidates that produce a reference — which is what fixes the reported defect, since a filed bugfix can no longer shadow a label it has nothing to do with. A bugfix definition artifact stays a full epic peer throughout; it is read exactly like the older kind it was renamed from.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `buildRef`

```typescript
function buildRef(dir: string, epicHash: string, storyId?: string, taskId?: string): ResolvedRef | null
```

**Parameters:**
- `dir: string` — Artifacts directory.
- `epicHash: string` — The epic to build the reference within.
- `storyId: string | undefined` _(optional)_ — Story label in any spelling (s1 / S1 / S001), compared by ORDINAL. When supplied, the story must exist or the call refuses.
- `taskId: string | undefined` _(optional)_ — Optional task segment. Task existence is NOT newly verified.

**Returns:** `ResolvedRef | null` — The assembled reference, or null when the epic identity is unreadable, the ids cannot be minted, OR — new — a storyId was supplied and that story does not exist in this epic.

**Errors:**
- `null return (the module's uniform refusal convention — this resolver never throws, because no caller has an exception handler)` when NEW: a storyId was supplied and the epic has no such story. Previously this returned a well-formed reference — the dummy ref.
- `null return` when PRE-EXISTING, unchanged: readEpicIdentity yields neither a DEF nor an ISSUE anchor with both epicSlug and createdAt.
- `null return` when PRE-EXISTING, unchanged: createdAt cannot form a UTC date, so the hierarchical id cannot be minted.

**Preconditions:**
- Verification applies ONLY when storyId is supplied. An epic-level call is untouched — there is no story to verify, and resolveByIssue's epic sub-case depends on that.

**Postconditions:**
- THE NEW INVARIANT: a returned story- or task-level ResolvedRef denotes a story that exists, on EVERY path, with no trusted-caller exemption including an explicitly scoped label.
- Task-level existence is deliberately NOT added — `task` stays absent for an unknown id, as today. Extending verification to tasks would change a second behaviour under cover of this one.
- resolveByIssue is unaffected: its three passes each arrive with the story already evidenced by the artifact that carried the matched ref.
- The existence lookup is two reads, DEF then ISSUE (see §3.1). No discriminator field, no new precedence rule, and `meta.standalone` is not consulted.

### 2.2 `resolveByLabel`

```typescript
function resolveByLabel(dir: string, storyId: string, taskId?: string, epicHash?: string): ResolvedRef | null
```

**Parameters:**
- `dir: string` — Artifacts directory.
- `storyId: string` — The bare label as typed.
- `taskId: string | undefined` _(optional)_ — Optional task segment.
- `epicHash: string | undefined` _(optional)_ — Explicit epic scope. Still prefix-matched; now ALSO inherits buildRef's verification, which removes the asymmetry.

**Returns:** `ResolvedRef | null` — The resolved node, or null when no candidate epic yields a reference or more than one does.

**Errors:**
- `null return` when Zero candidates produced a reference — the label names no story that exists anywhere.
- `null return` when Two or more candidates produced a reference — genuine ambiguity; refuses to guess, as its comment always claimed.

**Preconditions:**
- The enumeration it draws candidates from is UNCHANGED (premise 2): deduped, DEF-anchored first, ISSUE-anchored after.

**Postconditions:**
- The unscoped branch replaces `hashes.length !== 1` with: attempt a reference per candidate, resolve iff exactly one succeeded.
- No separate containment notion exists — candidate selection and reference construction are the same operation, so nothing can drift.
- COST: up to N reference attempts where there was a length check. Accepted unmeasured; the path is interactive and runs once per command. Alternative a3 is the additive upgrade if it ever matters.

### 2.3 `resolveByHier`

```typescript
function resolveByHier(dir: string, wfid: WorkflowId): ResolvedRef | null
```

**Parameters:**
- `dir: string` — Artifacts directory.
- `wfid: WorkflowId` — A parsed hierarchical id; its epic comes from date + hash prefix and its story/task from ORDINALS.

**Returns:** `ResolvedRef | null` — UNCHANGED SIGNATURE and unchanged code. Its OUTCOME changes for one input class.

**Postconditions:**
- BEHAVIOUR CHANGE, inherited rather than written: it derives story ordinals from the parsed id and never confirmed them, so a hierarchical id naming a nonexistent story resolves today and will now refuse. A SECOND change on a different path from the reported defect — assert it deliberately.
- Its hierarchical-id tests for REAL stories must pass untouched — the evidence the change is confined to nonexistent ones.

### 2.4 `storyArtifactPath`

```typescript
function storyArtifactPath(dir: string, prefix: 'LLD' | 'PLAN', epicHash: string, storyId: string): string
```

**Parameters:**
- `dir: string` — Artifacts directory.
- `prefix: 'LLD' | 'PLAN'` — Which story-scoped artifact kind to look for.
- `epicHash: string` — Epic to look within; already scoped by an `m[1] !== epicHash` guard.
- `storyId: string` — Any of the three spellings; unified by ordinal.

**Returns:** `string` — An existing artifact path, or the unchanged exact-name path on a miss. CONSUMED AS-IS.

**Postconditions:**
- Its exact-name single-stat fast path is preserved, so buildRef's pre-existing reads do not get slower.
- Supplies the story-scoped-artifact half of the existence evidence and already handles ordinal unification, so no new scanning convention is introduced.

### 2.5 `readEpicIdentity`

```typescript
function readEpicIdentity(dir: string, epicHash: string): EpicIdentity | null
```

**Parameters:**
- `dir: string` — Artifacts directory.
- `epicHash: string` — The epic whose slug + creation anchor is wanted.

**Returns:** `EpicIdentity | null` — UNCHANGED — slug, createdAt and optional tracker block, DEF first then ISSUE.

**Postconditions:**
- Unchanged. Cited as the source of the READ ORDER clause (ii) copies — DEF first, then ISSUE, first-readable-wins — not as a function clause (ii) can call.
- CANNOT be reused by the existence check: it returns {epicSlug, createdAt, tracker?}, the identity fields only. Clause (ii) needs the definition artifact's BODY, so it reads the artifact itself.

### 2.6 `listEpicHashes`

```typescript
function listEpicHashes(dir: string): readonly string[]
```

**Parameters:**
- `dir: string` — Artifacts directory.

**Returns:** `readonly string[]` — UNCHANGED — deduped, DEF-anchored first, ISSUE-anchored after.

**Postconditions:**
- Byte-identical membership and ordering. Pinned explicitly because the obvious-looking fix was to narrow this, and narrowing it would contradict premise 1. The enumeration was never wrong.

### 2.7 `resolveWorkflowRef`

```typescript
function resolveWorkflowRef(repoPath: string, identifier: string, opts?: { readonly epicHash?: string | undefined }): ResolvedRef | null
```

**Parameters:**
- `repoPath: string` — Repo root.
- `identifier: string` — Any identifier form.
- `opts: { epicHash?: string | undefined } | undefined` _(optional)_ — Optional explicit epic scope.

**Returns:** `ResolvedRef | null` — UNCHANGED SIGNATURE.

**Postconditions:**
- No caller needs editing: render.ts:54 already passes `{ epicHash }`, bugfix/mount.ts:116 injects the function by reference.

## 3. Data model changes

### 3.1 `Story existence (a derived predicate internal to buildRef — no persisted shape)` — new

Epic E contains the story denoted by ordinal N iff EITHER holds:

(i) STORY-SCOPED ARTIFACT — an LLD or PLAN exists for (E, N), read with the existing storyArtifactPath plus an existence check, so s1 / S1 / S001 unify by ordinal without new code.

(ii) DECLARED BY THE EPIC'S DEFINITION ARTIFACT. The lookup is two reads in order, exactly as readEpicIdentity already does it:

    read DEF-<E>.json    → present? does body.stories declare ordinal N?
    else ISSUE-<E>.json  → present? then N === 1

That is the whole mechanism. There is NO kind discriminator to introduce — the read sequence IS the discriminator, since reaching the second read means this epic's definition is an ISSUE. There is NO precedence rule to decide for a hash carrying BOTH a DEF and an ISSUE: DEF-first already settles it, and because readArtifact returns null on an unreadable file the order is first-READABLE-wins, which is the same per-clause degradation §4 specifies. And `meta.standalone` is NOT consulted by the lookup — it corroborates the one-story rule (59 of 59 standalone story-scoped artifacts on disk are ordinal 1, 55 spelled S001 and 4 spelled s1) but the algorithm never reads it.

Clause (ii) keeps a story addressable in the window after it is framed and before it is designed — no LLD, no PLAN, but legitimately nameable. Without it every story between define and design would become unresolvable, a far worse regression than the one being fixed.

MECHANICAL CONSEQUENCE, not a design choice: readEpicIdentity CANNOT be reused for clause (ii). It returns {epicSlug, createdAt, tracker?} — the identity fields, not the body — so the clause reads the definition artifact itself. ArtifactShape's `body` is typed `{ tasks?: PlanTask[] }` (resolve.ts:98) and gains `stories`. No new helper concept, no new convention.

The ISSUE branch is a statement about what an ISSUE IS — the epic's definition artifact for a standalone route, and a standalone route defines exactly one story — rather than an assumption about a filename default. The 4 `s1` spellings among standalone artifacts confirm the comparison must be by ORDINAL; anything matching the literal string `S001` would be wrong.

```
(none — computed from artifacts already on disk; no field added, no file rewritten)
```

**Call sites:**
- `src/workflow/tracker/resolve.ts:200 (buildRef — the sole evaluation site)`
- `src/workflow/tracker/resolve.ts:183 (storyArtifactPath — clause i)`
- `src/workflow/tracker/resolve.ts:167 (readEpicIdentity — the DEF-then-ISSUE read ORDER clause ii copies; its return shape cannot be reused)`
- `src/workflow/tracker/resolve.ts:98 (ArtifactShape — body type gains `stories`)`
- `src/workflow/orchestrator.ts:1750 (evidence that DEF body.stories entries carry an id)`
- `src/workflow/chain.ts:161 (same)`

### 3.2 `ResolvedRef` — invariant-change

The shape does not change; one invariant is added and it is the Story's point. TODAY a story-level ResolvedRef may denote a story that does not exist — buildRef mints ids from the epic identity and spreads `storyRef` / `task` conditionally, so a missing story yields a ref merely lacking those optional fields. AFTER, a story-level ResolvedRef denotes a story that exists, on every path, with no exemption for an explicitly scoped caller. Enforced in the single place that constructs the value, so it cannot be bypassed by adding a new resolution form later. NOT extended to tasks — `task` stays optional and a task-level ref can still carry no PLAN task, pre-existing behaviour this Story leaves alone.

```
(none)
```

**Call sites:**
- `src/workflow/tracker/resolve.ts:200 (buildRef — where the absence of the check was confirmed)`
- `src/workflow/tracker/resolve.ts:311 (resolveByHier — inherits the change)`
- `src/workflow/tracker/resolve.ts:329 (resolveByLabel — the reported defect)`
- `src/mcp/build-step/render.ts:54`
- `src/workflow/bugfix/mount.ts:116`

## 4. Error paths

**Error cases**

- **A storyId is supplied for an epic that has no such story — the dummy-ref case the user ruled unacceptable.** (recoverable)
  - Detection: Neither existence clause finds evidence: no LLD or PLAN resolves for (epic, ordinal), and the epic's definition artifact declares no story at that ordinal. Detected as absence of positive evidence rather than as a failed read, so a missing story and an unreadable file stay distinguishable.
  - Response: buildRef returns null instead of assembling a reference. No fallback, no partially-populated ref.
  - User impact: Callers see `unresolved-target` where they previously got a well-formed reference to a story that was not there. Intended, but it IS a change on paths that work today: a single-epic repo asked for `s9`, and any hierarchical id naming a nonexistent story.
- **No candidate epic yields a reference for an unscoped bare label.** (recoverable)
  - Detection: The per-candidate attempt loop finishes with an empty result set, measured by its size rather than inferred from the last attempt.
  - Response: Return null. No fallback to the old count rule, and no resolving to the sole epic merely because there is one.
  - User impact: A label naming nothing refuses — correct, and the same outcome as today in a multi-epic repo.
- **Two or more candidate epics each yield a reference — the label genuinely exists in more than one epic.** (recoverable)
  - Detection: The result set has size greater than one.
  - Response: Return null, preserving refuse-rather-than-guess. The explicit epicHash scope is unchanged and remains the way through.
  - User impact: Identical to today's refusal here; the difference is that refusal now happens only when warranted.
- **The story label cannot be converted to an ordinal.** (recoverable)
  - Detection: storyIdToOrdinal throws; storyArtifactPath already catches this and converts it to a miss by returning the unchanged exact path.
  - Response: Treat the epic as not containing the label. The existence check must never let the throw escape — a resolution helper that throws turns a refusal into a crash, and neither external consumer has a handler.
  - User impact: None visible: an unparseable label already fails LABEL_RE before resolveByLabel is reached.
- **A definition artifact is unreadable or malformed while existence is being evaluated.** (recoverable)
  - Detection: readArtifact returns undefined on a malformed or unreadable file rather than throwing, so the declaration clause sees no declared stories.
  - Response: That clause contributes nothing for that epic; the story-scoped-artifact clause still applies. Degrade per-clause, never per-call — one corrupt DEF must not remove its epic from consideration when an LLD for the story exists.
  - User impact: A repo with one corrupt artifact still resolves labels it has other evidence for.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with one epic, asked for a story it really has. | Resolves, as today — the overwhelmingly common case. |
| One feature epic containing s1/s2 plus one bugfix ISSUE epic, asked for `s1`. (The reported defect.) | Resolves to the feature epic. The bugfix epic cannot yield a reference for s1, so it no longer shadows it — and it is not demoted to achieve that. |
| Two feature epics, only one containing `s1`. | Resolves. Strictly more than worked before 13ebd04, where the count rule refused. Additive, and asserted so the gain is deliberate. |
| Two feature epics that both contain `s1`, unscoped. | Refuses. Genuine ambiguity — what the gate exists for. |
| The same both-contain fixture WITH an explicit epicHash. | Resolves via the unchanged prefix-match branch — and the story is still verified. The case that proves the trusted-caller asymmetry is gone. |
| A story declared in a DEF's story list with no LLD and no PLAN yet (the define-to-design window). | Resolves, via the declaration clause. Without it every freshly-framed story would become unresolvable. |
| A bugfix whose ISSUE is approved but whose LLD does not exist yet, asked for `S001`. | Resolves — the ISSUE is read as a definition artifact declaring one story at ordinal 1. The state ISSUE-792f9324fc43d95c itself occupies, so the case is real. The ordinal-1 part rests on the standalone route's S001 default, not a recorded field — the one convention this design leans on. |
| An explicitly scoped label for a story that does NOT exist in the scoped epic. | Refuses. Previously resolved. The clearest expression of premise 4 — supplying a scope asserts which epic, not that the story exists. |
| A hierarchical id naming a nonexistent story ordinal. | Refuses, where today it resolves. A second behaviour change on a different path; assert deliberately. |
| A task-level label (`s1/t3`) whose story exists but whose PLAN has no such task. | Unchanged — resolves with `task` absent. Task existence is deliberately NOT verified. |
| `s1`, `S1` and `S001` for the same story. | Identical behaviour, inherited from storyIdToOrdinal rather than reimplemented. |
| A repo of only ISSUE-anchored epics, asked for `S001`. | Every such epic declares ordinal 1, so all yield references and the label refuses as genuinely ambiguous; an explicit scope resolves. Correct — they really do all have an S001. |
| An epic-level reference (no storyId at all). | Entirely unchanged — which is what keeps resolveByIssue's epic sub-case working. |

**Invariants to preserve**

- An ISSUE is read as a definition artifact exactly like a DEF and is never demoted. readEpicIdentity already does this and is the precedent the new check follows — the design must not narrow what counts as an epic. [[c4]]
- listEpicHashes' membership and ordering stay byte-identical: deduped, DEF-anchored first. 13ebd04's widening was correct and is not undone; the enumeration was never the defect. [[c4]]
- resolveByIssue's behaviour is unchanged — its three passes arrive with the story already evidenced, so verification is a no-op. This bounds the blast radius to two paths. [[c2]]
- The explicit epicHash branch keeps its prefix-match semantics: exactly one match resolves, zero or more than one refuses. It gains verification but loses nothing. [[c1]]
- resolveWorkflowRef's public signature does not change, so neither external consumer needs editing. [[c4]]
- The resolver never throws on a resolution question; it returns null. Neither external consumer has an exception handler, so the existence check must swallow unparseable labels and unreadable artifacts. [[c1]]
- storyArtifactPath keeps its exact-name single-stat fast path, so buildRef's pre-existing reads do not get slower. [[c3]]
- resolveByIssue's DEF-only third pass at :294 is NOT touched — the lone remaining breach of the equivalence in this module, owned by item 5 of ISSUE-b955fa759c3c4309. [[c4]]
- Task-level verification is not introduced. `task` stays optional on a task-level ref. [[c1]]

## 5. Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test`, matching both files that already cover this subject (src/workflow/__tests__/id-resolve.test.ts, src/workflow/tracker/__tests__/tracker.test.ts) and their mkdtempSync + hand-written-artifact fixture idiom (setupRepo / setupBugfixRepo, extended rather than replaced). CARRY-FORWARD WARNING for the build: `npx tsc --noEmit` does NOT typecheck test files in this repo (tsconfig excludes **/__tests__/**), so a clean typecheck proves nothing about these tests. They must be RUN, and every new assertion must be mutation-proved.`

**Test levels**

- **unit** — Pin the new buildRef invariant directly, including both existence clauses and the deliberate non-extensions. These catch a half-implemented check that reads only one clause.
  - Subjects: `a storyId naming a story with an LLD resolves; with a PLAN resolves; with neither and no declaration refuses`, `a story DECLARED in a DEF's body.stories with no LLD/PLAN resolves — the declaration clause alone suffices`, `an ISSUE-anchored epic yields a reference for ordinal 1 and REFUSES for ordinal 2 — the boundary of the one convention this design leans on`, `s1 / S1 / S001 behave identically`, `an EPIC-level call (no storyId) is unchanged`, `task-level: a story that exists with a taskId absent from the PLAN still resolves with `task` undefined`, `never-throws: an unparseable label and a malformed definition artifact each yield a refusal`, `per-clause degradation: a corrupt DEF does not disqualify its epic when an LLD for the story exists`
  - Fixtures: `epic with DEF + LLD for s1`, `epic with DEF + PLAN only`, `epic with DEF declaring s1/s2 and no story-scoped artifacts`, `bugfix epic with an ISSUE artifact only`, `epic whose DEF body is unparseable but whose LLD for s1 is intact`
- **integration** — Prove behaviour through the public entry point. Carries the reported defect, the additive gain, and both narrowings.
  - Subjects: `THE REPORTED DEFECT. The arrangement is NOT untested — id-resolve.test.ts:459 already builds an ISSUE-anchored epic plus a DEF-anchored epic on different hashes and asks a bare label, but asserts the REGRESSED expectation (null); that test must be INVERTED, not duplicated. The genuinely untested MIRROR direction is what to add: one DEF-anchored epic containing s1 plus one UNRELATED ISSUE-anchored epic on a different hash — `s1` resolves`, `the additive gain: two feature epics, only one containing s1 — resolves`, `genuine ambiguity still refuses: two feature epics BOTH containing s1, unscoped`, `NARROWING 1, the asymmetry removal: an explicitly scoped label for a story the scoped epic lacks — refuses, where it previously resolved`, `NARROWING 2, inherited: a hierarchical id naming a nonexistent story ordinal — refuses`, `a single-epic repo asked for nonexistent `s9` — refuses, where it previously minted a ref`, `define-to-design window: a DEF-declared story with no LLD/PLAN — resolves`, `a just-approved bugfix with no LLD — `S001` resolves against its ISSUE epic`, `a bugfix-only repo — `S001` refuses unscoped, resolves with a scope`, `resolveByIssue is a NO-OP: issue-number resolution at task, story and epic levels behaves exactly as before`
  - Fixtures: `DEF epic (s1, s2) + unrelated ISSUE epic on a different hash`, `two DEF epics both containing s1`, `two DEF epics, only one containing s1`, `a single DEF epic, for the nonexistent-label narrowing`, `an epic with tracker blocks carrying issue numbers at all three levels`, `two or more ISSUE-only epics`
- **unit** — Rewrite — not delete — the tests encoding today's behaviour as desired. Its own level because these edits look destructive in review and must be visible.
  - Subjects: `id-resolve.test.ts:459 — its scenario now RESOLVES, so the assertion inverts and the test is renamed to state the verification contract; its explicit-scope arm stays valid and must be KEPT`, `id-resolve.test.ts:447 — the test NAMED for regression protection whose fixture contains no ISSUE file; its fixture must gain one or it keeps advertising protection it does not provide`, `tracker.test.ts:283 — the multi-epic arm restated: it refuses because both epics contain the label, not because two epics exist`
  - Fixtures: `the existing setupRepo / setupBugfixRepo helpers, extended`
- **smoke** — Confirm containment and that nothing else depended on the old behaviour.
  - Subjects: `full sweep with no new failures, real counts recorded from actual output`, `neither render.ts nor bugfix/mount.ts required an edit`, `hierarchical-id tests for REAL stories pass untouched — evidence narrowing 2 is confined to nonexistent ones`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `integration: one DEF epic containing s1 + one unrelated ISSUE epic → `s1` resolves`, `the pre-fix reproduction re-run: the two-arm fixture now resolves in both arms` |
| `ac2` | `unit: listEpicHashes membership and ordering byte-identical — pins that the ISSUE was NOT demoted`, `unit: an ISSUE-anchored epic yields a reference for ordinal 1 exactly as a DEF-anchored one would` |
| `ac3` | `unit: buildRef refuses when a storyId has neither artifact nor declaration`, `integration: a single-epic repo asked for `s9` refuses — no dummy ref` |
| `ac4` | `integration: an explicitly scoped label for a missing story REFUSES — verification is not bypassable by supplying a scope`, `integration: the both-contain fixture WITH a scope still resolves` |
| `ac5` | `integration: a hierarchical id naming a nonexistent ordinal refuses`, `smoke: hierarchical-id tests for real stories pass untouched` |
| `ac6` | `integration: two feature epics both containing s1, unscoped → null`, `integration: a bugfix-only repo → refuses unscoped, resolves with a scope` |
| `ac7` | `integration: a DEF-declared story with no LLD/PLAN resolves`, `unit: the declaration clause alone suffices` |
| `ac8` | `unit: ISSUE epic contains ordinal 1 and NOT ordinal 2`, `unit: epic-level calls are entirely unverified`, `unit: task-level non-extension — unknown taskId still resolves with `task` absent` |
| `ac9` | `unit: unparseable label → refusal, not a throw`, `unit: malformed DEF degrades per-clause`, `integration: resolveByIssue behaves identically at all three levels — the no-op claim asserted rather than assumed` |
| `ac10` | `unit (rewrite): id-resolve.test.ts:459 inverted and renamed, explicit-scope arm preserved`, `unit (rewrite): id-resolve.test.ts:447's fixture gains an ISSUE artifact`, `unit (rewrite): tracker.test.ts:283's multi-epic arm restated`, `MUTATION PROOF per rewrite: reverting the verification must turn each inverted assertion RED` |

## 6. Migration

**State before:** buildRef assembles a reference from the epic identity and reads story artifacts OPPORTUNISTICALLY. s1 confirmed every such read is optional-chained and spread conditionally, so a missing story yields a reference merely lacking `storyRef` / `task` rather than a refusal — `buildRef(dir, hash, 's9')` on an epic with no s9 returns a well-formed story-level ref. Nothing verifies story existence anywhere, so the invariant 'a story reference denotes a real story' does not hold today on any path. Separately, resolveByLabel gates an unscoped bare label on `hashes.length !== 1`, counting epics rather than asking which epics have the story: one feature epic plus one filed bugfix makes the count 2 and every bare label refuses. Reproduced — a DEF+LLD fixture resolves `s1`, and adding one unrelated ISSUE json makes the identical call return null. Two properties bound the work: resolveByIssue reaches buildRef with the story already evidenced by the artifact that carried the matched ref (so it is a no-op), while resolveByHier derives story ordinals from a parsed id and never confirms them (so it does change).

**State after:** buildRef refuses to mint a story- or task-level reference unless that story exists, where existence means either a story-scoped artifact resolves for it or the epic's definition artifact declares it — DEF and ISSUE read identically. Because the check lives in the single function that constructs every reference, every entry point inherits it with no trusted-caller exemption, including an explicitly scoped label. resolveByLabel's unscoped branch consequently stops counting epics and keeps the candidates that yield a reference, resolving on exactly one and refusing on zero or several; the enumeration is untouched, so a bugfix definition artifact remains a full epic peer and simply cannot evidence a story it does not have. Net: more labels resolve than before the regression, and nonexistent stories stop resolving anywhere.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Write the failing characterisations FIRST and commit them red: the never-tested arrangement (a DEF-bearing epic alongside an ISSUE artifact on a different hash, asking for the bare label), and the never-tested dummy-ref cases (a single-epic repo asked for a nonexistent story; an explicitly scoped label for a story the scoped epic lacks; a hierarchical id naming a nonexistent ordinal). The dummy-ref cases appear in no existing test (no test anywhere asks the resolver for a story that does not exist — verified by probe). The label arrangement, however, DOES appear at id-resolve.test.ts:459 asserting the regressed expectation, so the label defect shipped because it was MIS-ASSERTED rather than untested; step 4 inverts that test, and this step adds only the untested mirror direction. — ↩ rollbackable
2. Add the story-existence determination inside buildRef, covering both evidence clauses and reading the definition artifact without regard to kind. Apply it ONLY when a storyId is supplied, so epic-level references stay untouched. The step-1 characterisations turn green and the two tests encoding today's label behaviour turn red — leave them red here so review sees the behaviour change and the test rewrite as separate acts. — ↩ rollbackable
3. Switch resolveByLabel's unscoped branch from the epic count to keeping candidates that yield a reference. Kept separate from step 2 because step 2 alone fixes the dummy-ref defect on every path and step 3 alone fixes the reported label defect — either can be reverted without losing the other. — ↩ rollbackable
4. Rewrite the two tests encoding the old behaviour as desired: invert the one asserting a bugfix epic makes a label ambiguous (keeping its valid explicit-scope arm), restate the multi-epic assertion in terms of both epics containing the label, and give the test NAMED for regression protection a fixture that actually contains an ISSUE artifact. Mutation-prove each rewrite: reverting step 2 or 3 must turn the new assertion red. — ↩ rollbackable
5. Assert the no-op claim rather than assuming it: issue-number resolution at task, story and epic level must behave exactly as before. s1 reasoned this from code; this turns the reasoning into a test, because 'unaffected' is cheap to assert and expensive to be wrong about. — ↩ rollbackable
6. Run the full sweep and record real counts from actual output. Confirm the hierarchical-id tests for REAL stories pass untouched, and that neither external consumer required an edit. — ↩ rollbackable

**Backward compat:** The public entry point's signature is unchanged, so no caller needs editing: one external call site already passes an explicit epic scope, the other injects the function by reference. Nothing persisted changes shape — no field added, no artifact rewritten — so an older and a newer daemon can read the same artifacts directory, and rollback is a code revert with no data to undo.

Three behaviour changes are deliberately NOT backward compatible, and all three are the point of the Story:

(1) WIDENING — bare labels that refused now resolve, including the reported case and the two-epic case where only one epic holds the label. Cannot break a caller that was receiving nothing; both consumers treat a refusal as an error to surface.

(2) NARROWING, unscoped — a label naming a story no epic has now refuses instead of returning a reference to a story that is not there.

(3) NARROWING, scoped and hierarchical — the one most likely to surprise, and the one explicitly asked for. An explicit epic scope, and a hierarchical id, previously minted references without verifying the story; both now refuse. No trusted-caller exemption by design: supplying a scope asserts WHICH epic, not that the story exists.

One limit stated plainly: the design leans on a convention at exactly one point — that an ISSUE-anchored epic declares a story at ordinal 1 — because the ISSUE records no story id. If a standalone route ever writes a story id other than the first ordinal, that epic's stories become unresolvable by label until the ISSUE declares them explicitly. Raised as an openQuestion rather than guarded against here.

## 7. Alternatives considered

### 7.1 a1: Verify inside buildRef; the label path keeps the candidates that resolve — **CHOSEN**

One verification, intrinsic to minting a reference, and ambiguity becomes 'how many candidate epics produced a reference'.

buildRef gains the invariant that it only returns a story- or task-level reference when the named story actually exists in that epic, and returns null otherwise — verified only when a storyId was supplied, so epic-level refs are untouched. The unscoped label path then stops counting epics: it attempts a reference against each enumerated candidate and keeps the ones that produced something, resolving on exactly one and refusing on zero or more than one. There is no separate containment notion anywhere; 'epic E contains story N' and 'buildRef(E, N) resolves' are the same statement. The enumeration is untouched (premise 2) and the explicit-scope branch keeps its prefix-match semantics but now inherits verification, which removes the trusted-caller asymmetry premise 4 forbids.

### 7.2 a2: Verify at each call site; buildRef stays a pure assembler

Leave buildRef assembling and have each resolution path check story existence before calling it.

buildRef's contract is unchanged — a pure id-minter and opportunistic reader. Each path that derives a story identity from something other than a real artifact performs its own existence check first: the label path before selecting a candidate, the hierarchical-id path before trusting its ordinals. The issue-number path needs nothing.

**Rejected because:** Ranked last despite being cheapest at S. Two outright violations and they are the two that matter: k4 is a direct contradiction of the user's ruling — buildRef stays free to mint dummy refs for any caller who forgets to check — and k7 recreates the structural defect this Story exists to remove, one rule maintained in two places. A future resolution form added by someone who has not read this LLD inherits nothing.

### 7.3 a3: A shared story-existence predicate consulted by buildRef and the label path

Introduce an explicit named predicate for 'does this epic contain this story', and have both buildRef and the candidate filter call it.

A single internal predicate answers story existence for an (epic, storyId) pair, reading the two kinds of evidence s1 identified — a story-scoped artifact, or a declaration on the epic's definition artifact (DEF or ISSUE, read identically per premise 1). buildRef calls it before minting a story-level reference; the label path calls it to filter candidates without minting references it will throw away.

**Rejected because:** The closest contender and the only other alternative satisfying k4. It loses on k7 (partial: two answerers of one question) and on justification — its distinctive benefit is a performance argument, and s1 produced no measurement showing a1's cost is a problem. Introducing a second answerer to solve an unmeasured cost is the wrong trade when single-answerer-ness is exactly what k7 protects. Recorded as the additive upgrade path if the cost is ever measured and matters.

### 7.4 a4: Verify inside buildRef, with a cheap pre-filter on the label path

a1's single verification, plus a stat-only short-circuit so the label path avoids full reference construction for obvious non-candidates.

Identical to a1 in contract and in every behavioural outcome. The label path additionally skips candidates that fail a cheap story-artifact existence stat before attempting a reference, so full construction happens only for plausible candidates. The pre-filter is strictly an optimisation: any candidate it admits is still decided by buildRef, and it may never admit fewer candidates than buildRef would accept.

**Rejected because:** Behaviourally it IS a1, so it inherits every satisfied constraint, and it is rejected purely on the pre-filter. Its own third con is fatal to its purpose: a cheap story-artifact stat cannot see a story declared on the definition artifact but not yet designed, so to avoid wrongly excluding that case it must replicate the declaration reading — at which point it is neither cheap nor a filter, just a duplicate of the real check.

## 8. References

- **[[c1]]** `code` `src/workflow/tracker/resolve.ts:200` — "buildRef mints ids from the epic identity and reads story artifacts opportunistically; every such read is optional-chained and spread conditionally, so a missing story yields a ref merely lacking stor"
- **[[c2]]** `code` `src/workflow/tracker/resolve.ts:267` — "resolveByIssue's three passes each match a real PLAN / LLD / DEF and read the matched ref off it, so the story is already evidenced before buildRef is called."
- **[[c3]]** `code` `src/workflow/tracker/resolve.ts:183` — "storyArtifactPath tries the exact name first, then scans for a sibling whose story segment denotes the same ORDINAL; a miss returns the unchanged path because callers treat a bad path as absent."
- **[[c4]]** `code` `src/workflow/tracker/resolve.ts:166` — "readEpicIdentity: 'Prefers the DEF; falls back to the ISSUE artifact a bugfix chain writes instead. The DEF is consulted FIRST and wins outright.'"
- **[[c5]]** `code` `src/workflow/tracker/resolve.ts:329` — "resolveByLabel — `if (hashes.length !== 1) return null;   // ambiguous — needs an issue# or hierId`"
- **[[c6]]** `code` `src/workflow/tracker/resolve.ts:311` — "resolveByHier locates the epic by date+hash and derives storyId/taskId from ordinals, never confirming they correspond to anything."
- **[[c7]]** `code` `src/workflow/__tests__/id-resolve.test.ts:459` — "two epics present (one ISSUE-anchored, one DEF-anchored) → an unscoped label is ambiguous and must NOT guess"
- **[[c8]]** `code` `src/workflow/tracker/__tests__/tracker.test.ts:283` — "resolveWorkflowRef: unscoped label still null in a multi-epic dir; single-epic still resolves unscoped"
- **[[c9]]** `code` `src/workflow/orchestrator.ts:1750` — "const epicStoryIds = epic.body.stories.map(s => s.id);"
- **[[c10]]** `code` `src/mcp/build-step/render.ts:54` — "const ref = resolveWorkflowRef(repoPath, target, { epicHash });"
- **[[c11]]** `prior-artifact` `ISSUE-792f9324fc43d95c — the approved issue this LLD designs the fix for` — "is a bugfix ISSUE an epic PEER for the purpose of deciding that an unscoped label is ambiguous?"
- **[[c12]]** `stakeholder` `User ruling, 2026-10-03, in the design conversation for this Story` — "buildRef should verify, dummy stories aren't acceptable. ISSUE and STORY are equivalent. [correcting] an ISSUE is equivalent to a DEF and should be treated accordingly, it was earlier called DEF"

## 9. Open questions

- [s8 ts1 + alt2 — partial; the one that matters, and a KNOWN FRAMEWORK GAP the user has already deferred] The Story arrived with an EMPTY acceptanceCriteria array, so the ten acceptance criteria (ac1-ac10) and the eight constraints (k1-k8) the alternatives were scored against were authored by this LLD rather than declared by the Story. Mitigating relative to the superseded pass: k1-k4 map directly onto premises the USER stated, so they are not purely self-authored; k5-k8 and all of ac1-ac10 still are. OPEN: the plan stage must ADOPT or restate them rather than inherit them. A reviewer should check k5-k8 specifically. The ROOT CAUSE of the empty-criteria gap is separately queued for investigation at the user's direction — this is a re-report, not a new finding.
- [design judgement, NOW NARROW — was load-bearing, is not any more] Clause (ii)'s ISSUE branch says an ISSUE-anchored epic declares one story at ordinal 1. That follows from what an ISSUE is (the epic's definition artifact written by a standalone route, and a standalone route defines exactly one story) and is corroborated by every standalone story-scoped artifact on disk being ordinal 1 — 59 of 59. It no longer rests on a filename default held in readers' heads. REMAINING NICE-TO-HAVE, not required for this fix: having the ISSUE declare its story explicitly as a DEF does would put the fact in the artifact rather than in the route's semantics.
- [consequence requiring explicit approval, not a defect] Two narrowings ship alongside the fix, both following from the buildRef ruling. (a) An explicitly scoped label for a story the scoped epic lacks now refuses — this is the asymmetry removal and is the point. (b) A hierarchical id naming a nonexistent story ordinal now refuses, on a path unrelated to the reported defect. Both are correct per premise 4 but change outcomes that 'work' today, so they should be approved deliberately rather than discovered later.
- [s8 cd3 — partial] buildRef's documented error entries use 'null return' rather than a named error type, because the module's standing invariant is that it never throws (no external consumer has a handler). OPEN: confirm that documenting the refusal convention satisfies the concrete-error-type requirement for a null-returning API, or decide a named sentinel is wanted.
- [s8 sbdry2 — partial] The six ordered migrationSteps are a required field of the migration schema, but steps 1 and 4 read close to task enumeration. OPEN: a reviewer may judge they should be compressed into outcome statements with sequencing left to the plan stage. Flagged rather than asserted clean.
- [out of boundary, recorded so it is not lost] The DEF/ISSUE equivalence holds inside resolve.ts but NOT outside it: orchestrator.ts and chain.ts read DEF.body.stories (e.g. chain.ts:161 `define.artifact.body.stories`), for which an ISSUE has no analogue. Deliberately not designed here. Separately, resolveByIssue's DEF-only third pass at :294 is the lone remaining breach inside this module and belongs to item 5 of ISSUE-b955fa759c3c4309 — not fixed here to avoid overlapping a filed item.

## Resolved questions

- `qe7813d00` — [consequence requiring explicit approval, not a defect] Two narrowings ship alongside the fix, both following from the buildRef ruling. (a) An explicitly scoped label for a story the scoped epic lacks now refuses — this is the asymmetry removal and is the point. (b) A hierarchical id naming a nonexistent story ordinal now refuses, on a path unrelated to the reported defect. Both are correct per premise 4 but change outcomes that 'work' today, so they should be approved deliberately rather than discovered later.
  - **resolved**: Approve both, add explicit tests — Recording the user's own ruling rather than making a fresh call: they ruled 'buildRef should verify, dummy stories aren't acceptable', both narrowings were listed explicitly in the pre-approval summary, and they approved. Carving out (b) would reinstate the trusted-caller asymmetry the ruling forbids. Each refusal becomes its own acceptance check with a pinning test so neither is discovered later as a regression. _(2026-10-02T19:50:14.835Z)_
- `qcae52b63` — [s8 ts1 + alt2 — partial; the one that matters, and a KNOWN FRAMEWORK GAP the user has already deferred] The Story arrived with an EMPTY acceptanceCriteria array, so the ten acceptance criteria (ac1-ac10) and the eight constraints (k1-k8) the alternatives were scored against were authored by this LLD rather than declared by the Story. Mitigating relative to the superseded pass: k1-k4 map directly onto premises the USER stated, so they are not purely self-authored; k5-k8 and all of ac1-ac10 still are. OPEN: the plan stage must ADOPT or restate them rather than inherit them. A reviewer should check k5-k8 specifically. The ROOT CAUSE of the empty-criteria gap is separately queued for investigation at the user's direction — this is a re-report, not a new finding.
  - **resolved**: Restate: split user-grounded from self-authored — Meets the adopt-or-restate requirement without reopening the Story, which the user deferred. The tiering is the point: k1-k4 trace to premises the user stated (ISSUE is a DEF, the widening was correct, the count-vs-containment defect, buildRef must verify), so they are binding; k5-k8 and ac1-ac10 are LLD-authored and get marked provisional with the decision each one supports, so a later reader can tell which criteria carry user authority and which carry only mine. Reviewer attention goes to k5-k8 specifically. _(2026-10-02T19:51:23.702Z)_
- `qc2ea542c` — [s8 cd3 — partial] buildRef's documented error entries use 'null return' rather than a named error type, because the module's standing invariant is that it never throws (no external consumer has a handler). OPEN: confirm that documenting the refusal convention satisfies the concrete-error-type requirement for a null-returning API, or decide a named sentinel is wanted.
  - **resolved**: Documented null-return convention is enough — DECLINING the runner's recommendation of a discriminated result, deliberately. Three reasons. (1) Scope: every resolution function in the module returns `ResolvedRef | null` — resolveByLabel, resolveByHier, resolveByIssue and the public resolveWorkflowRef — so giving buildRef alone a discriminated result makes it inconsistent with its own module, and making them all consistent is an API redesign, not a bugfix. (2) No consumer benefits: the recommendation's premise is that a bare null hides why the call was refused, but the only new caller shape is the candidate filter, and for filtering 'story absent' and 'epic identity unreadable' both mean exactly 'not a candidate'. The two external consumers take `ResolvedRef | null` and treat any refusal as an error to surface. (3) The refusal reasons are already pinned where it matters — by acceptance checks and tests at the behaviour level, which is where a reader looks. Revisit only if a caller appears that must distinguish the reasons. _(2026-10-02T19:52:31.037Z)_

## Citations

- **[[c1]]** `code` `src/workflow/tracker/resolve.ts:200` — "buildRef mints ids from the epic identity and reads story artifacts opportunistically; every such read is optional-chained and spread conditionally, so a missing story yields a ref merely lacking stor"
- **[[c2]]** `code` `src/workflow/tracker/resolve.ts:267` — "resolveByIssue's three passes each match a real PLAN / LLD / DEF and read the matched ref off it, so the story is already evidenced before buildRef is called."
- **[[c3]]** `code` `src/workflow/tracker/resolve.ts:183` — "storyArtifactPath tries the exact name first, then scans for a sibling whose story segment denotes the same ORDINAL; a miss returns the unchanged path because callers treat a bad path as absent."
- **[[c4]]** `code` `src/workflow/tracker/resolve.ts:166` — "readEpicIdentity: 'Prefers the DEF; falls back to the ISSUE artifact a bugfix chain writes instead. The DEF is consulted FIRST and wins outright.'"
- **[[c5]]** `code` `src/workflow/tracker/resolve.ts:329` — "resolveByLabel — `if (hashes.length !== 1) return null;   // ambiguous — needs an issue# or hierId`"
- **[[c6]]** `code` `src/workflow/tracker/resolve.ts:311` — "resolveByHier locates the epic by date+hash and derives storyId/taskId from ordinals, never confirming they correspond to anything."
- **[[c7]]** `code` `src/workflow/__tests__/id-resolve.test.ts:459` — "two epics present (one ISSUE-anchored, one DEF-anchored) → an unscoped label is ambiguous and must NOT guess"
- **[[c8]]** `code` `src/workflow/tracker/__tests__/tracker.test.ts:283` — "resolveWorkflowRef: unscoped label still null in a multi-epic dir; single-epic still resolves unscoped"
- **[[c9]]** `code` `src/workflow/orchestrator.ts:1750` — "const epicStoryIds = epic.body.stories.map(s => s.id);"
- **[[c10]]** `code` `src/mcp/build-step/render.ts:54` — "const ref = resolveWorkflowRef(repoPath, target, { epicHash });"
- **[[c11]]** `prior-artifact` `ISSUE-792f9324fc43d95c — the approved issue this LLD designs the fix for` — "is a bugfix ISSUE an epic PEER for the purpose of deciding that an unscoped label is ambiguous?"
- **[[c12]]** `stakeholder` `User ruling, 2026-10-03, in the design conversation for this Story` — "buildRef should verify, dummy stories aren't acceptable. ISSUE and STORY are equivalent. [correcting] an ISSUE is equivalent to a DEF and should be treated accordingly, it was earlier called DEF"
