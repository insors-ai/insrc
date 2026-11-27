<!-- insrc:artifact LLD-9c95950064e4b916-s1 -->

# LLD: STORY-9c95950064e4b916-s1 — insrc_present cannot show a tracked-epic artifact when code review is unavailable

## Summary

**Epic:** `insrc-present-cannot-show-tracked-epic`
**HLD base run:** `wf-1795791735075-nr6b7e`
**HLD effective hash:** `0ace2ee99a7e...`

Corrects three gaps a manual code review found in the already-built fix: the VS Code chat extension's own copy of the presentability check still reads the old pending-only list, so the MCP tool can report a document as presented while the editor pane still refuses to open it; the new daemon-side scanner (resolveOpenableArtifacts) derives a BUILD or AMD record's document path without the existing safety checks that keep a dead or wrong path out of the list; and the registered insrc_present tool description still describes the old, lifecycle-gated behavior. This correction wires the VS Code client to the same openable list the daemon already serves, extracts the existing per-kind path rules into one shared helper so both scanners use them, and updates the tool description's wording.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. Epic impact analysis

**Does not apply**: Standalone, ISSUE-anchored bugfix Story with no sibling Stories; this is a correction round on this same Story's own already-approved LLD/PLAN/BUILD, not a later Story of a multi-Story Epic.

## 2. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 3. Contract details

**Surface level:** internal

### 3.1 `openableDocuments`

```typescript
openableDocuments(): Promise<Array<{ readonly id: string; readonly mdPath: string }>>
```

**Returns:** `Promise<Array<{ id: string; mdPath: string }>>` — Every PENDING_KINDS artifact the daemon's workflow.openable answers, regardless of lifecycle status -- the client-side twin of resolveOpenableArtifacts, added to DocsReviewClient (vscode-plugin/src/chat/docs-review-client.ts) beside the existing pendingDocuments().

**Errors:**
- `Error` when the daemon is unreachable or answers a structured { error } -- propagated exactly as pendingDocuments() already propagates workflow.pending's failures.

**Preconditions:**
- A repo path is resolvable (the same repo() option pendingDocuments() already uses).

**Postconditions:**
- Resolves to the daemon's workflow.openable artifacts unchanged; makes no daemon write call.

### 3.2 `mdPathForKind`

```typescript
function mdPathForKind(repoPath: string, kind: PendingKind, artifactId: string, meta: Readonly<Record<string, unknown>>): string
```

**Parameters:**
- `repoPath: string` — The repo root to resolve the document path inside.
- `kind: PendingKind` — Which artifact kind's path rule to apply.
- `artifactId: string` — The exact artifact id a BUILD.md's marker comment must carry for that file to count as this record's document.
- `meta: Readonly<Record<string, unknown>>` — The artifact's meta, passed through to deriveMdPath.

**Returns:** `string` — '' for AMD; buildRecordMdPath's existence+marker-checked result for BUILD; deriveMdPath's result for every other kind. Extracted from toDescriptor's existing inline branching so toDescriptor and resolveOpenableArtifacts share one definition.

**Postconditions:**
- toDescriptor and resolveOpenableArtifacts both call this instead of each deciding the per-kind rule inline.

### 3.3 `resolveOpenableArtifacts`

```typescript
function resolveOpenableArtifacts(repoPath: string): readonly OpenableArtifact[]
```

**Parameters:**
- `repoPath: string` — The repo to scan .insrc/artifacts under.

**Returns:** `readonly OpenableArtifact[]` — Reshaped only internally: mdPath now comes from mdPathForKind(repoPath, kind, artifactId, art.meta) instead of a direct deriveMdPath call, so a BUILD entry's path is '' unless the file exists and carries this record's marker, and an AMD entry's path is always ''.

**Postconditions:**
- Every returned BUILD path is file-existence- and marker-verified; every returned AMD path is ''; every other kind is unchanged.

### 3.4 `toDescriptor`

```typescript
function toDescriptor(repoPath: string, file: string, kind: PendingKind, art: ArtifactShape): PendingArtifact
```

**Parameters:**
- `repoPath: string` — The repo the artifact file lives in.
- `file: string` — The artifact's filename.
- `kind: PendingKind` — The artifact's kind.
- `art: ArtifactShape` — The parsed artifact JSON.

