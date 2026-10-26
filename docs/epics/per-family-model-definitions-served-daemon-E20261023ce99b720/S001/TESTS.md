<!-- insrc:artifact TESTS-ce99b72065d03b1b-s1 -->

# Tests: ce99b72065d03b1b s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 30 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T14:58:56.690Z on commit `b5a5864cb`. Tests check: **passed**. 8 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-catalog.test.ts: one synchronous refusal per fixture reason, each naming the entry and rule (incl. the three tier-default effort fixtures)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog.test.ts: one synchronous refusal per fixture reason, each naming the entry and rule (incl. the three tier-default effort fixtures) | `src/daemon/__tests__/model-catalog.test.ts` |

**unit: model-catalog.test.ts: validateModelCatalog returns and caches the frozen file; a second call does not re-read**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog.test.ts: validateModelCatalog returns and caches the frozen file; a second call does not re-read | `src/daemon/__tests__/model-catalog.test.ts` |

**unit: model-catalog.test.ts: getCuratedCatalog().modelsFor projects each CLI family's listed models in file order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog.test.ts: getCuratedCatalog().modelsFor projects each CLI family's listed models in file order | `src/daemon/__tests__/model-catalog.test.ts` |

**unit: model-catalog-asset.test.ts: shipped asset validates, ships via copy-assets, lists today's models and aliases, and its tier defaults and summariser models equal DEFAULT_TIERS, the installer Codex block and SUMMARISER_CLI_FALLBACK**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog-asset.test.ts: shipped asset validates, ships via copy-assets, lists today's models and aliases, and its tier defaults and summariser models equal DEFAULT_TIERS, the installer Codex block and SUMMARISER_CLI_FALLBACK | `src/daemon/__tests__/model-catalog-asset.test.ts` |

**unit: list-models.test.ts: existing suite passes unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | listModels('cli-claude') -> curated list mapped from CatalogModel, available:true | `src/daemon/__tests__/list-models.test.ts` |
| pass | listModels('cli-codex') -> the cli-codex curated list, available:true | `src/daemon/__tests__/list-models.test.ts` |
| pass | integration: listModels(cloud) sources from the REAL getCuratedCatalog after validateModelCatalog | `src/daemon/__tests__/list-models.test.ts` |
| pass | handler map: 'providers.listModels' is a real handler delegating to listModels, not offlineRpc (lc1) | `src/daemon/__tests__/list-models.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/list-models.test.ts` | 0 | 14 | 0.6 s |  |
| `src/daemon/__tests__/model-catalog-asset.test.ts` | 0 | 1 | 0.6 s |  |
| `src/daemon/__tests__/model-catalog.test.ts` | 0 | 7 | 0.6 s |  |

## t2

Run at 2026-10-25T15:03:14.144Z on commit `1bf924c76`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: model-registry.test.ts: families/defaultFamily/models/find/tierDefault/summariserModel/toolLoopModel/cliKind against the minimal fixture**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: families/defaultFamily/models/find/tierDefault/summariserModel/toolLoopModel/cliKind against the minimal fixture | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: store fixtures (absent, malformed, wrong shape, one bad entry, shadowed approval, approved-vs-rejected by decidedAt) yield the stated models() and rejected()**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: store fixtures (absent, malformed, wrong shape, one bad entry, shadowed approval, approved-vs-rejected by decidedAt) yield the stated models() and rejected() | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: effortLevels includes an approved-only effort after its family's shipped efforts and excludes rejected or shadowed efforts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: effortLevels includes an approved-only effort after its family's shipped efforts and excludes rejected or shadowed efforts | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: resolveTier keeps an accepted effort, drops an unaccepted one, falls back with rejected-model vs unlisted-model, uses the default family for an Ollama tier, and an alias-named default's effort is returned and accepted**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: resolveTier keeps an accepted effort, drops an unaccepted one, falls back with rejected-model vs unlisted-model, uses the default family for an Ollama tier, and an alias-named default's effort is returned and accepted | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: ac2 fixture after reset serves the new model, alias and 'turbo' through models(), find(), effortLevels(), resolveTier() and getCuratedCatalog()**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: ac2 fixture after reset serves the new model, alias and 'turbo' through models(), find(), effortLevels(), resolveTier() and getCuratedCatalog() | `src/daemon/__tests__/model-registry.test.ts` |

