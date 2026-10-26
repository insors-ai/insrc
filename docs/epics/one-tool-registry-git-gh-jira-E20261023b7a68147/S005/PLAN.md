<!-- insrc:artifact PLAN-b7a68147dcf72034-s5 -->

# Plan: STORY-b7a68147dcf72034-s5

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**LLD run:** `wf-1792934729806-6vtgnn`
**LLD effective hash:** `e550742c2f67...`

Building this Story means adding five shared gh helpers, converting the 46 existing gh tools onto them without changing their ids or inputs, adding 22 family tools from an op table, and then proving all of it against the installed gh with coverage, input, parser and prompt checks. The work goes in order: helpers, the conversions with the two visible behaviour changes, the compatibility tests, the three groups of family tools, the inventory and the cross-cutting tests, and last the docs and the HLD amendment.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Time-limit table, byte adapter and ghExec | M | — | — | unit: gh-timeouts.test.ts: ghTimeoutMs gives each job the limit in the table and a missing key the class default; unit: gh-timeouts.test.ts: no existing tool's limit is below its limit today; unit: gh-capture.test.ts: byte-to-text adapter decodes with replacement and stays valid text when a cut crosses a multibyte character; unit: gh-exec.test.ts: ghExec runs through runShellBytes, keeps input out of argv and returns the limit applied and the probe result | [[c1]] [[c2]] |
| 2 | **`t2`** Failure mapping, failure net and approval class | M | — | `t1` | unit: gh-failures.test.ts: the one precedence timedOut, aborted, signal, stdinError, stderrOverflow, unmarked cut, non-zero exit, pinned by paired-flag fixtures; unit: gh-failures.test.ts: a signal-only termination is rejected for a read and carries the unknown-outcome sentence for a mutating call; unit: gh-failures.test.ts: spawn error, authentication text, probe-only authentication text, ambiguous failure with a clean probe and network text map to missing-tool, missing-signin, missing-signin, rejected and unreachable; unit: gh-approval.test.ts: every rename, close, merge, delete, transfer, logout, visibility, force, clobber and non-empty extraArgs is destructive and an unknown op is destructive; unit: call-tool.type-test.ts: callTool over withGhFailureNet keeps the concrete input and result types | [[c1]] [[c3]] |
| 3 | **`t3`** Convert the issue and pr tools | L | — | `t1`, `t2` | integration: gh-compat.test.ts: issue and pr tools' input schemas serialise identically to the snapshot; integration: gh-output-schemas.test.ts: issue and pr tool results validate against their output schemas for success and failure; unit: gh-timeouts.test.ts: no ghExec call in issue.ts or pr.ts passes its own timeout | [[c1]] [[c2]] [[c5]] |
| 4 | **`t4`** Convert the repo, release and project tools | L | — | `t1`, `t2` | integration: gh-compat.test.ts: repo, release and project tools' input schemas serialise identically to the snapshot, extraArgs and newTag unchanged; unit: gh-approval.test.ts: gh_release_edit with newTag and gh_repo_clone with extraArgs are destructive and common without them; unit: gh-timeouts.test.ts: no ghExec call in repo.ts, release.ts or project.ts passes its own timeout and clone keeps 600 s | [[c1]] [[c2]] [[c5]] |
| 5 | **`t5`** Convert actions and change gh_pr_diff and gh_run_view | M | — | `t3`, `t4` | integration: gh-capture.test.ts: gh_pr_diff and gh_run_view cut at the cap are successes with truncated true and valid text; integration: gh-convert-text.test.ts: gh_pr_diff and gh_run_view conversions cross-check against the raw text and a failed cross-check gives conversion-failed with the raw text in failure.original; integration: gh-failures.test.ts: a failed gh run view log command fails the call with stderr in error | [[c1]] [[c3]] [[c5]] |
| 6 | **`t6`** Approval mapping test and compatibility tests | M | — | `t3`, `t4`, `t5` | integration: approval-class-mapping.test.ts: PER_INPUT_OR_DESTRUCTIVE_SINCE_S5 members resolve to common or destructive and never none, and the snapshot is not edited; integration: gh-compat.test.ts: the 46 existing ids are registered, old inputs run the same argv, result data keeps its shape and legacy failure text stays in output and error; integration: gh-typed-call.test.ts: the 46 existing tools called through typed callTool keep their concrete result types | [[c4]] [[c5]] |
| 7 | **`t7`** Family infrastructure and the repository families | L | — | `t1`, `t2` | unit: gh-parsers.test.ts: tab-column parser and config list parser on the fixtures; unit: gh-op-schema.test.ts: requiredness, exclusive pairs, at-least-one groups, enums and expression strings of the builder; integration: gh-family-tools.test.ts: issue, pr, release asset, repo, run, workflow and project ops build the argv the table gives and return the literal op; unit: gh-inputs.test.ts: release download requires a tag, a non-empty pattern list or an archive; set-default needs exactly one of repository, view, unset | [[c2]] [[c3]] |
| 8 | **`t8`** Label, gist, secret, variable, cache, ssh-key and gpg-key families | L | — | `t7` | integration: gh-family-tools.test.ts: secret and variable set deliver the value on standard input or through envFile and never in argv; unit: gh-inputs.test.ts: gist rename's three positionals, gist edit without content or filename, exactly-one-of rules of secret, variable, cache and key adds; unit: gh-parsers.test.ts: gist list columns and ssh-key and gpg-key rows as string arrays | [[c2]] [[c3]] |
| 9 | **`t9`** Search, ruleset, org, auth, status, codespace, config and extension families | L | — | `t7` | unit: gh-search-inputs.test.ts: comparison and range expressions pass through unchanged for comments, interactions, reactions, followers, forks, stars, size and the date qualifiers; integration: gh-family-tools.test.ts: codespace create always passes --default-permissions and has no defaultPermissions field; integration: gh-convert-text.test.ts: auth status and ruleset list keyValues are checked against the raw text; unit: gh-inputs.test.ts: auth logout and switch need hostname and user; codespace ops need codespace except list and create; delete needs codespace and offers no all | [[c2]] [[c3]] |
| 10 | **`t10`** GH_COVERAGE, GH_INPUTS and their tests | M | — | `t7`, `t8`, `t9` | integration: gh-coverage.test.ts: every installed gh command has a GH_COVERAGE row, covered rows name registered tools and ops, excluded rows have a reason, and all 68 tools are registered; integration: gh-inputs.test.ts: every flag and positional has a GH_INPUTS row and every schema field is accounted for by a flag, positional or synthetic row; integration: gh-inputs.test.ts: prompt sweep reads the prompt cases from the installed gh help and requires each argument in the schema or always passed | [[c2]] [[c4]] |
| 11 | **`t11`** Fake gh fixture, parser check and cross-cutting tests | L | — | `t10` | integration: gh-parser.test.ts: every op's argv with --help as its own final token parses against the installed gh under an empty HOME, no token and a closed-port proxy, and the gh issue delete 1 --help canary makes no request; integration: gh-approval.test.ts: secretValue masked, key text up to 2000 characters shown whole, a longer key shown as its first 2000 characters and the length, keyFile shows only the path, codespace create preview states the permissions are accepted, a declined destructive call does not run gh; integration: gh-timeouts.test.ts: a fake gh that outlives its limit ends with timed-out naming the command and the limit, a mutating time-out adds that the outcome is unknown, and no ghExec call outside the table passes its own timeout; integration: gh-failures.test.ts: a fake gh that closes its stdin early gives a stdin error that is a failure even at exit 0; integration: gh-output-schemas.test.ts: every output of a family tool carries the literal op and validates for success and failure; live: gh-live.test.ts: gh_auth status, gh_config list, gh_search repos with limit 1, gh_gist list columns and a bad token giving missing-signin (INSRC_LIVE_TESTS=1) | [[c3]] [[c4]] |
| 12 | **`t12`** Docs and the HLD amendment | S | — | `t11` | smoke: tool-registry doc check: the s5 outcome section exists and the amendment artifact or fallback record is present | [[c5]] [[c6]] |

