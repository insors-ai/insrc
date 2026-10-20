<!-- insrc:artifact PLAN-2f27754d4ad00b8e-s1 -->

# Plan: E202610202f27754d:S001

## Summary

**Epic:** `one-common-model-every-artifact`
**LLD run:** `wf-1792484795172-0f6wsn`
**LLD effective hash:** `f394b8a52456...`

Building s1 replaces the second work-item id scheme with one strict identity module and moves every path, anchor and tracker call to it. The work goes in layers that keep the repository type-checking: the module and storage ids first, then the path key and the single Epic-anchor rule with explicit read and write intent, then the build validation and completion hook, then the tracker port, titles and guards, then the locate and importer moves, and finally the deletion of id.ts and the old migration tool with the docs.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add the identity module | M | — | unit: src/workflow/__tests__/artifact-ids.test.ts: make produces the stored text for every existing kind and parse returns the same key; unit: src/workflow/__tests__/artifact-ids.test.ts: the per-kind required and forbidden fields and the uppercase story and task form throw InvalidArtifactKeyError; unit: src/workflow/__tests__/artifact-ids.test.ts: stored requirement ids in the canonical and slug forms parse to date, hash8, story as a number and fr; unit: src/workflow/__tests__/artifact-ids.test.ts: a folder name is not parsed as an artifact id | [[c1]] [[c2]] [[c3]] [[c4]] |
| 2 | **`t2`** Build storage and amendment ids through make | M | `t1` | integration: src/workflow/__tests__/storage.test.ts: lowercase-story artifacts keep their id and file name and resolve through the storage lookups and gates; integration: src/workflow/__tests__/storage.test.ts: an artifact stored with an uppercase story fails with an error that points to the conversion; unit: src/workflow/amendments/__tests__/next-amendment-id.test.ts: nextAmendmentId returns the same AMD text for existing amendment files and the next counter | [[c1]] [[c2]] [[c3]] [[c5]] |
| 3 | **`t3`** Make every producer default to the lowercase story | S | `t2` | integration: src/workflow/__tests__/standalone-story.test.ts: a new standalone workflow with no storyId produces s1 and passes the strict id check | [[c1]] [[c2]] [[c3]] [[c4]] |
| 4 | **`t4`** Introduce WorkItemKey and folderSegment in the path scheme | M | `t1` | unit: src/workflow/__tests__/path-scheme.test.ts: paths over a WorkItemKey equal the paths built before and a story-scoped kind without a story is rejected; unit: src/workflow/__tests__/path-scheme.test.ts: two artifacts of one Epic written on different days land in the same folder | [[c1]] [[c2]] [[c3]] |
| 5 | **`t5`** Resolve the Epic anchor in one place and stamp it | L | `t1`, `t4` | unit: src/workflow/__tests__/anchor-resolver.test.ts: resolveEpicAnchor by head kind, an unstamped standalone LLD head yields undefined, and workItemAnchorCreatedAt raises MissingAnchorError without a stamp; integration: src/workflow/__tests__/anchor-producers.test.ts: every root producer stamps epicCreatedAt and later records read it | [[c1]] [[c2]] [[c3]] [[c4]] |
| 6 | **`t6`** Give the record-folder helpers an explicit intent | L | `t5` | unit: src/workflow/runners/build/__tests__/record-intent.test.ts: read intent raises MissingAnchorError and write intent uses the root, preferring a persisted stamp or a head; integration: src/workflow/runners/build/__tests__/record-intent.test.ts: the first TESTS write stamps the anchor and a later BUILD files in the same folder | [[c1]] [[c2]] [[c3]] [[c4]] |
| 7 | **`t7`** Hold one write root in validation and completion | L | `t6` | integration: src/daemon/steps/build-step/__tests__/validate-anchor.test.ts: the first headless validate call writes TESTS first, a failing judge leaves the evidence, and a retry on a later day files BUILD in the same folder; integration: src/daemon/steps/build-step/__tests__/validate-anchor.test.ts: the first headless validate call with an injected TESTS write failure and a successful judge returns the verdict and writes a stamped BUILD; integration: src/daemon/steps/build-step/__tests__/validate-anchor.test.ts: a read-intent MissingAnchorError returns the missing-anchor error and an ordinary ledger write failure still returns the verdict; integration: src/workflow/runners/build/__tests__/completion-anchor.test.ts: ensureBuildRecordOnCompletion on a headless work item writes the BUILD record through write intent | [[c1]] [[c3]] [[c4]] [[c5]] |
| 8 | **`t8`** Remove the date fallbacks in the read paths | L | `t5`, `t6` | integration: src/workflow/__tests__/anchor-folders.test.ts: HLD, LLD, PLAN, BUILD, TESTS and CR written on different days land in one folder on the epic route and on the standalone route, including delivery grouping; integration: src/workflow/__tests__/anchor-folders.test.ts: an unstamped standalone LLD head does not yield its own createdAt as the anchor; integration: src/workflow/__tests__/anchor-missing-read.test.ts: subject-paths, questions and the helper callers each fail before any file is created when no anchor exists | [[c1]] [[c2]] [[c3]] [[c4]] |
| 9 | **`t9`** Remove the date fallbacks in the producers | M | `t5`, `t6` | integration: src/workflow/__tests__/anchor-missing-producers.test.ts: the finalizers, tracker-auto, tracker/link, workflow-rpc and synthesize each fail before any file is created when no anchor exists | [[c1]] [[c2]] [[c3]] [[c4]] |
| 10 | **`t10`** Add the exact-token title lookup to the tracker port | M | `t1` | unit: src/workflow/tracker/__tests__/title-token.test.ts: the exact-token matcher accepts the token and the token followed by an em dash and not a longer id; integration: src/workflow/tracker/__tests__/title-token.test.ts: findIssuesByTitleToken in the GitHub adapter over a stubbed gh boundary and in the fake agree and a failed call is a failed result | [[c1]] [[c2]] [[c3]] [[c4]] |
| 11 | **`t11`** Write artifact-id titles and markers | M | `t1` | integration: src/workflow/tracker/__tests__/issue-title.test.ts: unit-issue and the conventions bodies write an Epic, Story and Task title and marker that start with the artifact id | [[c1]] [[c2]] [[c3]] [[c4]] |
| 12 | **`t12`** Guard every issue create and add the createTracker seam | L | `t9`, `t10`, `t11` | integration: src/workflow/tracker/__tests__/issue-title-guard.test.ts: tracker-auto on the team and legacy paths writes artifact-id titles and markers; integration: src/workflow/tracker/__tests__/issue-title-guard.test.ts: an issue created earlier is adopted by its unit label or an exact artifact-id title; integration: src/workflow/tracker/__tests__/issue-title-guard.test.ts: s10 is never matched for s1 and t10 never for t1, several matches and a failed lookup create nothing | [[c1]] [[c2]] [[c3]] [[c4]] |
| 13 | **`t13`** Resolve references by artifact id | M | `t2`, `t11` | integration: src/workflow/__tests__/id-resolve.test.ts: resolveWorkflowRef accepts an artifact id, owner/repo#N, #N and an s<n> label and refuses a work-item id and an uppercase label | [[c1]] [[c3]] [[c4]] [[c5]] |
| 14 | **`t14`** Stop reading ids from folder names in locate | M | `t13` | integration: src/workflow/locate/__tests__/locate-parent-ids.test.ts: a parent is located and linked correctly in a repository with several epics and no code parses a folder name into an id | [[c1]] [[c3]] [[c4]] [[c5]] |
| 15 | **`t15`** Move the delivery and artifact renderer importers | M | `t4`, `t8` | integration: src/workflow/delivery/__tests__/identity-contract.test.ts: the delivery reader loads a lowercase repository with ordinals from the identity module | [[c1]] [[c2]] [[c3]] [[c5]] |
| 16 | **`t16`** Move the requirement-id callers and update fr-id tests | M | `t9`, `t12` | unit: src/workflow/__tests__/fr-id.test.ts: stored ids parse to date, hash8, story as a number and fr, uppercase mint is rejected and a miss returns undefined | [[c1]] [[c2]] [[c3]] [[c5]] |
| 17 | **`t17`** Delete id.ts and the docs migration tool | M | `t12`, `t14`, `t15`, `t16` | integration: src/workflow/__tests__/id-removal.test.ts: no source file, bin entry or write-inventory row refers to src/workflow/id.ts or the migration tool | [[c1]] [[c2]] [[c5]] |
| 18 | **`t18`** Record the conversion inputs and update the docs | S | `t17` | unit: src/workflow/__tests__/docs-ids.test.ts: the docs name the lowercase story form and the anchor rule and do not mention the removed command | [[c1]] [[c5]] |

