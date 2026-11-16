<!-- insrc:artifact LLD-149283b0d0455a43-s1 -->

# LLD: STORY-149283b0d0455a43-s1 — Make the story-list readers recognise an ISSUE-anchored work item

## Summary

**Epic:** `story-list-readers-do-not-recognise`
**HLD base run:** `wf-1794812683989-b7gbk4`
**HLD effective hash:** `70182799f7d0...`

A sized bugfix ISSUE now routes into design.story carrying its own hash and story id, so the LLD is LLD-<issueHash>-s1 under the ISSUE's folder instead of a new standalone root. One shared definition of the one-implied-story rule is used by the chain report and the tracker resolver, so `insrc workflow chain` reports the ISSUE-anchored item's single story, and the chain report no longer says to run define. design.epic and the tracker keep refusing an ISSUE as an Epic; when they meet one they say so instead of advising a Define. Relationship change: LLD, PLAN, BUILD and review records of a bugfix share the ISSUE's epicHash (ISSUE 1 : 1 Story s1, the Story keyed by the same hash, no new stored field); existing LLDs and ISSUEs are unchanged. The tracker push, sync and post stages are out of scope: an ISSUE-anchored item skips them in the chain report, and ISSUE-5f9d4ab4c90c0b4c tracks making them handle an ISSUE.

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

### 2.1 `nextAfterIssue`

```typescript
nextAfterIssue(issue: IssueArtifact, repo: string): BugfixNextCall
```

**Parameters:**
- `issue: IssueArtifact` — The approved ISSUE; meta.issueHash becomes the work-item anchor of the sized route.
- `repo: string` — Repository path forwarded into the emitted params, unchanged.

**Returns:** `BugfixNextCall` — For magnitude sized: an insrc_workflow_step start call for design.story whose params now also carry epicHash (the issue hash) and storyId 's1'; standalone:true and sizeClass:'bugfix' are unchanged. The small route is unchanged.

**Errors:**
- `Error('nextAfterIssue: invalid-magnitude')` when Magnitude is neither small nor sized (unchanged).
- `Error('nextAfterIssue: invalid-issue-hash')` when Sized route with a missing or non-hex issue.meta.issueHash; refused rather than letting design.story mint a new root.

**Preconditions:**
- issue.meta.issueHash is the 16-hex hash of the stored ISSUE root
- Existing fixtures that build an ISSUE for the sized route (the issue() builder in src/workflow/__tests__/bugfix-orchestration.test.ts and any advance fixture) carry a 16-hex meta.issueHash; every stored ISSUE already does.

**Postconditions:**
- The sized params.epicHash equals issue.meta.issueHash and params.storyId equals 's1'
- The small route output is byte-for-byte unchanged

### 2.2 `impliedIssueStories`

```typescript
impliedIssueStories(issue: { readonly body: { readonly title: string } }): readonly { readonly id: string; readonly title: string }[]
```

**Parameters:**
- `issue: { body: { title: string } }` — The ISSUE head whose story set is wanted.

**Returns:** `readonly { id: string; title: string }[]` — Exactly one entry: id 's1' (the single exported constant IMPLIED_ISSUE_STORY_ID) titled with the ISSUE title. The one place that states the one-implied-story rule; new, added next to readEpicDefinitionCore in src/workflow/storage.ts.

**Postconditions:**
- Always returns a one-element list with id 's1'

### 2.3 `buildChainReport`

```typescript
buildChainReport(repoPath: string, epicHash: string): ChainReport
```

**Parameters:**
- `repoPath: string` — Repository path.
- `epicHash: string` — Work item hash; a DEF hash or an ISSUE hash.

