# Core data model: brainstorm decision log

Started 2026-10-19 with the owner (Subho Ghosh), after the team signoff epic exposed that Task-level comments, history and references have nowhere to live. This is a brainstorm in progress: a gap is **settled** only when it says so. Nothing here is built. When the brainstorm converges it becomes a SPEC, then goes through triage (an epic).

## Proposed base class: `Artifact`

Every persisted entity (Define, Design, Plan, Task, BUILD/CR/TESTS records, UML diagrams, mocks, ...) inherits from it.

| Attribute | Shape |
| :--- | :--- |
| `id` | the artifact's unique, hierarchical ID (Gap 1) |
| `description` | a summary of the artifact |
| `parent?` | `Reference` |
| `changeLog[]` | `{ actor, timestamp, operation (create / update / delete), references? }` |
| `comments[]` | `Comment { id (UUID), text, actor, timestamp, comments[] }` (nested) |
| `references[]` | `Reference { entityId, type }` |

`Actor { id (required: git id, Jira id or OS user), name?, properties{} }`.

## Why: what the code has today

- `meta.revision`, `meta.runId`, `meta.attribution` approximate a change log; `body.feedback[]` (Define, HLD, LLD, Plan only, each declaring its own copy of the field) approximates comments; `meta.tracker` and `citations` approximate references; `epicHash` / `storyId` are the implicit parent keys.
- A Task is a row (`PlanTask`) inside the Plan and has no feedback, history or references of its own.
- Tracker issue comments are only ever written by insrc, never read.
- There are two ID systems (below).

## Gap 1: ID scheme: SETTLED

Today: the work-item ID in `src/workflow/id.ts` (`E<YYYYMMDD><hash8>[:S<nnn>][:T<nnn>]`, added with the GitHub/Jira integration; used for issue titles, folders, labels) and the artifact IDs in `src/workflow/storage.ts` (`DEF-<hash16>`, `LLD-<hash>-S001`, `PLAN-…`, `BUILD-…`, `CR-…`, `TESTS-…`, `SPEC-…`, `ISSUE-…`, `EXT-…`, `AMD-…`). The second duplicates the first and the two disagree (`S001` against `s1`, hash length). The duplication is a defect.

