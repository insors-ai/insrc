<!-- insrc:artifact TESTS-34798d209cf97413-S001 -->

# Tests: 34798d209cf97413 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 133 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t8

Run at 2026-10-27T08:48:00.264Z on commit `deedc5f2c`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-LARGE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-LARGE: S003-sized complete evidence plans bounded primary calls with every span covered | `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` |

**integration: DIFF-FACTORY-LIMIT**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-FACTORY-LIMIT: all five model and two deterministic factories share the provider cap through preparation and dispatch | `src/workflow/review-pipeline/__tests__/prepared-dimensions.test.ts` |

**integration: DIFF-FITS-ONE-CALL**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-FITS-ONE-CALL: fragmented quality still validates notes and gathers the parent when all input fits one primary call | `src/workflow/review-pipeline/__tests__/diff-parent-quality.test.ts` |

**integration: DIFF-TIME-PLAN**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-TIME-PLAN: the runner prepares all effective dimensions before execution and uses the identical prepared jobs | `src/workflow/review-pipeline/__tests__/prepared-dimensions.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` | 0 | 6 | 1.1 s |  |
| `src/workflow/review-pipeline/__tests__/diff-parent-quality.test.ts` | 0 | 3 | 0.6 s |  |
| `src/workflow/review-pipeline/__tests__/prepared-dimensions.test.ts` | 0 | 2 | 0.5 s |  |

## t9

Run at 2026-10-27T08:55:25.019Z on commit `a1a58f0cf`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-TIME-PLAN**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-TIME-PLAN: real primary plans freeze 1/5/20 chunk budgets and aggregate five model dimensions with deterministic zero counts | `src/workflow/review-pipeline/__tests__/diff-timing.test.ts` |
| pass | DIFF-TIME-PLAN: preparation elapsed time is charged before execution and can exhaust the derived root budget without a model call | `src/workflow/review-pipeline/__tests__/diff-timing.test.ts` |

**integration: DIFF-TIME-FIXED**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-TIME-FIXED: serial children activate on execution and retain their original deadlines through corrections, redivision and gather | `src/workflow/review-pipeline/__tests__/diff-timing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/diff-timing.test.ts` | 0 | 3 | 0.5 s |  |

## t10

Run at 2026-10-27T09:07:38.086Z on commit `140b1b920`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-REPAIR**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-REPAIR: an oversized correction fails explicitly instead of being silently omitted | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**integration: DIFF-TIME-FIXED**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-TIME-FIXED: serial children activate on execution and retain their original deadlines through corrections, redivision and gather | `src/workflow/review-pipeline/__tests__/diff-timing.test.ts` |

**integration: DIFF-REFUSAL-SPAN**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-REFUSAL-SPAN: singleton refusal restarts only the dimension with lossless descendant ownership and fixed initial time | `src/workflow/review-pipeline/__tests__/diff-refusal.test.ts` |
| pass | DIFF-REFUSAL-SPAN: an initially single-call dimension with empty carries rebuilds complete diff evidence after a lower refusal | `src/workflow/review-pipeline/__tests__/diff-refusal.test.ts` |
| pass | DIFF-REFUSAL-SPAN: repeated irreducible refusals and time exhausted during replacement fail without a dimension result | `src/workflow/review-pipeline/__tests__/diff-refusal.test.ts` |
| pass | DIFF-REFUSAL-SPAN: unfragmented text singleton is splittable after a lower refusal and retains original parent attribution | `src/workflow/review-pipeline/__tests__/diff-refusal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/review-pipeline/__tests__/diff-refusal.test.ts` | 0 | 4 | 0.8 s |  |
| `src/workflow/review-pipeline/__tests__/diff-timing.test.ts` | 0 | 3 | 0.5 s |  |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 28 | 0.7 s |  |

## t11

Run at 2026-10-27T09:13:13.967Z on commit `7f3c1889b`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-BUDGET**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-BUDGET: the actual schema changes planning and every issued call includes it in its budget | `src/workflow/review-pipeline/__tests__/complete-input.test.ts` |

**integration: DIFF-REPAIR**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-REPAIR: an oversized correction fails explicitly instead of being silently omitted | `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` |

