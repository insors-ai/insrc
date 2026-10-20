<!-- insrc:artifact LLD-2f27754d4ad00b8e-s1 -->

# LLD: E202610202f27754d:S001

## Summary

**Epic:** `one-common-model-every-artifact`
**HLD base run:** `wf-1792406752203-whj6zi`
**HLD effective hash:** `f394b8a52456...`

This Story makes one strict module that makes and recognises every artifact id and requirement id, and deletes the second work-item scheme in src/workflow/id.ts together with the throwaway docs migration tool built on it. It also fixes where the folder date comes from: the Epic's creation time is resolved in one head-kind-aware place, the first record any route writes stamps it, and every other record and read path uses the stamp. Path calculations now say whether they are for a read or a write, so the build validation and the completion hook, which compute paths before they persist a record, can anchor a work item on their own turn time, while a genuine read of an unanchored record raises a distinct error that validation surfaces instead of swallowing. New Epic, Story and Task issues carry the artifact id in title and body through all three creation paths, behind an exact-token title lookup on the tracker port. On this branch the 444 stored files with an uppercase story stop resolving until the s9 conversion renames them, so ac1 and k2 must be restated upstream before implementation.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

> See **HLD-2f27754d4ad00b8e** § 2. Framework summary

**Rollout phase:** Phase A — identity and the common model
**Owns:** `sc1` (ArtifactIdScheme)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s2`: The envelope model, the one reader and writer, the History API and the sidecar record shape as a contract, and the repository version marker. Private to this Story are the head-file schema, the per-type payload codec registry and how the old per-type read functions delegate to the reader. — owns `sc2`, `sc3`, `sc8`
- `s3`: The lifecycle rules: status transitions, the revision and content-hash computation, the staleness record, the completion roll-up and the integrity check against the log tail on approve, review and complete. Private to this Story are the hash canonicalisation and how a roll-up is cached or recomputed. — owns `sc4`
- `s4`: The physical sidecar storage: file layout, the merge attributes for the line files, per-artifact filtering, read-time ordering and de-duplication, and the write order of log entry before head with the repair of a log that is ahead of its head. Private to this Story are the line format and the file naming beside a head. — owns `sc5`
- `s5`: People-facing feedback: adding feedback and replies from a client, listing open feedback, the addresses rule at revision time, and the per-user identity declaration with alias linking. Private to this Story are the identity file format and the display of linked identities.
- `s6`: The typed binding and attachments, the tracker port additions implemented for GitHub, the retry of pending links and posts, and the switch of unit-issue bookkeeping to the binding. Private to this Story are the permalink construction and the retry bookkeeping. — owns `sc6`
- `s7`: Task artifacts: creation of the Tasks file and the Task issues at plan approval, direct edits of a Task's own content with local re-approval, refusal of structural edits, and the re-plan reconciliation. Private to this Story are the diff of a Task against the new plan and the build-round recording in a Task's history. — owns `sc7`
- `s8`: Comment sync: reading human comments into feedback at implement, validate or on request, classifying a revision request or a suggestion from the first line, and posting feedback once. Private to this Story are the first-line commands, the derived since point and the filter for the framework's own posts.
- `s9`: The conversion command: previews, repeats, back-fills history, renames standalone S001 to s1 rewriting the references it can with no alias, creates Epic, Story and Task artifacts for what exists, verifies through the delivery reader, and sets the repository version. Private to this Story are the per-type conversion mappings and the verification report.

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ArtifactIds.make`

```typescript
make(key: ArtifactKey): string
```

**Parameters:**
- `key: ArtifactKey` — kind, epicHash and the story, task and seq the kind needs

**Returns:** `string` — DEF-<h>, HLD-<h>, EPIC-<h> (epic hash only); LLD, PLAN, BUILD, CR, TESTS, EXT, STORY with <h>-<story>; TASK with <h>-<story>-<task>; TASKS with <h>-<story> and no seq; DIAG with <h>-<story>-<n>; AMD with <h>-<n> and no story or task; SPEC and ISSUE with their own hash

**Errors:**
- `InvalidArtifactKeyError` when a field the kind requires is missing, a field the kind forbids is present (seq on TASKS, story on AMD), a story is not s<n>, a task is not t<n>, or the hash is not lowercase hex

**Preconditions:**
- epicHash is 16 lowercase hex characters (SPEC and ISSUE take their own run hash)

**Postconditions:**
- parse(make(key)) returns an equal key
- the existing kinds produce the same text storage.ts and nextAmendmentId build today for lowercase stories

### 2.2 `ArtifactIds.parse`

```typescript
parse(id: string): ArtifactKey | undefined
```

**Parameters:**
- `id: string` — a candidate artifact id

**Returns:** `ArtifactKey | undefined` — The key, or undefined when the text is not an artifact id in the strict form

**Postconditions:**
- never throws
- an uppercase story or task form, a folder name <slug>-E<date><hash8>, an E<date><hash8>:S<nnn> work-item id and an old issue-body marker all return undefined

### 2.3 `ArtifactIds.parentOf`

```typescript
parentOf(key: ArtifactKey): ArtifactKey | undefined
```

**Parameters:**
- `key: ArtifactKey` — the child key

**Returns:** `ArtifactKey | undefined` — TASK to STORY, STORY to EPIC, TASKS and DIAG to STORY, and undefined for the rest

**Postconditions:**
- the parent shares the child's epicHash

### 2.4 `RequirementIds.mint`

```typescript
mint(epicHash: string, createdAt: string, ordinal: number, storyId?: string): string
```

**Parameters:**
- `epicHash: string` — the epic hash; its first 8 characters go into the id
- `createdAt: string` — the Epic's creation time (ISO), the only source of the date part
- `ordinal: number` — the requirement number, an integer from 1
- `storyId: string` _(optional)_ — the s<n> story when the requirement belongs to a story

**Returns:** `string` — A requirement id in the stored grammar: E<date><hash8>[:S<nnn>]:FR<nnn>

**Errors:**
- `InvalidArtifactKeyError` when the time is not a valid ISO time, the ordinal is not an integer from 1, or the story is not s<n>; an uppercase S002, which mintFrId accepts today, is rejected

**Postconditions:**
- the result is accepted by isRequirementId
- for a lowercase story the result equals what mintFrId returns today for the same inputs

### 2.5 `RequirementIds.parse`

```typescript
parse(id: string): { date: string; hash8: string; story?: number | undefined; fr: number } | undefined
```

**Parameters:**
- `id: string` — a candidate requirement id in the canonical (E..:S..:FR..) or slug (E..-S..-FR..) form

**Returns:** `{ date, hash8, story?: number, fr: number } | undefined` — The same parts parseFrId returns today, with story a number; undefined (not null) when the text is not a requirement id

**Postconditions:**
- every requirement id stored today parses to the same parts parseFrId gives; the expectation { date: '20260717', hash8: '185807ba', story: 2, fr: 5 } in src/workflow/__tests__/fr-id.test.ts is kept
- the null expectations for invalid input in that test change to undefined

### 2.6 `RequirementIds.isRequirementId`

```typescript
isRequirementId(s: string): boolean
```

**Parameters:**
- `s: string` — text to test

**Returns:** `boolean` — True when the text matches either stored requirement id form

**Postconditions:**
- equals isFrId for every input

### 2.7 `folderSegment`

```typescript
folderSegment(slug: string, epicHash: string, epicCreatedAt: string): string
```

**Parameters:**
- `slug: string` — the epic slug
- `epicHash: string` — the epic hash
- `epicCreatedAt: string` — the Epic's creation time, the only date source

**Returns:** `string` — The folder segment <fileSeg(slug)>-E<date><hash8>, the text workItemRoot builds today

**Errors:**
- `InvalidArtifactKeyError` when the creation time is missing or not a valid ISO time; no fallback to the current day or to an artifact's own time

**Postconditions:**
- two artifacts of one Epic written on different days get the same segment
- no function in the path scheme parses the segment back into an id

### 2.8 `readEpicDefinitionCore`

```typescript
readEpicDefinitionCore(repoPath: string, epicHash: string): EpicDefinitionCore
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` — the work item's epic hash

