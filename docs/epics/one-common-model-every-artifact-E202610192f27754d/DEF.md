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
| `k2` | invariant | An artifact id never changes once created | [[c1]] |
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

- **ac1:** Given an existing repository with artifacts named by the current scheme, when the second identity scheme is removed, then every existing artifact keeps its id and file name, and no stored reference stops resolving. _(operationalizes `k1`, `k2`)_
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
- **ac29:** Given a repository that has not been converted, when the new tools run on it, then they refuse with a clear message to convert it first, and a clone with older tools reads the converted repository with a clear message.

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

<!-- insrc:review -->

## Review

### ⛔ Review `BLOCK` — define (define)

**0 HIGH · 70 MED · 1 LOW** · model `cli-codex:gpt-6-astra` · reviewed 2026-10-19T09:42:19.613Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 1/c4 | closed-union | MED | assisted | Existing persisted workflow artifact types do not share a common model for metadata, feedback, tracker links and citations. | The grep results are truncated and primarily reference design documents. docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/S002/LLD.md:126 describes a shared WorkflowArtifact base containing meta, body and citations, which casts doubt on the premise but does not establish current source behavior or coverage of feedback and tracker links. The only source read, src/workflow/artifacts/provenance/types.ts:1, returns a comment delimiter. The premise is unverifiable from this evidence; no concrete build-breaking failure is established. | Inspect current artifact envelopes and their metadata, feedback, tracker-link and citation definitions before asserting that a common model is absent. |
| 1/c4 | semantic | MED | assisted | Existing artifacts represent approval, review, revision and staleness as separate metadata fields. | The read of src/workflow/artifacts/provenance/types.ts:1 exposes only an opening comment. The grep results are truncated and show no metadata field declarations. README.md:55 mentions approval, review gates, and staleness amendments, but does not establish separate fields or revision metadata. The premise is unverifiable from this evidence. | Gather the artifact metadata type declarations covering approval, review, revision, and staleness, then reassess whether they are separate fields. |
| 1/c4 | closed-union | MED | assisted | A Task currently persists only within a Plan and has no independent feedback, history or references. | The grep results are truncated at 50 matches and show documentation rather than the relevant source definitions. docs/epics/add-plan-workflow-insrc-framework-4th-E202607151cd9a4c3/S003/LLD.md:24 describes PlanBody.tasks as PlanTask[], but this does not establish exclusive persistence or the absence of independent feedback, history, or references. The only supplied read of src/workflow/artifacts/provenance/types.ts:1 is a comment opener. The premise is unverifiable from this evidence. | Obtain the actual Task/Plan type definitions and persistence paths, including task feedback, history, and reference handling, before asserting exclusivity. |
| 1/c2/c3 | inventory | MED | assisted | Stored artifacts and work items currently use two distinct identity schemes implemented through workflow storage and work-item identity code. | UNVERIFIABLE: reads of src/workflow/storage.ts:1 and src/workflow/id.ts:1 show only comment delimiters. The grep output is truncated at 50 matches and contains documentation references, including docs/artifact-document-template-review.md:30 describing artifactIdMarker(), but no source implementation establishing two distinct identity schemes. | Gather targeted source reads of the artifact identity construction and work-item identity construction, then compare their formats and use before accepting the premise. |
| 1/c2/c3 | semantic | MED | manual | The existing artifact and work-item identity schemes can assign different identifiers to the same epic. | UNVERIFIABLE: reads of src/workflow/storage.ts:1 and src/workflow/id.ts:1 contain only comment headers. The truncated grep includes artifact markers such as docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/DEF.md:1 (DEF-1703991c69967193), but no source implementation establishing how both identity schemes assign identifiers to the same epic. | Gather source reads covering both identity generators and their inputs/call sites for the same epic, then reassess the premise. |
| 1/c1 | closed-union | MED | assisted | The existing tracker integration does not import human issue comments as artifact feedback. | Unverifiable: the grep output is truncated at 50 matches and supplies no tracker implementation or comment-import call paths. S001/evidence/t2-suites.md:84 and :86 mention artifact.feedback.append and appendFeedback tests, but do not establish whether tracker comments reach them. docs/plans/core-data-model.md:1 contains only the document title. | Gather scoped tracker implementation evidence covering inbound issue comments and their connections to artifact feedback before relying on this absence claim. |
| 1/c5 | semantic | MED | assisted | The existing delivery graph reader contains artifact-type-specific knowledge. | The grep results are truncated at 50 matches and contain no matches in src/workflow/delivery/graph.ts. The only supplied read, src/workflow/delivery/graph.ts:1, shows a comment delimiter. Neither establishes artifact-type-specific knowledge in the delivery graph reader; the premise is unverifiable. | Gather scoped matches and surrounding source lines from src/workflow/delivery/graph.ts showing artifact-specific imports, readers, or branching, then reassess. |
| 1/c6 | cross-artifact | MED | assisted | The team workflow plan includes signoff and revision work that requires the common artifact model proposed by this epic. | Unverifiable: docs/plans/team-workflow.md:1 confirms only the title, '# Plan: Team-compatible workflow'. The truncated grep results contain no signoff or revision passages from that plan and no evidence from DEF-2f27754d4ad00b8e establishing a dependency on this epic's common artifact model. References to revisions elsewhere do not establish this cross-artifact claim. | Supply the relevant team-workflow signoff/revision passages and the referenced DEF's model requirements, then verify the claimed dependency. |
| E202610192f27754d:FR001 | inventory | MED | assisted | The proposed common artifact model requires identity, description, optional parent, references, change log, feedback and lifecycle fields. | Unverifiable: the grep output is truncated at 50 matches and contains no reads of E202610192f27754d:FR001, E202610192f27754d:S002:FR001, or s2/ac4. The unrelated bugfix S002/LLD.md:126 describes an envelope of { meta, body, citations }, and the companion-wiring S002/LLD.md:126 mentions body.changeLog?, but neither establishes the proposed common model's complete field inventory or requiredness. No concrete build-breaking contradiction is shown. | Gather the referenced requirements and proposed model definition, then verify all seven field categories and whether parent is optional. |
| E202610192f27754d:FR002 | inventory | MED | assisted | The proposed single artifact identity scheme covers existing artifacts, Epics, Stories, Tasks, the Tasks file and diagrams. | UNVERIFIABLE: the grep results are truncated at 50 matches and show documentation references, not the proposed identity scheme or a complete source inventory. The reads at src/workflow/id.ts:1 and src/workflow/storage.ts:1 expose only comment headers. docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/S002/LLD.md:155 lists a historical ArtifactKind proposal, but does not establish coverage of Epics, Stories, Tasks, the Tasks file or diagrams. | Supply the proposed scheme and targeted source evidence mapping each claimed category to its identity representation, then reassess coverage. |
| E202610192f27754d:S001:FR002 | closed-union | MED | manual | A Story or Task must have one canonical identifier representation wherever it is written. | Unverifiable: the grep output is truncated at 50 matches and provides no workflow Story/Task identifier implementation. design/analyze-framework.md:228 and design/analyze-plan-builder.md:72 describe analyzer task IDs, not the workflow identifiers in this premise. The read of src/workflow/id.ts:1 contains only a comment delimiter. This evidence establishes neither canonical formatting nor coverage of every write site. | Gather the workflow identifier types, parsers/formatters, and write sites to verify the canonical representation and its scope. |
| E202610192f27754d:FR003 | inventory | MED | assisted | The proposed lifecycle has exactly ten allowed statuses, although the DEF does not enumerate their members. | docs/epics/one-common-model-every-artifact-E202610192f27754d/DEF.md:30 explicitly specifies 'one of ten statuses' but does not list members in that line. The truncated grep results cannot establish that the entire DEF omits the enumeration. docs/plans/core-data-model.md:74 excludes staleness, review verdict and claim from statuses; the read at line 1 supplies only the title. No supplied evidence enumerates the proposed lifecycle statuses, so the full premise is unverifiable. | Obtain the lifecycle status definition and relevant DEF sections to verify the ten members and the claimed omission. |
| E202610192f27754d:S003:FR001 | inventory | MED | assisted | The proposed lifecycle carries the current revision, approval, review, signoffs and staleness. | Unverifiable: the 50-match grep result is truncated and contains no definition of the proposed lifecycle or reads resolving either cited requirement. The staleness fields at docs/epics/add-build-workflow-insrc-5th-stage-E20260717185807ba/HLD.md:128 and S002/LLD.md:190 concern another artifact; the Lifecycle types at docs/epics/build-insrc-vs-code-extension-v1-E20260921ad0d45c9/HLD.md:168–174 concern daemon lifecycle control. Neither establishes the claimed five-field inventory. No concrete implementation failure is demonstrated. | Resolve the two requirement anchors and gather focused reads of the proposed lifecycle definition to verify all five fields and their current-revision semantics. |
| E202610192f27754d:FR003 | semantic | MED | assisted | Approval, review and signoff decisions must identify the specific artifact revision they cover. | Unverifiable from the supplied evidence. The grep is truncated at 50 matches and provides no reads for E202610192f27754d:FR003 or s3/ac7. The unrelated build-workflow S005/LLD.md:52 describes planArtifactHash pinning an approved plan revision, and di2-project-guideline-identity-versioned-lifecycle-E202610114abafc9d/DEF.md:40 requires activation of the exact reviewed and approved revision. Neither establishes revision binding for all approval, review and signoff decisions in the target workflow. | Gather targeted evidence for FR003 and s3/ac7, including the decision records and handlers that bind approvals, reviews and signoffs to artifact revisions. |
| E202610192f27754d:S002:FR002 | closed-union | MED | assisted | Artifact children must be derived from child parent links rather than persisted on the parent. | Unverifiable: the grep results are truncated at 50 matches and contain no artifact persistence or child-resolution implementation. docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/HLD.md:116–117 declares parentId and childIds in a documented read model, but does not establish whether artifact children are persisted or derived. design/indexer.html:1026 concerns section nesting; the JetBrains parentId matches concern settings registration. Neither addresses this premise. | Gather focused source evidence for the persisted artifact schema, its write paths, and child lookup implementation to establish whether child parent links are authoritative. |
| E202610192f27754d:S004:FR001 | semantic | MED | manual | Artifact history and feedback must be stored in separate append-only records beside the artifact head. | Unverifiable: the grep results are truncated at 50 matches and contain no source reads establishing separate append-only history and feedback records beside an artifact head. docs/daemon.md:168 mentions optional feedback logs; docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t2-suites.md:84,86 report appendFeedback wiring, but establish neither storage layout nor append-only semantics. | Gather targeted source evidence for artifact head paths and history/feedback persistence, including whether existing records can be overwritten or deleted. |
| E202610192f27754d:S004:FR002 | semantic | MED | manual | Counts, open feedback and current status must be derived when read rather than stored as independently mutable values. | UNVERIFIABLE: The grep output is truncated at 50 matches and does not establish how the target counts, open feedback, or current status are stored or derived. camon/src/camon/storage.py:261,276 reads maintenance completion data; docs/epics/add-build-workflow-insrc-5th-stage-E20260717185807ba/HLD.md:259 mentions completedTaskIds in another artifact. Neither addresses the cited requirement or its read paths. | Gather targeted evidence for the target data model, mutation paths, and read-time derivations before judging this invariant. |
| E202610192f27754d:S005:FR001 | closed-union | MED | assisted | Feedback kinds are limited to comment, suggestion and revision request. | docs/plans/core-data-model.md:118 lists comment \| suggestion \| revision-request, and :135 specifies their classification. DEF.md:60 and :239 support the intended requirement. However, the older provenance HLD.md:27 lists optional 'feedback' \| 'suggestion' \| 'comment'. The truncated probe supplies no current FeedbackKind declaration or validator, so it cannot verify the implemented closed union or establish a concrete build failure. | Clarify that these are the intended model's kinds; verify the current type and validation contract before asserting an existing closed union. |
| E202610192f27754d:S005:FR002 | closed-union | MED | manual | Recorded actors are people, agents or systems and use namespaced identifiers. | UNVERIFIABLE: the supplied grep output is truncated at 50 matches and provides no actor type definition or identifier validation. design/analyze-context-builder.md:17 concerns task-family namespaces; docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t1-suites.md:195 concerns repository namespaces. Neither establishes a closed people/agents/systems union or namespaced actor identifiers. | Gather targeted actor type, identifier validation, and recording-path evidence before treating the premise as verified. |
| E202610192f27754d:S006:FR001 | semantic | MED | manual | A tracker binding must carry both an issue reference and typed bookkeeping of completed posts. | Unverifiable. The truncated grep results show an optional issueRef in docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/S005/LLD.md:97–101, but provide no source declaration of TrackerBinding or IssueBinding and no typed bookkeeping of completed posts. The remaining matches concern unrelated UI messages being posted. | Gather source declarations for tracker bindings and the code that records completed posts, then verify both requirements against those reads. |
| E202610192f27754d:S006:FR002 | external-contract | MED | assisted | GitHub provides no attachment API suitable for the artifact attachment operation assumed by this design. | Unverifiable. The grep output is truncated at 50 matches and supplies no GitHub API contract or evidence about the intended artifact attachment operation. docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/HLD.md:139 describes issue-body rendering, linking, and closing; S003/LLD.md:70 concerns parent-location inference. Neither establishes that GitHub lacks a suitable attachment API. | Define the required attachment operation and obtain authoritative API evidence before treating GitHub's lack of support as an established design constraint. |
| 3/c6 | cross-artifact | MED | assisted | Stories s7 through s9 of the team epic cover team signoff, revision handling and tracker status synchronization. | UNVERIFIABLE: docs/plans/team-workflow.md:1 confirms only the heading '# Plan: Team-compatible workflow'. The grep output is truncated at 50 matches and supplies no team epic s7–s9 content establishing their scope. Matches such as design/analyze-plan-builder.md:269 concern unrelated revision handling. | Gather the team epic's s7–s9 story definitions and relevant team-workflow plan sections, then verify the claimed coverage. |
| 3/c6 | ordering | MED | assisted | The team epic's signoff, revision and tracker status synchronization work is scheduled after this common-model epic. | The only supplied evidence is docs/plans/team-workflow.md:1, '# Plan: Team-compatible workflow'. This confirms the document title but establishes no scheduling relationship or scope for signoff, revision, or tracker status synchronization. No evidence was supplied from DEF-2f27754d4ad00b8e. | Verify the ordering against explicit dependency or scheduling statements in the two artifacts before relying on this premise. |
| 3/c6 | cross-artifact | MED | assisted | Automatic re-planning and re-signoff in response to revision requests belong to the separate team revision and signoff work. | UNVERIFIABLE: docs/plans/team-workflow.md:1 supplies only the title, '# Plan: Team-compatible workflow'. docs/epics/one-common-model-every-artifact-E202610192f27754d/DEF.md:83 repeats the scope claim but does not independently establish it. design/analyze-plan-builder.md:269 concerns analyzer plan refinement, not team revision requests or re-signoff. The grep results are truncated. | Obtain the relevant passages from docs/plans/team-workflow.md establishing ownership of automatic re-planning and re-signoff, or qualify this as a proposed scope boundary. |
| 3/c7 | external-contract | MED | assisted | Owner rulings authorize per-user identity declarations without a central team roster because gates use tracker-reported identities. | Unverifiable: the capped grep results contain neither the cited owner rulings nor evidence that gates use tracker-reported identities. design/analyze-framework-infrastructure.md:26 concerns infrastructure service accounts/IAM roles; docs/epics/add-daemon-driven-code-review-stage-E20260803761a43a6/S001/LLD.md:201 concerns build-record identity. Neither supports per-user declarations or omission of a central roster. The truncated results also cannot establish absence or contradiction. | Supply the cited owner ruling and targeted gate implementation evidence establishing the identity source before treating this premise as verified. |
| 3/c7 | ordering | MED | assisted | The proposed artifact hierarchy retains Define above Epic to leave room for a future PRD artifact. | Unverifiable: docs/artifact-document-template-review.md:15 labels DEF as “DEF (Epic)”, and :68 lists “Define / HLD / Amendments / Tracker / Next action”; neither establishes Define as a parent above Epic or a future PRD rationale. design/indexer.html:1026 describes parentId for section nesting only. The supplied grep is truncated and contains no evidence resolving c7 or confirming the proposed hierarchy. No concrete build-breaking contradiction is established. | Supply the c7 source passage establishing the proposed ordering and PRD rationale, or explicitly frame both as a proposed design decision. |
| 3/c7 | external-contract | MED | assisted | The owner has declared the IDE repository deprecated and outside this epic's scope. | The supplied evidence contains no owner chat ruling dated 2026-10-19. docs/epics/one-common-model-every-artifact-E202610192f27754d/DEF.md:86 repeats the deprecation and scope claim with [[c7]], but does not independently verify it. AGENTS.md:27 describes IDE-fork ownership; the earlier e1-delivery-read-model-daemon-from-E202610072ff0dfda/DEF.md:99 retains its IPC mirroring obligation. These references cannot establish or disprove a later owner ruling, and the grep output is truncated. The premise is unverifiable; no concrete build failure is established. | Supply the dated owner ruling supporting c7, or obtain an explicit scope decision and distinguish exclusion from this epic from repository deprecation. |
| 3/c1/c5 | closed-union | MED | assisted | The delivery reader processes every persisted artifact type, so a repository mixing old and new artifact shapes would break the proposed delivery read path. | UNVERIFIABLE: docs/plans/core-data-model.md:1 supplies only the document title, and src/workflow/delivery/graph.ts:1 supplies only a comment opener. The grep results are truncated at 50 matches and contain no delivery-reader implementation establishing which persisted artifact types it processes or how mixed shapes behave. | Gather the delivery reader's enumeration, dispatch, and parsing code plus the proposed shape changes; verify the consumed artifact types and identify a concrete mixed-shape failure before asserting incompatibility. |
| 4/c1 | cross-artifact | MED | assisted | The core data model plan permits preserving existing artifact identifiers and filenames except for converting standalone S001 to s1. | The only supplied read of docs/plans/core-data-model.md is line 1: '# Core data model: brainstorm decision log'. It provides no identifier or filename preservation policy. The grep results are truncated at 50 matches and contain no supporting passage from that plan; occurrences of S001 in other artifacts do not establish the claimed exception. The premise is unverifiable. | Obtain the plan's identifier, filename, and migration policy passages, then verify whether standalone S001 → s1 is the only required conversion. |
| 4/c1 | semantic | MED | manual | The proposed identifier and filename preservation strategy must retain resolution of existing references, amendment records and issue links. | Unverifiable: docs/plans/core-data-model.md:1 supplies only the title, not the preservation strategy or s1/ac1. The truncated grep provides related documentation—docs/artifact-document-template-review.md:30 describes artifact-marker resolution, :83 mentions amendment records, and S005/LLD.md:97 describes tracker issueRef storage—but no implementation reads or compatibility checks establishing preservation of all three. | Provide the proposed strategy and s1/ac1, plus source evidence for reference resolution, amendment lookup, and issue-link storage to verify compatibility. |
| 4/c6 | external-contract | MED | assisted | Only a unit's holder authors content beneath that unit across repository clones, preventing concurrent head rewrites and diagram-number allocation. | Unverifiable: docs/plans/team-workflow.md:1 contains only '# Plan: Team-compatible workflow'. The supplied grep results are truncated at 50 matches and provide no evidence of exclusive holder authorship across clones or serialization of head rewrites and diagram-number allocation. | Gather targeted evidence for holder enforcement, cross-clone coordination, and diagram-number allocation before relying on this premise. |
| 4/c1 | external-contract | MED | assisted | Existing authenticated gh and glab command paths can read GitHub and GitLab issue comments without additional credentials. | UNVERIFIABLE: AGENTS.md:19 and README.md:57 list gh capability wrappers but do not establish issue-comment reading. AGENTS.md:41 concerns LLM CLI authentication, not gh/glab permissions. The read at docs/plans/core-data-model.md:1 supplies only a title. The truncated matches provide no glab command path or evidence that either CLI can read issue comments with existing credentials. | Gather targeted evidence for both CLI command paths, comment-reading operations, and reuse of existing authentication before treating this premise as established. |
| 4/c1 | external-contract | MED | assisted | The Git versions used by participating teams support union merging of append-only line files. | docs/plans/core-data-model.md:181 prescribes merge=union for two .jsonl files, and :191 reuses that approach for shared sidecars. Neither establishes the Git versions participating teams use or verifies their compatibility. The read at :1 supplies only the document title. The external-contract premise is unverifiable from the supplied evidence. | Record participating teams' Git versions and verify the prescribed union merge behavior, or label compatibility as an unverified prerequisite. |
| s4/ac11 | external-contract | MED | manual | The selected append-only merge and read strategy must preserve concurrent entries exactly once and present them in a defined order without merge conflicts. | Unverifiable: the grep results are truncated and show unrelated deduplication references, such as design/analyze-context-builder.md:255 (cross-run context reuse). The only supplied read, docs/plans/core-data-model.md:1, is the heading '# Core data model: brainstorm decision log'. None establishes the selected merge strategy, entry identity, read ordering, or concurrent-entry preservation. No concrete failure is demonstrated. | Provide targeted evidence for the selected merge configuration, append implementation, identity/deduplication rules, ordering comparator, and concurrent-merge acceptance tests. |
| s4/ac13 | external-contract | MED | assisted | The proposed head merge policy must report concurrent changes to an artifact head as a Git conflict requiring human resolution. | Unverifiable: the grep output is truncated at 50 matches and provides no artifact-head merge policy, Git attributes, merge-driver configuration, or relevant acceptance test. docs/epics/add-build-workflow-insrc-5th-stage-E20260717185807ba/HLD.md:502 discusses stale patch application conflicts, while docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/HLD.md:114 declares contentHash; neither establishes Git conflict behavior for concurrent artifact-head changes. The evidence neither confirms nor contradicts s4/ac13. | Gather targeted evidence for the proposed head merge mechanism and a test demonstrating that concurrent artifact-head changes leave a Git conflict requiring human resolution. |
| 4/c7 | external-contract | MED | assisted | Every clone of a repository is assumed to upgrade together after the single migration commit merges. | Unverifiable: the supplied grep results are truncated at 50 matches and do not establish coordinated upgrades across repository clones. camon/install.sh:94 upgrades a Python package; docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t3-suites.md:470 reports a schema-version validation test. Neither verifies the premise. The cited owner rulings, c7, and s9 were not supplied. | Provide the cited owner ruling and its rollout scope, or revise the premise to identify coordinated upgrades as an unverified assumption. |
| k1 | closed-union | MED | assisted | After conversion, no stored artifact uses the work-item identity module or derives an identifier by parsing its folder key. | Unverifiable: the grep output is truncated at 50 matches and shows documentation and JetBrains output, not a complete inventory of artifact producers. The reads of src/workflow/id.ts:1 and src/workflow/storage.ts:1 contain only comment headers. docs/standalone/implement-approved-spec-77932eaa1a85819b-docs-standalone-E20261011d9f85b3c/S001/PLAN.md:63 describes safeCanonical-based header identity, but does not establish actual post-conversion behavior. No concrete build-breaking contradiction is demonstrated. | Gather untruncated source-only evidence covering stored-artifact producers, identity-module imports, and folder-key parsing; verify every relevant path after conversion. |
| k2 | semantic | MED | assisted | An artifact identifier must remain unchanged for the artifact's lifetime and must not be reused after a Task is dropped. | The grep results are truncated at 50 matches and provide no implementation evidence for artifact-ID immutability or non-reuse after Task deletion. The matches at docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/S003/LLD.md:79 concern task-ordinal matching, and :90 concerns pending-artifact supersession; neither establishes identifier allocation or retention. The read at docs/plans/core-data-model.md:1 returns only the document title. The premise is unverifiable from this evidence. | Gather targeted source reads covering artifact-ID allocation, updates, Task deletion, and subsequent allocation to verify both lifetime stability and non-reuse. |
| k3 | closed-union | MED | assisted | Only artifact content changes advance its revision; identical rewrites, comments, references and provenance writes do not. | Unverifiable: the grep results are truncated at 50 matches and provide no implementation of revision advancement or content comparison. docs/epics/add-plan-workflow-insrc-framework-4th-E202607151cd9a4c3/S003/LLD.md:138 describes overwriting canonical JSON and resetting approval, not revision semantics. docs/plans/core-data-model.md:1 supplies only a title. None establishes whether identical rewrites, comments, references, or provenance writes advance revisions. | Gather source reads covering revision assignment, content comparison, and each excluded write path before treating k3 as verified. |
| k4 | semantic | MED | assisted | Feedback records are immutable and stateless, with resolution derived from subsequent artifact revisions. | The truncated grep shows appendFeedback test-report entries at docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S001/evidence/t2-suites.md:84–86 and a FeedbackRecord reference at docs/epics/complete-generated-artifact-companion-wiring-across-E20260929e2c6705f/DEF.md:133. Neither establishes immutability, absence of stored resolution state, or resolution derived from later revisions. The read of docs/plans/core-data-model.md:1 returns only its title. The premise is unverifiable from this evidence. | Obtain focused evidence for the feedback record schema, mutation paths, and revision-based resolution logic before treating k4 as an established invariant. |
| k5 | external-contract | MED | manual | Gate authorization uses the live identity returned by the tracker rather than any user-declared identity alias. | Unverifiable: the grep output is truncated at 50 matches and shows no tracker identity retrieval or gate authorization implementation. AGENTS.md:69 only names the workflow gates area; docs/plans/core-data-model.md:1 contains only the document title. Neither establishes whether authorization uses live tracker identity or a user-declared alias. | Gather targeted evidence tracing the tracker's authenticated identity response into the gate authorization decision, including how user-declared aliases are handled. |
| k6 | semantic | MED | assisted | Tracker issues are external records rather than artifacts; lifecycle artifacts have one issue binding when a tracker is configured, while supporting artifacts attach to their unit's issue. | The grep results are truncated at 50 matches and contain no implementation evidence establishing tracker issue identity, one binding per lifecycle artifact, or supporting-artifact attachment. docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/HLD.md:7 describes an internal IssueArtifact, while :86 mentions linking a GitHub issue to its owner; neither establishes or contradicts the claimed model. docs/plans/core-data-model.md:1 supplies only the document title. The premise is unverifiable from this evidence. | Gather targeted reads of tracker binding types and issue creation/attachment logic to verify all three claims before relying on this premise. |
| k7 | semantic | MED | assisted | Epic folder names retain the existing format and derive their date from epic creation time rather than each artifact's write time. | Unverifiable. docs/artifact-document-template-review.md:54 shows an example folder, `docs/epics/vs-code-editor-dev-chat-ui-E20260926f9563bf5/`, but does not establish how its date was derived. The grep results are truncated at 50 matches and contain no folder-generation implementation. The only supplied read, src/workflow/storage.ts:1, is a comment delimiter. Nothing supplied confirms or contradicts use of epic creation time versus artifact write time. | Gather targeted source reads of the epic-folder naming function and its callers, including the timestamp passed to it, to verify format preservation and date provenance. |
| k8 | ordering | MED | manual | A unit completes exactly once after all applicable children complete and the required review is clean or explicitly overridden by the user. | Unverifiable from the supplied evidence. AGENTS.md:275 mentions approval with an override reason, and docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/DEF.md:96 describes a post-build review gate. Neither establishes child-completion ordering or exactly-once completion. The grep results are truncated at 50 matches, and docs/plans/core-data-model.md:1 contains only a title. | Gather the completion transition, applicable-child filtering, review/override gate, and duplicate-completion guard with supporting tests before judging this invariant. |
| E202610192f27754d:S003:FR002 | ordering | MED | manual | Completion propagates from Tasks to Stories to Epics, and the unit's claim is released when completion is recorded. | Unverifiable. The grep output is truncated at 50 matches and provides no implementation evidence for Task → Story → Epic completion propagation or claim release ordering. camon/src/camon/storage.py:101–102 concerns maintenance timestamps; docs/epics/add-build-workflow-insrc-5th-stage-E20260717185807ba/S003/LLD.md:273–275 describes task dependency and test gates, not parent completion or claim release. | Gather targeted source reads for completion recording, Story/Epic rollup, and claim release, including their call order and failure handling. |
| s1/ac2 | semantic | MED | assisted | Existing tracker issues can still be found by their unit labels after identifier unification without changing their titles. | Unverifiable: the grep was truncated at 50 matches and supplies no tracker unit-label lookup implementation. docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/S005/PLAN.md:39 describes issue creation and reuse through meta.tracker, not lookup by unit labels. The read of src/workflow/id.ts:1 returns only a comment delimiter. Neither confirms nor contradicts compatibility after identifier unification or title independence. | Gather source evidence for unit-label generation and tracker issue lookup, then verify that existing labels still resolve after identifier unification without title changes. |
| s2/ac5 | semantic | MED | manual | The common reader must accept empty lifecycle components for artifact types that do not use them. | Unverifiable: the 50-match, truncated grep does not show the common reader, artifact validation schemas, or lifecycle fields. AGENTS.md:17 concerns daemon lifecycle; docs/epics/build-deployment-design-framework-project-analyze-E20260721753e0ed6/HLD.md:370 discusses lifecycle assumptions generally. Neither establishes which artifact types omit lifecycle components or how empty components are accepted. | Gather targeted reader and schema evidence identifying artifact types with unused lifecycle components and the accepted representations of emptiness. |
| s2/ac6 | inventory | MED | manual | Each artifact reference carries a target, the target kind and the reason for the link, including references to external targets. | Unverifiable: the grep output is truncated at 50 matches and provides no artifact-reference type, schema, or implementation showing required target, target kind, and reason fields. design/analyze-framework.md:98 describes external doc citations, but does not establish the claimed fields for artifact references. | Gather focused source evidence for the artifact-reference schema and its external-target representation, including whether all three fields are required. |
| s3/ac7 | ordering | MED | assisted | Changing approved artifact content creates a new draft revision while preserving prior approval and review evidence against the older revision. | Unverifiable: the grep results are truncated at 50 matches and provide no implementation or test establishing the claimed transition. docs/artifact-document-template-review.md:39 describes approval/review metadata in JSON, and :47 notes missing rendered revision history; neither establishes preservation against an older revision when content changes. The approved-plan hash citation in docs/epics/add-build-workflow-insrc-5th-stage-E20260717185807ba/S005/LLD.md:52 likewise does not establish this behavior. | Gather targeted evidence for artifact mutation, revision storage, and approval/review binding, including a test that editing approved content creates a draft while retaining older revision evidence. |
| s3/ac10 | ordering | MED | assisted | A mismatch between head content hash and revision must be detected before approval, review or completion and must block those actions. | Unverifiable: the 50-match, truncated grep contains only AGENTS.md and CLAUDE.md guidance. AGENTS.md:199–200 describes workflow ordering, and AGENTS.md:259–267 describes approval and review requirements, but none of the supplied lines demonstrates hash/revision comparison or blocking before approval, review, and completion. No implementation reads were supplied. | Gather implementation evidence for hash/revision comparison and its ordering before each action's side effects, including mismatch handling. |
| s4/ac12 | semantic | MED | assisted | Existing build, review and test rounds can overwrite their prior records, requiring their outcomes to be retained in the proposed change log. | The grep output is truncated at 50 matches and supplies no implementation showing repeated build, review, or test writes to the same record. docs/daemon.md:1271–1272 identifies TESTS record paths but does not establish overwrite behavior. The only read of src/workflow/storage.ts:1 returns a comment header. The premise is therefore unverifiable from the supplied evidence. | Gather the persistence implementations and record-identity logic for build, review, and test rounds to verify whether subsequent rounds overwrite earlier outcomes. |
| s5/ac15 | semantic | MED | assisted | An artifact revision addresses all existing feedback by default unless the author explicitly identifies only a subset as addressed. | Unverifiable: the grep results are truncated at 50 matches and contain no implementation of revision feedback handling. docs/artifact-document-template-review.md:47 discusses missing revision history; the S004/LLD.md:94 match concerns parentRef resolution. Neither establishes default feedback addressing or explicit-subset behavior. | Gather targeted source reads of artifact revision handling and feedback-status updates, including omitted versus explicit feedback IDs, before accepting this premise. |
| s6/ac18 | external-contract | MED | assisted | GitHub and GitLab support artifact attachments as links to files at specific commits, while Jira supports actual file attachments. | UNVERIFIABLE: the supplied grep output is truncated at 50 matches. docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/DEF.md:126 describes GitHub issue create/link/sync, and HLD.md:139 describes issue-body rendering and parent linking; neither establishes commit-specific artifact links. design/analyze-framework-infrastructure.md:48 only identifies .gitlab-ci.yml. No supplied evidence establishes Jira file uploads or GitLab commit-specific artifact links. No contradiction or concrete build-breaking failure is demonstrated. | Gather targeted evidence for GitHub and GitLab commit-specific file links and Jira file attachments before treating s6/ac18 as verified. |
| s6/ac18 | ordering | MED | assisted | A supporting artifact must exist at a repository commit before a tracker link to that revision can be posted, and later links must preserve earlier ones. | Unverifiable: the supplied grep output is truncated at 50 matches and provides no source reads establishing commit-before-post ordering or preservation of earlier tracker links. README.md:56 concerns bugfix attachment; docs/artifact-document-template-review.md:47 concerns document revision history. Neither addresses the claimed tracker behavior. | Gather targeted source evidence for artifact existence at the linked commit, the tracker posting sequence, and preservation of existing links during later updates. |
| s6/ac19 | ordering | MED | assisted | Failed parent-issue links and issue posts are retried when the unit is next worked on and are not repeated after success. | Unverifiable: the grep results are truncated at 50 matches and contain no implementation evidence for parent-issue linking, issue posting, retry on subsequent unit work, or suppression after success. README.md:208 mentions tracker auto-push, while design/analyze-framework.md:419 concerns analyze-task retries; neither establishes this premise. | Gather targeted source reads showing the unit-work entry point, persisted failure/success state, and retry and duplicate-suppression guards for both operations. |
| s7/ac20 | ordering | MED | assisted | Plan approval creates the Story's Task artifacts together in one file and creates their issues beneath the Story issue. | Unverifiable from the supplied evidence. README.md:41 describes Epic → Story → Task sub-issues, but does not establish when they are created. docs/epics/add-build-workflow-insrc-5th-stage-E20260717185807ba/DEF.md:14 attributes Task breakdown production to the plan stage, but does not establish approval-triggered creation or storage together in one file. The truncated results contain no implementation reads confirming those behaviors. | Gather source evidence tracing plan approval to Task artifact persistence and issue creation, including the output file layout and Story parent linkage. |
| s7/ac21 | semantic | MED | assisted | Direct edits to a Task's summary, size, acceptance checks or tests revise only that Task and require local re-approval without signoff. | UNVERIFIABLE: docs/epics/add-plan-workflow-insrc-framework-4th-E202607151cd9a4c3/S001/LLD.md:23 lists PlanTask summary, size, acceptanceChecks and tests fields; :85 describes Task as the atomic build unit. Neither establishes edit propagation, local re-approval, or signoff exemption. The supplied grep is truncated at 50 matches and contains no implementation evidence addressing those behaviors. | Gather targeted evidence for Task mutation, revision propagation, approval invalidation and signoff handling before treating s7/ac21 as verified. |
| s7/ac22 | closed-union | MED | manual | Task additions, removals, ordering changes and dependency changes require re-planning and cannot be made through direct Task edits. | Unverifiable: the supplied grep output is truncated at 50 matches and contains design documents rather than implementation evidence for direct Task editing. docs/epics/add-build-workflow-insrc-5th-stage-E20260717185807ba/HLD.md:23 requires build admission to preserve approved task membership, order and dependsOn edges, but does not establish that direct edits reject structural changes or require re-planning. No supplied match establishes the permitted edit operations. | Gather the Task edit API/schema and mutation-handler evidence showing whether additions, removals, order and dependency changes are rejected and routed through re-planning. |
| E202610192f27754d:S007:FR001 | ordering | MED | assisted | A Task records build rounds in its own history and completes only after a round passes its gate. | UNVERIFIABLE: the grep results are truncated at 50 matches and contain no Task history or completion implementation. README.md:55 mentions workflow approval and review gates; AGENTS.md:271–275 describes review-round limits. Neither establishes that a Task records build rounds in its own history or completes only after a passing round. | Gather targeted source evidence for Task build-round persistence and the completion transition, including the gate check and its ordering relative to completion. |
| s8/ac24 | ordering | MED | assisted | Tracker comment ingestion runs at Task implementation, Task validation or explicit synchronization, without background polling. | Unverifiable. AGENTS.md:227 and CLAUDE.md:227 describe the implement → validate build stages but do not establish tracker comment ingestion at either stage or explicit synchronization. The grep results are truncated at 50 matches and provide no relevant ingestion implementation or evidence excluding background polling. | Gather targeted source evidence for comment ingestion callers, implementation and validation hooks, explicit synchronization, and any scheduling or polling paths. |
| s8/ac24 | external-contract | MED | assisted | Tracker comment data and posting bookkeeping must permit stable deduplication, tracker-author attribution and exclusion of framework-generated posts. | Unverifiable: the 50-match result is truncated and contains no tracker comment schema or posting bookkeeping. AGENTS.md:23 names the workflow framework; design/analyze-context-builder.md:255 discusses unrelated context-cache deduplication. Neither establishes stable comment IDs, tracker-author attribution, or framework-post identification. | Gather targeted tracker comment type, adapter response, and posting-bookkeeping reads to verify all three capabilities. The supplied evidence establishes no concrete build-breaking contradiction. |
| s8/ac26 | semantic | MED | assisted | Tracker feedback synchronization imports or posts each entry once and does not mirror later tracker edits or deletions. | Unverifiable: the grep output is truncated at 50 matches and supplies no tracker feedback synchronization implementation or relevant path:line reads. AGENTS.md:62 and docs/daemon.md:168 merely mention feedback storage; the other matches do not establish import/post deduplication or handling of later tracker edits and deletions. | Gather targeted source reads for tracker feedback import/post paths, deduplication state, and update/deletion handling before relying on this premise. |
| s9/ac27 | closed-union | MED | manual | The conversion must cover every existing artifact type and reconstruct Epics, Stories, Tasks, statuses and available historical outcomes in one commit. | The grep results are truncated at 50 matches and do not show the current source declaration or conversion implementation. docs/epics/add-bugfix-triage-category-insrc-framework-E202609181703991c/S002/LLD.md:154–155 shows a documented ArtifactKind change, not the actual current inventory. Reads of src/workflow/storage.ts:1 and src/workflow/artifacts/provenance/types.ts:1 contain only opening comments. This evidence cannot verify exhaustive artifact coverage, reconstruction of hierarchy/status/history, or one-commit behavior; it establishes no concrete contradiction. | Obtain the current artifact-kind declarations and relevant storage, provenance, and conversion code, then verify each artifact kind's mapping, historical data availability, and commit boundary. |
| s9/ac28 | ordering | MED | assisted | Conversion verification reads converted artifacts through the delivery reader and compares the resulting representation with the expected conversion. | Unverifiable. The read of src/workflow/delivery/graph.ts:1 contains only a comment delimiter. The match at docs/epics/e1-delivery-read-model-daemon-from-E202610072ff0dfda/S002/LLD.md:216 names buildWorkItemGraph, but shows no conversion verification, delivery-reader invocation, or expected-result comparison. The grep results are truncated and cannot establish absence. | Provide source reads showing the conversion verifier invoking the delivery reader on converted artifacts and comparing its output with the expected conversion. |
| s9/ac29 | external-contract | MED | manual | Older tool versions must detect converted repositories and emit a clear compatibility message. | Unverifiable: the grep output is truncated at 50 matches and supplies no older-version repository detection or compatibility-message implementation. design/analyze-framework-data.md:504 describes file-format conversion caching; S001/evidence/t3-suites.md:470 reports a meta.schemaVersion equality test. Neither establishes how older tools handle converted repositories. | Identify the supported older tool versions and provide evidence of their repository-format checks and emitted compatibility messages before retaining this acceptance requirement. |
| 6/Depends on | ordering | MED | manual | The declared story dependency graph is s2→s1, s3→s2, s4→s2, s5→{s2,s4}, s6→{s2,s3}, s7→{s2,s3,s6}, s8→{s5,s6,s7}, and s9→{s1,s2,s3,s4,s5,s6,s7}, where each arrow points to prerequisites. | Unverifiable: the grep results are truncated at 50 matches and contain no declaration of the claimed s1–s9 graph or anchor 8/s1c. design/analyze-plan-builder.md:80–81 describes generic acyclicity and topological-order requirements; docs/epics/add-build-workflow-insrc-5th-stage-E20260717185807ba/HLD.md:513 discusses other story edges without establishing this premise's graph. Neither confirms nor contradicts the declared dependencies. | Gather the target artifact's complete story dependency declarations and section 8/s1c, then compare each claimed edge with those declarations. |
| 8/s1c | ordering | MED | manual | The story dependency graph is acyclic and each story can be acceptance-tested once its declared prerequisites are complete. | Unverifiable: the capped grep results provide neither the story dependency graph at 8/s1c nor the prerequisites and acceptance criteria at 6/Depends on. design/analyze-framework.md:242,359 and design/analyze-plan-builder.md:80–81 describe analyzer task ordering, not this artifact's story dependencies. They establish neither acyclicity nor acceptance-test readiness for these stories. | Supply the complete story dependency list and each story's acceptance criteria; check for cycles and acceptance requirements that depend on undeclared prerequisites. |
| s9/Depends on | ordering | MED | manual | Repository conversion and delivery verification do not require completion of s8 tracker feedback readback. | The grep results are truncated at 50 matches and do not establish the s8/s9 dependency relationship. Matches such as docs/artifact-document-template-review.md:103 concern artifact-marker migration, while design/analyze-framework-data.md:504 concerns file conversion caching. No supplied reads address s9/Depends on, s9/ac27, s9/ac28, or s8 tracker feedback readback. The premise is unverifiable; no concrete build failure is established. | Provide the s8 and s9 definitions, ac27/ac28, and relevant conversion and delivery-verification implementation evidence to determine whether s8 completion is required. |
| 7/c1 | citation | MED | manual | The cited core data model plan contains the statement that all twelve gaps are settled. | docs/plans/core-data-model.md:1 reads “# Core data model: brainstorm decision log”. This confirms the document exists but does not verify the claimed statement “All twelve gaps are settled”. The premise is unverifiable from the supplied evidence. | Obtain the matching statement and its line number, or revise the premise to reflect only verified content. |
| 7/c7 | external-contract | MED | assisted | The owner rulings attributed to Subho Ghosh on 2026-10-19 support the scope, identity, folder naming, migration and cloud-access decisions assigned to c7. | No probes were run and no owner rulings were supplied. The attribution to Subho Ghosh on 2026-10-19 and its support for c7, k1, k7 and k9 are unverifiable from the gathered evidence. | Supply the owner rulings and map them to c7’s scope, identity, folder naming, migration and cloud-access decisions before treating this premise as verified. |
| k9 | external-contract | LOW | manual | Cloud LLM access must remain delegated to local CLI binaries without introducing direct REST providers. | AGENTS.md:12 and CLAUDE.md:12 explicitly require cloud LLM access through locally installed claude/codex binaries via CliProvider and prohibit direct cloud REST providers. AGENTS.md:136 and design/analyze-framework.md:27 reaffirm this constraint. These matches verify the stated requirement; the truncated search does not establish exhaustive implementation compliance. | none — verified sound |