**Returns:** `ChainReport` — For a DEF-anchored item: unchanged. For an ISSUE-anchored item (no DEF, ISSUE root present; an ISSUE is equivalent to a define): the definition head is read as a discriminated value ({kind:'def', artifact: DefineArtifact} or {kind:'issue', artifact: IssueArtifact}); stories holds the implied s1 (from impliedIssueStories) with LLD existence and approval; each story path is built from the LLD's own meta (workItemAnchorCreatedAt, workItemKindOf, meta.epicSlug), as requireApprovedLld does, so it points under docs/standalone and not docs/epics; define reflects the ISSUE's existence, approval and rejection, with its path the ISSUE document; hld is absent and no HLD, amendment or staleness step applies. nextAction: ISSUE not approved -> approve-define whose command names the ISSUE document; ISSUE rejected -> run-define whose command reruns the issue stage (not define); then run-lld and approve-lld for s1; once s1's LLD is approved -> chain-complete. The tracker steps (push-tracker, sync-tracker) are skipped for an ISSUE-anchored item and left to ISSUE-5f9d4ab4c90c0b4c. When both a DEF and an ISSUE exist at one hash the DEF is read, as readEpicDefinitionCore does (design review separately refuses that state).

**Postconditions:**
- No existing field is removed or retyped; one optional field is added so a client can tell the definition is an ISSUE
- An ISSUE-anchored report never contains run-hld, approve-hld, review-amendment, refresh-stale, push-tracker or sync-tracker

### 2.4 `readDefineArtifact`

```typescript
readDefineArtifact(repoPath: string, epicHash: string): DefineArtifact
```

**Parameters:**
- `repoPath: string` — Repository path.
- `epicHash: string` — Hash expected to name a DEF.

**Returns:** `DefineArtifact` — Unchanged: still DEF-only, so requireApprovedEpic and every Epic-only caller keep refusing an ISSUE.

**Errors:**
- `ArtifactMissingError` when No DEF at that hash. When an ISSUE root exists at that hash the message names the work item as ISSUE-anchored (a bugfix has no Define or HLD) and does not tell the user to run define; otherwise the existing message is kept.

**Postconditions:**
- The error class and the throwing condition are unchanged; only the message differs for an ISSUE-anchored hash

## 3. Data model changes

### 3.1 `BugfixNextCall params for design.story (sized route)` — field-add

params gains epicHash (string, the issue hash) and storyId (string, 's1'). Consumed by the daemon start phase, where an existing epicHash is preserved and storyId is already honoured (augmentStandaloneParams).

**Call sites:**
- `src/workflow/bugfix/next-after-issue.ts:78`
- `src/workflow/bugfix/advance.ts:62`
- `src/daemon/steps/workflow-step/phases/start.ts:147`

### 3.2 `ChainReport` — field-add

One optional field, definitionKind ('def' | 'issue'), records which artifact is the work item's definition; no field removed or retyped, so IDE clients that parse the report keep working. Internally the chain reads the definition through a discriminated DEF-or-ISSUE value instead of a bare DefineArtifact.

**Call sites:**
- `src/workflow/chain.ts:97`
- `src/cli/services/workflow.ts:104`
- `src/workflow/chain.ts:200`

### 3.3 `Work item identity (ISSUE hash shared by LLD, PLAN, BUILD, review and chain records)` — invariant-change

For a sized bugfix the LLD id is LLD-<issueHash>-s1, so every downstream record keys on the ISSUE's hash. standalone:true remains a folder and workflow layout flag (docs/standalone) and does not mean independent of the ISSUE. Folder label and anchor are inherited from the ISSUE by the existing finalizeStandaloneLld path; design review classifies the LLD as kind issue because the ISSUE root exists at that hash. No ISSUE or LLD record shape changes.

**Call sites:**
- `src/workflow/orchestrator.ts:2404`
- `src/workflow/storage.ts:651`
- `src/workflow/review/design-review/subject.ts:94`
- `src/workflow/tracker/resolve.ts:292`

## 4. Error paths

**Error cases**

- **A sized ISSUE reaches nextAfterIssue with a missing or malformed meta.issueHash** (recoverable)
  - Detection: nextAfterIssue checks issue.meta.issueHash against the 16-hex pattern before building the sized params
  - Response: Throw 'nextAfterIssue: invalid-issue-hash'; no nextCall is emitted
  - User impact: The advance reports a failed follow-on instead of silently starting a design.story that mints a new orphan root