### 1.1 TASK-b7a68147dcf72034-s5-t1 — Time-limit table, byte adapter and ghExec

In helpers.ts add the per-job limit table and ghTimeoutMs, the byte-to-text adapter over runShellBytes, GhOutcome and ghExec with the key option, stdin input, cut-is-answer cap, abort signal and the one sign-in probe; no caller passes its own timeout. Carries its own unit tests.

**Acceptance checks:**
- ghTimeoutMs returns the table limit for every existing tool and never less than its limit today, and the class default for an unknown key
- ghExec always runs through runShellBytes, never puts input text in argv, and returns every runShellBytes field plus the limit applied and the probe result
- the byte adapter yields valid text for a cut crossing a multibyte character

### 1.2 TASK-b7a68147dcf72034-s5-t2 — Failure mapping, failure net and approval class

Add ghFailureOf with its one precedence and the unknown-outcome rule for mutating calls, withGhFailureNet keeping the concrete schema types, and ghApprovalClass with the destructive rules (close, merge, delete, transfer, every rename including newName and newTag, logout, visibility, force and clobber, non-empty extraArgs, unknown op). Carries its own unit tests.

**Acceptance checks:**
- paired-flag fixtures give the precedence time-out, abort, signal, stdin error, stderr overflow, unmarked cut, non-zero exit
- a mutating failure after execution began carries the unknown-outcome sentence and never says the value was not set
- callTool over withGhFailureNet type-checks against the tool's own schemas
- an unknown op resolves to destructive

