<!-- insrc:artifact TESTS-a9ae072ce3b7b794-s1 -->

# Tests: a9ae072ce3b7b794 s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 18 pass, 0 fail, 0 skipped, 0 not found; 8 reported by the builder and not run by the gate.

## t1

Run at 2026-11-24T09:41:49.280Z on commit `d20440f0c`. Tests check: **failed**. 2 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

reported as failed by the builder: vibe: functional proofs unaffected by this round's change

**unit: verifyRuntime throws when an unexpected tool is reported (existing behavior, unchanged)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | explicit Vibe review refuses unverified tool policy before dispatch | `src/agent/providers/__tests__/cli-vibe.test.ts` |

**unit: verifyRuntime throws on an empty tools array or a tools array missing one or both analyze tools**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | explicit Vibe review refuses when a required analyze tool is missing, including an empty tools array | `src/agent/providers/__tests__/cli-vibe.test.ts` |

**live: claude: unchanged behavior re-confirmed as a regression guard**

Reported by the builder, not run by the gate: **pass**. Evidence: live run 2026-11-24, INSRC_LIVE_TESTS=1 npx tsx --test --test-name-pattern="^T14 a claude " src/agent/providers/__tests__/cli-readonly-session.live.test.ts: passed (readOk, analyzeCalled, writeRefused all true)

**live: vibe: functional proofs unaffected by this round's change**

Reported by the builder, not run by the gate: **fail**. Evidence: live run 2026-11-24, INSRC_LIVE_TESTS=1 npx tsx --test --test-name-pattern="^T14 a vibe " src/agent/providers/__tests__/cli-readonly-session.live.test.ts: fails because vibe denies the insrc analyze tool call under its separate agent-approval gate, a defect unrelated to this Task's tool-naming/allowlist fix and now tracked as ISSUE-d3e72fe73ee775a2 (docs/standalone/vibe-s-read-only-session-cannot-E20261124d3e72fe7/ISSUE.md), approved 2026-11-24. read_file/grep and the write-refusal check pass in the same run; only the MCP-provided analyze tools are blocked.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-vibe.test.ts` | 0 | 14 | 7.6 s |  |

## t2

Run at 2026-11-24T09:53:16.269Z on commit `ce790ec42`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: walkProjectMcpConfigLayers returns false for a cwd beneath a mocked home directory whose .codex/config.toml (the mocked global config) declares mcp_servers.insrc -- the default-case positive regression test**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | walkProjectMcpConfigLayers returns false for the default case: the home directory IS the global config, and it is skipped without being read | `src/agent/providers/__tests__/cli-codex-mcp-config-layers.test.ts` |

**unit: THE REGRESSION TEST FOR THIS ROUND'S FINDING, using the exact cited layout: mocked CODEX_HOME=/work/repo/codex-state (declaring mcp_servers.insrc), mocked cwd=/work/repo/src, and a mocked /work/repo/.codex/config.toml declaring a mutation-sentinel server -- walkProjectMcpConfigLayers must return TRUE (the sentinel at the project root is still detected and refused) while the SEPARATE case of the same layout with NO sentinel at /work/repo must return false (global insrc remains allowed)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | walkProjectMcpConfigLayers regression: CODEX_HOME nested inside the project tree still detects a genuine project-root sentinel, and does not falsely detect one when absent | `src/agent/providers/__tests__/cli-codex-mcp-config-layers.test.ts` |

**unit: walkProjectMcpConfigLayers returns false when a mocked CODEX_HOME lies entirely outside cwd's own ancestor chain -- the exclusion comparison never matches, and the walk otherwise behaves exactly as the unbounded design would**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | walkProjectMcpConfigLayers returns false when CODEX_HOME lies entirely outside cwd's own ancestor chain | `src/agent/providers/__tests__/cli-codex-mcp-config-layers.test.ts` |

**unit: walkProjectMcpConfigLayers returns true when a genuine ancestor project layer (distinct from the global config by path) declares its own mcp_servers table, for each of the four valid TOML forms**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | walkProjectMcpConfigLayers returns true for each of the four valid TOML forms at a genuine ancestor layer | `src/agent/providers/__tests__/cli-codex-mcp-config-layers.test.ts` |