#### Proposed fixes

- **1/c4** (assisted) — The supplied evidence cannot support a definitive replacement claim about persisted artifact types.
  - option: Gather source definitions and retain the premise only if they demonstrate the claimed absence.
  - option: Narrow the premise to specific missing shared fields once source evidence establishes those gaps.

- **1/c4** (assisted) — No supplied declaration supports a mechanical correction or confirms the premise.
  - option: Provide targeted reads of the artifact metadata declarations to verify the premise.
  - option: Qualify the premise as unverified pending evidence of the four metadata fields.

- **1/c4** (assisted) — The supplied evidence neither confirms nor contradicts the source-level exclusivity claim; no mechanical correction is supported.
  - option: Gather source-scoped definitions and persistence evidence, then reassess the premise.
  - option: Reword the premise as an unverified assumption pending inspection of task persistence and metadata handling.

- **1/c2/c3** (assisted) — The supplied evidence neither verifies nor contradicts the claimed distinction; no mechanical correction is supported.
  - option: Retain the premise pending targeted implementation evidence from both anchored files.
  - option: Reword the premise as an unverified assumption pending comparison of artifact and work-item identity implementations.

- **1/c2/c3** (manual) — The supplied evidence does not establish the identity-generation semantics, so no evidence-derived correction is safe.
  - option: Provide both identity-generation implementations and a shared-epic call path to verify the claim.
  - option: Treat the premise as unverified until those source probes are available.