**unit: model-registry.test.ts: getModelRegistry() returns the same cached registry after the file changes on disk**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-registry.test.ts: getModelRegistry() returns the same cached registry after the file changes on disk | `src/daemon/__tests__/model-registry.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/model-registry.test.ts` | 0 | 6 | 0.7 s |  |

## t3

Run at 2026-10-25T15:08:22.424Z on commit `e171c119f`. Tests check: **passed**. 14 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: worker-model-registry.test.ts: a worker started with INSRC_MODEL_CATALOG_DIR pointing at a corrupted copy fails its start with ModelCatalogValidationError**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | worker-model-registry.test.ts: a worker started with INSRC_MODEL_CATALOG_DIR pointing at a corrupted copy fails its start with ModelCatalogValidationError | `src/daemon/threads/__tests__/worker-model-registry.test.ts` |

**integration: worker-model-registry.test.ts: a worker started after the asset copy and store changed reports the new models while the main thread's registry keeps the old ones**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | worker-model-registry.test.ts: a worker started after the asset copy and store changed reports the new models while the main thread's registry keeps the old ones | `src/daemon/threads/__tests__/worker-model-registry.test.ts` |

**integration: worker-stores, supervisor and threads-boot suites pass unchanged with the shipped asset**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a worker that has not declared the store owner is refused on the live LMDB and Lance paths, and startDaemonWorker refuses a main thread | `src/daemon/threads/__tests__/worker-stores.test.ts` |
| pass | no module outside src/daemon and src/db calls declareLiveStoreOwner | `src/daemon/threads/__tests__/worker-stores.test.ts` |
| pass | a reader on one thread sees only whole LMDB transactions while a worker writes, and vectors never precede their graph row | `src/daemon/threads/__tests__/worker-stores.test.ts` |
| pass | two workers' artifact-vector and config writes are read back from a third thread | `src/daemon/threads/__tests__/worker-stores.test.ts` |
| pass | a throwing withWriteTxn callback on a worker leaves none of its writes visible to the main thread | `src/daemon/threads/__tests__/worker-stores.test.ts` |
| pass | a daemon worker and the main thread contend for the same named lock | `src/daemon/threads/__tests__/worker-stores.test.ts` |
| pass | admin, code-indexing and summary workers killed in turn: in-flight requests error, the worker is replaced, other threads keep serving | `src/daemon/threads/__tests__/supervisor.test.ts` |
| pass | a sixth restart within 60 s shuts the daemon down | `src/daemon/threads/__tests__/supervisor.test.ts` |
| pass | a dead worker's store-guard permits and named locks are reclaimed before its replacement starts | `src/daemon/threads/__tests__/supervisor.test.ts` |
| pass | the daemon boots with daemon.threads.enabled, answers admin, indexing and session methods through its threads, and shuts down | `src/daemon/threads/__tests__/threads-boot.test.ts` |
| pass | SIGTERM during an indexing pass: workers stop, the queue drains, the main thread closes the stores after the workers exit, 'bye' is logged | `src/daemon/threads/__tests__/threads-boot.test.ts` |
| pass | daemon.shutdown during maintenance is refused with the activity and reason; SIGTERM during maintenance waits for the compaction and then shuts down | `src/daemon/threads/__tests__/threads-boot.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/threads/__tests__/supervisor.test.ts` | 0 | 3 | 10.4 s |  |
| `src/daemon/threads/__tests__/threads-boot.test.ts` | 0 | 3 | 15.3 s |  |
| `src/daemon/threads/__tests__/worker-model-registry.test.ts` | 0 | 2 | 0.9 s |  |
| `src/daemon/threads/__tests__/worker-stores.test.ts` | 0 | 6 | 2.6 s |  |

## t4

Run at 2026-10-25T15:11:02.264Z on commit `5aa9be4be`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: boot-model-catalog.test.ts: daemon entry in a temp home with INSRC_MODEL_CATALOG_DIR pointing at a corrupted copy exits non-zero with the error naming the entry, writes no config.json and never creates the socket**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | boot-model-catalog.test.ts: daemon entry in a temp home with INSRC_MODEL_CATALOG_DIR pointing at a corrupted copy exits non-zero with the error naming the entry, writes no config.json and never creates the socket | `src/daemon/__tests__/boot-model-catalog.test.ts` |

**integration: boot-model-catalog.test.ts: with the shipped asset the daemon boots and listens**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | boot-model-catalog.test.ts: with the shipped asset the daemon boots and listens | `src/daemon/__tests__/boot-model-catalog.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/__tests__/boot-model-catalog.test.ts` | 0 | 2 | 3 s |  |
