<!-- insrc:artifact PLAN-b7a68147dcf72034-s6 -->

# Plan: STORY-b7a68147dcf72034-s6

## Summary

**Epic:** `one-tool-registry-git-gh-jira`
**LLD run:** `wf-1792955732921-sp3luw`
**LLD effective hash:** `e550742c2f67...`

The build adds a src/daemon/tools/builtins/jira/ folder in eleven ordered tasks: first the pure parts (input bounds and identifier checks, answer readers over recorded acli output), then the argv, executor and failure mapper, the answer shapes, and the family definer; then the five op tables (work item reads, work item changes, comments and links, projects and auth); then the coverage table, registration and cross-family tests; and last the gated live tests, the disposable-project probe and the documentation. No file under the gh folder is edited, and the one shared-file change is the single registration call in builtins/index.ts.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Jira input layer: limits, identifier patterns, schema bounds, key normaliser, value checks | M | — | — | unit: jira-inputs.test.ts: jiraInputSchema sets maximum 500, 200 and 200, maxItems 50 and identifier patterns; unit: jira-inputs.test.ts: 51 keys with repeats are refused and normalizeKeys keeps first-seen order; unit: jira-inputs.test.ts: checkJiraValues refuses a leading-dash value in every identifier field | [[c1]] [[c3]] |
| 2 | **`t2`** Answer readers over recorded acli output | M | — | — | unit: jira-parsers.test.ts: readBatch handles all SUCCESS, all FAILURE at exit 0, partial, a count mismatch and the clone key from the message; unit: jira-parsers.test.ts: readCount and parseAuthStatus read recorded acli text; unit: jira-parsers.test.ts: readVisibility group and role cases including count mismatch, heading only, unrecognised line and ANSI escapes | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Argv, executor and failure mapper | M | — | `t1` | unit: jira-argv.test.ts: jiraArgv head, --yes, literal --json, finite --limit, never --paginate and free text as one --flag=value token; unit: jira-failures.test.ts: jiraFailureOf precedence and the probe rules; integration: jira-failures.test.ts: not installed, not signed in, network probe, time-out and truncated output through a fake acli | [[c1]] [[c3]] |
| 4 | **`t4`** Answer shapes and shared answer builders | M | — | `t2` | unit: jira-answers.test.ts: the batch builder lists failed and succeeded ids and says the batch was partly applied; unit: jira-answers.test.ts: the success-mark builder rejects any other exit-0 text; unit: jira-output-schemas.test.ts: each shape accepts its recorded answer, passes extra properties through and rejects a wrong literal op | [[c1]] [[c2]] [[c3]] |
| 5 | **`t5`** defineJiraFamily, approval and preview | M | — | `t1`, `t3`, `t4` | integration: jira-family.test.ts: a sample family refuses unknown ops, missing, extra and exclusive-group fields before acli runs; integration: jira-output-validation.test.ts: a builder that returns data outside its union, or no data, is schema-mismatch through executeTool; integration: jira-failures.test.ts: reader failures are rejected through executeTool; unit: jira-approval.test.ts: the approval function per op and an unknown op is destructive and denied with no client | [[c1]] [[c2]] [[c3]] |
| 6 | **`t6`** jira_workitem reads (5 ops) | M | — | `t5` | integration: jira-workitem-reads.test.ts: each read op returns its declared shape and its argv matches acli; integration: jira-workitem-reads.test.ts: search and count take exactly one of jql and filter and search is limited | [[c1]] [[c2]] |
| 7 | **`t7`** jira_workitem changes (10 ops) | L | — | `t6` | integration: jira-workitem-changes.test.ts: each changing op returns {ok, target, message} and its argv matches acli; integration: jira-workitem-changes.test.ts: keys only, repeated keys sent once, jql, filter and from-file refused; integration: jira-workitem-changes.test.ts: a FAILURE result at exit 0 and a partial batch are rejected failures | [[c1]] [[c2]] [[c3]] |
| 8 | **`t8`** jira_comment (5 ops) and jira_link (4 ops) | M | — | `t5` | integration: jira-comment-link.test.ts: every comment and link op returns its declared shape and its argv matches acli; integration: jira-comment-link.test.ts: text commands without the success mark are rejected and visibility rules are enforced | [[c1]] [[c2]] |
| 9 | **`t9`** jira_project (7 ops) and jira_auth (1 op) | M | — | `t5` | integration: jira-project-auth.test.ts: every project op and auth status returns its declared shape and its argv matches acli; integration: jira-project-auth.test.ts: project create needs fromProject and a non-company-managed source is a rejected failure | [[c1]] [[c2]] |
| 10 | **`t10`** Coverage table, registration and cross-family tests | M | — | `t7`, `t8`, `t9` | unit: jira-coverage.test.ts: every acli command is covered or in the amended exclusion list, checked against REQUIRED_OPS, and the exclusion list equals the amendment table; unit: jira-coverage.test.ts: JIRA_UNSUPPORTED names a transition by id and the list of transitions and neither is a registered op; unit: jira-coverage.test.ts: classes are 6 destructive, 12 none, 14 common, 32 in all; integration: jira-parser.test.ts: the commands and flags of the real acli match the coverage table, including the project flags (skipped when acli is absent); integration: jira-spawn-only.test.ts: with fake jira, jira-cli and go-jira on PATH only acli is run across every op; integration: jira-family.test.ts: the five tools and 32 ops are registered and each op returns its declared shape; smoke: jira-registration.test.ts: registerJiraTools adds exactly five tool ids and changes no existing one | [[c1]] [[c4]] [[c5]] |
| 11 | **`t11`** Live tests, project probe and documentation | M | — | `t10` | live: jira-live.test.ts: read ops view, search, count, list, types, status and visibility return their declared shape; live: jira-live.test.ts: one work item create then delete in a scratch project with cleanup of any clone; live: jira-live.test.ts: the disposable-project probe records the real success text of each project mutation; smoke: jira-docs.test.ts: docs/plans/tool-registry.md lists the five tools, their classes and the excluded and unsupported lists | [[c4]] [[c5]] |

