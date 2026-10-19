<!-- insrc:artifact LLD-72b1bee074ba2dab-S001 -->

# LLD: E2026101972b1bee0:S001

## Summary

**Epic:** `link-adopted-unit-issue-under-its`
**HLD base run:** `wf-1792382616289-o8wv2a`
**HLD effective hash:** `72b1bee074ba...`

When a create times out after the tracker committed the issue, the next ensure finds it by its per-unit label and adopts it. Today an adopted Story or Task issue is never linked under its parent. This Story adds a ref-to-id lookup to the tracker's issue operations and uses it so the adopted issue is linked like a freshly created one; a lookup or link that fails is recorded and retried on the next ensure.

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

### 2.1 `IssueOps.resolveIssueId`

```typescript
resolveIssueId(ref: IssueRef): PortResult<number>
```

**Parameters:**
- `ref: IssueRef` — The issue whose tracker-internal numeric id is wanted, as 'owner/repo#N'.

**Returns:** `PortResult<number>` — The issue's REST database id, the value linkSubIssue needs as childId.

**Errors:**
- `PortResult failure (kind: rejected | unreachable)` when The issue does not exist, gh fails or times out, or the response carries no numeric id.

**Preconditions:**
- ref is a well-formed issue ref of the adapter's own owner and repo

**Postconditions:**
- Reads only; nothing in the tracker changes

### 2.2 `ghGetIssueId`

```typescript
ghGetIssueId(owner: string, repo: string, ref: string): number
```

**Parameters:**
- `owner: string` — Repository owner.
- `repo: string` — Repository name.
- `ref: string` — Issue ref whose number is read.

**Returns:** `number` — The issue's database id from `gh api repos/o/r/issues/N --jq .id`.

**Errors:**
- `Error` when gh exits non-zero, or the output is not a positive integer.

**Postconditions:**
- Runs through runGh, the same injectable exec seam as ghLinkSubIssue

### 2.3 `ensureUnitIssueDetailed`

```typescript
ensureUnitIssueDetailed(unit: UnitRef, port: TrackerPort, deps?: EnsureIssueDeps): EnsureResult<EnsuredIssue>
```

**Parameters:**
- `unit: UnitRef` — The Story or Task (or Epic) unit.
- `port: TrackerPort` — The tracker.
- `deps: EnsureIssueDeps` _(optional)_ — Test seams.

**Returns:** `EnsureResult<EnsuredIssue>` — Unchanged.

**Errors:**
- `unchanged` when A failed resolve or link on adoption never fails the ensure; it is recorded as pendingLink and logged.

**Preconditions:**
- For a Story or Task unit the parent issue is already resolved (parentRef)

**Postconditions:**
- An issue adopted by label under a known parent is either linked under it or carries a pendingLink on its record
- An Epic adoption, and an adoption with no parent, make no link call

### 2.4 `retryPendingLink`

```typescript
retryPendingLink(unit: UnitRef, port: TrackerPort, issue: IssueRef): void
```

**Parameters:**
- `unit: UnitRef` — The unit with a recorded pendingLink.
- `port: TrackerPort` — The tracker.
- `issue: IssueRef` — The unit's recorded issue.

**Returns:** `void` — Nothing; a link that still fails stays recorded.

**Postconditions:**
- A pendingLink with childId links it; one with only `child` resolves the id first, then links; success clears pendingLink; any failure leaves it recorded

## 3. Data model changes

### 3.1 `UnitIssue.pendingLink` — field-modify

From { parent: string; childId: number } to { parent: string; childId?: number | undefined; child?: string | undefined }. childId is set when the id is known (a successful create, or a successful resolve); child (the issue ref) is set when the id could not be resolved, so the retry resolves it. At least one of the two is present. Records written before this change carry childId and stay valid.

```
- pendingLink?: { parent: string; childId: number }
+ pendingLink?: { parent: string; childId?: number | undefined; child?: string | undefined }
```

**Call sites:**
- `src/workflow/tracker/refs.ts:33`
- `src/workflow/tracker/unit-issue.ts:136`
- `src/workflow/tracker/unit-issue.ts:313-321`
- `src/workflow/tracker/unit-issue.ts:337-345`

### 3.2 `IssueOps` — field-add

Gains resolveIssueId (amendment AMD-315d510cb28100e2-11). Required on the type: the GitHub adapter and the compile-time signature fixture implement it; fakes that cast to TrackerPort need none.