**Returns:** `PendingArtifact` — Unchanged descriptor shape; its mdPath field now comes from the shared mdPathForKind instead of an inline ternary -- same values, same behavior, single source.

**Postconditions:**
- listPendingArtifacts' own tests (pending/approved/rejected filtering, the BUILD/CR-sibling gate) keep passing unmodified: this is a pure refactor of toDescriptor's path derivation, not a behavior change.

## 4. Error paths

**Error cases**

- **openableDocuments() daemon round-trip fails (unreachable daemon or a structured { error } from workflow.openable)** (recoverable)
  - Detection: The same IpcClient rejection / structured-error path pendingDocuments() already uses for workflow.pending -- no new detection logic.
  - Response: Propagated as a thrown Error, exactly as pendingDocuments() propagates a workflow.pending failure today; review-presenter's existing catch in read() sets outcome.unreadable = true and logs a warning.
  - User impact: The turn's declared documents are reported unreadable and nothing opens -- identical to today's failure mode for pendingDocuments(), just reached via a different method name.
- **mdPathForKind is asked for a BUILD record whose BUILD.md is missing, or exists but does not carry THIS record's exact artifact marker** (recoverable)
  - Detection: buildRecordMdPath's existing existsSync check and `<!-- insrc:artifact <id> -->` substring check, now reached through mdPathForKind instead of toDescriptor's inline call.
  - Response: Returns '' (document-less); the record is still openable by artifact id.
  - User impact: No change from today's listPendingArtifacts behavior for the same BUILD record -- resolveOpenableArtifacts now matches it exactly instead of returning a dead or wrong path.
- **mdPathForKind is asked for an AMD record** (recoverable)
  - Detection: An explicit kind === 'AMD' branch, unconditional -- no file-system check at all (an amendment is JSON-only).
  - Response: Returns '' always.
  - User impact: The amendment is openable by artifact id, exactly as listPendingArtifacts already presents it; resolveOpenableArtifacts stops fabricating a nonexistent AMD.md path.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A repo with zero PENDING_KINDS artifact files. | openableDocuments() and resolveOpenableArtifacts both return []; review-presenter reports every declared name as notPending -- unchanged from today's behavior for an empty/absent store. |
| A BUILD.md on disk whose marker comment names a DIFFERENT artifactId than the record being resolved (a stale or superseded file). | mdPathForKind returns '' for this record, never the other record's path -- the marker check is exact-match, not existence-only. |
| The JetBrains plugin's own review panel, reading the SAME repo at the same time via its own daemon IPC call to workflow.pending. | Fully unaffected: it is a different client, a different call, and this Story does not touch it or listPendingArtifacts. |

**Invariants to preserve**

- createReviewPresenter's only production wiring point is extension.ts's activate() (lines 104-1090, wiring at 730-734); openableDocuments must be wired at that exact call site with no other caller introduced, since the analyze bundle and a direct grep both found no second VS Code consumer of the pending/openable list. [[c1]]
- toDescriptor's BUILD path is '' unless the derived BUILD.md exists AND its head carries this record's exact `<!-- insrc:artifact <id> -->` marker (buildRecordMdPath, pending.ts:259-276); mdPathForKind must preserve this check exactly, not approximate it with an existence-only test. [[c2]]
- toDescriptor's AMD path is always '' (pending.ts:238-240) because an amendment is a JSON record with no rendered document; mdPathForKind must preserve this unconditional empty-path rule exactly. [[c2]]
- The registered insrc_present tool description (server.ts:870-895) must state that presentation is independent of lifecycle status, matching handleInsrcPresent's actual openableWorkflow-backed behavior: an already-approved or already-rejected artifact is presented, not notPending. [[c3]]

## 5. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — Prove openableDocuments() forwards to workflow.openable (not workflow.pending) and propagates a daemon failure exactly like pendingDocuments() does.
  - Subjects: `DocsReviewClient.openableDocuments`
  - Fixtures: `a fake daemon/IpcClient stand-in recording the method name it was called with, mirroring the existing pendingDocuments() test fixture`
- **unit** — Prove review-presenter's declared() auto-open path is now driven by the openable list, so an approved/rejected document is opened, not refused.
  - Subjects: `review-presenter.ts declared() via createReviewPresenter`
  - Fixtures: `the existing kit() fixture in review-presenter.test.ts, fed an openable-shaped PendingDocument list including an entry that would have been excluded under the old pending-only semantics`
