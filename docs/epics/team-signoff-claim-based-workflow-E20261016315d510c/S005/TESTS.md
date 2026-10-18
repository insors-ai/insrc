<!-- insrc:artifact TESTS-315d510cb28100e2-s5 -->

# Tests: 315d510cb28100e2 s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-18T14:24:07.223Z on commit `ecac83d1`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/tracker/__tests__/github-adapter.test.ts: addAssignee adds without removing, returns the assignees read back and reports a failed step without a retry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | addAssignee adds without removing, returns the assignees read back and reports a failed step without a retry | `src/workflow/tracker/__tests__/github-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/tracker/__tests__/github-adapter.test.ts` | 0 | 19 | 1.1 s |  |

## t2

Run at 2026-10-18T14:27:16.123Z on commit `6b6b6657`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/workflow/team/__tests__/gate.test.ts: teamGate allows with no tracker call when there is no policy, teamMode is false or claimsEnforced is false**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | teamGate allows with no tracker call when there is no policy, teamMode is false or claimsEnforced is false | `src/workflow/team/__tests__/gate.test.ts` |

**unit: src/workflow/team/__tests__/gate.test.ts: teamGate allows an unassigned stage for author and build and adds the actor through addAssignee (implicitClaim true), and takes no claim for approve-local or applying a finding**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | teamGate allows an unassigned stage for author and build and adds the actor through addAssignee (implicitClaim true), and takes no claim for approve-local or applying a finding | `src/workflow/team/__tests__/gate.test.ts` |

**unit: src/workflow/team/__tests__/gate.test.ts: teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | teamGate recognises a developer assigned directly in the tracker as the holder with no separate claim, comparing logins case-insensitively | `src/workflow/team/__tests__/gate.test.ts` |

**unit: src/workflow/team/__tests__/gate.test.ts: teamGate returns held-by-other naming the holder for author, build, approve-local, apply and open-signoff, whatever the holder's idle time**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | teamGate returns held-by-other naming the holder for author, build, approve-local, apply and open-signoff, whatever the holder's idle time | `src/workflow/team/__tests__/gate.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/team/__tests__/gate.test.ts` | 0 | 4 | 1.2 s |  |
