<!-- insrc:artifact TESTS-ce99b72065d03b1b-s4 -->

# Tests: ce99b72065d03b1b s4

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 28 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

## t1

Run at 2026-10-26T08:27:02.827Z on commit `08b22f82e`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-registry.test.ts: the exported profileProblem returns undefined for a valid profile and a reason for each invalid shape the reader skips**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: the exported profileProblem returns undefined for a valid profile and a reason for each invalid shape the reader skips | `src/daemon/__tests__/model-registry.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/model-registry.test.ts` | 0 | 7 | 0.6 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 10.9 s |  |

## t2

Run at 2026-10-26T08:28:47.353Z on commit `11d7d4a0e`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-check.test.ts: Codex check — efforts from `debug models`, ultra rejected despite a successful run, unlisted model rejects every effort, no inputLimit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: Codex check — efforts from `debug models`, ultra rejected despite a successful run, unlisted model rejects every effort, no inputLimit | `src/daemon/__tests__/model-check.test.ts` |

**unit: model-check.test.ts: unreachable vs refusing (Codex) — ENOENT and timeout give 'could not be reached', turn.failed gives 'refused the model'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: unreachable vs refusing (Codex) — ENOENT and timeout give 'could not be reached', turn.failed gives 'refused the model' | `src/daemon/__tests__/model-check.test.ts` |

**unit: model-check.test.ts: run protocol (Codex) — probe prompt on stdin, temp cwd; no turn.completed or nonzero exit without refusal give 'gave unreadable output'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: run protocol (Codex) — probe prompt on stdin, temp cwd; no turn.completed or nonzero exit without refusal give 'gave unreadable output' | `src/daemon/__tests__/model-check.test.ts` |

**unit: model-check.test.ts: one at a time — concurrent checks never overlap CLI children; a failing first check does not stop the second**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: one at a time — concurrent checks never overlap CLI children; a failing first check does not stop the second | `src/daemon/__tests__/model-check.test.ts` |

**unit: model-check.test.ts: invalid params refused with no CLI call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: invalid params refused with no CLI call | `src/daemon/__tests__/model-check.test.ts` |

**unit: model-check.test.ts: unreadable `codex debug models` with a successful run gives runs:true and every effort rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: unreadable `codex debug models` with a successful run gives runs:true and every effort rejected | `src/daemon/__tests__/model-check.test.ts` |

**unit: model-check.test.ts: ModelCheckResult carries exactly the sc4 fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: ModelCheckResult carries exactly the sc4 fields | `src/daemon/__tests__/model-check.test.ts` |
| pass | model-literal-scan.test.ts: the scan passes on the tree and fails on an injected literal; exclusions name their owning Story | `src/daemon/__tests__/model-literal-scan.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/model-check.test.ts` | 0 | 14 | 9.8 s |  |
| `src/daemon/__tests__/model-literal-scan.test.ts` | 0 | 1 | 1.4 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 10.4 s |  |

## t3

