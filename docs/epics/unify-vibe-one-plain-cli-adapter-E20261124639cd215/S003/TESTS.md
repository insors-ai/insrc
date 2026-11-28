<!-- insrc:artifact TESTS-639cd2159a87aedb-s3 -->

# Tests: 639cd2159a87aedb s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 39 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-11-28T05:48:38.048Z on commit `0510d84b4`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**smoke: buildArgv and readExitEvidence import directly from vibe-adapter.ts and are callable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildArgv and readExitEvidence import directly from vibe-adapter.ts and are callable | `src/shared/__tests__/vibe-adapter-exports.test.ts` |
| pass | createVibeAdapter throws when context.cwd is empty, before any subprocess spawns | `src/shared/__tests__/vibe-adapter.test.ts` |
| pass | adapter argv construction — a request with no model/thinking adds no --model/--thinking flags and writes the prompt to the tool's programmatic input (stdin), never into argv | `src/shared/__tests__/vibe-adapter-turn.test.ts` |
| pass | outputMode:'text' takes the raw trimmed stdout as the final text, with sessionId read back from export.json | `src/shared/__tests__/vibe-adapter-output-modes.test.ts` |
| pass | buildArgv's read-only branch emits exactly the two connector_insrc_* flags and no approval flag | `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` |
| pass | the read-only qualification cache is a Map, empty at module load | `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` |
| pass | a read-only request with a 'qualified' cached capability dispatches via buildArgv's read-only branch and returns the schema-validated result | `src/shared/__tests__/vibe-adapter-readonly-dispatch.test.ts` |
| pass | VibeExecutionAdapter.readOnly reflects the cached capability for this adapter's stable descriptor | `src/shared/__tests__/vibe-adapter-readonly-field.test.ts` |
| pass | effectiveConfigFingerprint extraction from a fake export.json at qualification time; a missing/unparsable export.json fails qualification closed | `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/shared/__tests__/vibe-adapter-exports.test.ts` | 0 | 1 | 0.4 s |  |
| `src/shared/__tests__/vibe-adapter-output-modes.test.ts` | 0 | 3 | 0.4 s |  |
| `src/shared/__tests__/vibe-adapter-readonly-argv.test.ts` | 0 | 5 | 0.4 s |  |
| `src/shared/__tests__/vibe-adapter-readonly-capability.test.ts` | 0 | 2 | 0.4 s |  |
| `src/shared/__tests__/vibe-adapter-readonly-dispatch.test.ts` | 0 | 7 | 0.4 s |  |
| `src/shared/__tests__/vibe-adapter-readonly-field.test.ts` | 0 | 2 | 0.5 s |  |
| `src/shared/__tests__/vibe-adapter-readonly-qualification.test.ts` | 0 | 24 | 0.9 s |  |
| `src/shared/__tests__/vibe-adapter-turn.test.ts` | 0 | 19 | 0.7 s |  |
| `src/shared/__tests__/vibe-adapter.test.ts` | 0 | 9 | 0.5 s |  |

## t2

Run at 2026-11-28T06:25:09.072Z on commit `97299858b`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: parseVibeMcpTool delegates to VibeMcpNaming.fromStreamedName**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t2 — parseVibeMcpTool delegates to VibeMcpNaming.fromStreamedName, not an independent parser (ac4) | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | vibe: s3/t2 — a native top-level "effect" row (direct-spawn, no worker bridge) decodes to tool-call + tool-result, same as the worker-bridged message/tool_call shape | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | vibe: streaming text turn maps to assistant-deltas + a synthesized done(ok) carrying the sessionId | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | vibe: tool_call (arguments_json string) maps to tool-call with command + mcp present; tool_result correlates the command | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**live: tool-activity naming parity against the installed vibe binary (carried from round 3)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t2 — ac4 LIVE naming parity: a tool-activity row captured verbatim from the installed vibe 3.1.4 binary decodes with the real mcp_insrc.insrc_schema identity | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

Reported by the builder, not run by the gate: **pass**. Evidence: Ran the installed vibe 3.1.4 binary headless (vibe -p --output streaming --output-dir, insrc MCP server configured in ~/.vibe/config.toml), prompted it to call insrc_schema once, and captured the real native 'effect' row's raw JSON. The live binary's own streamed tool name is 'mcp_insrc.insrc_schema' (dot-separated), matching VibeMcpNaming.fromStreamedName and NOT the old parser's underscore guess. Pinned that exact captured line as fixtures.ts's VIBE_LIVE_CAPTURED_MCP_EFFECT_ROW and asserted mapLine decodes it correctly in cli-adapter.test.ts (test listed above, commit 97299858b).

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 109 | 4.1 s |  |

