<!-- insrc:artifact PLAN-c5b49ff953a9a295-s1 -->

# Plan: STORY-c5b49ff953a9a295-s1

## Summary

**Epic:** `give-every-trivial-change-issue-record`
**LLD run:** `wf-1794722626308-qelw3o`
**LLD effective hash:** `41010cddc063...`

Building this Story changes four places that together decide how small work is tracked: the ISSUE record learns to describe a change, the issue-approval advance carries the ISSUE's hash forward, the build refuses work without an ISSUE, and triage sends trivial work to the issue stage. The agent-facing text is updated to match. A new repair step then gives the 16 existing trivial builds an ISSUE and lets the completion rule settle their Stories.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Record and render an ISSUE's kind | M | — | — | unit: finalizeIssue: params.kind change is stored on the ISSUE meta and an unknown kind is refused; unit: renderIssueMarkdown: kind change renders What was asked, Why and Change; unit: renderIssueMarkdown: an ISSUE with no kind renders byte-identically to before; unit: issue capture prompt: a change run asks what was asked and why, not for a defect | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Hand the ISSUE's hash to the next stage | S | — | — | unit: nextAfterIssue: a small ISSUE routes to build with the ISSUE hash as standalone.epicHash; unit: nextAfterIssue: a sized ISSUE routes to design.story with params.epicHash set to the ISSUE hash; unit: nextAfterIssue: an ISSUE without a 16-hex issueHash is refused | [[c4]] |
| 3 | **`t3`** Refuse a headless no-design build | M | — | `t2` | integration: build implement: a no-LLD standalone call without epicHash is refused with no-identity and writes nothing; integration: build implement: a no-LLD standalone call whose epicHash has no approved ISSUE is refused | [[c5]] [[c6]] |
| 4 | **`t4`** Route trivial work to the issue stage | S | — | `t1`, `t3` | unit: routeForSizeClass: trivial routes to the issue stage with no LLD; unit: routeForSizeClass: no tier starts at build; unit: triage nextCall: trivial starts the issue workflow with sizeClass trivial, magnitude small and kind change; integration: a trivial change: ISSUE approved, build under its hash, BUILD approved completes STORY and EPIC | [[c7]] [[c8]] |
| 5 | **`t5`** Update the steering and tool descriptions | S | — | `t4` | integration: the steering text routes trivial work through the issue stage and no longer calls a BUILD record a ledger entry | [[c9]] [[c10]] |
| 6 | **`t6`** Backfill rule: preview and ISSUE write | M | — | `t1` | integration: repair-preview lists one backfill-issue change per headless standalone trivial BUILD and writes nothing; integration: repair writes a kind change ISSUE for each headless BUILD, approved by the migration actor, and a second repair lists none | [[c11]] |
| 7 | **`t7`** Settle backfilled Stories and recover a part-way run | M | — | `t6` | integration: repair settles a backfilled Story by the completion rule: one completes, one approved before the cutoff without an override is held, and a draft BUILD is not settled; integration: a failure injected during the backfill lists the ISSUEs written and the next repair writes only the rest | [[c11]] [[c12]] |

### 1.1 TASK-c5b49ff953a9a295-s1-t1 — Record and render an ISSUE's kind

Add optional meta.kind ('defect' | 'change') to IssueArtifact; finalizeIssue stores params.kind beside magnitude and refuses an unknown value; renderIssueMarkdown uses What was asked / Why / Change for 'change'; the issue.capture prompt asks for a change's request and reason when the run's kind is 'change'.

**Acceptance checks:**
- An issue run with params.kind 'change' stores meta.kind 'change'; an unknown kind writes no ISSUE.
- An ISSUE with no kind renders byte-identically to before.
- A change ISSUE renders What was asked, Why and Change.

### 1.2 TASK-c5b49ff953a9a295-s1-t2 — Hand the ISSUE's hash to the next stage

nextAfterIssue puts issue.meta.issueHash in the small build call (standalone.epicHash) and the sized design.story call (params.epicHash), and refuses an ISSUE without a 16-hex issueHash.

**Acceptance checks:**
- A small ISSUE's advance call carries standalone.epicHash equal to the ISSUE hash.
- A sized ISSUE's advance call carries params.epicHash equal to the ISSUE hash.
- An ISSUE without a valid issueHash makes the advance fail.

### 1.3 TASK-c5b49ff953a9a295-s1-t3 — Refuse a headless no-design build

The standalone no-LLD build stops minting a hash from the focus: implement and validate refuse a call without epicHash (no-identity) or whose epicHash has no approved ISSUE (no-head). Small (LLD) builds are unchanged.

**Acceptance checks:**
- A no-LLD call without epicHash is refused with no-identity and writes nothing.
- A no-LLD call whose epicHash has no approved ISSUE is refused.
- A no-LLD call under an approved ISSUE builds as before.

### 1.4 TASK-c5b49ff953a9a295-s1-t4 — Route trivial work to the issue stage

routeForSizeClass('trivial') returns startStage 'issue'; buildNextCall starts the issue workflow with sizeClass trivial, magnitude small, kind change (and kind defect for a bugfix); no tier starts at build.

**Acceptance checks:**
- Triage of a trivial request returns an issue-workflow nextCall with kind change and magnitude small.
- No size class routes to build.
- A trivial change runs issue, approval, build and BUILD approval and its Story completes.

