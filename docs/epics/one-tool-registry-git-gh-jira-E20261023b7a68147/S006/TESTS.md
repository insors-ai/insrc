<!-- insrc:artifact TESTS-b7a68147dcf72034-s6 -->

# Tests: b7a68147dcf72034 s6

What the build validation gate ran for each Task of this Story, and what each test case did. The gate runs the tests itself; a result here is never a builder's statement unless it says so. `not found` means no test of that title ran in that file.

**Totals:** 33 pass, 0 fail, 0 skipped, 0 not found; 4 reported by the builder and not run by the gate.

## t1

Run at 2026-10-25T19:43:56.030Z on commit `9587afed1`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jira-inputs.test.ts: jiraInputSchema sets maximum 500, 200 and 200, maxItems 50 and identifier patterns**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-inputs.test.ts: jiraInputSchema sets maximum 500, 200 and 200, maxItems 50 and identifier patterns | `src/daemon/tools/builtins/jira/__tests__/jira-inputs.test.ts` |

**unit: jira-inputs.test.ts: 51 keys with repeats are refused and normalizeKeys keeps first-seen order**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-inputs.test.ts: 51 keys with repeats are refused and normalizeKeys keeps first-seen order | `src/daemon/tools/builtins/jira/__tests__/jira-inputs.test.ts` |

**unit: jira-inputs.test.ts: checkJiraValues refuses a leading-dash value in every identifier field**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-inputs.test.ts: checkJiraValues refuses a leading-dash value in every identifier field | `src/daemon/tools/builtins/jira/__tests__/jira-inputs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-inputs.test.ts` | 0 | 3 | 0.6 s |  |

## t2

Run at 2026-10-25T19:45:54.968Z on commit `c462e5383`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jira-parsers.test.ts: readBatch handles all SUCCESS, all FAILURE at exit 0, partial, a count mismatch and the clone key from the message**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-parsers.test.ts: readBatch handles all SUCCESS, all FAILURE at exit 0, partial, a count mismatch and the clone key from the message | `src/daemon/tools/builtins/jira/__tests__/jira-parsers.test.ts` |

**unit: jira-parsers.test.ts: readCount and parseAuthStatus read recorded acli text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-parsers.test.ts: readCount and parseAuthStatus read recorded acli text | `src/daemon/tools/builtins/jira/__tests__/jira-parsers.test.ts` |

**unit: jira-parsers.test.ts: readVisibility group and role cases including count mismatch, heading only, unrecognised line and ANSI escapes**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-parsers.test.ts: readVisibility group and role cases including count mismatch, heading only, unrecognised line and ANSI escapes | `src/daemon/tools/builtins/jira/__tests__/jira-parsers.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-parsers.test.ts` | 0 | 3 | 0.4 s |  |

## t3

Run at 2026-10-25T19:50:01.377Z on commit `651dd02a5`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jira-argv.test.ts: jiraArgv head, --yes, literal --json, finite --limit, never --paginate and free text as one --flag=value token**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-argv.test.ts: jiraArgv head, --yes, literal --json, finite --limit, never --paginate and free text as one --flag=value token | `src/daemon/tools/builtins/jira/__tests__/jira-argv.test.ts` |

**unit: jira-failures.test.ts: jiraFailureOf precedence and the probe rules**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-failures.test.ts: jiraFailureOf precedence and the probe rules | `src/daemon/tools/builtins/jira/__tests__/jira-failures.test.ts` |

**integration: jira-failures.test.ts: not installed, not signed in, network probe, time-out and truncated output through a fake acli**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-failures.test.ts: not installed, not signed in, network probe, time-out and truncated output through a fake acli | `src/daemon/tools/builtins/jira/__tests__/jira-failures.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-argv.test.ts` | 0 | 2 | 0.5 s |  |
| `src/daemon/tools/builtins/jira/__tests__/jira-failures.test.ts` | 0 | 2 | 0.8 s |  |

## t4

Run at 2026-10-25T19:53:33.070Z on commit `929bd64f7`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**unit: jira-answers.test.ts: the batch builder lists failed and succeeded ids and says the batch was partly applied**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-answers.test.ts: the batch builder lists failed and succeeded ids and says the batch was partly applied | `src/daemon/tools/builtins/jira/__tests__/jira-answers.test.ts` |

**unit: jira-answers.test.ts: the success-mark builder rejects any other exit-0 text**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-answers.test.ts: the success-mark builder rejects any other exit-0 text | `src/daemon/tools/builtins/jira/__tests__/jira-answers.test.ts` |

**unit: jira-output-schemas.test.ts: each shape accepts its recorded answer, passes extra properties through and rejects a wrong literal op**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-output-schemas.test.ts: each shape accepts its recorded answer, passes extra properties through and rejects a wrong literal op | `src/daemon/tools/builtins/jira/__tests__/jira-output-schemas.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-answers.test.ts` | 0 | 3 | 0.4 s |  |
| `src/daemon/tools/builtins/jira/__tests__/jira-output-schemas.test.ts` | 0 | 1 | 0.7 s |  |

