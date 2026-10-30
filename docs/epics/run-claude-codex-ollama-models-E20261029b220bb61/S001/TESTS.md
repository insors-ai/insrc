<!-- insrc:artifact TESTS-b220bb6174a2f5ed-s1 -->

# Tests: b220bb6174a2f5ed s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 13 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

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