### 1.5 TASK-c5b49ff953a9a295-s1-t5 — Update the steering and tool descriptions

Steering block lines 231, 341-342, 463, 536 and 557 and the insrc_build_step / insrc_triage descriptions say trivial work and a small bugfix start with an ISSUE and that the code-review packet pins it; refresh the plugin asset copy.

**Acceptance checks:**
- No steering or tool description routes trivial work straight to build or calls a BUILD record a ledger entry.

### 1.6 TASK-c5b49ff953a9a295-s1-t6 — Backfill rule: preview and ISSUE write

Add the repair rule and step 'backfill-issue' before 'units': the preview lists one change per standalone trivial BUILD with no DEF, ISSUE or LLD head; repair writes a kind 'change' ISSUE under the BUILD's hash from its focus, triage rationale and summary, anchored at its epicCreatedAt, approved by the migration actor with the reason recorded, or left pending when the BUILD is not approved. Each write is reported under 'backfill-issue'.

**Acceptance checks:**
- repair-preview lists one backfill-issue change per headless BUILD and writes nothing.
- repair writes the ISSUEs; a second run lists none.
- The ISSUE of a BUILD that is not approved stays pending.

### 1.7 TASK-c5b49ff953a9a295-s1-t7 — Settle backfilled Stories and recover a part-way run

Prove that after the backfill the existing units and settle steps complete, hold or leave unsettled each Story by the completion rule, and that a failure during the backfill is reported and finished by the next run. Post-deploy (not code): back up the records, run repair-preview on this repository, expect 16 backfill-issue changes, then run repair and read written, held and failed.

**Acceptance checks:**
- Settle completes a backfilled Story with a qualifying approval, holds one approved before the cutoff without an override, and leaves the draft BUILD's Story unsettled.
- A part-way failure lists what was written and the next run finishes without writing any ISSUE twice.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| routeForSizeClass: trivial routes to the issue stage with no LLD | `t4` |
| routeForSizeClass: no tier starts at build | `t4` |
| triage nextCall: trivial starts the issue workflow with sizeClass trivial, magnitude small and kind change | `t4` |
| finalizeIssue: params.kind change is stored on the ISSUE meta and an unknown kind is refused | `t1` |
| nextAfterIssue: a small ISSUE routes to build with the ISSUE hash as standalone.epicHash | `t2` |
| nextAfterIssue: a sized ISSUE routes to design.story with params.epicHash set to the ISSUE hash | `t2` |
| nextAfterIssue: an ISSUE without a 16-hex issueHash is refused | `t2` |
| renderIssueMarkdown: kind change renders What was asked, Why and Change | `t1` |
| renderIssueMarkdown: an ISSUE with no kind renders byte-identically to before | `t1` |
| issue capture prompt: a change run asks what was asked and why, not for a defect | `t1` |
| build implement: a no-LLD standalone call without epicHash is refused with no-identity and writes nothing | `t3` |
| build implement: a no-LLD standalone call whose epicHash has no approved ISSUE is refused | `t3` |
| a trivial change: ISSUE approved, build under its hash, BUILD approved completes STORY and EPIC | `t4` |
| the steering text routes trivial work through the issue stage and no longer calls a BUILD record a ledger entry | `t5` |
| repair-preview lists one backfill-issue change per headless standalone trivial BUILD and writes nothing | `t6` |
| repair writes a kind change ISSUE for each headless BUILD, approved by the migration actor, and a second repair lists none | `t6` |
| repair settles a backfilled Story by the completion rule: one completes, one approved before the cutoff without an override is held, and a draft BUILD is not settled | `t7` |
| a failure injected during the backfill lists the ISSUEs written and the next repair writes only the rest | `t7` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 data model: IssueArtifact meta.kind in src/workflow/artifacts/issue.ts`
- **[[c2]]** `prior-artifact` `LLD s1 API: finalizeIssue stores params.kind in src/workflow/orchestrator.ts:900-935`
- **[[c3]]** `prior-artifact` `LLD s1 API: issue.capture runner prompt for a change`
- **[[c4]]** `prior-artifact` `LLD s1 API: nextAfterIssue carries the ISSUE hash in src/workflow/bugfix/next-after-issue.ts`
- **[[c5]]** `prior-artifact` `LLD s1 API: handleStandaloneImplement refuses a headless call in src/daemon/steps/build-step/phases/implement.ts:142`
- **[[c6]]** `prior-artifact` `LLD s1 API: build admission requires an approved ISSUE head (no-head refusal)`
- **[[c7]]** `prior-artifact` `LLD s1 API: routeForSizeClass trivial to issue in src/workflow/triage/classify.ts`
- **[[c8]]** `prior-artifact` `LLD s1 API: buildNextCall starts the issue workflow in src/daemon/steps/triage-step/phases/classify.ts`
- **[[c9]]** `prior-artifact` `LLD s1 steering update in src/prompts/steering-block.md`
- **[[c10]]** `prior-artifact` `LLD s1 tool descriptions in src/mcp/server.ts:634-706 (self-review f4)`
- **[[c11]]** `prior-artifact` `LLD s1 migration: backfill-issue repair rule in src/workflow/convert/repair.ts`
- **[[c12]]** `prior-artifact` `LLD s1 migration: settle and units steps in src/workflow/convert/settle.ts and src/workflow/convert/units.ts`
