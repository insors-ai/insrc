<!-- insrc:artifact LLD-9c95950064e4b916-s1 -->

# LLD: STORY-9c95950064e4b916-s1 — insrc_present cannot show a tracked-epic artifact when code review is unavailable

## Summary

**Epic:** `insrc-present-cannot-show-tracked-epic`
**HLD base run:** `wf-1795794420060-78gc0h`
**HLD effective hash:** `110cc3052e0c...`

Completes the HIGH-severity fix the second manual review found only partially done: the review presenter now decides what to auto-open from the correct, lifecycle-independent list, but the panel's own open path still resolved content exclusively off a cache only the narrower pending list populates, so a newly-openable document-less or not-pending record's body failed to load even though its tab appeared. Adds a small, explicit seeding method to DocsReviewClient and uses it at the one call site that needs it, so content reads for these records resolve the same way existing pending-sourced reads already do.

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

**Does not apply**: Standalone, ISSUE-anchored bugfix Story with no sibling Stories; third correction round on this same Story's own already-approved LLD/PLAN/BUILD.

## 2. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 3. Contract details

**Surface level:** internal

### 3.1 `noteKnownPath`

```typescript
noteKnownPath(artifactId: string, mdPath: string): void
```

**Parameters:**
- `artifactId: string` — The artifact id content() will be asked to read.
- `mdPath: string` — Its known .md path, or '' for a document-less record (e.g. an AMD amendment, or a tracked BUILD with no matching marked BUILD.md) -- exactly the shape openableDocuments() and pendingDocuments() already return.

**Returns:** `void` — Writes directly into the same mdPathById/noDocIds maps pending() already populates: '' goes to noDocIds (content() takes the evidence-read branch), a real path goes to mdPathById (content() takes the markdown-read branch with that path). No daemon call.

**Postconditions:**
- A subsequent content(artifactId) call resolves correctly without requiring artifactId to have come from a prior pending() call.

### 3.2 `openArtifactFrom`

```typescript
function openArtifactFrom(ctx: PanelCtx, target: { readonly artifactId: string; readonly mdPath: string; readonly presentKey?: string | undefined }): Promise<void>
```

**Parameters:**
- `ctx: PanelCtx` — The panel context to open into.
- `target: { readonly artifactId: string; readonly mdPath: string; readonly presentKey?: string | undefined }` — The review presenter's open target, sourced from openableDocuments() -- its mdPath is already correct and lifecycle-independent.

**Returns:** `Promise<void>` — Reshaped only in its 'not found in pending()' branch: it now calls deps.client.noteKnownPath(target.artifactId, target.mdPath) before calling openDoc(ctx, target.artifactId, { readOnly: true, reveal: true }) with NO path option (previously { path: target.mdPath, readOnly: true, reveal: true }). The 'found in pending()' branch (passing { kind: summary.kind, reveal: true }) is unchanged.

**Postconditions:**
- openDoc's existing opts.path ?? artifactId correctly falls back to artifactId (opts.path is now undefined, never ''); content(artifactId) resolves via the freshly-seeded cache entry, taking the evidence-read branch for a document-less record and the markdown-read branch with the correct path otherwise.

## 4. Error paths

**Error cases**

- **The daemon itself rejects the content read after the cache is correctly seeded (e.g. workflow.deliveryEvidence or workflow.artifactContent answers a structured { error } for a genuinely missing/corrupt record)** (recoverable)
  - Detection: content()'s existing isError(res) check on either RPC's response -- unchanged by this fix.
  - Response: openDoc's existing catch block renders 'unavailable: <message>' in the pane, exactly as it already does for any other content() failure today.
  - User impact: Same failure UX as every other existing content-read failure; not a new error class.
- **An unrelated pending() refresh (e.g. a file-watcher-triggered reopen of a different open document) clears mdPathById/noDocIds in the narrow window between noteKnownPath's seed and openDoc's content() call** (recoverable)
  - Detection: None new: the seeded entry is simply gone, so resolvePath falls back to its pre-existing `?? idOrPath` behavior and the lookup misses exactly as the original bug did.
  - Response: No new handling; this is a known, narrow residual timing window inherited from the pre-existing single-entry-cache design, not introduced by this fix.
  - User impact: In this narrow window the open can still fail once; re-declaring (re-running insrc_present or re-clicking the pending-list row) reseeds and succeeds. Not fixed by this Task; noted as a residual limitation.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| target.mdPath === '' (an AMD amendment, or a tracked BUILD with no matching marked BUILD.md) and target.artifactId is NOT in the pending() list | noteKnownPath seeds noDocIds; content(artifactId) takes the evidence-read branch (workflow.deliveryEvidence) and the record's rendered body loads. |
