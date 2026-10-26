<!-- insrc:artifact TESTS-ce99b72065d03b1b-s2 -->

# Tests: ce99b72065d03b1b s2

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 16 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T16:59:44.201Z on commit `9a4b23b89`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-definitions.test.ts: every sc3 field of a fixture file, aliases always a list, optional fields omitted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-definitions.test.ts: every sc3 field of a fixture file, aliases always a list, optional fields omitted | `src/daemon/__tests__/model-definitions.test.ts` |

**unit: model-definitions.test.ts: user-approved after shipped; unlisted rejected id only in rejectedModels; a rejected id the file lists is served as shipped and left out of rejectedModels**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-definitions.test.ts: user-approved after shipped; unlisted rejected id only in rejectedModels; a rejected id the file lists is served as shipped and left out of rejectedModels | `src/daemon/__tests__/model-definitions.test.ts` |

**unit: model-definitions.test.ts: installed exact-match true/false, absent when the lister rejects, unlisted installed models absent**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-definitions.test.ts: installed exact-match true/false, absent when the lister rejects, unlisted installed models absent | `src/daemon/__tests__/model-definitions.test.ts` |

**unit: handler-runtime, method-class and session-source-inventory suites pass with models.definitions registered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | the runtime function builds the handler tables with stub indexing dependencies and their key sets equal the recorded single-thread key sets | `src/daemon/__tests__/handler-runtime.test.ts` |
| pass | classOf/entries: the ten admin and ten indexing methods have their class, every other entry is session, entries unique | `src/daemon/threads/__tests__/method-class.test.ts` |
| pass | coverage: the method set equals the keys of the constructed rpcHandlers and streamHandlers after all merges, failing on a missing or a stale entry | `src/daemon/threads/__tests__/method-class.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/handler-runtime.test.ts` | 0 | 1 | 1 s |  |
| `src/daemon/__tests__/model-definitions.test.ts` | 0 | 3 | 0.5 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 11.5 s |  |
| `src/daemon/threads/__tests__/method-class.test.ts` | 0 | 3 | 1.1 s |  |

## t2

Run at 2026-10-25T17:12:10.651Z on commit `db5e76dc7`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: list-models.test.ts: CLI families from the projection without calling the lister; ollama installed-and-listed only; available:false + [] on a rejecting lister; invalid params unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | list-models.test.ts: CLI families from the projection without calling the lister; ollama installed-and-listed only; available:false + [] on a rejecting lister; invalid params unchanged | `src/daemon/__tests__/list-models.test.ts` |

**unit: list-models.test.ts: for every family listModels agrees with models.definitions, and an installed unlisted Ollama model appears in neither**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | list-models.test.ts: for every family listModels agrees with models.definitions, and an installed unlisted Ollama model appears in neither | `src/daemon/__tests__/list-models.test.ts` |

**unit: list-models.test.ts: no file under src imports getCuratedCatalog, CuratedCatalog or CatalogModel**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | list-models.test.ts: no file under src imports getCuratedCatalog, CuratedCatalog or CatalogModel | `src/daemon/__tests__/list-models.test.ts` |

**unit: model-catalog, model-registry and session-source-inventory suites pass without the curated accessor**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog.test.ts: one synchronous refusal per fixture reason, each naming the entry and rule (incl. the three tier-default effort fixtures) | `src/daemon/__tests__/model-catalog.test.ts` |
| pass | model-catalog.test.ts: validateModelCatalog returns and caches the frozen file; a second call does not re-read | `src/daemon/__tests__/model-catalog.test.ts` |
| pass | model-registry.test.ts: ac2 fixture after reset serves the new model, alias and 'turbo' through models(), find(), effortLevels(), resolveTier() and the models.definitions projection | `src/daemon/__tests__/model-registry.test.ts` |
| pass | model-registry.test.ts: store fixtures (absent, malformed, wrong shape, one bad entry, shadowed approval, approved-vs-rejected by decidedAt) yield the stated models() and rejected() | `src/daemon/__tests__/model-registry.test.ts` |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/list-models.test.ts` | 0 | 7 | 0.8 s |  |
| `src/daemon/__tests__/model-catalog.test.ts` | 0 | 5 | 0.6 s |  |
| `src/daemon/__tests__/model-registry.test.ts` | 0 | 6 | 0.5 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 10.5 s |  |

## t3

Run at 2026-10-25T17:13:47.481Z on commit `7f489cb87`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: models-definitions-daemon.test.ts: a real daemon answers models.definitions with the three shipped families and providers.listModels('cli-claude') agrees with it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | models-definitions-daemon.test.ts: a real daemon answers models.definitions with the three shipped families and providers.listModels('cli-claude') agrees with it | `src/daemon/__tests__/models-definitions-daemon.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/models-definitions-daemon.test.ts` | 0 | 1 | 2.9 s |  |
