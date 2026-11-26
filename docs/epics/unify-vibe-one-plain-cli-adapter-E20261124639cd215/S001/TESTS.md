<!-- insrc:artifact TESTS-639cd2159a87aedb-s1 -->

# Tests: 639cd2159a87aedb s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 40 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-11-26T10:45:17.862Z on commit `a298f449c`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: createVibeAdapter throws when context.cwd is empty or not a directory, before any subprocess spawns**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | createVibeAdapter throws when context.cwd is empty, before any subprocess spawns | `src/shared/__tests__/vibe-adapter.test.ts` |
| pass | createVibeAdapter throws when context.cwd is not a directory, before any subprocess spawns | `src/shared/__tests__/vibe-adapter.test.ts` |

**unit: startTurn with mode:'read-only' refuses before any subprocess spawn, surfacing a reason**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | startTurn with mode:'read-only' refuses before any subprocess spawn, surfacing a reason | `src/shared/__tests__/vibe-adapter.test.ts` |

**unit: startTurn with mode:'read-only' and any approval setting refuses before dispatch**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | startTurn with mode:'read-only' and any approval setting refuses before dispatch | `src/shared/__tests__/vibe-adapter.test.ts` |

**unit: the ordinary approval mapping matches today's chat mapping: default/manual/edit-auto/auto**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the ordinary approval mapping matches today's chat mapping: default/manual/edit-auto/auto | `src/shared/__tests__/vibe-adapter.test.ts` |

**unit: VibeTurnError is re-homed with the same constructor shape (dispatchState, sessionId, cause)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | VibeTurnError is re-homed with the same constructor shape (dispatchState, sessionId, cause) structured-output.ts's instanceof check relies on | `src/shared/__tests__/vibe-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-adapter.test.ts` | 0 | 9 | 0.5 s |  |

## t2

Run at 2026-11-26T11:12:38.547Z on commit `b7c0de5b0`. Tests check: **passed**. 11 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: adapter argv construction — a request with no model/thinking adds no --model/--thinking flags and writes the prompt to the tool's programmatic input (stdin), never into argv**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | adapter argv construction — a request with no model/thinking adds no --model/--thinking flags and writes the prompt to the tool's programmatic input (stdin), never into argv | `src/shared/__tests__/vibe-adapter-turn.test.ts` |

**unit: a new-session request with model+thinking constructs the argv with --model/--thinking; a resumed-session request constructs --resume only and the type forbids selection**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a new-session request's argv carries --model/--thinking only when the caller supplied them; a resumed-session request's type carries no selection fields | `src/shared/__tests__/vibe-adapter.test.ts` |

**unit: the adapter recognizes the tool's selection-failure wording and raises VibeSelectionError before any model call, not retried by withTransientRetry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the adapter recognizes the tool's selection-failure wording and raises VibeSelectionError before any model call, not retried by withTransientRetry | `src/shared/__tests__/vibe-adapter-turn.test.ts` |

**unit: every exit path removes the turn's temporary files; adapter-owned mode additionally sweeps the child group on every exit path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every exit path removes the turn's temporary files; adapter-owned mode additionally sweeps the child group on every exit path | `src/shared/__tests__/vibe-adapter-turn.test.ts` |

**unit: a 'session' event opens every turn carrying the native session id and, for a new session, the resume handle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a 'session' event opens every turn carrying the native session id and, for a new session, the resume handle | `src/shared/__tests__/vibe-adapter-turn.test.ts` |
| pass | a 'session' event for a RESUMED session carries the caller's own resumeHandle, not a new one | `src/shared/__tests__/vibe-adapter-turn.test.ts` |

**unit: exit evidence is read back from export.json; a missing/malformed export.json yields undefined evidence rather than a fabricated value**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | exit evidence is read back from export.json; a missing/malformed export.json yields undefined evidence rather than a fabricated value | `src/shared/__tests__/vibe-adapter-turn.test.ts` |

**unit: VibeMcpNaming.fromStreamedName returns undefined for a name matching no insrc MCP tool, never a guess**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | VibeMcpNaming.fromStreamedName returns undefined for a name matching no insrc MCP tool, never a guess | `src/shared/__tests__/vibe-adapter-turn.test.ts` |

**unit: a streaming tool-result with outputText/output/error/reason normalizes to the existing chat precedence, never an empty payload**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a streaming tool-result with outputText/output/error/reason normalizes to the existing chat precedence, never an empty payload | `src/shared/__tests__/vibe-adapter-turn.test.ts` |
| pass | tool-result precedence: output used when outputText is absent | `src/shared/__tests__/vibe-adapter-turn.test.ts` |
| pass | tool-result precedence: an error-only, failed result falls back to the error message | `src/shared/__tests__/vibe-adapter-turn.test.ts` |

