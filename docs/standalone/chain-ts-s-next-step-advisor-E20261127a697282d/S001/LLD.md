<!-- insrc:artifact LLD-a697282df76a3c1d-s1 -->

# LLD: STORY-a697282df76a3c1d-s1 — Replace chain.ts's dead CLI next-step commands and docs/workflow.md's dead amendment CLI with the real MCP mechanism

## Summary

**Epic:** `chain-ts-s-next-step-advisor`
**HLD base run:** `wf-1795759421306-anlvic`
**HLD effective hash:** `5db5a4f35035...`

Fixes two surfaces that still tell an agent (or a human reading docs/workflow.md) to run `insrc workflow approve/amend/sync ...` -- CLI commands that do not exist. src/workflow/chain.ts's computeNextAction() swaps those dead strings for the real insrc_workflow_approve({artifactPath}) / insrc_workflow_step(phase='start', workflow='tracker.sync', ...) call shapes already used by every other case in the same function. For review-amendment specifically, buildChainReport now looks up the first pending amendment's real id/path (reusing listAmendments + amendmentPath, already imported) and passes it through as a new internal-only field so the case can finally name a real artifact instead of an invented list command. docs/workflow.md's two amendment sections are rewritten to show the real mechanism instead.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Data model changes](#4-data-model-changes)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. Epic impact analysis

**Does not apply**: Standalone Story, first and only Story of this Epic; no prior BUILD to analyse.

## 2. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 3. Contract details

**Surface level:** internal

## 4. Data model changes

### 4.1 `NextActionInput (internal interface, src/workflow/chain.ts:312-318)` — field-add