- **The ISSUE root is not on disk when design.story starts with the issue hash as epicHash** (recoverable)
  - Detection: readEpicDefinitionCore finds neither DEF nor ISSUE; finalizeStandaloneLld would fall back to a label from the story title and anchor on the LLD's own clock
  - Response: Unchanged behaviour; design review later rejects the LLD with 'Missing Epic/ISSUE provenance', which is the correct refusal for a bugfix LLD genuinely missing its ISSUE
  - User impact: A bugfix LLD without its ISSUE stays rejected at review
- **requireApprovedEpic or readDefineArtifact is called for a hash that has an ISSUE root and no DEF** (terminal)
  - Detection: DEF file is absent and the ISSUE json exists at the same hash
  - Response: Throw the same ArtifactMissingError class with a message naming the item as an ISSUE-anchored bugfix with no Define or HLD, not 'run define first'
  - User impact: design.epic and tracker push still refuse the item but explain the real situation
- **The chain report is requested for a hash with neither a DEF nor an ISSUE** (recoverable)
  - Detection: Both root files are absent
  - Response: Unchanged: run-define next action and zero stories
  - User impact: No behaviour change for a genuinely empty work item
- **Both a DEF and an ISSUE exist at one hash** (recoverable)
  - Detection: The chain report reader sees both roots
  - Response: The DEF wins, as readEpicDefinitionCore already does; the ISSUE is not used to build the story list
  - User impact: A DEF-anchored report is unchanged

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Sized ISSUE with the LLD for s1 already written (a second start for the same ISSUE) | The new run targets the same LLD-<issueHash>-s1 and revises it through the existing re-finalize path; no second root is created |
| Chain report for an ISSUE-anchored item before any LLD exists | One implied story s1 with hasLld false and approved false; the next action asks for the s1 LLD once the ISSUE is approved, or for the ISSUE approval before that |
| Chain report for an ISSUE-anchored item with an approved LLD | s1 reports hasLld and approved with the LLD's path under the ISSUE's docs/standalone folder, and no staleness (a standalone LLD has no HLD) |
| Small bugfix route (no LLD) | nextAfterIssue output is unchanged; the small build stays the no-LLD path |
| Genuine standalone feature or an Epic story starting design.story | Unchanged: a standalone feature without epicHash still mints a self hash, an Epic story still requires its approved DEF and HLD |
| Tracker resolver asked whether story s2 exists on an ISSUE-anchored item | null, exactly as now; only s1 is implied, and the rule is read from the single shared constant |
| Both a DEF and an ISSUE exist at one hash | The chain report reads the DEF; design review refuses the same state with 'Conflicting DEF and ISSUE roots', so the two are deliberately different (report stays readable, review stays strict) |
| Chain report for an ISSUE-anchored item whose s1 LLD is approved | chain-complete; no push-tracker or sync-tracker, because tracker handling of an ISSUE is ISSUE-5f9d4ab4c90c0b4c |
| Chain report for a rejected ISSUE | run-define kind whose command reruns the issue stage |

**Invariants to preserve**

- standalone:true on the LLD keeps meaning folder/workflow layout (docs/standalone) and skips the HLD staleness check; it is not changed and not reinterpreted as independence from the ISSUE [[c2]]
- A bugfix LLD with no ISSUE provenance is still rejected by design review with 'Missing Epic/ISSUE provenance; cannot downgrade to standalone' [[c2]]
- requireApprovedEpic still refuses an ISSUE root, so design.epic and the tracker push do not start accepting a bugfix as an Epic [[c3]]
- A standalone feature (no definition head) still mints a self hash from the runId when params.epicHash is absent [[c1]]
- The one-implied-story rule: an ISSUE-anchored item has exactly one story at ordinal 1 [[c3]]

