<!-- insrc:artifact TESTS-ba80a780f4408613-s1 -->

# Tests: ba80a780f4408613 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## s1

Run at 2026-11-27T15:49:17.922Z on commit `24e76224e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Real panel type probes preserve positive and intended-negative diagnostics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Real panel type probes preserve positive and intended-negative diagnostics | `scripts/__tests__/test-harness-probes.test.ts` |

**unit: compileProbe appends --skipLibCheck only when the per-probe skipLibCheck option is set and otherwise leaves its argv unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compileProbe appends --skipLibCheck only when the per-probe skipLibCheck option is set and otherwise leaves its argv unchanged | `scripts/__tests__/test-harness.test.ts` |

**unit: VS Code daemon commands delegate install and lifecycle through fixed shell and surface owned-runtime failures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | VS Code daemon commands delegate install and lifecycle through fixed shell and surface owned-runtime failures | `vscode-plugin/src/daemon/__tests__/commands.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `scripts/__tests__/test-harness-probes.test.ts` | 0 | 2 | 57.1 s |  |
| `scripts/__tests__/test-harness.test.ts` | 0 | 5 | 0.6 s |  |
| `vscode-plugin/src/daemon/__tests__/commands.test.ts` | 0 | 6 | 0.4 s |  |