**Call sites:**
- `src/workflow/tracker/port.ts`
- `src/workflow/tracker/github-adapter.ts`
- `src/workflow/tracker/__tests__/fixtures/issue-ops-signatures.ts`

## 4. Error paths

**Error cases**

- **The id lookup fails when an adopted Story or Task issue is to be linked (gh timeout, issue deleted, no numeric id)** (recoverable)
  - Detection: resolveIssueId returns a failed PortResult inside ensureUnitIssueDetailed's adoption branch
  - Response: The adoption is recorded as before, with pendingLink { parent, child: <adopted ref> }; the failure is logged; the ensure still succeeds and returns the adopted issue
  - User impact: The issue is usable at once; the sub-issue link appears on a later ensure
- **The link call is rejected after the id was resolved (sub-issues disabled, parent closed, rate limit)** (recoverable)
  - Detection: linkSubIssue returns a failed PortResult after a successful resolve
  - Response: pendingLink { parent, childId } is recorded with the resolved id, as for a created issue; logged; ensure succeeds
  - User impact: No sub-issue link yet; retried on the next ensure of the unit
- **A recorded pendingLink with only `child` is retried and the lookup fails again** (recoverable)
  - Detection: retryPendingLink: resolveIssueId returns a failure
  - Response: The record is left unchanged and the failure is logged; nothing is thrown
  - User impact: Unlinked a little longer; one lookup per ensure until it works
- **The adopted issue is already a sub-issue of that parent (linked by another daemon)** (recoverable)
  - Detection: linkSubIssue is rejected by GitHub as a duplicate sub-issue
  - Response: Treated as any rejected link: pendingLink is recorded and retried; no message matching, so the retry repeats until a person closes the loop
  - User impact: One extra rejected call per ensure for this unit; no data is wrong
- **The numeric output of gh api is not a positive integer** (recoverable)
  - Detection: ghGetIssueId validates the parsed value and throws; the adapter's attempt() turns it into a failed PortResult
  - Response: Handled as a failed lookup (first case)
  - User impact: As above

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An Epic unit is adopted by label (or by the old epic label) | No parent, no resolve, no link call; unchanged |
| A Story or Task issue is adopted but the parent issue was only just found by label | parentRef is set before the lookup, so the adoption links under it |
| A pendingLink record written before this change (parent and childId only) | retryPendingLink links with childId as it does today; no resolve call |
| A fake or partial tracker without resolveIssueId reaches the adoption path | Calling the missing member is a TypeError; the adoption branch guards the call so a missing method is treated as a failed lookup, not a crash |
| The adopted ref is not of the form owner/repo#N | ghGetIssueId rejects it through the existing ref parser; handled as a failed lookup |

**Invariants to preserve**

