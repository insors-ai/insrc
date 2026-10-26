<!-- insrc:artifact TESTS-b7a68147dcf72034-s5 -->

# Tests: b7a68147dcf72034 s5

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 42 pass, 0 fail, 0 skipped, 0 not found; 2 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T15:02:35.842Z on commit `f52d24875`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: gh-timeouts.test.ts: ghTimeoutMs gives each job the limit in the table and a missing key the class default**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-timeouts.test.ts: ghTimeoutMs gives each job the limit in the table and a missing key the class default | `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` |

**unit: gh-timeouts.test.ts: no existing tool's limit is below its limit today**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-timeouts.test.ts: no existing tool's limit is below its limit today | `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` |

**unit: gh-capture.test.ts: byte-to-text adapter decodes with replacement and stays valid text when a cut crosses a multibyte character**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-capture.test.ts: byte-to-text adapter decodes with replacement and stays valid text when a cut crosses a multibyte character | `src/daemon/tools/builtins/gh/__tests__/gh-capture.test.ts` |

**unit: gh-exec.test.ts: ghExec runs through runShellBytes, keeps input out of argv and returns the limit applied and the probe result**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-exec.test.ts: ghExec runs through runShellBytes, keeps input out of argv and returns the limit applied and the probe result | `src/daemon/tools/builtins/gh/__tests__/gh-exec.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-capture.test.ts` | 0 | 1 | 0.4 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-exec.test.ts` | 0 | 1 | 0.3 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` | 0 | 2 | 0.4 s |  |

## t2

Run at 2026-10-25T15:11:07.824Z on commit `2023bb608`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: gh-failures.test.ts: the one precedence timedOut, aborted, signal, stdinError, stderrOverflow, unmarked cut, non-zero exit, pinned by paired-flag fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-failures.test.ts: the one precedence timedOut, aborted, signal, stdinError, stderrOverflow, unmarked cut, non-zero exit, pinned by paired-flag fixtures | `src/daemon/tools/builtins/gh/__tests__/gh-failures.test.ts` |

**unit: gh-failures.test.ts: a signal-only termination is rejected for a read and carries the unknown-outcome sentence for a mutating call**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-failures.test.ts: a signal-only termination is rejected for a read and carries the unknown-outcome sentence for a mutating call | `src/daemon/tools/builtins/gh/__tests__/gh-failures.test.ts` |

**unit: gh-failures.test.ts: spawn error, authentication text, probe-only authentication text, ambiguous failure with a clean probe and network text map to missing-tool, missing-signin, missing-signin, rejected and unreachable**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-failures.test.ts: spawn error, authentication text, probe-only authentication text, ambiguous failure with a clean probe and network text map to missing-tool, missing-signin, missing-signin, rejected and unreachable | `src/daemon/tools/builtins/gh/__tests__/gh-failures.test.ts` |

**unit: gh-approval.test.ts: every rename, close, merge, delete, transfer, logout, visibility, force, clobber and non-empty extraArgs is destructive and an unknown op is destructive**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-approval.test.ts: every rename, close, merge, delete, transfer, logout, visibility, force, clobber and non-empty extraArgs is destructive and an unknown op is destructive | `src/daemon/tools/builtins/gh/__tests__/gh-approval.test.ts` |

**unit: call-tool.type-test.ts: callTool over withGhFailureNet keeps the concrete input and result types**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | call-tool.type-test.ts: callTool over withGhFailureNet keeps the concrete input and result types | `src/daemon/tools/builtins/gh/__tests__/gh-failure-net.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-approval.test.ts` | 0 | 1 | 0.3 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-failure-net.test.ts` | 0 | 1 | 0.3 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-failures.test.ts` | 0 | 3 | 0.3 s |  |

## t3

Run at 2026-10-25T15:23:49.402Z on commit `6963aafb2`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: gh-compat.test.ts: issue and pr tools' input schemas serialise identically to the snapshot**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-compat.test.ts: issue and pr tools' input schemas serialise identically to the snapshot | `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` |

**integration: gh-output-schemas.test.ts: issue and pr tool results validate against their output schemas for success and failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-output-schemas.test.ts: issue and pr tool results validate against their output schemas for success and failure | `src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts` |

