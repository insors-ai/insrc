<!-- insrc:artifact LLD-9c2482c594fd8df5-s1 -->

# LLD: STORY-9c2482c594fd8df5-s1 — Exclude the live store from directory searches

## Summary

**Epic:** `exclude-live-store-from-directory-searches`
**HLD base run:** `wf-1795160392350-y0gcd5`
**HLD effective hash:** `bf8e1e95dccc...`

Prevent shared grep from opening the live graph data or lock file, including directory and symbolic-link root aliases. Refuse direct protected roots; route roots containing a protected descendant to the existing guarded Node walker, and retain explicitly non-following, config-independent ripgrep for other roots. Preserve public result shapes and report actual backend and exclusion semantics.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Error paths](#3-error-paths)
4. [Test strategy](#4-test-strategy)
5. [Migration](#5-migration)
6. [Alternatives considered](#6-alternatives-considered)
7. [References](#7-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `runGrepSearch`

```typescript
runGrepSearch(opts: GrepSearchOptions): Promise<SearchGrepData>
```

**Parameters:**
- `opts: GrepSearchOptions` — Existing search options and test backend seams; no new public option.

**Returns:** `Promise<SearchGrepData>` — Allowed matches, actual usedRipgrep flag, real truncation and explicit omissions.

**Errors:**
- `LiveStoreFileRefusedError` when Root resolves to the current live data or lock path.
- `GrepIncompleteError` when Complete search times out or an admitted ripgrep process fails; retain existing partial-hit semantics.
- `Error` when Invalid pattern or unreadable/missing root, retaining existing behavior.

**Preconditions:**
- Reuse symlink-aware canonical store-path resolution; compare containment using path components, never a string-prefix-only test.
- Check both data and lock paths: either may resolve independently through symlinks.

**Postconditions:**
- Admission order: root refusal → canonical ancestry decision → backend selection → content reads → result; filtering returned hits is insufficient.
- Any root containing a protected path selects Node before rg spawn. Node reuses isLiveStoreFile immediately before each candidate content read.
- Other roots may use ripgrep with --no-config and --no-follow, preventing environment config from enabling alias traversal; explicit protected file roots were already refused.
- Bounded and complete modes share the same root guard. No timeout/exit failure is recast as a complete success.
- Tool and analyzer are many callers → one shared grep entry → one selected backend per search. Search owns any rg child; store module retains identity-policy ownership. No new storage entities, ownership transfer, IPC payload or UI change. This conditional call flow is fully specified in prose; no ERD or companion visual is needed.

## 3. Error paths

**Error cases**

- **Protected data or lock passed directly or through a symlink.** (recoverable)
  - Detection: Existing symlink-aware refusal before backend admission.
  - Response: Typed refusal and existing failed ToolResult wrapper; never spawn rg or read contents.
  - User impact: Explicit refusal remains visible.
- **Protected file below ordinary or directory-alias root.** (recoverable)
  - Detection: Canonical component-wise ancestry of either protected target, then per-file identity checks in Node.
  - Response: Omit protected contents before read; report Node backend and live-store exclusion rule.
  - User impact: Allowed matches still returned; no invented unreadable error for deliberate policy omission.
- **Complete-mode backend fails/times out or Node root is unreadable.** (recoverable)
  - Detection: Existing process/clock/error handling.
  - Response: Preserve GrepIncompleteError with allowed partial hits or existing root error; no success from incomplete run.
  - User impact: Truthful failure, retained evidence.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Root is a symlink or has a symlinked ancestor to the store directory. | Canonical ancestry forces guarded Node; no store/lock content reads. |
| Data path and lock path resolve separately; either is below root. | Check both targets, not just data parent. |
| Allowed directory shares a string prefix with protected directory, or contains files named graph.lmdb/graph.lmdb-lock. | Component-safe containment does not overexclude. Lookalikes remain searchable. |
| Ambient ripgrep config asks to follow symlinks or ignore safety globs. | Explicit --no-config and --no-follow maintain non-follow traversal. |
| Node regular-file root outside store. | Preserve existing root error semantics in this batch; tests must not silently broaden fallback file-root behavior. |
| Concurrent hostile filesystem replacement/hard links. | No new race-free or inode-based access policy claim; retain existing resolved-path semantics. Do not silently expand scope. |

**Invariants to preserve**

- Only store owner opens current live data and lock; returning no hits after reading them is insufficient. [[c1]]
- Preserve options/result/IPC shapes, allowed matches, bounded limits and explicit complete-mode failures. [[c2]]
- Do not modify other file tools, registry, native lifecycle policy or release qualification. [[c3]]

## 4. Test strategy

**Test framework:** `node:test with tsx on supported Node22, serial focused files under the owned harness. Typecheck/build once; do not overlap sweeps. Record baseline run 0e08a40d-5df6-4a56-94e5-99fa223b5b73: 15 pass/2 fail, no skips/cancels, including the known store leak and a distinct fake-rg 300ms startup/timing failure. Test protected read absence with instrumentation, not merely absent output. Do not raise production deadlines or blanket-skip.`

**Test levels**

- **integration** — Prove exclusion occurs before content reads and aliases cannot bypass root admission.
  - Subjects: `Protected direct roots refuse before backend or content access`, `Store ancestor and directory aliases use guarded Node in bounded and complete modes`, `Allowed roots retain real ripgrep without ambient configuration or symlink following`
  - Fixtures: `Existing temporary HOME fixture imported after environment isolation; never use actual daemon files.`, `Data/lock canaries plus allowed matches and same-name lookalikes.`, `Backend sentinel that records spawn, content-read instrumentation in an isolated process, real rg and forced missing rg.`
- **contract** — Preserve positive matches and truthful error/omission accounting.
  - Subjects: `Grep result shapes and Node/ripgrep omission rules remain truthful`, `Complete-mode failure preserves allowed partial hits`
  - Fixtures: `Existing grep-core and grep-omitted tests; preserve assertions and document baseline timing failure separately.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Protected direct roots refuse before backend or content access` |
| `ac2` | `Store ancestor and directory aliases use guarded Node in bounded and complete modes` |
| `ac3` | `Allowed roots retain real ripgrep without ambient configuration or symlink following`, `Grep result shapes and Node/ripgrep omission rules remain truthful` |
| `ac4` | `Complete-mode failure preserves allowed partial hits` |

## 5. Migration

**State before:** Direct roots refuse; Node descendants guard; directory ripgrep can read live data/lock. Existing fixture observes canary hits.

**State after:** Store-containing roots use guarded Node before any rg spawn; ordinary roots retain explicitly non-following rg. No persisted data or public schema change.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Implement approved shared admission guard and focused tests; retain current store identity policy. — ↩ rollbackable
2. Run isolated source/compiled where relevant checks and typecheck, record complete counts and remaining baseline failures. — ↩ rollbackable
3. Obtain BUILD approval before completion; install/restart only under separately authorized deployment work. — ↩ rollbackable

**Backward compat:** Public options, return shape, tool IDs and analyzer API unchanged. Affected store-ancestor searches deliberately report usedRipgrep=false and Node exclusion semantics; this is visible and documented. Rolling back restores the leak and is not an acceptable production fallback.

## 6. Alternatives considered

### 6.1 a1: Guard backend admission using canonical store ancestry — **CHOSEN**

Use existing per-file Node enforcement when a root can contain the store; retain ripgrep for other roots.

Keep public GrepSearchOptions/SearchGrepData unchanged. Resolve root and both protected paths through the existing store path resolver. Direct protected roots refuse; directory roots containing either protected path use Node scanning with the existing identity predicate before content reads. Ripgrep elsewhere is explicitly non-following and ignores ambient config. Report actual backend and exclusions.

### 6.2 a2: Enumerate vetted paths for ripgrep

Build an allowed file manifest before any content search.

Enumerate candidates using each backend's ignore semantics, validate each canonical path against protected store identity, then supply allowed paths in bounded batches to ripgrep or Node while preserving aggregate limits, errors and completeness.

**Rejected because:** Feasible but adds complexity beyond current defect.

### 6.3 a3: Post-filter ripgrep matches

Remove protected paths from returned matches after search.

Leave backend reads unchanged and apply isLiveStoreFile to parsed matches before publishing SearchGrepData.

**Rejected because:** Hiding matches cannot undo unsafe store descriptor access.

## 7. References

- **[[c1]]** `code` `src/db/graph/store.ts:401` — "isLiveStoreFile compares resolved paths of current live data and lock."
- **[[c2]]** `code` `src/daemon/tools/builtins/search/grep.ts` — "Shared bounded/complete rg and Node search; Node contains a per-file isLiveStoreFile guard."
- **[[c3]]** `prior-artifact` `docs/standalone/exclude-live-store-from-directory-searches-E202611209c2482c5/ISSUE.md`
- **[[c4]]** `code` `src/daemon/tools/builtins/file/__tests__/live-store-file-refusal.test.ts`
- **[[c5]]** `analyze-bundle` `s1.analyzeBundles[0]`
