<!-- insrc:artifact TESTS-b220bb6174a2f5ed-s1 -->

# Tests: b220bb6174a2f5ed s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 21 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-30T03:55:04.862Z on commit `2b26eac4e`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-catalog.test.ts: the five-family fixture with ollama-claude and cli-vibe validates**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog.test.ts: the five-family fixture with ollama-claude and cli-vibe validates | `src/daemon/__tests__/model-catalog.test.ts` |

**unit: model-catalog.test.ts: a host family missing host, cliKind or a model's hosting, or carrying tierDefaults or summariserModel, fails naming the family and field**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog.test.ts: a host family missing host, cliKind or a model's hosting, or carrying tierDefaults or summariserModel, fails naming the family and field | `src/daemon/__tests__/model-catalog.test.ts` |

**unit: model-catalog.test.ts: hosting on a vendor or plain-Ollama model fails**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog.test.ts: hosting on a vendor or plain-Ollama model fails | `src/daemon/__tests__/model-catalog.test.ts` |

**unit: model-catalog.test.ts: the existing families validate as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog.test.ts: the existing families validate as before | `src/daemon/__tests__/model-catalog.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/model-catalog.test.ts` | 0 | 10 | 0.6 s |  |

## t2

Run at 2026-10-30T03:59:07.459Z on commit `962f3f0a8`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-registry.test.ts: host() is 'ollama' only for ollama-claude and cliKind() is 'claude' for it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: host() is 'ollama' only for ollama-claude and cliKind() is 'claude' for it | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: resolveTier on a host family resolves a declared model and alias**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: resolveTier on a host family resolves a declared model and alias | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: an effort a host model does not list is dropped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: an effort a host model does not list is dropped | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: resolveTier on a host family with an undeclared model returns model undefined and fallback 'model-not-supported' and substitutes nothing**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: resolveTier on a host family with an undeclared model returns model undefined and fallback 'model-not-supported' and substitutes nothing | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: resolveTier on cli-claude, cli-codex and ollama is unchanged, including the unlisted and rejected fallbacks**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: resolveTier on cli-claude, cli-codex and ollama is unchanged with a host family present, including the unlisted and rejected fallbacks | `src/daemon/__tests__/model-registry.test.ts` |
| pass | model-registry.test.ts: resolveTier keeps an accepted effort, drops an unaccepted one, falls back with rejected-model vs unlisted-model, uses the default family for an Ollama tier, and an alias-named default's effort is returned and accepted | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: familyForClient returns cli-claude, cli-codex and cli-vibe as today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: familyForClient returns cli-claude, cli-codex and cli-vibe as today | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: effortLevels over five families keeps today's levels and order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: effortLevels over five families keeps today's levels and order | `src/daemon/__tests__/model-registry.test.ts` |

**unit: tier-resolution.test.ts: resolveTierWith logs and tierModelOf reports the refusal without reading a missing model**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | tier-resolution.test.ts: resolveTierWith logs and tierModelOf reports the refusal without reading a missing model | `src/config/__tests__/tier-resolution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/tier-resolution.test.ts` | 0 | 5 | 1.3 s |  |
| `src/daemon/__tests__/model-registry.test.ts` | 0 | 14 | 0.9 s |  |

## t3

Run at 2026-10-30T04:03:49.167Z on commit `a4f470c5b`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-check.test.ts: the unknown-model check refuses a host family**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-check.test.ts: the unknown-model check refuses a host family | `src/daemon/__tests__/model-check.test.ts` |

**unit: config-write-models.test.ts: the tier write's model check treats a host family as not open to unlisted ids**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | config-write-models.test.ts: the tier write's model check treats a host family as not open to unlisted ids | `src/daemon/__tests__/config-write-models.test.ts` |

**unit: model-registry.test.ts: an approved-model store entry naming ollama-claude is skipped**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: an approved-model store entry naming ollama-claude is skipped | `src/daemon/__tests__/model-registry.test.ts` |

**unit: attribution.test.ts: an 'ollama-claude:<model>' run label is attributed to ollama-claude, not cli-claude**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | attribution.test.ts: an 'ollama-claude:<model>' run label is attributed to ollama-claude, not cli-claude | `src/workflow/__tests__/attribution.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/config-write-models.test.ts` | 0 | 4 | 1 s |  |
| `src/daemon/__tests__/model-check.test.ts` | 0 | 15 | 10.2 s |  |
| `src/daemon/__tests__/model-registry.test.ts` | 0 | 15 | 0.7 s |  |
| `src/workflow/__tests__/attribution.test.ts` | 0 | 13 | 0.4 s |  |

## t4

Run at 2026-10-30T04:07:05.302Z on commit `2b0806e86`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-definitions.test.ts: projectDefinitions lists ollama-claude with host and every model's hosting**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-definitions.test.ts: projectDefinitions lists ollama-claude with host and every model's hosting | `src/daemon/__tests__/model-definitions.test.ts` |

**unit: model-definitions.test.ts: a host-family model with efforts lists them and one without lists []**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-definitions.test.ts: a host-family model with efforts lists them and one without lists [] | `src/daemon/__tests__/model-definitions.test.ts` |

**unit: model-definitions.test.ts: the existing families' answer entries equal today's, and the host family carries neither rejectedModels nor installed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-definitions.test.ts: the existing families' answer entries equal today's, and the host family carries neither rejectedModels nor installed | `src/daemon/__tests__/model-definitions.test.ts` |
| pass | model-definitions.test.ts: every sc3 field of a fixture file, aliases always a list, optional fields omitted | `src/daemon/__tests__/model-definitions.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/model-definitions.test.ts` | 0 | 7 | 0.6 s |  |