### 1.1 TASK-b7a68147dcf72034-s6-t1 — Jira input layer: limits, identifier patterns, schema bounds, key normaliser, value checks

Create src/daemon/tools/builtins/jira/limits.ts (JIRA_LIMITS, JIRA_PATTERNS) and input.ts (jiraInputSchema, normalizeKeys, checkJiraValues). Pure functions over the exported gh op-table types; no gh file is edited.

**Acceptance checks:**
- jiraInputSchema sets maximum 500, 200 and 200 on the search, project list and comment list limit fields, maxItems 50 on every key array and a pattern on every identifier field
- 51 keys supplied, even with repeats, are refused by the schema; normalizeKeys keeps first-seen order and drops repeats
- checkJiraValues refuses a value that starts with '-' in every identifier field (key, keys, project, toProject, projectKey, fromProject, id, user, type name, status, assignee)
- no file under src/daemon/tools/builtins/gh is changed

### 1.2 TASK-b7a68147dcf72034-s6-t2 — Answer readers over recorded acli output

Create src/daemon/tools/builtins/jira/readers.ts with readBatch, readCount, readVisibility (ANSI stripped, count must match rows, heading-only rejected) and parseAuthStatus, and store output recorded from the real acli (docs/plans/tool-registry.md inventory and the approved write probe) as fixture files under src/daemon/tools/builtins/jira/__tests__/fixtures.

**Acceptance checks:**
- readBatch is ok only when results is non-empty, every status is SUCCESS and the counts agree; a FAILURE at exit 0 and a partial batch are reported as not ok with the failed and succeeded ids
- a clone's new key is read from the success message, not the result id
- readCount returns the integer of 'Number of work items in the search: N' and undefined when the line is missing
- readVisibility accepts a group table only when '(N total)' equals the parsed rows ('(0 total)' is the only empty), rejects a heading-only or unrecognised body, and accepts a role body only with at least one '- Name' line
- parseAuthStatus reads signedIn, site, email and authType and treats an 'unauthorized' text as signed out

### 1.3 TASK-b7a68147dcf72034-s6-t3 — Argv, executor and failure mapper