- **unit** — Prove mdPathForKind reproduces toDescriptor's exact existing per-kind rules: BUILD file-existence + marker check, AMD unconditional empty string, every other kind via deriveMdPath unchanged.
  - Subjects: `mdPathForKind`, `toDescriptor (regression: unchanged output)`
  - Fixtures: `the existing pending.test.ts fixtureRepo() helper; a BUILD.md with a matching marker, one missing, one with a mismatched marker; an AMD record`
- **unit** — Prove resolveOpenableArtifacts now returns '' for a missing/mismatched BUILD.md and for every AMD record, closing the gap the manual review found.
  - Subjects: `resolveOpenableArtifacts`
  - Fixtures: `the same fixtureRepo() fixtures as the mdPathForKind tests`
- **integration** — Confirm the registered insrc_present tool description text states presentation is lifecycle-status-independent and no longer claims an approved artifact is notPending.
  - Subjects: `insrc_present tool registration description (server.ts)`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `DocsReviewClient.openableDocuments calls the daemon's 'workflow.openable' method, not 'workflow.pending'`, `review-presenter declared() opens a document that is approved/rejected/has no CR sibling when its source list is openable-shaped, where the old pending-only fixture would have refused it` |
| `ac2` | `mdPathForKind returns '' for a BUILD record whose BUILD.md is missing`, `mdPathForKind returns '' for a BUILD record whose BUILD.md exists but carries a different record's marker`, `mdPathForKind returns the derived path for a BUILD record whose BUILD.md exists and carries its own marker`, `mdPathForKind returns '' for every AMD record, unconditionally`, `resolveOpenableArtifacts returns '' for a BUILD record with no matching BUILD.md`, `resolveOpenableArtifacts returns '' for an AMD record`, `toDescriptor's existing listPendingArtifacts tests still pass unmodified after the mdPathForKind extraction` |
| `ac3` | `the registered insrc_present description no longer contains the phrase 'pending approval and openable' or lists an approved artifact under notPending's examples, and instead states presentation is independent of lifecycle status` |

## 6. Migration

**State before:** Per c1: vscode-plugin's DocsReviewClient.pendingDocuments() calls workflow.pending, and extension.ts:730-734 wires it as review-presenter.ts's sole pendingDocuments dependency, so the VS Code chat's auto-open flow still applies the pending-only/BUILD-CR-sibling gate the daemon side of this Story already removed for the MCP tool. Per c2: resolveOpenableArtifacts calls deriveMdPath uniformly, bypassing toDescriptor's existing buildRecordMdPath existence/marker check and AMD empty-path sentinel. Per c3: server.ts's registered insrc_present description still states the pre-fix, lifecycle-gated semantics.

**State after:** DocsReviewClient gains openableDocuments() (calls workflow.openable); extension.ts:732 wires review-presenter's pendingDocuments dependency to it instead of pendingDocuments(). pending.ts gains a shared mdPathForKind helper carrying toDescriptor's exact BUILD/AMD rules; both toDescriptor and resolveOpenableArtifacts call it. server.ts's insrc_present description states presentation is independent of lifecycle status.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add mdPathForKind(repoPath, kind, artifactId, meta) to src/workflow/pending.ts, extracting toDescriptor's existing BUILD/AMD branching verbatim (no behavior change). — ↩ rollbackable
2. Change toDescriptor to call mdPathForKind instead of its inline ternary; change resolveOpenableArtifacts to call mdPathForKind instead of calling deriveMdPath directly. — ↩ rollbackable
3. Add openableDocuments() to DocsReviewClient (vscode-plugin/src/chat/docs-review-client.ts), mirroring pendingDocuments()'s shape but forwarding to workflow.openable. — ↩ rollbackable
4. Change extension.ts:732's reviewPresenter pendingDocuments dependency to call reviewClient.openableDocuments() instead of reviewClient.pendingDocuments(). — ↩ rollbackable
5. Reword the registered insrc_present tool description in server.ts to state presentation is independent of lifecycle status, removing the 'already approved' notPending example. — ↩ rollbackable