1. IDs stay hierarchical and human-readable (they read well on flat tracker schemas such as GitHub). No separate UUID.
2. One ID system, minted in one module. The work-item grammar is the base; an artifact's ID is its owning unit's ID plus an optional type segment: Task `...:T010`, diagram or mock `...:DIAG<nnn>`, build / code-review / test records `...:BR`, `...:CR`, `...:TR` (the Story ID plus the segment).
3. Rounds (`BR`, `CR`, `TR`) are overwritten in place; the change log is the only record of earlier rounds (so a log entry for them must carry the round's outcome: Gap 4).
4. An ID never changes. Diagram numbering is a per-parent counter; only the unit's holder authors under it (the claim gate), so counters do not collide.
5. The design documents take type segments `:DEF`, `:HLD`, `:LLD`, `:PLN` (so an LLD is `E...:S006:LLD`; the unit's own ID stays the unit's, never the document's).
6. There are several ID **roots**, minted by the one module: `E<YYYYMMDD><hash8>` (epic work items), `SPEC<YYYYMMDD><hash8>` (a brainstormed spec) and `ISSUE<YYYYMMDD><hash8>` (a tracked defect). The grammar after the root is the same. `SPEC` and `ISSUE` are **origin artifacts**: the artifacts downstream (the Define, or a bugfix's first artifact) carry a **reference** to them (relation `derived-from`), not a parent edge, and a SPEC or ISSUE is never re-IDed when it becomes an epic or story. This makes the relation kind on `Reference` (Gap 7) required.

## Gap 2: payload and lifecycle on the base: SETTLED

1. **Payload** is defined by each subclass (typed per subclass). The base stays generic.
2. **Lifecycle** is defined in the base as proper structures, not loose fields. A subclass that does not use a structure leaves it empty.

```
Artifact: id, description, parent?, references[], comments[], changeLog[], lifecycle: Lifecycle, payload (subclass)

Lifecycle   { status, revision: Revision, approval?: Approval, review?: Review, signoffs: Signoff[], stale?: Staleness }
Revision    { number, contentHash, at, by: Actor }
Approval    { revision, by: Actor, at, override?: { reason } }
Review      { revision, reviewer: Actor, party: controller | daemon, verdict: pass | warn | block, counts, at, report?: Reference }
Signoff     { revision, request: Reference (external PR / MR / Jira item), state: open | changes-requested | completed, actors: Actor[], at }
Staleness   { upstream: Reference, upstreamRevision, since }
```

3. `approval` and `review` hold the **current** record only; history is in the change log. `signoffs` is a list (a stage can have several requests over time).
4. `Review` is part of the base; **whether a type requires review is a setting** (today only Define, HLD and LLD do).
5. Every change to a lifecycle structure appends a change log entry (approve, review, signoff opened / completed, marked stale, ...). The structures hold the current answer; the log holds the history. Each structure names the revision it covers, so a content change leaves the old approval, review and signoffs visible as covering an older revision and the status falls back to `draft`.
6. **Status values** (solo repos may use any of them; only the signoff steps are team-only):

| Status | Kind | Meaning |
| :--- | :--- | :--- |
| `draft` | working | authored, not put forward; also where a content change lands |
| `pending-review` | working | the other-party review is requested and has not returned |
| `approved` | working | locally approved at the current revision, review satisfied where required |
| `in-signoff` | step | a signoff request is open on this revision |
| `changes-requested` | step | the requester asked for changes; the author revises |
| `signed-off` | step | the third party signed off this revision |
| `rejected` | working | needs rework; a new revision returns it to `draft` |
| `completed` | terminal | the unit's work is done (roll-up rule below) |
| `withdrawn` | terminal | deprecated or not needed |
| `superseded` | terminal | replaced by another artifact that carries its lineage |

Stale, the review verdict and the claim are **not** statuses: stale is the `Staleness` structure, the verdict lives in `Review`, and who holds a unit is the tracker assignee.

7. **Transitions**
```
draft -> pending-review -> draft (verdict recorded) | draft -> approved
approved -> in-signoff -> signed-off | in-signoff -> changes-requested -> draft (new revision)
draft | approved | in-signoff -> rejected -> draft (new revision)
non-terminal --content changes--> draft
non-terminal --replaced--> superseded | --dropped--> withdrawn
```
8. **`completed` is a roll-up, recorded when it first becomes true** (a `completed` log entry; the existing completion hook releases the claim; a re-plan of a completed unit is an explicit reopen):
   - a **Task** completes when its build is done and has passed the gate;
   - a **Story** completes when all its Tasks are completed and its build record has been code-reviewed and approved;
   - an **Epic** completes when all its Stories are completed;
   - **withdrawn and superseded children do not count**; rejected or unfinished children do;
   - the design documents, diagrams and the `BR` / `CR` / `TR` records become `completed` **together with the unit they describe** (a finished Story's LLD, Plan, diagrams and records are all frozen as completed);
   - the code review must be **clean, or explicitly overridden by the user** (the override is recorded in the log).

## Gap 3: revision: SETTLED

1. `Lifecycle.revision` is the structure `{ number, contentHash, at, by }`, holding the **current** revision only. History is in the change log: every content-changing entry records the revision number and hash it produced.
2. A revision moves **only when content changes**. An identical rewrite (same hash), a comment, a reference change or a provenance write does not move it. (This formalises S4-2 / S4-3.)
3. **Content** (what `contentHash` covers) is the `payload` and the `description`. `parent`, `references`, `comments`, `changeLog` and `lifecycle` are **not** content: adding a tracker link or an origin reference does not invalidate a signoff. Re-parenting is its own deliberate, logged operation (`reparent`), not a silent edit.
4. Both the **number** (for people and for binding: "signoff covers revision 7") and the **hash** (integrity, and detecting an identical rewrite) are kept.
5. Revisions **do not cascade** through the hierarchy: an Epic's revision does not move when a Story changes. Upstream movement is the job of `Staleness`.
6. Two clones that both bump to the same number offline can name different content once git merges the files. The rule (detect the hash mismatch and report a conflict) is decided with Gap 10 (storage and merges).

## Gap 4: operations and the change log entry: SETTLED

```
ChangeLogEntry { id, actor, timestamp, operation, revision?: { number, contentHash }, status?: { from, to }, outcome?: { result, summary, data? }, references? }
```

1. The operation set is **closed**. Content: `create`, `update`, `delete` (reserved: no producer today), `reparent`. Lifecycle: `request-review`, `review`, `approve`, `reject`, `open-signoff`, `signoff-changes`, `signed-off`, `complete`, `reopen`, `withdraw`, `supersede`, `mark-stale`, `ack-stale`. A build, review or test round is an `update` carrying an `outcome` (this is how the overwritten `BR` / `CR` / `TR` keep their history). A subclass adds detail through `outcome.data`, not a new operation.
2. A content operation carries `revision`; a lifecycle operation carries `status { from, to }` (mandatory), so the log alone explains every status change and the current state can be rebuilt by replaying it.
3. **Not in the log:** comments (their own stream), claims and releases (the tracker assignee), and reference additions that are not content.
4. Withdrawing something (a dropped Task) is `withdraw`, never `delete`.
5. The whole log is kept; its size is handled with storage (Gap 10).

## Gap 5: comment vs feedback: SETTLED

The class is **`Feedback`** (the artifact field `comments[]` becomes `feedback[]`). Entries are immutable and append-only, with **no lifecycle of their own** (no resolved flag, no decision).

```
Feedback { id (UUID), text, actor, timestamp, feedback[] (nested replies), kind: comment | suggestion | revision-request,
           anchor?: { quote?, section?, prefix?, suffix?, lines? }, revision? (the artifact revision it was written against),
           source?: { system, externalId, url? }, batchId? }
```

1. Feedback is **resolved as part of the artifact, not individually**: an `update` change log entry carries `addresses: all | [feedback ids]` (default `all`). **Open feedback** is whatever no `update` entry has addressed; it is derived, never stored on the entry.
2. A reply is just another `Feedback` entry nested under its parent, of any `kind`.
3. `decision` is dropped (approvals live in `lifecycle.approval` and the log); `revision` replaces `target.version`, tying feedback to `Lifecycle.revision`.
4. The link from an IDE review comment to an open question (a payload element) needs a `Reference` that points inside an artifact: `fragment?` (decided with Gap 7).

## Gap 6: external ids and tracker sync: SETTLED

1. **Inbound:** a comment on the artifact's tracker issue is ingested as a `Feedback` entry with `source = { system, externalId, url? }`. `externalId` dedupes (ingested once). insrc's own posts carry the `<!-- insrc:... -->` marker and are never ingested.
2. **No stored cursor:** the "since" point is derived, the latest timestamp among the artifact's feedback that carries that `system`.
3. **Outbound:** feedback entered in the IDE or TUI against a unit with a tracker issue is posted once; its `source` is then set to the posted comment. `source` therefore means "this entry is in the tracker", in both directions.
4. **Which issue:** the unit's own issue (a Task's feedback goes to the Task issue); the issue is in the artifact's `references[]`.
5. **Edits and deletes** on the tracker side are not mirrored (feedback is immutable); a later edit shows up as a new reply if someone writes one.
6. **`kind` from the tracker:** defaults to `comment`; a first line `/revise` makes a `revision-request` and `/suggest` a `suggestion`.
7. **Actor:** a synced entry records the tracker user as a namespaced actor id such as `github:subhagho` (Gap 9).
8. **When it runs:** on demand, and where the holder works on the unit (for a Task: `implement` and `validate`). No background polling.

## Gap 7: parent vs references: SETTLED

```
Reference { entityId, type, relation, fragment?, quote? }
```
1. `entityId` is an artifact ID or an external id (`owner/repo#N`, a code path, a URL). `type` is the **target's** type: an artifact type (SPEC, LLD, TASK, DIAG, ...) or a namespaced external type (`github:issue`, `jira:issue`, `github:pull-request`, `code`, `doc`, `url`); an integration adds its own namespace.
2. `relation` says **why** the edge exists, from a closed set: `derived-from` (a Define from its SPEC, a bugfix from its ISSUE), `depends-on` (Task on Task), `tracked-by` (the tracker issue or request), `supersedes`, `documents` (a diagram or mock of what it illustrates), `implements`, `cites` (grounding), `reviews`.
3. `fragment?` points inside the target (a section, a payload element such as an open question, or lines); `quote?` carries the quoted text of a citation.
4. **`parent` stays its own single field**: the work-item hierarchy edge (Epic > Story > Task). Children are derived from it with an index, never stored. A `parent` that disagrees with the hierarchical ID is a validation error.
5. References are **outgoing only**; "what references this" is derived. Adding a reference is not content and never moves a revision.
6. What folds in: `citations[]` become `cites` references (the `[[c1]]` markers map onto reference ids); `meta.tracker` becomes `tracked-by` references; `PlanTask.dependsOn` becomes `depends-on` between Task artifacts. The unit-issue record fields that are not references (`createdAtRevision`, `extrasDone`, `pendingLink`) need a home (Gap 8).

## Gaps still to discuss (one at a time)

8 issues as external references; 9 actor id namespacing; 10 storage and merges across clones; 11 Tasks as their own artifacts; 12 migration.