Run at 2026-10-26T08:41:35.439Z on commit `303dbae66`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-check.test.ts: Claude check — recognised-unconfirmed / rejected, never accepted; inputLimit from modelUsage including the alias-vs-canonical key and ambiguous cases**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: Claude check — recognised-unconfirmed / rejected, never accepted; inputLimit from modelUsage including the alias-vs-canonical key and ambiguous cases | `src/daemon/__tests__/model-check.test.ts` |
| pass | model-literal-scan.test.ts: the scan passes on the tree and fails on an injected literal; exclusions name their owning Story | `src/daemon/__tests__/model-literal-scan.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**unit: model-check.test.ts: run protocol (Claude) — is_error with exit 1 refuses; subtype error_max_turns and exit 1 with a success envelope give 'gave unreadable output'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: run protocol (Claude) — is_error with exit 1 refuses; subtype error_max_turns and exit 1 with a success envelope give 'gave unreadable output' | `src/daemon/__tests__/model-check.test.ts` |

**unit: model-check.test.ts: unreadable `claude --help` with a successful run gives runs:true and every effort rejected**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: unreadable `claude --help` with a successful run gives runs:true and every effort rejected | `src/daemon/__tests__/model-check.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/model-check.test.ts` | 0 | 14 | 10 s |  |
| `src/daemon/__tests__/model-literal-scan.test.ts` | 0 | 1 | 1.5 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 10.7 s |  |

## t4

Run at 2026-10-26T08:31:35.717Z on commit `751ef949f`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-check.test.ts: decisions — guards, approved/rejected profiles, consumed and evicted checks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: decisions — guards, approved/rejected profiles, consumed and evicted checks | `src/daemon/__tests__/model-check.test.ts` |

**unit: model-check.test.ts: store write — created, appended verbatim, write-failed for malformed / versionless / string / version-2 stores and a failing rename**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: store write — created, appended verbatim, write-failed for malformed / versionless / string / version-2 stores and a failing rename | `src/daemon/__tests__/model-check.test.ts` |

**unit: model-check.test.ts: after unreadable effort discovery approve with an effort is invalid-efforts and approve with [] succeeds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: after unreadable effort discovery approve with an effort is invalid-efforts and approve with [] succeeds | `src/daemon/__tests__/model-check.test.ts` |

**unit: model-check.test.ts: DecisionResult shapes; each written profile passes profileProblem and reads back through buildModelRegistry and getModelRegistry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: DecisionResult shapes; each written profile passes profileProblem and reads back through buildModelRegistry and getModelRegistry | `src/daemon/__tests__/model-check.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/model-check.test.ts` | 0 | 14 | 9.9 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 10.6 s |  |

## t6

Run at 2026-10-26T08:38:50.539Z on commit `17bfd35c3`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: models-daemon-s4.test.ts: models.check leaves the store and config.json unchanged and the model is not served before approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | models-daemon-s4.test.ts: check, approve and reject through a real daemon; after restarts the approved model is served with its approved efforts, the rejected one refused, and an unreachable CLI cannot be approved | `src/daemon/__tests__/models-daemon-s4.test.ts` |

**integration: models-daemon-s4.test.ts: approve → restart → user-approved in models.definitions and config.write accepts → second restart → resolveRole keeps the approved effort and drops the unapproved one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | models-daemon-s4.test.ts: check, approve and reject through a real daemon; after restarts the approved model is served with its approved efforts, the rejected one refused, and an unreachable CLI cannot be approved | `src/daemon/__tests__/models-daemon-s4.test.ts` |

**integration: models-daemon-s4.test.ts: reject → restart → rejectedModels and config.write refuses; an absent CLI's check cannot be approved**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | models-daemon-s4.test.ts: check, approve and reject through a real daemon; after restarts the approved model is served with its approved efforts, the rejected one refused, and an unreachable CLI cannot be approved | `src/daemon/__tests__/models-daemon-s4.test.ts` |

**live: model-check.live.test.ts: isolated fixture validated and unserved; real codex and claude checks**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S004/evidence/model-check-live.txt (INSRC_LIVE_TESTS=1 run 2026-10-26T08:38Z, codex-cli 0.164.0, Claude Code 2.1.310; line 185 ✔)

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/models-daemon-s4.test.ts` | 0 | 1 | 8.2 s |  |

## t5

Run at 2026-10-26T08:40:14.525Z on commit `303dbae66`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: handler-runtime.test.ts: RECORDED_RPC includes models.check, models.approve, models.reject; method-class classifies them as session**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | handler-runtime.test.ts: RECORDED_RPC includes models.check, models.approve, models.reject; method-class classifies them as session | `src/daemon/__tests__/handler-runtime.test.ts` |
| pass | the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets | `src/daemon/__tests__/handler-runtime.test.ts` |
| pass | coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry | `src/daemon/threads/__tests__/method-class.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 2 | 0.8 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 10.7 s |  |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 3 | 1.1 s |  |
