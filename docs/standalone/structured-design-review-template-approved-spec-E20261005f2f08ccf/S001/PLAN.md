<!-- insrc:artifact PLAN-f2f08ccf89f8ab25-S001 -->

# Plan: E20261005f2f08ccf:S001

## Summary

**Epic:** `plan-build-structured-design-review-template`
**LLD run:** `wf-1791180422005-29ykwt`
**LLD effective hash:** `f2f08ccf89f8...`

The build first teaches the review record to say whether a finding is wrong or merely unverified, and adds the two review templates with their settings. It then probes the claude and codex CLIs to learn how a read-only reviewer session can return a checked answer, builds that session, and routes design reviews to it, leaving every other review untouched. The controller review tool gets the same template, and the last task times real reviews against the proposed limits.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Record a finding's outcome and gate on it | M | — | unit: T4 severity follows outcome; unit: T5 verdict by outcome, and today's verdict when no outcome is present; unit: T6 the rendered review lists the two problem kinds separately; unit: T7 approval with could-not-verify only, with does-not-hold, and after a resolution or override; unit: T8 an older review record keeps its verdict and gate result; unit: T17 a holds result is not among the findings that need a human | [[c1]] |
| 2 | **`t2`** Templates, settings, intent and answer validation | M | `t1` | unit: T1 each template has an id, a threshold and its items; ISSUE threshold below SPEC; unit: T2 intent resolution from the artifact store; unit: T3 answer validation, each rejection and each acceptance; unit: T15 deadline by complexity, defaults, a changed setting, and the 10 minute cap | [[c1]] [[c3]] |
| 3 | **`t3`** Probe each CLI for a tool-using structured run | S | — | live: probe: claude and codex each run with read and insrc analyze tools and a schema-checked answer | [[c1]] [[c3]] |
| 4 | **`t4`** Read-only reviewer session on the CLI provider | M | `t3` | live: T14 a reviewer session reads a file, calls insrc analyze, cannot write, and returns a schema-matching answer; unit: session arguments carry no edit permission and the caller's deadline; a transient error is retried once inside the remaining time; unit: one-shot calls and the edit session build the same arguments as before | [[c1]] [[c3]] |
| 5 | **`t5`** Route design reviews to the template session | M | `t1`, `t2`, `t4` | integration: T9 a design stage runs one session and no extract, probe or per-premise call; the prompt carries the template, the insrc analyze instruction and the design last; integration: T10 one repeat on an invalid answer; failure and no stamp on a second; integration: T11 session failure, timeout and a provider with no session capability; integration: T12 DEF and ISSUE reviews send the unchanged extraction prompt, byte for byte; integration: T16 one deadline for the whole review | [[c1]] [[c2]] |
| 6 | **`t6`** Template review in the controller review tool | M | `t1`, `t2` | integration: T13 start and findings on a design; start, claims and verdicts on a DEF; the registered tool accepts phase findings; unit: the schema-registry test lists findings among the review tool's phases | [[c1]] |
| 7 | **`t7`** Time a real design review | S | `t5` | smoke: two real design reviews, one per template, timed and recorded | [[c1]] [[c3]] |

### 1.1 E20261005f2f08ccf:S001:T001 — Record a finding's outcome and gate on it

Add the optional outcome and item fields to a finding and the template id and unverified count to a report. Set a template finding's severity from its outcome, make the verdict warn when only could-not-verify findings exist, render 'Does not hold' and 'Could not verify' as two labelled lists, and keep a holds result out of the findings that need a human. Reviews with no outcome behave exactly as today.

**Acceptance checks:**
- A review with a does-not-hold finding blocks approval; one with only could-not-verify findings gives warn and is approvable; one with only holds gives pass
- The rendered review lists the two problem kinds separately and says which one blocks
- A review record with no outcome fields keeps its verdict, its rendering and its gate result

### 1.2 E20261005f2f08ccf:S001:T002 — Templates, settings, intent and answer validation

