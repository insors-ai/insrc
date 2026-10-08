<!-- insrc:artifact CR-7a3ab8dc4b9d39ea-S001 -->

# Code review: 7a3ab8dc4b9d39ea:S001

⚠️ **WARN** — HIGH 0 · MED 5 · LOW 4 · model `claude:opus`

**Changed files:** 10

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 4 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/agent/providers/cli-provider.ts:458 | The two changed call sites (the claude non-zero-exit reject at ~458 and the codex non-zero-exit throw at ~486) have no test in this Story's diff that reaches them. The new tests call cliFailureMessage directly; nothing drives CliProvider with a subprocess that exits non-zero to show the provider actually throws the new message (and, for codex, that stdout is now included). testsReaching is empty for the file, but that is a file-level diff entity, so the graph neither confirms nor rules out an existing test reaching these lines. Reported as an unexercised-wiring observation, not a confirmed breach. |
| MED | src/agent/providers/__tests__/cli-failure-message.test.ts:1 | Tests are present but unverified. This new file directly exercises cliFailureMessage (envelope result first, inline output, file spill at CLI_OUTPUT_INLINE_CHARS and one character over, unwritable-directory fallback) and isTransientCliError (400/401/403/404/422 not transient; 408/429/500/529/connection-closed/overloaded transient). No build record is available, so its pass-state cannot be confirmed. The empty testsReaching on cli-provider.ts reflects file-level diff grounding on a just-created test file, not an absence of tests. |
| LOW | src/analyze/__tests__/model-schemas-draft-2020.test.ts:1 | Tests are present but unverified. This new file exercises the three changed $id values (PLAN_TASK_SCHEMA, CLASSIFIED_INTENT_SCHEMA, ANALYZE_CONTEXT_BUNDLE_SCHEMA: draft 2020-12 validity, no fragment, version kept, plus a check that the old fragment id is refused) and the three reworded error messages (PlanBuilderLlmUnavailableError, ClassifierLlmUnavailableError, ScopePickerLlmUnavailableError). driver-unit.test.ts also asserts the planner message. No build record is available, so pass-state cannot be confirmed. |
| LOW | src/agent/providers/cli-provider.ts:578 | The default `dir` (join(tmpdir(), 'insrc-cli-failures')) is never exercised on the file-writing path. Every long-output test case passes an explicit dir, and the only call that uses the default (in the transient-error test) has output short enough to stay inline. The production call sites always use the default, so the real spill location is untested. |

## quality — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/agent/providers/cli-provider.ts:588 | Correctness risk: once the combined output exceeds CLI_OUTPUT_INLINE_CHARS, the message carries only the envelope's `result` plus a file path. Where there is no parseable envelope `result` (every codex failure, since codex stdout is JSONL, and any claude failure with non-JSON or truncated stdout), the cause in stderr is no longer in the message at all. The old message always carried stderr.slice(0, 300). isTransientCliError matches on the message string, so a rate-limit or overloaded failure reported on stderr alongside a long stdout is now classified non-transient and not retried, and the thrown error names no cause. Consider always keeping stderr (or its tail) inline, or classifying transience on the raw output rather than the composed message. |
| MED | src/agent/providers/cli-provider.ts:557 | Correctness risk: isTransientCliError is still run over the composed message, which now embeds up to 2,000 characters of raw stdout (previously 600) including the envelope's usage and duration figures. The bare-token alternatives (`\b(429\|500\|502\|503\|504\|529)\b`, `timeout`) can match an unrelated number or key in that envelope, e.g. `"input_tokens":500`, so a non-transient failure such as a usage limit is retried. The new 4xx guard only protects messages that literally contain `API Error: 4xx`. The transient test should run over the extracted `result`/stderr text, not the whole envelope. |
| MED | src/agent/providers/cli-provider.ts:592 | Unhandled lifecycle / resource path: each long failure writes a new `<cli>-exit-<uuid>.txt` under tmpdir()/insrc-cli-failures and nothing removes it. A call retried as transient writes one file per attempt, and the long-running daemon accumulates them without bound. The files hold the CLI's full stdout/stderr (which may echo prompt or repo content) in a directory created with default permissions. Add a retention bound (prune by age or count on write) and create the directory with mode 0o700. |
| LOW | src/agent/providers/cli-provider.ts:590 | cliFailureMessage does synchronous mkdirSync + writeFileSync inside the subprocess-completion callback of the daemon's event loop. The payload is bounded by the CLI's output so the stall is small, but a formatting helper with blocking filesystem side effects is surprising; an async write, or writing at the call site, would keep the helper pure. |
| LOW | src/analyze/context/schema.ts:88 | The `$id` of three schemas changes shape (`…#<version>` to `…/v<version>`). Any consumer that derives the version by splitting `$id` on `#`, or that keys a persisted or cached bundle on the old identifier, would silently stop matching. The new test pins the new ids but nothing in the provided grounding shows that readers of the old form were checked. Worth a grep for `$id` and `#` consumers before relying on it. |

