<!-- insrc:artifact TESTS-97adabf6bd47b036-s1 -->

# Tests: 97adabf6bd47b036 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 23 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-11-09T19:23:43.994Z on commit `e8bad42bb`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Scripted Vibe handshake, new and resumed preflight, unsupported aliases and settings read-back**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Vibe preflight verifies a new and a resumed session without starting a turn | `src/shared/__tests__/vibe-session.test.ts` |
| pass | Vibe preflight applies effort to the active catalog model when no model is explicit | `src/shared/__tests__/vibe-session.test.ts` |
| pass | Vibe preflight rejects unavailable aliases, effort, mutation and mismatched read-back | `src/shared/__tests__/vibe-session.test.ts` |
| pass | Vibe preflight releases the child on cancellation and timeout | `src/shared/__tests__/vibe-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-session.test.ts` | 0 | 7 | 2.2 s |  |

## t7

Run at 2026-11-09T19:16:00.719Z on commit `628327295`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Scripted Vibe turn acknowledgement loss, bounded events, cancellation and cleanup**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Vibe dispatch sends one verified turn and forwards matching bounded events | `src/shared/__tests__/vibe-session.test.ts` |
| pass | Vibe dispatch retains uncertainty across acknowledgement loss and accepted failure | `src/shared/__tests__/vibe-session.test.ts` |
| pass | Vibe dispatch cancellation preserves partial events and the native session ID | `src/shared/__tests__/vibe-session.test.ts` |
| pass | explicit Vibe worker settles and stops descendants holding app-server output pipes | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-session.test.ts` | 0 | 7 | 1.2 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 106 | 6.3 s |  |

## t2

Run at 2026-11-09T18:31:25.995Z on commit `fef2d345f`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Daemon CliProvider Vibe completion, edit, review and structured retries never replay uncertain turns**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | explicit Vibe selections do not replay an uncertain turn through any daemon entry point | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | explicit Vibe review refuses unverified tool policy before dispatch | `src/agent/providers/__tests__/cli-vibe.test.ts` |

**integration: Vibe structured schema correction remains enabled for received invalid output**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | explicit Vibe structured completion repairs received schema output and honors its attempt budget | `src/agent/providers/__tests__/cli-vibe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-vibe.test.ts` | 0 | 13 | 9.3 s |  |

## t3

Run at 2026-11-09T18:33:42.611Z on commit `fef2d345f`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: VS Code Vibe adapter preserves resume identity, attachments, permissions, streaming and cancellation**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | explicit Vibe chat preserves resume, attachments, permissions and live events | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | explicit Vibe chat refuses mismatch and marks uncertain dispatch as unsafe to replay | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | explicit Vibe chat cancellation interrupts the leased child and preserves partial output | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | explicit Vibe chat writes the terminal and native identity to the durable turn segment | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | explicit Vibe worker writes a live turn after its launching host exits | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | an uncertain Vibe dispatch fails the queue without replay and releases its lease | `vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts` |
| pass | esbuild emits self-contained CJS out/extension.js that loads under an ESM (type:module) root (requires with a fake vscode, exposes activate/deactivate) | `vscode-plugin/src/__tests__/packaging.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/__tests__/packaging.test.ts` | 0 | 11 | 1.2 s |  |
| `vscode-plugin/src/chat/__tests__/chat-queue-fault-injection.test.ts` | 0 | 3 | 1.9 s |  |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 105 | 3.4 s |  |

## t4

Run at 2026-11-09T17:45:08.071Z on commit `a95c90c01`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: Provider and model changes, history restore and turn dispatch reconcile effort**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | catalog reconciliation drops incompatible effort on model, provider and history changes | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | unavailable catalog preserves restored selection and blocks unsupported edits and dispatch | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |
| pass | history reopen from disk preserves each provider model effort and next-turn request after reload | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 231 | 10.2 s |  |

## t5

Run at 2026-11-09T17:50:29.095Z on commit `d1e1ce3ea`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: Drive the actual webview picker intent and ready handshake through catalog failure and recovery**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | picker opens in the real webview script and recovers catalog over the host handshake without reloading an active turn | `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` |

**unit: Catalog cache, refresh coalescing, disposal and stale-generation handling**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | catalog refresh coalesces requests, retains good data and rejects disposed generation results | `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/chat-panel.test.ts` | 0 | 232 | 10.2 s |  |
| `vscode-plugin/src/chat/__tests__/chat-shell.test.ts` | 0 | 42 | 0.6 s |  |

## t6

Run at 2026-11-09T18:23:07.807Z on commit `721b055e0`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: Installed Vibe changes fixture alias and effort for one isolated session with config bytes unchanged**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/S001/QUALIFICATION.md#installed-vibe-smoke and the adjacent vibe-selection-smoke.json, reproduced by src/shared/__tests__/fixtures/vibe-selection-smoke.mjs

**smoke: Daemon build and extension packaging include the shared Vibe execution path**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/apply-catalog-model-effort-choices-daemon-E2026110997adabf6/S001/QUALIFICATION.md#test-sweep, with rebuilt output SHA-256 fingerprints
