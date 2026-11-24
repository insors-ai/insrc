<!-- insrc:artifact PLAN-5f9d4ab4c90c0b4c-s1 -->

# Plan: STORY-5f9d4ab4c90c0b4c-s1

## Summary

**Epic:** `make-tracker-push-sync-post-stages`
**LLD run:** `wf-1795498420280-h8ye0z`
**LLD effective hash:** `3759c9a350cf...`

Building this story makes tracker.push/sync/post fully kind-aware for ISSUE-anchored work items across six layers — head resolution, contexts/prompts, persistence, chain, the atomic pending-create claim with fencing, and doc linkage — proven by unit (prompt-text, head-rule), integration (finalize, chain, claim races/crash/recovery, authority boundary), and smoke (typecheck + baseline-diff) tests.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Readable-head helpers in gates.ts | S | — | — | unit: src/workflow/gates.ts new helpers — requireApprovedDefinition + definitionHeadJsonPath head order (DEF-wins / corrupt-DEF->ISSUE / missing), approval gating, refuse messages, head md paths | [[c1]] |
| 2 | **`t2`** headKind on tracker contexts + kind-aware assemblers + renderIssueEpicBody | M | — | `t1` | unit: src/workflow/runners/tracker/context.ts assemblers — kind branches: DEF context byte-identical to pre-change baseline, ISSUE context carries headKind + prerendered epicBodyMd; unit: src/workflow/tracker/conventions.ts renderIssueEpicBody — renders ISSUE body sections without DEF-only fields | [[c1]] [[c2]] |
| 3 | **`t3`** ISSUE execute/verify prompt block in tracker runner | M | — | `t2` | unit: src/workflow/runners/tracker/index.ts pushPrompt/pushVerifyPrompt — headKind 'issue' contains ISSUE block, NOT 'error unless'/task-list/backRef/sub-issue; headKind 'def' byte-identical to baseline; unit: gh_issue_edit through the typed tool executor with a stubbed gh asserts the singular --add-label argv mapping (issue.ts:234/273) — tool-boundary, not prompt-string | [[c2]] |
| 4 | **`t4`** Kind-aware tracker persistence + issueRef write-back | M | — | `t1` | integration: src/workflow/orchestrator.ts mutateEpicTrackerMeta + finalizeTracker — finalize push+sync on ISSUE-only seed repo: ISSUE meta.tracker written, EPIC/STORY-s1 heads bound, readdir zero DEF-*.json; corrupt-DEF/valid-ISSUE finalize lands on ISSUE json; issueRef write-back on first publication; integration: src/workflow/tracker/sync.ts — storiesOf uses impliedIssueStories for ISSUE heads; patchTrackerMeta writes onto the resolved head; closeBugfixTrackerIssue closes via readRecordedRef (stubbed); integration: first publication sequence — approve ISSUE with tracking disabled, enable, push: exactly 1 create, issueRef written back + heads bound; write-back failure -> retry adopts with 0 creates | [[c3]] [[c4]] |
| 5 | **`t5`** Chain ISSUE branch tracker next-actions | S | — | `t4` | integration: src/workflow/chain.ts computeNextAction + readTrackerMeta — buildChainReport four-state sequence on an ISSUE-anchored fixture: push-tracker -> sync-tracker -> chain-complete, never hld/amendment/stale | [[c5]] |
| 6 | **`t6`** Atomic pending-create claim + mutex + fencing + recovery | L | — | `t3`, `t4` | integration: deterministic two-run race — barrier after context assembly, released toward claimCreateIntent; exactly 1 createIssue, claim runId == winner, loser claimed:false never updates/deletes; integration: interleaving takeover race — pause A after ownership read, B takes over under mutex (fence++), resume A -> ClaimOwnershipError, no overwrite/delete, A fenced from later persistence; integration: two simultaneous abandoned-claim reconcilers — mutex serializes, exactly one takeover; integration: crash recovery — SIGKILL holder inside critical section; guard remains; fresh run reclaims via quarantineDeadGuard, recovers original claim, 0 new creates, live holder undisturbed; integration: lost execute response — claim stays 'pending' with owner runId; fresh invocation (nothing injected) reconciles via title+marker, 0 additional creates, persists issueRef + bindings; integration: identity refusal — duplicate titles / single unrelated title match refuse via ISSUE-<hash> marker + target verification, no label mutation, no create; integration: authority boundary — claim mutex acquired with key ISSUE-<hash> through the real withArtifactWriteAuthority/daemon handler; ArtifactIds.parse rejects PENDING-CREATE-<hash>; lock ordering claim-before-artifact-writes | [[c6]] |
| 7 | **`t7`** Kind-aware doc linkage + ISSUE.md tracker link renderer | M | — | `t4` | integration: src/workflow/tracker/link.ts linkDocsToIssues — docs/standalone ISSUE.md contains marker + canonical body bytes + **Tracker:** line after push, byte-identical to renderIssueMarkdown without a ref; S001/LLD.md relinked; no docs/epics entry; integration: tracker.post on pushed ISSUE fixture — lld+s1 posts to adopted story ref; hld/amendment/non-s1 refuse | [[c7]] |
| 8 | **`t8`** Verification sweep + baseline parity | S | — | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7` | smoke: npx tsc --noEmit — clean typecheck; smoke: npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts' — diff-identical to the recorded HEAD baseline (36/10/11/16 workflow chunks, 6/26 MCP, 4 gates) | [[c8]] |

### 1.1 TASK-5f9d4ab4c90c0b4c-s1-t1 — Readable-head helpers in gates.ts

gates.ts: add requireApprovedDefinition + definitionHeadJsonPath using readArtifactCore first-READABLE-wins (DEF then ISSUE), approval-gated like requireApprovedEpic

**Acceptance checks:**
- unit tests: DEF-wins when both parse; corrupt DEF falls through to ISSUE (readArtifactCore first-READABLE-wins); missing both -> ArtifactMissingError naming ISSUE id; approval gating (rejected/not-approved -> ArtifactNotApprovedError with head md path)

### 1.2 TASK-5f9d4ab4c90c0b4c-s1-t2 — headKind on tracker contexts + kind-aware assemblers + renderIssueEpicBody

headKind on tracker context schemas + kind-aware assemblers in context.ts + renderIssueEpicBody in conventions.ts

**Acceptance checks:**
- schemas carry optional headKind; assemblers branch on kind: DEF byte-identical, ISSUE via impliedIssueStories + renderIssueEpicBody
- unit test: DEF context byte-identical; ISSUE context carries headKind + prerendered body

### 1.3 TASK-5f9d4ab4c90c0b4c-s1-t3 — ISSUE execute/verify prompt block in tracker runner

ISSUE block in pushPrompt/pushVerifyPrompt keyed on headKind (runners/tracker/index.ts), DEF prompts byte-identical

**Acceptance checks:**
- prompt-string unit tests: headKind 'issue' prompt has ISSUE block (one issue, body=epicBodyMd, labels epicLabel+epic:<slug>, adopt without --force via singular --add-label mapping issue.ts:234/273, no task-list/backRef/sub-issues, not 'error unless'); 'def' byte-identical; ISSUE verify = issueLabelled+bodyMatches+singleIssue

### 1.4 TASK-5f9d4ab4c90c0b4c-s1-t4 — Kind-aware tracker persistence + issueRef write-back

mutateEpicTrackerMeta + sync.ts persist to definitionHeadJsonPath (readable-head rule); issueRef write-back on first publication

**Acceptance checks:**
- integration: finalize push+sync on ISSUE-only fixture writes meta.tracker onto ISSUE json, binds EPIC/STORY-s1 heads, readdir zero DEF files; corrupt-DEF/valid-ISSUE finalize lands on ISSUE json; ISSUE push writes meta.tracker.issueRef back on first publication; sync storiesOf uses impliedIssueStories for ISSUE heads

### 1.5 TASK-5f9d4ab4c90c0b4c-s1-t5 — Chain ISSUE branch tracker next-actions

chain.ts computeNextAction ISSUE branch falls through to DEF tracker steps

**Acceptance checks:**
- integration: chain four-state sequence on ISSUE fixture — push-tracker -> sync-tracker -> chain-complete, never hld/amendment/stale

### 1.6 TASK-5f9d4ab4c90c0b4c-s1-t6 — Atomic pending-create claim + mutex + fencing + recovery

claimCreateIntent 'wx' create-if-absent + claim mutex keyed ISSUE-<hash> via write-authority + guard-directory lock (quarantineDeadGuard) + fence token + heartbeat liveness + ownership checks + verifyRecoveryCandidate reconciliation

**Acceptance checks:**
- integration: two-run race -> 1 create, winner runId, loser claimed:false never mutates; interleaving takeover -> ClaimOwnershipError + fenced; two reconcilers -> one takeover; SIGKILL holder -> quarantine reclaims, 0 new creates, live holder undisturbed; lost execute response -> 'pending' reconciled 0 creates; duplicate/unrelated titles refuse via marker+target; authority-boundary: mutex key ISSUE-<hash> through real withArtifactWriteAuthority handler, PENDING-CREATE-<hash> rejected by ArtifactIds.parse

### 1.7 TASK-5f9d4ab4c90c0b4c-s1-t7 — Kind-aware doc linkage + ISSUE.md tracker link renderer

linkDocsToIssues headKind + renderIssueMarkdownWithTracker (artifacts/issue.ts) for ISSUE.md; post-target rules

**Acceptance checks:**
- integration: linkDocsToIssues ISSUE head rewrites docs/standalone ISSUE.md via renderIssueMarkdownWithTracker (marker + canonical body + **Tracker:** line) + S001/LLD.md; no docs/epics entry; no ref -> byte-identical to renderIssueMarkdown; post lld+s1 to adopted ref, hld/amendment/non-s1 refuse

### 1.8 TASK-5f9d4ab4c90c0b4c-s1-t8 — Verification sweep + baseline parity

Build all of t1-t7, run named tests + typecheck + baseline-diff sweep

**Acceptance checks:**
- smoke: tsc clean; workflow+MCP subsets no new failures vs baseline (36/10/11/16, 6/26, 4 gates pre-existing); all t1-t7 tests pass

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/gates.ts new helpers | `t1` |
| src/workflow/tracker/conventions.ts renderIssueEpicBody | `t2` |
| src/workflow/runners/tracker/index.ts pushPrompt/pushVerifyPrompt | `t3` |
| src/workflow/orchestrator.ts mutateEpicTrackerMeta + finalizeTracker | `t4` |
| src/workflow/tracker/sync.ts | `t4` |
| src/workflow/chain.ts computeNextAction + readTrackerMeta | `t5` |
| src/workflow/tracker/link.ts linkDocsToIssues | `t7` |
| src/workflow/runners/tracker/context.ts assemblers | `t2` |
| npx tsc --noEmit | `t8` |
| npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts' | `t8` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD-5f9d4ab4c90c0b4c-s1: readable-head rule (requireApprovedDefinition, definitionHeadJsonPath, first-READABLE-wins)` — "One readable-head rule — readArtifactCore first-READABLE-wins, DEF then ISSUE, same as storage.ts readEpicDefinitionCore — backs the helpers and every persistence site."
- **[[c2]]** `prior-artifact` `LLD-5f9d4ab4c90c0b4c-s1: headKind contexts + ISSUE prompt block + renderIssueEpicBody/renderIssueMarkdownWithTracker` — "Context schemas gain optional headKind; pushPrompt/pushVerifyPrompt emit an ISSUE block for headKind 'issue' — ONE issue, authoritative body, labels epicLabel+epic:<slug>, adopt without --force, no se"
- **[[c3]]** `prior-artifact` `LLD-5f9d4ab4c90c0b4c-s1: kind-aware persistence + issueRef write-back (mutateEpicTrackerMeta, sync.ts)` — "mutateEpicTrackerMeta persists to definitionHeadJsonPath (readable-head rule); ISSUE push writes meta.tracker.issueRef back on first publication and binds EPIC/STORY-s1 heads."
- **[[c4]]** `prior-artifact` `LLD-5f9d4ab4c90c0b4c-s1: first publication flow (approve without tracking -> enable -> push -> close)` — "First publication with no issueRef (approved while tracking disabled): the ISSUE prompt creates exactly ONE remote issue, finalize writes the ref back ... so closeBugfixTrackerIssue can close at compl"
- **[[c5]]** `prior-artifact` `LLD-5f9d4ab4c90c0b4c-s1: chain ISSUE branch tracker steps (chain.ts computeNextAction)` — "The chain's ISSUE branch routes approved ISSUE items through push-tracker, sync-tracker, chain-complete like DEF items while still skipping HLD/amendment/stale gates."
- **[[c6]]** `prior-artifact` `LLD-5f9d4ab4c90c0b4c-s1: atomic pending-create claim + mutex + fencing + quarantine recovery + verifyRecoveryCandidate` — "claimCreateIntent does an atomic create-if-absent ('wx') under a claim mutex keyed ISSUE-<hash> via withArtifactWriteAuthority; lock-directory guard with quarantineDeadGuard reclaims dead owners; fenc"
- **[[c7]]** `prior-artifact` `LLD-5f9d4ab4c90c0b4c-s1: linkDocsToIssues headKind + ISSUE.md tracker link renderer` — "linkDocsToIssues places docs by head kind; ISSUE heads relink ISSUE.md via renderIssueMarkdownWithTracker (adds the **Tracker:** line; body bytes canonical) and the standalone LLD.md."
- **[[c8]]** `prior-artifact` `LLD-5f9d4ab4c90c0b4c-s1: test strategy (unit prompt-text/head-rule, integration finalize/chain/claim/recovery/boundary, smoke baseline)` — "Test framework: node:test via npx tsx --test; fixtures = seeded temp .insrc/artifacts dirs (seedIssueRepo) + stubbed tracker port counting createIssue; smoke = tsc + workflow/MCP subsets vs the record"