**Backward compat:** pendingDocuments() and workflow.pending stay exactly as they are -- the JetBrains review panel and any other caller of pendingDocuments() keep today's pending-only semantics unchanged. No field, method or IPC message is removed; openableDocuments() is purely additive on the client, mirroring the daemon side's existing additive openableWorkflow. toDescriptor's output is bit-for-bit unchanged (pure refactor via mdPathForKind), so listPendingArtifacts' own tests need no change.

## 7. Alternatives considered

### 7.1 a1: Full correction: client-side openable twin + shared path-rule helper + description fix — **CHOSEN**

Add openableDocuments() to DocsReviewClient (mirrors pendingDocuments, calls workflow.openable), rewire review-presenter's dependency to it, extract toDescriptor's per-kind mdPath rules into a shared helper both it and resolveOpenableArtifacts call, and correct the insrc_present tool description.

Three independent, additive corrections, each mirroring an existing pattern: (1) vscode-plugin/src/chat/docs-review-client.ts gains openableDocuments() (same shape as pendingDocuments, forwards to workflow.openable instead of workflow.pending); vscode-plugin/src/extension.ts:732 rewires reviewPresenter's pendingDocuments dependency to call it. (2) src/workflow/pending.ts extracts a shared mdPathForKind(repoPath, kind, artifactId, meta) helper from toDescriptor's existing BUILD/AMD special-casing (buildRecordMdPath + '' sentinel) and both toDescriptor and resolveOpenableArtifacts call it, so the two scanners can never again diverge on path-derivation correctness. (3) server.ts's insrc_present description is reworded to state presentation is independent of lifecycle status.

### 7.2 a2: Partial: fix only pending.ts's path rules + the tool description

Keep the original LLD's 'leave all IDE consumers untouched' decision; only fix resolveOpenableArtifacts' path derivation and the stale tool description.

Apply (2) and (3) from a1 but skip (1): do not touch vscode-plugin. The daemon-side scanner and the MCP tool description become correct, but the VS Code chat UI's own pendingDocuments() call is left reading workflow.pending.

**Rejected because:** Violates the HIGH-severity finding by design: leaves the VS Code auto-open path on workflow.pending, so the MCP tool would keep reporting presented while the editor pane refuses to open the document.

### 7.3 a3: Widen pendingDocuments() itself in place

Change DocsReviewClient.pendingDocuments() to call workflow.openable directly, with no new method and no rename.

Since the analyze bundle (usage.example on createReviewPresenter) and a direct grep both found no other VS Code consumer of pendingDocuments()/workflow.pending, redefine pendingDocuments() in place to call workflow.openable, forwarding the result unchanged.

**Rejected because:** Functionally closes the HIGH gap but via a misleadingly-named method (pendingDocuments would return lifecycle-independent results) and an unmaintained interface-contract comment, and does not itself address the MED/LOW findings.

### 7.4 a4: Invert control: insrc_present's own response carries the open targets

Stop having review-presenter poll a separate pendingDocuments()/openableDocuments() list at all; have the chat host open documents directly from insrc_present's tool-call result.

Change the chat-host/provider-mapper protocol so the declared documents and their resolved mdPaths travel on the insrc_present tool-call event itself, and review-presenter opens from that payload instead of making its own daemon round-trip.

**Rejected because:** An unscoped, oversized protocol change across the chat-host/provider-mapper boundary -- needs its own Epic/HLD, not a Story-level correction.

## 8. References

- **[[c1]]** `analyze-bundle` `vscode-plugin/src/extension.ts:730-734` — "pendingDocuments: () => reviewClient.pendingDocuments(),"
- **[[c2]]** `code` `src/workflow/pending.ts:175-198` — "const mdPath = deriveMdPath(repoPath, kind as ArtifactKind, art.meta ?? {});"
- **[[c3]]** `code` `src/mcp/server.ts:876-880` — "'and openable). Pass one to twenty artifact ids"
- **[[c4]]** `code` `src/workflow/pending.ts:222-246` — "mdPath: kind === 'BUILD' ? buildRecordMdPath(repoPath, artifactId, meta)"
- **[[c5]]** `code` `src/workflow/pending.ts:259-276` — "return head.includes(`<!-- insrc:artifact ${artifactId} -->`) ? derived : '';"
- **[[c6]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:154-162` — "'workflow.pending',"
- **[[c7]]** `code` `vscode-plugin/src/chat/review-presenter.ts:72-73` — "const namesDocument = (name: string, doc: PendingDocument): boolean =>"
