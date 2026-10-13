<!-- insrc:artifact TESTS-b2e8109f42afc0dd-S001 -->

# Tests: b2e8109f42afc0dd S001

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 12 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-10-13T08:48:39.843Z on commit `1c43f9ad`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: parsePatch: one entry per section, with path, ranges, counts and lines, for two sections of one file**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parsePatch: one entry per section, with path, ranges, counts and lines, for two sections of one file | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: parsePatch: a new file, a deleted file, a binary file, a name with a space and a quoted name**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parsePatch: a new file, a deleted file, a binary file, a name with a space and a quoted name | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: parsePatch: a section over 400 lines is cut, the rest counted in omitted, and added and removed count the whole section**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parsePatch: a section over 400 lines is cut, the rest counted in omitted, and added and removed count the whole section | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: parsePatch: an empty patch gives no sections and an unreadable file part is skipped without a throw**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | parsePatch: an empty patch gives no sections and an unreadable file part is skipped without a throw | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: reconcileSections: a new section is added, an unchanged one gives no operation and a changed one is updated under the same id**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconcileSections: a new section is added, an unchanged one gives no operation and a changed one is updated under the same id | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: reconcileSections: sections that join update the lower id and withdraw the other, and a section that is gone is withdrawn**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconcileSections: sections that join update the lower id and withdraw the other, and a section that is gone is withdrawn | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**unit: reconcileSections: beyond the limit new sections are kept hidden, counted in overflow, and never produce an operation later**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | reconcileSections: beyond the limit new sections are kept hidden, counted in overflow, and never produce an operation later | `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/diff-sections.test.ts` | 0 | 7 | 0.3 s |  |

## t2

Run at 2026-10-13T08:51:32.861Z on commit `78676aa7`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: git-baseline: snapshot resolves the printed index path against cwd, copies it, adds and writes a tree with GIT_INDEX_FILE set to the copy, and returns the tree id and the copy's path**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-baseline: snapshot resolves the printed index path against cwd, copies it, adds and writes a tree with GIT_INDEX_FILE set to the copy, and returns the tree id and the copy's path | `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` |

**unit: git-baseline: changes returns an empty string for an unchanged tree, the patch for a changed one and undefined when write-tree or diff fails**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-baseline: changes returns an empty string for an unchanged tree, the patch for a changed one and undefined when write-tree or diff fails | `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` |

**unit: git-baseline: read resolves a path with show <tree>:./<rel> and gives undefined for a path not in the tree**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-baseline: read resolves a path with show <tree>:./<rel> and gives undefined for a path not in the tree | `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` |

**unit: git-baseline: release removes the private index, and a failed git add does not fail snapshot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-baseline: release removes the private index, and a failed git add does not fail snapshot | `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` |

**integration: git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-baseline (real git): tracked, untracked, new, deleted, binary and ignored files in a subfolder give the expected sections, read returns start content from the tree id, and the index and status are unchanged | `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `vscode-plugin/src/chat/__tests__/git-baseline.integration.test.ts` | 0 | 1 | 0.5 s |  |
| `vscode-plugin/src/chat/__tests__/git-baseline.test.ts` | 0 | 4 | 0.3 s |  |