Create src/daemon/tools/builtins/jira/exec.ts with jiraArgv (head acli, free text as one --flag=value token, no --paginate), acliExec (runShellBytes, standard input closed, one 'acli jira auth status' probe after an unexplained failure) and jiraFailureOf (precedence and positive-evidence sign-in rule), plus the fake acli test harness _fakeacli.ts.

**Acceptance checks:**
- jiraArgv starts with acli jira, replaces the gh head of buildArgv, passes --yes where acli has it, never --paginate and never --from-json or --generate-json
- a free-text value that starts with '-' is passed as one --flag=value token
- jiraFailureOf returns missing-tool for a spawn failure or exit 127, timed-out with 'outcome is unknown' for a changing op, and missing-signin only when the probe completed and said unauthorized; a probe that failed on network, time-out or spawn never gives missing-signin
- a known rejection text is rejected without running the probe and an output cut at the capture cap is a failure

### 1.4 TASK-b7a68147dcf72034-s6-t4 — Answer shapes and shared answer builders

Create src/daemon/tools/builtins/jira/schemas.ts (the answer shapes: view, search, count, attachment, watcher, comment list, visibility, link, project, auth status, and the changing-op shape {ok, target, message}) and answers.ts with the shared builders for a batch result, a success-mark text result, a JSON read and a count, built on the readers of t2. Only key, id, name and the properties callers need are typed; the rest passes through as unknown.

**Acceptance checks:**
- the batch builder turns a not-ok batch into a rejected failure that lists each failed id and, when some succeeded, each succeeded id with the words 'the batch was partly applied'
- the success-mark builder accepts text that starts with the success mark and turns any other exit-0 text into a rejected failure with acli's text in original
- the JSON builders type only key, id and name (watchers accountId) so an extra or null property never fails a call
- each shape accepts the recorded answer of its op and rejects a wrong literal op

### 1.5 TASK-b7a68147dcf72034-s6-t5 — defineJiraFamily, approval and preview

Create src/daemon/tools/builtins/jira/family.ts: defineJiraFamily takes the ops, builds the input schema with jiraInputSchema, runs refuseInput with dashSafe true, checkJiraValues, normalizeKeys, jiraArgv and acliExec, maps failures with jiraFailureOf, calls the op's answer builder, wraps the tool in withGhFailureNet and returns a GhFamilyTool; approval is a function of the op (an unknown op is destructive) with a small preview. Tested on a small table of sample ops.

**Acceptance checks:**
- a family built from sample ops refuses unknown ops, missing, extra and exclusive-group fields through the run-time input check before acli runs
- a reader failure comes back from executeTool as kind rejected and a builder that returns data outside its op's union, or no data, comes back as kind schema-mismatch
- the approval function returns none, common or destructive per op and destructive for an unknown op
- the returned value is a GhFamilyTool carrying its ops and no gh file is changed

### 1.6 TASK-b7a68147dcf72034-s6-t6 — jira_workitem reads (5 ops)

Create src/daemon/tools/builtins/jira/workitem.ts with the jira_workitem family and its read ops: view, search, count, attachment-list and watcher-list, with their fields, rules, class none, limits (30 s, search and count 60 s) and answer builders.

**Acceptance checks:**
- view, search, count, attachment-list and watcher-list are class none and return their declared shapes from recorded output
- search and count take exactly one of jql and filter, search passes a finite --limit within 1 to 500 (default 50) and never --paginate, and count reads the 'Number of work items in the search' line
- the argv of each op matches the acli command and flags

### 1.7 TASK-b7a68147dcf72034-s6-t7 — jira_workitem changes (10 ops)

Extend src/daemon/tools/builtins/jira/workitem.ts with create, edit, transition, assign, clone, archive, unarchive, delete, attachment-delete and watcher-remove, with their fields, rules, classes, 60 s limits and answer builders.

**Acceptance checks:**
- create, edit, transition, assign, clone, archive, unarchive and watcher-remove are common; delete and attachment-delete are destructive
- edit, transition, assign, clone, archive, unarchive and delete take keys only (one to 50), refuse jql, filter and from-file, and pass --yes
- transition takes the target status by name; clone reads the new key from the message; a FAILURE result at exit 0 comes back as a rejected failure
- the argv of each op matches the acli command and flags and each op's recorded answer fits its output member