**unit: gh-timeouts.test.ts: no ghExec call in issue.ts or pr.ts passes its own timeout**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-timeouts.test.ts: no ghExec call in issue.ts or pr.ts passes its own timeout | `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` | 0 | 1 | 0.4 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts` | 0 | 1 | 0.8 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` | 0 | 3 | 0.4 s |  |

## t4

Run at 2026-10-25T15:27:06.837Z on commit `901db01aa`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: gh-compat.test.ts: repo, release and project tools' input schemas serialise identically to the snapshot, extraArgs and newTag unchanged**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-compat.test.ts: repo, release and project tools' input schemas serialise identically to the snapshot, extraArgs and newTag unchanged | `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` |

**unit: gh-approval.test.ts: gh_release_edit with newTag and gh_repo_clone with extraArgs are destructive and common without them**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-approval.test.ts: gh_release_edit with newTag and gh_repo_clone with extraArgs are destructive and common without them | `src/daemon/tools/builtins/gh/__tests__/gh-approval.test.ts` |

**unit: gh-timeouts.test.ts: no ghExec call in repo.ts, release.ts or project.ts passes its own timeout and clone keeps 600 s**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-timeouts.test.ts: no ghExec call in repo.ts, release.ts or project.ts passes its own timeout and clone keeps 600 s | `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-approval.test.ts` | 0 | 2 | 0.5 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` | 0 | 2 | 0.4 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` | 0 | 4 | 0.3 s |  |

## t5

Run at 2026-10-25T15:31:54.965Z on commit `30c9b3d0c`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: gh-capture.test.ts: gh_pr_diff and gh_run_view cut at the cap are successes with truncated true and valid text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-capture.test.ts: gh_pr_diff and gh_run_view cut at the cap are successes with truncated true and valid text | `src/daemon/tools/builtins/gh/__tests__/gh-capture.test.ts` |

**integration: gh-convert-text.test.ts: gh_pr_diff and gh_run_view conversions cross-check against the raw text and a failed cross-check gives conversion-failed with the raw text in failure.original**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-convert-text.test.ts: gh_pr_diff and gh_run_view conversions cross-check against the raw text and a failed cross-check gives conversion-failed with the raw text in failure.original | `src/daemon/tools/builtins/gh/__tests__/gh-convert-text.test.ts` |

