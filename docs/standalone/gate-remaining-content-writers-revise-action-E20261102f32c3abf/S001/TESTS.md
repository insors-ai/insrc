<!-- insrc:artifact TESTS-f32c3abf4a55494b-s1 -->

# Tests: f32c3abf4a55494b s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-02T09:44:56.149Z on commit `6f0f7f88f`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/revise-draft-gate.test.ts: assertMayReviseDraft asks teamGate for revise when the stage is in signoff or changes-requested and for author otherwise, and applies assertHeld for revise**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | assertMayReviseDraft asks teamGate for revise when the stage is in signoff or changes-requested and for author otherwise, and applies assertHeld for revise | `src/workflow/team/__tests__/revise-draft-gate.test.ts` |
| pass | assertMayAuthor asks 'revise' for an HLD or LLD in signoff, refuses a non-holder and an unassigned unit without taking the claim, and asks 'author' for any other status, a define run and a plan run | `src/workflow/team/__tests__/author-gate-revise.test.ts` |

**unit: src/workflow/team/__tests__/revise-draft-gate.test.ts: assertMayReviseDraft resolves with no tracker call in a repo with no team policy**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | assertMayReviseDraft resolves with no tracker call in a repo with no team policy | `src/workflow/team/__tests__/revise-draft-gate.test.ts` |

**unit: src/workflow/team/__tests__/revise-draft-gate.test.ts: assertMayReviseDraft rethrows a ToolDenied and throws TeamGateRefusedError for every other refusal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | assertMayReviseDraft rethrows a ToolDenied and throws TeamGateRefusedError for every other refusal | `src/workflow/team/__tests__/revise-draft-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/author-gate-revise.test.ts` | 0 | 2 | 0.7 s |  |
| `src/workflow/team/__tests__/revise-draft-gate.test.ts` | 0 | 3 | 0.7 s |  |

## t2

Run at 2026-11-02T09:54:43.564Z on commit `b1ce2a25b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/define-extend-gate.test.ts: the define extend path refuses a non-holder while the Define is in signoff and writes nothing, and the holder's extend is written as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the define extend path refuses a non-holder while the Define is in signoff and writes nothing, and the holder's extend is written as today | `src/workflow/__tests__/define-extend-gate.test.ts` |
| pass | define EXTEND: scope=extend → skip frame/compose → append Story + pending amendment + ExtendArtifact | `src/daemon/steps/workflow-step/__tests__/define-extend-e2e.test.ts` |

**integration: src/workflow/__tests__/define-extend-gate.test.ts: a repo with no team policy makes no tracker call and the extend is written as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a repo with no team policy makes no tracker call and the extend is written as today | `src/workflow/__tests__/define-extend-gate.test.ts` |

**integration: src/workflow/__tests__/define-extend-gate.test.ts: a duplicate Story id or an unapproved Epic fails before the gate is asked, and a denied tracker call in the gate stops the run**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an unapproved Epic fails before the gate is asked, and a denied tracker call in the gate stops the run | `src/workflow/__tests__/define-extend-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/workflow-step/__tests__/define-extend-e2e.test.ts` | 0 | 3 | 0.8 s |  |
| `src/workflow/__tests__/define-extend-gate.test.ts` | 0 | 3 | 0.6 s |  |

## t3

Run at 2026-11-02T09:58:30.477Z on commit `504e0622a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/workflow/__tests__/resolve-comment-gate.test.ts: handleResolveComment answers an error and records nothing when the actor may not revise the stage**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handleResolveComment answers an error and records nothing when the actor may not revise the stage | `src/workflow/__tests__/resolve-comment-gate.test.ts` |

**integration: src/workflow/__tests__/resolve-comment-gate.test.ts: the gate is asked once for several comments and maps define, hld and lld to the Epic and Story stages**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the gate is asked once for several comments and maps define, hld and lld to the Epic and Story stages | `src/workflow/__tests__/resolve-comment-gate.test.ts` |

**integration: src/workflow/__tests__/resolve-comment-gate.test.ts: outside signoff a comment behaves as an author turn, and a repo with no team policy records as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | outside signoff a comment behaves as an author turn, and a repo with no team policy records as today | `src/workflow/__tests__/resolve-comment-gate.test.ts` |

**integration: src/workflow/__tests__/resolve-comment-gate.test.ts: a denied tracker call in the gate is rethrown and is not an error result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a denied tracker call in the gate is rethrown and is not an error result | `src/workflow/__tests__/resolve-comment-gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/resolve-comment-gate.test.ts` | 0 | 4 | 0.7 s |  |

## t4

Run at 2026-11-02T10:00:40.249Z on commit `2de44b705`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/__tests__/artifact-write-inventory.test.ts: every content entry and site names a gatedBy entry point or an exemption with a reason, including appendStoryToDefine**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every content entry and site names a gatedBy entry point or an exemption with a reason, including appendStoryToDefine | `src/workflow/__tests__/artifact-write-inventory.test.ts` |
| pass | every writer file is inventoried, annotated and classified as the design says | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**unit: src/workflow/__tests__/artifact-write-inventory.test.ts: a content writer with neither a gate nor an exemption is reported**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a content writer with neither a gate nor an exemption is reported | `src/workflow/__tests__/artifact-write-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/artifact-write-inventory.test.ts` | 0 | 10 | 1.7 s |  |

## t5

Run at 2026-11-02T10:13:07.330Z on commit `ad508c050`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/revise-writers-record.test.ts: the revise-writers section of team-workflow.md records the decisions, the exemptions, the sweep result and the open items**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the revise-writers section of team-workflow.md records the decisions, the exemptions, the sweep result and the open items | `src/workflow/team/__tests__/revise-writers-record.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/revise-writers-record.test.ts` | 0 | 1 | 0.4 s |  |