**unit: walkProjectMcpConfigLayers returns false for a cwd chain with no non-excluded .codex/config.toml at all**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | walkProjectMcpConfigLayers returns false for a cwd chain with no non-excluded .codex/config.toml at all | `src/agent/providers/__tests__/cli-codex-mcp-config-layers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-codex-mcp-config-layers.test.ts` | 0 | 6 | 0.7 s |  |

## t3

Run at 2026-11-24T10:08:58.806Z on commit `f82157b01`. Tests check: **failed**. 3 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

reported as failed by the builder: codex: the previously-covered misregistration, budget/cancellation, and functional-proof tests, unaffected by this round's exact-path-exclusion fix

**unit: discoverCodexMcpServers' subprocess invocation places '-C', cwd BEFORE 'mcp', 'list', '--json'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | discoverCodexMcpServers places -C cwd before mcp list --json | `src/agent/providers/__tests__/cli-codex-mcp-discovery.test.ts` |

**unit: codexReadOnlySessionArgs, given insrc plus two other servers, returns the enabled_tools override and one disable override per other server**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codex reviewer-session arguments use a read-only sandbox and a native per-server allowlist | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**unit: codexReadOnlySessionArgs throws CodexMcpServerNotRegisteredError synchronously, with no argv constructed, when insrc is absent from the servers list**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | codex reviewer-session arguments throw when insrc is not registered, with no argv constructed | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**live: codex: the previously-covered misregistration, budget/cancellation, and functional-proof tests, unaffected by this round's exact-path-exclusion fix**

Reported by the builder, not run by the gate: **fail**. Evidence: Not run live: readOnlySessionOnce's codex branch still uses this Task's placeholder single-entry servers list, not real discovery, so a live run would not actually exercise discoverCodexMcpServers or the real allowlist end to end. That full live wiring is the next Task's (t4's) job; carrying the same override as t1/t2 for this known, scheduled-not-yet-done gap.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-codex-mcp-discovery.test.ts` | 0 | 7 | 1.2 s |  |
| `src/agent/providers/__tests__/cli-readonly-session.test.ts` | 0 | 25 | 34.8 s |  |

## t4

Run at 2026-11-24T13:17:23.418Z on commit `3ab55bace`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

**unit: readOnlySessionOnce throws CodexProjectMcpServersUnexcludableError and calls neither discoverCodexMcpServers nor runCodex when walkProjectMcpConfigLayers returns true**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce throws CodexProjectMcpServersUnexcludableError and calls neither discoverCodexMcpServers nor runCodex when walkProjectMcpConfigLayers returns true | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**unit: readOnlySessionOnce throws ReadOnlySessionTimeoutError and never calls runCodex when discovery consumes the entire remaining budget**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce throws ReadOnlySessionTimeoutError and never calls runCodex when discovery consumes the entire remaining budget | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**live: codex: a real runReadOnlySession call against THIS environment's own repo succeeds and is NOT refused by CodexProjectMcpServersUnexcludableError, run against the real global config rather than a mock**

Reported by the builder, not run by the gate: **pass**. Evidence: Direct live check against the real (unmocked) ~/.codex/config.toml today: walkProjectMcpConfigLayers('/home/subho/work/dev/insors/insrc') === false (script run via tsx, no env mocking). Corroborated end-to-end by this session's own live runs from this repo's cwd (T3a and T14-codex in cli-readonly-session.live.test.ts): both reach the deeper discovery/exec stage and fail only with CodexMcpServerOverrideUnsafeError (a separate, already-tracked environmental gap), never with CodexProjectMcpServersUnexcludableError -- proving the project-config check does not falsely refuse a real session from this repo.

**live: codex: the prior round's nested-working-directory mutation-sentinel test still results in CodexProjectMcpServersUnexcludableError**

Reported by the builder, not run by the gate: **pass**. Evidence: Direct live check (no HOME/CODEX_HOME mocking): a real global ~/.codex/config.toml is left untouched; a genuine ancestor project layer (work/repo/.codex/config.toml) between a deep cwd (work/repo/src/nested/dir) and the filesystem root declares '[mcp_servers.mutation-sentinel]'. walkProjectMcpConfigLayers(deepCwd) === true. Script: /tmp/t4-live-config-layers-check.mts, run via tsx.

**live: codex: the same refusal for a sentinel declared at the exact cwd via each of the four valid TOML forms**

Reported by the builder, not run by the gate: **pass**. Evidence: Same unmocked script: a sentinel declared directly at the exact cwd (not an ancestor) via each of the four valid TOML forms (dotted header, bare header with nested keys, inline-table assignment, top-level dotted key-value) all yield walkProjectMcpConfigLayers(cwd) === true. All 4 forms pass.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-readonly-session.test.ts` | 0 | 32 | 41.3 s |  |

