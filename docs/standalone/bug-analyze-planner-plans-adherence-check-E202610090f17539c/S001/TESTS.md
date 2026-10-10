<!-- insrc:artifact TESTS-0f17539c98aa78ee-S001 -->

# Tests: 0f17539c98aa78ee S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-10T07:36:48.435Z on commit `a4b64f96`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: one enumeration per run, repository and topic is made, recorded under the run's directory with its whole output, and read back; a topic that differs only in case or spacing reuses it; a different maxSources, topic or run does not; a failed enumeration is not recorded and one with no constraint is**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | one enumeration per run, repository and topic is made, recorded under the run's directory with its whole output, and read back; a topic that differs only in case or spacing reuses it; a different maxSources, topic or run does not; a failed enumeration is not recorded and one with no constraint is | `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` |
| pass | the seam replaces the enumeration, and is handed the topic, the repository, the limit and no area | `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` |

**integration: a record that is unreadable, of another version or of another topic is enumerated again and overwritten; a record that cannot be written does not fail the check**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a record that is unreadable, of another version or of another topic is enumerated again and overwritten; a record that cannot be written does not fail the check | `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/runtimes/shared/__tests__/adherence-topic-constraints.test.ts` | 0 | 3 | 1.1 s |  |