### 1.3 TASK-b7a68147dcf72034-s5-t3 — Convert the issue and pr tools

Convert the existing issue.ts and pr.ts tools to typebox input (JSON equal to the snapshot) and output schemas, ghExec with a limit key, ghApprovalClass and withGhFailureNet; legacy failure text stays in output and error; register the converted tools. gh_pr_diff keeps its behaviour in this task.

**Acceptance checks:**
- each converted tool's input schema serialises identically to its snapshot row
- each tool result validates against its output schema and existing result data keeps its shape
- no call in issue.ts or pr.ts passes its own timeout

### 1.4 TASK-b7a68147dcf72034-s5-t4 — Convert the repo, release and project tools

Convert repo.ts, release.ts and project.ts the same way; gh_release_edit becomes destructive when newTag is set and gh_repo_clone destructive when extraArgs is non-empty; extraArgs stays in the schema; gh_release_delete, gh_repo_delete and gh:project:item-delete become destructive; register the converted tools.

**Acceptance checks:**
- snapshot equality of the input schemas, with extraArgs and newTag unchanged
- the destructive and per-input classes resolve as the LLD table says
- repo clone keeps its 600 s limit and release create its 180 s limit through the table

### 1.5 TASK-b7a68147dcf72034-s5-t5 — Convert actions and change gh_pr_diff and gh_run_view

Convert actions.ts; move gh_pr_diff and gh_run_view to the cut-is-answer capture and sc3 conversion with key-value cross-check, add truncated to gh_run_view, and make a failed log command a real failure; register the converted tools.

**Acceptance checks:**
- a capture cut at the cap is a success with truncated true and valid text across a multibyte character
- a failed gh run view log command fails the call with stderr in error
- a failed cross-check gives conversion-failed with the raw text in failure.original

### 1.6 TASK-b7a68147dcf72034-s5-t6 — Approval mapping test and compatibility tests

Update approval-class-mapping.test.ts with the PER_INPUT_OR_DESTRUCTIVE_SINCE_S5 set and the addedByS5 list without editing the 228-row snapshot, and add gh-compat.test.ts for ids, old inputs, result shapes and legacy failure text.

**Acceptance checks:**
- the eight listed tools resolve to common or destructive, never none
- the snapshot file is byte-identical and the 46 ids are all registered
- old inputs run the same gh argv

### 1.7 TASK-b7a68147dcf72034-s5-t7 — Family infrastructure and the repository families

Commit the op-table schema builder first (required, optional, exactly-one-of, at-least-one groups, enums, expression strings), the output union with the literal op, and the tab and config parsers, as their own commit with unit tests; then add gh_issue_manage, gh_pr_manage, gh_release_asset, gh_repo_manage, gh_run_manage, gh_workflow_manage and gh_project_manage with their classes and limits, and register them.

**Acceptance checks:**
- every op builds the argv the LLD table gives for its fields and rejects a field the op does not accept
- release download rejects an input with none of tag, pattern and archive, and set-default needs exactly one of repository, view, unset
- project link and unlink carry no --format and every project op returns op, ok, target, message

### 1.8 TASK-b7a68147dcf72034-s5-t8 — Label, gist, secret, variable, cache, ssh-key and gpg-key families

Add gh_label, gh_gist, gh_secret, gh_variable, gh_cache, gh_ssh_key and gh_gpg_key, including stdin delivery for secret and variable values and public keys, envFile, the gist list columns, untyped key list rows, and the gist edit and rename rules; register them and carry their unit tests.

**Acceptance checks:**
- secretValue and value reach gh on standard input and never appear in argv or error text
- gist rename is destructive, gist edit offers add, remove and desc only
- ssh-key and gpg-key list return rows as string arrays

### 1.9 TASK-b7a68147dcf72034-s5-t9 — Search, ruleset, org, auth, status, codespace, config and extension families

Add gh_search with its per-group flags and fixed --json fields, gh_ruleset, gh_org, gh_auth, gh_status, gh_codespace, gh_config and gh_extension, with sc3 conversion for auth status, ruleset list and status, the deterministic config parser, and the codespace create preview notice with --default-permissions always passed; register them and carry their unit tests.

**Acceptance checks:**
- search qualifier expressions such as >100 and 5..20 pass through unchanged
- codespace create always passes --default-permissions, has no defaultPermissions field and its preview states the permissions are accepted
- auth logout and switch need hostname and user, and every codespace op except list and create needs codespace

### 1.10 TASK-b7a68147dcf72034-s5-t10 — GH_COVERAGE, GH_INPUTS and their tests

