<!-- insrc:artifact TESTS-1e2052060dec3efb-s1 -->

# Tests: 1e2052060dec3efb s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## s1

Run at 2026-11-28T05:05:18.039Z on commit `a1bdc2567`. Tests check: **passed**. 9 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths (no missing, no extra)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths (no missing, no extra) | `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` |

**unit: each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each declared key's type/enum/default matches its ConfigOption, and scope is 'machine' | `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` |

**unit: declared insrc.models.tasks.* keys EXACTLY cover the role taxonomy (no missing, no extra)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | declared insrc.models.tasks.* keys EXACTLY cover the role taxonomy (no missing, no extra) | `vscode-plugin/src/config/__tests__/per-role.test.ts` |

**unit: each per-role key is a machine-scoped enum with default = the role's defaultTier**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | each per-role key is a machine-scoped enum with default = the role's defaultTier | `vscode-plugin/src/config/__tests__/per-role.test.ts` |

**unit: sync-manifest-catalog.test.ts: the committed manifest is in sync, and the script is idempotent on a stale copy**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sync-manifest-catalog.test.ts: the committed manifest is in sync, and the script is idempotent on a stale copy | `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` |

**unit: sync-manifest-catalog.test.ts: a stale copy missing the security section and the final role, carrying a retired role and a corrupted role schema, is reported by --check without writing, repaired by one sync, and byte-identical on the next, with explicit surviving and appended key order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sync-manifest-catalog.test.ts: a stale copy missing the security section and the final role, carrying a retired role and a corrupted role schema, is reported by --check without writing, repaired by one sync, and byte-identical on the next, with explicit surviving and appended key order | `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` |

**unit: sync-manifest-catalog.test.ts: a misplaced or duplicated per-role key is removed from its wrong section and regenerated in the canonical section, while unrelated local keys survive**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sync-manifest-catalog.test.ts: a misplaced or duplicated per-role key is removed from its wrong section and regenerated in the canonical section, while unrelated local keys survive | `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` |

**unit: sync-manifest-catalog.test.ts: duplicate per-role sections consolidate losslessly (first section metadata kept, distinct local properties merged first-wins) and a colliding local key is refused with a diagnostic**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | sync-manifest-catalog.test.ts: duplicate per-role sections consolidate losslessly (first section metadata kept, distinct local properties merged first-wins) and a colliding local key is refused with a diagnostic | `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` |

**unit: vscode-bundle-catalog.test.ts: the extension type-checks and bundles; its key map, loaded without backend node_modules, maps every settings-catalog row without bundling the catalog or the definitions file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | vscode-bundle-catalog.test.ts: the extension type-checks and bundles; its key map, loaded without backend node_modules, maps every settings-catalog row without bundling the catalog or the definitions file | `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/config/__tests__/manifest-catalog.test.ts` | 0 | 2 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/per-role.test.ts` | 0 | 8 | 0.4 s |  |
| `vscode-plugin/src/config/__tests__/sync-manifest-catalog.test.ts` | 0 | 4 | 2 s |  |
| `vscode-plugin/src/config/__tests__/vscode-bundle-catalog.test.ts` | 0 | 1 | 6.2 s |  |
