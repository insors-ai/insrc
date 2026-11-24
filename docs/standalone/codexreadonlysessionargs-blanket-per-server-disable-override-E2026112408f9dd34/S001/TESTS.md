<!-- insrc:artifact TESTS-08f9dd3412bc10f0-s1 -->

# Tests: 08f9dd3412bc10f0 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 6 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

## t1

Run at 2026-11-24T11:36:42.876Z on commit `2cc8f88f4`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('codex_app') when runCodex's failure message matches codex's live-confirmed bootstrap-rejection wording naming codex_app**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('codex_app') when runCodex's failure message matches codex's live-confirmed bootstrap-rejection wording naming codex_app | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-readonly-session.test.ts` | 0 | 29 | 41 s |  |

## t2

Run at 2026-11-24T11:45:39.856Z on commit `653041108`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('codex_app') when runCodex's failure message matches codex's live-confirmed bootstrap-rejection wording naming codex_app**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('codex_app') when runCodex's failure message matches codex's live-confirmed bootstrap-rejection wording naming codex_app | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('cua_repl') when runCodex's failure message matches the same wording naming cua_repl**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError('cua_repl') when runCodex's failure message matches the same wording naming cua_repl | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**unit: readOnlySessionOnce proceeds normally (no new error) when the servers list includes node_repl and runCodex succeeds, exactly as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce proceeds normally (no new error) when the servers list includes node_repl and runCodex succeeds, exactly as today | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**unit: readOnlySessionOnce re-throws the original, unmodified error when runCodex fails for a reason that does NOT match the bootstrap-rejection wording (e.g. a generic non-zero exit, or the existing 'no agent_message item' case)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce re-throws the original, unmodified error when runCodex fails for a reason that does NOT match the bootstrap-rejection wording (e.g. a generic non-zero exit, or the existing 'no agent_message item' case) | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |
| pass | a codex read-only session sends the strict form of a non-strict schema and leaves the caller's schema unchanged | `src/agent/providers/__tests__/cli-codex-strict-schema.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-codex-strict-schema.test.ts` | 0 | 13 | 1.6 s |  |
| `src/agent/providers/__tests__/cli-readonly-session.test.ts` | 0 | 32 | 41.3 s |  |

## t3

Run at 2026-11-24T12:38:55.223Z on commit `b5ac726da`. Tests check: **failed**. 0 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

no test files to run; reported as failed by the builder: codex: a real runReadOnlySession call whose discovered servers include only node_repl (and insrc) succeeds and starts a restricted session as today

**live: codex: a real runReadOnlySession call whose discovered servers include codex_app or cua_repl throws CodexMcpServerOverrideUnsafeError naming that server, and no tool from any server was reachable (the session never started)**

Reported by the builder, not run by the gate: **pass**. Evidence: INSRC_LIVE_TESTS=1 npx tsx --test src/agent/providers/__tests__/cli-readonly-session.live.test.ts, test 'T3a codex: when a real session has an unsafe server registered alongside insrc, it throws CodexMcpServerOverrideUnsafeError naming a real discovered server, and never starts' -- passed against the real codex binary (serverName: 'codex_app', the actual server discovered live on this machine). The test was generalized per explicit user feedback not to hardcode vendor-specific server names (codex_app/cua_repl/node_repl are ChatGPT-desktop-app-bundled servers, not something insrc should know by name): it now discovers whatever is actually registered and asserts generically that the thrown error names one of those real discovered servers, rather than checking for these three names specifically (commit b5ac726da).

**live: codex: a real runReadOnlySession call whose discovered servers include only node_repl (and insrc) succeeds and starts a restricted session as today**

Reported by the builder, not run by the gate: **fail**. Evidence: test 'T3b' in cli-readonly-session.live.test.ts (generalized, same commit b5ac726da): this real machine has multiple other MCP servers globally registered alongside insrc, and codexReadOnlySessionArgs disables all of them in one invocation, so codex's bootstrap rejects the first unsafe one before an all-accepted scenario can ever be reached here -- this acceptance criterion is environmentally unreachable on this machine, not an implementation defect. The test detects this via the real discovery result and skips with the reason recorded. The all-accepted-overrides behavior IS proven synthetically by the t2 unit test 'readOnlySessionOnce proceeds normally (no new error) when the servers list includes an ordinary server whose override codex accepts, and runCodex succeeds, exactly as today' in cli-readonly-session.test.ts, which passed.

**live: codex: the previously-covered misregistration, budget/cancellation, and project-config-refusal tests remain unaffected by this Story's change**

Reported by the builder, not run by the gate: **pass**. Evidence: npx tsx --test src/agent/providers/__tests__/cli-readonly-session.test.ts: all 32 tests pass unchanged after the t3 generalization commit, including the CodexProjectMcpServersUnexcludableError, ReadOnlySessionTimeoutError, and CodexMcpServerNotRegisteredError tests -- none of t3's changes touched that behavior (only comments, test fixture names, and the live test file changed).