**integration: gh-failures.test.ts: a failed gh run view log command fails the call with stderr in error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-failures.test.ts: a failed gh run view log command fails the call with stderr in error | `src/daemon/tools/builtins/gh/__tests__/gh-failures.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-capture.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-convert-text.test.ts` | 0 | 1 | 0.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-failures.test.ts` | 0 | 4 | 0.5 s |  |

## t6

Run at 2026-10-25T15:37:05.451Z on commit `8ed3e3a4a`. Tests check: **passed**. 6 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: approval-class-mapping.test.ts: PER_INPUT_OR_DESTRUCTIVE_SINCE_S5 members resolve to common or destructive and never none, and the snapshot is not edited**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | approval-class-mapping.test.ts: PER_INPUT_OR_DESTRUCTIVE_SINCE_S5 members resolve to common or destructive and never none, and the snapshot is not edited | `src/daemon/tools/__tests__/approval-class-mapping.test.ts` |

**integration: gh-compat.test.ts: the 46 existing ids are registered, old inputs run the same argv, result data keeps its shape and legacy failure text stays in output and error**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-compat.test.ts: the 46 existing tool ids are all still registered | `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` |
| pass | gh-compat.test.ts: gh_pr_create, gh_issue_comment, gh_release_delete and gh:project:item-add accept their old inputs and run the same gh argv | `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` |
| pass | gh-compat.test.ts: existing result data (count, repos, runs, workflows, number, diffBytes, truncated, runId, jobs) keep their shape, with only truncated added to gh_run_view | `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` |
| pass | gh-compat.test.ts: legacy failure texts stay in output and error | `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` |

**integration: gh-typed-call.test.ts: the 46 existing tools called through typed callTool keep their concrete result types**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-typed-call.test.ts: the 46 existing tools called through typed callTool keep their concrete result types | `src/daemon/tools/builtins/gh/__tests__/gh-typed-call.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/__tests__/approval-class-mapping.test.ts` | 0 | 7 | 0.7 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-compat.test.ts` | 0 | 8 | 1.2 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-typed-call.test.ts` | 0 | 1 | 0.9 s |  |

## t7

Run at 2026-10-25T15:44:57.108Z on commit `133bdade7`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: gh-parsers.test.ts: tab-column parser and config list parser on the fixtures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-parsers.test.ts: tab-column parser and config list parser on the fixtures | `src/daemon/tools/builtins/gh/__tests__/gh-parsers.test.ts` |

**unit: gh-op-schema.test.ts: requiredness, exclusive pairs, at-least-one groups, enums and expression strings of the builder**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-op-schema.test.ts: requiredness, exclusive pairs, at-least-one groups, enums and expression strings of the builder | `src/daemon/tools/builtins/gh/__tests__/gh-op-schema.test.ts` |

**integration: gh-family-tools.test.ts: issue, pr, release asset, repo, run, workflow and project ops build the argv the table gives and return the literal op**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-family-tools.test.ts: issue, pr, release asset, repo, run, workflow and project ops build the argv the table gives and return the literal op | `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts` |

**unit: gh-inputs.test.ts: release download requires a tag, a non-empty pattern list or an archive; set-default needs exactly one of repository, view, unset**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-inputs.test.ts: release download requires a tag, a non-empty pattern list or an archive; set-default needs exactly one of repository, view, unset | `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts` | 0 | 2 | 0.7 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts` | 0 | 1 | 0.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-op-schema.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-parsers.test.ts` | 0 | 1 | 0.4 s |  |

## t8

Run at 2026-10-25T15:48:23.748Z on commit `2b381fcca`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: gh-family-tools.test.ts: secret and variable set deliver the value on standard input or through envFile and never in argv**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-family-tools.test.ts: secret and variable set deliver the value on standard input or through envFile and never in argv | `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts` |

**unit: gh-inputs.test.ts: gist rename's three positionals, gist edit without content or filename, exactly-one-of rules of secret, variable, cache and key adds**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-inputs.test.ts: gist rename's three positionals, gist edit without content or filename, exactly-one-of rules of secret, variable, cache and key adds | `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts` |

**unit: gh-parsers.test.ts: gist list columns and ssh-key and gpg-key rows as string arrays**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-parsers.test.ts: gist list columns and ssh-key and gpg-key rows as string arrays | `src/daemon/tools/builtins/gh/__tests__/gh-parsers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts` | 0 | 4 | 0.9 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts` | 0 | 2 | 0.5 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-parsers.test.ts` | 0 | 2 | 0.4 s |  |

## t9

Run at 2026-10-25T16:39:48.280Z on commit `154d8b5e1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: gh-search-inputs.test.ts: comparison and range expressions pass through unchanged for comments, interactions, reactions, followers, forks, stars, size and the date qualifiers**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-search-inputs.test.ts: comparison and range expressions pass through unchanged for comments, interactions, reactions, followers, forks, stars, size and the date qualifiers | `src/daemon/tools/builtins/gh/__tests__/gh-search-inputs.test.ts` |

**integration: gh-family-tools.test.ts: codespace create always passes --default-permissions and has no defaultPermissions field**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-family-tools.test.ts: codespace create always passes --default-permissions and has no defaultPermissions field | `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts` |

**integration: gh-convert-text.test.ts: auth status and ruleset list keyValues are checked against the raw text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-convert-text.test.ts: auth status and ruleset list keyValues are checked against the raw text | `src/daemon/tools/builtins/gh/__tests__/gh-convert-text.test.ts` |

**unit: gh-inputs.test.ts: auth logout and switch need hostname and user; codespace ops need codespace except list and create; delete needs codespace and offers no all**

Run by file: the name begins with its test file's name, and no cases were named.

| Result | File | Titles |
| :--- | :--- | :--- |
| pass | `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts` | 3 |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-convert-text.test.ts` | 0 | 2 | 0.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts` | 0 | 7 | 1.2 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts` | 0 | 3 | 0.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-search-inputs.test.ts` | 0 | 1 | 0.5 s |  |

## t10

Run at 2026-10-25T17:24:29.135Z on commit `61a431be2`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: gh-coverage.test.ts: every installed gh command has a GH_COVERAGE row, covered rows name registered tools and ops, excluded rows have a reason, and all 68 tools are registered**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-coverage.test.ts: every installed gh command has a GH_COVERAGE row, covered rows name registered tools and ops, excluded rows have a reason, and all 68 tools are registered | `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` |

