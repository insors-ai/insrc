<!-- insrc:artifact TESTS-ab934d0926ef5dc7-s1 -->

# Tests: ab934d0926ef5dc7 S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## S001

Run at 2026-10-16T11:21:26.689Z on commit `bb671eb9`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/cli/__tests__/model-tiers.test.ts: empty tiering: tiers = DEFAULT_TIERS (source default), coreFloor = mid (default)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | empty tiering: tiers = DEFAULT_TIERS (source default), coreFloor = mid (default) | `src/cli/__tests__/model-tiers.test.ts` |

**unit: src/config/__tests__/tier-defaults.test.ts: the config catalog's cheap and mid tier defaults equal DEFAULT_TIERS**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/config/__tests__/tier-defaults.test.ts: the config catalog's cheap and mid tier defaults equal DEFAULT_TIERS | `src/config/__tests__/tier-defaults.test.ts` |

**unit: src/analyze/context/__tests__/role-router.test.ts: a configured cheap tier wins over the built-in cheap default**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | a configured cheap tier wins over the built-in cheap default | `src/analyze/context/__tests__/role-router.test.ts` |

**unit: src/config/__tests__/tier-defaults.test.ts: the summariser follows the cheap tier and pins its model for a CLI, so the built-in default runs the Claude CLI on haiku**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/config/__tests__/tier-defaults.test.ts: the summariser follows the cheap tier and pins its model for a CLI, so the built-in default runs the Claude CLI on haiku | `src/config/__tests__/tier-defaults.test.ts` |

**contract: src/config/__tests__/tier-defaults.test.ts: the installer's claude choice writes cheap cli-claude haiku and its codex choice writes gpt-6-astra, gpt-6.1-sol and gpt-6-luna**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/config/__tests__/tier-defaults.test.ts: the installer's claude choice writes cheap cli-claude haiku and its codex choice writes gpt-6-astra, gpt-6.1-sol and gpt-6-luna | `src/config/__tests__/tier-defaults.test.ts` |

**contract: src/config/__tests__/tier-defaults.test.ts: the plugin's copy of the installer is identical to the script**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/config/__tests__/tier-defaults.test.ts: the plugin's copy of the installer is identical to the script | `src/config/__tests__/tier-defaults.test.ts` |

**contract: src/daemon/__tests__/model-catalog-asset.test.ts: the shipped cloud model catalog lists the three GPT-6 Codex models**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/__tests__/model-catalog-asset.test.ts: the shipped cloud model catalog lists the three GPT-6 Codex models | `src/daemon/__tests__/model-catalog-asset.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/analyze/context/__tests__/role-router.test.ts` | 0 | 17 | 0.4 s |  |
| `src/cli/__tests__/model-tiers.test.ts` | 0 | 15 | 0.4 s |  |
| `src/config/__tests__/tier-defaults.test.ts` | 0 | 4 | 0.4 s |  |
| `src/daemon/__tests__/model-catalog-asset.test.ts` | 0 | 1 | 0.4 s |  |
