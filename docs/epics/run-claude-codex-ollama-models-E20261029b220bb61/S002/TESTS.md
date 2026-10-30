<!-- insrc:artifact TESTS-b220bb6174a2f5ed-s2 -->

# Tests: b220bb6174a2f5ed s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-30T05:37:12.338Z on commit `e7074cb44`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: cli-ollama.test.ts: every claude entry point on an Ollama-targeted provider starts claude with --model <id> and the three Ollama variables, without CLAUDE_CODE_OAUTH_TOKEN, and leaves process.env unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cli-ollama.test.ts: every claude entry point on an Ollama-targeted provider starts claude with --model <id> and the three Ollama variables, without CLAUDE_CODE_OAUTH_TOKEN, and leaves process.env unchanged | `src/agent/providers/__tests__/cli-ollama.test.ts` |

**unit: cli-ollama.test.ts: the bounded path on an Ollama-targeted provider gets the allow-list plus the three Ollama variables**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cli-ollama.test.ts: the bounded path on an Ollama-targeted provider gets the allow-list plus the three Ollama variables | `src/agent/providers/__tests__/cli-ollama.test.ts` |

**unit: cli-ollama.test.ts: providers without an Ollama target (claude, codex) start with today's arguments and no Ollama variables**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cli-ollama.test.ts: providers without an Ollama target (claude, codex) start with today's arguments and no Ollama variables | `src/agent/providers/__tests__/cli-ollama.test.ts` |

**unit: cli-ollama.test.ts: an Ollama target with kind codex or without a model is refused at construction**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | cli-ollama.test.ts: an Ollama target with kind codex or without a model is refused at construction | `src/agent/providers/__tests__/cli-ollama.test.ts` |

**unit: cli-vibe.test.ts, bounded-input.test.ts, cli-subprocess.test.ts and cli-failure-message.test.ts stay green**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | complete() runs `vibe -p --output text` with the prompt on stdin and the model pinned via VIBE_ACTIVE_MODEL | `src/agent/providers/__tests__/cli-vibe.test.ts` |
| pass | DIFF-TRANSPORT: bounded Claude dispatch preserves explicit input and disables ambient tools/history/project context | `src/agent/providers/__tests__/bounded-input.test.ts` |
| pass | a timed-out CLI child is killed with its process group, so a grandchild it started is gone | `src/agent/providers/__tests__/cli-subprocess.test.ts` |
| pass | completeStructured and complete run the CLI in opts.cwd when it is given | `src/agent/providers/__tests__/cli-subprocess.test.ts` |
| pass | the provider itself throws that error for a claude and a codex CLI that exit non-zero, once, with a long output in the default directory | `src/agent/providers/__tests__/cli-failure-message.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/bounded-input.test.ts` | 0 | 4 | 1.5 s |  |
| `src/agent/providers/__tests__/cli-failure-message.test.ts` | 0 | 6 | 1.5 s |  |
| `src/agent/providers/__tests__/cli-ollama.test.ts` | 0 | 4 | 1.4 s |  |
| `src/agent/providers/__tests__/cli-subprocess.test.ts` | 0 | 6 | 4.3 s |  |
| `src/agent/providers/__tests__/cli-vibe.test.ts` | 0 | 9 | 7.7 s |  |