| target.mdPath is a real non-empty path (a CR-less tracked BUILD with a valid marked BUILD.md) and target.artifactId is NOT in the pending() list | noteKnownPath seeds mdPathById with the real path; content(artifactId) resolves to that exact path and takes the markdown-read branch (workflow.artifactContent). |
| target.artifactId IS found in the pending() list (summary !== undefined) | Unchanged: openArtifactFrom's other branch (passing { kind: summary.kind, reveal: true }) runs exactly as before; noteKnownPath is never called for this case. |

**Invariants to preserve**

- Line 1476 (openArtifactFrom's 'not found in pending()' branch) is the ONLY openDoc call site that needs changing; reopen (1712-1722) and handleMessage's call (2502) must stay exactly as they are -- neither passes an empty-string path today. [[c1]]
- content()'s own branching logic -- `noDocIds.has(idOrPath)` for the evidence-read decision, `resolvePath` -> `mdPathById.get(idOrPath) ?? idOrPath` for the markdown-read path -- must stay exactly as it is; this fix only ever adds an earlier, explicit WRITE to the same two maps, never changes how content() reads them. [[c2]]

## 5. Test strategy

**Test framework:** `node:test`

**Test levels**

- **unit** — Prove noteKnownPath seeds the same caches pending() populates, so a subsequent content() call for an id that never went through pending() resolves correctly.
  - Subjects: `DocsReviewClient.noteKnownPath`, `DocsReviewClient.content (regression: existing pending()-sourced behavior unchanged)`
  - Fixtures: `the existing fakeIpc fixture in docs-review-client.test.ts`
- **integration** — Reproduce the manual review's exact four-case matrix against the real openArtifactFrom/openDoc/content chain over a fake daemon: a CR-less tracked BUILD with no BUILD.md, an approved AMD, a pending AMD control, and a CR-less tracked BUILD with a valid marked BUILD.md control.
  - Subjects: `openArtifactFrom (docs-review-panel.ts)`, `openDoc (docs-review-panel.ts)`
  - Fixtures: `a fakeIpc-style daemon stand-in answering workflow.pending/workflow.deliveryEvidence/workflow.artifactContent, matching the four-case matrix from the manual review's reproduction`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `noteKnownPath seeds noDocIds for an empty mdPath, so content(id) takes the evidence-read branch without a prior pending() call`, `noteKnownPath seeds mdPathById for a real mdPath, so content(id) takes the markdown-read branch with that exact path without a prior pending() call` |
| `ac2` | `openArtifactFrom's 'not found in pending()' branch calls noteKnownPath then opens with no path option, and the resulting pane body loads for a document-less target (reproducing the reviewer's CR-less-BUILD-with-no-BUILD.md and approved-AMD cases)`, `openArtifactFrom's 'not found in pending()' branch opens correctly for a document-backed, not-pending target (reproducing the reviewer's CR-less-BUILD-with-valid-BUILD.md case)`, `openArtifactFrom's 'found in pending()' branch is unchanged: it still opens via { kind: summary.kind, reveal: true } with no call to noteKnownPath (reproducing the reviewer's pending-AMD control case)` |

## 6. Migration

**State before:** Per c1: docs-review-panel.ts's openArtifactFrom (1456-1479) looks the target up only via client.pending(); when absent, it calls openDoc with { path: target.mdPath, ... }, and target.mdPath is '' for a document-less openable-but-not-pending record. Per c2: DocsReviewClient.content() (181-204) decides evidence-vs-markdown solely via mdPathById/noDocIds, both populated only by pending() (112-148); openableDocuments() (172-179) writes to neither. The two compound: the empty string survives openDoc's opts.path ?? artifactId fallback, and even if it didn't, content() has no cached fact about an openable-only id either way.

**State after:** DocsReviewClient gains noteKnownPath(artifactId, mdPath), seeding the same two caches directly. openArtifactFrom's 'not found in pending()' branch calls it with target.mdPath (already correct) then calls openDoc with no path option at all, letting the existing ?? artifactId fallback and the existing noDocIds/resolvePath branching in content() both resolve correctly.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add noteKnownPath(artifactId, mdPath) to DocsReviewClient (vscode-plugin/src/chat/docs-review-client.ts), writing directly into the existing mdPathById/noDocIds maps. — ↩ rollbackable
2. Change openArtifactFrom's 'not found in pending()' branch (docs-review-panel.ts) to call deps.client.noteKnownPath(target.artifactId, target.mdPath) then openDoc(ctx, target.artifactId, { readOnly: true, reveal: true }) with no path option, replacing the previous { path: target.mdPath, readOnly: true, reveal: true }. — ↩ rollbackable

**Backward compat:** pending(), pendingDocuments(), openableDocuments() and content()'s own branching logic are all unchanged. noteKnownPath is purely additive on the client. The 'found in pending()' branch of openArtifactFrom, reopen, and handleMessage's openDoc call are all untouched, since none of them pass an empty-string path today.

## 7. Alternatives considered

### 7.1 a1: Seed the existing path/no-doc caches from the already-correct openable target before reading content — **CHOSEN**

Add DocsReviewClient.noteKnownPath(artifactId, mdPath), seeding mdPathById/noDocIds for one id without a round trip; openArtifactFrom calls it with target.mdPath (already correct, from openableDocuments()) when the target is absent from pending(), then calls openDoc with no path option at all so the existing ?? artifactId fallback and existing noDocIds-based content() branching both work unchanged.

DocsReviewClient gains one new method, noteKnownPath(artifactId, mdPath): void, that writes directly into the same mdPathById/noDocIds maps pending() already populates -- '' goes to noDocIds, a real path to mdPathById. openArtifactFrom's 'not found in pending()' branch calls deps.client.noteKnownPath(target.artifactId, target.mdPath) then openDoc(ctx, target.artifactId, { readOnly: true, reveal: true }) -- no path option, so opts.path is undefined and the existing opts.path ?? artifactId correctly falls back to the artifactId; content(artifactId) then finds the freshly-seeded cache entry and takes the correct branch (evidence read for '', markdown read for a real path) with zero changes to content() itself.

### 7.2 a2: A dedicated openableContent(target) method that decides evidence-vs-markdown from the given mdPath directly, bypassing the cache entirely

Add DocsReviewClient.openableContent({id, mdPath}): Promise<DocsContent>, which inspects the given mdPath itself (empty vs real) to pick the evidence or markdown read, with no cache involved; openArtifactFrom's panel-side open path calls it instead of the generic content() for a not-in-pending-list target.

Extract content()'s branching body into a shared internal helper parameterized on (artifactId, knownMdPath: string | undefined), called both by content(idOrPath) (resolving knownMdPath from the existing caches, unchanged behavior for every existing caller) and by the new openableContent(target), which passes target.mdPath directly with no cache lookup at all. docs-review-panel.ts's openArtifactFrom would call deps.client.openableContent(target) in its 'not found' branch.

**Rejected because:** Strictly more robust (no residual race) but at M cost for a fix a1 already gets right at S cost; the residual race is pre-existing fragility, not a new regression.

### 7.3 a3: Have openableDocuments() itself populate the shared caches (merge, not seed-one)

Change openableDocuments() to merge its results into mdPathById/noDocIds (without clearing), so a later openArtifactFrom's pending() call finds the openable-only entries already cached.

openableDocuments() writes every returned artifact into the same two maps pending() uses, additively (no .clear()). Since review-presenter.declared() already calls openableDocuments() before invoking open(), the cache is warm by the time openArtifactFrom runs its own pending() call and looks up the target.

**Rejected because:** Reproduces exactly the flaw the manual review named: relying on a cache that pending() refreshes clear.

### 7.4 a4: Push the fix server-side: have workflow.artifactContent accept an empty/absent mdPath and render by artifactId

Change the daemon's workflow.artifactContent handler to accept a missing or empty mdPath and resolve the record by artifactId instead, so the client's existing content(idOrPath) always succeeds regardless of which cache (if any) populated it.

Widen the daemon-side artifactContent handler's contract so a request with no mdPath (or an empty one) falls back to looking the artifact up by id, mirroring what workflow.deliveryEvidence already does for a document-less record.

**Rejected because:** Violates this Story's established VS-Code-client-only scope boundary by touching daemon code and widening a shared IPC contract.

## 8. References

- **[[c1]]** `analyze-bundle` `vscode-plugin/src/chat/docs-review-panel.ts:1456-1479` — ": openDoc(ctx, target.artifactId, { path: target.mdPath, readOnly: true, reveal: true });"
- **[[c2]]** `code` `vscode-plugin/src/chat/docs-review-client.ts:181-204` — "if (noDocIds.has(idOrPath)) {"