**integration: DIFF-ADMISSION**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-ADMISSION: isolated pipeline calls require enforcement and forward the authoritative job cap | `src/agent/providers/__tests__/bounded-input.test.ts` |
| pass | DIFF-FACTORY-LIMIT: all five model and two deterministic factories share the provider cap through preparation and dispatch | `src/workflow/review-pipeline/__tests__/prepared-dimensions.test.ts` |

**integration: DIFF-LARGE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-LARGE: S003-sized complete evidence plans bounded primary calls with every span covered | `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` |

**integration: DIFF-TIME-FIXED**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-TIME-FIXED: structured and session dispatch use remaining time and reject a late valid answer before completion | `src/workflow/review-pipeline/__tests__/timed-dispatch.test.ts` |
| pass | DIFF-TIME-FIXED: deterministic boundaries reject an output that finishes after the fixed deadline | `src/workflow/review-pipeline/__tests__/timed-dispatch.test.ts` |
| pass | DIFF-TIME-FIXED: timeout and explicit cancellation await the owned process close before reporting terminal failure | `src/workflow/review-pipeline/__tests__/timed-dispatch.test.ts` |
| pass | DIFF-TIME-FIXED: the final publication boundary refuses an expired root before any CR write | `src/workflow/review-pipeline/__tests__/timed-dispatch.test.ts` |

**integration: DIFF-TIME-OUTER**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-TIME-OUTER: healthy serial structured and session jobs can exceed four hours under their derived budget | `src/workflow/review-pipeline/__tests__/timed-dispatch.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/bounded-input.test.ts` | 0 | 4 | 3.8 s |  |
| `src/workflow/review-pipeline/__tests__/complete-input.test.ts` | 0 | 2 | 0.6 s |  |
| `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` | 0 | 6 | 1.1 s |  |
| `src/workflow/review-pipeline/__tests__/pipeline-job.test.ts` | 0 | 28 | 0.7 s |  |
| `src/workflow/review-pipeline/__tests__/prepared-dimensions.test.ts` | 0 | 2 | 0.5 s |  |
| `src/workflow/review-pipeline/__tests__/timed-dispatch.test.ts` | 0 | 5 | 0.8 s |  |

## t12

Run at 2026-10-27T09:26:58.551Z on commit `6f8ca43e4`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-FINGERPRINT-SNAPSHOT**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-FINGERPRINT-SNAPSHOT: consistent source, scoped diff, author and contracts bind the actual resolved review evidence | `src/workflow/code-review/__tests__/input-fingerprint.test.ts` |
| pass | DIFF-FINGERPRINT-SNAPSHOT: exact BUILD approval exclusions preserve identity while semantic fields and capture races fail closed | `src/workflow/code-review/__tests__/input-fingerprint.test.ts` |

**integration: DIFF-IDENTITY-TESTS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-IDENTITY-TESTS: complete ordered TESTS content, ranAt, malformed states, reports and absence each affect identity | `src/workflow/code-review/__tests__/input-fingerprint.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/code-review/__tests__/input-fingerprint.test.ts` | 0 | 3 | 7.1 s |  |

## t13

Run at 2026-10-27T09:35:11.544Z on commit `f95fb9657`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-APPROVE-IDENTITY**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-APPROVE-IDENTITY: approval metadata and no-op completion stay stable while normal validate persistence still refreshes semantic time | `src/workflow/runners/build/__tests__/completion-identity.test.ts` |

**integration: DIFF-COMPLETION-NOOP**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-COMPLETION-NOOP: real completion preserves BUILD bytes, file identities, provenance order/version/author and TESTS ranAt | `src/workflow/runners/build/__tests__/completion-identity.test.ts` |

**integration: DIFF-COMPLETION-CHANGE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-COMPLETION-CHANGE: new commits/files and changed tasks persist; unchanged per-file provenance survives the new Story revision | `src/workflow/runners/build/__tests__/completion-identity.test.ts` |
| pass | DIFF-COMPLETION-CHANGE: a malformed prior takes the fresh-record path and cannot retain the previous fingerprint | `src/workflow/runners/build/__tests__/completion-identity.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/runners/build/__tests__/completion-identity.test.ts` | 0 | 4 | 3.7 s |  |

