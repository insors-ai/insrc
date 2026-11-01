<!-- insrc:artifact TESTS-c2ba6fa62a148ed1-s7 -->

# Tests: c2ba6fa62a148ed1 s7

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-01T19:07:14.344Z on commit `71b4348d2`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: evidence codec round-trip and unknown decoding**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s7 t1: every evidence value round-trips through the edge-row codec; unknown is the empty value and the others are one distinct byte | `src/db/graph/__tests__/evidence-codec.test.ts` |
| pass | s7 t1: an empty value, 0x00 and a byte no value uses decode to unknown; a string that is not a value encodes empty and is reported invalid | `src/db/graph/__tests__/evidence-codec.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/db/graph/__tests__/evidence-codec.test.ts` | 0 | 2 | 0.5 s |  |
