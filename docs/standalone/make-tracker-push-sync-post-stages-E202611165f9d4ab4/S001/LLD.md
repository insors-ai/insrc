<!-- insrc:artifact LLD-5f9d4ab4c90c0b4c-s1 -->

# LLD: STORY-5f9d4ab4c90c0b4c-s1 — Make the tracker push, sync and post stages handle an ISSUE-anchored work item

## Summary

**Epic:** `make-tracker-push-sync-post-stages`
**HLD base run:** `wf-1795498420280-h8ye0z`
**HLD effective hash:** `3759c9a350cf...`

Final LLD (closing the review's 1 HIGH + 2 MED on top of the five-layer design). tracker.push/sync/post fully support ISSUE-anchored work items end to end. **(HIGH)** The tracker context schemas gain an optional `headKind`; for `headKind: 'issue'`, `pushPrompt`/`pushVerifyPrompt` (src/workflow/runners/tracker/index.ts) emit an ISSUE block — ONE issue, the prerendered ISSUE markdown (`epicBodyMd` = `renderIssueMarkdown(issue)`) as the single authoritative body, labels `epicLabel` + `epic:<slug>` only (no story label), NO sub-issues / `## Stories` task list / `**Epic:**` back-reference (those become self-references), and adoption of an existing `existingRefs.epicRef` WITHOUT `--force` (the index.ts:290 "existing refs are an error unless --force" rule does not apply to adopted ISSUE refs); the ISSUE verify checklist is `issueLabelled` + `bodyMatches` + `singleIssue` with taskList/backRef pass-by-construction. Unit tests assert on the actual `pushPrompt`/`pushVerifyPrompt` strings for both kinds (ISSUE block present + DEF-only items absent for ISSUE; byte-equality vs a captured baseline for DEF). **(MED)** One readable-head rule — `readArtifactCore` first-READABLE-wins via tryParse, DEF then ISSUE, identical to `storage.ts` `readEpicDefinitionCore` — backs `requireApprovedDefinition`, `definitionHeadJsonPath` AND every persistence site (`mutateEpicTrackerMeta`, `sync.ts`), so a corrupt DEF can never be persisted into while context reads the ISSUE; a corrupt-DEF/valid-ISSUE finalize test proves `meta.tracker` lands on the ISSUE json with zero DEF files fabricated. **(MED)** First publication when no `issueRef` exists (ISSUE approved while tracking was disabled, cfg `type: 'none'`): the ISSUE push prompt creates exactly ONE remote issue; finalize writes the ref back via `patchTrackerMeta(ISSUE json, { issueRef })` AND binds `EPIC-<hash>` + `STORY-<hash>-s1` heads via `bindUnitIssue`, so `closeBugfixTrackerIssue` (which reads `readRecordedRef` = ISSUE `meta.tracker.issueRef`) can close at completion; a partial run (create ok, write-back failed) adopts on retry via the existingRefs re-read / `onLostRefAfterCreate` prompt-on-lost-ref flow with 0 duplicate creates. Test: approve without tracking -> enable -> push (1 create) -> retry -> completion closes. The five-layer pass-3 scope is unchanged: persistence via the resolved head, chain ISSUE branch (push-tracker -> sync-tracker -> chain-complete, never HLD/amendment/stale), adoption of `ISSUE.meta.tracker.issueRef` as the single root+s1 issue, and kind-aware `linkDocsToIssues` placement under docs/standalone. DEF-head code and prompt bytes are byte-identical at every layer.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `requireApprovedDefinition`

```typescript
export function requireApprovedDefinition(repoPath: string, epicHash: string): { kind: 'def' | 'issue'; artifact: DefineArtifact | IssueArtifact; jsonPath: string }
```

**Parameters:**
- `repoPath: string` — Repo root
- `epicHash: string` — Work-item hash

**Returns:** `{ kind: 'def' | 'issue'; artifact: DefineArtifact | IssueArtifact; jsonPath: string }` — Approved head + kind + its JSON path for one consistent read/persist

**Errors:**
- `ArtifactMissingError` when no readable DEF or ISSUE head json
- `ArtifactNotApprovedError` when head approval state 'rejected'
- `ArtifactNotApprovedError` when head exists but not approved

**Preconditions:**
- registered repo

**Postconditions:**
- First READABLE head in DEF-then-ISSUE order via readArtifactCore tryParse (a corrupt DEF falls through to the ISSUE) — the same rule storage.ts readEpicDefinitionCore uses; returns kind + jsonPath; head approved

### 2.2 `definitionHeadJsonPath`

```typescript
export function definitionHeadJsonPath(repoPath: string, epicHash: string): string
```

**Parameters:**
- `repoPath: string` — Repo root
- `epicHash: string` — Work-item hash

**Returns:** `string` — JSON path of the head that exists, for kind-aware persistence sites

**Errors:**
- `ArtifactMissingError` when neither head json exists

**Postconditions:**
- Same first-READABLE-wins resolution as 2.1 (NOT existsSync — a corrupt DEF must not win over a valid ISSUE); returns that head's json path, so context and persistence can never disagree

### 2.2a `PushContext / SyncContext / PostContext schemas (headKind)`

```typescript
interface PushContext { ...; headKind?: 'def' | 'issue' }  // same optional field on SyncContext, PostContext (src/workflow/runners/tracker/schemas.ts)
```

**Parameters:**
- `headKind: 'def' | 'issue'` _(optional)_ — drives the ISSUE prompt block; 'def' (default) is byte-identical to today

**Postconditions:**
- `headKind: 'issue'` carries the prerendered single-issue body (`epicBodyMd`) and the adopted `existingRefs`
- DEF default keeps every field and prompt byte-identical (byte-equality test)

### 2.2b `pushPrompt / pushVerifyPrompt (ISSUE block)`

```typescript
function pushPrompt(c: PushContext): string  // pushVerifyPrompt(c) likewise; both branch on c.headKind (src/workflow/runners/tracker/index.ts)
```

**Postconditions:**
- ISSUE context: ONE issue; authoritative body = `epicBodyMd` verbatim; labels `epicLabel` + `epic:<slug>` (no storyLabel); adopt `existingRefs.epicRef` — do NOT duplicate, do NOT error; when adopting, ADD the required labels idempotently (`ensureLabel` + `gh issue edit --add-labels epicLabel, epic:<slug>`) WITHOUT `--force`; only body edits need `--force` (index.ts:290 rule skipped for adopted ISSUE refs); no sub-issues, no `## Stories` task list, no `**Epic:**` back-reference (self-references)
- verify prompt for ISSUE: `issueLabelled` + `bodyMatches` + `singleIssue`; taskList/backRef absent or pass-by-construction for the single issue; adoption is complete only when the issue carries `epicLabel` AND `epic:<slug>`
- DEF context: byte-identical to today

### 2.3 `mutateEpicTrackerMeta (kind-aware)`

```typescript
function mutateEpicTrackerMeta(repoPath: string, epicHash: string, workflow: string, refs: TrackerPushRefs | TrackerSyncRefs | TrackerPostRefs): void
```

**Parameters:**
- `repoPath: string` — Repo root
- `epicHash: string` — Work item
- `workflow: string` — 'tracker.push' | 'tracker.sync' | 'tracker.post'
- `refs: TrackerPushRefs | TrackerSyncRefs | TrackerPostRefs` — Typed tracker refs

**Returns:** `void` — void

**Preconditions:**
- finalizeTracker context validated

**Postconditions:**
- defineJson := definitionHeadJsonPath (readable-head rule)
- DEF head: byte-identical to today
- ISSUE head: patchTrackerMeta lands on ISSUE-<hash>.json; ISSUE push also writes `meta.tracker.issueRef` back when the execute step created the first issue in this run; linkDocsToIssues called with head kind; zero DEF files created; post no-op at head level

### 2.4 `syncEpicStatus (sync.ts kind-aware)`

```typescript
async function syncEpicStatus(repoPath: string, epicHash: string, opts?: SyncOpts): Promise<SyncResult>
```

**Parameters:**
- `repoPath: string` — Repo root
- `epicHash: string` — Work item

**Returns:** `SyncResult` — SyncResult as today

**Preconditions:**
- epicRef bound via unitIssueOf

**Postconditions:**
- defineJson := definitionHeadJsonPath; storiesOf uses impliedIssueStories for ISSUE heads; patchTrackerMeta writes epicStatus/storyStatus/lastSyncedAt onto the head that exists

### 2.5 `computeNextAction (chain.ts ISSUE branch)`

```typescript
function computeNextAction(epicHash: string, s: NextActionInput): NextAction
```

**Parameters:**
- `epicHash: string` — Work-item hash
- `s: NextActionInput` — Chain states incl. tracker

**Returns:** `NextAction` — NextAction incl. tracker kinds for ISSUE heads

**Preconditions:**
- head exists and approved

**Postconditions:**
- ISSUE branch: after all story LLDs approved, consults s.tracker like DEF — !pushed -> push-tracker; lastSyncedAt undefined -> sync-tracker; else chain-complete; never hld/amendment/stale for ISSUE heads

### 2.6 `adoptOrPublishIssue (adopt-or-publish contract)`

```typescript
function adoptOrPublishIssue(repoPath: string, epicHash: string): string | undefined
```

**Parameters:**
- `repoPath: string` — Repo root
- `epicHash: string` — ISSUE hash

**Returns:** `string | undefined` — The adopted or freshly published ref

**Errors:**
- `BindResult kind 'conflict'` when adopted issueRef conflicts with an existing head binding to a different issue

**Preconditions:**
- ISSUE head approved
- gh config github

**Postconditions:**
- If `ISSUE.meta.tracker.issueRef` (readTrackerMeta) is set: seed `existingRefs.epicRef` AND `existingRefs.storyRefs[IMPLIED_ISSUE_STORY_ID]` with it; the ISSUE prompt adopts WITHOUT `--force` and adds the required labels idempotently (see 2.6a); finalize binds `EPIC-<hash>` + `STORY-<hash>-s1` heads via `bindUnitIssue` (idempotent same-ref; conflict refuses different-ref); 0 new remote issues
- If absent (e.g. approved while tracking disabled, cfg `type: 'none'`): the ISSUE prompt creates exactly ONE remote issue; finalize writes the ref back via `patchTrackerMeta(ISSUE json, { issueRef })` AND binds both heads; completion = issueRef on ISSUE meta.tracker + both head bindings present
- **PENDING-CREATE CLAIM (HIGH, corrected):** BEFORE dispatching the mutating execute step, `claimCreateIntent(repoPath, epicHash, runId)` does an **atomic create-if-absent** — `writeFileSync(path, payload, { flag: 'wx', mode: 0o600 })` on `.insrc/artifacts/PENDING-CREATE-<epicHash>.json` (repo-local, storage.ts:59/865). The `'wx'` flag is the same exclusive-create primitive the daemon uses for run files (src/daemon/run-file-ownership.ts:101, src/daemon/managed-update-preparation.ts:46): it **fails with EEXIST** when the file exists — unlike `writeAtomic`'s tmp+rename, which would overwrite. Payload: `{ epicHash, runId (owner), owner, repo, title: issue.body.title, marker: '<!-- insrc:artifact ISSUE-<epicHash> -->', state: 'pending', createdAt, heartbeatAt }`. Only a run that got `claimed: true` dispatches the execute step; a run that gets `claimed: false` (EEXIST) **refuses to dispatch a create** and instead adopts/reconciles from the existing claim.
- **MUTEX + FENCING TOKEN (MED fix):** ALL claim operations — create, heartbeat, `pending` -> `created`, takeover, delete — run inside one critical section per claim. **Lock shape (MED fix):** the mutex is a lock DIRECTORY guard, not a bare lock file — the `acquireRunFileGuard` pattern (src/shared/daemon-run-files.ts): `mkdirSync(path, 0o700)` plus `owner.json` written with flag `'wx'` inside, carrying `ProcessIdentity { pid, startedAt, commandLine }` + nonce. **Release:** the holder removes its own pinned guard directory on exit (after `assertOwned`). **Crash recovery:** a newcomer hitting EEXIST runs `quarantineDeadGuard` (daemon-run-files.ts:269) — a *conclusively dead* recorded pid is quarantined (renamed aside under a reclaim claim) and re-acquired, so a crashed holder never permanently blocks claim recovery; a **live** holder is never reclaimed — the acquisition fails closed with the conflict evidence. (A bare O_EXCL lock file would remain forever after a crash; the guard's owner record + quarantine is what makes recovery safe.)
- **QUEUE KEY (MED fix):** the in-process critical section is keyed by the authority-accepted artifact id `ArtifactIds.make({ kind: 'ISSUE', epicHash })` = `ISSUE-<hash>` (valid SHAPES kind, src/workflow/artifact-ids.ts:70-95), acquired via `withArtifactWriteAuthority(repoPath, 'ISSUE-<hash>', op)` (write-authority.ts, store.ts:249-262). The on-disk claim file keeps the name `.insrc/artifacts/PENDING-CREATE-<epicHash>.json` — that name bypasses the artifact store, while only the *queue key* must parse as an artifact id (`PENDING-CREATE-<hash>` is rejected by `ArtifactIds.parse`). **Lock ordering:** the claim mutex is always acquired BEFORE any artifact write on `ISSUE-<hash>` / `EPIC-<hash>` / `STORY-<hash>-s1`; nested artifact writes inside a claim op run under the same authority, so ordering is consistent and the claim key is distinct from the artifact keys, so artifact writes never block claim acquisition longer than one op.
- **FENCING TOKEN:** the claim payload carries a monotonically increasing **fence** integer (starts at 1). Every op reads the current fence under the mutex, requires `expectedFence === current`, and writes `fence+1` atomically inside the same critical section. A displaced owner's later op carries a stale fence and is rejected with `ClaimOwnershipError` BEFORE any write — and the displaced owner is **fenced from all subsequent persistence** (heartbeat, refs update, issueRef write-back, head bindings, claim delete), not just the claim file. This closes the check-then-write race: Run A paused after its ownership read cannot overwrite Run B's takeover, because A's fence is stale by the time A re-enters the mutex.
- **LIVENESS (abandoned vs still-executing):** a claim is abandoned iff `heartbeatAt` is older than `claimStaleAfterMs` (config, default 10 min) **and** no issueRef/head bindings are persisted; a still-executing operation keeps its heartbeat fresh, so its claim is never treated as abandoned. Takeover of an abandoned claim happens only inside the claim mutex (re-read, verify abandoned, write new owner runId + fence+1), so two simultaneous reconcilers serialize: the second sees a fence mismatch or a fresh owner and refuses.
- **RECONCILIATION RULE (ownership-safe):** an unresolved `state: 'pending'` claim (abandoned, or after a lost execute response) -> no create; candidates by the persisted unique title (`ghListIssuesByTitleTokenStrict`, registry-table.ts:331), each body-verified by `verifyRecoveryCandidate` (2.6c — exact `<!-- insrc:artifact ISSUE-<epicHash> -->` marker via `ghGetIssueBody` + owner/repo target match). Exactly one verified candidate -> adopt (update claim to 'created' under the runId ownership check, persist issueRef + head bindings), **0 creates**. Zero or >1 verified candidates -> explicit refusal error naming the claim; human resolves; no create either way. A `state: 'created'` claim adopts its durable refs directly, 0 creates. This one mechanism covers concurrent runs, post-create write failure, and lost execute responses; there is no separate post-create RECOVERY record or prior-run-artifact read.

### 2.6c `verifyRecoveryCandidate` (identity proof before adopt/mutate)

```typescript
async function verifyRecoveryCandidate(port: TrackerPort, repoPath: string, epicHash: string, candidateRef: string): Promise<{ ok: true; ref: string } | { ok: false; reason: string }>
```

Reads the candidate remote body (`ghGetIssueBody`, registry-table.ts:270) and requires the exact canonical marker line `<!-- insrc:artifact ISSUE-<epicHash> -->` (`artifactIdMarker`, storage.ts:873 — the same marker `renderIssueMarkdown` emits at the top of the remote body) AND owner/repo matching the configured tracker target. Title lookup (`ghListIssuesByTitleTokenStrict`, registry-table.ts:331) is only a **candidate generator** — its "strict" covers lookup failure, not uniqueness; identity comes from the marker + target check. Ambiguous (0 or >1 distinct survivors after filtering) or mismatched -> **refuse** with a clear error before any adoption, label mutation, or create. Tests: duplicate titles (two remote issues sharing the body.title) and a single unrelated title match — both refuse without touching the unrelated issue.

### 2.6a `ISSUE push — adoption labels (idempotent, no force)`

Adoption of an existing issue may **add the required labels idempotently without `--force`**: `ensureLabel(epicLabel)`, `ensureLabel('epic:' + slug)`, then `gh issue edit <N> --add-label "epicLabel,epic:<slug>"` on the adopted issue — the **singular** `--add-label` flag (the plural `--add-labels` is rejected by the installed gh CLI; the daemon tool `gh_issue_edit` maps its `addLabels` array to `--add-label`, src/daemon/tools/builtins/gh/issue.ts:234,273). Only **body edits** require `--force`; labels are additive and idempotent. The verify checklist's `issueLabelled` passes after those adds, so normal adoption both preserves the no-edit rule and passes verification. (An issue created with `defaultTrackerCreateDeps` defaults to `labels: []` — bugfix/tracker.ts:445-470 — which is exactly why adoption must add them.) Tests: start from an issue created with the existing default deps -> push -> labels present, body unchanged, 0 creates; AND the label path is verified at the tool-input boundary (run `gh_issue_edit` through the typed tool executor with a stubbed gh and assert the `--add-label` singular argv), not just by prompt-string assertions.

### 2.6b `renderIssueMarkdownWithTracker` (local ISSUE.md renderer)

```typescript
export function renderIssueMarkdownWithTracker(artifact: IssueArtifact, repoPath: string): string  // src/workflow/artifacts/issue.ts
```

Returns `renderIssueMarkdown(artifact)` verbatim with ONE added line `**Tracker:** [owner/repo#N](https://github.com/owner/repo/issues/N)` (`trackerRefLine`, refs.ts:94) after the artifact-id marker, when `unitIssueOf(repoPath, issueHash)` or `readTrackerMeta` yields `meta.tracker.issueRef`. With no ref, output is byte-identical to `renderIssueMarkdown(artifact)`. The **remote** GitHub issue body stays `renderIssueMarkdown(artifact)` with no tracker line — the link is local-doc-only, exactly like DEF.md's Summary envelope which reads its tracker line from `unitIssueOf` (define.ts:115-116). Test asserts the rendered ISSUE.md content: artifact marker + canonical body headings byte-identical to `renderIssueMarkdown` + the `**Tracker:**` line present after push, absent (byte-identical) without a ref.

### 2.7 `linkDocsToIssues (kind-aware)`

```typescript
export function linkDocsToIssues(repoPath: string, epicHash: string, epicSlug: string, refs: EpicRefs, headKind?: 'def' | 'issue'): void
```

**Parameters:**
- `repoPath: string` — Repo root
- `epicHash: string` — Work item
- `epicSlug: string` — Slug
- `refs: EpicRefs` — epicRef + storyRefs
- `headKind: 'def' | 'issue'` _(optional)_ — 'def' | 'issue'; defaults to the read head

**Returns:** `void` — void; per-doc failures warn as today

**Errors:**
- `MissingAnchorError` when head has no creation anchor

**Preconditions:**
- head exists with anchor

**Postconditions:**
- DEF head: byte-identical (HLD.md+Define.md+LLDs under docs/epics)
- ISSUE head: placement = workItemKindOf(head.meta) ('standalone'), anchor = requireEpicAnchor; relinks ISSUE.md via issueArtifactPaths with `renderIssueMarkdownWithTracker` (tracker link line from the head binding / meta.tracker.issueRef; body bytes canonical) + implied story LLD.md (lldArtifactPaths 'standalone'); HLD/Define skipped; no docs/epics entry created

## 3. Data model changes

### 3.1 `DefinitionHead resolution (readable-wins, one rule)` — invariant-change

One readable-head rule (readArtifactCore first-READABLE-wins via tryParse, DEF then ISSUE — identical to storage.ts readEpicDefinitionCore and resolve.ts readEpicDefinition) backs requireApprovedDefinition, definitionHeadJsonPath, and through them every persistence site, so a corrupt DEF can never be persisted into while context reads the ISSUE.

**Call sites:**
- `src/workflow/storage.ts:644-700`
- `src/workflow/tracker/resolve.ts:216-227`
- `src/workflow/gates.ts:153-261`

### 3.2 `Tracker execute/verify prompt contract per head kind` — field-add

Context schemas gain optional headKind; pushPrompt/pushVerifyPrompt branch on it — ISSUE block: single issue, authoritative prerendered body, labels epicLabel+epic:<slug>, adopt without --force, no task-list/back-ref/sub-issues; verify = issueLabelled+bodyMatches+singleIssue; DEF byte-identical (byte-equality test).

**Call sites:**
- `src/workflow/runners/tracker/index.ts:228-352`
- `src/workflow/runners/tracker/schemas.ts:119-160`

### 3.3 `Finalize persistence target + issueRef write-back` — invariant-change

mutateEpicTrackerMeta persists to definitionHeadJsonPath (readable-head rule) and passes head kind to linkDocsToIssues; ISSUE push writes meta.tracker.issueRef back on first publication and binds EPIC/STORY-s1 heads so closeBugfixTrackerIssue can close; partial-run retry adopts via onLostRefAfterCreate.

**Call sites:**
- `src/workflow/orchestrator.ts:2919`
- `src/workflow/orchestrator.ts:2972-3026`
- `src/workflow/bugfix/tracker.ts:268-300`

### 3.2 `Sync persistence + story list source` — invariant-change

sync.ts defineJson := definitionHeadJsonPath; storiesOf branches DEF -> readDefineArtifact ids, ISSUE -> impliedIssueStories; patchTrackerMeta target likewise.

**Call sites:**
- `src/workflow/tracker/sync.ts:59`
- `src/workflow/tracker/sync.ts:106`
- `src/workflow/tracker/sync.ts:164`

### 3.3 `ChainReport.nextAction for ISSUE-anchored items` — field-modify

computeNextAction ISSUE branch falls through to the DEF tracker steps after the story loop; HLD/amendment/stale remain skipped for ISSUE heads.

**Call sites:**
- `src/workflow/chain.ts:325-360`
- `src/workflow/chain.ts:425-441`

### 3.4 `TrackerBinding identity for an ISSUE-anchored work item` — invariant-change

Adoption contract: ISSUE.meta.tracker.issueRef (bugfix approval) is the work-item root issue AND the single s1 story issue; push seeds existingRefs from it; finalize binds EPIC-<hash> + STORY-<hash>-s1 heads idempotently; conflicts refuse; no duplicate creates on retry.

**Call sites:**
- `src/workflow/runners/tracker/context.ts:62-67`
- `src/workflow/bugfix/tracker.ts:382-392`
- `src/workflow/tracker/unit-head.ts:36`
- `src/workflow/tracker/binding.ts:126-145`

### 3.5 `Doc-issue linkage placement` — invariant-change

linkDocsToIssues takes headKind; placement from workItemKindOf(head.meta), anchor from requireEpicAnchor; ISSUE heads relink ISSUE.md + standalone LLD.md, skip HLD/Define docs.

**Call sites:**
- `src/workflow/tracker/link.ts:46-70`
- `src/workflow/storage.ts:466`
- `src/workflow/storage.ts:550-567`
- `src/workflow/storage.ts:937-960`

## 4. Error paths

**Error cases**

- **tracker finalize/sync for a hash with no readable head** (recoverable)
  - Detection: readArtifactCore tryParse fails for both DEF and ISSUE head jsons (or both missing)
  - Response: ArtifactMissingError naming the ISSUE id and advising the issue stage (not define) — no raw ENOENT after remote issues exist
  - User impact: Accurate refusal, no partial remote state hidden
- **persistence write fails mid-finalize** (terminal)
  - Detection: readFileSync/writeArtifact on the head json throws during mutateEpicTrackerMeta
  - Response: finalizeTracker returns schemaFailure naming the actual head path (ISSUE for bugfix items); refs remain in the run output so a retry adopts them and creates no duplicates
  - User impact: No silent success after remote creates
- **ISSUE.meta.tracker.issueRef disagrees with an existing EPIC/STORY head binding** (recoverable)
  - Detection: bindArtifact finds the head bound to a different issue than the adopted issueRef
  - Response: BindResult kind 'conflict'; push refuses to rebind (a unit has exactly one issue) and reports both refs
  - User impact: No duplicate or stolen issue
- **linkDocsToIssues on an ISSUE head lacking epicCreatedAt** (recoverable)
  - Detection: requireEpicAnchor finds no creation time on the head (storage.ts:562)
  - Response: MissingAnchorError before any doc is touched — linkDocsToIssues fails closed, no wrong-folder write
  - User impact: No docs/epics duplicate
- **sync/post before push on an ISSUE item** (recoverable)
  - Detection: unitIssueOf undefined for an ISSUE head in sync/post
  - Response: Existing 'no tracker refs ... Run tracker.push first' refusal, now reachable because the context read succeeds
  - User impact: Accurate guidance
- **tracker disabled via repo config at push time** (recoverable)
  - Detection: resolveGithubConfig type 'none'
  - Response: requireGithubAdapter throws the existing disabled-tracker error; the ISSUE keeps no issueRef and first push after enabling creates exactly one issue
  - User impact: Unchanged gating; clean first publication afterwards
- **ISSUE push created the remote issue but issueRef write-back or head binding failed** (recoverable)
  - Detection: patchTrackerMeta/bindUnitIssue threw after the execute step returned the created ref
  - Response: next run re-reads, seeds existingRefs from the recovered ref (or onLostRefAfterCreate prompt-on-lost-ref), adopts with 0 duplicate creates
  - User impact: Self-healing retry, no duplicate publication
- **bugfix completion before any successful push** (recoverable)
  - Detection: closeBugfixTrackerIssue finds no recorded ref on a configured repo
  - Response: existing onLostRefOnClose prompt branch (bugfix/tracker.ts:290+); after any successful push the ref is recorded by this story's write-back
  - User impact: Prompt instead of silent skip
- **remote issue created but issueRef persistence failed; next push runs** (recoverable)
  - Detection: assemblePushContext finds a PENDING-CREATE-<epicHash>.json claim with state 'pending' (written before dispatch) or 'created' whose refs are unpersisted (no issueRef on the head, no head bindings)
  - Response: 'created' -> adopt the claim's durable refs; 'pending' -> reconcile: title candidates via ghListIssuesByTitleTokenStrict (registry-table.ts:331), each verified by verifyRecoveryCandidate (marker + target); NO create permitted either way; retry persists issueRef + head bindings
  - User impact: No duplicate remote issues across attempts; recovery survives a fresh workflow invocation
- **adopted issue lacks the labels the verify checklist requires** (recoverable)
  - Detection: pushVerifyPrompt sees missing epicLabel / epic:<slug> on the adopted issue
  - Response: adoption adds the labels idempotently (ensureLabel + `gh issue edit <N> --add-label "epicLabel,epic:<slug>"` — singular flag, issue.ts:234/273) without --force and without touching the body; only body edits need --force
  - User impact: Adoption converges without violating the no-edit rule
- **second concurrent tracker.push on the same epicHash** (recoverable)
  - Detection: claimCreateIntent gets EEXIST on PENDING-CREATE-<epicHash>.json
  - Response: claimed:false; the competing run does not dispatch a create, does not overwrite, does not delete; it reconciles from the live claim or refuses on a fresh owner heartbeat
  - User impact: Exactly one remote issue across concurrent runs
- **claim update/delete by a non-owner run** (terminal)
  - Detection: inside the claim mutex, re-read shows claim.runId !== this runId
  - Response: abort without touching the file
  - User impact: Claim ownership preserved
- **claim op with a stale fencing token (displaced owner)** (terminal)
  - Detection: inside the claim mutex, expectedFence !== current fence
  - Response: ClaimOwnershipError before any write; the run is fenced from all subsequent persistence (heartbeat, issueRef write-back, head bindings, delete)
  - User impact: No check-then-write overwrite is possible
- **lock left behind by a crashed holder** (recoverable)
  - Detection: mkdir EEXIST and owner.json's pid probe returns conclusively dead
  - Response: quarantineDeadGuard (daemon-run-files.ts:269) quarantines the dead guard under a reclaim claim and re-acquires; live holders fail closed with conflict evidence, never reclaimed
  - User impact: A crash never permanently blocks claim recovery
- **claim mutex keyed by a non-artifact id** (recoverable)
  - Detection: ArtifactIds.parse('PENDING-CREATE-<hash>') === undefined — the authority queue rejects unknown kinds
  - Response: queue key = ArtifactIds.make({ kind: 'ISSUE', epicHash }) = ISSUE-<hash> (valid SHAPES kind, artifact-ids.ts:70-95); the claim FILE keeps the PENDING-CREATE name because it bypasses the artifact store; lock ordering: claim mutex before any artifact write on ISSUE/EPIC/STORY-s1 keys
  - User impact: Claim mutex works through the real worker/authority boundary
- **unresolved pending-create claim at next push** (recoverable)
  - Detection: PENDING-CREATE-<epicHash>.json with state 'pending' and a stale/absent heartbeat (abandoned) or a lost execute response
  - Response: no create; reconcile via title lookup + verifyRecoveryCandidate marker/target check; exactly one verified candidate -> adopt with 0 creates; otherwise explicit refusal naming the claim
  - User impact: Fresh retries are safe with nothing injected; duplicate creates impossible
- **candidate identity cannot be proven** (recoverable)
  - Detection: verifyRecoveryCandidate — marker line missing, owner/repo mismatch, or >1 distinct candidate after filtering
  - Response: refuse with a clear error before any adoption, label add, or create
  - User impact: No labels ever added to an unrelated issue

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Both DEF-<hash>.json and ISSUE-<hash>.json parse | both helpers resolve DEF (kind 'def', DEF json path); all layers as today |
| DEF-<hash>.json unparseable, ISSUE-<hash>.json valid+approved; tracker.push finalize | BOTH requireApprovedDefinition and definitionHeadJsonPath resolve the ISSUE (kind 'issue', ISSUE json path); finalize writes meta.tracker onto the ISSUE json, never the corrupt DEF; readdir shows zero DEF-*.json created |
| pushPrompt(c)/pushVerifyPrompt(c) with c.headKind='issue' — string assertions | ISSUE block present (ONE issue, body=epicBodyMd, labels epicLabel+epic:<slug>, adopt epicRef without --force) and 'error unless'/task-list/backRef/sub-issue text absent; verify grades issueLabelled/bodyMatches/singleIssue only |
| pushPrompt(c) with c.headKind undefined — byte-equality assertion | DEF-context prompt byte-identical to captured baseline; ISSUE block absent |
| approve ISSUE with cfg type 'none' -> enable tracking -> push -> retry (simulated write-back failure) -> bugfix completion | first push creates exactly ONE remote issue; finalize writes issueRef to ISSUE json AND binds EPIC/STORY-s1 heads; retry adopts with 0 duplicate creates; closeBugfixTrackerIssue closes via readRecordedRef |
| tracker.push retry after simulated issueRef write-back failure on an ISSUE fixture | next run re-reads, adopts via existingRefs re-read / onLostRefAfterCreate; 0 duplicate creates; run completes |
| Both DEF-<hash>.json and ISSUE-<hash>.json exist (DEF wins, readEpicDefinitionCore order) | definitionHeadJsonPath returns the DEF json; kind 'def'; all layers behave exactly as today |
| DEF malformed, ISSUE parses | Falls through to the ISSUE json when the DEF is corrupt (first-readable-wins) |
| tracker.push then tracker.sync finalize on a seeded ISSUE-anchored repo with a stubbed tracker port | Finalize push on an ISSUE-only fixture writes meta.tracker onto ISSUE-<hash>.json, binds EPIC-<hash> + STORY-<hash>-s1 heads, readdir(.insrc/artifacts) has zero DEF-*.json; finalize sync writes epicStatus/storyStatus/lastSyncedAt onto the ISSUE json |
| buildChainReport across four states of the ISSUE-anchored fixture | Chain on an ISSUE fixture: unpushed+LLD approved -> push-tracker; bound refs, no lastSyncedAt -> sync-tracker; lastSyncedAt set -> chain-complete; never hld/amendment/stale for ISSUE heads |
| tracker.push on an ISSUE fixture whose approval recorded issueRef | Push with ISSUE.meta.tracker.issueRef pre-set: existingRefs.epicRef and storyRefs.s1 are that ref; stubbed port createIssue count == 0; finalize binds both heads to it; a pre-existing head binding to a different issue refuses with kind 'conflict' |
| push finalize on the ISSUE-anchored fixture, then inspect the docs tree | linkDocsToIssues on an ISSUE head rewrites docs/standalone/<slug>-E<anchor>/ISSUE.md and S001/LLD.md, docs/ has no epics entry for the hash, HLD/Define relinks skipped; ISSUE.md contains the artifact marker + canonical body bytes (renderIssueMarkdown) + a `**Tracker:** [owner/repo#N](...)` line |
| push on an ISSUE fixture with no ref yet | ISSUE.md byte-identical to renderIssueMarkdown (no tracker line) |
| remote create succeeded, then the intent/recovery record write fails | PENDING-CREATE-<epicHash>.json already exists with state 'pending' (written BEFORE dispatch); run fails closed with no further mutation; a FRESH next invocation (nothing injected) sees the unresolved intent -> no create -> reconciles via title+marker verification -> adopts the one verified candidate with createIssue count == 0 -> intent updated to 'created', issueRef + head bindings persisted |
| remote create succeeded, then the execute response is lost before the framework receives refs | intent still 'pending'; fresh invocation reconciles identically; 0 additional creates |
| intent state 'created' but meta/binding persistence failed | fresh invocation reads refs from the intent file itself (durable); adopts; 0 creates; persists issueRef + bindings |
| unresolved intent with 0 or >1 marker-verified candidates | explicit refusal naming PENDING-CREATE-<epicHash>.json; no create, no adoption; human resolves |
| two tracker.push runs paused after context assembly, then both released toward dispatch | first run's claimCreateIntent 'wx' create succeeds under the claim mutex; second gets EEXIST -> claimed:false -> no create dispatched, no overwrite, no delete; exactly 1 create total; claim runId preserved |
| Run A reads its own runId/fence for a heartbeat, pauses; Run B takes over the abandoned claim under the mutex (fence++); Run A resumes | A's op sees a stale fence inside the mutex -> ClaimOwnershipError before any write; A cannot overwrite or delete B's claim and is fenced from issueRef/head-binding persistence |
| two simultaneous reconcilers of an abandoned claim | serialized on the claim mutex; exactly one takeover (fence increments once); the second refuses |
| mutex holder killed with SIGKILL inside the critical section; fresh run starts | guard directory left behind -> newcomer's EEXIST triggers quarantineDeadGuard (dead pid verified) -> reclaimed, original claim recovered, 0 new creates; a separately-running LIVE holder is never reclaimed |
| two remote issues share the ISSUE body.title (duplicate titles) | title lookup yields 2 candidates; marker verification filters to the one carrying `ISSUE-<hash>`; >1 distinct survivor or 0 -> refuse, no adoption, no label mutation, no create |
| a single remote issue with a matching title but no ISSUE-<hash> marker (unrelated work item) | verification fails (marker absent / wrong target repo); refuse before any label add |
| fresh tracker.push invocation after create succeeded but the execute response was lost (nothing injected) | claim stays 'pending' with owner runId; next run reconciles via title+marker verification; createIssue count == 0; issueRef + head bindings persisted |
| adoption of an issue created with defaultTrackerCreateDeps (labels: []) | push adds epicLabel + epic:<slug> idempotently (ensureLabel + add-labels) WITHOUT --force and without body edit; issueLabelled verify passes; 0 creates |
| tracker.post variants on the pushed ISSUE fixture | tracker.post lld+s1 posts to the adopted story ref; hld/amendment targets and non-s1 storyIds refuse with clear errors |

**Invariants to preserve**

- DEF-head behavior byte-identical at code AND prompt level: pushPrompt/pushVerifyPrompt for 'def'/undefined reproduce today's strings (byte-equality test + existing runner tests); context assemblers (context.ts:41-199), mutateEpicTrackerMeta bytes (orchestrator.ts:2972-3026), sync patch target DEF json (sync.ts:59-164), chain DEF branch (chain.ts:425-441), linkDocsToIssues docs/epics placement (link.ts:46-70). [[c1]]
- One readable-head rule everywhere: readArtifactCore first-READABLE-wins, DEF then ISSUE — identical to storage.ts readEpicDefinitionCore:644-700 and resolve.ts readEpicDefinition:216-227; context and persistence share it, so they cannot disagree. [[c2]]
- Approval gating unchanged: rejected/not-approved heads refuse with ArtifactNotApprovedError naming the head's real md path (gates.ts:237-261). [[c3]]
- A unit has exactly one issue: bindArtifact idempotent same-ref, conflict different-ref (binding.ts:126-145); adoption never rebinds. [[c4]]
- chain readTrackerMeta keeps (define?, issue?) + impliedIssueStories for ISSUE heads; the ISSUE branch adds tracker steps but never HLD/amendment/stale (chain.ts:277-301, 325-360). [[c5]]
- patchTrackerMeta merges meta.tracker key-wise on any artifact json (refs.ts:111-125) — ISSUE heads already carry meta.tracker (issueRef from bugfix approval); no format change. [[c6]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (repo convention); fixtures = seeded temp .insrc/artifacts dirs following seedIssueRepo in src/workflow/__tests__/issue-anchored-route.test.ts + a stubbed tracker port counting createIssue calls`

**Test levels**

- **unit** — readable-head rule for both helpers (corrupt DEF -> ISSUE via readArtifactCore first-READABLE-wins); approval gating; prompt-text contract for both head kinds (pushPrompt/pushVerifyPrompt: ISSUE block present + 'error unless'/task-list/backRef/sub-issue absent for ISSUE; byte-equality vs captured baseline for DEF); renderIssueEpicBody shape
  - Subjects: `src/workflow/gates.ts requireApprovedDefinition + definitionHeadJsonPath`, `src/workflow/runners/tracker/index.ts pushPrompt/pushVerifyPrompt`, `src/workflow/tracker/conventions.ts renderIssueEpicBody`
  - Fixtures: `temp repo with .insrc/artifacts: approved ISSUE-<hash>.json (epicCreatedAt stamp, optional meta.tracker.issueRef) + marked ISSUE.md + LLD/PLAN jsons; corrupt-DEF + valid-ISSUE fixture; DEF+ISSUE both-valid fixture; captured DEF prompt baseline string`
- **integration** — corrupt-DEF/valid-ISSUE finalize lands on the ISSUE json with zero DEF files; ISSUE-only finalize push+sync (ISSUE meta + EPIC/STORY-s1 bindings); four-state chain sequence; adoption adopt-without-force (string assertion) with createIssue count == 0 + conflict; first-publication write-back + retry recovery + close (stubbed close deps); kind-aware linkage (canonical standalone docs updated, no docs/epics duplicate)
  - Subjects: `src/workflow/orchestrator.ts mutateEpicTrackerMeta + finalizeTracker`, `src/workflow/tracker/sync.ts`, `src/workflow/chain.ts computeNextAction + readTrackerMeta`, `src/workflow/tracker/link.ts linkDocsToIssues`, `src/workflow/runners/tracker/context.ts assemblers`, `src/workflow/bugfix/tracker.ts closeBugfixTrackerIssue (stubbed deps)`
  - Fixtures: `seedIssueRepo-style ISSUE-anchored repo + stubbed github port (createIssue counter, canned refs) wired through orchestrator finalizeTracker and tracker/sync.ts; corrupt-DEF fixture; four-state chain fixture; approval-without-tracking fixture with stubbed close deps; two-run harness with a barrier pausing both runs after context assembly, released toward claimCreateIntent; stubbed port that succeeds at create then drops the execute response; heartbeat clock stub for fresh vs stale claim states; duplicate-title and unrelated-title fixtures; typed-tool executor stub for gh_issue_edit proving --add-label (singular) argv mapping; issue pre-created with defaultTrackerCreateDeps labels: []`
- **smoke** — npx tsc --noEmit clean; workflow+MCP test subsets show no new failures vs the recorded pre-story baseline (workflow chunks 36/10/11/16, MCP 6/26, gates 4 — pre-existing at HEAD)
  - Subjects: `npx tsc --noEmit`, `npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts'`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: pushPrompt/pushVerifyPrompt with headKind 'issue' contain the ISSUE block (ONE issue, body=epicBodyMd, labels epicLabel+epic:<slug>, adopt epicRef without --force) and NOT 'error unless'/task-list/backRef/sub-issue text`, `unit: pushPrompt/pushVerifyPrompt with headKind 'def'/undefined byte-identical to captured baseline`, `unit: requireApprovedDefinition + definitionHeadJsonPath both use readArtifactCore first-READABLE-wins (corrupt DEF -> ISSUE)`, `unit: requireApprovedDefinition approval gating + head md path in refuse messages`, `integration: finalize tracker.push on an ISSUE-only seed repo writes meta.tracker onto ISSUE-<hash>.json, binds EPIC-<hash> and STORY-<hash>-s1 heads, readdir shows zero DEF-*.json`, `integration: finalize tracker.sync on the same fixture writes epicStatus/storyStatus/lastSyncedAt onto the ISSUE json via a stubbed port` |
| `ac2` | `integration: corrupt-DEF + valid-approved-ISSUE finalize — meta.tracker lands on the ISSUE json (never the corrupt DEF), readdir shows zero DEF-*.json created`, `integration: all existing DEF-headed tracker/chain/link tests pass unedited`, `integration: assemblePushContext on a DEF-headed seed repo returns the exact pre-change context shape` |
| `ac3` | `integration: chain four-state sequence on an ISSUE fixture — push-tracker -> sync-tracker -> chain-complete; never hld/amendment/stale for ISSUE heads`, `integration: adoption — push with ISSUE.meta.tracker.issueRef pre-set: ISSUE prompt shows adopt-without-force (string assertion), stubbed port createIssue count == 0, finalize binds both heads; conflicting head binding -> kind 'conflict'`, `integration: create succeeds + execute response lost — intent still 'pending'; fresh invocation reconciles identically; 0 additional creates`, `integration: intent 'created' + meta persistence failed — fresh invocation reads refs from the intent file; 0 creates; persists issueRef + bindings`, `integration: unresolved intent with 0 or >1 verified candidates -> explicit refusal, no create, no adoption`, `integration: identity refusal — duplicate titles / unrelated title match refuse without label mutation (marker-verified)`, `integration: label command boundary — gh_issue_edit through the typed executor asserts singular --add-label argv (issue.ts:234/273)`, `integration: deterministic two-run race — barrier pauses both runs after context assembly, then releases both toward claimCreateIntent; assert exactly one createIssue call, claim runId == winner, loser got claimed:false and never updated/deleted the claim`, `integration: interleaving takeover race — pause run A after its ownership read, let B take the abandoned claim under the mutex (fence++), resume A; assert ClaimOwnershipError, no overwrite/delete of B's claim, A fenced from later persistence`, `integration: two simultaneous abandoned-claim reconcilers — claim mutex serializes; exactly one takeover (fence increments once)`, `integration: crash recovery — spawn a holder child, SIGKILL it inside the critical section; assert the guard remains (naive acquire EEXIST), then a fresh run reclaims via dead-owner quarantine, recovers the original claim with 0 new creates, and a co-resident LIVE holder is undisturbed`, `integration: authority-boundary acquisition — worker thread acquires the claim mutex with key ISSUE-<hash> through the real withArtifactWriteAuthority/daemon handler (not a local mock); assert PENDING-CREATE-<hash> is rejected by ArtifactIds.parse and ISSUE-<hash> is accepted; assert lock ordering claim-mutex before artifact writes` |
| `ac4` | `integration: first publication — approve ISSUE with tracking disabled (no issueRef), enable, push: exactly 1 create, issueRef written back to ISSUE json + EPIC/STORY-s1 heads bound; closeBugfixTrackerIssue closes via readRecordedRef (stubbed close deps)`, `integration: adoption labels — issue created with defaultTrackerCreateDeps (labels: []), then push: epicLabel + epic:<slug> added idempotently without --force and without body edit; issueLabelled verify passes; 0 creates`, `integration: ISSUE.md content — after push, docs/standalone/<slug>-E<anchor>/ISSUE.md contains artifact marker + canonical body bytes (renderIssueMarkdown) + **Tracker:** link line; without a ref, byte-identical to renderIssueMarkdown`, `integration: linkDocsToIssues on an ISSUE head rewrites .../ISSUE.md and S001/LLD.md, docs/ has no epics entry for the hash`, `integration: tracker.post on the pushed ISSUE fixture: lld+s1 posts to the adopted story ref; hld/amendment/non-s1 refuse with clear errors` |

## 6. Migration

**State before:** Every tracker layer was DEF-only or DEF-biased: context via requireApprovedEpic (gates.ts:237), persistence via DEF json paths with existsSync in mutateEpicTrackerMeta (orchestrator.ts:2972) and sync.ts:59/106 (a corrupt DEF could win over a valid ISSUE), the push prompt's existingRefs rule ("error unless --force", index.ts:290) and Epic/Story conventions (task list, back-reference) conflict with one shared root/s1 issue, chain computeNextAction ISSUE branch skipped tracker steps (chain.ts:325-360), an ISSUE without meta.tracker.issueRef (approved while tracking disabled) could not be published once or later closed (bugfix/tracker.ts:268-289), and linkDocsToIssues hardcoded 'epic' placement (link.ts:46-57).

**State after:** tracker.push/sync/post accept, execute, persist and link ISSUE-anchored work items end to end: one readable head (DEF-then-ISSUE, first-READABLE-wins) resolved identically by context and persistence; the ISSUE push prompt creates/adopts exactly ONE issue with the ISSUE body as the authoritative body, labels epicLabel+epic:<slug>, no self-references, adoption without --force; finalize writes meta.tracker (incl. issueRef on first publication) onto the ISSUE json and binds EPIC/STORY-s1 heads so the bugfix close path works; the chain offers push-tracker -> sync-tracker -> chain-complete; docs relink under docs/standalone with ISSUE.md refreshed and no docs/epics duplicate. DEF-head code and prompt bytes identical to before.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. No migration/backfill: in-process behavior fix. stateBefore/after as above. Existing ISSUE-anchored items adopt their approval-created ref automatically on the next tracker run (existingRefs seeded from ISSUE.meta.tracker.issueRef); items without one get their single issue on first push. No stored data rewritten. — ↩ rollbackable

**Backward compat:** Fully backward compatible at code AND prompt level: headKind is optional and defaults to 'def', and pushPrompt/pushVerifyPrompt for 'def'/undefined reproduce today's bytes exactly (byte-equality test plus existing runner tests). Every other change branches on the readable head kind; DEF-headed work items take byte-identical code paths at context, persistence, chain and linkage. New exports requireApprovedDefinition, definitionHeadJsonPath, renderIssueEpicBody are additive; linkDocsToIssues's headKind is optional and defaults to the readable head. No artifact format changes — ISSUE artifacts already carry meta.tracker (issueRef from bugfix approval) and EPIC/STORY heads already carry meta.envelope.binding; the first-publication write-back uses the same patchTrackerMeta shape.

## 7. Alternatives considered

### 7.1 a1: Kind-aware head end to end (context + persistence + chain + adoption + linkage) — **CHOSEN**

One definitionHeadJsonPath/requireApprovedDefinition rule at all five layers; integration tests per finding; DEF byte-identical.

Carry the DEF-then-ISSUE head kind end to end through all five layers with one head-path helper. gates.ts gains requireApprovedDefinition (approved-gated, { kind, artifact, jsonPath }) and definitionHeadJsonPath (DEF json if existsSync else ISSUE json — the storage.ts readEpicDefinitionCore order). Layers: (1) context assemblers branch on kind (DEF byte-identical; ISSUE via impliedIssueStories + issue title + new renderIssueEpicBody); (2) persistence: mutateEpicTrackerMeta (orchestrator.ts:2972) and sync.ts (:59, :106, :164) use definitionHeadJsonPath/impliedIssueStories so meta.tracker lands on ISSUE-<hash>.json with zero DEF fabricated; (3) chain computeNextAction ISSUE branch (chain.ts:325-360) falls through to the DEF tracker steps after the story loop; (4) adoption: push seeds PushContext.existingRefs.epicRef + storyRefs[s1] from ISSUE.meta.tracker.issueRef and finalize binds EPIC-<hash> + STORY-<hash>-s1 heads to it via bindUnitIssue (idempotent same-ref, conflict different-ref) — retries create 0 new remote issues; (5) linkDocsToIssues takes headKind, placement from workItemKindOf + anchor from requireEpicAnchor, ISSUE heads relink ISSUE.md + standalone s1 LLD.md and skip HLD/Define, never create docs/epics. Tests per layer incl. finalize on ISSUE-only fixture (readdir zero DEF), four-state chain sequence, adoption create-count 0 + conflict, linkage no-duplicate-folder.

### 7.2 a2: Persistence + chain only

Findings 1-2 fixed; 3-4 deferred.

Fix only persistence + chain (findings 1-2); defer adoption + linkage to a follow-up.

**Rejected because:** Leaves HIGH finding 3 (duplicate remote issue via invisible issueRef) and MED finding 4 (docs/epics duplicate) open — the review blocks on all four

### 7.3 a3: Backfill bindings at approval

Approval writes EPIC/STORY-s1 bindings.

Backfill EPIC/STORY bindings at ISSUE approval time so unitIssueOf-based readers see the issue without per-layer kind branches, plus the linkDocsToIssues placement fix.

**Rejected because:** Mutates the approval path (out of scope), still needs the chain branch and persistence head-path fix, and risks double-binding against bugfix/tracker.ts recordRefToDisk

### 7.4 a4: Declare tracker stages DEF-only for bugs

Chain-complete after LLD for ISSUE heads.

Keep generic tracker stages DEF-only for bugs: chain stays chain-complete after LLD for ISSUE heads; bugs use only bugfix/tracker.ts create/close.

**Rejected because:** Is exactly the bug the ISSUE and finding 2 describe: unpushed ISSUE items reporting chain-complete

## 8. References

- **[[c1]]** `code` `src/workflow/orchestrator.ts:2919-3027` — "finalizeTracker -> mutateEpicTrackerMeta reads/writes DEF-<hash>.json only (orchestrator.ts:2919, 2972-3026) — push+sync finalize ENOENT on an ISSUE-only fixture; sync.ts defineJson/patch :59/:106, st"
- **[[c2]]** `code` `src/workflow/chain.ts:325-360` — "computeNextAction ISSUE branch (chain.ts:325-360) returns chain-complete at :360 without consulting s.tracker; DEF branch does push-tracker/sync-tracker/chain-complete (:425-441); readTrackerMeta (:27"
- **[[c3]]** `code` `src/workflow/bugfix/tracker.ts:382-392` — "bugfix approval records the GH ref in ISSUE meta.tracker.issueRef (recordRefToDisk bugfix/tracker.ts:389); unitIssueOf reads EPIC/STORY head bindings (unit-head.ts:36, binding.ts:85); bindArtifact ide"
- **[[c4]]** `code` `src/workflow/tracker/link.ts:46-70` — "linkDocsToIssues builds all doc paths with placement 'epic' (link.ts:46-57); workItemKindOf (storage.ts:466), requireEpicAnchor (storage.ts:562), issueArtifactPaths (storage.ts:942)."
- **[[c5]]** `code` `src/workflow/runners/tracker/context.ts:41-199` — "Assemblers (context.ts:41-199) call requireApprovedEpic (gates.ts:237); readDefineArtifact (gates.ts:153) is DEF-only; impliedIssueStories (storage.ts:707)."
- **[[c6]]** `code` `src/workflow/runners/tracker/schemas.ts:145` — "PushContext.existingRefs (schemas.ts:145) with adopt-don't-duplicate semantics (index.ts:290,319); seedIssueRepo fixture pattern (issue-anchored-route.test.ts)."