**live: INSRC_LIVE_TESTS=1 — a real vibe -p turn with a bogus alias surfaces the tool's real catalog; a valid model/thinking completes**

Reported by the builder, not run by the gate: **pass**. Evidence: Ran for real against the installed vibe 3.1.4 binary in this sandbox (INSRC_LIVE_TESTS=1 npx tsx --test src/shared/__tests__/vibe-adapter-live.test.ts): both live tests passed (bogus-alias VibeSelectionError surfaced the real catalog; a valid mistral-medium-latest turn completed with non-empty result.text and effectiveSelection.model readback). Both skip cleanly (SKIP, 0 run) when INSRC_LIVE_TESTS is unset, which is why the gate's own non-live run reports them as skipped rather than run.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-adapter-turn.test.ts` | 0 | 11 | 0.8 s |  |
| `src/shared/__tests__/vibe-adapter.test.ts` | 0 | 9 | 0.5 s |  |

## t3

Run at 2026-11-26T11:22:52.260Z on commit `bdff1d6f2`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: cli-adapter.ts imports VibeCatalogModel from the adapter module, not vibe-session.js**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cli-adapter.ts imports VibeCatalogModel from the adapter module, not vibe-session.js | `vscode-plugin/src/chat/__tests__/cli-adapter-vibe-import.test.ts` |

**integration: vscode-plugin/src/chat/vibe-session-process.ts runVibeChatJob through the adapter turn entry — the chat worker's observable behavior is unchanged, same rows to the same line protocol**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | runVibeChatJob through the adapter's runVibeTurn — the chat worker's observable behavior is unchanged, same rows to the same line protocol | `vscode-plugin/src/chat/__tests__/vibe-session-process.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter-vibe-import.test.ts` | 0 | 1 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/vibe-session-process.test.ts` | 0 | 1 | 0.5 s |  |

## t4

Run at 2026-11-26T11:27:52.530Z on commit `1d202e8bc`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: structured-output.ts imports VibeTurnError from the adapter module; the retry classifier's instanceof check still distinguishes the refusal marker from a transient failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | structured-output.ts imports VibeTurnError from the adapter module with no behavior change at this step | `src/agent/providers/__tests__/structured-retry-vibe-adapter-refusal.test.ts` |

**unit: cli-provider.ts imports VibeCatalogModel/VibeTurnError from the adapter module with no behavior change at this step**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cli-provider.ts imports VibeCatalogModel/VibeTurnError from the adapter module with no behavior change at this step | `src/agent/providers/__tests__/cli-provider-vibe-import.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-provider-vibe-import.test.ts` | 0 | 1 | 0.5 s |  |
| `src/agent/providers/__tests__/structured-retry-vibe-adapter-refusal.test.ts` | 0 | 1 | 0.7 s |  |

## t5