- **1/c1** (assisted) — The supplied evidence neither confirms nor contradicts the claimed absence; no mechanical correction is supported.
  - option: Verify the premise with untruncated tracker-specific probes and reads of comment retrieval and feedback-writing paths.
  - option: Reword the premise as an unverified assumption pending inspection of the tracker integration.

- **1/c5** (assisted) — The supplied evidence neither confirms nor contradicts the premise, so no evidence-derived artifact correction is safe.
  - option: Provide scoped source evidence demonstrating artifact-type-specific knowledge in the graph reader.
  - option: Mark the premise unverified pending inspection of the graph reader.

- **1/c6** (assisted) — The supplied evidence neither confirms nor contradicts the dependency; no mechanical correction is supported.
  - option: Retain the premise pending targeted evidence from both referenced artifacts.
  - option: Reword the dependency as a proposed design rationale, subject to confirmation.

- **E202610192f27754d:FR001** (assisted) — The supplied evidence does not support a mechanical correction to the premise.
  - option: Provide targeted reads of FR001, S002:FR001 and s2/ac4 to verify the proposed inventory.
  - option: Provide the proposed common artifact type or schema with field requiredness for comparison.

- **E202610192f27754d:FR002** (assisted) — The supplied evidence neither confirms complete coverage nor identifies a concrete contradiction; no mechanical correction is supported.
  - option: Retain the coverage claim pending a complete category-to-identity mapping supported by source reads.
  - option: Reword coverage as a design requirement whose verification remains pending.