**integration: gh-inputs.test.ts: every flag and positional has a GH_INPUTS row and every schema field is accounted for by a flag, positional or synthetic row**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-inputs.test.ts: every flag and positional has a GH_INPUTS row and every schema field is accounted for by a flag, positional or synthetic row | `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts` |

**integration: gh-inputs.test.ts: prompt sweep reads the prompt cases from the installed gh help and requires each argument in the schema or always passed**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-inputs.test.ts: prompt sweep reads the prompt cases from the installed gh help and requires each argument in the schema or always passed | `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts` | 0 | 1 | 4.7 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-inputs.test.ts` | 0 | 5 | 3.8 s |  |

## t11

Run at 2026-10-25T17:36:59.511Z on commit `1673fcfb3`. Tests check: **passed**. 5 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**integration: gh-parser.test.ts: every op's argv with --help as its own final token parses against the installed gh under an empty HOME, no token and a closed-port proxy, and the gh issue delete 1 --help canary makes no request**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-parser.test.ts: every op's argv with --help as its own final token parses against the installed gh under an empty HOME, no token and a closed-port proxy, and the gh issue delete 1 --help canary makes no request | `src/daemon/tools/builtins/gh/__tests__/gh-parser.test.ts` |

**integration: gh-approval.test.ts: secretValue masked, key text up to 2000 characters shown whole, a longer key shown as its first 2000 characters and the length, keyFile shows only the path, codespace create preview states the permissions are accepted, a declined destructive call does not run gh**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-approval.test.ts: secretValue masked, key text up to 2000 characters shown whole, a longer key shown as its first 2000 characters and the length, keyFile shows only the path, codespace create preview states the permissions are accepted, a declined destructive call does not run gh | `src/daemon/tools/builtins/gh/__tests__/gh-approval.test.ts` |

**integration: gh-timeouts.test.ts: a fake gh that outlives its limit ends with timed-out naming the command and the limit, a mutating time-out adds that the outcome is unknown, and no ghExec call outside the table passes its own timeout**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-timeouts.test.ts: a fake gh that outlives its limit ends with timed-out naming the command and the limit, a mutating time-out adds that the outcome is unknown, and no ghExec call outside the table passes its own timeout | `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` |

**integration: gh-failures.test.ts: a fake gh that closes its stdin early gives a stdin error that is a failure even at exit 0**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-failures.test.ts: a fake gh that closes its stdin early gives a stdin error that is a failure even at exit 0 | `src/daemon/tools/builtins/gh/__tests__/gh-failures.test.ts` |

**integration: gh-output-schemas.test.ts: every output of a family tool carries the literal op and validates for success and failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | gh-output-schemas.test.ts: every output of a family tool carries the literal op and validates for success and failure | `src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts` |

**live: gh-live.test.ts: gh_auth status, gh_config list, gh_search repos with limit 1, gh_gist list columns and a bad token giving missing-signin (INSRC_LIVE_TESTS=1)**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/epics/one-tool-registry-git-gh-jira-E20261023b7a68147/S005/gh-live.log (INSRC_LIVE_TESTS=1 npx tsx --test src/daemon/tools/builtins/gh/__tests__/gh-live.test.ts: 1 pass, real gh on this machine)

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/gh/__tests__/gh-approval.test.ts` | 0 | 3 | 0.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-failures.test.ts` | 0 | 5 | 0.6 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts` | 0 | 2 | 2.3 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-parser.test.ts` | 0 | 1 | 29 s |  |
| `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts` | 0 | 5 | 2.4 s |  |

## t12

Run at 2026-10-25T17:39:05.767Z on commit `b305e41a1`. Tests check: **passed**. 0 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

the gate ran no test: every named test of this Task was reported by the builder

**smoke: tool-registry doc check: the s5 outcome section exists and the amendment artifact or fallback record is present**

Reported by the builder, not run by the gate: **pass**. Evidence: grep -c '## s5 outcome' docs/plans/tool-registry.md = 1; grep -c 'AMD-b7a68147dcf72034-9' docs/plans/tool-registry.md = 1; .insrc/artifacts/AMD-b7a68147dcf72034-9.json exists, type nonFunctional.retarget, no approval (pending)
