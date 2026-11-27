<!-- insrc:artifact LLD-9c95950064e4b916-s1 -->

# LLD: STORY-9c95950064e4b916-s1

## Summary

**Epic:** `insrc-present-cannot-show-tracked-epic`
**HLD base run:** `wf-1795776322035-75xiwb`
**HLD effective hash:** `3a4bff303fb3...`

insrc_present currently refuses to open a document unless the daemon's pending-approval list includes it, and that list is also gated by a code-review-readiness rule that can never be satisfied while review is disabled -- so a perfectly normal, not-yet-decided artifact (like a tracked-epic Story's BUILD record) can never be shown. This Story adds a small, separate lookup the chat's present/approve flow uses instead: it answers only 'does this name resolve to exactly one real artifact record', regardless of that artifact's lifecycle status, leaving the existing pending-approval list (and the IDE plugins' review panel that also depends on it) completely unchanged.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. Epic impact analysis

**Does not apply**: Standalone bugfix Story with no prior Story of this Epic; there is nothing already built to analyse.

## 2. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 3. Contract details

**Surface level:** internal

### 3.1 `resolveOpenableArtifacts`

```typescript
resolveOpenableArtifacts(repoPath: string): readonly { readonly artifactId: string; readonly mdPath: string }[]
```

**Parameters:**
- `repoPath: string` — Absolute repo path whose .insrc/artifacts directory is scanned.

**Returns:** `readonly { readonly artifactId: string; readonly mdPath: string }[]` — One entry per PENDING_KINDS artifact file on disk, regardless of lifecycle status or the BUILD/CR-sibling precondition -- artifactId (filename minus .json) and mdPath (via the existing, status-independent deriveMdPath).

**Preconditions:**
- repoPath is a registered repo

**Postconditions:**
- Every PENDING_KINDS artifact file under .insrc/artifacts is represented exactly once, independent of its approvalStateOf result and independent of whether a sibling CR-*.json exists
- A malformed artifact file is skipped (logged), matching listPendingArtifacts' existing one-bad-file-must-not-drop-the-rest behavior

### 3.2 `deriveMdPath`

```typescript
deriveMdPath(repoPath: string, kind: ArtifactKind, meta: Readonly<Record<string, unknown>>): string
```

**Parameters:**
- `repoPath: string` — Repo root.
- `kind: ArtifactKind` — The artifact's kind prefix.
- `meta: Readonly<Record<string, unknown>>` — The artifact's own meta block, used to derive its slug/anchor.

**Returns:** `string` — The artifact's rendered .md path, status-independent.

**Postconditions:**
- Unchanged existing behavior -- resolveOpenableArtifacts reuses it as-is, no modification

### 3.3 `handleInsrcPresent`

```typescript
handleInsrcPresent(args: InsrcPresentArgs, deps: InsrcPresentDeps = {}): Promise<{ content: { type: 'text'; text: string }[]; isError?: boolean }>
```

**Parameters:**
- `args: InsrcPresentArgs` — The declared document names (artifact ids or paths).
- `deps: InsrcPresentDeps` _(optional)_ — Test seams for the pending-list call and repo resolver.

**Returns:** `Promise<{ content: ...; isError?: boolean }>` — Unchanged external response shape: { presented: string[], notPending: string[] } as the text payload.

**Postconditions:**
- The openable set it filters names against now comes from resolveOpenableArtifacts instead of pending.artifacts (listPendingArtifacts via pendingWorkflow); namesPending's matching logic is reused unchanged since it only needs {artifactId, mdPath}
- External request/response shape of the insrc_present MCP tool is unchanged -- only the internal data source for openability changes

## 4. Error paths

**Error cases**

- **A declared name does not resolve to any artifact file at all (misspelled id or path).** (recoverable)
  - Detection: resolveOpenableArtifacts' scan over .insrc/artifacts finds no PENDING_KINDS file whose artifactId or mdPath matches the declared name.
  - Response: handleInsrcPresent places the name in notPending, exactly as today for an unmatched name -- no behavior change for this case.
  - User impact: The caller sees notPending and must correct the name before presenting again.
- **A bare filename (e.g. a plain 'PLAN.md') matches more than one artifact across different Stories.** (recoverable)
  - Detection: namesPending's filter over resolveOpenableArtifacts' output returns more than one match for the same declared name.
  - Response: The ambiguous name is reported as notPending, not guessed at -- the existing ambiguity rule in handleInsrcPresent is unchanged, now evaluated over the broader (status-independent) candidate set.
  - User impact: Caller must disambiguate with a more specific path or the artifact id.
- **A malformed artifact JSON file exists under .insrc/artifacts (corrupted or partially written).** (recoverable)
  - Detection: JSON.parse throws while resolveOpenableArtifacts scans that file.
  - Response: The malformed file is skipped and logged, matching listPendingArtifacts' existing one-bad-file-must-not-drop-the-rest behavior; the scan continues over the remaining files.
  - User impact: That one malformed artifact cannot be presented, but every other declared name still resolves correctly.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| An artifact kind outside PENDING_KINDS (e.g. a STUB or an EPIC/STORY/TASK record). | Not included in resolveOpenableArtifacts' output -- insrc_present never presents a non-reviewable kind, matching today's scope exactly. |
| An artifact whose lifecycle status is already 'approved' or 'rejected'. | Now included in resolveOpenableArtifacts' output (unlike listPendingArtifacts); insrc_present reports it as presented if its name resolves uniquely. Re-approving it is still governed separately by insrc_workflow_approve's own lifecycle checks, so presenting a decided artifact carries no approval risk. |
| A tracked-epic BUILD record with no CR-*.json sibling (the reported defect's exact case). | Now included in resolveOpenableArtifacts' output -- the CR-sibling precondition is not reapplied; insrc_present reports it as presented. |

**Invariants to preserve**

- A malformed artifact file must not drop the rest of the scan: one bad file is skipped and logged, not a thrown error that fails the whole lookup. [[c1]]
- A declared name matching more than one document stays ambiguous and is reported notPending rather than guessed at. [[c2]]

## 5. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — Prove resolveOpenableArtifacts returns every PENDING_KINDS artifact file regardless of lifecycle status, and regardless of the BUILD/CR-sibling precondition, while still skipping non-PENDING_KINDS files and malformed JSON.
  - Subjects: `resolveOpenableArtifacts returns a draft (never-decided) artifact`, `resolveOpenableArtifacts returns an approved artifact`, `resolveOpenableArtifacts returns a rejected artifact`, `resolveOpenableArtifacts returns a non-standalone BUILD with no CR sibling`, `resolveOpenableArtifacts excludes a non-PENDING_KINDS file (e.g. an EPIC/STORY/TASK record)`, `resolveOpenableArtifacts skips a malformed JSON file without dropping the rest of the scan`
  - Fixtures: `temp repo with .insrc/artifacts containing one artifact per PENDING_KINDS member at draft/approved/rejected status`, `a non-standalone BUILD file with no CR sibling`, `a non-PENDING_KINDS file (e.g. EPIC-<hash>.json)`, `a malformed (non-JSON) artifact file`
- **unit** — Prove handleInsrcPresent now presents a name that listPendingArtifacts would have excluded, while preserving the existing ambiguous-name and unmatched-name behavior.
  - Subjects: `handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect's exact case)`, `handleInsrcPresent presents the same BUILD by its repo-relative doc path`, `handleInsrcPresent presents an already-approved artifact by name`, `handleInsrcPresent reports notPending for a name matching zero artifacts`, `handleInsrcPresent reports notPending for a bare filename matching more than one document (ambiguity preserved)`, `handleInsrcPresent's external response shape stays { presented: string[], notPending: string[] }`
  - Fixtures: `same temp repo fixtures as the resolveOpenableArtifacts unit tests, exercised through handleInsrcPresent's existing test seams (InsrcPresentDeps)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `handleInsrcPresent presents a tracked-epic BUILD by artifact id with no CR sibling (the reported defect's exact case)`, `handleInsrcPresent presents the same BUILD by its repo-relative doc path` |
| `ac2` | `resolveOpenableArtifacts returns a draft (never-decided) artifact`, `resolveOpenableArtifacts returns an approved artifact`, `resolveOpenableArtifacts returns a rejected artifact`, `resolveOpenableArtifacts returns a non-standalone BUILD with no CR sibling`, `resolveOpenableArtifacts excludes a non-PENDING_KINDS file (e.g. an EPIC/STORY/TASK record)` |
| `ac3` | `handleInsrcPresent reports notPending for a name matching zero artifacts`, `handleInsrcPresent reports notPending for a bare filename matching more than one document (ambiguity preserved)`, `resolveOpenableArtifacts skips a malformed JSON file without dropping the rest of the scan` |

## 6. Migration

**State before:** handleInsrcPresent (src/mcp/server.ts:1105-1140) derives its entire openable set from pending.artifacts, sourced from listPendingArtifacts (src/workflow/pending.ts:116-157), which excludes any non-standalone BUILD lacking a CR-*.json sibling (pending.ts:152) and any artifact whose lifecycle state is not 'pending' (pending.ts:143).

**State after:** handleInsrcPresent derives its openable set from a new function, resolveOpenableArtifacts, that enumerates every PENDING_KINDS artifact file regardless of lifecycle status or CR-sibling existence; listPendingArtifacts, handleWorkflowPending and the workflow.pending IPC method are unchanged, so the IDE plugins' review panel's behavior is identical before and after.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the new resolveOpenableArtifacts function to src/workflow/pending.ts, reusing the existing file-scan shape and the already-exported deriveMdPath for path derivation, with no lifecycle-state or CR-sibling filter. — ↩ rollbackable
2. Change handleInsrcPresent in src/mcp/server.ts to read its openable set from resolveOpenableArtifacts instead of pending.artifacts (pendingWorkflow/listPendingArtifacts), keeping namesPending and the ambiguity rule unchanged. — ↩ rollbackable
3. Update/extend tests covering handleInsrcPresent and the new resolveOpenableArtifacts per the test strategy. — ↩ rollbackable

**Backward compat:** insrc_present's external MCP request/response shape ({ documents } in, { presented, notPending } out) is unchanged. No caller of listPendingArtifacts/workflow.pending/the IDE panel is touched, so that consumer's behavior is byte-for-byte unchanged. The only observable behavior change is that insrc_present now also presents artifacts it previously refused (already-approved/rejected artifacts, and a tracked-epic BUILD with no CR sibling) -- a strict widening, not a narrowing, so no existing caller that depended on a name being presented can regress.

## 7. Alternatives considered

### 7.1 a1: New minimal status-independent resolver, exported from pending.ts — **CHOSEN**

Add a new, separate exported function in pending.ts that scans the same PENDING_KINDS artifact files but skips the lifecycle-state and CR-sibling filters, returning only {artifactId, mdPath} pairs; handleInsrcPresent uses it instead of listPendingArtifacts/pending.artifacts.

Reuse the existing file-scan loop shape and deriveMdPath (already exported, status-independent) to build a minimal descriptor {artifactId, mdPath} for every PENDING_KINDS artifact file on disk, with NO lifecycle-state check and NO BUILD/CR-sibling check. Export it from pending.ts as its own function, name TBD at contract.detail. handleInsrcPresent (server.ts:1105-1140) calls this new function as its sole source for the openable set, dropping its dependency on pending.artifacts entirely; namesPending's matching logic (server.ts:1098-1101) is unchanged since it only needs artifactId+mdPath. listPendingArtifacts itself, the workflow.pending IPC method, and the IDE plugins' review panel are completely untouched -- their 'awaiting a decision' semantics stay intact. The minimal {artifactId, mdPath} shape matches exactly what insrc_present's own response needs (it returns only presented[]/notPending[] string buckets, never title/kind/state), so no richer descriptor is needed.

### 7.2 a2: Widen listPendingArtifacts with an opt-out flag

Add an optional parameter to listPendingArtifacts itself (e.g. an 'includeAllStatuses' flag) that skips the state/CR-sibling checks when set, and have handleInsrcPresent pass it while the IDE panel's call path keeps the default.

Change listPendingArtifacts's signature to accept an options object with an opt-in flag; when set, the loop body skips both the approvalStateOf check and the BUILD/CR-sibling check, returning every PENDING_KINDS artifact regardless of status. handleWorkflowPending (and therefore workflow.pending/the IDE panel) keeps calling it with the flag unset (default pending-only behavior unchanged); handleInsrcPresent's caller of pendingWorkflow would need its own new code path that calls listPendingArtifacts directly with the flag set, bypassing pendingWorkflow/workflow.pending IPC (since that IPC method has no reason to ever return all-statuses to the IDE panel).

**Rejected because:** A boolean flag threaded through the same shared function listPendingArtifacts is a narrower, riskier form of decoupling than a separate function: a future caller could pass the wrong flag value and silently regress either consumer, and reusing toDescriptor's PendingArtifact shape would carry a state: 'pending' literal that lies about a non-pending artifact's real status.

### 7.3 a3: Inline ad hoc resolution in server.ts, no shared helper

Duplicate a minimal file-scan + path-derivation directly inside server.ts's handleInsrcPresent, without touching pending.ts at all.

handleInsrcPresent reads .insrc/artifacts directly, re-implementing enough of the kind-prefix parsing and path derivation to answer 'does this name match exactly one artifact file' without importing anything new from pending.ts.

**Rejected because:** Duplicates scan/path-derivation logic pending.ts's own module doc already calls the single source of truth for this concern, at higher cost (M) than a1 (S) for an inferior outcome, with a real drift risk as the artifact-id/path scheme evolves.

## 8. References

- **[[c1]]** `code` `src/workflow/pending.ts:116-157` — "if (kind === 'BUILD' && meta['standalone'] !== true && !names.has(`CR${file.slice('BUILD'.length)}`)) continue;"
- **[[c2]]** `code` `src/mcp/server.ts:1105-1140` — "const pending = await pendingWorkflow({ repo }, deps); ... const openable = pending.artifacts; ... const presented = names.filter((n) => openable.filter((a) => namesPending(n, a)).length === 1);"
- **[[c3]]** `code` `src/workflow/pending.ts:246-262`
- **[[c4]]** `code` `src/workflow/path-scheme.ts:186-198`
- **[[c5]]** `code` `src/workflow/pending.ts:159-183`
- **[[c6]]** `code` `src/mcp/server.ts:1098-1101`
- **[[c7]]** `code` `src/workflow/pending.ts:74-88`
- **[[c8]]** `code` `src/workflow/storage.ts:900-1120`

## 9. Open questions

- cd1 (partial): resolveOpenableArtifacts is a genuinely new function (not grounded in s1's analyze bundle, since it doesn't exist yet) -- disclosed as new throughout, never claimed to pre-exist.
- ep3 (partial): invariantsToPreserve cites c1/c2, now defined in this artifact's own citations[] against the real paths pending.ts:116-157/159-183 and server.ts:1105-1140 respectively.
- ts2 (partial): testFramework 'node:test' reflects this session's direct, already-verified knowledge of this codebase's test convention rather than an explicit s1 test.locate/convention.detect lookup output.