- **E202610192f27754d:S001:FR002** (manual) — The supplied evidence supports no specific canonical representation or safe artifact correction.
  - option: Supply targeted workflow identifier definitions and write-site evidence, then reassess the premise.
  - option: Define the canonical representation and covered write surfaces explicitly as a requirement, then verify implementation coverage.

- **E202610192f27754d:FR003** (assisted) — The evidence supports the stated requirement of ten statuses, but not an exhaustive inventory or a document-wide absence claim.
  - option: Supply the canonical lifecycle enumeration and check its count against FR003.
  - option: Narrow the premise to say that DEF.md:30 requires ten statuses without enumerating them in that requirement.

- **E202610192f27754d:S003:FR001** (assisted) — The supplied evidence supports neither confirmation nor an evidence-derived text correction.
  - option: Provide the anchored requirements and lifecycle definition, then reassess the inventory.
  - option: Reword the claim as a proposed requirement, subject to confirmation that these five fields are intended.

- **E202610192f27754d:FR003** (assisted) — The supplied matches neither verify nor contradict the full requirement; no evidence-derived artifact correction is justified.
  - option: Retain the requirement and gather targeted evidence covering all three decision types.
  - option: Clarify that this is a prospective requirement, then specify and verify revision binding for each decision type.

- **E202610192f27754d:S002:FR002** (assisted) — The supplied evidence supports neither verification nor a concrete contradiction, so no evidence-derived artifact correction is safe.
  - option: Retain the premise pending focused source evidence confirming child-link derivation and parent persistence behavior.
  - option: Clarify the statement as a proposed design requirement, with existing storage behavior explicitly unverified.