## t3

Run at 2026-11-28T08:02:38.799Z on commit `77fce8a2a`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: vibeMapper.buildArgs threading outputDir through to buildArgv**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t3 — unit: vibeMapper.buildArgs(req, outputDir) produces byte-identical argv to buildArgv itself for the same request | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | vibe: s3/t3 — unit: vibeMapper.inputIsPrompt is false | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | vibe: argv — resume, --add-dir, and the permission-mode flags | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: prompt transport via stdin, not argv (carried from round 3)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t3 — integration: the prompt travels via stdin, not argv (carried from round 3) | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | vibe: multiline option-like prompt text never leaks into argv in new or resumed turns | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | vibe: title generation uses the same stdin prompt transport | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | vibe: streaming text turn maps to assistant-deltas + a synthesized done(ok) carrying the sessionId | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 112 | 4.2 s |  |

## t4

Run at 2026-11-28T08:07:04.661Z on commit `b29d00522`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: export-directory lifecycle across success/signal/spawn-failure/abort paths**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t4 — integration: export-directory lifecycle across success/signal/spawn-failure/abort paths | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 113 | 4.1 s |  |

## t5

Run at 2026-11-28T08:16:26.734Z on commit `0dcb8b13b`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: dispatchState transitions: 'not-sent' before spawn, 'possibly-sent' immediately after spawn succeeds, 'accepted' once a session-identity row is decoded; a subsequent stdin write/end failure does not revert it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t5 — unit: dispatchState transitions: 'not-sent' before spawn, 'possibly-sent' immediately after spawn succeeds, 'accepted' once a session-identity row is decoded; a subsequent stdin write/end failure does not revert it | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: a spawn failure before any child exists is deterministic pre-dispatch-safe**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t5 — integration: a spawn failure before any child exists is deterministic pre-dispatch-safe | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 115 | 4.1 s |  |

## t6

Run at 2026-11-28T08:20:55.257Z on commit `a98c2f658`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: a stdin write/end failure AFTER spawn succeeds is classified replay-unsafe**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t6 — integration: a stdin write/end failure AFTER spawn succeeds is classified replay-unsafe | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 116 | 4.2 s |  |

## t7

Run at 2026-11-28T10:09:00.375Z on commit `a5afdf302`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: readExitEvidence-driven outcome classification: stopReason undefined -> 'ok'; stopReason present -> 'replay-unsafe'; export.json missing/malformed -> 'no-evidence'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t7 — unit: readExitEvidence-driven outcome classification: stopReason undefined -> 'ok'; stopReason present -> 'replay-unsafe'; export.json missing/malformed -> 'no-evidence' | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: a fixture binary exiting cleanly with no stopReason yields vibeOutcome 'ok', read identically live and on reattach**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t7 — integration: a fixture binary exiting cleanly with no stopReason yields vibeOutcome 'ok' (live read) | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | vibe: s3/t9+t10 — integration: detach/reattach producing identical classification, clean exit -> 'ok' | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: a fixture binary exiting cleanly with a stopReason yields vibeOutcome 'replay-unsafe' despite exit code 0**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t7 — integration: a fixture binary exiting cleanly with a stopReason yields vibeOutcome 'replay-unsafe' despite exit code 0 | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 119 | 1.7 s |  |

## t8

Run at 2026-11-28T08:40:47.987Z on commit `b64e45322`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: parseMarker's turn-end case extracting code, signal, unknown, vibeDispatchState and vibeOutcome**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | s3/t8: parseMarker's turn-end case extracting code, signal, unknown, vibeDispatchState and vibeOutcome | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |
| pass | s3/t8: endTurn threads TurnExit.vibeDispatchState/vibeOutcome through to the written marker when present, and omits them when absent (claude/codex) | `vscode-plugin/src/chat/__tests__/session-output.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/session-output.test.ts` | 0 | 18 | 1.4 s |  |

## t9