Add the two review templates as data (ISSUE: 5 items, 8 premises; SPEC: 8 items, 16 premises) with the thresholds and the 4 / 6 / 8 minute limits exposed as settings whose defaults are those values. Add the resolution of a design's intent and complexity from the artifact store, the 10 minute hard cap that no setting can raise, the template prompt (template, then instructions including the use of insrc analyze, then the design last), and the validation of a reviewer's answer against the template.

**Acceptance checks:**
- A design with an ISSUE artifact for its epicHash resolves to the ISSUE template; any other design resolves to the SPEC template
- With no setting present the defaults are used: 8 and 16 premises, and 4, 6 and 8 minutes
- A changed setting changes the threshold or limit used; a limit above 10 minutes is reduced to 10
- Validation rejects an unanswered item, too many premises, an invalid outcome and a does-not-hold finding naming no file, and accepts `not applicable` with a reason

### 1.3 E20261005f2f08ccf:S001:T003 — Probe each CLI for a tool-using structured run

Run claude and codex live, each with tools limited to reading and the insrc analyze tools and a schema-checked final answer in the same run. Record per CLI whether it works and the exact flags used. This decides, per CLI, whether the reviewer session is one run or a tool run followed by a tool-less structured run. No production code changes in this Task.

**Acceptance checks:**
- The build record states, for claude and for codex separately, the flags tried, whether a file read and an insrc analyze call succeeded, whether a write was refused, and whether the final answer matched the schema
- The record names which path each CLI will use: one run, or two

### 1.4 E20261005f2f08ccf:S001:T004 — Read-only reviewer session on the CLI provider

Add the reviewer session beside the edit session, using the path the probe found for each CLI: no edit permission, read and insrc analyze tools only, a deadline passed in by the caller, at most one retry on a transient error and only inside the time that remains. A CLI that passed the probe uses one run; a CLI that did not uses a tool run followed by a tool-less structured run.

**Acceptance checks:**
- A reviewer session can read a file and call insrc analyze, cannot write a file, and returns an answer matching the schema
- The session stops at the deadline it is given and is never retried more than once
- The one-shot calls and the edit session behave as before

### 1.5 E20261005f2f08ccf:S001:T005 — Route design reviews to the template session

For stage design.epic and design.story, the review run resolves the template and deadline, runs one reviewer session, validates the answer, repeats once with the validation errors if it fails, and stamps the report. The whole review shares one deadline. It applies no automatic edits to a design and runs no second pass. A provider that cannot run a session fails the review with a clear message. Every other stage keeps the existing pipeline untouched.

**Acceptance checks:**
- A design review makes one session and no extract, probe or per-premise call
- An invalid first answer causes exactly one repeat; a second invalid answer, a session failure or a passed deadline fails the review and stamps nothing
- A DEF review and an ISSUE review send the same extraction prompt as before this change, byte for byte

### 1.6 E20261005f2f08ccf:S001:T006 — Template review in the controller review tool

For a design stage, insrc_review_step's start returns the template prompt with next emit_findings, and a new findings phase validates the answer with the same code as the session path and stamps the review. Add the phase to every place the phase list is declared: the tool registration and input validation, the phase type, the dispatch, and the test that pins the list. Other stages keep start, claims, verdicts.

**Acceptance checks:**
- On a design, start returns emit_findings and the findings phase stamps the review
- An answer the session path's validation rejects is rejected by the findings phase with the same errors, and nothing is stamped
- On a DEF, start still returns the extract prompt and the claims and verdicts phases work as before
- The registered tool accepts phase `findings` and its phase list names it

### 1.7 E20261005f2f08ccf:S001:T007 — Time a real design review

Run the finished non-controller review on two real designs in this repo, one answering an ISSUE and one answering a SPEC, and record how long each took and how many premises it examined. Compare with the 4 / 6 / 8 minute defaults and the thresholds, and report whether the defaults fit. No code change unless a default is shown to be wrong.