- **E202610192f27754d:S004:FR001** (manual) — The supplied evidence neither confirms nor contradicts the storage requirement; no evidence-derived text correction is safe.
  - option: Verify the premise using source reads of artifact persistence paths and write operations.
  - option: Clarify that this is a proposed storage requirement and define its acceptance checks explicitly.

- **E202610192f27754d:S004:FR002** (manual) — The supplied evidence supports neither verification nor a concrete contradiction; no safe artifact correction follows.
  - option: Provide targeted source reads covering persistence and read-time computation of counts, open feedback, and current status.
  - option: Provide the referenced requirements and invariant k8 to establish the intended scope, then probe the corresponding implementation.

- **E202610192f27754d:S005:FR001** (assisted) — The evidence supports the intended vocabulary but does not establish the current implementation's exhaustive kinds.
  - option: Frame the premise as a target requirement for the common model.
  - option: Gather the current feedback type and validator evidence, then specify any required migration from legacy kinds.

- **E202610192f27754d:S005:FR002** (manual) — The supplied evidence supports neither confirmation nor a concrete correction of the actor contract.
  - option: Provide targeted source evidence establishing the actor union and identifier namespace rules.
  - option: If this is a new requirement, explicitly define the actor categories and identifier format as a proposed contract.

- **E202610192f27754d:S006:FR001** (manual) — The supplied evidence neither confirms nor contradicts the complete premise; no evidence-derived artifact correction is safe.
  - option: Re-run the probes scoped to source files and read the binding declarations and completed-post bookkeeping.
  - option: If this specifies a new contract, provide the relevant design and acceptance criteria to distinguish required additions from existing behavior.