### 1.1 E202610202f27754d:S001:T001 — Add the identity module

Add one module with ArtifactIds (make, parse, parentOf over every kind with the per-kind required and forbidden fields including AMD, TASKS and DIAG), RequirementIds (mint, parse returning { date, hash8, story?: number, fr } or undefined, isRequirementId, canonical and slug forms), InvalidArtifactKeyError, MissingAnchorError (a subclass) and the PathIntent type. id.ts is untouched. Unit tests pin its output to the text storage.ts and nextAmendmentId build today and to the stored requirement ids.

**Acceptance checks:**
- make produces the stored text for every existing kind and parse returns an equal key
- an uppercase story or task, a missing required field and a forbidden field (seq on TASKS, story on AMD) each throw InvalidArtifactKeyError
- parse returns undefined for a folder name, a work-item id, an uppercase id and an old marker
- stored requirement ids in the canonical and slug forms parse to date, hash8, story as a number and fr, and mint rejects an uppercase story
- the new unit tests pass and the repository type-checks

### 1.2 E202610202f27754d:S001:T002 — Build storage and amendment ids through make

Switch the storage.ts id functions (define, hld, lld, plan, build, spec, issue, code review, tests, extend) and nextAmendmentId to ArtifactIds.make, keeping the amendment counter scan, so an uppercase story throws. Update the tests and fixtures that use S001 to the lowercase form and add the test that a stored uppercase artifact fails with a message pointing to the s9 conversion.