## t5

Run at 2026-10-25T19:55:51.562Z on commit `9e99d4dba`. Tests check: **passed**. 4 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: jira-family.test.ts: a sample family refuses unknown ops, missing, extra and exclusive-group fields before acli runs**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-family.test.ts: a sample family refuses unknown ops, missing, extra and exclusive-group fields before acli runs | `src/daemon/tools/builtins/jira/__tests__/jira-family.test.ts` |

**integration: jira-output-validation.test.ts: a builder that returns data outside its union, or no data, is schema-mismatch through executeTool**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-output-validation.test.ts: a builder that returns data outside its union, or no data, is schema-mismatch through executeTool | `src/daemon/tools/builtins/jira/__tests__/jira-output-validation.test.ts` |

**integration: jira-failures.test.ts: reader failures are rejected through executeTool**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-failures.test.ts: reader failures are rejected through executeTool | `src/daemon/tools/builtins/jira/__tests__/jira-failures.test.ts` |

**unit: jira-approval.test.ts: the approval function per op and an unknown op is destructive and denied with no client**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-approval.test.ts: the approval function per op and an unknown op is destructive and denied with no client | `src/daemon/tools/builtins/jira/__tests__/jira-approval.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-approval.test.ts` | 0 | 1 | 0.5 s |  |
| `src/daemon/tools/builtins/jira/__tests__/jira-failures.test.ts` | 0 | 3 | 0.9 s |  |
| `src/daemon/tools/builtins/jira/__tests__/jira-family.test.ts` | 0 | 1 | 0.6 s |  |
| `src/daemon/tools/builtins/jira/__tests__/jira-output-validation.test.ts` | 0 | 1 | 0.5 s |  |

## t6

Run at 2026-10-25T19:57:45.683Z on commit `5ffefaeea`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: jira-workitem-reads.test.ts: each read op returns its declared shape and its argv matches acli**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-workitem-reads.test.ts: each read op returns its declared shape and its argv matches acli | `src/daemon/tools/builtins/jira/__tests__/jira-workitem-reads.test.ts` |

**integration: jira-workitem-reads.test.ts: search and count take exactly one of jql and filter and search is limited**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-workitem-reads.test.ts: search and count take exactly one of jql and filter and search is limited | `src/daemon/tools/builtins/jira/__tests__/jira-workitem-reads.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-workitem-reads.test.ts` | 0 | 2 | 0.6 s |  |

## t7

Run at 2026-10-25T19:59:56.983Z on commit `8afdbe196`. Tests check: **passed**. 3 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: jira-workitem-changes.test.ts: each changing op returns {ok, target, message} and its argv matches acli**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-workitem-changes.test.ts: each changing op returns {ok, target, message} and its argv matches acli | `src/daemon/tools/builtins/jira/__tests__/jira-workitem-changes.test.ts` |

**integration: jira-workitem-changes.test.ts: keys only, repeated keys sent once, jql, filter and from-file refused**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-workitem-changes.test.ts: keys only, repeated keys sent once, jql, filter and from-file refused | `src/daemon/tools/builtins/jira/__tests__/jira-workitem-changes.test.ts` |

**integration: jira-workitem-changes.test.ts: a FAILURE result at exit 0 and a partial batch are rejected failures**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-workitem-changes.test.ts: a FAILURE result at exit 0 and a partial batch are rejected failures | `src/daemon/tools/builtins/jira/__tests__/jira-workitem-changes.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-workitem-changes.test.ts` | 0 | 3 | 0.7 s |  |

## t8

Run at 2026-10-25T20:02:09.518Z on commit `51eb8a5b6`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: jira-comment-link.test.ts: every comment and link op returns its declared shape and its argv matches acli**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-comment-link.test.ts: every comment and link op returns its declared shape and its argv matches acli | `src/daemon/tools/builtins/jira/__tests__/jira-comment-link.test.ts` |

**integration: jira-comment-link.test.ts: text commands without the success mark are rejected and visibility rules are enforced**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-comment-link.test.ts: text commands without the success mark are rejected and visibility rules are enforced | `src/daemon/tools/builtins/jira/__tests__/jira-comment-link.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-comment-link.test.ts` | 0 | 2 | 0.6 s |  |

## t9

Run at 2026-10-25T20:04:29.828Z on commit `705dd7fef`. Tests check: **passed**. 2 pass, 0 fail, 0 skipped, 0 not found; 0 reported by the builder and not run by the gate.

**integration: jira-project-auth.test.ts: every project op and auth status returns its declared shape and its argv matches acli**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-project-auth.test.ts: every project op and auth status returns its declared shape and its argv matches acli | `src/daemon/tools/builtins/jira/__tests__/jira-project-auth.test.ts` |

**integration: jira-project-auth.test.ts: project create needs fromProject and a non-company-managed source is a rejected failure**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-project-auth.test.ts: project create needs fromProject and a non-company-managed source is a rejected failure | `src/daemon/tools/builtins/jira/__tests__/jira-project-auth.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-project-auth.test.ts` | 0 | 2 | 0.6 s |  |

