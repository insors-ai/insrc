<!-- insrc:artifact TESTS-315d510cb28100e2-s8 -->

# Tests: 315d510cb28100e2 s8

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 14 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-23T04:21:33.718Z on commit `d0937d23`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/artifact-core/__tests__/lifecycle-resignoff.test.ts: open-signoff from changes-requested appends a Signoff entry at the current revision and moves to in-signoff, and every other operation from changes-requested is as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | open-signoff from changes-requested appends a Signoff entry at the current revision and moves to in-signoff, and every other operation from changes-requested is as before | `src/workflow/artifact-core/__tests__/lifecycle-resignoff.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/artifact-core/__tests__/lifecycle-resignoff.test.ts` | 0 | 2 | 1.5 s |  |

## t2

Run at 2026-10-23T04:24:23.320Z on commit `59bdee33`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/github-signoff-revise.test.ts: readSignoffRequest maps headRefName and OPEN, MERGED and CLOSED to a branch and openness, and rejects a malformed ref and unreadable output**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readSignoffRequest maps headRefName and OPEN, MERGED and CLOSED to a branch and openness, and rejects a malformed ref and unreadable output | `src/workflow/tracker/__tests__/github-signoff-revise.test.ts` |

**unit: src/workflow/tracker/__tests__/github-signoff-revise.test.ts: readSignoffState with since uses each reviewer's latest decisive review and answers as in s7 without since**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readSignoffState with since uses each reviewer's latest decisive review and answers as in s7 without since | `src/workflow/tracker/__tests__/github-signoff-revise.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-signoff-revise.test.ts` | 0 | 2 | 2.8 s |  |

## t3

Run at 2026-10-23T04:56:35.496Z on commit `a23d8104`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/storage-signoff-history.test.ts: a changed content write keeps the prior Signoff entries and carries neither approval nor review, whether the next head has no lifecycle or a fresh draft one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a changed content write keeps the prior Signoff entries and carries neither approval nor review, whether the next head has no lifecycle or a fresh draft one | `src/workflow/__tests__/storage-signoff-history.test.ts` |

**unit: src/workflow/__tests__/storage-signoff-history.test.ts: an identical content write of an in-signoff or changes-requested head with no next lifecycle neither throws nor changes its lifecycle, and a prior head with no Signoff entry is written as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an identical content write of an in-signoff or changes-requested head with no next lifecycle neither throws nor changes its lifecycle, and a prior head with no Signoff entry is written as before | `src/workflow/__tests__/storage-signoff-history.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/storage-signoff-history.test.ts` | 0 | 2 | 1.1 s |  |

## t4

Run at 2026-10-23T04:59:28.066Z on commit `5faa5f38`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/signoff-revise.test.ts: prerequisiteFailure refuses a stale review including an override-approved one, accepts a changes-requested head whose approval and review are current, and refuses one whose approval is behind**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | prerequisiteFailure refuses a stale review including an override-approved one, accepts a changes-requested head whose approval and review are current, and refuses one whose approval is behind | `src/workflow/team/__tests__/signoff-revise.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/signoff-revise.test.ts` | 0 | 1 | 1.4 s |  |

## t5

Run at 2026-10-23T05:03:06.703Z on commit `1ecc34a4`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/signoff-revise.test.ts: the earlier request is read from the last Signoff entry of any revision, a failed read never opens a new request, and a merged or closed request, a port without readSignoffRequest and no earlier entry each open a new one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the earlier request is read from the last Signoff entry of any revision, a failed read never opens a new request, and a merged or closed request, a port without readSignoffRequest and no earlier entry each open a new one | `src/workflow/team/__tests__/signoff-revise.test.ts` |

**unit: src/workflow/team/__tests__/signoff-revise.test.ts: artifacts naming different earlier open requests are refused as a whole**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | artifacts naming different earlier open requests are refused as a whole | `src/workflow/team/__tests__/signoff-revise.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/signoff-revise.test.ts` | 0 | 3 | 3.2 s |  |