**Acceptance checks:**
- lowercase-story artifacts keep their id and file name and resolve through the storage lookups and gates
- an uppercase story fails with an error that points to the conversion
- nextAmendmentId returns the same text for existing amendment files and the next counter
- the storage, gates and amendment tests pass

### 1.3 E202610202f27754d:S001:T003 — Make every producer default to the lowercase story

Change the standalone story default in design-story/standalone.ts, the build-step defaults in implement.ts and validate.ts, and the MCP tool descriptions and examples to s1. Add the fresh standalone workflow test.

**Acceptance checks:**
- a new standalone workflow with no storyId produces s1 and passes the strict id check
- no source text names S001 as a default or example
- the build-step and design-story tests pass

### 1.4 E202610202f27754d:S001:T004 — Introduce WorkItemKey and folderSegment in the path scheme

Add WorkItemKey and folderSegment to path-scheme.ts, change resolveArtifactMdPath and resolveCompanionPath and the storage.ts path builders and pending.ts to take a key (story ordinal read through ArtifactIds.parse), and remove the re-exports of the identity constructor and type. Folder text stays exactly as today. id.ts keeps compiling for its other importers.

**Acceptance checks:**
- paths for every artifact kind equal the paths built before the change
- two artifacts of one Epic written on different days get the same segment
- a story-scoped kind without a story throws InvalidArtifactKeyError
- path-scheme and storage tests pass and the repository type-checks

### 1.5 E202610202f27754d:S001:T005 — Resolve the Epic anchor in one place and stamp it

Add resolveEpicAnchor (by head kind) and stampRootAnchor next to readEpicCreatedAt; remove the LLD-own-createdAt fallback from readEpicDefinitionCore; make workItemAnchorCreatedAt require the stamp and raise MissingAnchorError; make finalizeDefine, finalizeBrainstorm, finalizeIssue and finalizeStandaloneLld (always, even as the first record) stamp epicCreatedAt through stampRootAnchor. The record-folder helpers and the ledger writers are left to t6.

**Acceptance checks:**
- resolveEpicAnchor returns the DEF or ISSUE head's createdAt, a stamped LLD head's stamp, and undefined for an unstamped LLD head
- workItemAnchorCreatedAt throws MissingAnchorError without a stamp
- each root producer stamps epicCreatedAt and a later record reads it
- a work item with a DEF head keeps its existing folder

### 1.6 E202610202f27754d:S001:T006 — Give the record-folder helpers an explicit intent

Give buildRecordFolderArgs, storyRecordFolderArgs, buildRecordPathsFor, testRecordPaths and storyWorkflowFiles an explicit PathIntent (read, or write with a root). The write form returns the first of a persisted BUILD or TESTS stamp, resolveEpicAnchor, then the root. persistTestRecordTask and persistBuildRecord use write intent and store epicCreatedAt through folderIdentityMeta. Update own-files.ts, standalone-record.ts and test-record.ts.

