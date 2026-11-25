<!-- insrc:artifact TESTS-5f9d4ab4c90c0b4c-s1 -->

# Tests: 5f9d4ab4c90c0b4c s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 21 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-11-24T09:05:44.923Z on commit `d593f20ce`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/gates.ts new helpers — requireApprovedDefinition + definitionHeadJsonPath head order (DEF-wins / corrupt-DEF->ISSUE / missing), approval gating, refuse messages, head md paths**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | definitionHeadJsonPath: DEF wins when both parse; corrupt DEF falls through to a valid ISSUE (first-READABLE-wins) | `src/workflow/__tests__/gates.test.ts` |
| pass | definitionHeadJsonPath + requireApprovedDefinition: missing both -> ArtifactMissingError naming the ISSUE id | `src/workflow/__tests__/gates.test.ts` |
| pass | requireApprovedDefinition: ISSUE head approved -> kind issue + jsonPath; draft -> ArtifactNotApprovedError naming the ISSUE md; rejected -> rejected message | `src/workflow/__tests__/gates.test.ts` |
| pass | requireApprovedDefinition: DEF head approved -> kind def; draft DEF -> ArtifactNotApprovedError naming the DEF md; DEF-only repo keeps requireApprovedEpic working | `src/workflow/__tests__/gates.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/gates.test.ts` | 0 | 32 | 1.2 s |  |

## t2

Run at 2026-11-24T09:22:31.101Z on commit `4ef5e6952`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/runners/tracker/context.ts assemblers — kind branches: DEF context byte-identical to pre-change baseline, ISSUE context carries headKind + prerendered epicBodyMd**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/runners/tracker/context.ts assemblers — kind branches: DEF context byte-identical to pre-change baseline, ISSUE context carries headKind + prerendered epicBodyMd | `src/workflow/runners/tracker/__tests__/context-head-kind.test.ts` |

**unit: src/workflow/tracker/conventions.ts renderIssueEpicBody — renders ISSUE body sections without DEF-only fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/tracker/conventions.ts renderIssueEpicBody — renders ISSUE body sections without DEF-only fields | `src/workflow/tracker/__tests__/render-issue-epic-body.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/tracker/__tests__/context-head-kind.test.ts` | 0 | 1 | 0.9 s |  |
| `src/workflow/tracker/__tests__/render-issue-epic-body.test.ts` | 0 | 1 | 0.7 s |  |

## t3

Run at 2026-11-24T09:32:15.333Z on commit `100f2f8ef`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/runners/tracker/index.ts pushPrompt/pushVerifyPrompt — headKind 'issue' contains ISSUE block, NOT 'error unless'/task-list/backRef/sub-issue; headKind 'def' byte-identical to baseline**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/runners/tracker/index.ts pushPrompt/pushVerifyPrompt — headKind 'issue' contains ISSUE block, NOT 'error unless'/task-list/backRef/sub-issue; headKind 'def' byte-identical to baseline | `src/workflow/runners/tracker/__tests__/push-prompt-issue.test.ts` |

**unit: gh_issue_edit through the typed tool executor with a stubbed gh asserts the singular --add-label argv mapping (issue.ts:234/273) — tool-boundary, not prompt-string**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh_issue_edit through the typed tool executor with a stubbed gh asserts the singular --add-label argv mapping (issue.ts:234/273) — tool-boundary, not prompt-string | `src/workflow/runners/tracker/__tests__/gh-issue-edit-add-label.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/tracker/__tests__/gh-issue-edit-add-label.test.ts` | 0 | 1 | 0.7 s |  |
| `src/workflow/runners/tracker/__tests__/push-prompt-issue.test.ts` | 0 | 1 | 0.9 s |  |

## t4

Run at 2026-11-24T10:47:51.353Z on commit `9e6e6f040`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/orchestrator.ts mutateEpicTrackerMeta + finalizeTracker — finalize push+sync on ISSUE-only seed repo: ISSUE meta.tracker written, EPIC/STORY-s1 heads bound, readdir zero DEF-*.json; corrupt-DEF/valid-ISSUE finalize lands on ISSUE json; issueRef write-back on first publication**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/orchestrator.ts mutateEpicTrackerMeta + finalizeTracker — finalize push+sync on ISSUE-only seed repo: ISSUE meta.tracker written, EPIC/STORY-s1 heads bound, readdir zero DEF-*.json; corrupt-DEF/valid-ISSUE finalize lands on ISSUE json; issueRef write-back on first publication | `src/workflow/__tests__/tracker-issue-persistence.test.ts` |

**integration: src/workflow/tracker/sync.ts — storiesOf uses impliedIssueStories for ISSUE heads; patchTrackerMeta writes onto the resolved head; closeBugfixTrackerIssue closes via readRecordedRef (stubbed)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/tracker/sync.ts — storiesOf uses impliedIssueStories for ISSUE heads; patchTrackerMeta writes onto the resolved head; closeBugfixTrackerIssue closes via readRecordedRef (stubbed) | `src/workflow/__tests__/tracker-issue-persistence.test.ts` |

**integration: first publication sequence — approve ISSUE with tracking disabled, enable, push: exactly 1 create, issueRef written back + heads bound; write-back failure -> retry adopts with 0 creates**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | first publication sequence — approve ISSUE with tracking disabled, enable, push: exactly 1 create, issueRef written back + heads bound; write-back failure -> retry adopts with 0 creates | `src/workflow/__tests__/tracker-issue-persistence.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/tracker-issue-persistence.test.ts` | 0 | 3 | 0.9 s |  |