## t10

Run at 2026-10-25T20:09:59.133Z on commit `d520bdd3a`. Tests check: **passed**. 7 pass, 0 fail, 0 skipped, 0 not found; 1 reported by the builder and not run by the gate.

**unit: jira-coverage.test.ts: every acli command is covered or in the amended exclusion list, checked against REQUIRED_OPS, and the exclusion list equals the amendment table**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-coverage.test.ts: every acli command is covered or in the amended exclusion list, checked against REQUIRED_OPS, and the exclusion list equals the amendment table | `src/daemon/tools/builtins/jira/__tests__/jira-coverage.test.ts` |

**unit: jira-coverage.test.ts: JIRA_UNSUPPORTED names a transition by id and the list of transitions and neither is a registered op**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-coverage.test.ts: JIRA_UNSUPPORTED names a transition by id and the list of transitions and neither is a registered op | `src/daemon/tools/builtins/jira/__tests__/jira-coverage.test.ts` |

**unit: jira-coverage.test.ts: classes are 6 destructive, 12 none, 14 common, 32 in all**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-coverage.test.ts: classes are 6 destructive, 12 none, 14 common, 32 in all | `src/daemon/tools/builtins/jira/__tests__/jira-coverage.test.ts` |

**integration: jira-parser.test.ts: the commands and flags of the real acli match the coverage table, including the project flags (skipped when acli is absent)**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-parser.test.ts: the commands and flags of the real acli match the coverage table, including the project flags (skipped when acli is absent) | `src/daemon/tools/builtins/jira/__tests__/jira-parser.test.ts` |

**integration: jira-spawn-only.test.ts: with fake jira, jira-cli and go-jira on PATH only acli is run across every op**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-spawn-only.test.ts: with fake jira, jira-cli and go-jira on PATH only acli is run across every op | `src/daemon/tools/builtins/jira/__tests__/jira-spawn-only.test.ts` |

**integration: jira-family.test.ts: the five tools and 32 ops are registered and each op returns its declared shape**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-family.test.ts: the five tools and 32 ops are registered and each op returns its declared shape | `src/daemon/tools/builtins/jira/__tests__/jira-family.test.ts` |

**smoke: jira-registration.test.ts: registerJiraTools adds exactly five tool ids and changes no existing one**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-registration.test.ts: registerJiraTools adds exactly five tool ids and changes no existing one | `src/daemon/tools/builtins/jira/__tests__/jira-registration.test.ts` |

Reported by the builder, not run by the gate: **pass**. Evidence: jira-registration.test.ts passes: the five jira ids are the only addition after registerGhTools and every earlier definition is the same object (src/daemon/tools/builtins/jira/__tests__/jira-registration.test.ts)

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-coverage.test.ts` | 0 | 3 | 0.5 s |  |
| `src/daemon/tools/builtins/jira/__tests__/jira-family.test.ts` | 0 | 2 | 1 s |  |
| `src/daemon/tools/builtins/jira/__tests__/jira-parser.test.ts` | 0 | 1 | 3 s |  |
| `src/daemon/tools/builtins/jira/__tests__/jira-registration.test.ts` | 0 | 1 | 0.8 s |  |
| `src/daemon/tools/builtins/jira/__tests__/jira-spawn-only.test.ts` | 0 | 1 | 0.7 s |  |

## t11

Run at 2026-10-26T04:50:42.158Z on commit `cdf053255`. Tests check: **passed**. 1 pass, 0 fail, 0 skipped, 0 not found; 3 reported by the builder and not run by the gate.

**live: jira-live.test.ts: read ops view, search, count, list, types, status and visibility return their declared shape**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/acli-recorded/jira-live-run-2026-10-26.txt (first test passed)

**live: jira-live.test.ts: one work item create then delete in a scratch project with cleanup of any clone**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/acli-recorded/jira-live-run-2026-10-26.txt (second test passed; SCRUM has its 4 original work items afterwards)

**live: jira-live.test.ts: the disposable-project probe records the real success text of each project mutation**

Reported by the builder, not run by the gate: **pass**. Evidence: docs/plans/acli-recorded/jira-live-run-2026-10-26.txt (third test passed with key ZZPROBE4); it wrote src/daemon/tools/builtins/jira/__tests__/fixtures/project-*.txt, which jira-project-auth.test.ts reads

**smoke: jira-docs.test.ts: docs/plans/tool-registry.md lists the five tools, their classes and the excluded and unsupported lists**

| Result | Test | File |
| :--- | :--- | :--- |
| pass | jira-docs.test.ts: docs/plans/tool-registry.md lists the five tools, their classes and the excluded and unsupported lists | `src/daemon/tools/builtins/jira/__tests__/jira-docs.test.ts` |

**Files run**

| File | Exit code | Titles | Time | Note |
| :--- | :--- | :--- | :--- | :--- |
| `src/daemon/tools/builtins/jira/__tests__/jira-docs.test.ts` | 0 | 1 | 0.4 s |  |