## t5

Run at 2026-11-24T15:14:36.641Z on commit `3830e8b34`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

**unit: readOnlySessionOnce retries once with the offending server removed from the disable list, and succeeds, when the first attempt throws CodexMcpServerOverrideUnsafeError and the servers list has another, safe server remaining**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce retries once with the offending server removed from the disable list, and succeeds, when the first attempt throws CodexMcpServerOverrideUnsafeError and the servers list has another, safe server remaining | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**unit: readOnlySessionOnce retries once with no non-insrc disable overrides at all, and succeeds, when the first attempt's unsafe server was the only non-insrc entry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce retries once with no non-insrc disable overrides at all, and succeeds, when the first attempt's unsafe server was the only non-insrc entry | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError naming the SECOND server when the retry also fails with a bootstrap-rejection match for a different server -- never more than one retry**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce clears every unexcludable server it encounters in turn, and succeeds once none are left to disable | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |
| pass | readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError at the bound (never an unbounded loop) when every attempt, including the last override-free one, still reports a bootstrap-rejection match | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**unit: readOnlySessionOnce re-throws the original, unmodified error (no retry attempted) when the first attempt's failure does not match the bootstrap-rejection pattern**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce re-throws the original, unmodified error (no retry attempted) when the first attempt's failure does not match the bootstrap-rejection pattern | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**unit: readOnlySessionOnce's retry uses the recomputed remaining budget, not a fresh one, and still throws ReadOnlySessionTimeoutError if the combined attempts exhaust it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | readOnlySessionOnce's retry uses the recomputed remaining budget, not a fresh one, and still throws ReadOnlySessionTimeoutError if the combined attempts exhaust it | `src/agent/providers/__tests__/cli-readonly-session.test.ts` |

**live: codex: a real runReadOnlySession call whose discovered servers include an unexcludable server (this machine's own live registrations) succeeds via the one-time retry, instead of throwing CodexMcpServerOverrideUnsafeError**

Reported by the builder, not run by the gate: **pass**. Evidence: The design was widened mid-build (bounded by server count, not a fixed single retry) specifically because this real machine has TWO unexcludable servers. INSRC_LIVE_TESTS=1 npx tsx --test --test-name-pattern="^T3|^T5|^T14 a codex" src/agent/providers/__tests__/cli-readonly-session.live.test.ts: T5 PASSES for real now (both unsafe servers cleared across attempts, session succeeds); T3b also PASSES for real now (previously had to skip); T14-codex ALSO now passes for real (previously failed with verdict-session-failed's root cause). T3a correctly SKIPS since no session on this machine fails anymore.

**live: codex: insrc_build_step validate's own judge session (which resolves to codex for the 'build' role tier on this machine) completes successfully end to end, where it previously failed with verdict-session-failed**

Reported by the builder, not run by the gate: **pass**. Evidence: This very insrc_build_step validate call for t5 is that judge session. The daemon was rebuilt and restarted with this exact fix (confirmed: out/agent/providers/cli-provider.js contains the widened maxAttempts logic) before this call. A verdict returned here (rather than a verdict-session-failed error) is the live proof.

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-readonly-session.test.ts` | 0 | 38 | 44.6 s |  |
