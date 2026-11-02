<!-- insrc:artifact TESTS-b7a68147dcf72034-s8 -->

# Tests: b7a68147dcf72034 s8

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 25 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## t1

Run at 2026-11-02T11:25:07.236Z on commit `7ab11caca`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: buildGitFamilyTool makes a flat input schema with an op enum and an output union carrying the literal op**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | op-table.test.ts: buildGitFamilyTool makes a flat input schema with an op enum and an output union carrying the literal op | `src/daemon/tools/builtins/git/__tests__/op-table.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: buildGitFamilyTool throws at build time for a duplicate op, an op without a class, a stdin op without a stdin field and disagreeing shared fields**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | op-table.test.ts: buildGitFamilyTool throws at build time for a duplicate op, an op without a class, a stdin op without a stdin field and disagreeing shared fields | `src/daemon/tools/builtins/git/__tests__/op-table.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: a field the op does not take and a value outside its pattern are refused before any approval request**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | op-table.test.ts: a field the op does not take and a value outside its pattern are refused before any approval request | `src/daemon/tools/builtins/git/__tests__/op-table.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: a cut stdout is a rejected failure and a result outside the answer member is a schema-mismatch failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | op-table.test.ts: a cut stdout is a rejected failure and a result outside the answer member is a schema-mismatch failure | `src/daemon/tools/builtins/git/__tests__/op-table.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: a stdin delivery error is a failure with no answer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | op-table.test.ts: a stdin delivery error is a failure with no answer | `src/daemon/tools/builtins/git/__tests__/op-table.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/op-table.test.ts: extendGitTool keeps existing inputs and classes and throws for a collision**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | op-table.test.ts: extendGitTool keeps existing inputs and classes and throws for a collision | `src/daemon/tools/builtins/git/__tests__/op-table.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/op-table.test.ts` | 0 | 6 | 0.7 s |  |

## t2

Run at 2026-11-02T11:43:54.697Z on commit `f0b9e481c`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_inspect covered rows run through executeTool in a temporary repository**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every covered row's case runs through executeTool and matches its assertion | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-inspect.test.ts: a no-match exit gives an empty answer and no git_inspect op asks for approval**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-inspect.test.ts: a no-match exit gives an empty answer and no git_inspect op asks for approval | `src/daemon/tools/builtins/git/__tests__/git-inspect.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 8 | 8.3 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-inspect.test.ts` | 0 | 1 | 0.7 s |  |

## t3

Run at 2026-11-02T11:48:15.963Z on commit `88f143d54`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_text covered rows receive their content and return the command's answer**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every covered row's case runs through executeTool and matches its assertion | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-text.test.ts: empty content, over-budget content and a failed delivery**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-text.test.ts: empty content, over-budget content and a failed delivery | `src/daemon/tools/builtins/git/__tests__/git-text.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 8 | 8.8 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-text.test.ts` | 0 | 1 | 0.7 s |  |

## t4

Run at 2026-11-02T11:52:24.595Z on commit `bda1575df`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_objects covered rows change the object, ref or index as the command does**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every covered row's case runs through executeTool and matches its assertion | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-objects.test.ts: destructive inputs are denied with no client before git starts and safe inputs are common**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-objects.test.ts: destructive inputs are denied with no client before git starts and safe inputs are common | `src/daemon/tools/builtins/git/__tests__/git-objects.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-objects.test.ts: a failed stdin delivery reports nothing as applied**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-objects.test.ts: a failed stdin delivery reports nothing as applied | `src/daemon/tools/builtins/git/__tests__/git-objects.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 8 | 9.3 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-objects.test.ts` | 0 | 2 | 0.7 s |  |

## t5

Run at 2026-11-02T12:00:27.851Z on commit `81a9b1ef4`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_patch covered rows produce or apply the patch, archive or bundle**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every covered row's case runs through executeTool and matches its assertion | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-patch.test.ts: an op writing a named file is destructive, the same op without one is not, and a denial leaves the file unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-patch.test.ts: an op writing a named file is destructive, the same op without one is not, and a denial leaves the file unchanged | `src/daemon/tools/builtins/git/__tests__/git-patch.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 8 | 10.2 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-patch.test.ts` | 0 | 1 | 0.7 s |  |

## t6

Run at 2026-11-02T12:15:56.035Z on commit `073a0e50e`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_tree covered rows change the working tree or index as the command does**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every covered row's case runs through executeTool and matches its assertion | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tree.test.ts: destructive inputs are denied with no client before git starts and safe inputs are common**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-tree.test.ts: destructive inputs are denied with no client before git starts and safe inputs are common | `src/daemon/tools/builtins/git/__tests__/git-tree.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-tree.test.ts: a command the installed git lacks fails with git's message and the recorded version**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-tree.test.ts: a command the installed git lacks fails with git's message and the recorded version | `src/daemon/tools/builtins/git/__tests__/git-tree.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 8 | 15 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-tree.test.ts` | 0 | 2 | 0.7 s |  |

## t7

Run at 2026-11-02T12:18:25.647Z on commit `0b0bab6d3`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: git_maintenance, git_setup, git_refs and git_reflog covered rows run through executeTool in a temporary repository**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every covered row's case runs through executeTool and matches its assertion | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-maintenance.test.ts: gc with prune now, prune and reflog expire and delete are denied with no client before git starts**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-maintenance.test.ts: gc with prune now, prune and reflog expire and delete are denied with no client before git starts | `src/daemon/tools/builtins/git/__tests__/git-maintenance.test.ts` |

**integration: src/daemon/tools/builtins/git/__tests__/git-setup.test.ts: init in an existing repository reinitialises and reports it**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-setup.test.ts: init in an existing repository reinitialises and reports it | `src/daemon/tools/builtins/git/__tests__/git-setup.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 8 | 13.8 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-maintenance.test.ts` | 0 | 1 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-setup.test.ts` | 0 | 1 | 0.7 s |  |

## t8

Run at 2026-11-02T12:19:58.083Z on commit `0b0bab6d3`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: the new ops of git_stash, git_worktree, git_remote, git_branch and git_tag change the repository as the command does**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | every covered row's case runs through executeTool and matches its assertion | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-approval.test.ts: the pinned inputs of the five extended tools are unchanged and the new inputs are listed as added by s8**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-approval.test.ts: the pinned inputs of the five extended tools are unchanged and the new inputs are listed as added by s8 | `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts` | 0 | 7 | 0.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 8 | 14.1 s |  |

## t9

Run at 2026-11-02T12:56:33.653Z on commit `e9b399b45`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: no row is assigned, every excluded row has a reason and every command has a row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-coverage.test.ts: no row is assigned, every excluded row has a reason and every command has a row | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/typed-git-tools.test.ts: gitToolDefinitions matches every tool the git files export and each is registered as withFailureNet(tool)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | typed-git-tools.test.ts: the list and the tool files agree in both directions, ids are unique and the registered ids equal the list | `src/daemon/tools/__tests__/typed-git-tools.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/typed-git-tools.test.ts` | 0 | 3 | 0.6 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 9 | 13.9 s |  |