**Acceptance checks:**
- read intent raises MissingAnchorError when nothing anchors; write intent uses the root
- the first headless TESTS write stamps the anchor and a later BUILD reads it into the same folder
- the chain of upstream, head and own createdAt fallbacks is gone
- the build record and test record tests pass

### 1.7 E202610202f27754d:S001:T007 — Hold one write root in validation and completion

Change runValidateSession so the turn holds one write root for the TESTS write, storyWorkflowFiles and the BUILD persist, and both best-effort catches rethrow MissingAnchorError and return a BuildStepError with code missing-anchor while every other ledger failure stays best-effort. Change ensureBuildRecordOnCompletion to pass write intent. Add the validate-anchor and completion-anchor tests.

**Acceptance checks:**
- the first headless validate call with a failing judge keeps the TESTS evidence and a retry on a later day files BUILD in the same folder
- an injected TESTS write failure with a successful judge returns the verdict and writes a stamped BUILD
- a read-intent MissingAnchorError returns the missing-anchor error and an ordinary ledger failure still returns the verdict
- completion on a headless work item writes the BUILD record

### 1.8 E202610202f27754d:S001:T008 — Remove the date fallbacks in the read paths

Replace the fallbacks in the read paths with the resolved anchor and a failure before any write: code-review subject-paths.ts, questions.ts, pending.ts, delivery/graph.ts, and the helper callers in gates.ts, chain.ts and the implement.ts and validate.ts folder lookups. Add the cross-day folder tests for the epic and standalone routes and the missing-anchor tests for these sites.

**Acceptance checks:**
- HLD, LLD, PLAN, BUILD, TESTS and CR written on different days land in one folder on both routes, including delivery grouping
- each listed read site fails before any file is created when no anchor exists
- subject-paths.ts no longer uses new Date()
- the workflow, delivery and code-review tests pass

### 1.9 E202610202f27754d:S001:T009 — Remove the date fallbacks in the producers

Replace the inline readEpicCreatedAt-or-now fallbacks in the producers: orchestrator.ts (1372, 1847, 2227, 2687), the anchors in tracker-auto.ts and tracker/link.ts, daemon/workflow-rpc.ts, the synthesize phase and cli/services/workflow.ts, each with the resolved anchor and a failure before any write. Add the missing-anchor tests for these sites.

**Acceptance checks:**
- each listed site fails before any file is created when no anchor exists
- no source file falls back to new Date() or to an artifact's own createdAt for the folder date
- the workflow and daemon tests pass

### 1.10 E202610202f27754d:S001:T010 — Add the exact-token title lookup to the tracker port

Add findIssuesByTitleToken(token) to TrackerPort with a strict gh helper in github.ts, the GitHub adapter implementation and the in-memory fake. Matching is exact: the title equals the token or starts with it followed by an em dash and a space.

**Acceptance checks:**
- STORY-<h>-s1 matches 'STORY-<h>-s1' and 'STORY-<h>-s1 — title' and not STORY-<h>-s10; TASK -t1 does not match -t10
- a failed gh call is a failed result, never an empty list
- the adapter and fake agree over a stubbed gh boundary

### 1.11 E202610202f27754d:S001:T011 — Write artifact-id titles and markers

Switch the Epic, Story and Task titles in unit-issue.ts and the issue-body marker (idMarker, parseIdMarker and the three body renderers) in conventions.ts to the artifact id; the old marker is no longer read.

**Acceptance checks:**
- a new Epic, Story and Task issue title and body marker start with the artifact id
- an issue created earlier keeps its title and is still found by its unit label
- the unit-issue and conventions tests pass

### 1.12 E202610202f27754d:S001:T012 — Guard every issue create and add the createTracker seam

Guard every create in ensureUnitIssueDetailed and tracker-auto.ts with the unit-label lookup and findIssuesByTitleToken (one match adopted, none new, several or a failed lookup an error with no create); give Story issues made by tracker-auto the unit label; write the artifact-id titles in tracker-auto.ts; add the createTracker seam to the three push entry points so the legacy mode is testable.

