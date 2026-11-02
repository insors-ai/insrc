<!-- insrc:artifact TESTS-ca9883ca42f4d73f-S001 -->

# Tests: ca9883ca42f4d73f S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-02T12:14:26.040Z on commit `9355bdead`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: S001 t1: an update after a failed install installs again, and the marker exists only after a successful install**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: an update after a failed install installs again, and the marker exists only after a successful install | `src/cli/services/__tests__/maintenance-install-marker.test.ts` |

**integration: S001 t1: a matching marker skips the install; a stale or missing marker installs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: a matching marker skips the install; a stale or missing marker installs | `src/cli/services/__tests__/maintenance-install-marker.test.ts` |

**integration: S001 t1: npm runs with -std=c++17 appended to the caller's CXXFLAGS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: npm runs with -std=c++17 appended to the caller's CXXFLAGS | `src/cli/services/__tests__/maintenance-install-marker.test.ts` |

**integration: S001 t1: skipInstall leaves npm uncalled and the marker unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: skipInstall leaves npm uncalled and the marker unchanged | `src/cli/services/__tests__/maintenance-install-marker.test.ts` |

**integration: S001 t1: an empty lockfile hash installs and writes no marker; a marker write failure fails the update**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | S001 t1: an empty lockfile hash installs and writes no marker; a marker write failure fails the update | `src/cli/services/__tests__/maintenance-install-marker.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/services/__tests__/maintenance-install-marker.test.ts` | 0 | 5 | 5.1 s |  |
