<!-- insrc:artifact TESTS-484fcef7efaf229e-s5 -->

# Tests: 484fcef7efaf229e s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 23 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-29T14:41:37.350Z on commit `e4b30504f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S5-SYNC-FIXTURES: common JSON corpus version/digest, valid and malformed wire/state transcripts and live-evidence coverage index**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-SYNC-FIXTURES: common JSON corpus version/digest, valid and malformed wire/state transcripts and live-evidence coverage index | `src/shared/__tests__/connection-manager-corpus.test.ts` |
| pass | CM-S5-SYNC-FIXTURES: JUnit reads the identical packaged corpus and rejects digest/version drift | `src/shared/__tests__/connection-manager-corpus.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-corpus.test.ts` | 0 | 2 | 10.2 s |  |

## t2

Run at 2026-10-29T14:54:33.596Z on commit `3af052d7d`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S5-WIRE-TS: bounded strict TypeScript v2 reply decoding and descriptor refusal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-WIRE-TS: bounded strict TypeScript v2 reply decoding and descriptor refusal | `src/shared/__tests__/connection-manager-wire.test.ts` |
| pass | CM-S5-WIRE-TS: rejects accessor prototype symbol sparse cyclic and excessive data without invoking getters | `src/shared/__tests__/connection-manager-wire.test.ts` |
| pass | CM-S5-WIRE-TS: validates root key operation mode epoch and stale test tuple before use | `src/shared/__tests__/connection-manager-wire.test.ts` |
| pass | CM-S5-WIRE-TS: rejects private public-config values and strips untrusted error copy | `src/shared/__tests__/connection-manager-wire.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-wire.test.ts` | 0 | 4 | 1.3 s |  |

## t3

Run at 2026-10-29T15:05:48.808Z on commit `acea568cf`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S5-WIRE-KT: Kotlin v2 DTO decoding matches common corpus and preserves legacy gateway types**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-WIRE-KT: Kotlin v2 DTO decoding matches common corpus and preserves legacy gateway types | `src/shared/__tests__/connection-manager-kotlin-wire.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-kotlin-wire.test.ts` | 0 | 1 | 4.5 s |  |

## t4

Run at 2026-10-29T15:18:23.711Z on commit `55adb15a3`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S5-TRANSPORT-TS: actual persistent socket framing, multiplexing, write-outcome, overflow, timeout/cancel/close and one-shot compatibility**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-TRANSPORT-TS: actual persistent socket framing, multiplexing, write-outcome, overflow, timeout/cancel/close and one-shot compatibility | `src/shared/__tests__/ipc-lane.test.ts` |
| pass | CM-S5-TRANSPORT-TS: real late canceled reply cannot resolve another request or close a healthy lane | `src/shared/__tests__/ipc-lane.test.ts` |
| pass | CM-S5-TRANSPORT-TS: queued cancellation backpressure capacity and timeout preserve exact write truth | `src/shared/__tests__/ipc-lane.test.ts` |
| pass | CM-S5-TRANSPORT-TS: malformed duplicate unsolicited UTF8 and oversized frames reject safely | `src/shared/__tests__/ipc-lane.test.ts` |
| pass | CM-S5-TRANSPORT-TS: disconnects remote errors serialization and ID exhaustion never leak or evict unknown requests | `src/shared/__tests__/ipc-lane.test.ts` |
| pass | CM-S5-TRANSPORT-TS: aggregate byte pressure refuses before write and teardown retains no owned listeners | `src/shared/__tests__/ipc-lane.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/ipc-lane.test.ts` | 0 | 6 | 0.5 s |  |

## t5

Run at 2026-10-29T15:33:17.819Z on commit `2772bd9a4`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S5-TRANSPORT-KT: actual Kotlin socket UTF8 framing, partial writes, multiplexing, bounded limits, disposal and one-shot compatibility**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-TRANSPORT-KT: actual Kotlin socket UTF8 framing, partial writes, multiplexing, bounded limits, disposal and one-shot compatibility | `src/shared/__tests__/connection-manager-kotlin-transport.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-kotlin-transport.test.ts` | 0 | 1 | 5.7 s |  |

## t6

Run at 2026-10-29T15:38:33.421Z on commit `300eff40c`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S5-STATE-TS: all list states, full-key selection, root/view/epoch guards, counts/filters/search and committed reveal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-STATE-TS: all list states, full-key selection, root/view/epoch guards, counts/filters/search and committed reveal | `src/shared/__tests__/connection-manager-model.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-model.test.ts` | 0 | 1 | 0.4 s |  |

## t7

Run at 2026-10-29T15:42:56.912Z on commit `3fa48b8f5`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S5-STATE-KT: Kotlin sc7 model matches common state/effect transcripts without platform I/O**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-STATE-KT: Kotlin sc7 model matches common state/effect transcripts without platform I/O | `src/shared/__tests__/connection-manager-kotlin-model.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-kotlin-model.test.ts` | 0 | 1 | 4.6 s |  |

## t8

Run at 2026-10-29T15:55:42.425Z on commit `863c1cc5a`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S5-OWNER-TS: real workbench control/data/Saved lanes, heartbeat/resume/epoch, root retention and disposal**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-OWNER-TS: real workbench control/data/Saved lanes, heartbeat/resume/epoch, root retention and disposal | `vscode-plugin/src/connections/__tests__/session-owner.test.ts` |
| pass | CM-S5-OWNER-TS: exact expiry erases temporary inputs and epoch restart never resumes or replays old authority | `vscode-plugin/src/connections/__tests__/session-owner.test.ts` |
| pass | CM-S5-OWNER-TS: unavailable session features refuse without a claimed-lane Saved fallback | `vscode-plugin/src/connections/__tests__/session-owner.test.ts` |
| pass | CM-S5-OWNER-TS: disposal deadline closes only owned lanes even when end reply is lost | `vscode-plugin/src/connections/__tests__/session-owner.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/connections/__tests__/session-owner.test.ts` | 0 | 4 | 1.9 s |  |

## t9

Run at 2026-10-29T16:14:53.729Z on commit `f5819230d`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S5-OWNER-KT: actual PROJECT Disposable owner independent from APP gateway and manager views**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-OWNER-KT: actual PROJECT Disposable owner independent from APP gateway and manager views | `src/shared/__tests__/connection-manager-kotlin-owner.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-kotlin-owner.test.ts` | 0 | 1 | 4.6 s |  |

## t10

Run at 2026-10-29T16:30:27.553Z on commit `79cb1e42f`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S5-FORM-TS: every descriptor, safe credential intents, pinned/read-only edits and dirty zero-effect Cancel**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-FORM-TS: every descriptor, safe credential intents, pinned/read-only edits and dirty zero-effect Cancel | `src/shared/__tests__/connection-manager-draft.test.ts` |
| pass | CM-S5-FORM-TS: unsafe input and unknown shapes refuse without changing draft or invoking getters | `src/shared/__tests__/connection-manager-draft.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-draft.test.ts` | 0 | 2 | 0.6 s |  |