## 5. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), tests under src/workflow/__tests__/*.test.ts, repo-seeded temp directories like folder-identity-finalize.test.ts and bugfix-orchestration.test.ts`

**Test levels**

- **unit** — Pin the producer's params and the single story rule without any repo on disk.
  - Subjects: `nextAfterIssue sized route: epicHash equals issue.meta.issueHash, storyId is 's1', standalone/sizeClass unchanged; invalid-issue-hash refusal; small route unchanged`, `impliedIssueStories and IMPLIED_ISSUE_STORY_ID: one entry, id s1`, `the sized-route fixtures in bugfix-orchestration.test.ts carry a 16-hex issueHash and still pass; nextAfterIssue refuses a sized ISSUE without one`
  - Fixtures: `the existing issue() builder in src/workflow/__tests__/bugfix-orchestration.test.ts`
- **integration** — Prove, against a seeded temp repo holding a stored ISSUE, that the identity, anchor, review admission, chain report and downstream records follow the ISSUE.
  - Subjects: `finalizeStandaloneLld started with the issue hash and s1 writes LLD-<issueHash>-s1 with the ISSUE's label, epicCreatedAt and folder`, `design review subject for that LLD resolves kind issue with the approved ISSUE as originating_issue`, `buildChainReport for the ISSUE-anchored hash returns implied s1 with LLD state and no run-define action`, `plan finalize and build records for the item keep the same epicHash and folder`, `readDefineArtifact/requireApprovedEpic on an ISSUE-only hash throw ArtifactMissingError whose message names the ISSUE and does not say 'run define'`, `genuine standalone LLD with no ISSUE still mints its own root and an Epic story still requires DEF and HLD`, `a bugfix LLD whose hash has no ISSUE root and no explicit ISSUE reference is still rejected by design review`, `chain report story path for an ISSUE-anchored item equals the LLD's own docs/standalone path, not a docs/epics path`, `chain report next action for an unapproved ISSUE is approve-define naming the ISSUE document, for a rejected ISSUE is run-define rerunning the issue stage, and after s1's LLD is approved is chain-complete with no tracker step`, `when both a DEF and an ISSUE exist at one hash the chain report reads the DEF`
  - Fixtures: `seedIssueRepo from src/workflow/__tests__/folder-identity-finalize.test.ts`, `a minimal DEF-anchored repo for the unchanged-behaviour cases`
- **contract** — Keep the one-implied-story rule in one place.
  - Subjects: `tracker/resolve.ts storyEvidence uses the shared constant: s1 implied, s2 not`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `bugfix-orchestration.test.ts: nextAfterIssue sized route carries epicHash=issueHash and storyId s1`, `issue-anchored-route.test.ts: sized ISSUE start writes LLD-<issueHash>-s1 and no second root` |
| `ac2` | `issue-anchored-route.test.ts: the LLD inherits the ISSUE label, epicCreatedAt and folder` |
| `ac3` | `issue-anchored-route.test.ts: design review classifies the LLD as kind issue with the ISSUE as originating_issue` |
| `ac4` | `issue-anchored-route.test.ts: chain report for an ISSUE-anchored item returns the implied s1`, `issue-anchored-route.test.ts: chain report for an ISSUE-anchored item never advises run-define`, `issue-anchored-route.test.ts: tracker resolver and chain report read the same implied story rule`, `issue-anchored-route.test.ts: chain report story path for an ISSUE-anchored item is the standalone folder`, `issue-anchored-route.test.ts: chain report next actions for an ISSUE-anchored item follow approve, run-lld, approve-lld, chain-complete`, `issue-anchored-route.test.ts: chain report prefers a DEF when a DEF and an ISSUE share a hash` |
| `ac5` | `issue-anchored-route.test.ts: PLAN and BUILD for the sized ISSUE keep the ISSUE epicHash and folder` |
| `ac6` | `issue-anchored-route.test.ts: a genuine standalone feature still mints its own root`, `issue-anchored-route.test.ts: an Epic story still requires its DEF and HLD`, `issue-anchored-route.test.ts: requireApprovedEpic still refuses an ISSUE root with a message naming the ISSUE` |
| `ac7` | `issue-anchored-route.test.ts: a bugfix LLD with no ISSUE provenance is still rejected by design review`, `bugfix-orchestration.test.ts: nextAfterIssue refuses a sized ISSUE with no issueHash`, `bugfix-orchestration.test.ts: sized-route fixtures carry an issueHash` |