**Returns:** `EpicDefinitionCore` — The head's epic-level fields; for a work item headed by a standalone LLD the createdAt is that LLD's stamped epicCreatedAt only, and is undefined when it is unstamped (the fallback to the LLD's own createdAt at storage.ts line 505 is removed)

**Postconditions:**
- no consumer receives an LLD's own clock as the anchor
- slug and standalone placement behave as today

### 2.9 `resolveEpicAnchor`

```typescript
resolveEpicAnchor(repoPath: string, epicHash: string): string | undefined
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` — the work item's epic hash

**Returns:** `string | undefined` — The Epic's creation time by head kind: a DEF or ISSUE head contributes its own createdAt; a standalone LLD head contributes only its stamped epicCreatedAt; undefined when there is none

**Postconditions:**
- it is the only place the Epic's creation time is resolved; the inline readEpicCreatedAt(...) ?? new Date() copies are removed
- it never returns the current time or an unstamped record's own createdAt

### 2.10 `stampRootAnchor`

```typescript
stampRootAnchor(repoPath: string, epicHash: string, ownCreatedAt: string): string
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` — the work item's epic hash
- `ownCreatedAt: string` — the root record's own creation time, used only when no anchor exists yet

**Returns:** `string` — resolveEpicAnchor(...) ?? ownCreatedAt; the value the root record stores as meta.epicCreatedAt

**Preconditions:**
- called only by a root producer: finalizeDefine, finalizeBrainstorm, finalizeIssue and finalizeStandaloneLld (always, even as the first record); the ledger writers reach the same rule through the write intent of the record-folder helpers

**Postconditions:**
- the root record carries meta.epicCreatedAt after finalization, so every later record reads it instead of its own clock

### 2.11 `workItemAnchorCreatedAt`

```typescript
workItemAnchorCreatedAt(meta: { readonly epicCreatedAt?: string | undefined }): string
```

**Parameters:**
- `meta: { epicCreatedAt?: string | undefined }` — the record's meta; no kind is inferred from it

**Returns:** `string` — meta.epicCreatedAt

**Errors:**
- `MissingAnchorError` when meta.epicCreatedAt is missing; raised before any path is computed or file written. MissingAnchorError is a subclass of InvalidArtifactKeyError

**Postconditions:**
- no call site falls back to createdAt or new Date()
- the callers in gates.ts, chain.ts, questions.ts, subject-paths.ts, cli/services/workflow.ts, pending.ts, build-step implement and validate and delivery/graph.ts read the stamped value

### 2.12 `buildRecordFolderArgs`

```typescript
buildRecordFolderArgs(repoPath: string, epicHash: string, storyId: string, standalone: boolean, intent: PathIntent): { readonly epicCreatedAt: string; readonly workItemKind: WorkItemKind; readonly epicSlug: string | undefined }
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` — the epic hash
- `storyId: string` — the s<n> story
- `standalone: boolean` — the route flag
- `intent: PathIntent` — { kind: 'read' } or { kind: 'write'; root: { createdAt: string } }; the write form is given by the callers that are about to persist a record, with the record's own createdAt as root

**Returns:** `{ epicCreatedAt, workItemKind, epicSlug }` — The folder arguments for a BUILD or TESTS record: the first available of the persisted BUILD or TESTS record's stamped epicCreatedAt, resolveEpicAnchor, then the write root

**Errors:**
- `MissingAnchorError` when read intent finds no stamp and no head, or write intent is given without a root; raised before any file is written

**Postconditions:**
- the chain upstream.createdAt, head.createdAt, ownCreatedAt is gone
- the writer stores the returned epicCreatedAt in the record's meta through folderIdentityMeta so every later record and review reads it

### 2.13 `storyRecordFolderArgs`

```typescript
storyRecordFolderArgs(repoPath: string, epicHash: string, storyId: string, fallback: { readonly standalone?: boolean | undefined }, intent: PathIntent): { readonly epicCreatedAt: string; readonly workItemKind: WorkItemKind; readonly epicSlug: string | undefined }
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` — the epic hash
- `storyId: string` — the s<n> story
- `fallback: { standalone?: boolean | undefined }` — the caller's route flag; the ownCreatedAt member is removed
- `intent: PathIntent` — read, or write with a root

**Returns:** `{ epicCreatedAt, workItemKind, epicSlug }` — The folder arguments for a Story's records; the anchor is the persisted BUILD or TESTS record's stamp, else resolveEpicAnchor, else the root of a write intent

**Errors:**
- `MissingAnchorError` when read intent finds neither a persisted record stamp nor a head; the code-review path no longer substitutes new Date()

**Postconditions:**
- a code review of a headless build lands in the folder the TESTS and BUILD records were written to

### 2.14 `buildRecordPathsFor`

```typescript
buildRecordPathsFor(repoPath: string, rec: BuildRecord, intent: PathIntent): { md: string; json: string }
```

**Parameters:**
- `repoPath: string` — the repository
- `rec: BuildRecord` — the BUILD record, merged as the write would merge it
- `intent: PathIntent` — write for the callers that compute paths before persisting; read otherwise

**Returns:** `{ md: string; json: string }` — The BUILD record's paths; its documented read-only status now applies to the read intent only

**Errors:**
- `MissingAnchorError` when read intent with no anchor

**Postconditions:**
- the write intent never raises MissingAnchorError because it carries a root

### 2.15 `testRecordPaths`

```typescript
testRecordPaths(repoPath: string, epicHash: string, storyId: string, first: { readonly now: string; readonly standalone?: boolean | undefined }, intent: PathIntent): { md: string; json: string }
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` — the epic hash
- `storyId: string` — the s<n> story
- `first: { now: string; standalone?: boolean }` — the values a first write would use
- `intent: PathIntent` — read (testRecordMd) or write (storyWorkflowFiles)

**Returns:** `{ md: string; json: string }` — The TESTS record's paths as on disk or as a first write would place them

**Errors:**
- `MissingAnchorError` when read intent with no anchor

**Postconditions:**
- testRecordMd in validate passes read intent

### 2.16 `storyWorkflowFiles`

```typescript
storyWorkflowFiles(repoPath: string, rec: BuildRecord, intent: PathIntent): readonly string[]
```

**Parameters:**
- `repoPath: string` — the repository
- `rec: BuildRecord` — the BUILD record about to be written
- `intent: PathIntent` — write with root { createdAt: rec.meta.createdAt } from both callers

**Returns:** `readonly string[]` — The workflow's own files to exclude from the change log: the BUILD json and md, the TESTS json and md, and the build-start file

**Preconditions:**
- both callers, runValidateSession (validate.ts line 577) and ensureBuildRecordOnCompletion (completion-record.ts line 71), pass write intent

**Postconditions:**
- on a first headless turn the paths are computed from the same root the records are then written with, so the change log excludes the workflow's own files

### 2.17 `persistTestRecordTask`

```typescript
persistTestRecordTask(repoPath: string, ident: { readonly epicHash: string; readonly storyId: string; readonly now: string; readonly standalone?: boolean | undefined }, task: TestRecordTask, seams?: { readonly restore?: (absPath: string, content: string) => void }): { md: string; json: string }
```

**Parameters:**
- `repoPath: string` — the repository
- `ident: { epicHash, storyId, now, standalone? }` — the Story and the write time, used as the write root
- `task: TestRecordTask` — the Task's entry
- `seams: { restore?: (absPath, content) => void }` _(optional)_ — test seam

**Returns:** `{ md: string; json: string }` — The paths written; on the first headless write the record stamps epicCreatedAt = ident.now

**Postconditions:**
- because it uses write intent it never raises MissingAnchorError
- a later TESTS or BUILD write reads the stamp and files in the same folder

### 2.18 `runValidateSession`

```typescript
runValidateSession(repoPath: string, prompt: (evidence: string) => string, ident: ValidateIdent, checks: ValidationCheckPlan, summary?: string, mappingNote?: string): Promise<BuildStepDone | BuildStepError>
```

**Parameters:**
- `repoPath: string` — the repository
- `prompt: (evidence: string) => string` — the judge prompt builder
- `ident: ValidateIdent` — epic hash, story, task and the standalone declaration
- `checks: ValidationCheckPlan` — the daemon's checks
- `summary: string` _(optional)_ — the implementer's narrative
- `mappingNote: string` _(optional)_ — a note on the stored test mapping

**Returns:** `Promise<BuildStepDone | BuildStepError>` — The verdict, or a BuildStepError with code missing-anchor naming the work item when a read-intent path raises MissingAnchorError

**Errors:**
- `MissingAnchorError` when testRecordMd or another read-intent path finds no anchor; the two best-effort catches (the TESTS write at lines 435-439 and the BUILD persist at lines 592-597) rethrow it and the function returns the missing-anchor error

**Postconditions:**
- the turn holds one write root, { createdAt: now } from line 404, and uses it for the TESTS write, for storyWorkflowFiles and for the BUILD persist, so an ordinary TESTS write failure on the first headless turn leaves no later step without an anchor and the verdict is preserved
- every other ledger write failure stays best-effort and the verdict is returned unchanged

### 2.19 `ensureBuildRecordOnCompletion`

```typescript
ensureBuildRecordOnCompletion(repoPath: string, ref: { readonly epicHash: string; readonly storyId: string }, listChanged?: (repoPath: string) => Promise<readonly string[]>): Promise<{ readonly md: string; readonly json: string } | undefined>
```

**Parameters:**
- `repoPath: string` — the repository
- `ref: { epicHash, storyId }` — the completing Story
- `listChanged: (repoPath) => Promise<readonly string[]>` _(optional)_ — test seam for the change list

**Returns:** `Promise<{ md, json } | undefined>` — The BUILD record paths, or undefined when it could not be written

**Postconditions:**
- it passes write intent with root { createdAt: now } to storyWorkflowFiles and persistBuildRecord, so completion on a headless Story writes the BUILD record instead of failing before the root writer
- its existing catch-all stays for ordinary failures

### 2.20 `resolveArtifactMdPath`

```typescript
resolveArtifactMdPath(repoPath: string, key: WorkItemKey, kind: ArtifactKind, workItemKind: WorkItemKind, slug: string): string
```

**Parameters:**
- `repoPath: string` — the repository
- `key: WorkItemKey` — { epicHash, epicCreatedAt, story? } replacing WorkItemIdentity
- `kind: ArtifactKind` — the artifact kind
- `workItemKind: WorkItemKind` — epics or standalone
- `slug: string` — the human label

**Returns:** `string` — docs/<epics|standalone>/<slug>-E<date><hash8>/[S<nnn>/]<KIND>.md, the same text as today; the S<nnn> subfolder comes from the story ordinal read through ArtifactIds.parse

**Errors:**
- `InvalidArtifactKeyError` when a story-scoped kind has no story, the story is not s<n>, or epicCreatedAt is not a valid ISO time

**Postconditions:**
- path-scheme.ts no longer imports or re-exports deriveWorkItemIdentity or WorkItemIdentity
- the storage.ts path builders and pending.ts pass a WorkItemKey

### 2.21 `resolveCompanionPath`

```typescript
resolveCompanionPath(repoPath: string, key: WorkItemKey, workItemKind: WorkItemKind, slug: string, companionFileName: string): string
```

**Parameters:**
- `repoPath: string` — the repository
- `key: WorkItemKey` — the work item key; story is required
- `workItemKind: WorkItemKind` — epics or standalone
- `slug: string` — the human label
- `companionFileName: string` — a bare basename

**Returns:** `string` — The companion path beside the Story's artifact, as today

**Errors:**
- `InvalidArtifactKeyError` when the key has no story or the file name has a separator or a dot segment

**Postconditions:**
- same folder text as today

### 2.22 `nextAmendmentId`

```typescript
nextAmendmentId(repoPath: string, epicHash: string): string
```

**Parameters:**
- `repoPath: string` — the repository
- `epicHash: string` — the epic hash

**Returns:** `string` — AMD-<epicHash>-<n>, built through ArtifactIds.make with n one above the highest counter found by the existing scan

**Errors:**
- `InvalidArtifactKeyError` when the epic hash is not lowercase hex

**Postconditions:**
- the counter allocation is unchanged
- the id text is unchanged for existing amendments

### 2.23 `findIssuesByTitleToken`

```typescript
findIssuesByTitleToken(token: string): PortResult<IssueRef[]>
```

**Parameters:**
- `token: string` — an artifact id such as STORY-<h>-s1

**Returns:** `PortResult<IssueRef[]>` — Every issue whose title equals the token or starts with the token followed by ' — '; STORY-<h>-s1 never matches STORY-<h>-s10 and TASK-<h>-s1-t1 never matches -t10

**Errors:**
- `TrackerLookupError` when the gh call fails; reported as a failed PortResult, never as an empty list

**Preconditions:**
- token is an id accepted by ArtifactIds.parse

**Postconditions:**
- implemented in src/workflow/tracker/github-adapter.ts over a new strict gh helper in src/workflow/tracker/github.ts that searches titles and filters client-side by the exact token
- the in-memory fake used by the tracker tests implements the same matching

### 2.24 `ensureUnitIssueDetailed`

```typescript
ensureUnitIssueDetailed(unit: UnitRef, port: TrackerPort, deps?: EnsureIssueDeps): EnsureResult<EnsuredIssue>
```

**Parameters:**
- `unit: UnitRef` — the Epic, Story or Task unit
- `port: TrackerPort` — the tracker port
- `deps: EnsureIssueDeps` _(optional)_ — test seams

**Returns:** `EnsureResult<EnsuredIssue>` — The unit's issue, found or created; a new title is <artifact id> — <text> and the body marker carries the artifact id

**Errors:**
- `TrackerLookupError` when the label lookup or the title-token lookup fails, or the token lookup returns more than one issue; nothing is created

**Postconditions:**
- before any create it runs the unit-label lookup and then findIssuesByTitleToken: one match is adopted, none is a new unit, several is an error
- an old issue with neither the unit label nor an artifact-id title cannot be recognised and may be duplicated once; the result has no field for it and the LLD does not claim one

### 2.25 `autoPushStoryOnLld`

```typescript
autoPushStoryOnLld(lldJsonPath: string, deps?: { readonly createTracker?: ((owner: string, repo: string) => TrackerPort) | undefined; readonly port?: TrackerPort | undefined }): AutoPushResult
```

**Parameters:**
- `lldJsonPath: string` — the approved LLD file
- `deps: { createTracker?: (owner, repo) => TrackerPort; port?: TrackerPort }` _(optional)_ — an injection seam used by both the team and the legacy mode, so legacyPushStory no longer calls createGithubTracker directly; autoPushEpicOnHld and autoPushTasksOnPlan get the same parameter

**Returns:** `AutoPushResult` — The push result; titles and markers carry the artifact id, the anchor comes from resolveEpicAnchor, and every create is guarded by the unit label and title-token lookups

**Errors:**
- `TrackerLookupError` when a lookup before create fails or is ambiguous; nothing is created

**Postconditions:**
- a Story issue created by the legacy path carries the per-unit label

### 2.26 `resolveWorkflowRef`

```typescript
resolveWorkflowRef(repoPath: string, identifier: string, opts?: { readonly epicHash?: string | undefined }): ResolvedRef | null
```

**Parameters:**
- `repoPath: string` — the repository
- `identifier: string` — an artifact id, owner/repo#N, #N, or an s<n>/t<n> label
- `opts: { epicHash?: string | undefined }` _(optional)_ — disambiguates a label across epics

**Returns:** `ResolvedRef | null` — The resolved reference; an E<date><hash8>:S<nnn> work-item id and an uppercase label are no longer accepted

**Postconditions:**
- the first form it tries is ArtifactIds.parse

## 3. Data model changes

### 3.1 `ArtifactKind` — field-modify

The kind set grows by EPIC, STORY, TASK, TASKS and DIAG with a per-kind table of required and forbidden fields; AMD takes the epic hash and a required seq; story and task parts are only s<n> and t<n>. Invariant kept: an existing lowercase-story artifact keeps its id and file name.

**Call sites:**
- `src/workflow/storage.ts:245-285`
- `src/workflow/amendments/store.ts:62-76`

### 3.2 `storage artifact id functions` — field-modify

defineArtifactId, hldArtifactId, lldArtifactId, planArtifactId, buildArtifactId, specArtifactId, issueArtifactId, codeReviewArtifactId, testsArtifactId and extendArtifactId call ArtifactIds.make instead of interpolating, so a storyId in the uppercase form throws. Invariant broken on purpose: the 444 stored files with an uppercase S0nn no longer resolve until s9; the user's ruling accepts this on v2.

**Call sites:**
- `src/workflow/storage.ts:245-285`
- `src/workflow/storage.ts:900`
- `.insrc/artifacts/LLD-b94cf2c9058fd82a-S001.json`

### 3.3 `uppercase story producers` — field-modify

A new standalone story defaults to s1 instead of S001 in the standalone context, the build step defaults ctx.storyId to s1 in implement and validate, and the MCP tool descriptions and examples say s1; a fresh standalone workflow test proves a new routed story passes the strict id check.

**Call sites:**
- `src/workflow/runners/design-story/standalone.ts:47`
- `src/daemon/steps/build-step/phases/implement.ts:137`
- `src/daemon/steps/build-step/phases/validate.ts:322`
- `src/mcp/server.ts:590`
- `src/mcp/server.ts:982`
- `src/mcp/server.ts:1192`

### 3.4 `work-item id (src/workflow/id.ts)` — field-remove

WorkflowId, WorkItemIdentity, the minters, toCanonical, toSlug, safeCanonical, parseWorkflowId, deriveWorkItemIdentity, storyIdToOrdinal, taskIdToOrdinal and the FR helpers leave id.ts; the FR helpers move to RequirementIds, the ordinals are read from ArtifactKey, WorkItemIdentity is replaced by WorkItemKey, and the module is deleted. pending.ts shows the artifact id where it showed the canonical work-item id. Invariant kept: parseFrId's successful result shape.

**Call sites:**
- `src/workflow/id.ts`
- `src/workflow/pending.ts:27`
- `src/workflow/tracker/resolve.ts`
- `src/workflow/delivery/graph.ts`
- `src/workflow/delivery/read.ts`
- `src/workflow/artifacts/define.ts`
- `src/workflow/artifacts/plan.ts`
- `src/workflow/artifacts/hld.ts`
- `src/workflow/artifacts/lld.ts`
- `src/workflow/artifacts/companion/header.ts`
- `src/workflow/artifacts/functional-definition.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/storage.ts`
- `src/workflow/path-scheme.ts`

### 3.5 `path scheme key` — field-modify

resolveArtifactMdPath and resolveCompanionPath take a WorkItemKey { epicHash, epicCreatedAt, story? } instead of a WorkItemIdentity; workItemRoot builds the root with folderSegment; the storage.ts path builders at lines 726 to 946 and pending.ts deriveMdPath pass a key; the re-exports of the identity constructor and type are removed. Folder text is unchanged.

**Call sites:**
- `src/workflow/path-scheme.ts:37`
- `src/workflow/path-scheme.ts:105`
- `src/workflow/path-scheme.ts:121-139`
- `src/workflow/path-scheme.ts:156-182`
- `src/workflow/path-scheme.ts:244-245`
- `src/workflow/storage.ts:726`
- `src/workflow/storage.ts:931-946`
- `src/workflow/pending.ts:228`

### 3.6 `folder date source and epicCreatedAt stamp` — invariant-change

The Epic's creation time is resolved by resolveEpicAnchor alone, by head kind; readEpicDefinitionCore stops returning an LLD's own createdAt; workItemAnchorCreatedAt requires the stamp; finalizeStandaloneLld always stamps; the record-folder helpers take a read or write intent; every other fallback is removed: storage.ts 289 and 505, buildRecordFolderArgs 562-612 and storyRecordFolderArgs 639-651; subject-paths.ts 34; questions.ts 318-341; the callers in test-record.ts and standalone-record.ts; tracker-auto.ts 234 and 495; tracker/link.ts 37; orchestrator.ts 1372, 1847, 2227 and 2687; workflow-rpc.ts 335; synthesize.ts 81; cli/services/workflow.ts 109; pending.ts 201 and 228; delivery/graph.ts 266-287; and the helper callers in gates.ts, chain.ts, implement.ts and validate.ts. Invariant broken on purpose: a read of a record with no anchor now fails before any write instead of choosing its own day.

**Call sites:**
- `src/workflow/storage.ts:288`
- `src/workflow/storage.ts:370-386`
- `src/workflow/storage.ts:482-512`
- `src/workflow/storage.ts:562-612`
- `src/workflow/storage.ts:639-651`
- `src/workflow/code-review/subject-paths.ts:34`
- `src/workflow/questions.ts:318-341`
- `src/workflow/runners/build/standalone-record.ts:266-312`
- `src/workflow/runners/build/test-record.ts:192-264`
- `src/workflow/tracker-auto.ts:234`
- `src/workflow/tracker-auto.ts:495`
- `src/workflow/tracker/link.ts:37`
- `src/workflow/orchestrator.ts:1372`
- `src/workflow/orchestrator.ts:1847`
- `src/workflow/orchestrator.ts:2227`
- `src/workflow/orchestrator.ts:2340-2410`
- `src/workflow/orchestrator.ts:2687`
- `src/daemon/workflow-rpc.ts:335`
- `src/daemon/steps/workflow-step/phases/synthesize.ts:81`
- `src/cli/services/workflow.ts:109`
- `src/workflow/pending.ts:201`
- `src/workflow/delivery/graph.ts:266-287`
- `src/workflow/gates.ts:208`
- `src/workflow/chain.ts:139`
- `src/daemon/steps/build-step/phases/implement.ts:158`
- `src/daemon/steps/build-step/phases/validate.ts:333`

### 3.7 `write-intent path calculations` — field-modify

buildRecordPathsFor, testRecordPaths and storyWorkflowFiles take an explicit PathIntent. runValidateSession (validate.ts) holds one write root for the turn and ensureBuildRecordOnCompletion (completion-record.ts) passes its own now; both call storyWorkflowFiles with write intent before persistBuildRecord. own-files.ts and completion-record.ts are added to the change inventory.

**Call sites:**
- `src/workflow/runners/build/own-files.ts:29-42`
- `src/workflow/runners/build/completion-record.ts:33-96`
- `src/workflow/runners/build/standalone-record.ts:266-312`
- `src/workflow/runners/build/test-record.ts:192-264`
- `src/daemon/steps/build-step/phases/validate.ts:372-460`
- `src/daemon/steps/build-step/phases/validate.ts:560-599`

### 3.8 `build validation error handling` — invariant-change

runValidateSession keeps ledger write failures best-effort except MissingAnchorError, which both catches rethrow and which becomes a BuildStepError with code missing-anchor; the TESTS record is still written before the judge, so a judge failure leaves the evidence in place and a retry on a later day files into the same folder.

**Call sites:**
- `src/daemon/steps/build-step/phases/validate.ts:372-460`
- `src/daemon/steps/build-step/phases/validate.ts:588-599`

### 3.9 `docs migration tool` — field-remove

src/workflow/migrate-docs-tree.ts, its entry src/bin/insrc-migrate-docs.ts with the insrc-migrate-docs bin in package.json, its tests migrate-docs-tree.test.ts and migrate-docs-meta-rewrite.test.ts, its row in src/workflow/artifact-write-inventory.ts and the assertion in artifact-write-inventory.test.ts are deleted: they are built on the second scheme and no compatibility code is kept.

**Call sites:**
- `src/workflow/migrate-docs-tree.ts`
- `src/bin/insrc-migrate-docs.ts`
- `package.json`
- `src/workflow/artifact-write-inventory.ts:92`
- `src/workflow/__tests__/artifact-write-inventory.test.ts:64`

### 3.10 `TrackerPort` — field-add

One method findIssuesByTitleToken(token) is added to TrackerPort with a GitHub implementation and a fake; it is the only port change in this Story and overlaps the port additions that s6 owns.

**Call sites:**
- `src/workflow/tracker/port.ts:55-82`
- `src/workflow/tracker/github-adapter.ts:185-187`
- `src/workflow/tracker/github.ts:309-325`

### 3.11 `unit issue title and body marker` — field-modify

tracker-auto.ts (Epic, Story, Task titles on the team and legacy paths), unit-issue.ts (titles at 428-445) and conventions.ts (idMarker, parseIdMarker and the three body renderers) write and read the artifact id instead of the E<date><hash8>:S<nnn> id; Story issues made by tracker-auto.ts get the per-unit label. An issue created earlier keeps its title; the old marker is no longer read. Invariant kept: an earlier issue that carries the unit label or an artifact-id title is found.

**Call sites:**
- `src/workflow/tracker-auto.ts:106-119`
- `src/workflow/tracker-auto.ts:141-146`
- `src/workflow/tracker-auto.ts:213-218`
- `src/workflow/tracker-auto.ts:316-319`
- `src/workflow/tracker-auto.ts:366-400`
- `src/workflow/tracker/unit-issue.ts:233-311`
- `src/workflow/tracker/unit-issue.ts:428-445`
- `src/workflow/tracker/conventions.ts:61-70`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | This Story owns sc1 and implements ArtifactIds and RequirementIds, including AMD, the folder-name date source and the key-based path scheme. RequirementIds.parse returns the stored shape {date, hash8, story?: number, fr}, not the sketch's {epicHash, ordinal, storyId?}, because a stored requirement id holds only the date and the first 8 hash characters. That change is recorded by the existing pending amendment AMD-2f27754d4ad00b8e-1; the identical amendments -2, -3 and -4 are to be rejected and -1 approved with the user before s2 consumes sc1. The single TrackerPort method findIssuesByTitleToken is an ownership exception between s1 and s6 (s6 owns the port additions in sc6), to be recorded by the user. |

## 5. Error paths

**Error cases**

- **A caller passes a story or task in the old uppercase form (S001, T001) to ArtifactIds.make, a storage.ts id function or RequirementIds.mint** (recoverable)
  - Detection: make and mint test the story against ^s[1-9]\d*$ and the task against ^t[1-9]\d*$ before building the string and throw InvalidArtifactKeyError naming the field and value
  - Response: No id is built and nothing is read or written under the uppercase name
  - User impact: A command run against one of the 444 stored uppercase artifacts fails with a message that points to the s9 conversion instead of silently using a second form
- **A key breaks the per-kind table: a TASK without a task, a TASKS with a seq, a DIAG or AMD without a seq, an AMD with a story, or a DEF with a story** (recoverable)
  - Detection: make looks the kind up in a table of required and forbidden fields and compares them with the key's defined fields
  - Response: InvalidArtifactKeyError naming the kind and the offending field
  - User impact: No ambiguous Tasks-file, diagram or amendment id is written
- **parse is given a folder name <slug>-E<date><hash8>, an E<date><hash8>:S001 work-item id, an uppercase story id or an old issue-body marker** (recoverable)
  - Detection: parse matches an anchored regular expression per kind and finds no match
  - Response: Returns undefined and logs nothing; the caller decides
  - User impact: A folder name or a work-item id is never taken as an artifact id
- **A work item is headed by a standalone LLD that has no stamped epicCreatedAt (a record written before this change)** (recoverable)
  - Detection: resolveEpicAnchor reads the LLD head by kind and finds no stamp; readEpicDefinitionCore no longer falls back to the LLD's own createdAt
  - Response: resolveEpicAnchor returns undefined; a write intent anchors with its root, a read intent raises MissingAnchorError, and the s9 conversion stamps old records
  - User impact: The LLD's own day is never taken as the Epic's creation; an old unstamped item is reported, not guessed
- **A read-intent path finds no anchor: testRecordMd in validate, the code-review subject path, questions.ts, the pending list or delivery grouping** (recoverable)
  - Detection: workItemAnchorCreatedAt, or a record-folder helper or path function called with intent kind 'read', finds no stamp and no head and raises MissingAnchorError before any path is computed
  - Response: The pending list and delivery grouping catch it per record, log the record id and show the record without a path; questions.ts and the code-review path propagate it; validate returns a BuildStepError with code missing-anchor
  - User impact: No record is placed in a folder dated the day it was read; the failure is visible
- **Paths are computed before a BUILD is persisted on the first headless route: storyWorkflowFiles called from validate.ts line 577 or from ensureBuildRecordOnCompletion, with no head, no LLD and no persisted TESTS or BUILD** (recoverable)
  - Detection: both callers pass intent { kind: 'write', root: { createdAt: rec.meta.createdAt } } and the record-folder helpers take the root when no stamp or head exists
  - Response: The paths are computed from the record's own time, the workflow's own files are excluded from the change log, and persistBuildRecord stamps the same time
  - User impact: A first headless BUILD is written, with a clean change log, instead of failing before the root writer runs
- **On the first headless validate turn the TESTS write fails for an ordinary reason (disk error) and the judge then succeeds** (recoverable)
  - Detection: runValidateSession holds one write root { createdAt: now } for the whole turn, so the later storyWorkflowFiles call and persistBuildRecord use it independently of whether the TESTS write persisted an anchor
  - Response: The TESTS failure is noted and the verdict is preserved; the BUILD record is written and stamped with the turn's now; the BUILD catch receives no MissingAnchorError
  - User impact: An ordinary ledger failure does not turn into a missing-anchor error and the verdict is returned
- **The headless validate flow writes the TESTS record first, then the judge session fails before BUILD is persisted** (recoverable)
  - Detection: persistTestRecordTask uses write intent with root { createdAt: now }, which stores epicCreatedAt = now in the TESTS record
  - Response: The TESTS record is written and stamped; the judge error is returned as today; on a retry on a later day persistBuildRecord finds the TESTS stamp first and files the BUILD in the same folder
  - User impact: The test evidence is kept and the work item has one folder across days
- **A ledger write in validate fails for a reason other than a missing anchor (disk full, rename failure)** (recoverable)
  - Detection: the catch at validate.ts lines 435-439 or 592-597 receives an error that is not a MissingAnchorError
  - Response: Logged and noted as today; the verdict is returned unchanged
  - User impact: A transient write failure does not turn a passing verdict into an error
- **A MissingAnchorError from a read-intent path reaches one of the two best-effort catches in validate** (recoverable)
  - Detection: the catch tests error instanceof MissingAnchorError
  - Response: Rethrown; runValidateSession returns a BuildStepError with code missing-anchor naming the epic and story, never { next: 'done' }
  - User impact: A verdict is not reported as successful while a required read failed
- **The title-token lookup returns more than one issue for one unit** (recoverable)
  - Detection: ensureUnitIssueDetailed and the tracker-auto push paths check the length of the findIssuesByTitleToken result before they adopt or create
  - Response: Returns a failed result naming the token and the issue references, and creates nothing
  - User impact: A person resolves the duplicate on the tracker; no third issue is created
- **The title-token lookup or the unit-label lookup fails (gh error, rate limit, offline)** (recoverable)
  - Detection: the PortResult from the lookup has ok false
  - Response: Returns the failure with its kind and creates nothing; a failed lookup is never read as 'not found'
  - User impact: The push stops with a visible reason and can be repeated
- **A longer id shares a prefix with the unit's id (STORY-<h>-s10 against STORY-<h>-s1, TASK-<h>-s1-t10 against -t1)** (recoverable)
  - Detection: the exact-token filter accepts a title only when it equals the token or continues with ' — ' immediately after it, so the character after the prefix decides
  - Response: The longer id is not matched and the right unit is adopted or created
  - User impact: A Story or Task issue is never bound to a different unit
- **An issue created before this change has an old-scheme title and no unit label** (recoverable)
  - Detection: neither the unit-label lookup nor the title-token lookup matches it, so the code cannot tell it from a new unit
  - Response: The unit is created as new; this is an undetectable residual risk and the result carries no field for it. The s9 conversion relabels old issues
  - User impact: At most one duplicate per such issue until s9 runs
- **tracker-auto.ts legacy paths create an issue** (recoverable)
  - Detection: legacyPushEpic, legacyPushStory and legacyPushTasks obtain their tracker through the createTracker dependency and run the same two lookups before create
  - Response: An existing issue is adopted; a new one is created with the unit label, the artifact id title and the marker
  - User impact: A Story issue made by the legacy path is found again on the next run
- **folderSegment or RequirementIds.mint receives an invalid time, or mint an ordinal below 1 or a non-integer** (recoverable)
  - Detection: the parsed date and Number.isInteger(ordinal) are validated before the string is built
  - Response: InvalidArtifactKeyError
  - User impact: No folder or requirement id with a wrong date is created
- **A new standalone workflow is started without a storyId** (recoverable)
  - Detection: standalone.ts reads the storyId parameter and falls to its default, which is now s1
  - Response: The story is created as s1 and passes the strict id check
  - User impact: A freshly routed standalone story does not fail the strict id check

**Edge cases**

| Input | Expected |
| :--- | :--- |
| a requirement id with no story part, E20261019 followed by the 8-character hash and :FR003 | RequirementIds.parse returns date, hash8 and fr 3 with story undefined |
| a requirement id in the slug form E20260717185807ba-S002-FR005 | RequirementIds.parse returns { date: '20260717', hash8: '185807ba', story: 2, fr: 5 }, the same shape as the canonical form |
| an HLD, LLD, PLAN, BUILD, TESTS and CR written on three different days for one Epic with a DEF head | all six resolve to the same docs folder because each reads the DEF head's createdAt through resolveEpicAnchor |
| a work item whose first record is a standalone LLD written on day one, with BUILD, TESTS and CR written on days two and three | finalizeStandaloneLld stamped epicCreatedAt on day one, so every later record and review files into the day-one folder |
| a headless build whose first validate call writes TESTS on day one and whose BUILD is written on day two | TESTS stamps day one; BUILD reads that stamp; both and the later CR share the day-one folder |
| story completion on a headless work item with no persisted BUILD, through ensureBuildRecordOnCompletion | write intent with root now computes the own-files list, the BUILD record is written and stamped, and completion proceeds |
| a DIAG key with seq 1 for story s1 and another with seq 2 | make returns DIAG-<h>-s1-1 and DIAG-<h>-s1-2, and parse returns the seq as a number |
| a TASKS key for story s1 | make returns TASKS-<h>-s1 and parse returns a key with no seq |
| an AMD key with seq 3 for an Epic | make returns AMD-<h>-3 and nextAmendmentId, scanning existing files, returns the next counter in that form |
| a story-scoped path requested with a key that has no story | resolveArtifactMdPath throws InvalidArtifactKeyError naming the kind |

**Invariants to preserve**

- An artifact stored in the lowercase form keeps its id and file name: the existing kinds produce the same text from make that storage.ts interpolates today and that nextAmendmentId builds today [[c3]]
- Stored requirement ids stay valid: the canonical and slug grammar and parseFrId's date, hash8, story (a number) and fr are unchanged by the move [[c1]]
- An issue that carries the unit label is still found after the old marker stops being read [[c8]]
- Folder names under docs/epics keep the <slug>-E<date><hash8>/S<nnn>/ text that workItemRoot and storyFolder build today [[c7]]
- A work item with a DEF or ISSUE head keeps its existing folder: the anchor resolveEpicAnchor returns equals the head's createdAt that the folder already carries [[c4]]
- The TESTS record is still written before the judge and survives a judge failure; a write failure other than a missing anchor still leaves the verdict unchanged; the BUILD change log still excludes the workflow's own files [[c5]]

## 6. Test strategy

**Test framework:** `node:test run through npx tsx --test, tests in __tests__ folders beside the modules`

**Test levels**

- **unit** — Prove the id module, the requirement ids, the folder segment, the head-kind-aware anchor resolver, the intent-aware record-folder helpers and the key-based paths behave as the contract says, with no network
  - Subjects: `ArtifactIds.make, parse and parentOf over every kind (DEF, HLD, LLD, PLAN, BUILD, CR, TESTS, EXT, AMD, SPEC, ISSUE, EPIC, STORY, TASK, TASKS, DIAG), the per-kind required and forbidden fields and rejection of the uppercase story and task form`, `RequirementIds.mint, parse and isRequirementId against stored requirement ids in the canonical and slug forms with story a number; uppercase mint input rejected; parse misses return undefined (src/workflow/__tests__/fr-id.test.ts updated: successful-parse expectations kept, the S002 mint and null expectations changed)`, `folderSegment, resolveArtifactMdPath and resolveCompanionPath over a WorkItemKey: same text as today, one folder for one Epic on different days, a story-scoped kind without a story rejected`, `resolveEpicAnchor by head kind over a temporary repository: a DEF head, an ISSUE head, a standalone LLD head with a stamp, a standalone LLD head WITHOUT a stamp (must return undefined, not the LLD's own createdAt), nothing; readEpicDefinitionCore returns no createdAt for the unstamped LLD head; stampRootAnchor; workItemAnchorCreatedAt raises MissingAnchorError without a stamp`, `buildRecordFolderArgs, storyRecordFolderArgs, buildRecordPathsFor, testRecordPaths and storyWorkflowFiles with read intent (raise MissingAnchorError when nothing anchors) and with write intent (use the root when nothing anchors, prefer a persisted stamp or a head when one exists)`, `nextAmendmentId returns the same AMD-<hash>-<n> text for existing amendment files and the next counter`, `the exact-token matcher: STORY-<h>-s1 matches 'STORY-<h>-s1' and 'STORY-<h>-s1 — title' and not STORY-<h>-s10; TASK-<h>-s1-t1 does not match -t10`
  - Fixtures: `a table of one stored id per existing kind built from the formats storage.ts and nextAmendmentId use today`, `the stored requirement ids used in src/workflow/__tests__/fr-id.test.ts`, `a temporary repository builder with a DEF head, an ISSUE head, a stamped or unstamped standalone LLD, or nothing`
- **integration** — Prove the callers behave once id.ts is gone: storage lookups and gates resolve lowercase ids, the uppercase fixture fails as documented, every record kind lands in one folder across days on every route including the real first headless validate call and the completion hook, a missing anchor surfaces on read paths without swallowing ordinary ledger failures, and all three tracker creation paths write artifact-id titles and markers and adopt older issues instead of duplicating them
  - Subjects: `storage.ts id functions and the gates.ts lookups over a temporary repository with lowercase-story artifacts and over a copy of .insrc/artifacts/LLD-b94cf2c9058fd82a-S001.json to assert the documented failure`, `cross-day folder tests with a controllable clock on the epic route (DEF head) and the standalone route (stamped LLD head): HLD, LLD, PLAN, BUILD, TESTS and CR on different days land in one folder, including delivery/graph.ts grouping and the pending list`, `the first headless validate call through runValidateSession with no head and no LLD: the TESTS record is written first and stamps the anchor; the judge FAILS before BUILD persistence; a retry on a later simulated day writes BUILD; both land in one folder and the TESTS evidence is preserved`, `the first headless validate call with an INJECTED TESTS write failure and a SUCCESSFUL judge: the call returns { next: 'done' } with the verdict, BUILD is written and stamped with the turn's now, its change log excludes the workflow's own files, and no missing-anchor error is produced`, `ensureBuildRecordOnCompletion on a headless work item with no persisted BUILD or TESTS: the BUILD record is written through write intent, instead of failing in storyWorkflowFiles and being swallowed`, `the missing-anchor behaviour in validate: a read-intent MissingAnchorError (testRecordMd) returns the missing-anchor BuildStepError and not { next: 'done' }; an ordinary ledger write failure in either best-effort catch still returns the verdict`, `missing-anchor tests: finalizers, read-intent record-folder helpers, subject-paths.ts, questions.ts, tracker-auto.ts, tracker/link.ts, workflow-rpc.ts and synthesize.ts each fail before any file is created`, `each root producer (finalizeDefine, finalizeBrainstorm, finalizeIssue, finalizeStandaloneLld including as the first record, persistTestRecordTask, persistBuildRecord) stamps epicCreatedAt and a later record reads it`, `a fresh standalone workflow run with no storyId produces s1 and passes the strict id check, through the build-step implement and validate defaults`, `resolveWorkflowRef accepting an artifact id, owner/repo#N, #N and an s<n> label and refusing an E<date><hash8>:S<nnn> work-item id and an uppercase label`, `tracker-auto.ts Epic, Story and Task creation on the team path and on the legacy path through the createTracker seam, ensureUnitIssueDetailed and the three conventions.ts body renderers: artifact-id title and marker, label adoption, exact-title adoption, s1 versus s10 and t1 versus t10, several matches, and a failed lookup before create`, `findIssuesByTitleToken in the GitHub adapter over a stubbed gh boundary and in the fake`, `no source file under src, no package.json bin entry and no write-inventory row refers to src/workflow/id.ts or src/workflow/migrate-docs-tree.ts`
  - Fixtures: `the in-memory tracker fake used by the existing tests in src/workflow/tracker/__tests__, extended with findIssuesByTitleToken`, `a stubbed gh boundary for the GitHub adapter and the legacy tracker-auto paths`, `a temporary repository with lowercase-story artifacts, one copied uppercase artifact, and a controllable clock for the cross-day cases`, `the validate seams (checkRunnerOverride, providerOverride, clockOverride, _setBuildValidateTestRecordWriterForTests) for the headless validate and error-handling cases`, `a tracker fake pre-loaded with an old issue that has the unit label, one with an artifact-id title, one with a longer id sharing the prefix, and one with neither`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/__tests__/artifact-ids.test.ts: make produces the stored text for every existing kind and parse returns the same key`, `src/workflow/__tests__/artifact-ids.test.ts: stored requirement ids in the canonical and slug forms parse to date, hash8, story as a number and fr`, `src/workflow/__tests__/storage.test.ts: lowercase-story artifacts keep their id and file name and resolve through the storage lookups and gates`, `src/workflow/__tests__/storage.test.ts: an artifact stored with an uppercase story fails with an error that points to the conversion`, `src/workflow/__tests__/id-removal.test.ts: no source file, bin entry or write-inventory row refers to src/workflow/id.ts or the migration tool, and the delivery reader loads a lowercase repository`, `src/workflow/__tests__/standalone-story.test.ts: a new standalone workflow with no storyId produces s1` |
| `ac2` | `src/workflow/tracker/__tests__/issue-title.test.ts: tracker-auto (team and legacy), unit-issue and the conventions bodies write an Epic, Story and Task title and marker that start with the artifact id`, `src/workflow/tracker/__tests__/issue-title.test.ts: an issue created earlier keeps its title and is adopted by its unit label or by an exact artifact-id title`, `src/workflow/tracker/__tests__/issue-title.test.ts: STORY s10 is never matched for s1 and TASK t10 never for t1, several matches and a failed lookup create nothing` |
| `ac3` | `src/workflow/__tests__/path-scheme.test.ts: two artifacts of one Epic written on different days land in the same folder`, `src/workflow/__tests__/anchor-folders.test.ts: HLD, LLD, PLAN, BUILD, TESTS and CR written on different days land in one folder on the epic route and on the standalone route, including delivery grouping`, `src/workflow/__tests__/anchor-folders.test.ts: an unstamped standalone LLD head does not yield its own createdAt as the anchor`, `src/daemon/steps/build-step/__tests__/validate-anchor.test.ts: the first headless validate call writes TESTS first, a failing judge leaves the evidence, and a retry on a later day files BUILD in the same folder`, `src/daemon/steps/build-step/__tests__/validate-anchor.test.ts: the first headless validate call with an injected TESTS write failure and a successful judge returns the verdict and writes a stamped BUILD`, `src/daemon/steps/build-step/__tests__/validate-anchor.test.ts: a read-intent MissingAnchorError returns the missing-anchor error and an ordinary ledger write failure still returns the verdict`, `src/workflow/runners/build/__tests__/completion-anchor.test.ts: ensureBuildRecordOnCompletion on a headless work item writes the BUILD record through write intent`, `src/workflow/__tests__/anchor-producers.test.ts: every root producer stamps epicCreatedAt and later records read it`, `src/workflow/__tests__/artifact-ids.test.ts: a folder name is not parsed as an artifact id` |

## 7. Migration

**State before:** Two id schemes exist. Artifact ids are built by interpolation in src/workflow/storage.ts and by nextAmendmentId in src/workflow/amendments/store.ts (storyId taken as stored, so 444 stored files carry an uppercase S0nn, and new standalone stories, the build-step defaults and the MCP text still say S001). src/workflow/id.ts holds the work-item scheme, WorkItemIdentity and deriveWorkItemIdentity, ordinals that accept both story cases and the requirement-id helpers, and is imported by 15 non-test source files; path-scheme.ts and the storage.ts path builders take a WorkItemIdentity. The folder date is chosen at about thirty call sites with different fallback chains; readEpicDefinitionCore returns an unstamped standalone LLD's own createdAt as the anchor; on the headless build route the TESTS record is written first with its own clock, the path calculations that precede the BUILD persist (storyWorkflowFiles in validate.ts and completion-record.ts) are treated as read-only, and validate.ts swallows ledger write failures. tracker-auto.ts (team and legacy paths), unit-issue.ts and conventions.ts write the work-item id into titles and issue-body markers, TrackerPort can only find issues by label and the legacy tracker-auto paths build their tracker directly. A throwaway docs migration tool built on the second scheme is still in the tree, and four identical pending sc1 amendments exist.

**State after:** One module makes and recognises every artifact id and requirement id in the strict lowercase form, including AMD, and storage.ts and nextAmendmentId build through it. Every producer defaults to s1. The Epic's creation time is resolved by head kind in one function; the first record any route writes stamps it; the record-folder helpers and the three path functions take an explicit read or write intent, so the validate turn and the completion hook anchor on their own time while genuine reads of an unanchored record raise MissingAnchorError, which validate surfaces as a missing-anchor error instead of swallowing. Paths are built from a WorkItemKey and keep today's folder text. TrackerPort has findIssuesByTitleToken; the three tracker creation paths write the artifact id and guard every create, with an injection seam for the legacy mode. src/workflow/id.ts and the docs migration tool are deleted and nothing refers to them. Artifacts stored with an uppercase story fail with a message that points to the s9 conversion.

**Zero downtime:** no — **Data rewrite:** yes

**Steps**

0. Before any code change: restate DEF ac1 as 'lowercase artifacts keep their id; uppercase artifacts fail with a pointer to the s9 conversion' and qualify the Epic constraint k2 with 'except the single s9 rename of S001 to s1', get the user's approval of the restated Define, and reject the duplicate sc1 amendments AMD-2f27754d4ad00b8e-2, -3 and -4 and approve AMD-2f27754d4ad00b8e-1 with the user. The s1 plan does not start until this is done. — ↩ rollbackable
1. Add the identity module with ArtifactIds and RequirementIds, with the per-kind table of required and forbidden fields (including AMD, TASKS and DIAG), and the unit tests that pin its output to the text storage.ts and nextAmendmentId build today for lowercase stories and to the stored requirement ids. — ↩ rollbackable
2. Switch the storage.ts id functions and nextAmendmentId to build through make, keeping the amendment counter scan, so an uppercase story throws. — ↩ rollbackable
3. Change every producer that defaults to an uppercase story: the standalone context, the build-step implement and validate defaults and the MCP tool descriptions and examples, and add the fresh standalone workflow test. — ↩ rollbackable
4. Add WorkItemKey and folderSegment to the path scheme, change resolveArtifactMdPath and resolveCompanionPath and the storage.ts path builders and pending.ts to take a key, and remove the re-exports of the identity constructor and type; folder text stays as today. — ↩ rollbackable
5. Add resolveEpicAnchor (by head kind), stampRootAnchor, MissingAnchorError and PathIntent next to readEpicCreatedAt; remove the LLD-own-createdAt fallback from readEpicDefinitionCore; make workItemAnchorCreatedAt require the stamp; make finalizeStandaloneLld always stamp; give buildRecordFolderArgs, storyRecordFolderArgs, buildRecordPathsFor, testRecordPaths and storyWorkflowFiles an explicit intent; change every other producer and reader on the inventory to read the resolved anchor and fail before any write when it is absent. — ↩ rollbackable
6. Change validate.ts so the turn holds one write root for the TESTS write, storyWorkflowFiles and the BUILD persist, and so both best-effort catches rethrow MissingAnchorError and runValidateSession returns a BuildStepError with code missing-anchor, leaving every other ledger failure best-effort; change ensureBuildRecordOnCompletion to pass write intent; add the first-headless-call tests including the injected TESTS write failure. — ↩ rollbackable
7. Add findIssuesByTitleToken to TrackerPort with its GitHub implementation, gh helper and fake, coordinating the port edit with s6. — ↩ rollbackable
8. Switch the tracker: titles and markers in tracker-auto.ts, unit-issue.ts and conventions.ts to the artifact id; guard every create with the unit-label lookup and the title-token lookup; apply the unit label to Story issues made by tracker-auto.ts; add the createTracker seam to the push entry points; make resolveWorkflowRef try ArtifactIds.parse and drop the work-item id and uppercase label forms. — ↩ rollbackable
9. Move every remaining importer of src/workflow/id.ts (delivery graph and read, the artifact renderers, the companion header, functional-definition.ts, orchestrator.ts) to the new module and update the tests that import it, including fr-id.test.ts. — ↩ rollbackable
10. Delete the docs migration tool, its bin entry, tests and write-inventory row, then delete src/workflow/id.ts, add the test that nothing refers to either, and record in the s9 inputs the 444 uppercase stored files, the stamping of old records and the relabelling of old issues. — ✕ non-rollbackable

**Backward compat:** None is kept in code, by the user's ruling. Artifacts already stored in the lowercase form keep their id and file name. The 444 stored files with an uppercase story stop resolving on the v2 branch until the s9 conversion renames them, so ac1 as worded in the DEF cannot hold for them and must be restated upstream, before implementation, as: lowercase artifacts keep their id; uppercase artifacts fail with a pointer to the conversion; and k2 must name the single s9 rename of S001 to s1 as its one exception. A record with no stamped epicCreatedAt, which the old code placed by its own day, now fails on a read path; the s9 conversion stamps it. Issues created earlier keep their title and are adopted by their unit label or an exact artifact-id title; an old issue with neither cannot be recognised by the code and may be duplicated once, which the s9 relabelling avoids. TrackerPort gains one method, which any other implementation of the port must provide. The insrc-migrate-docs command is removed.

## 8. Alternatives considered

### 8.1 a1: Strict id module, head-kind-aware anchor, explicit read and write intent, one retained write root per turn — **CHOSEN**

As the previous design, plus an explicit read or write intent on the path calculations and one write root held for the whole validate turn and the completion hook, so no write-intent caller can be mistaken for a read-only one.

Add one identity module with ArtifactIds (per-kind required and forbidden fields including AMD, TASKS and DIAG) and RequirementIds (stored grammar, story a number, undefined on a miss); storage.ts ids and nextAmendmentId build through make. resolveEpicAnchor reads the head by kind (a DEF or ISSUE head contributes its own createdAt, a standalone LLD head only its stamp) and readEpicDefinitionCore stops returning an LLD's own createdAt; finalizeStandaloneLld always stamps; workItemAnchorCreatedAt requires the stamp and raises MissingAnchorError. buildRecordPathsFor, testRecordPaths and storyWorkflowFiles take an explicit intent, either read or write with a root { createdAt }; the write form passes the root to buildRecordFolderArgs and storyRecordFolderArgs, which return the first available of a persisted BUILD or TESTS stamp, resolveEpicAnchor, then the root. Both callers of storyWorkflowFiles are write-intent and pass the record's own createdAt as root: runValidateSession (which holds one root, the turn's now, for the TESTS write, the path calculation and the BUILD persist, so an ordinary TESTS write failure leaves no later step without an anchor) and ensureBuildRecordOnCompletion in completion-record.ts. Genuinely read-only callers (testRecordMd, the code-review subject path, questions, the pending list, delivery grouping) pass read intent and raise MissingAnchorError, which validate rethrows from its best-effort catches as a missing-anchor BuildStepError. WorkItemIdentity is replaced by WorkItemKey, the tracker port gets findIssuesByTitleToken with the exact-token guard and the createTracker seam, the uppercase producers become s1, and id.ts and the docs migration tool are deleted. Restating ac1 and qualifying k2 in the DEF is a prerequisite step before any code change. No amendment proposal is emitted: AMD-1 already records the RequirementIds.parse change.

### 8.2 a2: Keep the previous design and let storyWorkflowFiles swallow the missing anchor

As the previous design, but storyWorkflowFiles catches MissingAnchorError and returns the paths it can compute.

The same id module, anchor resolver, key-based paths and tracker work, but storyWorkflowFiles keeps its existing try and catch style and returns only the paths it can place when the anchor is missing, so no intent parameter is needed.

**Rejected because:** Smaller change but hides the condition and corrupts the first headless change log (partial on ac3).

### 8.3 a3: Strict make, lenient parse that still reads the uppercase story form

As a1 for the anchor and paths, but parse and storage lookups keep accepting S001 and map it to s1.

The same anchor and path design as a1, but parse, the storage lookups and the label matcher keep accepting the uppercase story form and normalise it, so the stored artifacts keep resolving until the conversion.

**Rejected because:** Satisfies ac1 literally but violates k1 and the no-compatibility ruling (partial on sc1).

## 9. References

- **[[c1]]** `analyze-bundle` `s1 bundle: the work-item id scheme in src/workflow/id.ts: exports and shapes`
- **[[c2]]** `analyze-bundle` `s1 bundle: importers of src/workflow/id.ts`
- **[[c3]]** `analyze-bundle` `s1 bundle: flat artifact ids, the amendment id minter and the pending amendments`
- **[[c4]]** `analyze-bundle` `s1 bundle: the definition head reader and the epic anchor`
- **[[c5]]** `analyze-bundle` `s1 bundle: the record-folder helpers, the headless validate flow and the write-intent path calculations`
- **[[c6]]** `analyze-bundle` `s1 bundle: other sites that choose the folder date`
- **[[c7]]** `analyze-bundle` `s1 bundle: folder construction in src/workflow/path-scheme.ts and its consumers`
- **[[c8]]** `analyze-bundle` `s1 bundle: tracker issue creation paths and the tracker port`
- **[[c9]]** `analyze-bundle` `s1 bundle: uppercase story producers and reference resolution`
- **[[c10]]** `doc` `docs/plans/core-data-model.md`
- **[[c11]]** `prior-artifact` `HLD-2f27754d4ad00b8e`

## 10. Open questions

- PREREQUISITE: DEF ac1 says every existing artifact keeps its id and no stored reference stops resolving, and k2 says an artifact id never changes once created; the user's ruling and a1 break the 444 stored uppercase artifacts until s9. Restate ac1 as: lowercase artifacts keep their id; uppercase artifacts fail with a pointer to the s9 conversion, and qualify k2 with the single s9 rename of S001 to s1. The s1 plan must not start until the user has approved the restated Define.
- findIssuesByTitleToken is a TrackerPort addition and s6 (sc6) owns the port additions; the user is asked to record that s1 adds this single method and that s6 builds on it rather than adding a second title lookup.
- Four identical pending amendments AMD-2f27754d4ad00b8e-1 to -4 record the RequirementIds.parse change to sc1; reject -2, -3 and -4 and approve -1 with the user before s2 consumes sc1.
- An old tracker issue with neither a unit label nor an artifact-id title cannot be recognised by the guard; confirm that one possible duplicate until the s9 relabelling is acceptable.
- A record stored without epicCreatedAt now fails on a read path instead of being placed by its own day; the s9 conversion must stamp every old record, so confirm the stamp is part of the conversion inputs.

## Resolved questions

- `q28c07af3` — PREREQUISITE: DEF ac1 says every existing artifact keeps its id and no stored reference stops resolving, and k2 says an artifact id never changes once created; the user's ruling and a1 break the 444 stored uppercase artifacts until s9. Restate ac1 as: lowercase artifacts keep their id; uppercase artifacts fail with a pointer to the s9 conversion, and qualify k2 with the single s9 rename of S001 to s1. The s1 plan must not start until the user has approved the restated Define.
  - **resolved**: Approve the Define exception — Done on 2026-10-20 with the owner's yes: DEF ac1 restated and k2 qualified (DEF revision 1, commit 3c871d76). _(2026-10-20T08:50:41.939Z)_
- `q155d3f02` — findIssuesByTitleToken is a TrackerPort addition and s6 (sc6) owns the port additions; the user is asked to record that s1 adds this single method and that s6 builds on it rather than adding a second title lookup.
  - **resolved**: S1 adds; S6 reuses — Recorded as approved amendment AMD-2f27754d4ad00b8e-6 (methodAdd on sc6), owner's yes 2026-10-20. _(2026-10-20T08:52:05.535Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle: the work-item id scheme in src/workflow/id.ts: exports and shapes`
- **[[c2]]** `analyze-bundle` `s1 bundle: importers of src/workflow/id.ts`
- **[[c3]]** `analyze-bundle` `s1 bundle: flat artifact ids, the amendment id minter and the pending amendments`
- **[[c4]]** `analyze-bundle` `s1 bundle: the definition head reader and the epic anchor`
- **[[c5]]** `analyze-bundle` `s1 bundle: the record-folder helpers, the headless validate flow and the write-intent path calculations`
- **[[c6]]** `analyze-bundle` `s1 bundle: other sites that choose the folder date`
- **[[c7]]** `analyze-bundle` `s1 bundle: folder construction in src/workflow/path-scheme.ts and its consumers`
- **[[c8]]** `analyze-bundle` `s1 bundle: tracker issue creation paths and the tracker port`
- **[[c9]]** `analyze-bundle` `s1 bundle: uppercase story producers and reference resolution`
- **[[c10]]** `doc` `docs/plans/core-data-model.md`
- **[[c11]]** `prior-artifact` `HLD-2f27754d4ad00b8e`
