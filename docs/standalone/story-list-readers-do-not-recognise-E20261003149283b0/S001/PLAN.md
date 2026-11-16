<!-- insrc:artifact PLAN-149283b0d0455a43-s1 -->

# Plan: STORY-149283b0d0455a43-s1

## Summary

**Epic:** `story-list-readers-do-not-recognise`
**LLD run:** `wf-1794812683989-b7gbk4`
**LLD effective hash:** `70182799f7d0...`

Eight small tasks. A baseline is recorded first, then five independent production edits land in dependency order: the shared implied-story rule, the sized-route anchor, the define-missing message, the chain report (head reader and paths, then next actions) and the JetBrains Workflows reader. A new integration test file proves the LLD, review, anchor and chain behaviour against a seeded ISSUE-only repo, and a final task compares the workflow, MCP and JetBrains test results with the recorded baseline.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Record the baseline, add the shared implied-story rule and point the tracker resolver at it | S | — | — | unit: implied-issue-stories.test.ts: impliedIssueStories returns exactly one entry with id IMPLIED_ISSUE_STORY_ID and the ISSUE title; unit: implied-issue-stories.test.ts: the tracker resolver answers implied for s1 and null for s2 from the shared constant | [[c2]] [[c7]] |
| 2 | **`t2`** Make the sized bugfix route keep the ISSUE as its anchor | S | — | — | unit: bugfix-orchestration.test.ts: nextAfterIssue sized route carries epicHash=issueHash and storyId s1; unit: bugfix-orchestration.test.ts: nextAfterIssue refuses a sized ISSUE with no issueHash; unit: bugfix-orchestration.test.ts: sized-route fixtures carry an issueHash; unit: bugfix-orchestration.test.ts: nextAfterIssue small route is unchanged | [[c1]] [[c5]] [[c6]] |
| 3 | **`t3`** Name the ISSUE-anchored situation in the define-missing error | S | — | — | unit: gates.test.ts: readDefineArtifact on an ISSUE-only hash names the ISSUE and does not advise running define; unit: gates.test.ts: readDefineArtifact on a hash with neither root keeps the original message | [[c4]] [[c5]] |
| 4 | **`t4`** Make the chain report read an ISSUE-anchored definition, its story, its path and its label | M | — | `t1` | unit: chain-issue-anchored.test.ts: chain report for an ISSUE-anchored item returns the implied s1 with its LLD state; unit: chain-issue-anchored.test.ts: chain report story path for an ISSUE-anchored item is the standalone folder; unit: chain-issue-anchored.test.ts: chain report prefers a DEF when a DEF and an ISSUE share a hash; unit: chain-issue-anchored.test.ts: definitionKind is issue for an ISSUE head and def for a DEF head; unit: chain-issue-anchored.test.ts: formatChainReport labels an ISSUE head and leaves DEF output unchanged | [[c3]] [[c5]] [[c6]] [[c7]] |
| 5 | **`t5`** Give the ISSUE-anchored chain report its next-action rules | S | — | `t4` | unit: chain-issue-anchored.test.ts: unapproved ISSUE yields approve-define naming the ISSUE document; unit: chain-issue-anchored.test.ts: rejected ISSUE yields run-define that reruns the issue stage; unit: chain-issue-anchored.test.ts: next actions follow run-lld, approve-lld, chain-complete and never name an HLD, amendment, stale or tracker step; unit: chain-issue-anchored.test.ts: the DEF-anchored next-action sequence is unchanged | [[c3]] [[c5]] [[c6]] |
| 6 | **`t6`** Add the identity-regression integration tests for an ISSUE-anchored LLD | M | — | `t2`, `t3`, `t5` | integration: issue-anchored-route.test.ts: sized ISSUE start writes LLD-<issueHash>-s1 and no second root; integration: issue-anchored-route.test.ts: the LLD inherits the ISSUE label, epicCreatedAt and folder; integration: issue-anchored-route.test.ts: design review classifies the LLD as kind issue with the ISSUE as originating_issue; integration: issue-anchored-route.test.ts: PLAN and BUILD placement helpers keep the ISSUE epicHash, anchor and folder; integration: issue-anchored-route.test.ts: a second design.story start revises the same LLD and creates no duplicate; integration: issue-anchored-route.test.ts: a genuine standalone feature still mints its own root; integration: issue-anchored-route.test.ts: an Epic story still requires its DEF and HLD; integration: issue-anchored-route.test.ts: requireApprovedEpic still refuses an ISSUE root with a message naming the ISSUE; integration: issue-anchored-route.test.ts: a bugfix LLD with no ISSUE provenance is still rejected by design review; integration: issue-anchored-route.test.ts: chain report for the seeded ISSUE repo returns the implied s1 and reaches chain-complete | [[c5]] [[c6]] [[c8]] |
| 7 | **`t7`** Make the JetBrains Workflows reader list an ISSUE-anchored work item | M | — | — | unit: WorkflowChainReaderTest.kt: readAll lists an ISSUE-anchored hash with the implied story s1 and no HLD; unit: WorkflowChainReaderTest.kt: nextActionHint for an ISSUE-anchored entry follows approve issue, design story, approve LLD, chain complete; unit: WorkflowChainReaderTest.kt: readAll lists a hash with both a DEF and an ISSUE once, as the DEF; unit: WorkflowChainReaderTest.kt: readAll swallows a malformed ISSUE file without throwing | [[c9]] [[c5]] [[c6]] |
| 8 | **`t8`** Verify the whole change | S | — | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7` | smoke: workflow and MCP test subsets, the type check and the JetBrains reader tests match the t1 baseline with no new failures | [[c5]] [[c6]] [[c7]] |

### 1.1 TASK-149283b0d0455a43-s1-t1 — Record the baseline, add the shared implied-story rule and point the tracker resolver at it

Before any edit, run the workflow and MCP test subsets and the type check and record the result as the baseline for this Story. Then in src/workflow/storage.ts, next to readEpicDefinitionCore, add the exported constant IMPLIED_ISSUE_STORY_ID ('s1') and impliedIssueStories(issue) returning the single { id, title } entry. Change src/workflow/tracker/resolve.ts storyEvidence (the 'implied' branch) to compare against the constant instead of the literal. Behaviour is unchanged.

**Acceptance checks:**
- the baseline result of npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts' and of the type check is recorded before any source edit
- impliedIssueStories returns exactly one entry whose id is IMPLIED_ISSUE_STORY_ID and whose title is the ISSUE title
- tracker/resolve.ts has no literal 's1' for the implied rule and still answers implied for s1 and null for s2 on an ISSUE-anchored item
- the existing tracker resolver tests still pass

### 1.2 TASK-149283b0d0455a43-s1-t2 — Make the sized bugfix route keep the ISSUE as its anchor

In src/workflow/bugfix/next-after-issue.ts, the sized branch adds params.epicHash = issue.meta.issueHash and params.storyId = 's1' beside standalone:true and sizeClass:'bugfix', and throws 'nextAfterIssue: invalid-issue-hash' when the sized ISSUE has no 16-hex meta.issueHash. The small branch is untouched. Update the issue() fixture and any advance fixture in src/workflow/__tests__/bugfix-orchestration.test.ts to carry an issueHash, and add the sized-route and refusal tests.

**Acceptance checks:**
- the sized nextCall carries epicHash equal to the ISSUE's issueHash and storyId 's1', with standalone and sizeClass unchanged
- a sized ISSUE without a valid issueHash throws invalid-issue-hash and no nextCall is produced
- the small nextCall is identical to before
- the existing bugfix-orchestration tests pass with fixtures that carry an issueHash

### 1.3 TASK-149283b0d0455a43-s1-t3 — Name the ISSUE-anchored situation in the define-missing error

In src/workflow/gates.ts readDefineArtifact, when the DEF is absent and an ISSUE root exists at the same hash, throw the same ArtifactMissingError class with a message that says the work item is an ISSUE-anchored bugfix with no Define or HLD, and does not tell the user to run define. Without an ISSUE root the message is unchanged. requireApprovedEpic still refuses the ISSUE.

**Acceptance checks:**
- readDefineArtifact and requireApprovedEpic on an ISSUE-only hash throw ArtifactMissingError whose message names the ISSUE and omits the 'run define' advice
- on a hash with neither root the original message is unchanged
- a DEF-anchored read is unchanged

### 1.4 TASK-149283b0d0455a43-s1-t4 — Make the chain report read an ISSUE-anchored definition, its story, its path and its label

In src/workflow/chain.ts read the definition head as a discriminated DEF-or-ISSUE value (the DEF wins when both exist). For an ISSUE head: stories holds the implied s1 from impliedIssueStories; each story path is built from the LLD's own meta (workItemAnchorCreatedAt, workItemKindOf, meta.epicSlug) so it points under docs/standalone; define reflects the ISSUE's existence, approval and rejection with its path the ISSUE document; hld is absent. ChainReport gains one optional field, definitionKind, and formatChainReport labels the definition as an ISSUE for an ISSUE head and leaves DEF output byte-identical. The existing DEF-anchored chain tests run first and must stay green. Next-action ordering is t5.

**Acceptance checks:**
- the existing DEF-anchored chain tests (chain.test.ts, chain-report-tracker.test.ts) pass unchanged before and after the edit
- an ISSUE-anchored report returns one implied story s1 with its LLD existence and approval and a path under docs/standalone, not docs/epics
- when a DEF and an ISSUE share a hash the DEF is read
- definitionKind is 'issue' for an ISSUE head and 'def' for a DEF head
- formatChainReport shows an ISSUE label for an ISSUE head and its DEF output is byte-identical to before

### 1.5 TASK-149283b0d0455a43-s1-t5 — Give the ISSUE-anchored chain report its next-action rules

In src/workflow/chain.ts computeNextAction, for an ISSUE head: approve-define whose command names the ISSUE document when unapproved; run-define whose command reruns the issue stage when rejected; then run-lld and approve-lld for s1; then chain-complete. An ISSUE head never yields run-hld, approve-hld, review-amendment, refresh-stale, push-tracker or sync-tracker. DEF-anchored ordering is untouched.

**Acceptance checks:**
- an unapproved ISSUE yields approve-define whose command names the ISSUE document
- a rejected ISSUE yields run-define whose command reruns the issue stage, not define
- an approved ISSUE with no LLD yields run-lld for s1, with an unapproved LLD approve-lld, and with an approved LLD chain-complete
- an ISSUE-anchored report never contains an HLD, amendment, stale or tracker action
- the DEF-anchored next-action sequence is unchanged

### 1.6 TASK-149283b0d0455a43-s1-t6 — Add the identity-regression integration tests for an ISSUE-anchored LLD

Create src/workflow/__tests__/issue-anchored-route.test.ts, modelled on seedIssueRepo in folder-identity-finalize.test.ts. Against a seeded ISSUE-only repo it proves that a standalone LLD started with the issue hash and s1 is written as LLD-<issueHash>-s1 with the ISSUE's label, epicCreatedAt and folder and no second root; that design review classifies it as kind issue with the ISSUE as originating_issue; that a second start revises the same LLD; that a genuine standalone feature still mints its own root, an Epic story still requires its DEF and HLD, requireApprovedEpic still refuses an ISSUE, and a bugfix LLD with no ISSUE provenance is still rejected; and that the chain report returns the implied s1 and chain-complete once s1's LLD is approved. PLAN and BUILD identity is scoped to the helpers they use (requireEpicAnchor, inheritedStoryStandalone, inheritedEpicSlug) on the same seeded repo, plus the PLAN finalizer through an existing plan test fixture where one exists; a full BUILD record is not produced. No production code changes.

**Acceptance checks:**
- the sized-ISSUE LLD is LLD-<issueHash>-s1 with the ISSUE's label and epicCreatedAt and no second root
- design review resolves kind issue and lists the approved ISSUE as originating_issue
- requireEpicAnchor, inheritedStoryStandalone and inheritedEpicSlug return the ISSUE's anchor, placement and label for the seeded repo
- a second design.story start revises the same LLD and creates no duplicate
- genuine standalone and Epic-story behaviour is unchanged, and a bugfix LLD without ISSUE provenance is still rejected
- the chain report for the seeded repo returns the implied s1 and chain-complete once s1's LLD is approved

### 1.7 TASK-149283b0d0455a43-s1-t7 — Make the JetBrains Workflows reader list an ISSUE-anchored work item

In jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/workflow/WorkflowChainReader.kt, readDir also enumerates ISSUE-<hash>.json for hashes that have no DEF-<hash>.json and projects each as a chain entry: define mark from the ISSUE's meta.approvedAt and meta.rejectedAt, hld absent, one implied story s1 titled with the ISSUE body title with hasLld and approved read from LLD-<hash>-s1.json and never stale, zero amendments, and a plain hint (Approve issue, Re-run issue, Design story s1, Approve LLD for s1, Chain complete) that never names an HLD, amendment or stale step. WorkflowChainDto gains a defaulted definitionKind field so existing callers compile unchanged. A hash with both a DEF and an ISSUE is listed once, as the DEF; a malformed ISSUE contributes nothing. Read-only, no socket, never throws. DEF entries and their hints are unchanged. Add the tests to WorkflowChainReaderTest.kt.

**Acceptance checks:**
- an ISSUE-only hash is listed once with definitionKind issue, the implied story s1 and no HLD
- the ISSUE hint follows Approve issue, Re-run issue, Design story s1, Approve LLD for s1, Chain complete and never names an HLD, amendment or stale step
- a hash with both a DEF and an ISSUE is listed once, as the DEF
- a malformed ISSUE file contributes nothing and does not throw
- the existing DEF-anchored WorkflowChainReaderTest cases and WorkflowsPageTest pass unchanged

### 1.8 TASK-149283b0d0455a43-s1-t8 — Verify the whole change

Run the workflow and MCP test subsets and the type check once after all tasks, run the JetBrains plugin's Kotlin tests (./gradlew test in jetbrains-plugin) where the Gradle toolchain is available, compare with the baseline recorded in t1, and confirm by reading the diff against the LLD's invariants that no tracker runner file changed and requireApprovedEpic still refuses an ISSUE.

**Acceptance checks:**
- npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts' passes with no new failures against the baseline recorded in t1
- the type check passes
- the JetBrains WorkflowChainReaderTest suite passes, or the task states plainly that the Gradle toolchain could not run here and why
- the diff touches no tracker runner file and requireApprovedEpic still refuses an ISSUE

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| nextAfterIssue sized route: epicHash equals issue.meta.issueHash, storyId is 's1', standalone/sizeClass unchanged; invalid-issue-hash refusal; small route unchanged | `t2` |
| impliedIssueStories and IMPLIED_ISSUE_STORY_ID: one entry, id s1 | `t1` |
| the sized-route fixtures in bugfix-orchestration.test.ts carry a 16-hex issueHash and still pass; nextAfterIssue refuses a sized ISSUE without one | `t2` |
| finalizeStandaloneLld started with the issue hash and s1 writes LLD-<issueHash>-s1 with the ISSUE's label, epicCreatedAt and folder | `t6` |
| design review subject for that LLD resolves kind issue with the approved ISSUE as originating_issue | `t6` |
| buildChainReport for the ISSUE-anchored hash returns implied s1 with LLD state and no run-define action | `t4`, `t5`, `t6` |
| plan finalize and build records for the item keep the same epicHash and folder | `t6` |
| readDefineArtifact/requireApprovedEpic on an ISSUE-only hash throw ArtifactMissingError whose message names the ISSUE and does not say 'run define' | `t3`, `t6` |
| genuine standalone LLD with no ISSUE still mints its own root and an Epic story still requires DEF and HLD | `t6` |
| a bugfix LLD whose hash has no ISSUE root and no explicit ISSUE reference is still rejected by design review | `t6` |
| chain report story path for an ISSUE-anchored item equals the LLD's own docs/standalone path, not a docs/epics path | `t4` |
| chain report next action for an unapproved ISSUE is approve-define naming the ISSUE document, for a rejected ISSUE is run-define rerunning the issue stage, and after s1's LLD is approved is chain-complete with no tracker step | `t5` |
| when both a DEF and an ISSUE exist at one hash the chain report reads the DEF | `t4` |
| tracker/resolve.ts storyEvidence uses the shared constant: s1 implied, s2 not | `t1` |
| JetBrains WorkflowChainReader: an ISSUE-only hash lists one chain entry with definitionKind issue, implied story s1 from LLD-<hash>-s1.json, no HLD, never stale; its next-action hint follows Approve issue, Re-run issue, Design story s1, Approve LLD for s1, Chain complete; a DEF plus ISSUE hash lists once as the DEF; a malformed ISSUE contributes nothing; DEF entries are unchanged | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails: nextAfterIssue — the sized route carries epicHash and storyId s1, with the invalid-issue-hash refusal`
- **[[c2]]** `prior-artifact` `LLD s1 contractDetails: impliedIssueStories and IMPLIED_ISSUE_STORY_ID — the one implied-story rule`
- **[[c3]]** `prior-artifact` `LLD s1 contractDetails: buildChainReport — ISSUE head, story path from the LLD's own meta, next-action rules`
- **[[c4]]** `prior-artifact` `LLD s1 contractDetails: readDefineArtifact — ISSUE-aware ArtifactMissingError message`
- **[[c5]]** `prior-artifact` `LLD s1 errorPaths: error cases, edge cases and invariants to preserve`
- **[[c6]]** `prior-artifact` `LLD s1 testStrategy: test levels, subjects and acceptance mapping ac1-ac7`
- **[[c7]]** `prior-artifact` `LLD s1 migration: ordered rollout steps and backward compatibility`
- **[[c8]]** `prior-artifact` `LLD s1 dataModelChanges: work item identity shared by LLD, PLAN, BUILD, review and chain records`
- **[[c9]]** `prior-artifact` `LLD s1 contractDetails: WorkflowChainReader.readAll — the JetBrains reader lists an ISSUE-anchored work item`