## 6. Migration

**State before:** The sized bugfix route emits design.story params without epicHash or storyId (src/workflow/bugfix/next-after-issue.ts:78), so the daemon start phase mints a new epicHash (src/daemon/steps/workflow-step/phases/start.ts:147) and the LLD is a new standalone root; design review then fails with 'Missing Epic/ISSUE provenance'. The chain report reads only a DEF (src/workflow/chain.ts:150, :161) and reports zero stories and run-define for an ISSUE-anchored item. readDefineArtifact (src/workflow/gates.ts:159) tells the user to run define. The one-implied-story rule exists only in src/workflow/tracker/resolve.ts:292.

**State after:** The sized route carries epicHash = the issue hash and storyId s1, so the LLD is LLD-<issueHash>-s1 in the ISSUE's folder. One shared constant and helper state the implied-story rule, used by the chain report and the tracker resolver. The chain report returns the implied s1 for an ISSUE-anchored item and never advises run-define for it; readDefineArtifact names the ISSUE-anchored situation. DEF-anchored items, genuine standalone features and Epic stories behave exactly as before.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the shared implied-story constant and helper next to readEpicDefinitionCore and point tracker/resolve.ts storyEvidence at it; behaviour identical, covered by existing resolver tests. — ↩ rollbackable
2. Teach the chain report to read the work item's definition head as DEF or ISSUE and to build the implied story and next action from an ISSUE head; add one optional field on ChainReport naming the definition kind. — ↩ rollbackable
3. Change the ArtifactMissingError message of readDefineArtifact when an ISSUE root exists at the hash; error class and throw condition unchanged. — ↩ rollbackable
4. Add epicHash and storyId to the sized route of nextAfterIssue, with the invalid-issue-hash refusal; small route untouched. — ↩ rollbackable

**Backward compat:** No stored artifact changes shape, so no data is rewritten and existing ISSUE, LLD, PLAN and BUILD records stay valid. ChainReport gains one optional field only, so the VS Code and JetBrains clients that read it over IPC keep working (their parsers must ignore unknown optional fields; verify against vscode-plugin and jetbrains-plugin chain readers before build). Already-approved ISSUEs that have an orphaned standalone LLD from the old route keep that LLD; they are not migrated, and re-running design.story for such an ISSUE through the new route creates LLD-<issueHash>-s1 as a separate record. The emitted nextCall of an ISSUE approved before this change is recomputed from the stored ISSUE at advance time, so it picks up the new params with no stored state to update. Test fixtures that build a sized ISSUE gain an issueHash. The chain report no longer suggests push-tracker or sync-tracker for an ISSUE-anchored item; the tracker stages stay unchanged and DEF-only until ISSUE-5f9d4ab4c90c0b4c.

## 7. Alternatives considered

### 7.1 a1: Producer-only fix

nextAfterIssue passes epicHash=issueHash and storyId='s1'; readers untouched.

Change only the sized branch of nextAfterIssue (src/workflow/bugfix/next-after-issue.ts) to add params.epicHash = issue.meta.issueHash and params.storyId = 's1' alongside standalone:true. The daemon start phase keeps a supplied epicHash, finalizeStandaloneLld inherits label/anchor from the ISSUE root, and design review classifies the LLD as kind issue. buildChainReport, the tracker readers and the 'run define first' advice are left exactly as they are.

**Rejected because:** Fixes the new reproduction only; the original reader defect and the misleading advice remain, so the approved ISSUE is not discharged.

### 7.2 a2: Producer fix plus one shared ISSUE-aware story-set read, adopted by the chain report only — **CHOSEN**