## t14

Run at 2026-10-27T09:56:20.732Z on commit `161256f3b`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-PUBLISH-SOURCE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-PUBLISH-SOURCE: real daemon hooks reject source, HEAD and contract changes during review without a second start or CR overwrite | `src/daemon/__tests__/code-review-publication.test.ts` |
| pass | DIFF-PUBLISH-SOURCE: post-publication mutation reports no accepted completion and leaves an explicitly stale fingerprinted record | `src/daemon/__tests__/code-review-publication.test.ts` |
| pass | DIFF-PUBLISH-SOURCE: hollow graph fallback cannot silently admit source edited during the first grounding read | `src/daemon/__tests__/code-review-publication.test.ts` |

**integration: DIFF-PUBLISH-BUILD**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-PUBLISH-BUILD: rebuild and author replacement prevent publication; unchanged source records carry current fingerprint metadata | `src/daemon/__tests__/code-review-publication.test.ts` |
| pass | DIFF-PUBLISH-BUILD: real controller continuation rejects source, BUILD, TESTS and author changes against admitted identity | `src/daemon/__tests__/code-review-publication.test.ts` |
| pass | DIFF-PUBLISH-BUILD: ownership excludes a competing publisher and required hook admission fails before grounding or models | `src/daemon/__tests__/code-review-publication.test.ts` |
| pass | DIFF-PUBLISH-BUILD: RPC rechecks identity after the runner returns before sending its terminal result | `src/daemon/__tests__/code-review-publication.test.ts` |
| pass | DIFF-PUBLISH-BUILD: completion cannot erase a known legacy BUILD author to bypass independent review | `src/daemon/__tests__/code-review-publication.test.ts` |

**integration: DIFF-IDENTITY-TESTS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-IDENTITY-TESTS: a TESTS-only update during the actual daemon review prevents a new CR | `src/daemon/__tests__/code-review-publication.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/code-review-publication.test.ts` | 0 | 9 | 16.1 s |  |

## t15

Run at 2026-10-27T10:15:13.904Z on commit `e92c06614`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-TIME-OUTER**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-TIME-OUTER: a healthy operation exceeds four hours, polls add no time, and root/idle deadlines remain terminal | `src/daemon/__tests__/code-review-operations.test.ts` |

**integration: DIFF-WAIT-RESUME**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-WAIT-RESUME: repeated starts and bounded detached waiters share one execution and one immutable cached result | `src/daemon/__tests__/code-review-operations.test.ts` |
| pass | DIFF-WAIT-RESUME: explicit cancel and daemon close abort and await owner settlement; restart never accepts an old handle | `src/daemon/__tests__/code-review-operations.test.ts` |
| pass | DIFF-WAIT-RESUME: cached completion is not proof of fresh inputs and timing cannot be extended by progress | `src/daemon/__tests__/code-review-operations.test.ts` |
| pass | DIFF-WAIT-RESUME: real operation RPC returns pending, detaches a request abort, joins starts and caches one final CR | `src/daemon/__tests__/code-review-control.test.ts` |
| pass | DIFF-WAIT-RESUME: real operation RPC conflicts on changed source and explicit cancellation stops the owner without a CR | `src/daemon/__tests__/code-review-control.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/code-review-control.test.ts` | 0 | 2 | 4.1 s |  |
| `src/daemon/__tests__/code-review-operations.test.ts` | 0 | 4 | 0.5 s |  |

## t16

Run at 2026-10-27T10:47:29.400Z on commit `cf0cad096`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-TIME-OUTER**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-TIME-OUTER: both transport waiters cap at 200 seconds without killing the daemon owner, and preserve long derived budgets | `src/shared/__tests__/code-review-control.test.ts` |

**integration: DIFF-WAIT-COMPAT**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-WAIT-COMPAT: legacy streams remain final-only and retain their existing final result shape | `src/shared/__tests__/code-review-control.test.ts` |

