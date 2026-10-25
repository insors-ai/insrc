<!-- insrc:artifact TESTS-ce99b72065d03b1b-s3 -->

# Tests: ce99b72065d03b1b s3

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T20:01:03.859Z on commit `59060e68a`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: config-catalog-defs.test.ts: buildConfigCatalog(fixture) takes runner/model/effort defaults, effort enums and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row; loadBuiltCatalog accepts the built catalog**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | config-catalog-defs.test.ts: buildConfigCatalog(fixture) takes runner/model/effort defaults, effort enums and coreModel default from the fixture; CONFIG_CATALOG equals buildConfigCatalog(shipped); no ollamaNumCtx row; loadBuiltCatalog accepts the built catalog | `src/config/__tests__/config-catalog-defs.test.ts` |
| pass | the real CONFIG_CATALOG has 47 rows (models.shaper.ollamaNumCtx retired; flat models.* surface; shaper*/summariser* now derived; + three models.tiers.*.effort rows + codeReview.enforce + codeReview.freshnessTimeoutMs + codeReview.daemonReviewCeilingMs + codeReview.daemonReviewIdleMs + models.local.embeddingKeepAlive + five designReview.* rows + analyzer.dataSourceListingTimeoutMs + review.chunkTokens + daemon.threads.enabled + four daemon.maintenance.* rows) | `src/config/__tests__/config-catalog-contract.test.ts` |

**unit: config-catalog-defs.test.ts: model-defaults and config-catalog import no logger, registry or file-I/O module and derive without throwing from a fixture missing fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | config-catalog-defs.test.ts: model-defaults and config-catalog import no logger, registry or file-I/O module and derive without throwing from a fixture missing fields | `src/config/__tests__/config-catalog-defs.test.ts` |

**unit: check-model-definitions.test.ts: the build gate exits non-zero naming the entry for a structurally invalid copy and zero for the shipped file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | check-model-definitions.test.ts: the build gate exits non-zero naming the entry for a structurally invalid copy and zero for the shipped file | `src/config/__tests__/check-model-definitions.test.ts` |

**unit: model-catalog-asset.test.ts: Codex models carry the 1048576-char inputLimit**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | model-catalog-asset.test.ts: Codex models carry the 1048576-char inputLimit | `src/daemon/__tests__/model-catalog-asset.test.ts` |

**unit: session-source-inventory suite passes after t1**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | CM-S3-INVENTORY: production boundaries have explicit reviewed classifications and unchanged baseline | `src/daemon/db/__tests__/session-source-inventory.test.ts` |
| pass | CM-S3-INVENTORY: renamed and destructured provider resolver factory serializer and filesystem APIs are discovered | `src/daemon/db/__tests__/session-source-inventory.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/config/__tests__/check-model-definitions.test.ts` | 0 | 1 | 1.1 s |  |
| `src/config/__tests__/config-catalog-contract.test.ts` | 0 | 12 | 0.4 s |  |
| `src/config/__tests__/config-catalog-defs.test.ts` | 0 | 2 | 1.1 s |  |
| `src/daemon/__tests__/model-catalog-asset.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/db/__tests__/session-source-inventory.test.ts` | 0 | 2 | 13.2 s |  |
