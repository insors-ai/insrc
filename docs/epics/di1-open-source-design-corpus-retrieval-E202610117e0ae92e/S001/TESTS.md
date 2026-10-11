<!-- insrc:artifact TESTS-7e0ae92e8f3d3c3e-s1 -->

# Tests: 7e0ae92e8f3d3c3e s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 32 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-11T16:45:20.708Z on commit `5d835fcb`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: contracts.test.ts — closed schema, version, ID/domain/UI enums and original fixture acceptance**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | closed schemas preserve original fixtures for every guidance kind | `src/design/corpus/__tests__/contracts.test.ts` |
| pass | closed schemas reject missing fields unknown nested fields and invalid enums | `src/design/corpus/__tests__/contracts.test.ts` |
| pass | evidence and manifest schemas require pinned identities without coercion | `src/design/corpus/__tests__/contracts.test.ts` |
| pass | release availability is closed and validates every lifecycle state | `src/design/corpus/__tests__/contracts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/__tests__/contracts.test.ts` | 0 | 4 | 0.5 s |  |

## t2

Run at 2026-10-11T18:59:41.977Z on commit `25749152`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: canonical.test.ts — independent byte/digest vectors and invalid JSON/limit boundaries**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | canonical golden bytes and SHA256 match independent vectors | `src/design/corpus/__tests__/canonical.test.ts` |
| pass | canonical input rejects unsafe JSON without invoking accessors | `src/design/corpus/__tests__/canonical.test.ts` |
| pass | canonical depth and byte limits fail explicitly | `src/design/corpus/__tests__/canonical.test.ts` |
| pass | canonical limits reject invalid caller configuration | `src/design/corpus/__tests__/canonical.test.ts` |

**unit: digest-chain.test.ts — content/review/release binding and ordering**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | digest chain excludes self fields and binds content and review separately | `src/design/corpus/__tests__/digest-chain.test.ts` |
| pass | candidate identity binds every non-cyclic manifest field without mutating input | `src/design/corpus/__tests__/digest-chain.test.ts` |
| pass | candidate identity is not computable for missing or duplicate coverage entries | `src/design/corpus/__tests__/digest-chain.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/__tests__/canonical.test.ts` | 0 | 4 | 0.5 s |  |
| `src/design/corpus/__tests__/digest-chain.test.ts` | 0 | 3 | 0.7 s |  |

## t3

Run at 2026-10-11T17:04:13.843Z on commit `2477a0c8`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: record-validation.test.ts — completeness, authorship, conditional payloads and platform examples**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | record completeness and platform examples fail closed | `src/design/corpus/__tests__/record-validation.test.ts` |
| pass | authorship branches preserve attribution and require justified provenance | `src/design/corpus/__tests__/record-validation.test.ts` |
| pass | conditional domain payloads compose and color references must resolve | `src/design/corpus/__tests__/record-validation.test.ts` |

**unit: record-roundtrip.test.ts — all sc1 fields preserved and review-staleness rejection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | record roundtrip preserves all fields and rejects stale incomplete or draft reviews | `src/design/corpus/__tests__/record-roundtrip.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/__tests__/record-roundtrip.test.ts` | 0 | 1 | 0.5 s |  |
| `src/design/corpus/__tests__/record-validation.test.ts` | 0 | 4 | 0.4 s |  |

## t4

Run at 2026-10-11T19:01:02.453Z on commit `cb78619d`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: manifest-validation.test.ts — in-memory exact inventory, portable paths, relations DAG and tamper cases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | manifest requires exact inventory portable paths and regular files | `src/design/corpus/__tests__/manifest-validation.test.ts` |
| pass | manifest validates exact record references and rejects duplicate self and cyclic relations | `src/design/corpus/__tests__/manifest-validation.test.ts` |
| pass | manifest detects tampering across raw record candidate review and release hashes | `src/design/corpus/__tests__/manifest-validation.test.ts` |
| pass | manifest format limits and accessor boundaries fail explicitly | `src/design/corpus/__tests__/manifest-validation.test.ts` |
| pass | manifest overrides and diagnostic pointers identify actual candidate fields | `src/design/corpus/__tests__/manifest-validation.test.ts` |
| pass | specimens cannot reference metadata records or unbound coverage bytes | `src/design/corpus/__tests__/manifest-validation.test.ts` |
| pass | coverage decode errors and Unicode-equivalent inventory paths are rejected | `src/design/corpus/__tests__/manifest-validation.test.ts` |
| pass | release validation snapshots manifest and bytes and rejects C1 controls | `src/design/corpus/__tests__/manifest-validation.test.ts` |
| pass | malformed coverage membership preserves missing and duplicate diagnostics | `src/design/corpus/__tests__/manifest-validation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/__tests__/manifest-validation.test.ts` | 0 | 9 | 0.6 s |  |

## t5

Run at 2026-10-11T19:02:20.370Z on commit `839b36d5`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: publication-check.test.ts — downstream assessment composition fails closed and preserves issue diagnostics**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | publication requires exactly one successful current assessment per downstream stage | `src/design/corpus/__tests__/publication-check.test.ts` |
| pass | publication preserves deterministic diagnostics and reports only computable manifest identity | `src/design/corpus/__tests__/publication-check.test.ts` |
| pass | role reassignment and metadata changes invalidate previously successful assessments | `src/design/corpus/__tests__/publication-check.test.ts` |
| pass | noncomputable coverage membership makes every assessment stale but preserves manifest identity | `src/design/corpus/__tests__/publication-check.test.ts` |
| pass | invalid release fallback hashes a detached manifest without live property reads | `src/design/corpus/__tests__/publication-check.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/__tests__/publication-check.test.ts` | 0 | 5 | 0.5 s |  |

## t6

Run at 2026-10-11T19:03:47.398Z on commit `4f03c64e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**smoke: module-isolation.test.ts — compiled import and valid/invalid preflight without external I/O**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | compiled corpus imports and checks valid and invalid candidates without external IO | `src/design/corpus/__tests__/module-isolation.test.ts` |

**smoke: npm run build — strict NodeNext compilation**

Reported by the builder, not run by the gate: **pass**. Evidence: /tmp/di1-digest-final-build.log: npm run build passed against commit 4f03c64e; /tmp/di1-digest-final.log: 33 corpus tests passed.

**integration: acceptance-coverage.test.ts — ac1/ac2 across record-to-manifest pipeline**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | ac1 incomplete or stale guidance cannot pass the record to manifest preflight | `src/design/corpus/__tests__/acceptance-coverage.test.ts` |
| pass | ac2 exact evidence preserves complete records and pins independently calculated digest vectors | `src/design/corpus/__tests__/acceptance-coverage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/design/corpus/__tests__/acceptance-coverage.test.ts` | 0 | 2 | 0.5 s |  |
| `src/design/corpus/__tests__/module-isolation.test.ts` | 0 | 1 | 1 s |  |