Add `firstPendingAmendment: { readonly id: string; readonly path: string } | undefined`, computed in buildChainReport by filtering listAmendments(repoPath, epicHash) to status==='pending' (keeping listAmendments's existing deterministic AMD-<hash>-<n> order) and taking the first, mapped via amendmentPath(repoPath, id). ChainReport.amendments (the public counts-only field) and countAmendments() are both left exactly as they are -- this is an additional, separate input to computeNextAction, not a change to the existing one.

**Call sites:**
- `src/workflow/chain.ts:102-110`
- `src/workflow/chain.ts:265-273`
- `src/workflow/amendments/store.ts:240-255`
- `src/workflow/amendments/store.ts:62-64`

### 4.2 `NextAction (exported union, 'review-amendment' member, src/workflow/chain.ts:93)` — invariant-change

The TYPE shape of the 'review-amendment' member (`{ kind: 'review-amendment'; amendmentId: string; command: string }`) does not change. Only its runtime VALUE changes: amendmentId becomes the real AMD-<epicHash>-<n> id (or a fallback literal when, in a theoretically-impossible race, no pending row is found despite s.amendments.pending > 0) instead of the placeholder '<list via: ...>' string, and command becomes a real, runnable instruction naming insrc_present + insrc_workflow_approve instead of the dead 'insrc workflow amend ... --list' string.

**Call sites:**
- `src/workflow/chain.ts:382-388`

### 4.3 `docs/workflow.md's amendment sections (lines 298-311, 445-451)` — invariant-change

The documented CLI examples change from the invented `insrc workflow amend <h16> --list/--show/--approve/--reject` to the real mechanism: discovering a pending AMD-<epicHash>-<n> artifact, then insrc_present({documents:[path]}) followed by insrc_workflow_approve({artifactPath: path}). Surrounding prose describing the AMD lifecycle itself (pending/approved/rejected) is unchanged.

**Call sites:**
- `docs/workflow.md:298-311`
- `docs/workflow.md:445-451`

## 5. Error paths

**Error cases**

- **The pending amendment counted by countAmendments gets approved or rejected by a concurrent session between buildChainReport's countAmendments call and its new listAmendments-filtered-to-pending lookup, so amendments.pending > 0 but firstPendingAmendment comes back undefined.** (recoverable)
  - Detection: firstPendingAmendment is undefined while s.amendments.pending > 0 inside computeNextAction's review-amendment branch.
  - Response: Do not throw. Fall back to a safe, clearly-labelled placeholder command (e.g. naming the epicHash and instructing a re-check) rather than crashing buildChainReport or returning a stale/wrong amendmentId -- this is a report-generation helper, not a mutating action, so a graceful 'recompute' fallback is always safe.
  - User impact: The chain report shows a slightly less specific next-action for one report call; the next buildChainReport call (always re-read from disk, no caching) picks up the now-current amendment state correctly.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Multiple amendments are pending simultaneously under the same epicHash. | review-amendment names only the FIRST pending amendment in listAmendments's existing deterministic AMD-<hash>-<n> ascending order -- consistent with every other NextAction case that walks s.stories and returns on the FIRST match (e.g. the existing stale/missing-LLD loop at chain.ts:403-424). |
| No amendments exist at all for the epicHash (s.amendments.pending === 0). | The review-amendment branch is never entered; behavior is unchanged from today. |

**Invariants to preserve**

- computeNextAction stays a pure, synchronous function of its precomputed NextActionInput -- no filesystem I/O moves into the decision function itself; all data (including the new firstPendingAmendment) is precomputed by buildChainReport, matching every existing field (define/hld/stories/amendments/tracker). [[c2]]
- Every NextAction kind's command string that is ALREADY correct (run-define, run-hld, run-lld, push-tracker) is left byte-for-byte unchanged -- only the 7 identified dead-string sites are touched. [[c1]]
- ChainReport.amendments's public shape ({pending, approved, rejected} counts) and countAmendments()'s return type are both left completely unchanged. [[c2]]

## 6. Test strategy

**Test framework:** `node:test (via tsx), matching every existing test in src/workflow/__tests__/`

**Test levels**

- **unit** — Assert computeNextAction()/buildChainReport() return the real MCP call shape for every previously-dead NextAction kind, and that review-amendment names a real amendment id/path, while every unrelated kind's existing command string and every existing test's assertion (e.g. chain-issue-anchored.test.ts:225's `.command.includes('DEF.md')`) keeps passing unchanged.
  - Subjects: `src/workflow/chain.ts (computeNextAction, buildChainReport, NextActionInput)`
  - Fixtures: `src/workflow/__tests__/helpers/chain-fixtures.ts (existing fixture builder)`, `a pending AMD-<epicHash>-1 artifact written via the existing amendments/store.ts helpers for the review-amendment case`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/__tests__/chain.test.ts: approve-define/approve-hld/approve-lld return a command string of the form insrc_workflow_approve({artifactPath:"<real path>"}) that still includes the real artifact path (keeping chain-issue-anchored.test.ts:225's existing `.includes('DEF.md')` assertion passing)`, `src/workflow/__tests__/chain.test.ts: sync-tracker returns an insrc_workflow_step phase=start workflow=tracker.sync command naming the real epicHash` |
| `ac2` | `src/workflow/__tests__/chain.test.ts: with one pending AMD artifact present, review-amendment's amendmentId equals that artifact's real id and command names its real path via insrc_present + insrc_workflow_approve`, `src/workflow/__tests__/chain.test.ts: with two pending AMD artifacts present, review-amendment names the FIRST in AMD-<hash>-<n> ascending order` |
| `ac3` | `A new assertion (or manual inspection, since docs/workflow.md has no existing test harness) confirming docs/workflow.md's two amendment sections no longer contain the string 'insrc workflow amend'` |

## 7. Migration

**State before:** Per the s1 analyze bundles: 7 of computeNextAction()'s return sites (src/workflow/chain.ts, cited lines) emit an invented CLI string ('insrc workflow approve/amend/sync ...') as the NextAction's command/amendmentId; NextActionInput carries only count-based amendments data with no per-amendment identifier; docs/workflow.md's two amendment sections document the same invented CLI.

**State after:** The same 7 sites emit the real insrc_workflow_approve({artifactPath}) / insrc_workflow_step(phase='start', workflow='tracker.sync', ...) call shapes; NextActionInput additionally carries a precomputed firstPendingAmendment {id, path} (ChainReport.amendments's own public shape unchanged); docs/workflow.md's two sections show the real present+approve mechanism instead.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. In buildChainReport, compute firstPendingAmendment from listAmendments(repoPath, epicHash) filtered to status==='pending' (first in existing order), mapped via amendmentPath; add it to the NextActionInput object alongside the existing define/hld/stories/amendments/tracker fields. — ↩ rollbackable
2. In computeNextAction, replace the 6 approve-*/sync-tracker dead-string return sites with the real insrc_workflow_approve({artifactPath}) / insrc_workflow_step(...) call-shape strings, keeping each site's existing real path/epicHash embedded in the string (preserving existing test assertions like .command.includes('DEF.md')). — ↩ rollbackable
3. In computeNextAction's review-amendment branch, use the new firstPendingAmendment input (when present) to return the real amendmentId and a command naming insrc_present + insrc_workflow_approve with that real path; fall back to a non-throwing placeholder only in the error-paths race case. — ↩ rollbackable
4. Update docs/workflow.md's two amendment sections' code examples to the real mechanism, leaving the surrounding AMD-lifecycle prose unchanged. — ↩ rollbackable
5. Update/extend src/workflow/__tests__/chain.test.ts (and confirm chain-issue-anchored.test.ts's existing assertions still pass unmodified) to assert the new real command content for the 7 corrected sites. — ↩ rollbackable

**Backward compat:** No public API/type signature changes: NextAction's exported type shape is unchanged (only runtime string VALUES change for the 7 sites); NextActionInput is internal/unexported so its new field is not a breaking change for any external caller; ChainReport.amendments's public shape is completely untouched. No persisted data format changes -- this is pure in-memory report-generation + static doc content.

## 8. Alternatives considered

### 8.1 a1: Additive internal-only pending-amendment input — **CHOSEN**

buildChainReport derives the first pending amendment's real {id, path} via listAmendments and passes it to computeNextAction as a new field, without touching ChainReport.amendments's existing counts-only public shape.

Add a new field (e.g. `firstPendingAmendment: { id: string; path: string } | undefined`) to NextActionInput, computed in buildChainReport by filtering listAmendments(repoPath, epicHash) to status==='pending' and taking the first in its existing deterministic AMD-<hash>-<n> order, mapping to {id, path: amendmentPath(repoPath, id)}. review-amendment then returns the real amendmentId and a command string naming the real present+approve mechanism. computeNextAction stays a pure function of precomputed inputs, matching every other NextActionInput field (define/hld/stories/amendments/tracker are all already precomputed this way) -- no I/O moves into the decision function.

### 8.2 a2: Expand ChainReport.amendments's public shape to carry pending identifiers

Change ChainReport.amendments from {pending,approved,rejected} counts to also include a `pendingList: {id,path}[]` array, surfacing it as part of the report's own public contract rather than as an internal-only input.

Widen the ChainReport.amendments type and countAmendments's return value to also carry the pending rows' real ids/paths (not just counts), then have computeNextAction read from that same field instead of a separate internal-only one.

**Rejected because:** Achieves the same functional result as a1 but widens ChainReport.amendments's public, already-consumed shape for a need only computeNextAction has today, forcing unnecessary test churn.

### 8.3 a3: No data-flow change; generic rediscovery instruction

Leave ChainReport.amendments and computeNextAction's inputs exactly as they are; review-amendment's command names only the real approval mechanism in the abstract, without a specific amendment id.

Replace the dead 'insrc workflow amend ... --list' string with a generic instruction such as 'present each pending AMD-<epicHash>-* artifact under .insrc/artifacts, then insrc_workflow_approve({artifactPath})', with amendmentId left as a placeholder note rather than a real id -- zero changes to NextActionInput or ChainReport.amendments.

**Rejected because:** Cheapest, but leaves review-amendment unable to name a real artifact -- the actual defect the ISSUE's rootCause identified remains unfixed.

## 9. References

- **[[c1]]** `code` `src/workflow/chain.ts:85-95`
- **[[c2]]** `code` `src/workflow/chain.ts:320-442`
- **[[c3]]** `code` `src/workflow/chain.ts:67-71`
- **[[c4]]** `code` `src/workflow/chain.ts:265-273`
- **[[c5]]** `code` `src/workflow/chain.ts:312-318`
- **[[c6]]** `code` `src/workflow/amendments/store.ts:240-255`
- **[[c7]]** `code` `src/workflow/amendments/store.ts:62-64`
- **[[c8]]** `code` `src/workflow/chain.ts:26`
- **[[c9]]** `code` `src/cli/command.ts:166-298`
- **[[c10]]** `code` `src/workflow/chain.ts:430`
- **[[c11]]** `doc` `docs/workflow.md:298-311`
- **[[c12]]** `doc` `docs/workflow.md:445-451`
- **[[c13]]** `code` `src/workflow/chain.ts:403-424`
- **[[c14]]** `code` `src/workflow/__tests__/chain-issue-anchored.test.ts:225`