Add the coverage and input inventory data, check that all 68 tools are registered, and add the tests that read the installed gh: command coverage, flags from FLAGS, positionals from USAGE, synthetic rows, per-op schema accounting and the prompt sweep.

**Acceptance checks:**
- every command of the installed gh has a GH_COVERAGE row and every excluded row has a reason
- every flag and positional has a GH_INPUTS row and every schema field is accounted for
- the prompt sweep fails on an optional selector whose absence makes gh prompt

### 1.11 TASK-b7a68147dcf72034-s5-t11 — Fake gh fixture, parser check and cross-cutting tests

Add the fake gh binary fixture and only the cross-cutting tests that need it or the installed gh: the real-CLI parser check with the canary, approval request display and masking, timeouts, failure mapping through real calls, output schema checks and search expression tests; per-task unit tests stay in their own tasks.

**Acceptance checks:**
- every op's argv with --help as its own final token parses against the installed gh and the canary prints help with no request
- a fake gh that outlives its limit ends with a timed-out message naming the command and the limit
- secretValue is masked and ssh-key text longer than 2000 characters shows exactly its first 2000 characters and the length

### 1.12 TASK-b7a68147dcf72034-s5-t12 — Docs and the HLD amendment

Record the s5 outcome in docs/plans/tool-registry.md and file the nonFunctional.retarget amendment for the per-job limits as a pending artifact for the user to approve; if the amend tool cannot file it, record it in docs/plans/tool-registry.md and tell the user.

**Acceptance checks:**
- docs/plans/tool-registry.md has an s5 outcome section
- the retarget amendment exists as a pending artifact, or the fallback record and the message to the user are done

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| ghTimeoutMs | `t1` |
| ghApprovalClass | `t2` |
| ghFailureOf | `t2` |
| tab-column parser | `t7`, `t8` |
| gh config list parser | `t7`, `t9` |
| byte-to-text adapter | `t1` |
| per-op input schemas in GhOpContracts | `t7`, `t8`, `t9` |
| the 22 family tools and every op in GhOpContracts | `t7`, `t8`, `t9`, `t11` |
| the 46 existing tools through typed callTool | `t3`, `t4`, `t5`, `t6` |
| gh_pr_diff and gh_run_view cut at the cap | `t5` |
| secret and variable set with stdin and envFile | `t8`, `t11` |
| codespace create with and without --default-permissions | `t9`, `t11` |
| withGhFailureNet | `t2` |
| approval exchange for destructive ops | `t11` |
| output union discriminated by the literal op | `t7`, `t11` |
| GH_COVERAGE against gh --help command listing | `t10` |
| GH_INPUTS (flags from FLAGS, positionals from USAGE, synthetic fields) against each op's schema fields | `t10` |
| real-CLI parser check: each op's argv built from representative values (first enum member, integer 1, the fixed --json field list, a placeholder string) with --help appended as its own final token, run against the installed gh under an empty temporary HOME and GH_CONFIG_DIR, no token and a closed-port proxy, asserting exit 0 and a USAGE section (covers the flags the tools add themselves, such as --format, --visibility and --default-permissions), plus a canary case for a mutating command; it proves flag validity only | `t11` |
| prompt sweep: the prompt cases are read from the installed gh's help text (commands whose help says an interactive prompt is used when an argument is absent, or that a flag avoids a prompt), and each such argument is required in the schema or always passed | `t10` |
| approval-class-mapping.test.ts with the PER_INPUT_OR_DESTRUCTIVE_SINCE_S5 set and addedByS5 list | `t6` |
| schema JSON equality with the 228-row snapshot for the existing tools | `t3`, `t4`, `t6` |
| no ghExec call outside the table passes its own timeout | `t3`, `t4`, `t11` |
| gh_auth status | `t11` |
| gh_config list | `t11` |
| gh_search repos with limit 1 | `t11` |
| gh_gist list columns | `t11` |
| missing-signin text with a bad token in the environment | `t11` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s5 contractDetails (shared helpers, failure mapping, approval class, GH_COVERAGE, GH_INPUTS)`
- **[[c2]]** `prior-artifact` `LLD s5 dataModelChanges (GhOpContracts, GhToolOutputs, GhApprovalClassMapping, gh time limit)`
- **[[c3]]** `prior-artifact` `LLD s5 errorPaths (failure precedence, prompts, unknown outcome, rejected inputs)`
- **[[c4]]** `prior-artifact` `LLD s5 testStrategy (levels, subjects, acceptance mapping)`
- **[[c5]]** `prior-artifact` `LLD s5 migration (rollout order and backward compatibility)`
- **[[c6]]** `doc` `docs/plans/tool-registry.md#s5-decisions-2026-10-25`