Run at 2026-11-26T11:43:00.815Z on commit `82ae9340e`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: provider.complete for kind 'vibe' builds a single VibeTurnRequest and consumes the adapter — no private argv path remains (grep-level assertion: no vibeArgs/runVibe in cli-provider.ts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | provider.complete for kind 'vibe' builds a single VibeTurnRequest and consumes the adapter -- no private argv path remains | `src/agent/providers/__tests__/cli-provider-vibe-adapter.test.ts` |

**integration: the backend vibe request path spawns exactly one subprocess per turn through the adapter (seam-recorded spawn)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the backend vibe request path spawns exactly one subprocess per turn through the adapter | `src/agent/providers/__tests__/cli-provider-vibe-adapter.test.ts` |

**unit: completeStructuredVibe keeps the local two-attempt ajv validation loop — a first invalid answer retries once, a second raises ModelResponseShapeError naming the errors**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | completeStructuredVibe keeps the local two-attempt ajv validation loop -- a first invalid answer retries once, a second raises ModelResponseShapeError naming the errors | `src/agent/providers/__tests__/cli-provider-vibe-adapter.test.ts` |

**unit: the schema note rides the prompt — the prompt passed to the spawn seam contains the output contract**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the schema note rides the prompt -- the prompt passed to the spawn seam contains the output contract | `src/agent/providers/__tests__/cli-provider-vibe-adapter.test.ts` |

**unit: withTransientRetry still wraps every vibe path — a transient error text retries a fresh invocation, a deterministic failure re-throws on attempt 1, bounded at the existing max**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | withTransientRetry still wraps every vibe path -- a transient error text retries a fresh invocation, a deterministic failure re-throws on attempt 1, bounded at the existing max | `src/agent/providers/__tests__/cli-provider-vibe-adapter.test.ts` |

**live: INSRC_LIVE_TESTS=1 — the plain-CLI path end to end and exit-evidence readback from --output-dir**

Reported by the builder, not run by the gate: **pass**. Evidence: Ran for real against the installed vibe 3.1.4 binary in this sandbox (INSRC_LIVE_TESTS=1 npx tsx --test src/agent/providers/__tests__/cli-provider-vibe-adapter.live.test.ts): both tests passed -- complete() returned real non-empty text, completeStructured() returned a real validated {ok:true} answer. Both skip cleanly (SKIP, 0 run) when INSRC_LIVE_TESTS is unset.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-provider-vibe-adapter.test.ts` | 0 | 6 | 2.8 s |  |

## t6

Run at 2026-11-26T11:59:17.344Z on commit `5f391c742`. Tests check: **passed**. 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the transport's test suite (vibe-session.test.ts) and fixture (vibe-selection-smoke.mjs) are deleted with the module; packaging.test.ts's shared-file list updated**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | esbuild emits self-contained CJS out/extension.js that loads under an ESM (type:module) root (requires with a fake vscode, exposes activate/deactivate) | `vscode-plugin/src/__tests__/packaging.test.ts` |

**unit: VibeTurnError re-homed to the adapter is still the non-retryable refusal marker (structured-retry-vibe-refusal.test.ts's cases re-pointed, same verdicts)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | Saved structured retry preserves Vibe refusal identity and never retries | `src/agent/providers/__tests__/structured-retry-vibe-refusal.test.ts` |

**integration: provider + structured-output + chat worker compile and run against the adapter alone**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibeLastAssistantText: bare array, wrapped messages, string content, no assistant | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | complete() runs default `vibe -p --output text` with the prompt on stdin | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | complete() without a model adds no --model/--thinking flags (the CLI default applies) | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | completeStructured() parses the last assistant message of the json output and validates it against the schema | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | completeStructured() retries with a feedback note when the answer is not valid JSON, then succeeds | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | completeStructured() surfaces a stable error after retries are exhausted | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | runEditSession() runs headless with --auto-approve inside the repo cwd | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | runReadOnlySession() refuses before any subprocess spawns -- the adapter's fail-closed read-only mode (k1), no qualification exists yet | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | a non-zero vibe exit is a VibeTurnError carrying the CLI's own stderr text; a transient 503 is retried on a fresh run | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | Vibe structured completion retains strict original nullable semantics without Codex transport decoding | `src/agent/providers/__tests__/cli-vibe.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-vibe.test.ts` | 0 | 10 | 7 s |  |
| `src/agent/providers/__tests__/structured-retry-vibe-refusal.test.ts` | 0 | 1 | 0.6 s |  |
| `vscode-plugin/src/__tests__/packaging.test.ts` | 0 | 11 | 1.2 s |  |

## t7

Run at 2026-11-26T16:10:29.292Z on commit `fd6fb328a`. Tests check: **failed**. 2 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

reported as failed by the builder: the full relevant test sweep passes and typecheck is clean

**unit: a repo-wide grep test asserts no production file imports src/shared/vibe-session.js and the module no longer exists (the grep-exhaustive enumeration in the LldContext is the baseline list)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/shared/vibe-session.ts no longer exists | `src/shared/__tests__/no-vibe-session-transport.test.ts` |
| pass | no production .ts file under src/ or vscode-plugin/src/ imports src/shared/vibe-session.js | `src/shared/__tests__/no-vibe-session-transport.test.ts` |

**smoke: the full relevant test sweep passes and typecheck is clean**

Reported by the builder, not run by the gate: **fail**. Evidence: Typecheck is clean on both tsconfigs (npx tsc --noEmit in the repo root and in vscode-plugin/, zero errors). The test sweep is NOT 100% green: src/agent/providers/**, src/shared/**, and vscode-plugin's chat/plugin suites together show 1780 pass / 55 fail (re-run after review rounds 1-4's fixes, see /tmp/full-sweep-r4.log). Every failure is pre-existing and confirmed unrelated to vibe: none of their names or content reference vibe, cli-adapter, cli-provider, or cli-vibe (Kotlin/JetBrains native-broker/process-broker suites, chat-theme/config-catalog-sync/docs-review-panel tests, VS Code daemon commands). The t6-disclosed cli-adapter.test.ts app-server-fixture gap (6 of the original 70 failures) was closed during review round 2 (finding 7): that fixture was rewritten to the real plain-CLI shape and all 6 tests now pass. Reporting 'fail' rather than 'pass' because the literal claim ('passes') does not hold; the disclosed/accounted-for breakdown is the honest result.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/no-vibe-session-transport.test.ts` | 0 | 2 | 0.5 s |  |
