<!-- insrc:artifact TESTS-733042d2e435fabd-s1 -->

# Tests: 733042d2e435fabd s1

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

## s1

Run at 2026-10-27T12:55:06.126Z on commit `2c9fd8c38`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: maxBytes is accepted as an integer from 1 to 52428800 and refused as 0, a negative, a fraction or 52428801 by the input schema, and every other input of the tool is unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: maxBytes is accepted as an integer from 1 to 52428800 and refused as 0, a negative, a fraction or 52428801 by the input schema, and every other input of the tool is unchanged | `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: with no maxBytes a listing over 10 MiB is a rejected failure, as before**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: with no maxBytes a listing over 10 MiB is a rejected failure, as before | `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: with maxBytes 52428800 a listing between 10 MiB and 50 MiB is returned whole**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: with maxBytes 52428800 a listing between 10 MiB and 50 MiB is returned whole | `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: a listing of exactly maxBytes bytes is returned and one of maxBytes plus one byte is a rejected failure that returns no files, with multibyte names counted in bytes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: a listing of exactly maxBytes bytes is returned and one of maxBytes plus one byte is a rejected failure that returns no files, with multibyte names counted in bytes | `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: each of the six other readGit-based tools (git_ls_tree, git_rev_parse, git_for_each_ref, git_path_history, git_rev_list and git_hash_object) still cuts at 10 MiB and passes no maxBytes, and git_ls_files still runs the same argv and refuses a NUL in a path before any command runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts: each of the six other readGit-based tools (git_ls_tree, git_rev_parse, git_for_each_ref, git_path_history, git_rev_list and git_hash_object) still cuts at 10 MiB and passes no maxBytes, and git_ls_files still runs the same argv and refuses a NUL in a path before any command runs | `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts` |

**unit: src/daemon/tools/builtins/git/__tests__/git-read-cut.test.ts: git_rev_parse and git_hash_object return a rejected failure that says the output was cut and no data when the capture is cut (for git_hash_object also when the retained text is a valid object name followed by output that overflowed), and return the same results as before for output that fits**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | src/daemon/tools/builtins/git/__tests__/git-read-cut.test.ts: git_rev_parse and git_hash_object return a rejected failure that says the output was cut and no data when the capture is cut (for git_hash_object also when the retained text is a valid object name followed by output that overflowed), and return the same results as before for output that fits | `src/daemon/tools/builtins/git/__tests__/git-read-cut.test.ts` |

**contract: src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts: the ls-files coverage case still passes and the git_ls_files input lists maxBytes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | git-coverage.test.ts: the ls-files coverage case still passes and the git_ls_files input lists maxBytes | `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts` | 0 | 7 | 5.7 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-ls-files-budget.test.ts` | 0 | 5 | 0.8 s |  |
| `src/daemon/tools/builtins/git/__tests__/git-read-cut.test.ts` | 0 | 1 | 0.6 s |  |