## t5

Run at 2026-11-24T10:52:32.054Z on commit `b954b7723`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/chain.ts computeNextAction + readTrackerMeta — buildChainReport four-state sequence on an ISSUE-anchored fixture: push-tracker -> sync-tracker -> chain-complete, never hld/amendment/stale**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/chain.ts computeNextAction + readTrackerMeta — buildChainReport four-state sequence on an ISSUE-anchored fixture: push-tracker -> sync-tracker -> chain-complete, never hld/amendment/stale | `src/workflow/__tests__/chain-issue-tracker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/chain-issue-tracker.test.ts` | 0 | 1 | 0.8 s |  |

## t6

Run at 2026-11-24T11:43:27.536Z on commit `60b695d36`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: deterministic two-run race — barrier after context assembly, released toward claimCreateIntent; exactly 1 createIssue, claim runId == winner, loser claimed:false never updates/deletes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | deterministic two-run race — barrier after context assembly, released toward claimCreateIntent; exactly 1 createIssue, claim runId == winner, loser claimed:false never updates/deletes | `src/workflow/tracker/__tests__/pending-create-claim.test.ts` |

**integration: interleaving takeover race — pause A after ownership read, B takes over under mutex (fence++), resume A -> ClaimOwnershipError, no overwrite/delete, A fenced from later persistence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | interleaving takeover race — pause A after ownership read, B takes over under mutex (fence++), resume A -> ClaimOwnershipError, no overwrite/delete, A fenced from later persistence | `src/workflow/tracker/__tests__/pending-create-claim.test.ts` |

**integration: two simultaneous abandoned-claim reconcilers — mutex serializes, exactly one takeover**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | two simultaneous abandoned-claim reconcilers — mutex serializes, exactly one takeover | `src/workflow/tracker/__tests__/pending-create-claim.test.ts` |

**integration: crash recovery — SIGKILL holder inside critical section; guard remains; fresh run reclaims via quarantineDeadGuard, recovers original claim, 0 new creates, live holder undisturbed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | crash recovery — SIGKILL holder inside critical section; guard remains; fresh run reclaims via quarantineDeadGuard, recovers original claim, 0 new creates, live holder undisturbed | `src/workflow/tracker/__tests__/pending-create-claim.test.ts` |

**integration: lost execute response — claim stays 'pending' with owner runId; fresh invocation (nothing injected) reconciles via title+marker, 0 additional creates, persists issueRef + bindings**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | lost execute response — claim stays 'pending' with owner runId; fresh invocation (nothing injected) reconciles via title+marker, 0 additional creates, persists issueRef + bindings | `src/workflow/tracker/__tests__/pending-create-claim.test.ts` |

**integration: identity refusal — duplicate titles / single unrelated title match refuse via ISSUE-<hash> marker + target verification, no label mutation, no create**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | identity refusal — duplicate titles / single unrelated title match refuse via ISSUE-<hash> marker + target verification, no label mutation, no create | `src/workflow/tracker/__tests__/pending-create-claim.test.ts` |

**integration: authority boundary — claim mutex acquired with key ISSUE-<hash> through the real withArtifactWriteAuthority/daemon handler; ArtifactIds.parse rejects PENDING-CREATE-<hash>; lock ordering claim-before-artifact-writes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | authority boundary — claim mutex acquired with key ISSUE-<hash> through the real withArtifactWriteAuthority/daemon handler; ArtifactIds.parse rejects PENDING-CREATE-<hash>; lock ordering claim-before-artifact-writes | `src/workflow/tracker/__tests__/pending-create-claim.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/pending-create-claim.test.ts` | 0 | 8 | 0.7 s |  |

## t7

Run at 2026-11-24T12:00:13.729Z on commit `cbcc99193`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/tracker/link.ts linkDocsToIssues — docs/standalone ISSUE.md contains marker + canonical body bytes + **Tracker:** line after push, byte-identical to renderIssueMarkdown without a ref; S001/LLD.md relinked; no docs/epics entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/workflow/tracker/link.ts linkDocsToIssues — docs/standalone ISSUE.md contains marker + canonical body bytes + **Tracker:** line after push, byte-identical to renderIssueMarkdown without a ref; S001/LLD.md relinked; no docs/epics entry | `src/workflow/tracker/__tests__/link-issue-docs.test.ts` |

**integration: tracker.post on pushed ISSUE fixture — lld+s1 posts to adopted story ref; hld/amendment/non-s1 refuse**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tracker.post on pushed ISSUE fixture — lld+s1 posts to adopted story ref; hld/amendment/non-s1 refuse | `src/workflow/tracker/__tests__/link-issue-docs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/link-issue-docs.test.ts` | 0 | 2 | 0.8 s |  |

## t8

Run at 2026-11-24T13:15:20.733Z on commit `3ab55bace`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: npx tsc --noEmit — clean typecheck**

Reported by the builder, not run by the gate: **pass**. Evidence: npx tsc --noEmit exit 0

**smoke: npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts' — diff-identical to the recorded HEAD baseline (36/10/11/16 workflow chunks, 6/26 MCP, 4 gates)**

Reported by the builder, not run by the gate: **pass**. Evidence: t8-sweep-evidence.txt @ 3ab55bace with baseline-vs-current diff: only TOTAL line differs, 5 failures pre-existing, MCP 105/0