Producer retains the ISSUE anchor; one shared function states the implied-s1 rule; chain report and tracker resolver call it; design.epic keeps refusing an ISSUE.

(1) nextAfterIssue's sized branch adds epicHash=issue.meta.issueHash and storyId='s1'. (2) Add one exported helper next to readEpicDefinitionCore in src/workflow/storage.ts that reads the work item's definition head (DEF then ISSUE) and returns the declared story ids for a DEF or the single implied 's1' for an ISSUE; tracker/resolve.ts storyEvidence is changed to call it so the rule lives in one place. (3) buildChainReport reads the head through a DEF-or-ISSUE reader: an ISSUE head yields one implied story s1 with its LLD state, nextAction names the ISSUE stage (no run-define advice). (4) requireApprovedEpic stays DEF-only so design.epic and the tracker push still refuse an ISSUE, but its ArtifactMissingError is replaced, when an ISSUE root exists at that hash, by a message that names the ISSUE as the real situation.

### 7.3 a3: Make requireApprovedEpic ISSUE-aware for every caller

The shared gate returns a synthesized DefineArtifact for an ISSUE root.

Change requireApprovedEpic and readDefineArtifact in src/workflow/gates.ts to fall back to the ISSUE root and return a DefineArtifact synthesized from it with one story s1, so all nine callers and the chain report see an ISSUE-anchored item with no per-site change. The producer fix of a1 still applies.

**Rejected because:** Cheapest reader fix but it is the option the issue itself warns against, and it can let an Epic HLD be authored for a bugfix.

### 7.4 a4: Per-caller ISSUE handling at each requireApprovedEpic site

Each of the nine call sites decides for itself whether to tolerate an ISSUE.

Leave the shared reader alone and edit each non-test caller (readPlanUpstream, finalizeDefineExtend, finalizeDesignEpic, finalizeDesignStory, the design-story and design-epic runners, tracker context) with its own ISSUE branch, plus the chain report, plus the producer fix.

**Rejected because:** Correct per caller but creates the third inconsistent convention and mostly dead edits.

## 8. References

- **[[c1]]** `analyze-bundle` `s1 bundle 1: producer of the sized-bugfix design.story nextCall and its identity params` — "nextAfterIssue emits the sized route with params {standalone:true, storyTitle, storySpec, sizeClass:'bugfix'}; it carries no epicHash and no storyId."
- **[[c2]]** `analyze-bundle` `s1 bundle 2: how a standalone design.story LLD takes its identity, label, anchor and review classification from an ISSUE root` — "Design review already classifies an LLD as kind 'issue' when an ISSUE-<epicHash> root exists."
- **[[c3]]** `analyze-bundle` `s1 bundle 3: readers that only know DEF roots and the one-implied-story rule` — "readDefineArtifact is DEF-only; buildChainReport returns [] stories when the DEF is absent; the implied-story rule exists once, in tracker/resolve.ts."
- **[[c4]]** `code` `src/workflow/bugfix/next-after-issue.ts:78` — "workflow: 'design.story',"
- **[[c5]]** `code` `src/daemon/steps/workflow-step/phases/start.ts:147` — "export function augmentStandaloneParams(params: Record<string, unknown>, runId: string): void {"
- **[[c6]]** `code` `src/workflow/review/design-review/subject.ts:94` — "Missing Epic/ISSUE provenance; cannot downgrade to standalone"
- **[[c7]]** `code` `src/workflow/chain.ts:161` — "if (define.artifact === undefined) return [];"
- **[[c8]]** `code` `src/workflow/tracker/resolve.ts:292` — "An ISSUE declares no story list — the bugfix route is one story at ordinal 1."
- **[[c9]]** `prior-artifact` `ISSUE-149283b0d0455a43 (approved) — the defect record this LLD answers`
- **[[c10]]** `prior-artifact` `ISSUE-5f9d4ab4c90c0b4c — the draft issue tracking tracker push, sync and post for an ISSUE-anchored item`
- **[[c11]]** `code` `src/workflow/chain.ts:200` — "lldArtifactPaths(repoPath, epicHash, s.id, define.artifact!.meta.createdAt, 'epic', epicSlug).md"