- A failed link never fails the ensure: the issue is returned and the failure is recorded for a retry [[c3]]
- Adoption records the unit with recordUnit before it returns, and a unit that resolves locally makes no tracker call once it has no pendingLink [[c3]]
- linkSubIssue keeps its signature (parent, childId: number); resolveIssueId only supplies the id [[c2]]
- IssueOps stays the single place issue operations are declared; the compile-time fixture and its broken twin keep pinning it [[c4]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test, co-located in __tests__`

**Test levels**

- **unit** — The adapter's id lookup and the compile-time port surface
  - Subjects: `unit: ghGetIssueId and the adapter's resolveIssueId run gh api for the issue number, return the numeric id, and fail on a non-integer or a gh error`, `unit: the signature fixture compiles with resolveIssueId and its broken twin does not`
  - Fixtures: `the injectable gh exec seam`, `src/workflow/tracker/__tests__/fixtures/issue-ops-signatures.ts`
- **integration** — Adoption under a parent end to end against the unit-issue fake tracker
  - Subjects: `integration: a Story or Task issue adopted by its label after a timed-out create is resolved and linked under its parent, a failed resolve records pendingLink with child and a failed link records childId, the next ensure completes either, an Epic adoption makes no call, and an old pendingLink with childId still links without a resolve`
  - Fixtures: `fakeTracker with resolveIssueId, failResolve and commitThenFail options`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: ghGetIssueId and the adapter's resolveIssueId run gh api for the issue number, return the numeric id, and fail on a non-integer or a gh error`, `unit: the signature fixture compiles with resolveIssueId and its broken twin does not`, `integration: a Story or Task issue adopted by its label after a timed-out create is resolved and linked under its parent, a failed resolve records pendingLink with child and a failed link records childId, the next ensure completes either, an Epic adoption makes no call, and an old pendingLink with childId still links without a resolve` |

## 6. Migration

**State before:** An issue adopted by its per-unit label after a timed-out create is recorded and returned but never linked under its parent; the link and any pendingLink exist only for a create that succeeded (unit-issue.ts adoption branch, bundle c3). IssueOps has no way to read an issue's database id from its ref (bundle c2), and UnitIssue.pendingLink is { parent, childId }.

**State after:** IssueOps.resolveIssueId exists and the GitHub adapter implements it with gh api; the adoption branch resolves and links the adopted issue under its parent, recording pendingLink { parent, childId } or { parent, child } on failure; retryPendingLink resolves a child-only record before linking. pendingLink accepts either field.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add ghGetIssueId and the GitHub adapter's resolveIssueId, and declare resolveIssueId on IssueOps with the signature fixture updated — ↩ rollbackable
2. Widen the pendingLink type with an optional child ref and make childId optional; no stored record changes — ↩ rollbackable
3. Link on adoption in ensureUnitIssueDetailed and resolve first in retryPendingLink for a child-only record — ↩ rollbackable

**Backward compat:** IssueOps gains a required member, so any full implementer outside this repository must add it; the only full implementers in the repository are the GitHub adapter, the compile-time fixture and the unit-issue fake. Stored pendingLink records written earlier carry childId and are read unchanged. The GitHub-facing behaviour for created issues is unchanged.

## 7. Alternatives considered

### 7.1 a1: IssueOps.resolveIssueId, link on adoption — **CHOSEN**

Add resolveIssueId(ref) to IssueOps next to linkSubIssue and, when ensureUnitIssueDetailed adopts an issue by label under a known parent, resolve its id and link it, recording pendingLink on any failure.

IssueOps gains resolveIssueId(ref: IssueRef): PortResult<number>. The GitHub adapter implements it with one new gh wrapper, ghGetIssueId, that runs `gh api repos/o/r/issues/N --jq .id` through the same runGh seam as ghLinkSubIssue. In ensureUnitIssueDetailed, after recordUnit on the adopted issue, when parentRef is defined the call resolves the id and links it under the parent; if the resolve or the link fails, the existing UnitIssue.pendingLink { parent, childId } is stored (childId only when the id was resolved) and the existing retryPendingLink completes it on a later ensure. The signature fixture and the unit-issue fake gain the method.

### 7.2 a2: Resolve inside linkSubIssue by ref

Change linkSubIssue to accept an issue ref and resolve the id inside the adapter, so the unit code never handles ids.

linkSubIssue(parent, child: IssueRef | number) resolves a ref to its id inside the GitHub adapter and the unit-issue code passes the adopted ref. pendingLink stores the child ref instead of the id. No new port method is declared; the amendment is replaced by a signature widening.

**Rejected because:** Widens an approved signature and changes the stored pendingLink shape for records already written; breaking where a1 is additive.

### 7.3 a3: Leave adopted issues unlinked, report them

Do not link on adoption; surface an adopted-but-unlinked unit in the ensure result so a person links it.

ensureUnitIssueDetailed returns duplicateCheck/adopted information plus a linked:false flag on adoption and logs a warning; no port change. The link is left to the user or a later maintenance command.

**Rejected because:** Leaves S4-1 unfixed and depends on a manual step nobody owns.

## 8. References

- **[[c1]]** `analyze-bundle` `IssueOps and TrackerPort surface: src/workflow/tracker/port.ts, src/workflow/tracker/github-adapter.ts`
- **[[c2]]** `analyze-bundle` `ghLinkSubIssue and the id it needs: src/workflow/tracker/github.ts:248`
- **[[c3]]** `analyze-bundle` `ensureUnitIssueDetailed adoption path: src/workflow/tracker/unit-issue.ts:230-340`
- **[[c4]]** `analyze-bundle` `unit-issue and port tests: src/workflow/tracker/__tests__/fixtures/issue-ops-signatures.ts`
- **[[c5]]** `analyze-bundle` `other IssueOps implementers: src/workflow/tracker-auto.ts, src/workflow/bugfix/tracker.ts`

## 9. Open questions

- ts1 (partial): the Story has no acceptance criteria, so ac1 stands for the single story outcome; no criterion exists to check against.
- alt2 (partial): alternatives were scored against the story outcome in prose; no Story or Epic constraints exist to score.

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — design.story (design.story)

**5 do not hold · 1 could not be verified · 4 hold** · template `design-spec` · model `cli-codex:gpt-6-astra` · reviewed 2026-10-19T04:05:41.972Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

| Check item | Severity | Premise | Evidence | Action |
| --- | --- | --- | --- | --- |
| change-sites | HIGH | Recording adoption first can be followed by saving its failed link through the existing recordUnit behavior. | recordUnit selects 'prior !== undefined && prior.issue === issue ? prior : ...'. After the initial adoption write, another recordUnit call for that issue ignores a supplied pendingLink. The design specifies linking 'after recordUnit' but does not specify changing this preservation rule or explicitly patching the record. Such reuse loses the retry marker, and subsequent local ensures skip linking. [files: src/workflow/tracker/unit-issue.ts, src/workflow/tracker/refs.ts] | Specify an explicit pendingLink patch that preserves revision and extras, or change recordUnit's merge semantics. Test persistence after the initial adoption record already exists. |
| data-compatibility | HIGH | The storage change is rollbackable after child-only records have been written. | The old retry implementation unconditionally calls 'port.issueOps.linkSubIssue(pending.parent, pending.childId)'. A new '{ parent, child }' record supplies undefined after rollback; ghLinkSubIssue then submits 'sub_issue_id=undefined'. Forward compatibility with old records does not establish rollback compatibility. [files: src/workflow/tracker/unit-issue.ts, src/workflow/tracker/github.ts] | State that rollback requires resolving or converting child-only records, or introduce a compatible reader before allowing those writes. |
| boundaries | MED | There are no HLD shared contracts or other Story ownership constraints to honor. | AMD-315d510cb28100e2-11 declares 'type': 'sharedContract.methodAdd', 'contractId': 'sc1', and 'status': 'pending'. Its purpose says 'the GitHub adapter test is s1’s to add'. S4-1 names the prerequisite 's1 to agree; then link adopted Story and Task issues'. Standalone metadata does not remove that existing shared-contract dependency. [files: .insrc/artifacts/AMD-315d510cb28100e2-11.json, docs/plans/s4-open-issues.md, .insrc/artifacts/LLD-72b1bee074ba2dab-S001.json] | Document the sc1 dependency and resolve the pending amendment and ownership before treating the port addition as an agreed contract. |
| error-paths | MED | The existing ref parser rejects every ref that is not owner/repo#N. | parseIssueRef checks only the positions of '#' and '/'; it returns the remaining number string without validation. Values such as 'o/r#abc' and '/#' pass. github-adapter.ts explicitly notes: 'parseIssueRef alone only checks the separators' and uses a separate regex for assignee operations. [files: src/workflow/tracker/refs.ts, src/workflow/tracker/github-adapter.ts] | Specify strict validation for ghGetIssueId and test malformed number and empty owner/repo components. |
| error-paths | MED | Using runGh and attempt yields only rejected or unreachable lookup failures. | classifyGhFailure also returns 'missing-tool' for ENOENT and 'missing-signin' for authentication failures. The adapter's failure function preserves GhCommandError.kind. Thus the proposed implementation exposes more failure kinds than section 2.1 declares. [files: src/workflow/tracker/github.ts, src/workflow/tracker/github-adapter.ts, src/workflow/tracker/port.ts] | Declare all PortFailureKind outcomes and apply the pending-link behavior to each. |

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| tests | The ac1 mapping covers every upstream acceptance criterion. | The standalone artifact and repository searches yielded this LLD but no corresponding upstream Story acceptance-criteria artifact. S4-1 supplies an outcome, and existing unit-issue tests provide commitThenFail and failed-link retry fixtures, but they cannot establish that the synthetic ac1 exhausts upstream criteria. [files: .insrc/artifacts/LLD-72b1bee074ba2dab-S001.json, docs/plans/s4-open-issues.md, src/workflow/tracker/__tests__/unit-issue.test.ts] | Define explicit acceptance criteria for Story and Task adoption, lookup/link retries, Epic exclusion, and legacy pending records, then map each to a specific test. |
