<!-- insrc:artifact TESTS-a27df0280289e6c6-S001 -->

# Tests: a27df0280289e6c6 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-23T06:20:58.215Z on commit `f59cf67b`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: parseTiering reads effort on the global core/mid/cheap tiers; an effort under models.byRepo[repo].tiers is ignored with a warning; '' and absent give no effort**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parseTiering reads effort on the global core/mid/cheap tiers; an effort under models.byRepo[repo].tiers is ignored with a warning; '' and absent give no effort | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: an effort outside low|medium|high|xhigh|max is dropped with a warning while the tier keeps its runner and model**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | an effort outside low\|medium\|high\|xhigh\|max is dropped with a warning while the tier keeps its runner and model | `src/config/__tests__/analyze-tiering.test.ts` |

**unit: a global tier dropped for an empty or invalid model keeps its configured effort on the DEFAULT_TIERS fallback (assembleConfig's shaperEffort / summariserEffort)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a global tier dropped for an empty or invalid model keeps its configured effort on the DEFAULT_TIERS fallback (assembleConfig's shaperEffort / summariserEffort) | `src/config/__tests__/tier-defaults.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/analyze-tiering.test.ts` | 0 | 11 | 0.6 s |  |
| `src/config/__tests__/tier-defaults.test.ts` | 0 | 5 | 0.6 s |  |

## t2

Run at 2026-10-23T06:22:45.539Z on commit `b381c71a`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the catalog declares models.tiers.{core,mid,cheap}.effort as enum ['', 'low','medium','high','xhigh','max'] with default '' (48 rows)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the catalog declares models.tiers.{core,mid,cheap}.effort as enum ['', 'low','medium','high','xhigh','max'] with default '' (48 rows) | `src/config/__tests__/config-catalog-contract.test.ts` |
| pass | real CONFIG_CATALOG self-consistency: every row in-domain, every default satisfies its predicate | `src/config/__tests__/config-catalog-contract.test.ts` |
| pass | reconcileConfig({}, CONFIG_CATALOG) is idempotent on the real catalog — second pass changed === false | `src/config/__tests__/config-catalog-contract.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/config-catalog-contract.test.ts` | 0 | 12 | 0.4 s |  |

## t3

Run at 2026-10-23T06:25:20.630Z on commit `67d06da3`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: with effort, claude invocations carry --effort <e> and codex invocations carry -c model_reasoning_effort=<e>, in complete, structured, edit session and both review sessions**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with effort, claude invocations carry --effort <e> and codex invocations carry -c model_reasoning_effort=<e>, in complete, structured, edit session and both review sessions | `src/agent/providers/__tests__/cli-review-session.test.ts` |

**unit: without effort every argv is byte-identical to today's**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | without effort every argv is byte-identical to today's | `src/agent/providers/__tests__/cli-review-session.test.ts` |
| pass | one-shot calls and the edit session build the same arguments as before | `src/agent/providers/__tests__/cli-review-session.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/agent/providers/__tests__/cli-review-session.test.ts` | 0 | 18 | 15.6 s |  |

## t4