## 9. Open questions

- cd1 (partial): impliedIssueStories, IMPLIED_ISSUE_STORY_ID and the optional ChainReport field are new symbols proposed by this Story, not existing code.
- ep3 (partial): the invariant sources c1-c3 map to the three s1 analyze bundles in order; the s1 output does not carry those ids.
- ts1 (partial): the Story has no acceptance criteria of its own; ac1-ac7 are derived from the approved ISSUE's regression-coverage list.
- alt2 (partial): alternatives were scored against four issue.* constraints written in s3, as the Story and Epic carry none.
- Decided (user, 2026-11-16): an ISSUE is equivalent to a define for the chain, so no new NextAction kinds are added; tracker handling is deferred to ISSUE-5f9d4ab4c90c0b4c.
- Unverified: a second design.story start for the same ISSUE revising LLD-<issueHash>-s1 through the existing re-finalize path; it is expected from finalizeStandaloneLld but not exercised.
- Checked: the JetBrains WorkflowChainReader reads the artifact files itself and builds its own hint, and the VS Code plugin has no nextAction consumer, so neither reads the daemon ChainReport and the optional definitionKind field cannot break them. Separately, the JetBrains reader reads only DEF files, so it will not show an ISSUE-anchored item; that is outside this Story.

## Resolved questions

- `qefcdc6f7` — cd1 (partial): impliedIssueStories, IMPLIED_ISSUE_STORY_ID and the optional ChainReport field are new symbols proposed by this Story, not existing code.
  - **resolved**: Plan treats them as new, LLD-sourced symbols — Greenfield by design; the LLD is the source and tasks create them. _(2026-11-16T08:26:26.456Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle 1: producer of the sized-bugfix design.story nextCall and its identity params` — "nextAfterIssue emits the sized route with params {standalone:true, storyTitle, storySpec, sizeClass:'bugfix'}; it carries no epicHash and no storyId."
- **[[c2]]** `analyze-bundle` `s1 bundle 2: how a standalone design.story LLD takes its identity, label, anchor and review classification from an ISSUE root` — "Design review already classifies an LLD as kind 'issue' when an ISSUE-<epicHash> root exists."
- **[[c3]]** `analyze-bundle` `s1 bundle 3: readers that only know DEF roots and the one-implied-story rule` — "readDefineArtifact is DEF-only; buildChainReport returns [] stories when the DEF is absent; the implied-story rule exists once, in tracker/resolve.ts."
- **[[c4]]** `code` `src/workflow/bugfix/next-after-issue.ts:78` — "workflow: 'design.story',"
- **[[c5]]** `code` `src/daemon/steps/workflow-step/phases/start.ts:147` — "export function augmentStandaloneParams(params: Record<string, unknown>, runId: string): void {"
- **[[c6]]** `code` `src/workflow/review/design-review/subject.ts:94` — "Missing Epic/ISSUE provenance; cannot downgrade to standalone"
- **[[c7]]** `code` `src/workflow/chain.ts:161` — "if (define.artifact === undefined) return [];"
- **[[c8]]** `code` `src/workflow/tracker/resolve.ts:292` — "An ISSUE declares no story list — the bugfix route is one story at ordinal 1."
- **[[c9]]** `prior-artifact` `ISSUE-149283b0d0455a43 (approved) — the defect record this LLD answers`
- **[[c10]]** `prior-artifact` `ISSUE-5f9d4ab4c90c0b4c — the draft issue tracking tracker push, sync and post for an ISSUE-anchored item`
- **[[c11]]** `code` `src/workflow/chain.ts:200` — "lldArtifactPaths(repoPath, epicHash, s.id, define.artifact!.meta.createdAt, 'epic', epicSlug).md"
