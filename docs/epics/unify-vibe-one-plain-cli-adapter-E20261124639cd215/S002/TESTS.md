<!-- insrc:artifact TESTS-639cd2159a87aedb-s2 -->

# Tests: 639cd2159a87aedb s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-27T15:48:50.509Z on commit `24e76224e`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache | `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` | 0 | 2 | 0.4 s |  |

## t2

Run at 2026-11-27T15:54:19.794Z on commit `d8e838eea`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache | `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` |

**unit: buildArgv's read-only branch emits exactly the two connector_insrc_* flags and no approval flag**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildArgv's read-only branch emits exactly the two connector_insrc_* flags and no approval flag | `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` |

**integration: the recorded argv matching buildArgv's own values exactly except outputDir**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the recorded argv matching buildArgv's own values exactly except outputDir | `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` | 0 | 5 | 0.4 s |  |
