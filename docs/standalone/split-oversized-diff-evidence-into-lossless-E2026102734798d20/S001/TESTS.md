<!-- insrc:artifact TESTS-34798d209cf97413-S001 -->

# Tests: 34798d209cf97413 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 30 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-27T07:31:29.606Z on commit `55e892c23`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-BUDGET**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-BUDGET: the actual schema changes planning and every issued call includes it in its budget | `src/workflow/review-pipeline/__tests__/complete-input.test.ts` |
| pass | DIFF-BUDGET: irreducible schema and explicit history are never omitted to fit | `src/workflow/review-pipeline/__tests__/complete-input.test.ts` |

**integration: DIFF-REPAIR**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-REPAIR: an oversized correction fails explicitly instead of being silently omitted | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/complete-input.test.ts` | 0 | 2 | 0.6 s |  |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 28 | 0.7 s |  |

## t2

Run at 2026-10-27T07:41:52.432Z on commit `bcb286d2c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-TRANSPORT**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-TRANSPORT: bounded Claude dispatch preserves explicit input and disables ambient tools/history/project context | `src/agent/providers/__tests__/bounded-input.test.ts` |
| pass | DIFF-TRANSPORT: Codex schema normalization is counted before isolation admission | `src/agent/providers/__tests__/bounded-input.test.ts` |

**integration: DIFF-ADMISSION**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-ADMISSION: unsupported CLI isolation and oversized normalized schemas make zero model calls | `src/agent/providers/__tests__/bounded-input.test.ts` |
| pass | DIFF-ADMISSION: isolated pipeline calls require enforcement and forward the authoritative job cap | `src/agent/providers/__tests__/bounded-input.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/bounded-input.test.ts` | 0 | 4 | 0.7 s |  |

## t3

Run at 2026-10-27T07:59:04.809Z on commit `bd52e723e`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-READER**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-READER: unrecoverable truncated input refuses before any grounding is returned | `src/workflow/code-review/__tests__/diff-grounding.test.ts` |
| pass | DIFF-READER: missing textual hunks refuse instead of producing a reviewed placeholder | `src/workflow/code-review/__tests__/diff-grounding.test.ts` |
| pass | T44 (integration, real git): DIFF-READER: real git recovers full file evidence after an aggregate cap and preserves exclusions | `src/workflow/code-review/__tests__/diff-grounding.test.ts` |
| pass | DIFF-READER: a real file larger than the public tool hard cap is recovered through its final byte | `src/workflow/code-review/__tests__/diff-grounding.test.ts` |
| pass | DIFF-READER: unflagged partial or header-only hunks cannot masquerade as complete evidence | `src/workflow/code-review/__tests__/diff-grounding.test.ts` |
| pass | DIFF-READER: a later complete unit cannot hide an earlier missing section for the same file | `src/workflow/code-review/__tests__/diff-grounding.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/diff-grounding.test.ts` | 0 | 29 | 2.1 s |  |

## t4

Run at 2026-10-27T08:07:02.430Z on commit `cdafce8c3`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: DIFF-SPANS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-SPANS: large text is a deterministic lossless ordered partition; small and binary rows keep legacy identity | `src/workflow/code-review/__tests__/diff-spans.test.ts` |
| pass | DIFF-SPANS: staging rows retain original file order and unique changed paths | `src/workflow/code-review/__tests__/diff-spans.test.ts` |

**unit: DIFF-COORDS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-COORDS: continuation spans preserve UTF16 diff/source coordinates and renamed-file ownership | `src/workflow/code-review/__tests__/diff-spans.test.ts` |

**unit: DIFF-INTEGRITY**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-INTEGRITY: missing, duplicated, reordered, overlapping or tampered spans/coordinates are rejected | `src/workflow/code-review/__tests__/diff-spans.test.ts` |
| pass | DIFF-INTEGRITY: a digest-preserving partition that splits a surrogate pair is invalid | `src/workflow/code-review/__tests__/diff-spans.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/diff-spans.test.ts` | 0 | 5 | 0.6 s |  |

## t5

Run at 2026-10-27T08:15:04.584Z on commit `a5390a694`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: DIFF-INTEGRITY**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-INTEGRITY: material rejects bad fragment provenance before accepting any atom | `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` |

**integration: DIFF-LARGE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-LARGE: S003-sized complete evidence plans bounded primary calls with every span covered | `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` |

**integration: DIFF-SCALE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-SCALE: sibling material links remain linear and do not fabricate graph calls | `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` |

**integration: DIFF-LOW-CAP**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-LOW-CAP: actual quality framing and schema fit below a 16384-character staging span | `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` |
| pass | DIFF-LOW-CAP: fixed framing that cannot fit refuses instead of exploding into tiny evidence | `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` |
| pass | DIFF-LOW-CAP: a small renamed file keeps its original path when fitting requires new fragments | `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` | 0 | 6 | 1 s |  |

## t6

Run at 2026-10-27T08:27:08.158Z on commit `deea66b58`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-GATHER**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-PARENT-QUALITY: bounded reduction preserves separate fragment facts for parent-only correctness judgment | `src/workflow/review-pipeline/__tests__/diff-parent-quality.test.ts` |

**integration: DIFF-PARENT-QUALITY**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-PARENT-QUALITY: missing, duplicate, foreign and mismatched fragment notes cannot complete a chunk | `src/workflow/review-pipeline/__tests__/diff-parent-quality.test.ts` |
| pass | DIFF-PARENT-QUALITY: bounded reduction preserves separate fragment facts for parent-only correctness judgment | `src/workflow/review-pipeline/__tests__/diff-parent-quality.test.ts` |

**integration: DIFF-FITS-ONE-CALL**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-FITS-ONE-CALL: fragmented quality still validates notes and gathers the parent when all input fits one primary call | `src/workflow/review-pipeline/__tests__/diff-parent-quality.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/diff-parent-quality.test.ts` | 0 | 3 | 1 s |  |

## t7

Run at 2026-10-27T08:43:16.365Z on commit `4cc01ce6c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-SCALE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-SCALE: sibling material links remain linear and do not fabricate graph calls | `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` |

**integration: DIFF-SCALE-DUPLICATES**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-SCALE-DUPLICATES: hundreds of fragments use bounded parent and cross-parent judgments without symbol pair calls | `src/workflow/review-pipeline/__tests__/diff-duplication.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/diff-duplication.test.ts` | 0 | 1 | 1.1 s |  |
| `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` | 0 | 6 | 1.1 s |  |
