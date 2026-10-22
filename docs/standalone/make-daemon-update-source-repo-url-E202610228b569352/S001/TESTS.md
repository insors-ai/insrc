<!-- insrc:artifact TESTS-8b5693528b025a55-S001 -->

# Tests: 8b5693528b025a55 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-10-22T12:07:31.507Z on commit `f37a2c2e`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: update-source.test.ts: readUpdateSource returns only the set and valid keys, treats an absent file and empty strings as unset, and throws UpdateSourceError for each invalid value**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | update-source.test.ts: readUpdateSource returns only the set and valid keys, treats an absent file and empty strings as unset, and throws UpdateSourceError for each invalid value | `src/shared/__tests__/update-source.test.ts` |

**unit: update-runner.test.ts: launchUpdate passes --repo-url and --branch only for the keys that are set, and an invalid config spawns nothing and writes no marker**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | update-runner.test.ts: launchUpdate passes --repo-url and --branch only for the keys that are set, and an invalid config spawns nothing and writes no marker | `src/daemon/__tests__/update-runner.test.ts` |

**integration: daemon-ctl-source.test.ts: daemon-ctl.sh update with --repo-url and --branch points origin at the URL, switches to the branch and fast-forwards, and refuses a dirty tree and local-only commits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | daemon-ctl-source.test.ts: daemon-ctl.sh update with --repo-url and --branch points origin at the URL, switches to the branch and fast-forwards, and refuses a dirty tree and local-only commits | `src/daemon/__tests__/daemon-ctl-source.test.ts` |

**integration: maintenance-source.test.ts: the CLI update applies the configured repo URL and branch the same way, and opts.branch wins over the config**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | maintenance-source.test.ts: the CLI update applies the configured repo URL and branch the same way, and opts.branch wins over the config | `src/cli/__tests__/maintenance-source.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/maintenance-source.test.ts` | 0 | 1 | 5.3 s |  |
| `src/daemon/__tests__/daemon-ctl-source.test.ts` | 0 | 1 | 4.6 s |  |
| `src/daemon/__tests__/update-runner.test.ts` | 0 | 10 | 3 s |  |
| `src/shared/__tests__/update-source.test.ts` | 0 | 1 | 2.6 s |  |