**integration: DIFF-WAIT-TRANSPORT**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-WAIT-TRANSPORT: shared serializer and both actual transports preserve start/status/cancel and discriminate every reply | `src/shared/__tests__/code-review-control.test.ts` |
| pass | DIFF-WAIT-TRANSPORT: pending artifacts, malformed/foreign finals and unknown variants are refused by socket and in-daemon helpers | `src/shared/__tests__/code-review-control.test.ts` |
| pass | DIFF-WAIT-TRANSPORT: repository checks accept physical aliases and reject a different repository with otherwise matching identity | `src/shared/__tests__/code-review-control.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/code-review-control.test.ts` | 0 | 5 | 0.6 s |  |

## t17

Run at 2026-10-27T10:59:04.235Z on commit `bd62205c3`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-WAIT-RESUME**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-WAIT-RESUME: pending turns join one owner beyond300s, retain the same state/deadline and consume exactly one final review | `src/daemon/steps/code-review-step/__tests__/pending-review.test.ts` |
| pass | DIFF-WAIT-RESUME: lifecycle pin survives initial planning, over1h idle clients and LRU pressure then terminal grace expires without polling | `src/daemon/steps/code-review-step/__tests__/pending-review.test.ts` |
| pass | DIFF-WAIT-RESUME: transient waiter failures keep the same token; foreign target, daemon loss never claim a CR | `src/daemon/steps/code-review-step/__tests__/pending-review.test.ts` |
| pass | DIFF-WAIT-RESUME: malformed final or a changed daemon epoch is rejected before consuming a pending result | `src/daemon/steps/code-review-step/__tests__/pending-review.test.ts` |
| pass | DIFF-WAIT-RESUME: shared and hub leases protect all active entries from TTL/LRU and expire at a fixed terminal deadline | `src/daemon/threads/__tests__/step-state.test.ts` |
| pass | DIFF-WAIT-RESUME: a repository alias attaches its pending token to the canonical owner and resumes through either path | `src/daemon/steps/code-review-step/__tests__/pending-review.test.ts` |

**integration: DIFF-WAIT-COMPAT**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-WAIT-COMPAT: freshness decline starts a degraded review while pending decline explicitly cancels owned work | `src/daemon/steps/code-review-step/__tests__/pending-review.test.ts` |
| pass | DIFF-WAIT-COMPAT: legacy streams remain final-only and retain their existing final result shape | `src/shared/__tests__/code-review-control.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/code-review-step/__tests__/pending-review.test.ts` | 0 | 6 | 0.5 s |  |
| `src/daemon/threads/__tests__/step-state.test.ts` | 0 | 4 | 0.8 s |  |
| `src/shared/__tests__/code-review-control.test.ts` | 0 | 5 | 0.6 s |  |

## t18

Run at 2026-10-27T11:30:05.856Z on commit `91496c91d`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-CONTROLLER-LARGE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-CONTROLLER-LARGE: oversized daemon-authored diff emits one complete bounded task per turn, covers every original span and folds only controller results | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` |
| pass | DIFF-CONTROLLER-LARGE: admitted freshness-timeout and hollow-graph routes persist exact fallback evidence; unreadable diff fails before any task | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` |

