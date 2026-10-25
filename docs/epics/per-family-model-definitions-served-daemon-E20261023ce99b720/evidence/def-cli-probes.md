# CLI capability probes for DEF-ce99b72065d03b1b

Run on 2026-10-23 against the installed CLIs: codex-cli 0.164.0 and Claude Code 2.1.287.
Each probe ran serially from `/tmp`, with stdin closed. These answer the review's
round-1 findings p13, p14, p16, p17 and p18.

| # | Command | Exit | Observed |
|---|---------|------|----------|
| 1 | `codex debug models` | 0 | JSON list. Each model has `slug`, `visibility` and `supported_reasoning_levels`. gpt-6.1-sol, gpt-6-astra, gpt-6-sol, gpt-5.6-sol and gpt-5.6-terra list low/medium/high/xhigh/max/ultra. gpt-6-luna and gpt-5.6-luna list low/medium/high/xhigh/max (no `ultra`). gpt-reserve and codex-auto-review have `visibility: hide`. |
| 2 | `codex exec -m gpt-6.1-sol -c model_reasoning_effort=bogus "Reply with: ok"` | 1 | `Invalid value: 'bogus'. Supported values are: 'none', 'minimal', 'low', 'medium', 'high', 'xhigh', and 'max'.` |
| 3 | `codex exec -m gpt-nonexistent-9 "Reply with: ok"` | 1 | `The 'gpt-nonexistent-9' model is not supported when using Codex with a ChatGPT account.` |
| 4 | `codex exec -m gpt-6-luna -c model_reasoning_effort=ultra "Reply with: ok"` | 0 | The run completes and answers `ok` with `reasoning effort: ultra`, although `ultra` is not in gpt-6-luna's listed levels. |
| 5 | `claude -p --model claude-nonexistent-9 "Reply with: ok"` | 1 | `There's an issue with the selected model (claude-nonexistent-9). It may not exist or you may not have access to it.` |
| 6 | `claude -p --model sonnet --effort bogus "Reply with: ok"` | 0 | `Warning: Unknown --effort value 'bogus' — ignoring it and using the default effort. Valid values: low, medium, high, xhigh, max.` The run then answers `ok`. |

## What this establishes

- Both CLIs reject an unknown model with exit 1 (probes 3 and 5).
- codex rejects an effort value that is not a known level with exit 1 (probe 2). claude ignores an unknown effort, warns on stderr and exits 0 (probe 6).
- codex does **not** reject a known level that a given model does not list (probe 4). For codex, a model's accepted levels must therefore come from `codex debug models` (probe 1), not from whether a test run succeeds.
- claude has no local model-listing command. Its accepted levels per model are known only from the definitions file, or from the `Valid values` line in its warning.

## Claude per-model effort probes (2026-10-25)

Run serially from `/tmp`, stdin closed, against Claude Code 2.1.310, to settle
the review finding on s4/ac1 (whether a Claude CLI check can show which effort
levels a given model supports).

| # | Command | Exit | Observed |
|---|---------|------|----------|
| 7 | `claude -p --model haiku --effort bogus "Reply with: ok"` | 0 | `Warning: Unknown --effort value 'bogus' — ignoring it and using the default effort. Valid values: low, medium, high, xhigh, max.` Then `ok`. The same `Valid values` list as sonnet (probe 6). |
| 8 | `claude -p --model haiku --effort xhigh "Reply with: ok"` | 0 | `ok`, no warning. |
| 9 | `claude -p --model haiku --effort max "Reply with: ok"` | 0 | `ok`, no warning. |
| 10 | `claude -p --model opus --effort max "Reply with: ok"` | 0 | `ok`, no warning. |
| 11 | `claude -p --model haiku --effort xhigh --output-format json "Reply with: ok"` | 0 | The JSON reports `modelUsage["claude-haiku-5-5"]` with `contextWindow: 1000000` and `maxOutputTokens: 128000`, and `thinkingTokens: 0`. It reports no effort level. |

### What this establishes

- The `Valid values` line is the CLI's list of effort names, the same for every model (probes 6 and 7); it is not a per-model list.
- Every recognised level runs without a warning on every model tried (probes 8 to 10), and the output never states the effort used (probe 11). So no Claude CLI run shows whether a given model supports a given level.
- Claude's JSON output does state each model's context window and output limit (probe 11), so a Claude model's input limit can be read from the CLI.