- **E202610192f27754d:S006:FR002** (assisted) — The supplied evidence supports neither confirmation nor contradiction; no mechanical factual correction is justified.
  - option: Mark the premise as an unresolved external-contract assumption pending verification.
  - option: Specify the attachment requirements and substantiate the scoped limitation with authoritative GitHub API evidence.

- **3/c6** (assisted) — The evidence neither confirms nor contradicts the story mapping; no mechanical correction is supported.
  - option: Provide targeted reads of s7–s9 and retain the premise if their scope confirms it.
  - option: Mark the story mapping as unverified pending targeted evidence.

- **3/c6** (assisted) — The supplied evidence does not establish the claimed ordering, so no evidence-derived text correction is safe.
  - option: Supply source lines explicitly establishing that the team epic's synchronization work follows the common-model epic.
  - option: Reword the ordering as a proposed dependency requiring confirmation rather than an established schedule.

- **3/c6** (assisted) — The supplied evidence neither confirms the cross-artifact ownership claim nor establishes a concrete implementation failure.
  - option: Supply passages from the team workflow plan that explicitly assign both behaviors to revision and signoff work.
  - option: Reword the premise as a proposed scope exclusion pending confirmation of ownership.

- **3/c7** (assisted) — The supplied evidence cannot verify the authorization or its technical justification; no mechanical correction is supported.
  - option: Provide the dated owner ruling plus gate reads showing use of tracker-reported identities.
  - option: Mark the premise as an unverified design assumption pending confirmation of the owner ruling and gate identity contract.

