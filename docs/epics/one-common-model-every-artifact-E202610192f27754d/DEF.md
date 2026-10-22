<!-- insrc:artifact DEF-2f27754d4ad00b8e -->

# Epic: one-common-model-every-artifact

## Summary

**Flavor:** enhancement

Every thing insrc stores becomes the same kind of object, with an identity, a parent, a history, feedback from people, references to related things and a lifecycle that says where it stands. Tasks become first-class and can take feedback like anything else, tracker issues and stored artifacts stay in step, and there is one way to name things instead of two. Existing repositories are converted once, up front, so the delivery board and later signoff work see one consistent shape.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)
8. [Open questions](#8-open-questions)

## 1. Problem

Persisted entities share no common model. Each artifact type declares its own metadata, feedback, tracker links and citations [[c4]]; approval, review, revision and staleness are loose fields in each artifact's metadata; a Task exists only as a row inside a Plan, so it has no feedback, history or references of its own [[c4]]. Two identity schemes coexist, one for stored artifacts and a second for work items, and they have already drifted so the same epic carries two different ids [[c2]] [[c3]]. Human comments written on tracker issues are never read back, so a Task, the unit people actually work on, cannot take feedback [[c1]]. Because there is no uniform shape, the delivery board has to know every artifact type [[c5]], and the signoff and revision work planned for teams has nothing consistent to bind to [[c6]].

## 2. Functional requirements

- **E202610192f27754d:FR001** — Every stored entity has an identity, a description, an optional parent, references to related entities, a change log, feedback and a lifecycle. _(A uniform base replaces the fields each artifact type declares separately.)_
- **E202610192f27754d:FR002** — Stored artifacts are named by a single identity scheme that also covers Epics, Stories, Tasks, the Tasks file and diagrams. _(Two schemes have already drifted.)_
- **E202610192f27754d:FR003** — A lifecycle records the current revision, approval, review, signoffs and staleness, with one of ten statuses, and a unit completes when everything under it is complete. _(Approval, review and signoff must bind to a specific revision.)_
- **E202610192f27754d:FR004** — A change log records what happened to an artifact, including the outcome of each build, review and test round that is overwritten in place. _(Overwritten rounds keep their history in the log.)_
- **E202610192f27754d:FR005** — People can leave feedback on any artifact, including a Task, from a client or from the tracker issue, and feedback entered on the tracker is read back once and never duplicated. _(The Task is the executable unit and must take feedback.)_
- **E202610192f27754d:FR006** — Each lifecycle artifact is bound one-to-one to a tracker issue, and supporting artifacts are attached to the issue of the unit they describe. _(Lets the tracker show the whole picture of a unit.)_
- **E202610192f27754d:FR007** — A plan's tasks are created as Task artifacts, with their issues, when the plan is approved, and a holder can edit a Task's own content directly. _(Tasks become first-class without making the plan the only record.)_
- **E202610192f27754d:FR008** — Append-only change log and feedback files merge cleanly across clones, and a head whose content hash does not match its revision is reported as a conflict that blocks approval, review and completion. _(Teams work in several clones of one repository.)_
- **E202610192f27754d:FR009** — A single command converts a repository to the new model in one commit, can be previewed, is repeatable and is verified by reading the result back through the delivery reader. _(The delivery board needs one consistent shape.)_

**s1:**

- **E202610192f27754d:S001:FR001** — Epics, Stories, Tasks, the Tasks file and diagrams have ids in the same scheme as the existing artifacts. _(One scheme for everything that is stored.)_
- **E202610192f27754d:S001:FR002** — A story or task is written in one form everywhere. _(s1 and S001 must not name two things.)_

**s2:**

- **E202610192f27754d:S002:FR001** — Every stored entity is an artifact with the common fields and its own payload. _(Uniformity is the point of the Epic.)_
- **E202610192f27754d:S002:FR002** — The children of an artifact are found from the parent link, never stored on the parent. _(Nothing is stored that can be derived.)_

**s3:**

- **E202610192f27754d:S003:FR001** — A lifecycle holds the current revision, approval, review, signoffs and staleness, and a status from a fixed set of ten. _(Decisions bind to a revision.)_
- **E202610192f27754d:S003:FR002** — Completion rolls up from Tasks to Stories to Epics and is recorded once. _(The claim is released at that moment.)_

**s4:**

- **E202610192f27754d:S004:FR001** — An artifact's history and feedback are kept as separate append-only records beside its head. _(Appended lines merge without conflicts.)_
- **E202610192f27754d:S004:FR002** — Counts, open feedback and current status are worked out when read, not stored. _(Two clones cannot update them differently.)_

**s5:**

- **E202610192f27754d:S005:FR001** — Feedback entries have a kind (comment, suggestion or revision request) and may point at a place in the artifact. _(A revision request must be distinguishable.)_
- **E202610192f27754d:S005:FR002** — Actors are recorded as people, agents or systems with a namespaced id. _(Several identity sources must not collide.)_

**s6:**

- **E202610192f27754d:S006:FR001** — A binding holds the issue reference and the bookkeeping of what was posted, as a typed record. _(Replaces the loose tracker fields.)_
- **E202610192f27754d:S006:FR002** — Attachment is an operation each tracker implements in its own way. _(GitHub has no attachment API.)_

**s7:**

- **E202610192f27754d:S007:FR001** — A Task's build rounds are recorded in its own history and it completes when a round passes the gate. _(Completion rolls up from Tasks.)_

**s8:**

- **E202610192f27754d:S008:FR001** — Reading comments needs no background polling and no new credential. _(Reads happen where the holder works on the unit.)_

**s9:**

- **E202610192f27754d:S009:FR001** — Conversion is a single command that previews, repeats safely and verifies itself. _(A team cuts over together.)_

## 3. Non-goals

- **Changing how team signoff, revision handling or tracker status sync work (stories s7 to s9 of the team epic)** — They depend on this model and are built afterwards; building them in the same Epic would couple two large changes [[c6]].
- **Turning a revision request into an automatic plan re-run or an automatic re-signoff** — What a revision means for signoff belongs to the revision and signoff work, not to the data model [[c6]].
- **A team roster of identities in the central policy** — Identities are declared per user for attribution; gates use the tracker's own identity, so a roster is not needed and can be added later [[c7]].
- **Behaviour of the future PRD artifact** — Only the Define keeps its place above the Epic so a PRD can be added later; PRD behaviour is a separate Epic [[c7]].
- **Any change to the deprecated IDE repository** — The IDE repository is deprecated and out of scope [[c7]].
- **Background polling of tracker comments** — Comments are read on demand and where the holder works on the unit; polling adds load and failure modes without a requirement [[c1]].
- **Migrating existing data one artifact at a time as it is touched** — The delivery board reads every artifact, so a mix of old and new shapes would break it; migration is one upfront cutover [[c1]] [[c5]].

## 4. Assumptions

- `high` Existing artifact ids and file names are kept (apart from standalone S001 becoming s1), so references, amendment records and issue links keep working [[c1]]
- `med` Only the holder of a unit authors under it, so per-unit counters (diagram numbers) and the rewrite of an artifact's head file do not race across clones [[c6]]
- `med` Tracker comments on GitHub and GitLab can be read through the existing gh and glab command paths without a new credential [[c1]]
- `high` Union merge of append-only line files is available in the git versions teams use [[c1]]
- `med` A repository can be converted in one commit and every clone upgrades together after that commit merges [[c7]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | convention | There is exactly one identity scheme for stored artifacts; the work-item id module is removed and nothing parses the folder key back into an id | [[c7]] |
| `k2` | invariant | An artifact id never changes once created, except the single rename of an uppercase story or task id (S001 to s1) by the s9 conversion | [[c1]] |
| `k3` | invariant | A revision moves only when an artifact's content changes; an identical rewrite, a comment, a reference change or a provenance write does not move it | [[c1]] |
| `k4` | contract | Feedback entries are immutable and append-only with no state of their own; they are resolved as part of the artifact that is revised | [[c1]] |
| `k5` | invariant | Gates decide on the live identity reported by the tracker, never on a declared alias | [[c1]] |
| `k6` | contract | A tracker issue is never an artifact; lifecycle artifacts are 1:1 with an issue and supporting artifacts attach to the issue of the unit they describe | [[c1]] |
| `k7` | convention | Folder names under docs/epics stay as they are today, with the date always taken from the epic's creation time | [[c7]] |
| `k8` | contract | A completed status is recorded once, when a unit's Tasks or Stories are all complete and its review is clean or explicitly overridden by the user | [[c1]] |
| `k9` | convention | Cloud access stays through the local CLI binaries; no direct REST providers are added | [[c7]] |

## 6. Stories

### 6.1 E202610192f27754d:S001 — One identity scheme for every artifact

**User value:** `size: M`

A person sees the same id for an artifact everywhere: in the repository, in the log, in references and on the tracker, so nothing has to be translated between two schemes.

**Extends:** [[c2]] [[c3]]

**Acceptance criteria:**

- **ac1:** Given an existing repository with artifacts named by the current scheme, when the second identity scheme is removed, then every artifact stored in the lowercase story form keeps its id and file name and keeps resolving, and an artifact stored in the uppercase form (S001) fails with a message that points to the s9 conversion, which renames it once. _(operationalizes `k1`, `k2`)_
- **ac2:** Given a new Epic, Story or Task issue is created on the tracker, when the issue title is written, then the title starts with the artifact's id, and an issue created earlier keeps its title and is still found by its unit label. _(operationalizes `k1`)_
- **ac3:** Given two artifacts of one epic written on different days, when their folder is chosen, then both land in the same folder, because the date always comes from the epic's creation time and a folder name is never read back as an id. _(operationalizes `k1`, `k7`)_

### 6.2 E202610192f27754d:S002 — A common artifact model with one reader

**User value:** `size: L`

Every stored entity has the same basic shape, so a tool, a person or the delivery board reads any of them the same way.

**Depends on:** `s1`

**Extends:** [[c2]] [[c4]]

**Acceptance criteria:**

- **ac4:** Given any stored entity of any type, when it is read, then it exposes an identity, a description, an optional parent, references, a change log, feedback and a lifecycle in one shape. _(operationalizes `k1`)_
- **ac5:** Given an artifact type that has no use for a lifecycle part, when it is read, then that part is simply empty and nothing fails.
- **ac6:** Given a reference from one artifact to another or to an external thing, when it is read, then it names the target, the kind of thing it is and why the link exists, and the Epic, Story and Task chain is given by each artifact's parent. _(operationalizes `k6`)_

### 6.3 E202610192f27754d:S003 — A lifecycle that says where an artifact stands

**User value:** `size: L`

Anyone can see whether an artifact is a draft, waiting for review, approved, in signoff or completed, and which revision each decision covers.

**Depends on:** `s2`

**Extends:** [[c2]] [[c5]]

**Acceptance criteria:**

- **ac7:** Given an approved artifact, when its content changes, then its revision moves, its status returns to draft, and the earlier approval and review remain visible as covering the older revision. _(operationalizes `k3`)_
- **ac8:** Given an artifact rewritten with identical content, or given a comment, a reference or a provenance record, when it is saved, then its revision does not move. _(operationalizes `k3`)_
- **ac9:** Given all Tasks of a Story are complete and its build record has been code-reviewed clean or approved by the user over the review's findings, when the last step is recorded, then the Story is recorded as completed once, its documents and records complete with it, and the Epic completes when all its Stories have; dropped or superseded children do not count. _(operationalizes `k8`)_
- **ac10:** Given a head whose content hash does not match its revision, when anyone tries to approve, review or complete it, then it is reported as a conflict and the action is refused until a person resolves it. _(operationalizes `k3`)_

### 6.4 E202610192f27754d:S004 — Change history and feedback that merge across clones

**User value:** `size: L`

A team working in several clones of one repository adds history and feedback without conflicts, and a real conflict is caught instead of silently resolved.

**Depends on:** `s2`

**Extends:** [[c2]] [[c4]]

**Acceptance criteria:**

- **ac11:** Given two clones each add different feedback or change log entries to the same artifact, when their branches merge, then the merge completes with no conflict and a reader sees every entry once, in order. _(operationalizes `k4`)_
- **ac12:** Given a build, review or test round that is overwritten in place, when it is recorded, then the change log gains an entry with the round's outcome, so earlier rounds can still be read.
- **ac13:** Given an artifact's head changed in two clones, when they merge, then git reports the conflict and a person resolves it.

### 6.5 E202610192f27754d:S005 — Feedback on any artifact, from people and clients

**User value:** `size: M`

A person can leave feedback on a design, a plan or a single Task, reply to feedback, and see what is still open.

**Depends on:** `s2`, `s4`

**Extends:** [[c4]]

**Acceptance criteria:**

- **ac14:** Given any artifact, a Task included, when a person adds feedback or a reply, then the entry is recorded once with who wrote it and when, and is never edited afterwards. _(operationalizes `k4`)_
- **ac15:** Given feedback on an artifact that is then revised, when the revision is recorded, then that feedback counts as addressed unless the author listed only some entries, and the rest stay open. _(operationalizes `k4`)_
- **ac16:** Given a person with a tracker account and a different repository host account, when their actions are recorded, then each is recorded under a namespaced identity, the person can declare the links between their identities, and gates still use the tracker's own identity. _(operationalizes `k5`)_

### 6.6 E202610192f27754d:S006 — Tracker binding and attachments

**User value:** `size: L`

Every unit people work on is linked to exactly one tracker issue, and the documents that support it are reachable from that issue.

**Depends on:** `s2`, `s3`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac17:** Given an issue a person created first, or one the framework created, when the unit's artifact exists, then the artifact is bound to that one issue, and a repository with no tracker has no binding. _(operationalizes `k6`)_
- **ac18:** Given a plan, a design document, a diagram or a build, review or test record, when it is attached, then the unit's issue gets a link to the file at the commit that holds it on GitHub or GitLab, a real attachment on Jira, and a new revision adds a new link while the old one stays. _(operationalizes `k6`, `k9`)_
- **ac19:** Given a link under a parent issue or a post to an issue that failed, when the unit is next worked on, then the pending work is retried and not repeated once done.

### 6.7 E202610192f27754d:S007 — Tasks as artifacts, created when the plan is approved

**User value:** `size: L`

Each Task has its own issue, history, feedback and status from the moment its plan is approved, and the holder can refine a Task without redoing the plan.

**Depends on:** `s2`, `s3`, `s6`

**Extends:** [[c4]] [[c5]]

**Acceptance criteria:**

- **ac20:** Given a plan that is approved, when approval is recorded, then the Tasks of that Story exist together in one file, each with its own id, and each Task has its issue under the Story's issue. _(operationalizes `k6`)_
- **ac21:** Given a Task whose summary, size, acceptance checks or tests the holder edits, when the edit is saved, then the Task moves to a new revision and returns to draft, needs the local user's re-approval and no signoff, and the plan keeps its own revision. _(operationalizes `k3`)_
- **ac22:** Given an edit that would add, drop or reorder Tasks or change what depends on what, when the holder tries it directly, then it is refused with a pointer to a re-plan.
- **ac23:** Given a re-plan that is approved, when the Tasks are brought into line, then a changed Task gets a new revision, a dropped Task is withdrawn with its issue closed, a new Task takes the next number, and no Task id is ever reused. _(operationalizes `k2`)_

### 6.8 E202610192f27754d:S008 — Feedback read back from the tracker

**User value:** `size: M`

A comment someone writes on a Task's or Story's issue shows up as feedback on that artifact, and feedback entered elsewhere reaches the issue, each once.

**Depends on:** `s5`, `s6`, `s7`

**Extends:** [[c2]]

**Acceptance criteria:**

- **ac24:** Given a human comment on the unit's issue, when the holder starts to implement or validate the Task, or asks for a sync, then it is recorded once as feedback with the tracker user as author, and the framework's own posts are never recorded. _(operationalizes `k4`, `k5`)_
- **ac25:** Given a comment whose first line asks for a revision or offers a suggestion, when it is recorded, then it is given that kind, and any other comment is a plain comment.
- **ac26:** Given feedback entered against a unit that has an issue, when it is posted, then it is posted once and marked as in the tracker, and a later edit or deletion on the tracker is not mirrored. _(operationalizes `k4`)_

### 6.9 E202610192f27754d:S009 — Upfront conversion of a repository

**User value:** `size: XL`

A team converts a repository to the new model once, safely, and the delivery board and every tool see one consistent shape afterwards.

**Depends on:** `s1`, `s2`, `s3`, `s4`, `s5`, `s6`, `s7`

**Extends:** [[c5]]

**Acceptance criteria:**

- **ac27:** Given a repository with artifacts of every existing type, when the conversion runs, then every artifact is converted in one commit, Epics, Stories and Tasks are created for what exists, statuses are computed, and the change log is filled in from what the artifacts already record, marked as migrated. _(operationalizes `k2`)_
- **ac28:** Given a conversion that is run again, or run as a preview, when it finishes, then a repeat changes nothing, a preview changes nothing and lists what would change, and a verification reads the result back through the delivery reader and reports any difference.
- **ac29:** Given a repository that has not been converted, when the new tools run on it, then they refuse with a clear message to convert it first; builds from before this model are not expected to work with a converted repository.

## 7. References

- **[[c1]]** `doc` `docs/plans/core-data-model.md` — "All twelve gaps are settled"
- **[[c2]]** `code` `src/workflow/storage.ts`
- **[[c3]]** `code` `src/workflow/id.ts`
- **[[c4]]** `code` `src/workflow/artifacts/provenance/types.ts`
- **[[c5]]** `code` `src/workflow/delivery/graph.ts`
- **[[c6]]** `doc` `docs/plans/team-workflow.md`
- **[[c7]]** `stakeholder` `owner rulings in chat, 2026-10-19 (Subho Ghosh)`

## 8. Open questions

- Item s1c: stories declare dependencies (s2 on s1, s8 on s5, s6 and s7, s9 on s1 to s7) so each is testable once its dependencies are done, but not in isolation; inherent to a layered model, the graph is explicit and acyclic.

## Resolved questions

- `q61ec8e44` — Item s1c: stories declare dependencies (s2 on s1, s8 on s5, s6 and s7, s9 on s1 to s7) so each is testable once its dependencies are done, but not in isolation; inherent to a layered model, the graph is explicit and acyclic.
  - **resolved**: Dependency-complete testing — Owner accepted: a story is testable once its declared dependencies are complete; the dependency graph stays explicit and acyclic; no substitutes or restructuring. _(2026-10-19T10:29:14.648Z)_

## Citations

- **[[c1]]** `doc` `docs/plans/core-data-model.md` — "All twelve gaps are settled"
- **[[c2]]** `code` `src/workflow/storage.ts`
- **[[c3]]** `code` `src/workflow/id.ts`
- **[[c4]]** `code` `src/workflow/artifacts/provenance/types.ts`
- **[[c5]]** `code` `src/workflow/delivery/graph.ts`
- **[[c6]]** `doc` `docs/plans/team-workflow.md`
- **[[c7]]** `stakeholder` `owner rulings in chat, 2026-10-19 (Subho Ghosh)`
