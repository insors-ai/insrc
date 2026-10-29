<!-- insrc:artifact TESTS-484fcef7efaf229e-s5 -->

# Tests: 484fcef7efaf229e s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 39 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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

## t11

Run at 2026-10-29T16:42:41.556Z on commit `7faf99e13`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: CM-S5-FORM-KT: Kotlin descriptor/credential serialization and dirty navigation parity without Settings persistence**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-FORM-KT: Kotlin descriptor/credential serialization and dirty navigation parity without Settings persistence | `src/shared/__tests__/connection-manager-kotlin-draft.test.ts` |
| pass | CM-S5-FORM-KT: shared public fields require strict UTF8 percent decoding in both clients | `src/shared/__tests__/connection-manager-kotlin-draft.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-kotlin-draft.test.ts` | 0 | 2 | 5.1 s |  |

## t12

Run at 2026-10-29T17:07:13.552Z on commit `710d847c1`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S5-OUTCOME-TS: immutable signed attempts, lost-reply same-ticket status/replay, expiry and independent activation/refresh recovery**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-OUTCOME-TS: immutable signed attempts, lost-reply same-ticket status/replay, expiry and independent activation/refresh recovery | `vscode-plugin/src/connections/__tests__/mutation.test.ts` |
| pass | CM-S5-OUTCOME-TS: not-seen requires explicit byte-identical same-ticket replay and expiry blocks all fresh mutation | `vscode-plugin/src/connections/__tests__/mutation.test.ts` |
| pass | CM-S5-OUTCOME-TS: pending polling is bounded and malformed committed replies reconcile without another create | `vscode-plugin/src/connections/__tests__/mutation.test.ts` |
| pass | CM-S5-OUTCOME-TS: activation cleanup and read retries preserve committed revision and never repeat mutation | `vscode-plugin/src/connections/__tests__/mutation.test.ts` |
| pass | CM-S5-OUTCOME-TS: temporary expiry erases attempts while saved unknowns survive view close and owner resume | `vscode-plugin/src/connections/__tests__/mutation.test.ts` |
| pass | CM-S5-OUTCOME-TS: resource limits refuse before ticket and never evict an unknown operation | `vscode-plugin/src/connections/__tests__/mutation.test.ts` |
| pass | CM-S5-OUTCOME-TS: malformed ticket correlation fails before mutation and draft remains editable | `vscode-plugin/src/connections/__tests__/mutation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/connections/__tests__/mutation.test.ts` | 0 | 7 | 3 s |  |

## t13

Run at 2026-10-29T17:28:25.111Z on commit `b91a36215`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S5-OUTCOME-KT: project-memory unknown-operation retention and scope-lane recovery with no repeated create**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-OUTCOME-KT: project-memory unknown-operation retention and scope-lane recovery with no repeated create | `src/shared/__tests__/connection-manager-kotlin-mutation.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-kotlin-mutation.test.ts` | 0 | 1 | 17.2 s |  |

## t14

Run at 2026-10-29T17:40:57.921Z on commit `fac5f6b05`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S5-TEST-TS: identical Test/Save input, optional Test, repeated clicks, exact stale-result identity and cancel/drain behavior**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-TEST-TS: identical Test/Save input, optional Test, repeated clicks, exact stale-result identity and cancel/drain behavior | `vscode-plugin/src/connections/__tests__/draft-test.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/connections/__tests__/draft-test.test.ts` | 0 | 2 | 13.9 s |  |

## t15

Run at 2026-10-29T17:49:55.782Z on commit `be1ff5aed`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S5-TEST-KT: Kotlin test identity/cancel parity, disposed-view and EDT delivery guards**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-TEST-KT: Kotlin test identity/cancel parity, disposed-view and EDT delivery guards | `src/shared/__tests__/connection-manager-kotlin-test.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-kotlin-test.test.ts` | 0 | 1 | 4.4 s |  |

## t16

Run at 2026-10-29T17:59:31.949Z on commit `6f78b8de2`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S5-REMOVE-TS: exact selection confirmation, zero-effect Cancel, busy/conflict/unknown and independent ticket-only cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-REMOVE-TS: exact selection confirmation, zero-effect Cancel, busy/conflict/unknown and independent ticket-only cleanup | `vscode-plugin/src/connections/__tests__/removal.test.ts` |
| pass | CM-S5-REMOVE-TS: independent original-ticket cleanup survives same-ID recreation without touching its source | `vscode-plugin/src/connections/__tests__/removal.test.ts` |
| pass | CM-S5-REMOVE-TS: all twenty unchanged sc6 consumer snapshots keep the exact confirmation and phase copy | `vscode-plugin/src/connections/__tests__/removal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/connections/__tests__/removal.test.ts` | 0 | 3 | 1.7 s |  |

## t17

Run at 2026-10-29T18:07:35.864Z on commit `8f1861afd`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: CM-S5-REMOVE-KT: S004 snapshots plus actual Kotlin effect paths preserve old-generation cleanup and source-data guarantee**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S5-REMOVE-KT: S004 snapshots plus actual Kotlin effect paths preserve old-generation cleanup and source-data guarantee | `src/shared/__tests__/connection-manager-kotlin-removal.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/connection-manager-kotlin-removal.test.ts` | 0 | 1 | 11.6 s |  |