**integration: DIFF-CONTROLLER-VALIDATE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-CONTROLLER-VALIDATE: aggregate, mixed, foreign and conflicting replay results cannot advance; accepted replay is atomic and cached | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` |
| pass | DIFF-CONTROLLER-VALIDATE: unverified flags fail before diff evidence and legacy degraded states require restart | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` |
| pass | DIFF-CONTROLLER-VALIDATE: invalid envelopes use the real correction limit and cannot be retried indefinitely | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` |
| pass | DIFF-CONTROLLER-VALIDATE: singleton size refusal rebuilds descendant material while original primary count and deadline stay fixed | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` |
| pass | DIFF-CONTROLLER-VALIDATE: shared hub compare-and-replace admits one expected state revision without rotating its token | `src/daemon/threads/__tests__/step-state.test.ts` |
| pass | DIFF-CONTROLLER-VALIDATE: two real workers submitting the same final answer publish once and both receive the cached continuation | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` |

**integration: DIFF-CONTROLLER-TIME**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-CONTROLLER-TIME: status and delayed answers cannot renew per-call/root deadlines; cancellation revokes calls | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` |
| pass | DIFF-CONTROLLER-TIME: serial child clocks and final fold preserve a total budget beyond ten minutes | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` |

**integration: DIFF-IDENTITY-TESTS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-IDENTITY-TESTS: TESTS-only/source/author changes at controller continuation invalidate the exact admitted snapshot | `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/steps/code-review-step/__tests__/controller-pipeline.test.ts` | 0 | 10 | 39.9 s |  |
| `src/daemon/threads/__tests__/step-state.test.ts` | 0 | 5 | 0.9 s |  |

## t19

Run at 2026-10-27T13:23:40.321Z on commit `5231da536`. Tests check: **passed**. 10 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-CONTROLLER-LARGE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-CONTROLLER-LARGE: actual helper dispatches complete explicit task metadata/schema through fresh isolated CLI/OAuth boundary | `src/mcp/__tests__/controller-review.test.ts` |
| pass | DIFF-CONTROLLER-LARGE: duplicated normalized schema and task framing are measured before actual CLI dispatch and reported as a lower size refusal | `src/mcp/__tests__/controller-review.test.ts` |
| pass | DIFF-CONTROLLER-LARGE: actual helper and daemon pipeline complete a daemon-authored git Story through isolated CLI calls only | `src/mcp/__tests__/controller-review.test.ts` |

**integration: DIFF-CONTROLLER-TIME**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-CONTROLLER-TIME: pending helper turns rejoin one actual subprocess and explicit cancellation waits for its shutdown | `src/mcp/__tests__/controller-review.test.ts` |
| pass | DIFF-CONTROLLER-TIME: expiry kills owned CLI work and refuses late structured output | `src/mcp/__tests__/controller-review.test.ts` |
| pass | DIFF-CONTROLLER-TIME: serial helper handoff starts the next identified call once without returning evidence into chat | `src/mcp/__tests__/controller-review.test.ts` |
| pass | DIFF-CONTROLLER-TIME: queued calls remain serial and cancellation does not wait for an unrelated subprocess | `src/mcp/__tests__/controller-review.test.ts` |
| pass | DIFF-CONTROLLER-TIME: overlapping result handoffs join one next-call owner and never dispatch its cached continuation twice | `src/mcp/__tests__/controller-review.test.ts` |

**integration: DIFF-CONTROLLER-ADMISSION**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-CONTROLLER-ADMISSION: self-declared flags, forged descriptors, missing CLI isolation and unsupported Codex fail before evidence or model dispatch | `src/mcp/__tests__/controller-review.test.ts` |
| pass | DIFF-CONTROLLER-ADMISSION: actual socket forwarder separates verified helper capability from arguments and host rechecks the installed CLI | `src/mcp/__tests__/controller-review.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/mcp/__tests__/controller-review.test.ts` | 0 | 10 | 11.7 s |  |

## t20

Run at 2026-10-27T13:55:42.003Z on commit `e777060ff`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-PUBLISH-GATE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-PUBLISH-GATE: stale review is a distinct non-overridable outcome with reason and no fabricated findings/counts | `src/workflow/__tests__/build-review-freshness.test.ts` |

**integration: DIFF-APPROVE-COMMON**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-APPROVE-COMMON: direct approval and reapproval preserve reviewed identity while stale source/BUILD/TESTS cannot be overridden | `src/workflow/__tests__/build-review-freshness.test.ts` |

**integration: DIFF-APPROVE-WORKFLOW**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-APPROVE-WORKFLOW: single and batch approval project stale identity and leave fresh siblings approvable with no completion side effects | `src/workflow/__tests__/build-review-freshness.test.ts` |

**integration: DIFF-APPROVE-TUI**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-APPROVE-TUI: the actual TUI service rejects stale identity before tracker/commit work even with override | `src/workflow/__tests__/build-review-freshness.test.ts` |

**integration: DIFF-APPROVE-IDENTITY**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-APPROVE-IDENTITY: invalid/partial/unsupported/unreadable identities fail closed while genuinely unrecorded fingerprint fields remain explicitly legacy | `src/workflow/__tests__/build-review-freshness.test.ts` |
| pass | DIFF-APPROVE-IDENTITY: canonical BUILD path, metadata, repository and independent author must agree; file aliases cannot bypass checks | `src/workflow/__tests__/build-review-freshness.test.ts` |

**integration: DIFF-APPROVE-RACE**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-APPROVE-RACE: prewrite changes stamp nothing; postwrite TESTS/source changes roll back only this approval metadata and preserve foreign BUILD edits | `src/workflow/__tests__/build-review-freshness.test.ts` |
| pass | DIFF-APPROVE-RACE: framework BUILD writers share synchronous ownership and cannot overwrite a concurrent approval transaction | `src/workflow/__tests__/build-review-freshness.test.ts` |

**integration: DIFF-APPROVE-TESTS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-APPROVE-TESTS: TESTS appearance, disappearance, malformed replacement, result ordering and ranAt-only changes invalidate approval independently of BUILD/source | `src/workflow/__tests__/build-review-freshness.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/workflow/__tests__/build-review-freshness.test.ts` | 0 | 9 | 17 s |  |

## t21

Run at 2026-10-27T14:03:49.041Z on commit `87a1d6675`. Tests check: **passed**. 15 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: DIFF-COMPAT**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | DIFF-COMPAT: rejected continuation requests preserve the active isolated call and exact result retry without a second subprocess | `src/mcp/__tests__/controller-review.test.ts` |
| pass | DIFF-COMPAT: workflow approval relays stale-review and its reason without inventing approval or finding totals | `src/mcp/__tests__/workflow-approve-dispatch.test.ts` |
| pass | sections, documents, config, types, interfaces and every entity of a test file are not coverage-eligible; functions, methods and classes in source files are | `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` |
| pass | every judge slot receives the run's groundingMode and the non-coverage judges see every symbol | `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` |
| pass | an under-limit code review makes today's calls per dimension, with the repo as cwd, and gives today's findings and verdict, diagram and ux included | `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` |
| pass | a divided review and the same material in one call under a raised limit give the same obligation verdicts for every dimension, on fixtures that fit both ways | `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts` |
| pass | a caller and callee in different chunks whose contract disagrees are judged in a relation call and the mismatch is reported at the caller | `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts` |
| pass | two duplicate symbols in different chunks are named by compare and reported by pair with counterpartRef | `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts` |
| pass | a degraded review whose single call is over the limit is divided with zero atoms and judges every promised test at gather on its full record evidence | `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts` |
| pass | a gather call failing twice fails the review and records nothing | `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts` |
| pass | DIFF-TIME-FIXED: timeout and explicit cancellation await the owned process close before reporting terminal failure | `src/workflow/review-pipeline/__tests__/timed-dispatch.test.ts` |
| pass | DIFF-LOW-CAP: actual quality framing and schema fit below a 16384-character staging span | `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` |
| pass | a chunk answer with an unknown key, an atom outside its call's carries, or a coverage finding that is not symbol coverage of a carried symbol is rejected and re-issued with a correction note | `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | MCP tool surface: the thirteen tools keep their names, descriptions and input schemas | `src/mcp/__tests__/forward-step.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 11.1 s |  |
| `src/mcp/__tests__/controller-review.test.ts` | 0 | 11 | 13 s |  |
| `src/mcp/__tests__/forward-step.test.ts` | 0 | 6 | 1 s |  |
| `src/mcp/__tests__/workflow-approve-dispatch.test.ts` | 0 | 5 | 0.6 s |  |
| `src/workflow/code-review/__tests__/grounding-eligibility.test.ts` | 0 | 2 | 0.6 s |  |
| `src/workflow/review-pipeline/__tests__/code-review-divided.test.ts` | 0 | 5 | 0.6 s |  |
| `src/workflow/review-pipeline/__tests__/code-review-gather.test.ts` | 0 | 22 | 0.8 s |  |
| `src/workflow/review-pipeline/__tests__/diff-material-fit.test.ts` | 0 | 6 | 1.1 s |  |
| `src/workflow/review-pipeline/__tests__/single-chunk-parity.test.ts` | 0 | 7 | 0.6 s |  |
| `src/workflow/review-pipeline/__tests__/timed-dispatch.test.ts` | 0 | 5 | 0.8 s |  |