Run at 2026-11-28T10:14:57.640Z on commit `a5afdf302`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: endTurn constructing the turn-end marker with the new fields present for vibe and absent for claude/codex**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t9 — unit: endTurn constructing the turn-end marker with the new fields present for vibe and absent for claude/codex | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: detach/reattach producing identical classification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t9+t10 — integration: detach/reattach producing identical classification, clean exit -> 'ok' | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |
| pass | vibe: s3/t9+t10 — integration: detach/reattach producing identical classification, stopReason exit -> 'replay-unsafe' | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 119 | 1.7 s |  |

## t10

Run at 2026-11-28T09:23:55.331Z on commit `67ed9db77`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the follower's missing-result branch for mapper.id==='vibe'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t10 — unit: the follower's missing-result branch for mapper.id==='vibe' | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: detach/reattach producing identical classification**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t9+t10 — integration: detach/reattach producing identical classification | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**integration: host-loss simulation read as replayUnsafe**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vibe: s3/t10 — integration: host-loss simulation read as replayUnsafe | `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` | 0 | 124 | 4.3 s |  |

## t11

Run at 2026-11-28T09:50:44.163Z on commit `290e0d0ec`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: no production file under src/ or vscode-plugin/src/ references vibeCatalog, vibe-session-worker.ts, or runVibeChatJob/historyLines**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | no production .ts file under src/ or vscode-plugin/src/ references vibeCatalog, vibe-session-worker.ts, or runVibeChatJob/historyLines | `vscode-plugin/src/chat/__tests__/no-vibe-session-worker-transport.test.ts` |
| pass | esbuild emits self-contained CJS out/extension.js that loads under an ESM (type:module) root (requires with a fake vscode, exposes activate/deactivate) | `vscode-plugin/src/__tests__/packaging.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/__tests__/packaging.test.ts` | 0 | 11 | 1.8 s |  |
| `vscode-plugin/src/chat/__tests__/no-vibe-session-worker-transport.test.ts` | 0 | 2 | 0.6 s |  |

## t12

Run at 2026-11-28T09:58:56.226Z on commit `156ec07cf`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: export.json's real field names match readExitEvidence's expectations**

Reported by the builder, not run by the gate: **pass**. Evidence: Live export.json retained at /tmp/vibe-parity-check/ask-approval/export.json (and the 3 siblings in that dir plus /tmp/vibe-parity-check2/*/export.json), produced by real headless `vibe -p ... --output-dir ... --output json` runs (vibe 3.1.4). Top-level keys: config, cost_usd, ended_at, error, exit_code, journal_dir, limits, outcome, schema_version, session_id, started_at, steps, stop_reason, usage, vibe_version (and `warnings` on runs where a tool call was denied). readExitEvidence (src/shared/vibe-adapter.ts:340-352) reads obj['stop_reason'] (string|null -> undefined when null, matches), obj['outcome'] (string 'finished', matches), and config['active_model'] (string, empty-string-as-undefined, matches since config.active_model was '' in every live run). No mismatch found; no code change needed.

**live: approval-flag effective-equivalence comparison, gating the migration's cutover**

Reported by the builder, not run by the gate: **pass**. Evidence: Retained transcripts/exports at /tmp/vibe-parity-check2/{ask-approval,ask-agent,editauto-approval,editauto-agent}/{export.json,stdout.log,session/}. Ran 4 live headless turns against the real vibe 3.1.4 binary, covering BOTH policy values src/shared/vibe-adapter.ts:849-850's buildApprovalArgs emits ('ask' and 'accept-edits'), each via both --approval-policy and the equivalent --agent (vibe --help: '--agent <NAME> ... Approval policy names are still accepted for compatibility'), with a prompt that requires a real file-write tool call: (1) --approval-policy ask and --agent ask: BOTH denied the write (no touched.txt created in either dir) with the IDENTICAL warning 'Tool call denied: file_system.write_file (needs approval, which a headless run cannot give)' in both export.json's warnings array; (2) --approval-policy accept-edits and --agent accept-edits: BOTH created touched.txt successfully, identical outcome/exit_code. Only non-semantic fields (session_id, timestamps, step/token counts from the model's own retry variance) differed. This is direct behavioral proof, not just a shape comparison: --approval-policy and --agent are effectively equivalent for both policy names this codebase emits. No deviation; t11's removal of the --agent route stands, cutover is unblocked.