**Acceptance checks:**
- an issue created earlier is adopted by its unit label or an exact artifact-id title
- s10 is never bound to s1, several matches and a failed lookup create nothing
- the team and legacy paths both create issues with artifact-id titles
- the tracker tests pass

### 1.13 E202610202f27754d:S001:T013 — Resolve references by artifact id

Make resolveWorkflowRef try ArtifactIds.parse first and drop the work-item id and uppercase label forms, and define the new ResolvedRef workflowId and slug values.

**Acceptance checks:**
- resolveWorkflowRef accepts an artifact id, owner/repo#N, #N and an s<n> label and refuses a work-item id and an uppercase label
- the ResolvedRef outputs are documented and tested
- the resolve tests pass

### 1.14 E202610202f27754d:S001:T014 — Stop reading ids from folder names in locate

Change locate/infer.ts refFromDocPath and infer-daemon.ts to map a docs path to its artifact through stored metadata instead of parsing the folder name; update locate-parent.ts and bugfix/tracker.ts for the new ResolvedRef outputs and convert stored parentRef.slug values. Test locating and linking a parent in a repository with several epics.

**Acceptance checks:**
- no locate code parses a folder name into an id
- a parent is located and linked correctly with multiple epics
- a stored parentRef.slug is converted or reported, not guessed
- the locate and bugfix tests pass

### 1.15 E202610202f27754d:S001:T015 — Move the delivery and artifact renderer importers

Move the importers of id.ts in the delivery module (graph and read ordinals) and the artifact renderers (define, plan, hld, lld and the companion header) to the new module, passing story ordinals through ArtifactIds.parse, and update their tests.

**Acceptance checks:**
- the delivery reader loads a lowercase repository
- rendered headers show the artifact id
- the delivery and artifact tests pass

### 1.16 E202610202f27754d:S001:T016 — Move the requirement-id callers and update fr-id tests

Move orchestrator.ts mintFrId and functional-definition.ts isFrId to RequirementIds, pass s<n> stories, and update fr-id.test.ts (uppercase mint rejected, parse misses undefined, successful-parse expectations kept) and the other tests that import id.ts.

**Acceptance checks:**
- stored requirement ids still parse to the same parts
- no non-test source file except the module itself imports src/workflow/id.ts
- the fr-id, functional-definition and define tests pass

### 1.17 E202610202f27754d:S001:T017 — Delete id.ts and the docs migration tool

Delete the docs migration tool (migrate-docs-tree.ts, bin/insrc-migrate-docs.ts and its package.json bin entry, its two tests, its write-inventory row and assertion), then delete src/workflow/id.ts. Add the test that no source file, bin entry or write-inventory row refers to either. Run the workflow, mcp and daemon test subsets.

**Acceptance checks:**
- id-removal test passes
- npm run build succeeds
- the workflow, mcp and daemon test subsets pass

### 1.18 E202610202f27754d:S001:T018 — Record the conversion inputs and update the docs

Record in the s9 inputs the 444 uppercase stored files, the stamping of old records and the relabelling of old issues, and update docs/workflow.md and the plans doc for the strict lowercase ids, the anchor rule and the removed command.