- **3/c7** (assisted) — The supplied evidence supports neither the hierarchy nor its stated motivation, so a mechanical correction is unavailable.
  - option: Provide the c7 passage and hierarchy definition for verification.
  - option: Reword the premise as an explicit proposal to place Define above Epic for future PRD support, subject to design confirmation.

- **3/c7** (assisted) — Repository references do not authenticate the claimed chat decision; a factual replacement requires owner confirmation or the missing ruling.
  - option: Attach the owner's 2026-10-19 ruling confirming both deprecation and exclusion from this epic.
  - option: Ask the owner to confirm epic exclusion and repository deprecation separately, then revise c7 to reflect that decision.

- **3/c1/c5** (assisted) — The supplied evidence supports neither exhaustive artifact coverage nor the claimed compatibility failure.
  - option: Supply targeted reader and schema evidence, then retain or narrow the premise to the verified artifact types.
  - option: Reword the premise as an unverified compatibility risk pending inspection of the delivery read path.

- **4/c1** (assisted) — The supplied evidence supports neither the preservation policy nor its claimed sole exception, so no evidence-derived replacement is safe.
  - option: Provide targeted passages from the core data model plan covering identifiers, filenames, and migration exceptions.
  - option: Mark this premise as unverified pending those passages and defer relying on its preservation policy.

- **4/c1** (manual) — The supplied evidence neither verifies nor contradicts the strategy; no safe artifact correction follows from it.
  - option: Supply the strategy and targeted implementation reads for all three preservation requirements.
  - option: Supply compatibility-test evidence covering existing references, amendment records, and issue links.

- **4/c6** (assisted) — The evidence neither confirms nor contradicts the claimed contract; no evidence-derived text correction is available.
  - option: Supply relevant team-workflow sections and implementation evidence demonstrating exclusive authorship and cross-clone coordination.
  - option: Recast the premise as an explicit design assumption requiring validation before implementation.

- **4/c1** (assisted) — The supplied evidence neither confirms nor contradicts the claimed external contract.
  - option: Retain the premise pending targeted verification of both CLI paths and their authentication requirements.
  - option: Reword it as an assumption requiring verification of GitHub and GitLab issue-comment access with existing credentials.

- **4/c1** (assisted) — The evidence supports the intended merge strategy but does not establish compatibility in participating teams' environments.
  - option: Retain the premise pending team Git-version inventory and a representative append-only merge test.
  - option: Reword the premise as an unverified compatibility prerequisite that must be validated before rollout.

- **s4/ac11** (manual) — The supplied evidence supports neither verification nor a safe mechanical correction.
  - option: Retain the requirement and supply implementation and test evidence covering concurrent entries, exactly-once presentation, defined ordering, and conflict-free merging.
  - option: If the strategy is not yet selected, resolve and document its identity, ordering, and merge semantics before treating this premise as established.

- **s4/ac13** (assisted) — The supplied matches do not address the external contract, so no evidence-derived artifact correction is safe.
  - option: Supply the head merge policy, applicable Git configuration, and conflict test evidence, then re-review.
  - option: Retain this as a proposed acceptance requirement and explicitly mark its Git conflict behavior as awaiting verification.

- **4/c7** (assisted) — The evidence neither confirms nor contradicts this external rollout contract; no concrete build failure or mechanical correction is established.
  - option: Supply the owner ruling confirming that every clone is covered by the coordinated upgrade.
  - option: Mark coordinated upgrades as an unverified assumption pending owner confirmation.

- **k1** (assisted) — The supplied evidence cannot establish the universal post-conversion claim or support a mechanical correction.
  - option: Retain the claim pending a complete source inventory and post-conversion verification.
  - option: Reword it as a required post-conversion invariant, with explicit checks for every stored-artifact producer.

- **k2** (assisted) — The supplied evidence neither confirms nor contradicts the invariant, so no evidence-derived text correction is safe.
  - option: Retain the premise pending targeted evidence of identifier allocation and deletion behavior.
  - option: Explicitly frame the premise as a required invariant to implement and validate, rather than established behavior.

- **k3** (assisted) — The supplied evidence neither confirms nor contradicts the invariant; no evidence-derived text correction is safe.
  - option: Provide implementation evidence for revision advancement and all excluded write paths.
  - option: If this is intended future behavior, explicitly label it as a required invariant and specify acceptance checks for each write category.

- **k4** (assisted) — The supplied evidence neither confirms nor contradicts the claimed semantics; no evidence-derived replacement is available.
  - option: Retain k4 pending verification of the feedback schema, write paths, and resolution logic.
  - option: Reframe k4 as a proposed design requirement, subject to confirmation, rather than an established implementation fact.

- **k5** (manual) — The supplied evidence supports neither confirmation nor a concrete contradiction; no evidence-derived artifact edit is safe.
  - option: Provide tracker identity retrieval and gate authorization source reads to verify the premise.
  - option: Treat the premise as an unverified requirement pending evidence of the identity-to-authorization flow.

- **k6** (assisted) — The supplied evidence supports neither a concrete failure nor a mechanical correction.
  - option: Supply implementation evidence for external issue identity, lifecycle binding cardinality, and supporting-artifact attachment.
  - option: Explicitly frame the premise as a proposed design invariant requiring implementation and acceptance checks, rather than verified existing behavior.