### 1.8 TASK-b7a68147dcf72034-s6-t8 — jira_comment (5 ops) and jira_link (4 ops)

Create comment.ts (list, create, update, delete, visibility) and link.ts (list, types, create, delete) with fields, rules, classes, limits and answer builders.

**Acceptance checks:**
- comment list/visibility and link list/types are none, comment create/update and link create are common, comment delete and link delete are destructive
- comment list passes a finite --limit within 1 to 200; visibility takes exactly one of group and role and role needs project; a comment body comes only from the body field
- link create and delete and comment update and delete succeed only on the success mark; each op's recorded answer fits its output member

### 1.9 TASK-b7a68147dcf72034-s6-t9 — jira_project (7 ops) and jira_auth (1 op)

Create project.ts (list, view, create from an existing project, update, archive, restore, delete) and auth.ts (status) with fields, rules, classes, limits and answer builders; the project mutation readers accept the success mark only until the probe records the real text.

**Acceptance checks:**
- project create requires fromProject, key and name and builds acli jira project create --from-project SRC --key NEW --name N with optional --description, --url and --lead-email, never --from-json or --generate-json
- project archive and delete are destructive, create, update and restore are common, list and view are none; list takes exactly one of limit (1 to 200, default 30) and recent
- jira_auth status is class none and reads the sign-in state without any model call

### 1.10 TASK-b7a68147dcf72034-s6-t10 — Coverage table, registration and cross-family tests

Create coverage.ts (JIRA_COVERAGE, JIRA_UNSUPPORTED, EXCLUDED_BY_AMENDMENT from the ac1 amendment) and index.ts with registerJiraTools; add the one call to registerBuiltinTools in src/daemon/tools/builtins/index.ts after registerGhTools; add the coverage, parser canary, family, output-schema, approval, spawn-only and registration tests.

**Acceptance checks:**
- registerJiraTools adds exactly five tool ids (jira_workitem, jira_comment, jira_link, jira_project, jira_auth) with 32 ops, 12 none, 14 common and 6 destructive, and changes no existing tool id
- every command of the installed acli jira is covered or in the amended exclusion list, checked against an independently written REQUIRED_OPS inventory, and a transition by id and a list of transitions are named unsupported and are not ops
- with fake jira, jira-cli and go-jira on PATH only acli is run across every op

### 1.11 TASK-b7a68147dcf72034-s6-t11 — Live tests, project probe and documentation

Add the INSRC_LIVE_TESTS-gated live tests (reads, a work item create and delete, and the disposable-project probe gated by a company-managed source project key, a scratch project key and a lead email), run the read-only and work item ones, run the project probe only after the user confirms the three values, record the real success text of each project mutation as fixtures, and document the five tools, their classes and the recorded text in docs/plans/tool-registry.md.