**Acceptance checks:**
- the docs name the lowercase story form, the anchor rule and the s9 conversion inputs
- no doc refers to insrc-migrate-docs or S001 as a default

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| ArtifactIds.make, parse and parentOf over every kind (DEF, HLD, LLD, PLAN, BUILD, CR, TESTS, EXT, AMD, SPEC, ISSUE, EPIC, STORY, TASK, TASKS, DIAG), the per-kind required and forbidden fields and rejection of the uppercase story and task form | `t1` |
| RequirementIds.mint, parse and isRequirementId against stored requirement ids in the canonical and slug forms with story a number; uppercase mint input rejected; parse misses return undefined (src/workflow/__tests__/fr-id.test.ts updated: successful-parse expectations kept, the S002 mint and null expectations changed) | `t1`, `t16` |
| folderSegment, resolveArtifactMdPath and resolveCompanionPath over a WorkItemKey: same text as today, one folder for one Epic on different days, a story-scoped kind without a story rejected | `t4` |
| resolveEpicAnchor by head kind over a temporary repository: a DEF head, an ISSUE head, a standalone LLD head with a stamp, a standalone LLD head WITHOUT a stamp (must return undefined, not the LLD's own createdAt), nothing; readEpicDefinitionCore returns no createdAt for the unstamped LLD head; stampRootAnchor; workItemAnchorCreatedAt raises MissingAnchorError without a stamp | `t5` |
| buildRecordFolderArgs, storyRecordFolderArgs, buildRecordPathsFor, testRecordPaths and storyWorkflowFiles with read intent (raise MissingAnchorError when nothing anchors) and with write intent (use the root when nothing anchors, prefer a persisted stamp or a head when one exists) | `t6` |
| nextAmendmentId returns the same AMD-<hash>-<n> text for existing amendment files and the next counter | `t2` |
| the exact-token matcher: STORY-<h>-s1 matches 'STORY-<h>-s1' and 'STORY-<h>-s1 — title' and not STORY-<h>-s10; TASK-<h>-s1-t1 does not match -t10 | `t10` |
| storage.ts id functions and the gates.ts lookups over a temporary repository with lowercase-story artifacts and over a copy of .insrc/artifacts/LLD-b94cf2c9058fd82a-S001.json to assert the documented failure | `t2` |
| cross-day folder tests with a controllable clock on the epic route (DEF head) and the standalone route (stamped LLD head): HLD, LLD, PLAN, BUILD, TESTS and CR on different days land in one folder, including delivery/graph.ts grouping and the pending list | `t8` |
| the first headless validate call through runValidateSession with no head and no LLD: the TESTS record is written first and stamps the anchor; the judge FAILS before BUILD persistence; a retry on a later simulated day writes BUILD; both land in one folder and the TESTS evidence is preserved | `t7` |
| the first headless validate call with an INJECTED TESTS write failure and a SUCCESSFUL judge: the call returns { next: 'done' } with the verdict, BUILD is written and stamped with the turn's now, its change log excludes the workflow's own files, and no missing-anchor error is produced | `t7` |
| ensureBuildRecordOnCompletion on a headless work item with no persisted BUILD or TESTS: the BUILD record is written through write intent, instead of failing in storyWorkflowFiles and being swallowed | `t7` |
| the missing-anchor behaviour in validate: a read-intent MissingAnchorError (testRecordMd) returns the missing-anchor BuildStepError and not { next: 'done' }; an ordinary ledger write failure in either best-effort catch still returns the verdict | `t7` |
| missing-anchor tests: finalizers, read-intent record-folder helpers, subject-paths.ts, questions.ts, tracker-auto.ts, tracker/link.ts, workflow-rpc.ts and synthesize.ts each fail before any file is created | `t8`, `t9` |
| each root producer (finalizeDefine, finalizeBrainstorm, finalizeIssue, finalizeStandaloneLld including as the first record, persistTestRecordTask, persistBuildRecord) stamps epicCreatedAt and a later record reads it | `t5`, `t6` |
| a fresh standalone workflow run with no storyId produces s1 and passes the strict id check, through the build-step implement and validate defaults | `t3` |
| resolveWorkflowRef accepting an artifact id, owner/repo#N, #N and an s<n> label and refusing an E<date><hash8>:S<nnn> work-item id and an uppercase label | `t13` |
| tracker-auto.ts Epic, Story and Task creation on the team path and on the legacy path through the createTracker seam, ensureUnitIssueDetailed and the three conventions.ts body renderers: artifact-id title and marker, label adoption, exact-title adoption, s1 versus s10 and t1 versus t10, several matches, and a failed lookup before create | `t11`, `t12` |
| findIssuesByTitleToken in the GitHub adapter over a stubbed gh boundary and in the fake | `t10` |
| no source file under src, no package.json bin entry and no write-inventory row refers to src/workflow/id.ts or src/workflow/migrate-docs-tree.ts | `t17` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s1 identity module: ArtifactIds, RequirementIds, InvalidArtifactKeyError, MissingAnchorError`
- **[[c2]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s1 storage ids, WorkItemKey path scheme and importer inventory`
- **[[c3]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s1 Epic anchor rule: resolveEpicAnchor, stampRootAnchor, PathIntent and the fallback sites`
- **[[c4]]** `prior-artifact` `LLD LLD-2f27754d4ad00b8e-s1 TrackerPort findIssuesByTitleToken, artifact-id titles and markers, createTracker seam`
- **[[c5]]** `doc` `docs/plans/core-data-model.md#s1-lld-upstream-prerequisites-2026-10-20`