**Acceptance checks:**
- The build record states, for each of the two reviews, the template used, the time taken, the premises examined and the verdict
- Each review finished inside its time limit, or the record says which default needs changing and why

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| ac1: an HLD or LLD is reviewed against a fixed template chosen by intent; a design for an ISSUE gets the lower threshold and a design for a SPEC the higher one | `t2`, `t5` |
| ac2: the reviewer checks the items itself in one session with read access to the repo and insrc analyze; no pre-declared probes are run for a design review | `t4`, `t5` |
| ac3: every finding is identified as holds, does-not-hold or could-not-verify, and the two problem kinds are reported in separate labelled lists | `t1`, `t2`, `t6` |
| ac4: only does-not-hold blocks approval; a review with only could-not-verify findings is approvable | `t1` |
| ac5: a DEF and every non-design artifact is reviewed as today, and older review records read as today | `t1`, `t5`, `t6` |
| T1 each template has an id, a threshold and its check items; the ISSUE threshold is lower than the SPEC threshold | `t2` |
| T2 intent resolution: an ISSUE artifact for the design's epicHash gives `issue`; none gives `spec` | `t2` |
| T3 validation rejects an answer with an unanswered item, with more premises than the threshold, with an invalid outcome, or with a does-not-hold finding that names no file; it accepts `not applicable` with a reason and an answer under the threshold | `t2` |
| T4 severity follows outcome: does-not-hold keeps HIGH or MED; holds and could-not-verify become LOW | `t1` |
| T15 deadline by complexity: an ISSUE design gets 4 minutes, a standalone feature design 6, a design under an Epic 8; any requested limit above 10 minutes is reduced to 10 | `t2` |
| T5 computeReviewVerdict: a does-not-hold finding gives block; only could-not-verify findings give warn; only holds gives pass; findings with no outcome give today's verdict | `t1` |
| T6 the rendered review section lists 'Does not hold' and 'Could not verify' separately and says which one blocks | `t1` |
| T7 approval: a design whose review has only could-not-verify findings is approved; one with an unresolved does-not-hold finding is refused; a resolution or an override approves it | `t1` |
| T8 a review record written before this change keeps its verdict and its gate result | `t1` |
| T17 the findings that need a human are the does-not-hold and could-not-verify ones; a holds result is not among them | `t1` |
| T9 a design stage runs ONE reviewer session and makes no extract call, no probe and no per-premise call; the prompt carries the template for the resolved intent, the instruction to use insrc analyze for drill-down, and the design at the end | `t5` |
| T10 an invalid first answer causes exactly one repeat carrying the validation errors; a second invalid answer fails the review and stamps nothing | `t5` |
| T11 a session failure or timeout fails the review and stamps nothing; a provider with no session capability fails at once and the old pipeline is not run | `t5` |
| T12 a DEF review and an ISSUE review still run extract, probe and verify and send the same extraction prompt as before this change, byte for byte | `t5` |
| T13 insrc_review_step on a design stage returns the template prompt with next emit_findings, and its findings phase validates and stamps with the same rules; on a DEF it still returns the extract prompt; the registered tool accepts phase `findings` and its phase list names it | `t6` |
| T16 one deadline for the whole review: a validation repeat and a transient-error retry are each started with only the time that remains, a transient error is retried at most once, and a review whose deadline passes fails with a message naming the limit and stamps nothing | `t4`, `t5` |
| T14 a reviewer session started in a fixture repo can read a file and call insrc analyze, cannot write a file, and returns an answer matching the schema | `t3`, `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contract details, data model changes, error paths and test strategy (LLD-f2f08ccf89f8ab25-S001)`
- **[[c2]]** `prior-artifact` `LLD S001 invariants to preserve: a DEF, an ISSUE and every other non-design artifact is reviewed by the existing pipeline unchanged`
- **[[c3]]** `stakeholder` `user, 2026-10-05, resolution of the LLD's three open questions` — "yes, go with recommended"