## t6

Run at 2026-10-23T05:06:23.097Z on commit `e3cdf471`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/signoff-revise.test.ts: a resubmission pushes to the request's branch, opens no second request and records new Signoff entries with the same Reference, a branch mismatch records nothing, and a repeat finishes the rest**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a resubmission pushes to the request's branch, opens no second request and records new Signoff entries with the same Reference, a branch mismatch records nothing, and a repeat finishes the rest | `src/workflow/team/__tests__/signoff-revise.test.ts` |

**unit: src/workflow/team/__tests__/signoff-revise.test.ts: a changes-requested request resubmitted with one revised and one unchanged artifact goes to the same request**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a changes-requested request resubmitted with one revised and one unchanged artifact goes to the same request | `src/workflow/team/__tests__/signoff-revise.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/signoff-revise.test.ts` | 0 | 5 | 2 s |  |

## t7

Run at 2026-10-23T05:08:35.409Z on commit `a64a9155`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/signoff-revise.test.ts: settleSignoff passes the last entry's at as since and records signoff-changes only for a request made after it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | settleSignoff passes the last entry's at as since and records signoff-changes only for a request made after it | `src/workflow/team/__tests__/signoff-revise.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/signoff-revise.test.ts` | 0 | 6 | 1.4 s |  |

## t8

Run at 2026-10-23T05:11:59.884Z on commit `ca73b4ef`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/author-gate-revise.test.ts: assertMayAuthor asks 'revise' for an HLD or LLD in signoff, refuses a non-holder and an unassigned unit without taking the claim, and asks 'author' for any other status, a define run and a plan run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | assertMayAuthor asks 'revise' for an HLD or LLD in signoff, refuses a non-holder and an unassigned unit without taking the claim, and asks 'author' for any other status, a define run and a plan run | `src/workflow/team/__tests__/author-gate-revise.test.ts` |

**unit: src/workflow/team/__tests__/author-gate-revise.test.ts: a design.story run on an LLD in changes-requested whose HLD is no longer signed off is refused by settleBeforeAuthor before assertMayAuthor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a design.story run on an LLD in changes-requested whose HLD is no longer signed off is refused by settleBeforeAuthor before assertMayAuthor | `src/workflow/team/__tests__/author-gate-revise.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/author-gate-revise.test.ts` | 0 | 2 | 1.4 s |  |

## t9

Run at 2026-10-23T05:17:44.571Z on commit `b898e77a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: src/workflow/team/__tests__/signoff-revise-e2e.test.ts: changes requested on a two-artifact request, both re-authored through writeArtifact or one left unchanged, approved again and resubmitted to the same request, settled signed-off for the new revisions only, a lingering old decision not cancelling it, a merged request not carried over, and a non-holder and an unassigned user refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | changes requested on a two-artifact request, both re-authored through writeArtifact or one left unchanged, approved again and resubmitted to the same request, settled signed-off for the new revisions only, a lingering old decision not cancelling it, a merged request not carried over, and a non-holder and an unassigned user refused | `src/workflow/team/__tests__/signoff-revise-e2e.test.ts` |

**smoke: Open a signoff pull request on a sandbox repo, push a revision to the same pull request, merge it, then start the next stage**

Reported by the builder, not run by the gate: **pass**. Evidence: Run on subhagho/FieldML on 2026-10-23 with the real GitHub adapter: pull request #6 (issue #5) was opened by openSignoff, readSignoffRequest answered its branch and open, changes were recorded, the DEF was re-authored through writeArtifact (Signoff entry kept), a second commit was pushed to the same branch, openSignoff went back to the same request #6 (one pull request on the branch with 2 commits, no second one), the next stage was refused while it was open, the merge was recorded signed-off on DEF and HLD by settleForAttempt, the claim was released and the next stage was allowed. The pull request shows MERGED.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/signoff-revise-e2e.test.ts` | 0 | 1 | 1.4 s |  |
