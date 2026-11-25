<!-- insrc:artifact LLD-5f9d4ab4c90c0b4c-s1 -->

# LLD: STORY-5f9d4ab4c90c0b4c-s1 — Make the tracker push, sync and post stages handle an ISSUE-anchored work item

## Summary

**Epic:** `make-tracker-push-sync-post-stages`
**HLD base run:** `wf-1795498420280-h8ye0z`
**HLD effective hash:** `3759c9a350cf...`
**Tracker:** [insors-ai/insrc#295](https://github.com/insors-ai/insrc/issues/295)

Final LLD (closing the rev-3 review's 1 HIGH + 2 MED on top of the pass-3 five-layer design): tracker.push/sync/post fully support ISSUE-anchored work items. (HIGH) Context schemas gain optional headKind; pushPrompt/pushVerifyPrompt (src/workflow/runners/tracker/index.ts) emit an ISSUE block for headKind 'issue' — ONE issue, the prerendered ISSUE markdown as the single authoritative body, labels epicLabel + epic:<slug> only, no task-list/back-reference/sub-issues (self-references), and adoption of an existing epicRef WITHOUT --force (the 'existingRefs error unless --force' rule does not apply to adopted ISSUE refs); the ISSUE verify checklist is issueLabelled + bodyMatches + singleIssue. Prompt-text unit tests pin both kinds; DEF is byte-identical at code and prompt level. (MED) One readable-head rule — readArtifactCore first-READABLE-wins, DEF then ISSUE, same as storage.ts readEpicDefinitionCore — backs requireApprovedDefinition, definitionHeadJsonPath and every persistence site (mutateEpicTrackerMeta, sync.ts), so a corrupt DEF can never be persisted into while context reads the ISSUE; corrupt-DEF/valid-ISSUE finalize test proves it. (MED) First publication with no issueRef (approved while tracking disabled): the ISSUE prompt creates exactly ONE remote issue, finalize writes the ref back to ISSUE.meta.tracker.issueRef AND binds EPIC/STORY-s1 heads so closeBugfixTrackerIssue can close at completion; a partial run adopts on retry with zero duplicate creates. Pass-3 layers unchanged: persistence via the resolved head, chain ISSUE branch (push-tracker -> sync-tracker -> chain-complete, no HLD/amendment/stale), adoption of ISSUE.meta.tracker.issueRef as the single root+s1 issue, kind-aware linkDocsToIssues placement under docs/standalone.

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
- First readable head in DEF-then-ISSUE order with kind + jsonPath; head approved

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
- DEF json when it exists (DEF wins), else ISSUE json — storage.ts readEpicDefinitionCore order

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
- DEF head: byte-identical to today
- ISSUE head: patchTrackerMeta lands on ISSUE-<hash>.json; linkDocsToIssues called with head kind; zero DEF files created; post no-op at head level

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

### 2.6 `adoptApprovalCreatedIssue`

```typescript
function adoptApprovalCreatedIssue(repoPath: string, epicHash: string): string | undefined
```

**Parameters:**
- `repoPath: string` — Repo root
- `epicHash: string` — ISSUE hash

**Returns:** `string | undefined` — Adopted ref surfaced via PushContext.existingRefs and persisted as unit bindings

**Errors:**
- `BindResult kind 'conflict'` when adopted issueRef conflicts with an existing head binding to a different issue

**Preconditions:**
- ISSUE head approved
- gh config github

**Postconditions:**
- assemblePushContext for ISSUE heads seeds existingRefs.epicRef AND existingRefs.storyRefs[IMPLIED_ISSUE_STORY_ID] from ISSUE meta.tracker.issueRef when set — execute adopts, 0 new remote issues on retry
- finalize push binds EPIC-<hash> and STORY-<hash>-s1 heads to that ref via bindUnitIssue (idempotent same-ref; conflict refuses different-ref)
- completion = both head bindings present + meta.tracker written on the ISSUE head

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
- DEF head: byte-identical (HLD.md+Define.md+LLDs under docs/epics, DEF.md tracker line via unitIssueOf as today)
- ISSUE head: placement = workItemKindOf(head.meta) ('standalone'), anchor = requireEpicAnchor; relinks ISSUE.md via issueArtifactPaths with renderIssueMarkdownWithTracker (adds the **Tracker:** line from the head binding / meta.tracker.issueRef; body bytes otherwise identical to renderIssueMarkdown) + implied story LLD.md (lldArtifactPaths 'standalone'); HLD/Define skipped; no docs/epics entry created

### 2.8 `PushContext / SyncContext / PostContext schemas (headKind)`

```typescript
interface PushContext { ...; headKind?: 'def' | 'issue' }  // same on SyncContext, PostContext (src/workflow/runners/tracker/schemas.ts)
```

**Parameters:**
- `headKind: 'def' | 'issue'` _(optional)_ — Drives the ISSUE prompt block; 'def' (default) is byte-identical to today

**Returns:** `PushContext | SyncContext | PostContext` — Tracker context schemas extended additively

**Postconditions:**
- headKind 'issue' carries the prerendered single-issue body (epicBodyMd) and adopted existingRefs
- DEF default keeps every field and prompt byte-identical (byte-equality test)

### 2.9 `pushPrompt / pushVerifyPrompt (ISSUE block)`

```typescript
function pushPrompt(c: PushContext): string  // pushVerifyPrompt(c) likewise; both branch on c.headKind (src/workflow/runners/tracker/index.ts)
```

**Parameters:**
- `c: PushContext` — PushContext; headKind 'issue' gets the ISSUE block

**Returns:** `string` — Execute/verify prompt strings

**Preconditions:**
- kind-aware context from assemblePushContext

**Postconditions:**
- ISSUE context: ONE issue; authoritative body = epicBodyMd verbatim; labels epicLabel + epic:<slug>; adopt existingRefs.epicRef WITHOUT --force — when adopting, add the required labels idempotently using the SUPPORTED singular flag `gh issue edit <N> --add-label "epicLabel,epic:<slug>"` (the daemon tool gh_issue_edit maps addLabels -> `--add-label`, src/daemon/tools/builtins/gh/issue.ts:234,273; the plural --add-labels is rejected by the CLI) via ensureLabel first; only body edits need --force; no sub-issues, no ## Stories task list, no **Epic:** back-reference (self-references)
- verify prompt for ISSUE: issueLabelled + bodyMatches + singleIssue; taskList/backRef absent or pass-by-construction; adoption complete only when the issue carries epicLabel AND epic:<slug>
- DEF context: byte-identical to today

### 2.10 `adoptOrPublishIssue (push context + finalize)`

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
- If ISSUE.meta.tracker.issueRef (readTrackerMeta) is set: seed existingRefs.epicRef + storyRefs[IMPLIED_ISSUE_STORY_ID]; ISSUE prompt adopts WITHOUT --force, labels added idempotently via singular --add-label (2.6a); finalize binds EPIC-<hash> + STORY-<hash>-s1 heads via bindUnitIssue (idempotent same-ref, conflict refuses); 0 new remote issues
- If absent: the push path uses an ATOMIC CREATE-IF-ABSENT CLAIM, not a plain intent write
- CLAIM (HIGH fix): BEFORE dispatching the mutating execute step, claimCreateIntent(repoPath, epicHash, runId) does writeFileSync(path, payload, { flag: 'wx', mode: 0o600 }) on .insrc/artifacts/PENDING-CREATE-<epicHash>.json (the same exclusive-create primitive the daemon uses for run files, src/daemon/run-file-ownership.ts:101 / managed-update-preparation.ts:46 — writeAtomic's tmp+rename would overwrite, 'wx' fails with EEXIST). Payload: { epicHash, runId (owner), owner, repo, title: issue.body.title, marker: '<!-- insrc:artifact ISSUE-<epicHash> -->', state: 'pending', createdAt, heartbeatAt }. On EEXIST the run reads the existing claim: if the owner's heartbeat is fresh (still executing) and state is 'pending'/'created', this run REFUSES to dispatch a create and instead adopts/reconciles per the claim; if the claim is abandoned (stale heartbeat, no persisted issueRef/head bindings), it may be displaced only by an ownership-verified replace.
- RECONCILIATION RULE (ownership-safe): unresolved 'pending' claim (abandoned, or after a lost execute response) -> no create; candidates by persisted title via ghListIssuesByTitleTokenStrict (registry-table.ts:331), each body-verified by verifyRecoveryCandidate (2.6c: exact ISSUE-<hash> marker + owner/repo target); exactly one verified candidate -> adopt (update claim to 'created' under ownership check, persist issueRef + head bindings), 0 creates; zero or >1 verified -> explicit refusal naming the claim, human resolves. 'created' claims adopt their durable refs with 0 creates.
- ALL claim ops (create, heartbeat, pending->created, takeover, delete) run inside the claim mutex and carry the fencing token; a displaced owner is rejected with ClaimOwnershipError and fenced from ALL subsequent persistence (issueRef write-back, head bindings, claim delete), closing the check-then-write race

### 2.11 `renderIssueMarkdownWithTracker (local ISSUE.md renderer)`

```typescript
export function renderIssueMarkdownWithTracker(artifact: IssueArtifact, repoPath: string): string  // src/workflow/artifacts/issue.ts
```

**Parameters:**
- `artifact: IssueArtifact` — The ISSUE artifact; body bytes are the canonical remote body
- `repoPath: string` — Repo root used to read the unit binding (unitIssueOf) or meta.tracker.issueRef

**Returns:** `string` — renderIssueMarkdown(artifact) bytes PLUS a tracker line in the Summary area when a ref exists — remote body unchanged

**Preconditions:**
- artifact.body has title/reproduction/rootCause/fixIntent

**Postconditions:**
- Returns renderIssueMarkdown(artifact) verbatim with ONE added line `**Tracker:** [owner/repo#N](https://github.com/owner/repo/issues/N)` (trackerRefLine, refs.ts:94) inserted after the artifact-id marker when unitIssueOf(repoPath, issueHash) or readTrackerMeta resolves meta.tracker.issueRef
- The remote GH issue body remains renderIssueMarkdown(artifact) with NO tracker line (tracker link is local-doc-only, same as DEF.md's Summary envelope which uses unitIssueOf, define.ts:115-116)
- No ref -> output byte-identical to renderIssueMarkdown(artifact)

### 2.12 `verifyRecoveryCandidate (identity proof before adopt/mutate)`

```typescript
async function verifyRecoveryCandidate(port: TrackerPort, repoPath: string, epicHash: string, candidateRef: string): Promise<{ ok: true; ref: string } | { ok: false; reason: string }>
```

**Parameters:**
- `port: TrackerPort` — Tracker port for readBody (ghGetIssueBody) / state reads
- `repoPath: string` — Repo root (marker check needs the expected artifact id)
- `epicHash: string` — Work-item hash; expected marker is ISSUE-<epicHash>
- `candidateRef: string` — Candidate issue ref from the recovery record or title lookup

**Returns:** `{ ok: true; ref } | { ok: false; reason }` — ok only when the candidate's remote body contains the canonical `<!-- insrc:artifact ISSUE-<epicHash> -->` marker AND its owner/repo match the configured tracker target

**Errors:**
- `Error` when candidate set is empty after verification, more than one distinct ref survives, or any candidate's body lacks the marker / targets a different repo — refuse: no adoption, no label adds, no create

**Preconditions:**
- recovery record or title lookup produced >=1 candidate
- artifactIdMarker format: `<!-- insrc:artifact <ID> -->` (storage.ts:873)

**Postconditions:**
- Reads the candidate body via ghGetIssueBody (registry-table.ts:270); requires the exact line `<!-- insrc:artifact ISSUE-<epicHash> -->` (the same marker renderIssueMarkdown emits at the top of the remote body) and owner/repo == configured target
- Title matches are candidate generators only (ghListIssuesByTitleTokenStrict, registry-table.ts:331 — 'strict' covers lookup failure, not uniqueness); identity comes from the marker + target check
- Ambiguous or mismatched -> refuse with a clear error before any adoption, label mutation, or create

### 2.13 `claimCreateIntent + withClaimLock (mutex + fencing token on every claim op)`

```typescript
function claimCreateIntent(repoPath: string, epicHash: string, runId: string): { claimed: true } | { claimed: false; existing }  // create-if-absent under the claim mutex; ALL claim ops go through withClaimLock(repoPath, epicHash, runId, expectedFence, op)
```

**Parameters:**
- `repoPath: string` — Repo root; claim at repo .insrc/artifacts/PENDING-CREATE-<epicHash>.json (storage.ts:59/865)
- `epicHash: string` — Work-item hash; claim file name and mutex key
- `runId: string` — Owning run id

**Returns:** `{ claimed: true } | { claimed: false; existing }` — claimed:true only when the 'wx' create succeeded while holding the claim mutex

**Errors:**
- `ClaimOwnershipError` when any update/delete/takeover whose expectedFence does not equal the current claim's fence token — the op is rejected and the caller is fenced
- `EEXIST surfaced as claimed:false` when claim file exists at create time
- `Error (guard conflict evidence)` when acquisition hits EEXIST against a live guard owner — fail closed with the conflict evidence, never reclaim a live holder

**Preconditions:**
- called BEFORE the tracker.push execute step is dispatched; all later claim ops hold the same mutex

**Postconditions:**
- Exactly one run holds the claim at a time: the claim file is created under the claim mutex with flag 'wx' (EEXIST -> claimed:false).
- MUTEX LIFECYCLE (MED fix): the lock is a DIRECTORY guard, not a bare lock file — acquireRunFileGuard (src/shared/daemon-run-files.ts) pattern: mkdirSync(path, 0o700) + owner.json written with flag 'wx' inside, carrying ProcessIdentity { pid, startedAt, commandLine } + nonce. RELEASE: the holder removes its own guard on exit (recursive rm of its own pinned directory only, assertOwned first). CRASH RECOVERY: a newcomer that gets EEXIST runs quarantineDeadGuard (daemon-run-files.ts:269) — if owner.json's recorded pid is conclusively dead (pid liveness probe), the dead guard is quarantined (renamed aside under a reclaim claim) and re-acquired; a LIVE holder is never touched (the verdict withholds and the newcomer waits/fails closed with the conflict evidence). This is exactly the daemon guard's ownership/reclamation logic, not just O_EXCL.
- So a crashed mutex holder never permanently blocks claim recovery; a fresh push reaches reconciliation after the crash, and a live holder is never broken.
- FENCE token as before: every claim op under the mutex requires expectedFence === current and writes fence+1 in the same critical section; displaced owners are fenced from all later persistence with ClaimOwnershipError before any write.
- TAKEOVER only for abandoned claims (stale heartbeat AND no persisted issueRef/head bindings), inside the mutex.

### 2.14 `claimQueueKey (claim mutex mapped onto the artifact write-authority queue) + lock ordering`

```typescript
const claimQueueKey = ArtifactIds.make({ kind: 'ISSUE', epicHash })  // 'ISSUE-<hash>' is a valid artifact id (SHAPES, artifact-ids.ts:70-95), so FileArtifactStore.exclusive / the daemon authority handler accept it; the on-disk claim file stays .insrc/artifacts/PENDING-CREATE-<epicHash>.json
```

**Parameters:**
- `epicHash: string` — ISSUE-<hash> IS a valid queue key; PENDING-CREATE-<hash> is not (ArtifactIds.parse rejects unknown kinds) — the claim mutex uses the former, the claim file the latter

**Returns:** `string (artifact id)` — the authority-accepted key for the claim's critical section

**Preconditions:**
- all claim ops go through withArtifactWriteAuthority(repoPath, 'ISSUE-<hash>', op)

**Postconditions:**
- LOCK ORDERING: claim mutex (key ISSUE-<hash>) is always acquired BEFORE any artifact write on ISSUE-<hash>, EPIC-<hash>, STORY-<hash>-s1, PENDING-CREATE file; nested artifact writes inside a claim op run under the same authority so ordering is consistent (claim lock -> artifact write). Never the reverse: an artifact write in progress never blocks claim acquisition for longer than the current op because the claim key is distinct from the artifact key.
- Cross-process correctness comes from the lock-directory guard (dead-owner quarantine); the authority queue serializes in-process work on the same key.
- Test crosses the REAL worker/authority boundary: a daemon worker calls the authority handler with key ISSUE-<hash> and the claim op runs inside it (not a local mutex mock).

## 3. Data model changes

### 3.1 `DefinitionHead resolution (readable-wins, one rule)` — invariant-change

One readable-head rule (readArtifactCore first-READABLE-wins via tryParse, DEF then ISSUE — identical to storage.ts readEpicDefinitionCore and resolve.ts readEpicDefinition) backs requireApprovedDefinition, definitionHeadJsonPath, and through them every persistence site (mutateEpicTrackerMeta, sync.ts), so a corrupt DEF can never be persisted into while context reads the ISSUE.

**Call sites:**
- `src/workflow/storage.ts:644-700`
- `src/workflow/tracker/resolve.ts:216-227`
- `src/workflow/gates.ts:153-261`

### 3.2 `Finalize persistence target (head JSON)` — invariant-change

mutateEpicTrackerMeta switches defineJson to definitionHeadJsonPath and passes head kind to linkDocsToIssues; push binds EPIC/STORY-s1 heads from the adopted issueRef for ISSUE heads.

**Call sites:**
- `src/workflow/orchestrator.ts:2919`
- `src/workflow/orchestrator.ts:2972-3026`

### 3.3 `Sync persistence + story list source` — invariant-change

sync.ts defineJson := definitionHeadJsonPath; storiesOf branches DEF -> readDefineArtifact ids, ISSUE -> impliedIssueStories; patchTrackerMeta target likewise.

**Call sites:**
- `src/workflow/tracker/sync.ts:59`
- `src/workflow/tracker/sync.ts:106`
- `src/workflow/tracker/sync.ts:164`

### 3.4 `ChainReport.nextAction for ISSUE-anchored items` — field-modify

computeNextAction ISSUE branch falls through to the DEF tracker steps after the story loop; HLD/amendment/stale remain skipped for ISSUE heads.

**Call sites:**
- `src/workflow/chain.ts:325-360`
- `src/workflow/chain.ts:425-441`

### 3.5 `TrackerBinding identity for an ISSUE-anchored work item` — invariant-change

Adoption contract: ISSUE.meta.tracker.issueRef (bugfix approval) is the work-item root issue AND the single s1 story issue; push seeds existingRefs from it; finalize binds EPIC-<hash> + STORY-<hash>-s1 heads idempotently; conflicts refuse; no duplicate creates on retry.

**Call sites:**
- `src/workflow/runners/tracker/context.ts:62-67`
- `src/workflow/bugfix/tracker.ts:382-392`
- `src/workflow/tracker/unit-head.ts:36`
- `src/workflow/tracker/binding.ts:126-145`

### 3.6 `Doc-issue linkage placement` — invariant-change

linkDocsToIssues takes headKind; placement from workItemKindOf, anchor from requireEpicAnchor; ISSUE heads relink ISSUE.md via issueArtifactPaths + renderIssueMarkdownWithTracker (tracker link line from the binding, body bytes canonical) + standalone LLD.md; skip HLD/Define docs.

**Call sites:**
- `src/workflow/tracker/link.ts:46-70`
- `src/workflow/storage.ts:466`
- `src/workflow/storage.ts:550-567`
- `src/workflow/storage.ts:937-960`
- `src/workflow/artifacts/issue.ts`
- `src/workflow/tracker/refs.ts:94`

### 3.7 `Tracker execute/verify prompt contract per head kind` — field-add

Context schemas gain optional headKind; pushPrompt/pushVerifyPrompt branch on it — ISSUE block: single issue, authoritative prerendered body, labels epicLabel+epic:<slug>, adopt without --force, no task-list/back-ref/sub-issues; verify = issueLabelled+bodyMatches+singleIssue; DEF byte-identical (byte-equality test).

**Call sites:**
- `src/workflow/runners/tracker/index.ts:228-352`
- `src/workflow/runners/tracker/schemas.ts:119-160`

### 3.8 `Finalize persistence target + issueRef write-back` — invariant-change

mutateEpicTrackerMeta persists to definitionHeadJsonPath (readable-head rule); ISSUE push writes meta.tracker.issueRef back on first publication and binds EPIC/STORY-s1 heads so closeBugfixTrackerIssue can close; partial-run retry adopts via onLostRefAfterCreate.

**Call sites:**
- `src/workflow/orchestrator.ts:2919-3027`
- `src/workflow/bugfix/tracker.ts:268-300`

### 3.9 `Pending-create claim (PENDING-CREATE-<epicHash>.json, atomic create-if-absent via flag wx, owning runId)` — new

Claim mutex key = ArtifactIds.make({ kind: 'ISSUE', epicHash }) (valid authority key, SHAPES artifact-ids.ts:70); on-disk claim file stays .insrc/artifacts/PENDING-CREATE-<epicHash>.json (not an artifact id — only the queue key must be one). Mutex is a lock DIRECTORY via acquireRunFileGuard pattern (mkdir + owner.json 'wx', daemon-run-files.ts): release = holder removes its own pinned guard; crash recovery = quarantineDeadGuard (:269) reclaims only conclusively dead owners, live holders fail closed. Lock ordering: claim mutex before any artifact write on ISSUE/EPIC/STORY-s1 keys. Fence token increments per op inside the mutex.

**Call sites:**
- `src/workflow/storage.ts:341`
- `src/workflow/storage.ts:1261`
- `src/workflow/runners/tracker/context.ts:41-108`
- `src/workflow/tracker/registry-table.ts:331`
- `src/daemon/run-file-ownership.ts:101`
- `src/daemon/managed-update-preparation.ts:46`
- `src/shared/daemon-run-files.ts:112`
- `src/daemon/source-store-probe.ts:59`
- `src/workflow/artifact-core/write-authority.ts`
- `src/workflow/artifact-core/store.ts:258`
- `src/workflow/artifact-ids.ts:70-95`
- `src/shared/daemon-run-files.ts:269`
- `src/workflow/artifact-core/store.ts:249-262`

### 3.10 `Pending-create claim (PENDING-CREATE-<epicHash>.json, atomic create-if-absent via flag wx, owning runId)` — new

Claim mutex key = ArtifactIds.make({ kind: 'ISSUE', epicHash }) (valid authority key, SHAPES artifact-ids.ts:70); on-disk claim file stays .insrc/artifacts/PENDING-CREATE-<epicHash>.json (not an artifact id — only the queue key must be one). Mutex is a lock DIRECTORY via acquireRunFileGuard pattern (mkdir + owner.json 'wx', daemon-run-files.ts): release = holder removes its own pinned guard; crash recovery = quarantineDeadGuard (:269) reclaims only conclusively dead owners, live holders fail closed. Lock ordering: claim mutex before any artifact write on ISSUE/EPIC/STORY-s1 keys. Fence token increments per op inside the mutex.

**Call sites:**
- `src/workflow/storage.ts:59`
- `src/workflow/storage.ts:83`
- `src/workflow/storage.ts:865`
- `src/workflow/storage.ts:873`
- `src/workflow/runners/tracker/context.ts:41-108`
- `src/workflow/runners/tracker/index.ts`
- `src/daemon/run-file-ownership.ts:101`
- `src/daemon/managed-update-preparation.ts:46`
- `src/shared/daemon-run-files.ts:112`
- `src/daemon/source-store-probe.ts:59`
- `src/workflow/artifact-core/write-authority.ts`
- `src/workflow/artifact-core/store.ts:258`
- `src/workflow/artifact-ids.ts:70-95`
- `src/shared/daemon-run-files.ts:269`
- `src/workflow/artifact-core/store.ts:249-262`

### 3.11 `Recovery candidate identity verification (ISSUE-<hash> marker + tracker target)` — new

verifyRecoveryCandidate reads the candidate remote body (ghGetIssueBody registry-table.ts:270) and requires the exact artifact marker line (artifactIdMarker storage.ts:873) and matching owner/repo; title lookup is only a candidate generator (ghListIssuesByTitleTokenStrict registry-table.ts:331); ambiguous/mismatched -> refuse before adopt/mutate/create.

**Call sites:**
- `src/workflow/tracker/registry-table.ts:270`
- `src/workflow/tracker/registry-table.ts:331`
- `src/workflow/storage.ts:873`
- `src/daemon/tools/builtins/gh/issue.ts:234`
- `src/daemon/tools/builtins/gh/issue.ts:273`

### 3.12 `Unresolved-intent reconciliation gate` — new

assemblePushContext first checks PENDING-CREATE-<epicHash>.json: state 'pending' -> no create permitted, reconcile via candidate discovery + marker/target verification; state 'created' -> adopt refs from the intent (no create); absent + no persisted issueRef -> normal first-publication create (after writing the intent).

**Call sites:**
- `src/workflow/runners/tracker/context.ts:41-108`
- `src/workflow/runners/tracker/index.ts`
- `src/workflow/storage.ts:59`
- `src/workflow/storage.ts:83`
- `src/workflow/storage.ts:865`
- `src/workflow/tracker/registry-table.ts:331`

### 3.13 `Claim liveness (heartbeat + abandoned detection)` — new

Owner refreshes heartbeatAt while execute is in flight (ownership-checked). Abandoned iff heartbeat older than claimStaleAfterMs (default 10 min) AND no persisted issueRef/head bindings — live-executing vs abandoned distinguished by heartbeat.

**Call sites:**
- `src/workflow/runners/tracker/index.ts`
- `src/workflow/runners/tracker/context.ts:41-108`
- `src/workflow/storage.ts:59`
- `src/workflow/storage.ts:83`
- `src/workflow/storage.ts:865`

### 3.14 `Claim mutex (guard-directory lock, key ISSUE-<hash>) + fencing token` — new

Mutex = lock-directory guard (acquireRunFileGuard/quarantineDeadGuard, daemon-run-files.ts) keyed to the authority-accepted id ISSUE-<hash> via withArtifactWriteAuthority (write-authority.ts, store.ts:249-262); lock ordering claim-before-artifact-writes. Fence token in the claim payload increments per op under the mutex; stale-fence ops rejected with ClaimOwnershipError before any write and fenced from later persistence.

**Call sites:**
- `src/shared/daemon-run-files.ts:269`
- `src/workflow/artifact-ids.ts:70-95`
- `src/workflow/artifact-core/write-authority.ts`
- `src/workflow/artifact-core/store.ts:249-262`

## 4. Error paths

**Error cases**

- **tracker finalize/sync for a hash with no head** (recoverable)
  - Detection: definitionHeadJsonPath's existsSync misses both head jsons
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
- **tracker disabled via repo config** (recoverable)
  - Detection: resolveGithubConfig type 'none'
  - Response: requireGithubAdapter throws the existing disabled-tracker error
  - User impact: Unchanged
- **remote issue created but issueRef persistence failed; next push runs** (recoverable)
  - Detection: assemblePushContext finds the prior run artifact with an execute-returned epicRef while ISSUE json has no issueRef and no head bindings
  - Response: load the prior epicRef into existingRefs as adopt-only (or re-discover by unique title via ghListIssuesByTitleTokenStrict); NO create permitted; retry persists issueRef + head bindings
  - User impact: No duplicate remote issues across attempts; recovery survives a fresh workflow invocation
- **adopted issue lacks the labels the verify checklist requires** (recoverable)
  - Detection: pushVerifyPrompt sees missing epicLabel / epic:<slug> on the adopted issue
  - Response: adoption itself adds the labels idempotently (ensureLabel + add-labels) without --force and without touching the body; only body edits need --force
  - User impact: Adoption converges without violating the no-edit rule
- **candidate identity cannot be proven** (recoverable)
  - Detection: verifyRecoveryCandidate: marker line missing, owner/repo mismatch, or >1 distinct candidate after filtering
  - Response: refuse with a clear error before any adoption, label add, or create
  - User impact: No labels ever added to an unrelated issue
- **unresolved pending-create intent at next push** (recoverable)
  - Detection: PENDING-CREATE-<epicHash>.json exists with state 'pending'
  - Response: no create; reconcile by title (ghListIssuesByTitleTokenStrict) + body marker (verifyRecoveryCandidate); one verified candidate -> adopt with 0 creates; otherwise explicit refusal
  - User impact: Fresh retries are safe without an injected ref; duplicates impossible
- **second concurrent tracker.push on the same epicHash** (recoverable)
  - Detection: claimCreateIntent gets EEXIST on PENDING-CREATE-<epicHash>.json
  - Response: claimed:false; the competing run does not dispatch a create, does not overwrite, does not delete; it reconciles from the live claim or refuses on a fresh heartbeat
  - User impact: Exactly one remote issue across concurrent runs
- **claim update/delete by a non-owner run** (terminal)
  - Detection: re-read shows claim.runId !== this runId
  - Response: abort without touching the file
  - User impact: Intent ownership preserved
- **claim op with a stale fencing token (displaced owner)** (terminal)
  - Detection: inside the claim mutex, expectedFence !== current fence
  - Response: ClaimOwnershipError before any write; the run is fenced from all subsequent persistence
  - User impact: No check-then-write overwrite is possible
- **lock file left behind by a crashed holder** (recoverable)
  - Detection: mkdir EEXIST, owner.json pid probe returns dead
  - Response: quarantineDeadGuard renames the dead guard aside under a reclaim claim and re-acquires; live owners are never reclaimed
  - User impact: Crash never permanently blocks claim recovery
- **claim op through a key the artifact authority rejects** (recoverable)
  - Detection: ArtifactIds.parse('PENDING-CREATE-<hash>') === undefined (unknown kind)
  - Response: use ISSUE-<hash> as the authority queue key (valid SHAPES kind); the claim FILE may keep the PENDING-CREATE name since it bypasses the artifact store
  - User impact: Claim mutex works through the real worker/authority boundary

**Edge cases**

| Input | Expected |
| :--- | :--- |
| DEF-<hash>.json unparseable, ISSUE-<hash>.json valid+approved; tracker.push finalize | BOTH helpers resolve the ISSUE (kind 'issue', ISSUE json path); finalize writes meta.tracker onto the ISSUE json, never the corrupt DEF; zero DEF files created |
| Both DEF-<hash>.json and ISSUE-<hash>.json exist (DEF wins, readEpicDefinitionCore order) | definitionHeadJsonPath returns the DEF json; kind 'def'; all layers behave exactly as today |
| DEF malformed, ISSUE parses | Falls through to the ISSUE json when the DEF is corrupt (first-readable-wins) |
| tracker.push then tracker.sync finalize on a seeded ISSUE-anchored repo with a stubbed tracker port | Finalize push on an ISSUE-only fixture writes meta.tracker onto ISSUE-<hash>.json, binds EPIC-<hash> + STORY-<hash>-s1 heads, readdir(.insrc/artifacts) has zero DEF-*.json; finalize sync writes epicStatus/storyStatus/lastSyncedAt onto the ISSUE json |
| buildChainReport across four states of the ISSUE-anchored fixture | Chain on an ISSUE fixture: unpushed+LLD approved -> push-tracker; bound refs, no lastSyncedAt -> sync-tracker; lastSyncedAt set -> chain-complete; never hld/amendment/stale for ISSUE heads |
| tracker.push on an ISSUE fixture whose approval recorded issueRef | Push with ISSUE.meta.tracker.issueRef pre-set: existingRefs.epicRef and storyRefs.s1 are that ref; stubbed port createIssue count == 0; finalize binds both heads to it; a pre-existing head binding to a different issue refuses with kind 'conflict' |
| push finalize on the ISSUE-anchored fixture, then inspect the docs tree | linkDocsToIssues on an ISSUE head rewrites docs/standalone/<slug>-E<anchor>/ISSUE.md and S001/LLD.md with the tracker link, docs/ has no epics entry for the hash, HLD/Define relinks skipped |
| tracker.post variants on the pushed ISSUE fixture | tracker.post lld+s1 posts to the adopted story ref; hld/amendment targets and non-s1 storyIds refuse with clear errors |
| tracker.push retry after simulated issueRef write-back failure on an ISSUE fixture | Next run re-reads, adopts via existingRefs re-read / onLostRefAfterCreate; 0 duplicate creates; run completes |
| approve ISSUE with cfg type 'none' -> enable tracking -> push -> retry (simulated write-back failure) -> bugfix completion | First push creates exactly ONE remote issue; finalize writes issueRef to ISSUE json AND binds EPIC/STORY-s1 heads; closeBugfixTrackerIssue closes via readRecordedRef |
| pushPrompt(c)/pushVerifyPrompt(c) with c.headKind='issue' — string assertions | ISSUE block present (ONE issue, body=epicBodyMd, labels epicLabel+epic:<slug>, adopt epicRef without --force) and 'error unless'/task-list/backRef/sub-issue text absent |
| pushPrompt(c) with c.headKind undefined — byte-equality assertion | DEF-context prompt byte-identical to captured baseline; ISSUE block absent |
| adoption of an issue created with defaultTrackerCreateDeps (labels: []) and no epicLabel/epic:<slug> | ISSUE push adds epicLabel + epic:<slug> idempotently (ensureLabel + gh issue edit --add-labels) WITHOUT --force and without body edit; verify checklist issueLabelled passes; 0 creates |
| ISSUE.md relink after push on an ISSUE-anchored fixture | docs/standalone/<slug>-E<anchor>/ISSUE.md contains the artifact marker, the canonical body headings (Reproduction/Root cause/Fix intent) byte-identical to renderIssueMarkdown, AND a `**Tracker:** [owner/repo#N](...)` line; with no ref the md is byte-identical to renderIssueMarkdown |
| recovery-record write itself fails | run aborts with an explicit error before any further mutation; no create in that run; next run re-attempts the record write |
| two remote issues share the ISSUE body.title (duplicate titles) | title lookup yields 2 candidates; body-marker verification leaves 0 or filters to the one carrying ISSUE-<hash>; if more than one distinct ref survives -> refuse, no adoption, no label mutation, no create |
| a single remote issue with a matching title but no ISSUE-<hash> marker (unrelated work item) | verification fails (marker absent / wrong target repo); refuse; no labels added to the unrelated issue |
| remote create succeeded, then the intent/recovery record write fails | run fails closed (no further mutation), but PENDING-CREATE-<epicHash>.json already exists with state 'pending'; a FRESH next invocation (nothing injected) sees the unresolved intent, reconciles via title+marker verification, adopts the one verified candidate with createIssue count == 0, updates intent to 'created', persists issueRef + head bindings |
| remote create succeeded, then the execute response is lost before the framework receives refs | intent still state 'pending'; fresh invocation reconciles exactly as above; 0 additional creates |
| intent state 'created' but meta/binding persistence failed | fresh invocation reads refs from the intent file itself (durable, written by the failed run), adopts, 0 creates, persists issueRef + bindings |
| unresolved intent with 0 or >1 marker-verified candidates | explicit refusal error naming PENDING-CREATE-<epicHash>.json; no create, no adoption; human resolves |
| two tracker.push runs paused after context assembly, then both released toward dispatch | first run's claimCreateIntent 'wx' write succeeds; second gets EEXIST -> claimed:false -> refuses to dispatch a create and reconciles; exactly 1 create total; claim runId preserved; loser never updates or deletes the claim |
| fresh heartbeat (owner executing) vs stale heartbeat > claimStaleAfterMs with no persisted refs | live claim -> competing run refuses; abandoned claim -> reconciled under ownership verification or explicit refusal |
| Run A reads its own runId/fence for a heartbeat, pauses; Run B observes stale heartbeat, takes over under the mutex (fence++); Run A resumes and writes its prepared update | A's op enters the mutex, sees current fence = B's (A's expected fence is stale) -> ClaimOwnershipError before any write; A cannot overwrite or delete B's claim and is fenced from issueRef/head-binding persistence |
| two simultaneous reconcilers of an abandoned claim | serialized on the claim mutex; first takes over (fence++); second sees fence mismatch / fresh owner and refuses — exactly one takeover |
| mutex holder is killed (SIGKILL) inside the critical section; fresh run starts | owner.json records a conclusively dead pid -> quarantineDeadGuard reclaims the guard; fresh run acquires, recovers the original claim (adopt/reconcile, 0 new creates); a LIVE holder is never quarantined (conflict fails closed with evidence) |

**Invariants to preserve**

- DEF-head behavior byte-identical at every layer: context assemblers (context.ts:41-199), mutateEpicTrackerMeta bytes (orchestrator.ts:2972-3026), sync patch target DEF json (sync.ts:59-164), chain DEF branch (chain.ts:425-441), linkDocsToIssues docs/epics placement (link.ts:46-70). [[c1]]
- Head order DEF -> ISSUE matches storage.ts readEpicDefinitionCore and resolve.ts readEpicDefinition; definitionHeadJsonPath and requireApprovedDefinition reuse that order. [[c2]]
- Approval gating unchanged: rejected/not-approved heads refuse with ArtifactNotApprovedError naming the head's real md path (gates.ts:237-261). [[c3]]
- A unit has exactly one issue: bindArtifact idempotent same-ref, conflict different-ref (binding.ts:126-145); adoption never rebinds. [[c4]]
- chain readTrackerMeta keeps (define?, issue?) + impliedIssueStories for ISSUE heads; the ISSUE branch adds tracker steps but never HLD/amendment/stale (chain.ts:277-301, 325-360). [[c5]]
- patchTrackerMeta merges meta.tracker key-wise on any artifact json (refs.ts:111-125) — ISSUE heads already carry meta.tracker (issueRef from bugfix approval); no format change. [[c6]]

## 5. Test strategy

**Test framework:** `node:test via npx tsx --test (repo convention); fixtures = seeded temp .insrc/artifacts dirs following seedIssueRepo in src/workflow/__tests__/issue-anchored-route.test.ts + a stubbed tracker port counting createIssue calls`

**Test levels**

- **unit** — definitionHeadJsonPath + requireApprovedDefinition head order/kind/gating/refuse paths; renderIssueEpicBody shape
  - Subjects: `src/workflow/gates.ts new helpers`, `src/workflow/tracker/conventions.ts renderIssueEpicBody`, `src/workflow/runners/tracker/index.ts pushPrompt/pushVerifyPrompt`
  - Fixtures: `temp repo with .insrc/artifacts: approved ISSUE-<hash>.json (epicCreatedAt stamp, optional meta.tracker.issueRef) + marked ISSUE.md + LLD/PLAN jsons; DEF+ISSUE both-present fixture for DEF-wins parity`, `captured DEF prompt baseline string`, `corrupt-DEF + valid-ISSUE fixture`
- **integration** — Finalize push+sync on an ISSUE-only fixture (ISSUE meta written, EPIC/STORY-s1 bindings present, zero DEF files); four-state chain sequence; adoption create-count == 0 + conflict; kind-aware linkage (canonical standalone docs updated, no docs/epics duplicate)
  - Subjects: `src/workflow/orchestrator.ts mutateEpicTrackerMeta + finalizeTracker`, `src/workflow/tracker/sync.ts`, `src/workflow/chain.ts computeNextAction + readTrackerMeta`, `src/workflow/tracker/link.ts linkDocsToIssues`, `src/workflow/runners/tracker/context.ts assemblers`
  - Fixtures: `seedIssueRepo-style ISSUE-anchored repo + stubbed github port (createIssue counter, canned refs) wired through orchestrator finalizeTracker and tracker/sync.ts; seed DEF repo for parity; four-state chain fixture`, `prior tracker.push run artifact (.insrc/<removed>/<epicHash>/tracker.push-<runId>.json + .jsonl) simulating a write-back failure`, `issue pre-created with defaultTrackerCreateDeps labels: []`, `stubbed port that fails recordRef after create (real failure path; recovery record written by the run itself)`, `two remote issues sharing the ISSUE body.title (duplicate-title fixture)`, `one unrelated remote issue with a matching title but no ISSUE marker`, `typed-tool executor stub for gh_issue_edit proving --add-label (singular) argument mapping`, `stubbed port that succeeds at create then fails the intent write (case 1)`, `stubbed port that succeeds at create then drops the execute response (case 2)`, `intent 'created' with meta persistence failed (case 3)`, `duplicate-title and unrelated-title fixtures`, `two-run harness with a barrier pausing both runs after context assembly, released toward claimCreateIntent`, `heartbeat clock stub for fresh vs stale claim states`, `interleaving harness: pause A after its ownership read, run B's takeover, resume A`, `two-reconciler barrier on the abandoned claim`, `child process killed with SIGKILL inside the critical section (guard-left-behind fixture)`, `live-holder co-resident during recovery`, `real daemon authority handler (worker thread) for the ISSUE-<hash> queue key`
- **smoke** — npx tsc --noEmit clean; workflow+MCP test subsets show no new failures vs the recorded pre-story baseline (workflow chunks 36/10/11/16, MCP 6/26, gates 4 — pre-existing at HEAD)
  - Subjects: `npx tsc --noEmit`, `npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts'`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: definitionHeadJsonPath DEF-wins / ISSUE-fallback / missing -> ArtifactMissingError`, `unit: requireApprovedDefinition kind + approval gating + head md path in refuse messages`, `integration: finalize tracker.push on an ISSUE-only seed repo writes meta.tracker onto ISSUE-<hash>.json, binds EPIC-<hash> and STORY-<hash>-s1 heads, readdir shows zero DEF-*.json`, `integration: finalize tracker.sync on the same fixture writes epicStatus/storyStatus/lastSyncedAt onto the ISSUE json via a stubbed port`, `unit: pushPrompt/pushVerifyPrompt with headKind 'issue' contain the ISSUE block (ONE issue, body=epicBodyMd, labels epicLabel+epic:<slug>, adopt epicRef without --force) and NOT 'error unless'/task-list/backRef/sub-issue text`, `unit: pushPrompt/pushVerifyPrompt with headKind 'def'/undefined byte-identical to captured baseline`, `unit: requireApprovedDefinition + definitionHeadJsonPath both use readArtifactCore first-READABLE-wins (corrupt DEF -> ISSUE)` |
| `ac2` | `integration: all existing DEF-headed tracker/chain/link tests pass unedited`, `integration: assemblePushContext on a DEF-headed seed repo returns the exact pre-change context shape`, `integration: corrupt-DEF + valid-approved-ISSUE finalize — meta.tracker lands on the ISSUE json (never the corrupt DEF), readdir shows zero DEF-*.json created` |
| `ac3` | `integration: chain four-state sequence on an ISSUE fixture — unpushed+LLD approved -> push-tracker; bound refs + no lastSyncedAt -> sync-tracker; lastSyncedAt set -> chain-complete; never hld/amendment/stale for ISSUE heads`, `integration: adoption — push with ISSUE.meta.tracker.issueRef pre-set: existingRefs.epicRef + storyRefs.s1 seeded from it, stubbed port createIssue count == 0, finalize binds both heads; conflicting pre-existing head binding -> kind 'conflict'`, `integration: fresh-push retry recovery — simulate issueRef write-back failure, start a NEW tracker.push invocation with no injected ref: prior run artifact's epicRef is loaded from .insrc/<removed>/<epicHash>/..., createIssue count == 0, issueRef + head bindings persisted`, `integration: identity refusal — duplicate titles (2 remote issues sharing the ISSUE body.title): verification filters by the ISSUE-<hash> marker; >1 distinct survivor or 0 survivors -> refuse, no adoption, no label mutation, no create; single unrelated title match (no marker) -> refuse before any label add`, `integration: label command boundary — the ISSUE prompt and runner use the supported singular `--add-label "l1,l2"` (gh_issue_edit tool maps addLabels, issue.ts:234/273); assert via the tool-input boundary (run gh_issue_edit through the typed tool executor with a stubbed gh), not just prompt strings`, `integration: create succeeds, intent/recovery write fails — assert PENDING-CREATE-<epicHash>.json exists with state 'pending'; fresh invocation (nothing injected) reconciles via title+marker, adopts, createIssue count == 0, intent updated to 'created', issueRef + head bindings persisted`, `integration: create succeeds, execute response lost before framework receives refs — intent still 'pending'; fresh invocation reconciles identically; 0 additional creates`, `integration: intent 'created' + meta persistence failed — fresh invocation reads refs from the intent file; 0 creates; persists issueRef + bindings`, `integration: unresolved intent with 0 or >1 verified candidates -> explicit refusal, no create, no adoption`, `integration: identity refusal — duplicate titles / unrelated title match refuse without label mutation (marker-verified)`, `integration: label command boundary — gh_issue_edit through the typed executor asserts singular --add-label argv (issue.ts:234/273)`, `integration: deterministic two-run race — barrier pauses both tracker.push runs after context assembly, then releases both toward claimCreateIntent; assert exactly one createIssue call, claim runId == winner, loser got claimed:false and never updated/deleted the claim`, `integration: create succeeds + execute response lost -> claim stays 'pending' with owner runId; fresh invocation (nothing injected) reconciles, 0 additional creates`, `integration: heartbeat liveness — fresh heartbeat -> competing run refuses; stale heartbeat + no persisted refs -> abandoned, reconciled under ownership check`, `integration: interleaving takeover race — pause run A after its ownership read (inside its would-be heartbeat op), let run B take over the abandoned claim under the mutex (fence++), resume A; assert A gets ClaimOwnershipError and cannot overwrite or delete B's claim, and A's issueRef/head-binding persistence is fenced`, `integration: two simultaneous abandoned-claim reconcilers — both pass the abandoned read only one at a time under the mutex; assert exactly one takeover (fence increments once) and the second refuses`, `integration: crash recovery — spawn a holder child, kill it with SIGKILL inside the critical section; assert the guard file remains (EEXIST on naive acquire), then a fresh run reclaims via dead-owner quarantine and recovers the original claim with 0 new creates and without disturbing a separately-running live holder`, `integration: authority-boundary acquisition — a worker thread acquires the claim mutex with key ArtifactIds.make({kind:'ISSUE',epicHash}) through the real withArtifactWriteAuthority/daemon handler (not a local mock); assert PENDING-CREATE-<hash> alone is rejected by ArtifactIds.parse and the ISSUE-<hash> key is accepted; assert lock ordering claim-mutex before artifact writes` |
| `ac4` | `integration: linkDocsToIssues on an ISSUE head rewrites docs/standalone/<slug>-E<anchor>/ISSUE.md and S001/LLD.md with the tracker link, docs/ has no epics entry for the hash`, `integration: tracker.post on the pushed ISSUE fixture: lld+s1 posts to the adopted story ref; hld/amendment/non-s1 refuse with clear errors`, `integration: first publication — approve ISSUE with tracking disabled (no issueRef), enable, push: exactly 1 create, issueRef written back to ISSUE json + EPIC/STORY-s1 heads bound; simulated write-back failure -> retry adopts with 0 creates; closeBugfixTrackerIssue closes via readRecordedRef (stubbed close deps)`, `integration: adoption labels — issue created with defaultTrackerCreateDeps (labels: []), then push: epicLabel + epic:<slug> added idempotently without --force and without body edit; issueLabelled verify passes; 0 creates`, `integration: ISSUE.md content — after push, docs/standalone/<slug>-E<anchor>/ISSUE.md contains the artifact marker + canonical body bytes (renderIssueMarkdown) + `**Tracker:**` link line; without a ref, byte-identical to renderIssueMarkdown` |

## 6. Migration

**State before:** Every tracker layer was DEF-only: context assemblers via requireApprovedEpic, persistence via DEF json paths in mutateEpicTrackerMeta (orchestrator.ts:2972) and sync.ts:59/106, storiesOf via readDefineArtifact (sync.ts:164); chain computeNextAction ISSUE branch skipped tracker steps (chain.ts:325-360); unitIssueOf reads only EPIC/STORY head bindings so ISSUE.meta.tracker.issueRef was invisible; linkDocsToIssues hardcoded 'epic' placement (link.ts:46-57).

**State after:** tracker.push/sync/post accept, persist and link ISSUE-anchored work items end to end: meta.tracker lands on ISSUE-<hash>.json with EPIC/STORY-s1 unit bindings (zero DEF files fabricated); the chain offers push-tracker -> sync-tracker -> chain-complete for approved ISSUE items; the approval-created GitHub issue is adopted with zero duplicate creates and conflict refusal; docs relink under docs/standalone with ISSUE.md refreshed and no docs/epics duplicate.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. No migration/backfill: in-process behavior fix. stateBefore: tracker stages throw at context read (requireApprovedEpic DEF-only) and ENOENT at finalize persistence (mutateEpicTrackerMeta/sync.ts DEF json) for ISSUE-headed items; chain reports chain-complete for unpushed ISSUE items; the approval-created issueRef is invisible to push; linkDocsToIssues would duplicate docs under docs/epics. stateAfter: all five layers kind-aware; existing ISSUE-anchored items adopt their approval-created ref automatically on the next tracker run (existingRefs seeded from ISSUE.meta.tracker.issueRef). No stored data rewritten. — ↩ rollbackable

**Backward compat:** Fully backward compatible: every change branches on the head kind (def | issue); DEF-headed work items take byte-identical code paths at context, persistence, chain and linkage (existing tracker/chain/link tests must pass unedited). New exports requireApprovedDefinition, definitionHeadJsonPath, renderIssueEpicBody are additive; linkDocsToIssues's headKind is optional and defaults to the read head. No artifact format changes — ISSUE artifacts already carry meta.tracker (issueRef from bugfix approval) and EPIC/STORY heads already carry meta.envelope.binding.

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