- **k7** (assisted) — The evidence supports an example folder name but no safe correction to the timestamp claim.
  - option: Supply targeted implementation and caller evidence to verify the premise.
  - option: Reword the statement as an explicit requirement pending verification of existing behavior.

- **k8** (manual) — The evidence neither verifies nor contradicts the ordering invariant; no evidence-derived artifact correction is available.
  - option: Provide implementation and test evidence for all parts of the invariant.
  - option: Treat the premise as an unverified requirement pending targeted probes.

- **E202610192f27754d:S003:FR002** (manual) — The supplied evidence neither confirms nor contradicts the ordering premise; no evidence-derived artifact correction is safe.
  - option: Provide implementation evidence tracing Task completion through Story and Epic rollup and claim release.
  - option: If this describes intended behavior, explicitly identify it as a requirement and define acceptance checks for propagation and release ordering.

- **s1/ac2** (assisted) — The supplied evidence cannot establish the compatibility claim or support a mechanical correction.
  - option: Retain the premise pending targeted source reads and a compatibility test using an existing unit label and unchanged title.
  - option: Reword the premise as a compatibility requirement to be demonstrated, rather than an established property.

- **s2/ac5** (manual) — The supplied evidence supports neither verification nor a safe artifact correction.
  - option: Provide common-reader and schema reads demonstrating acceptance of empty lifecycle components.
  - option: Define the intended empty representations and applicable artifact types explicitly, then validate them against targeted source evidence.

- **s2/ac6** (manual) — The supplied evidence neither confirms nor contradicts the premise; no evidence-derived artifact edit is safe.
  - option: Provide the artifact-reference type/schema and relevant validation code for verification.
  - option: Clarify whether this is a new acceptance requirement rather than an inventory claim about existing behavior.

- **s3/ac7** (assisted) — The supplied evidence neither confirms nor contradicts the transition; no evidence-derived text correction is safe.
  - option: Supply implementation and test evidence demonstrating the complete revision transition.
  - option: Explicitly frame this as required new behavior and define acceptance checks for draft creation and preservation of prior revision evidence.

- **s3/ac10** (assisted) — The evidence neither confirms nor contradicts the required guard ordering; no safe artifact correction is supported.
  - option: Supply targeted source reads showing the comparison and blocking guard for all three actions.
  - option: If this describes intended behavior, identify it explicitly as an acceptance requirement and supply tests demonstrating the required ordering.

- **s4/ac12** (assisted) — The supplied evidence neither confirms nor contradicts overwrite behavior; no evidence-derived text correction is available.
  - option: Provide targeted source reads showing write destinations and record identities across repeated build, review, and test rounds.
  - option: Reword outcome retention as a proposed requirement, with existing overwrite behavior explicitly marked unverified.

- **s5/ac15** (assisted) — The supplied evidence neither confirms nor contradicts the premise, so no evidence-derived correction is safe.
  - option: Retain the premise pending targeted implementation evidence for both default and explicit-subset behavior.
  - option: With author confirmation, frame this as required new behavior rather than an established implementation fact.

- **s6/ac18** (assisted) — The supplied evidence cannot establish the external contract or support a mechanical correction.
  - option: Retain the premise as explicitly unverified pending targeted contract evidence for all three providers.
  - option: Reword it as an intended integration strategy, with provider capabilities requiring validation.

- **s6/ac18** (assisted) — The evidence neither confirms nor contradicts the premise; no evidence-derived text correction is available.
  - option: Retain the premise pending targeted implementation and test evidence for both guarantees.
  - option: Explicitly frame both guarantees as requirements to implement and verify, rather than established behavior.

- **s6/ac19** (assisted) — The supplied evidence neither confirms nor contradicts the claimed behavior; no evidence-derived text correction is safe.
  - option: Provide targeted implementation evidence for both operations and reassess the premise.
  - option: Treat this behavior as an unverified acceptance requirement pending implementation and tests.

- **s7/ac20** (assisted) — The supplied documentation supports related concepts but neither confirms nor contradicts the claimed ordering and storage behavior.
  - option: Retain the premise pending targeted source evidence for all three claims.
  - option: Reword it as a required behavior rather than an established implementation fact, if that reflects the artifact's intent.

- **s7/ac21** (assisted) — The evidence supports the Task fields but not the claimed lifecycle semantics; no mechanical correction is justified.
  - option: Retain the premise pending targeted implementation and test evidence for all three lifecycle claims.
  - option: Explicitly frame the premise as required new behavior rather than established behavior, subject to human confirmation.

- **s7/ac22** (manual) — The evidence does not establish the edit contract, so no evidence-derived artifact correction is safe.
  - option: Verify the restriction against the Task edit schema and handlers before retaining the premise as an existing guarantee.
  - option: Express the restriction as a requirement to implement and validate, rather than an established behavior.

- **E202610192f27754d:S007:FR001** (assisted) — The supplied evidence neither confirms nor contradicts the ordering premise; no evidence-derived artifact correction is available.
  - option: Provide targeted reads of Task history writes and completion guards to verify the premise.
  - option: If this describes intended behavior, explicitly label it as a requirement pending implementation verification.

- **s8/ac24** (assisted) — The supplied evidence neither confirms nor contradicts the ingestion timing; no mechanical correction is supported.
  - option: Retain the premise pending targeted source evidence establishing all stated triggers and the absence of background polling.
  - option: If this describes intended behavior, reword it as a requirement rather than an established implementation fact.

- **s8/ac24** (assisted) — No evidence-derived artifact correction is possible from the supplied matches.
  - option: Provide targeted source evidence for comment identifiers, author fields, and persisted identifiers of framework-generated posts.
  - option: Make these capabilities explicit implementation requirements, with acceptance checks, rather than treating them as an established external contract.

- **s8/ac26** (assisted) — The supplied evidence neither confirms nor contradicts the synchronization behavior; no evidence-derived correction is available.
  - option: Provide targeted implementation evidence covering deduplication and subsequent edits/deletions, then reassess.
  - option: Mark the premise as unverified pending inspection of tracker feedback synchronization.

- **s9/ac27** (manual) — The supplied evidence cannot establish a complete inventory or reconstruction semantics, so no evidence-derived artifact edit is safe.
  - option: Retain the requirement pending targeted evidence for exhaustive conversion and one-commit behavior.
  - option: Define explicit conversion mappings and unavailable-history behavior after inspecting the current storage and provenance models.

- **s9/ac28** (assisted) — The supplied evidence neither confirms the claimed ordering nor establishes a concrete failure; no mechanical correction is supported.
  - option: Retain the premise and supply targeted verifier and comparison source evidence.
  - option: If this describes intended behavior, reword it as an explicit implementation and acceptance requirement.

- **s9/ac29** (manual) — The supplied evidence cannot establish the external compatibility contract or support an exact artifact correction.
  - option: Retain the requirement and supply version-specific source evidence and compatibility tests.
  - option: Define a minimum compatible tool version and decide how conversion is gated for tools below that version.

- **6/Depends on** (manual) — The supplied evidence supports no replacement dependency graph or safe artifact edit.
  - option: Provide the target artifact's dependency declarations and 8/s1c for verification.
  - option: Re-run scoped probes against the target artifact without truncating its dependency entries.

- **8/s1c** (manual) — The supplied evidence cannot establish the premise or support a concrete artifact correction.
  - option: Provide sections 8/s1c and 6/Depends on plus all story acceptance criteria for verification.
  - option: Treat this premise as unverified pending a complete dependency and acceptance-prerequisite audit.

- **s9/Depends on** (manual) — The supplied evidence supports neither independence nor a dependency; changing the ordering would require unsupported assumptions.
  - option: Verify independence using the s8/s9 requirements and relevant implementation paths.
  - option: If verification consumes tracker feedback readback, make that verification depend on s8.

- **7/c1** (manual) — The supplied heading cannot establish whether all twelve gaps are settled; no evidence-derived text correction is available.
  - option: Supply a source excerpt containing the claimed statement with its line number.
  - option: Remove the settlement claim until supporting evidence is available.

- **7/c7** (assisted) — The supplied evidence neither confirms nor contradicts the claimed external contract.
  - option: Provide the attributed chat rulings with an explicit mapping to the decisions assigned to c7.
  - option: Reword the premise as an unverified assumption pending owner confirmation.
