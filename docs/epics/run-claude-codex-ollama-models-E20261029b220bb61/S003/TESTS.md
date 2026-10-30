<!-- insrc:artifact TESTS-b220bb6174a2f5ed-s3 -->

# Tests: b220bb6174a2f5ed s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-30T07:54:20.022Z on commit `83f7a2625`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-tiers.test.ts: computeEffectiveTiers marks a host family's served model with its hosting and an undeclared one as notSupported; vendor, plain Ollama and host-less families are unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tiers.test.ts: computeEffectiveTiers marks a host family's served model with its hosting and an undeclared one as notSupported; vendor, plain Ollama and host-less families are unchanged | `src/cli/__tests__/model-tiers.test.ts` |

**unit: model-tiers.test.ts: resolveTypedModel refuses an unlisted id for a host family and keeps 'check' for a vendor CLI family; switchFamily to the host family takes its first declared model**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-tiers.test.ts: resolveTypedModel refuses an unlisted id for a host family and keeps 'check' for a vendor CLI family; switchFamily to the host family takes its first declared model | `src/cli/__tests__/model-tiers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/model-tiers.test.ts` | 0 | 19 | 0.7 s |  |

## t2

Run at 2026-10-30T07:53:11.199Z on commit `83f7a2625`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: tui-models.test.ts: 'f' reaches the Ollama-hosted runner and writes its first declared model as a whole tier, labelled cloud or local**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tui-models.test.ts: 'f' reaches the Ollama-hosted runner and writes its first declared model as a whole tier, labelled cloud or local | `src/cli/__tests__/tui-models.test.ts` |

**integration: tui-models.test.ts: on a host-family tier 'm' and 'e' cycle only declared values, 'n' is hidden and opens nothing, and a model with no efforts says so**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tui-models.test.ts: on a host-family tier 'm' and 'e' cycle only declared values, 'n' is hidden and opens nothing, and a model with no efforts says so | `src/cli/__tests__/tui-models.test.ts` |

**integration: tui-models.test.ts: an undeclared host-family model shows 'not supported ... will not run'; a vendor unserved model keeps the vendor note**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tui-models.test.ts: an undeclared host-family model shows 'not supported ... will not run'; a vendor unserved model keeps the vendor note | `src/cli/__tests__/tui-models.test.ts` |

**integration: tui-models.test.ts: a tier saved on the Ollama-hosted runner shows its runner, model, cloud/local label and effort after reload**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tui-models.test.ts: a tier saved on the Ollama-hosted runner shows its runner, model, cloud/local label and effort after reload | `src/cli/__tests__/tui-models.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/cli/__tests__/tui-models.test.ts` | 0 | 13 | 8.8 s |  |

## t3

Run at 2026-10-30T06:49:02.199Z on commit `304f3fc8d`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-literal-scan.test.ts: every CLI family id of the shipped definitions, including ollama-claude and cli-vibe, is flagged outside the owners**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-literal-scan.test.ts: every CLI family id of the shipped definitions, including ollama-claude and cli-vibe, is flagged outside the owners | `src/daemon/__tests__/model-literal-scan.test.ts` |
| pass | model-literal-scan.test.ts: the scan passes on the tree and fails on an injected literal; exclusions name their owning Story | `src/daemon/__tests__/model-literal-scan.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/model-literal-scan.test.ts` | 0 | 3 | 2.3 s |  |