Run at 2026-10-23T06:28:10.027Z on commit `a7d23ea1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: the role router takes the effort of the global tier the role resolves to, also when a byRepo tier supplies its runner and model, and buildShaperProvider hands it to CliProvider; the Ollama branch ignores it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the role router takes the effort of the global tier the role resolves to, also when a byRepo tier supplies its runner and model, and buildShaperProvider hands it to CliProvider; the Ollama branch ignores it | `src/analyze/context/__tests__/tier-effort-routing.test.ts` |

**unit: buildShaperProvider without roleEffort uses cfg.shaperEffort (code-review-rpc, workflow-rpc and docgen callers), also when a repo override sets the runner; buildSummariserProvider and resolveSummariser use cfg.summariserEffort; resolveValidateProvider passes the build tier's effort**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | buildShaperProvider without roleEffort uses cfg.shaperEffort (code-review-rpc, workflow-rpc and docgen callers), also when a repo override sets the runner; buildSummariserProvider and resolveSummariser use cfg.summariserEffort; resolveValidateProvider passes the build tier's effort | `src/analyze/context/__tests__/tier-effort-routing.test.ts` |

**unit: with the core tier's effort set and the mid tier's unset, a routed mid role's provider gets no effort flag (roleEffort null), while a non-router caller gets the core effort**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | with the core tier's effort set and the mid tier's unset, a routed mid role's provider gets no effort flag (roleEffort null), while a non-router caller gets the core effort | `src/analyze/context/__tests__/tier-effort-routing.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/tier-effort-routing.test.ts` | 0 | 3 | 0.6 s |  |

## t5

Run at 2026-10-23T06:30:56.692Z on commit `8a6de98d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: TUI ModelTiersPane shows an effort row per tier, cycles CLI default/low/medium/high/xhigh/max and writes models.tiers.<tier>.effort**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | TUI ModelTiersPane shows an effort row per tier, cycles CLI default/low/medium/high/xhigh/max and writes models.tiers.<tier>.effort | `src/cli/__tests__/tui.test.ts` |

**unit: computeEffectiveTiers shows a tier's effort, including tiering.efforts on a DEFAULT_TIERS fallback: core.model '' with core.effort 'high' shows effort high**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | computeEffectiveTiers shows a tier's effort, including tiering.efforts on a DEFAULT_TIERS fallback: core.model '' with core.effort 'high' shows effort high | `src/cli/__tests__/model-tiers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/model-tiers.test.ts` | 0 | 16 | 0.6 s |  |
| `src/cli/__tests__/tui.test.ts` | 0 | 23 | 2.8 s |  |

## t6

Run at 2026-10-23T06:33:15.463Z on commit `a525aa3a`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: VS Code manifest declares insrc.models.tiers.<tier>.effort matching the catalog, and the tier picker offers an effort step for CLI runners and writes ['models','tiers',tier,'effort'] (from the plugin's bundled catalog, whatever the daemon's)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | VS Code manifest declares insrc.models.tiers.<tier>.effort matching the catalog, and the tier picker offers an effort step for CLI runners and writes ['models','tiers',tier,'effort'] (from the plugin's bundled catalog, whatever the daemon's) | `vscode-plugin/src/models/__tests__/tier-effort.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/models/__tests__/tier-effort.test.ts` | 0 | 1 | 0.4 s |  |

## t7

Run at 2026-10-23T06:37:52.885Z on commit `f3f822b6`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: JetBrains ModelTiersModel seeds effort from the catalog, tracks a pending effort and collectWrites emits the effort write; ModelTiersSection shows an effort combo per tier; with no effort row in the daemon's catalog it shows no effort combo and emits no effort write**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | JetBrains ModelTiersModel seeds effort from the catalog, tracks a pending effort and collectWrites emits the effort write; ModelTiersSection shows an effort combo per tier; with no effort row in the daemon's catalog it shows no effort combo and emits no effort write | `jetbrains-plugin/__tests__/model-tiers-effort-gradle.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `jetbrains-plugin/__tests__/model-tiers-effort-gradle.test.ts` | 0 | 1 | 11 s |  |

## t8

Run at 2026-10-23T07:00:48.894Z on commit `3c7e94e1`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**live: a codex CliProvider with model gpt-6.1-sol and effort high runs and codex reports reasoning effort high**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/add-per-tier-reasoning-effort-setting-E20261023a27df028/S001/evidence/t8-live-effort.md (src/agent/providers/__tests__/cli-effort.live.test.ts, INSRC_LIVE_TESTS=1, ok 1)

**live: a claude CliProvider with effort low runs, and claude given an unknown --effort value warns and runs at its default**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/standalone/add-per-tier-reasoning-effort-setting-E20261023a27df028/S001/evidence/t8-live-effort.md (src/agent/providers/__tests__/cli-effort.live.test.ts, INSRC_LIVE_TESTS=1, ok 2)
