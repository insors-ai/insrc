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

## Gap 1: ID scheme: SETTLED (corrected 2026-10-19)

**One scheme: the artifact ids.** The workflow ID scheme (`src/workflow/id.ts`, `E<date><hash8>:S<nnn>:T<nnn>`) is **completely removed**; it was added by the GitHub/Jira integration epic and duplicated ID creation. (Evidence it drifted: a PLAN's title read `E20261018...` from the plan's own `createdAt` while its folder read `E20261016...` from the epic's `epicCreatedAt`.)

1. An artifact id is `<TYPE>-<epicHash16>[-<story>[-<task>[-<n>]]]`: hierarchical, readable, with no separate UUID, and **an id never changes**.
2. **Existing prefixes are unchanged** (no migration): `DEF-`, `HLD-`, `LLD-`, `PLAN-`, `BUILD-`, `CR-`, `TESTS-`, `EXT-`, `AMD-`, `SPEC-`, `ISSUE-`.
3. **New ids** for what has none: `EPIC-<hash>`, `STORY-<hash>-<story>`, `TASK-<hash>-<story>-<task>`, `TASKS-<hash>-<story>` (the Tasks file) and `DIAG-<hash>-<story>-<n>` (`n` per owning unit; only the holder authors under a unit, so counters do not collide). A future PRD takes `PRD-<hash>`.
4. **One story-id form everywhere:** lower case `s6` and `t10` (standalone `S001` becomes `s1`). Folder names are derived from it and keep their present form.
5. `BUILD-`, `CR-` and `TESTS-` are one per Story and are **overwritten in place**; the history of rounds is the change log.
6. The Define is `DEF-<hash>` as today and is the `parent` of its Epic `EPIC-<hash>` (same hash while one Define has one Epic); `SPEC-` and `ISSUE-` are origin artifacts that later artifacts reference (`derived-from`).
7. **Issue titles and the issue-body marker use the artifact id:** `EPIC-<hash> — <problem>`, `STORY-<hash>-s6 — <title>`, `TASK-<hash>-s6-t10 — <title>`. Issues created earlier keep their titles; lookup uses the `insrc:unit:...` label, not the title; the body-marker reader accepts both forms during the transition.
8. **Folder names are unchanged:** `docs/epics/<slug>-E<date><hash8>/S006/`, the date always taken from the epic's `epicCreatedAt`. The folder-name formatter moves to the path scheme and is a directory name only; it is never parsed back into an id.

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
4. The link from a review comment (from a plugin or the TUI) to an open question (a payload element) needs a `Reference` that points inside an artifact: `fragment?` (decided with Gap 7).

## Gap 6: external ids and tracker sync: SETTLED

1. **Inbound:** a comment on the artifact's tracker issue is ingested as a `Feedback` entry with `source = { system, externalId, url? }`. `externalId` dedupes (ingested once). insrc's own posts carry the `<!-- insrc:... -->` marker and are never ingested.
2. **No stored cursor:** the "since" point is derived, the latest timestamp among the artifact's feedback that carries that `system`.
3. **Outbound:** feedback entered in the TUI or another client against a unit with a tracker issue is posted once; its `source` is then set to the posted comment. `source` therefore means "this entry is in the tracker", in both directions.
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

## Gap 8: issues and external things: SETTLED (item 8's ids superseded by the Gap 1 correction)

1. A tracker issue is **not an artifact**; an artifact points to it with a `tracked-by` reference. (The `ISSUE` root is insrc's own defect record, a different thing.)
2. **Lifecycle artifacts** are tracked and have a **1:1 binding** to a tracker issue (created by the framework, or created first by a person with the artifact then created linked to it): **Define (to become the PRD) > Epic > Story > Task**. `parent` of an Epic is its Define/PRD (one PRD can have several Epics); `parent` of a Story is its Epic; of a Task its Story. A PRD concept is the extension of today's Define.
3. **Supporting artifacts** have no issue of their own and are **attached to the issue of the unit they describe**: HLD, LLD, PLAN, the `BR` / `CR` / `TR` records, diagrams and mocks.
4. Attachment is an `attach(issue, artifact)` port operation each adapter implements: **GitHub and GitLab post a link** (the artifact is checked in), as a **permalink to the file at a commit**, not a branch; a new revision posts a new link and the old one stays as history. **Jira** uploads a real attachment.
5. Tracker bookkeeping is a typed structure, not a bag:
```
Artifact.binding?       { reference (tracked-by), createdAtRevision, posted[], pendingLink? }   lifecycle artifacts
Artifact.attachments[]  { target, revision, at, externalId? }                                   supporting artifacts
```
6. insrc's own posts to an issue (design summary, review report, plan comment) are `posted[]` marks, not Feedback; the `<!-- insrc:... -->` marker keeps them out of ingestion.
7. A repo with **no tracker** has no `binding`.
8. **IDs:** see Gap 1 (corrected): `DEF-<hash>` is the parent of `EPIC-<hash>`.

## Gap 9: actor identity: SETTLED

```
Actor { id: "<namespace>:<value>", kind: person | agent | system, name?, properties: { email?, aliases?: id[], via?, ... } }
```
1. `id` is **namespaced** (lower-case namespace) so ids cannot collide: `github:subhagho`, `gitlab:...`, `jira:5b10...`, `git:name@example.com`, `os:user@host`; the fixed system actors are `insrc:daemon` and `insrc:controller` (the two review parties).
2. `kind` is a proper field: `person`, `agent` (a model acting for a person: the `actor` is the person and `properties.via` names the tool, e.g. `claude-code`) or `system`.
3. **Aliases are explicit, never guessed.** One person can hold several ids at once (a Jira account that holds the claim and a GitHub account that commits and signs off), so `properties.aliases` links them.
4. **Gates decide on the live identity from the tracker itself** (the tracker's own `whoAmI`), never on a declared alias, so a declaration cannot spoof a claim. Aliases are for linking records and showing one name.
5. A person declares their own ids in a **per-user identity file local to the machine** (`~/.insrc/identity.json`: `{ primary, aliases[] }`). It is self-declared, so it is used for attribution and display only; a team roster in the policy is a possible later addition.
6. When an actor is recorded, `id` is the identity of the system the action came through and the declared aliases are copied into `properties.aliases`. A bare login in old records is read as `<tracker>:<login>`.

## Gap 10: storage and merges across clones: SETTLED

1. **Three files per artifact:** the **head** `<id>.json` (identity, description, parent, references, lifecycle, binding, attachments, payload; rewritten, only by the unit's holder or approver), `<id>.log.jsonl` (the change log, one entry per line, append-only) and `<id>.feedback.jsonl` (feedback, one entry per line, append-only).
2. The two `.jsonl` files set **`merge=union`** in `.gitattributes`, so two clones that each add distinct lines merge without a conflict. Every line has a unique id; a reader drops duplicates and orders by `(timestamp, id)`.
3. Conflicts in the head are rare (only the holder authors; an approval comes from one actor) and are **real conflicts**: git reports them and a person resolves them.
4. **Nothing is stored that can be derived:** feedback counts, open feedback, the current status after replay and child lists are computed on read.
5. Locations stay: heads and sidecars under `.insrc/artifacts/`, rendered markdown under `docs/`, committed and pushed as today. The **markdown is a generated view** of head plus sidecars, now including the feedback and a log summary.
6. **Revision fork rule (from Gap 3):** on every read the head is checked: `lifecycle.revision.contentHash` must equal the hash of `payload` and `description`, and must match the last content entry in the log. A mismatch (two clones bumped to the same number with different content and git merged silently) flags the artifact **`conflict`**; gates refuse to approve, review or complete a `conflict` artifact until a person resolves it. Nothing picks a side silently.
7. The whole log is kept; no compaction.

## Gap 11: Tasks as their own artifacts: SETTLED

1. A Task is a tracked lifecycle artifact (`E...:S...:T010`), a child of its Story, 1:1 with its tracker issue, with its own lifecycle, change log and feedback.
2. **One file per plan:** the Tasks of a Story live together in a single JSON file (`E...:S...:TASKS`). The file is a **storage unit; each Task stays its own artifact** with its own `id`, lifecycle, binding, references and payload. The change log and feedback sidecars (`.log.jsonl`, `.feedback.jsonl`) are **shared by the file**, each line keyed by the Task id; `merge=union` and the unique line ids work as in Gap 10.
3. **Created at plan approval, not at plan draft.** Until then the PLAN is the only place tasks exist, as proposals, and there are no Task issues, claims or feedback. Approving the plan generates the Tasks file from the approved plan revision (each Task gets a `derived-from` reference to it) and creates the Task issues (the existing Task issue creation, ordering and Story parent link unchanged).
4. **After approval the Task artifacts are the truth for execution.** The plan's payload stops being edited; the PLAN document renders its task table from the Tasks.
5. **Re-plan** (a new plan revision, approved): a changed Task gets a new revision, a Task the plan drops is `withdrawn` (its issue is closed), a new Task takes the next number. **Task ids are never reused.**
6. **The holder can edit a single Task directly,** limited to its own content: summary, size, acceptance checks and named tests. The Task moves to a new revision and back to `draft`, and needs **local re-approval only, no signoff**. The plan is not invalidated and keeps its own revision and approval.
7. **Changes to the shape of the plan still go through a re-plan:** adding or dropping a Task, reordering, and changing `depends-on`. A direct edit that would do that is refused with a pointer to a re-plan.
8. A Task's build rounds are `update` entries in its own change log with an `outcome` (result, round, commit); it is `completed` when a round passes the gate. The Story's `BR` record is the Story-level aggregate.

## Gap 12: migration: SETTLED

The delivery board reads every artifact in the repo and builds its items from them, so a mix of old and new shapes would break it. **Migration is an upfront cutover, not migrate-on-write.**

1. A **hard cutover per repo**: one `insrc migrate` command converts the whole repo in one commit. New code checks a repo-level version and refuses to run on an unmigrated repo ("run `insrc migrate`"). There is no mixed state and **no read-through adapter** in the readers.
2. The migration produces **everything the board needs, retroactively**: Epic and Story artifacts for every existing epic and story; Task artifacts from **every existing plan** with tracker bindings from the recorded task refs; computed statuses including `completed` roll-ups from approved BUILDs; and a **back-filled change log** from what the artifacts record (`create` from `createdAt`, `approve` from `approvedAt` / `approvedBy`, `review` from `meta.review`, `complete` for approved BUILDs), each marked "migrated", with a best-effort actor (`unknown:<name>` when no namespace is known).
3. It is **idempotent and resumable**, has a `--dry-run`, and a **verification pass** that reads the result back through the delivery reader. One commit, so a revert is one `git revert`.
4. **A team cuts over together:** after the migration commit merges, a clone with older code cannot read the repo, with a clear message from the version check.
5. **One cutover, after the model is built:** the model is built behind the version gate and a single migration runs at the end, not one per step.
6. Artifact ids and file names are unchanged by the migration (Gap 1), except standalone `S001` to `s1`, which keeps the old id as `legacyIds`.
7. **Removing the second ID scheme is part of the epic** (not a separate release): delete `src/workflow/id.ts`, move the folder-name formatter into the path scheme, fix the date source (always `epicCreatedAt`), switch new issue titles and the body marker to the artifact id, and replace the delivery module's story / task ordinals. It changes no stored data, so it can be the first story in the epic's order.
8. **Signoff (s7 to s9) waits for the new model.**
9. The IDE repo is deprecated and out of scope.

## Convergence

All twelve gaps are settled. Next: write the consolidated problem statement, confirm it, then run `brainstorm` to produce the SPEC, then triage (an epic).

## Scope rulings after the HLD review (2026-10-19, round 1)

The HLD review (6 HIGH) led to these owner rulings, which narrow the approved Define and apply to every Story's design:

1. **Tracker scope: GitHub only.** This epic adds `listComments` and `attach` to the tracker port and implements them for the GitHub adapter. GitLab and Jira adapters do not exist today and are a later epic; the port is defined so they can implement it. (This narrows ac18 and the GitLab / Jira wording of the Define.)
2. **No compatibility code.** Nothing is left in the code only to cope with older data or older tools: no compatibility release or reader guard for old clients, no `legacyIds` alias or resolver, no reading of the old issue-body marker, and no "older clone reads the converted repository with a clear message" (the second half of ac29 is dropped). Things may break on the `v2` branch; artifacts are handled manually where needed. The conversion renames standalone `S001` to `s1` and rewrites the references it can; it keeps no alias.
3. **Fixes taken from the review:** the sidecars carry the owning artifact id on every line (Tasks share a file); `id.ts`'s functional-requirement id helpers move with s1 and stored FR ids stay valid; the revision-fork check reads the log's last content entry on every authoritative read (approve, review, complete); the HLD gets an acceptance-to-test matrix; write ordering and recovery for a head written without its log entry are specified.

## HLD approval and binding build requirements (2026-10-19)

`HLD-2f27754d4ad00b8e` (`docs/epics/one-common-model-every-artifact-E202610192f27754d/HLD.md`) was reviewed twice by the daemon (round 1: 6 HIGH, all fixed in the revision; round 2: 4 HIGH, 2 MED, 5 LOW). It was approved with a recorded review override of round 2's `block`. The six round-2 findings are **binding requirements** on the Story named, and its LLD must satisfy each:

1. **s2: the writer inventory covers the new writers.** `src/workflow/artifact-write-inventory.ts` recognises only `writeArtifact`, `writeRecordFile`, `writeAtomic`, `writeFileSync` and `renameSync`. The detector and its negative controls are extended for `appendFileSync`, the sidecar append primitive and the new store's `write`, so no new write path bypasses the inventory.
2. **s1: FR ids keep their stored form.** `mintFrId` keeps only the date and the first 8 hex characters of the epic hash, so the relocated requirement-id helper's parse returns `{ date, hash8, story?, fr }`, not a full `epicHash`, and every stored FR string stays valid. A repository-backed resolver, if one is needed, handles ambiguity explicitly.
3. **s4 (with sc3): crash handling at every write boundary.** A log entry appended before a head replace must not outlive content that exists nowhere. The pending head content is persisted before the log entry is committed (or unrelated writes are refused until the identical operation is replayed), and crash handling is specified for each boundary: before the log append, between the append and the head replace, and after the replace.
4. **s6 (port) and s8 (sync): once-only outbound posting.** `IssueOps.comment` returns nothing today. A durable append-only posting receipt keyed by feedback id, a stable marker in the outbound comment, and reconciliation through `listComments` before an uncertain post is retried, so a crash after a successful remote post cannot post twice.
5. **s2: feedback anchors keep their context.** sc3's `anchor` retains `prefix` and `suffix` as well as `quote`, and the conversion of the existing `sectionSlug` into `section` is specified.
6. **s3: the ac7 test asserts the whole behaviour.** Beyond "revision moves only on a content hash change", it asserts that the status returns to `draft` and that the earlier approval and review remain on record with their original revision bindings.

## Binding requirement 7: the s2 LLD carries the ER definition (2026-10-19)

Added after the owner found the approved HLD has no ER diagram (issue CDM-1, GitHub #91). **The s2 LLD must author an `erDefinition`** (rendered to a diagram companion) covering the whole envelope: Artifact, Lifecycle with Revision, Approval, Review, Signoff and Staleness, TrackerBinding, Attachment, Reference, Actor, ChangeLogEntry, Feedback (with its sidecar record), TaskSet and Task, and RepoSchema, with the relationships between them (parent, references, one lifecycle per artifact, sidecar entries owned by an artifact id). The s2 reviewer is to treat its absence as a finding. This does not close CDM-1; the HLD itself may still be revised.

## s9 conversion inputs (2026-10-20)

The strict lowercase ids and the stamped Epic anchor (s1) leave stored data that only the s9 conversion repairs. s9 takes these as its inputs:

1. **Uppercase stories.** The 444 stored artifact files whose name or `storyId` carries `S0nn` are renamed to `s<n>` and every reference to them that can be rewritten is rewritten, with no alias left behind. Until then they fail with an error that points at the conversion.
2. **Stamps.** Every old record gets `epicCreatedAt`, taken from the head of its work item (a Define or ISSUE's own `createdAt`, or the stamp of a standalone design). A record without one fails on a read path and is not placed by its own day.
3. **Tracker issues.** Old issues that carry neither a unit label nor an artifact-id title are relabelled and retitled, so the create guard recognises them. Until then one possible duplicate is accepted.
4. **Parent references.** A stored `parentRef.slug` that is not an artifact id is converted from its `epicHash` and `storyId`, or reported when it has no `epicHash`; it is never guessed.
5. **Documents.** Docs folders keep their names; the rendered headings that showed the old work-item id are rewritten to the artifact id.

The docs migration command was removed in s1; s9 supersedes it.

## s1 LLD upstream prerequisites (2026-10-20)

The s1 LLD was regenerated six times over two review cycles of three rounds each (blocks: 5 high, 6 high, 3 high, then 3 high, 3 high, 1 high and 2 medium). It is design-complete but not approved. Done before approval, on the owner's explicit yes:

1. **DEF restated.** ac1 of s1 now says lowercase artifacts keep their id and uppercase ones (444 stored files carry `S0nn`) fail with a pointer to the s9 conversion; k2 is qualified with the single s9 rename of `S001` to `s1`. DEF revision 1.
2. **Amendments cleaned up.** `AMD-…-1` to `-4` were identical duplicates (every `design.story` run that emits an amendment proposal files one) and are rejected. `AMD-…-5` replaces them: sc1 `RequirementIds.parse` returns `{ date, hash8, story?: number, fr }` and the note says it supersedes the sketch's return type (the applier only appends notes). `AMD-…-6` records the s1/s6 ownership exception: `findIssuesByTitleToken` is added to `TrackerPort` through sc6 by s1, and s6 builds on it. Both approved. The s1 LLD is therefore marked stale against the new effective HLD hash until it is acked.
3. **Lesson.** Do not emit `hld.amendmentProposal` in `contract.detail` when an amendment already records the change.

Binding build requirements for s1 still to be recorded when the LLD is approved: the `refFromDocPath` / locate mapping in `src/workflow/locate/infer.ts` and `infer-daemon.ts` must stop parsing folder names into ids; the `ResolvedRef.workflowId` and `slug` outputs consumed by `locate-parent.ts` and `bugfix/tracker.ts` need defined values and a conversion of stored `parentRef.slug`, tested with several epics; plus the review items from rounds 1 to 6 (AMD ids, write-intent paths, validate error handling, `fr-id` test updates, exact-token matching).

## s2 LLD approved with an override (2026-10-20)

`LLD-2f27754d4ad00b8e-s2` was authored three times (review blocks: 10 HIGH, then 3 HIGH and 1 MED, then 1 HIGH) and approved on the owner's explicit yes with an override. The Lifecycle, TrackerBinding and Attachment shapes are the HLD's sc4 and sc6, unchanged; `readWithHistory` is filed as `AMD-2f27754d4ad00b8e-7` (pending). Binding requirements for the s2 plan and build:

1. **The write journal stages the whole `ChangeLogEntry`** (actor, timestamp, operation id) with the prepared head. Recovery appends that entry idempotently even when the head already equals the staged bytes, then replaces the head if needed and clears the journal. Tests: restart before append, a retry by a different actor, an append failure on an identical-head write.
2. **The codec creation context is defined**: its type, its provider, and how each kind obtains `workflow`, `runId`, `repoPath`, `createdAt`, `elapsedMs`, `repoIndexedAt` and `schemaVersion` when no prior head exists. Test: a create without a prior head.
3. **AMD-7 is resolved** (approved or rejected by the owner) before the s2 plan is written.
4. s9 inputs from this LLD: convert the 53 flat amendment files; add `meta.envelope` and `meta.lifecycle` to every head; turn `body.feedback` into sidecar lines through the legacy conversion (absent kind becomes comment, author becomes `unknown:<author>`, unmapped `target.version` is reported); set the marker to version 2.