**Acceptance checks:**
- the live tests skip with a reason when INSRC_LIVE_TESTS or the probe variables are not set
- the read-only live ops return their declared shape against the signed-in site
- the project probe runs only after the user confirms the three values; it then creates the scratch project from the source, updates, archives, restores and deletes it, deletes it even if a step fails, and stores the success text of each as fixtures that the project readers are tested against; if the site refuses project creation the refusal text is recorded and the project readers stay on the success mark
- docs/plans/tool-registry.md lists the five tools, their classes and the recorded project mutation text

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| readBatch: all SUCCESS, all FAILURE at exit 0, partial, count mismatch, clone key from the message | `t2` |
| readCount, parseAuthStatus on recorded acli text | `t2` |
| readVisibility: group with a matching '(N total)', group with '(0 total)', count that differs from the rows, heading only, unrecognised line, role with and without '- Name' lines, ANSI escapes | `t2` |
| jiraInputSchema: maximum 500, 200 and 200 on the limit fields, maxItems 50 on key arrays, patterns on identifiers; 51 keys with repeats refused; normalizeKeys keeps first-seen order | `t1` |
| checkJiraValues and the schema patterns: a leading-dash value in every flag-valued identifier (key, keys, project, toProject, projectKey, fromProject, id, user, type name, status, assignee) and in a positional is refused, and refuseInput runs with dashSafe true | `t1`, `t5` |
| jiraArgv: head acli, --yes where acli has it, literal --json, finite --limit only on search, project list and comment list, never --paginate, free text joined as one '--flag=value' token including a value that starts with '-' | `t3`, `t6`, `t8`, `t9` |
| jiraArgv for project create is exactly 'acli jira project create --from-project SRC --key NEW --name N' plus optional --description, --url and --lead-email, and never --from-json or --generate-json; project update uses --project-key; archive, restore and delete use --key and no --yes | `t9` |
| jiraFailureOf precedence and the probe rules (missing-signin only on positive evidence) | `t3` |
| approval function per op and an unknown op | `t5`, `t10` |
| jira_workitem, jira_comment, jira_link, jira_project and jira_auth: every op returns the declared shape | `t6`, `t7`, `t8`, `t9`, `t10` |
| reader failures are rejected: a FAILURE result at exit 0, a text command without the success mark, an unreadable count or visibility body each come back from executeTool as kind rejected | `t5`, `t7`, `t8` |
| executor output validation is schema-mismatch: with an answer builder that returns data outside its op's output union (and one that returns no data), executeTool returns kind schema-mismatch and the family does not relabel it as rejected | `t5` |
| not installed (exit 127), not signed in (unauthorized probe), network failure probe, time-out, truncated output on a read that takes no limit | `t3` |
| project create from a non-company-managed source: acli's refusal text reaches the caller as a rejected failure | `t9` |
| a spawn-only check: with fake jira, jira-cli and go-jira on PATH only acli is ever run | `t10` |
| input rules at run time: exclusive groups, 50 key cap, repeated keys sent once, changing ops refuse jql, filter and from-file, a missing required field (project create without fromProject) and an unknown op are refused by the run-time input check | `t5`, `t7`, `t9` |
| each defineJiraFamily result is a GhFamilyTool carrying its ops (the same shape the gh families return); no concrete compile-time input or output type is asserted | `t5` |
| jira-coverage: every command of the installed acli jira is covered or in the approved exclusion list, checked against an independently written REQUIRED_OPS inventory; the exclusion list equals the table of the section 's6 scope amendment to ac1' in docs/plans/tool-registry.md | `t10` |
| JIRA_UNSUPPORTED names a transition by id and the list of transitions, and neither is a registered op | `t10` |
| output schemas accept the recorded answer of each op and reject a wrong literal op | `t4`, `t10` |
| classes: the 6 destructive ops are destructive, 12 are none, 14 are common, 32 in all | `t10` |
| jira-parser against the real acli --help (canary, skipped when acli is absent), including the flags of project create, update, archive, restore and delete | `t10` |
| read ops: view, search, count, list, types, status, visibility | `t11` |
| one create then delete of a work item in a scratch project with cleanup of any clone | `t11` |
| a disposable-project probe, additionally gated by three environment variables (a company-managed source project key, a scratch project key for the new project, and a lead email): create it from the source, update, archive, restore and delete it, recording the real success text of each as a fixture file before the project mutation readers are accepted; the probe deletes the project even when a step fails, and skips with a reason when the variables are not set | `t11` |
| registerJiraTools adds exactly five tool ids and changes no existing one | `t10` |
| docs/plans/tool-registry.md lists the five tools, their classes and the excluded and unsupported lists | `t11` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s6 contractDetails: registerJiraTools, defineJiraFamily, jiraInputSchema, normalizeKeys, checkJiraValues, jiraArgv, acliExec, jiraFailureOf, the readers, JIRA_LIMITS and the five tools`
- **[[c2]]** `prior-artifact` `LLD s6 dataModelChanges: the op tables, the answer shapes, the readers and input checks, the dependency of builtins/jira on builtins/gh, JIRA_COVERAGE`
- **[[c3]]** `prior-artifact` `LLD s6 errorPaths: the error cases, edge cases and invariants to preserve`
- **[[c4]]** `prior-artifact` `LLD s6 testStrategy: the test levels, subjects and acceptance mapping`
- **[[c5]]** `prior-artifact` `LLD s6 migration and the scope amendment to ac1 in docs/plans/tool-registry.md`
