<!-- insrc:artifact DEF-b9d5c5c40df5a574 -->

# Epic: make-insrc-analysis-complete-used-right

## Summary

**Flavor:** enhancement

An analysis that silently leaves results out cannot be trusted, and today the analyzer does exactly that: every lookup it makes stops at a fixed number of results and reports as if it had seen everything. This Epic first makes every result and answer say honestly whether it is complete, then makes the analyzer measure how large a question really is and handle each size by a method that covers all of it, and only then removes the limits, so that at no point is a limit taken away before the analyzer can handle what it lets through. It also gives answers a shape that fits what was asked.

## Contents

1. [Problem](#1-problem)
2. [Functional requirements](#2-functional-requirements)
3. [Non-goals](#3-non-goals)
4. [Assumptions](#4-assumptions)
5. [Constraints](#5-constraints)
6. [Stories](#6-stories)
7. [References](#7-references)
8. [Open questions](#8-open-questions)

## 1. Problem

The analyzer's findings are incomplete in a way neither the analyzer nor its reader can see. Each of its lookups returns at most a fixed number of results, chosen once and unrelated to the size of the question, and the rest are dropped without the answer saying so; some lookups that fail outright read the same as ones that found nothing. The same question therefore gets a correct answer on a small area of a codebase and a wrong one on a large area, with nothing to tell them apart, which contradicts the framework's own stated rule that nothing relevant is cut. How large a request is gets decided up front from its wording and the overall size of the repository, not from what the question actually touches, and when the analyzer is called through the tools coding agents use it is not decided at all and a middle size is assumed; that size sets how many steps are planned and how much an answer may report, and plays no part in how a large result is dealt with. The answer is then written to one of six fixed layouts, chosen by the kind of source or check and not by the kind of question, each of which suits one sort of answer, such as a structural overview, and each of which itself limits how much may be reported. Beneath all of this, a request that asks no specific question cannot be analysed at all: the analyzer builds no context for it and reports the model as unavailable although the model was never asked, and nothing shows that a broad analysis has run through to a final report.

## 2. Functional requirements

- **E20261006b9d5c5c4:FR001** — Every analyzer result states whether it is complete, a lookup that failed is reported as failed and never as empty, and every answer states whether its findings are complete.
- **E20261006b9d5c5c4:FR002** — The analyzer determines the size of a request from what the request actually touches, on both paths a request can take.
- **E20261006b9d5c5c4:FR003** — For each size of request the analyzer follows a defined way of handling it, and a result set or a single item too large to treat at once is processed in full, in parts, and combined.
- **E20261006b9d5c5c4:FR004** — No lookup or analysis step drops results because of a fixed limit, and no limit is removed before the analyzer can handle what it lets through. _(A fixed limit makes large questions silently wrong; removing one without handling makes them fail.)_
- **E20261006b9d5c5c4:FR005** — The form of an analyzer's answer fits the kind of question asked, including a question that asks for every occurrence of something, for each kind of source the analyzer covers.
- **E20261006b9d5c5c4:FR006** — No answer layout limits how many findings may be reported.
- **E20261006b9d5c5c4:FR007** — A request that asks no specific question is analysed from request to final report, and a request that cannot proceed says why.

**s1:**

- **E20261006b9d5c5c4:S001:FR001** — Each lookup or analysis-step result carries a statement of completeness.
- **E20261006b9d5c5c4:S001:FR002** — A failed lookup is distinguishable from an empty one.
- **E20261006b9d5c5c4:S001:FR003** — A partly read item and a file left out of a text lookup are reported.
- **E20261006b9d5c5c4:S001:FR004** — Every answer states whether its findings are complete.
- **E20261006b9d5c5c4:S001:FR005** — A failure to write the answer is reported, not hidden.

**s2:**

- **E20261006b9d5c5c4:S002:FR001** — Request size is measured, not guessed from wording or assumed.
- **E20261006b9d5c5c4:S002:FR002** — The measured size and its basis are reported with the answer.

**s3:**

- **E20261006b9d5c5c4:S003:FR001** — A handling method exists for every request size on both paths.
- **E20261006b9d5c5c4:S003:FR002** — Large result sets are processed completely, in parts, and combined.
- **E20261006b9d5c5c4:S003:FR003** — A single item too large to read at once is read in full, in sections.
- **E20261006b9d5c5c4:S003:FR004** — The answer reports how the request was handled.

**s4:**

- **E20261006b9d5c5c4:S004:FR001** — No lookup or analysis step drops results because of a fixed limit, in any kind of source the analyzer covers.
- **E20261006b9d5c5c4:S004:FR002** — No fixed cut is applied to an item's content.
- **E20261006b9d5c5c4:S004:FR003** — A text lookup discards no file, line or output for its size.
- **E20261006b9d5c5c4:S004:FR004** — The planning instructions suggest no fixed number of results.

**s5:**

- **E20261006b9d5c5c4:S005:FR001** — A question asking for every occurrence gets a complete enumeration as its answer.
- **E20261006b9d5c5c4:S005:FR002** — The answer layouts of all analyzer kinds are free of limits on findings.
- **E20261006b9d5c5c4:S005:FR003** — Each layout covers every lookup its analyzer can run.

**s6:**

- **E20261006b9d5c5c4:S006:FR001** — A request that asks no specific question gets its context built and can proceed.
- **E20261006b9d5c5c4:S006:FR002** — A failure to proceed reports its actual cause.

**s7:**

- **E20261006b9d5c5c4:S007:FR001** — A broad analysis runs through every stage to a final report.
- **E20261006b9d5c5c4:S007:FR002** — A run that stops records where and why.

## 3. Non-goals

- **Reducing what an analysis costs in time or model usage.** — The project rule puts accuracy first and cost last; a complete answer may take longer and that is accepted.
- **Routing every codebase question through the analyzer.** — The stakeholder decided a simple text search stays a plain search; only questions about relationships or meaning need analysis.
- **Changing what the code index contains or how it is built.** — The problem is results being dropped after they are found, not what is indexed; index freshness for files created in a session is a separate matter.
- **Removing limits that protect a model's input from a single oversized item, without a replacement.** — A very large item must still be read in full by some means; the Epic requires that it be handled in full, not that the protection simply vanish.
- **Changing the limits of the general-purpose search tools for callers other than the analyzer.** — Other agents and tools call those primitives with their own expectations; the Epic concerns what the analyzer receives from them.
- **Guidance to coding agents on when to use their own search tools and when to use the analyzer.** — The stakeholder decided this is steering text only and it was applied by hand on 2026-10-07 (commit 83a1cc0); nothing about it is built or enforced in this Epic.
- **Repairing the code graph's missing cross-file import and call edges.** — Tracked separately as ISSUE-12f70133491114c9, to be taken up after this Epic; until then a relationship lookup can be incomplete for reasons this Epic does not address, and its results must say only what this Epic can establish about completeness.
- **Removing a limit before the analyzer can state completeness, measure a request and handle a large result.** — The stakeholder chose an order in which no limit is taken away until what it lets through can be handled; the stories depend on one another accordingly.

## 4. Assumptions

- `med` Every place the analyzer drops results can be found by reading its recipes, runtimes, prompts and the search primitives it calls. [[c1]]
- `med` The number of results a request will touch can be counted before the request is run in full; today only the size of the whole repository is counted. [[c2]]
- `med` A result set too large to reason over at once can be divided, reasoned over part by part, and combined without losing findings, building on the way the framework already runs a large plan as child plans whose results an aggregator combines. [[c10]]
- `low` The stages of a broad analysis that lie beyond building the context (planning, running the plan, combining the results) work or can be corrected within Story s7; no completed run on record shows this either way. [[c21]]

## 5. Constraints

| ID | Type | Text | Source |
| :--- | :--- | :--- | :--- |
| `k1` | stakeholder | Accuracy is primary and cost is the least priority; a cheaper path is valid only when it preserves accuracy. | [[c3]] |
| `k2` | invariant | The context builder's shaper has no token budget, no summarize-down and no truncation knobs, and includes everything relevant; this Epic holds every analyzer lookup and answer layout to the same rule. | [[c4]] |
| `k3` | stakeholder | No analyzer result may be reduced without the result saying so. | [[c5]] |
| `k4` | convention | Calls that reach a model are made one after another, never in parallel. | [[c3]] |
| `k5` | convention | Schemas, catalogs and other structural reference go at the end of a prompt, not the middle. | [[c3]] |
| `k6` | stakeholder | A simple text search remains a plain search; the analyzer is for questions that depend on relationships or meaning. | [[c7]] |
| `k7` | invariant | Every claim in an analysis is grounded in a real exploration output, with no invented paths. | [[c9]] |

## 6. Stories

### 6.1 E20261006b9d5c5c4:S001 — Every result and every answer says whether it is complete

**User value:** `size: L`

As someone relying on an analysis, I am told plainly when a result was cut, when a lookup failed and when the analyzer could not produce an answer, so I never act on something that silently left things out.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given any lookup or analysis step the analyzer performs, on either path a request can take through the analyzer, when its result is produced, then the result states whether it is complete, and if it is not, how many results exist, how many were returned and why some are missing. _(operationalizes `k3`)_
- **ac2:** Given a lookup that cannot be carried out, when the analyzer reports on it, then it is reported as failed with the reason, and never as a lookup that found nothing. _(operationalizes `k3`, `k7`)_
- **ac3:** Given a single item, such as a long document section, of which only part was read, when its result is produced, then the result names the item and says how much of it was read. _(operationalizes `k3`)_
- **ac4:** Given files that a text lookup did not read, because of their size, their kind or an error, when its result is produced, then the result says which were left out and why, or by what rule. _(operationalizes `k3`)_
- **ac5:** Given any answer, on either path a request can take through the analyzer, when it is delivered, then it states whether its findings are complete and names every result that was cut, partly read or failed. _(operationalizes `k3`)_
- **ac6:** Given the step that writes the answer fails, when the request ends, then the failure is reported with what the lookups found, and the request is not passed silently to another way of answering. _(operationalizes `k3`, `k7`)_

### 6.2 E20261006b9d5c5c4:S002 — The analyzer sizes a request from what it actually touches

**User value:** `size: M`

As someone asking a question, the analyzer finds out how big my question really is before it answers, so a large question is recognised as large and is not treated like a small one.

**Depends on:** `s1`, `s7`

**Extends:** [[c2]] [[c11]]

**Acceptance criteria:**

- **ac1:** Given a request, however it reaches the analyzer, including through the tools coding agents use, when the analyzer begins work on it, then it determines the size of the request from counts of what the request touches, and no size is taken from the wording alone or assumed. _(operationalizes `k1`)_
- **ac2:** Given two requests with similar wording, one touching a small area and one touching a large area, when each is sized, then they are given different sizes that reflect what each touches. _(operationalizes `k1`)_
- **ac3:** Given a request that has been sized, when its answer is delivered, then the answer states the size that was determined and the counts it was determined from. _(operationalizes `k3`, `k7`)_
- **ac4:** Given a request whose size cannot be determined, when the analyzer proceeds, then it says so and treats the request as the largest size, never as a small one. _(operationalizes `k1`, `k3`)_
- **ac5:** Given a caller that states a size for its request, when the request is sized, then the stated size is kept as a hint and the measured size is used. _(operationalizes `k1`)_

### 6.3 E20261006b9d5c5c4:S003 — Each request size has a defined way of being handled, in full

**User value:** `size: L`

As someone asking a large question, the analyzer works through all of it by a known method for its size and gives me one combined answer, so the size of my question never decides how much of it gets looked at.

**Depends on:** `s1`, `s2`, `s7`

**Acceptance criteria:**

- **ac1:** Given each size a request can have, on either path a request can take through the analyzer, when the analyzer's handling of that size is examined, then there is a stated way of handling it that covers the whole of the request. _(operationalizes `k2`)_
- **ac2:** Given a request whose results are too many to be reasoned over at once, when the analyzer handles it, then the results are divided into parts, every part is reasoned over, and the findings are combined into one answer with none lost. _(operationalizes `k2`, `k4`)_
- **ac3:** Given a request handled in parts, when its answer is delivered, then the answer states how many parts there were and that all were processed, or names any part that was not and why. _(operationalizes `k3`)_
- **ac4:** Given a small request, when the analyzer handles it, then its results are returned whole without being divided. _(operationalizes `k1`)_
- **ac5:** Given a part that fails while a large request is being handled, when the answer is assembled, then the findings of the other parts are kept and the failed part is reported as not covered. _(operationalizes `k3`, `k7`)_
- **ac6:** Given a single item, such as a long document section, that is too large to be read at once, when the analyzer reads it, then its whole content is taken into account, not only its beginning. _(operationalizes `k2`)_

### 6.4 E20261006b9d5c5c4:S004 — No lookup drops results

**User value:** `size: L`

As someone relying on an analysis, I get every result a lookup found, whatever the size of my question, because nothing in the analyzer stops at a fixed number.

**Depends on:** `s1`, `s3`, `s7`

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a lookup or analysis step whose true number of results is larger than any limit the analyzer used to apply, on either path a request can take through the analyzer, when the analyzer performs it, then every result is returned and none is dropped. _(operationalizes `k2`, `k3`)_
- **ac2:** Given a single item larger than any fixed cut the analyzer used to apply to an item's content, when the analyzer reads it, then no fixed cut is applied to it. _(operationalizes `k2`)_
- **ac3:** Given a text lookup over files of any size and lines of any length, when it runs, then no file is left out for its size, no matching line is shortened, and no part of the search's output is discarded. _(operationalizes `k2`, `k3`)_
- **ac4:** Given the analyzer's own instructions and examples to the model that plans a lookup, when they are read, then none of them states or suggests a fixed number of results to ask for. _(operationalizes `k2`)_
- **ac5:** Given a result set that became larger because a limit was removed, when the analyzer answers, then it is handled by the method for its size, and the answer is complete. _(operationalizes `k1`, `k2`)_

### 6.5 E20261006b9d5c5c4:S005 — The form of an answer fits the question, for every kind of analyzer

**User value:** `size: L`

As someone reading an analysis, the answer is laid out for the question I asked, including when I asked for every occurrence of something, and no layout holds back findings.

**Depends on:** `s1`

**Extends:** [[c12]] [[c13]]

**Acceptance criteria:**

- **ac1:** Given a question that asks for every occurrence of something, when the analyzer answers it, then the answer is a complete list of the occurrences with where each is, and is not forced into an overview of a module. _(operationalizes `k2`, `k6`)_
- **ac2:** Given each answer layout the analyzer has, for code, documents, rule adherence, capability discovery, data and infrastructure, and the older per-source layouts it falls back to, when its answer layout is examined, then the layout places no limit on how many findings may be reported. _(operationalizes `k2`, `k3`)_
- **ac3:** Given an answer layout, when it describes the lookup results it may draw on, then every kind of lookup that analyzer can run is described. _(operationalizes `k7`)_
- **ac4:** Given a question whose kind does not match the layout that would be used, when the analyzer answers, then it uses a layout for that kind of question and does not require parts of a layout the question has nothing to fill. _(operationalizes `k7`)_

**Local constraints:**

- `lc1` (convention) Structural reference in a prompt goes at its end. [[c3]]

### 6.6 E20261006b9d5c5c4:S006 — An unfocused request gets an answer, and a request that cannot proceed says why

**User value:** `size: M`

As someone asking the analyzer a broad question about a repository or a module, I get an analysis back, and when the analyzer cannot proceed I am told the actual reason, not that the model is unavailable when it was never asked.

**Extends:** [[c21]]

**Acceptance criteria:**

- **ac1:** Given a request that names an area but asks no specific question, when the analyzer builds the context for it, then it produces that context, where today it produces none and the request fails. _(operationalizes `k1`)_
- **ac2:** Given a request started with a stated kind of source, which today is always treated as asking no specific question, when the analyzer handles it, then it proceeds as far as any other request does. _(operationalizes `k1`)_
- **ac3:** Given a request the analyzer cannot proceed with, when it fails, then the failure names the actual cause, and says the model is unavailable only when a call to the model failed. _(operationalizes `k3`, `k7`)_
- **ac4:** Given a request that names a single file or a single symbol, when the analyzer builds the context for it, then it either produces that context or reports that such a request is not supported, and never reports the model as unavailable. _(operationalizes `k3`)_

### 6.7 E20261006b9d5c5c4:S007 — A broad analysis completes from request to final report

**User value:** `size: L`

As someone asking the analyzer a broad question, the whole analysis runs to a final report, so the work this Epic does on completeness, sizing and handling has a working path to apply to.

**Depends on:** `s6`

**Extends:** [[c21]]

**Acceptance criteria:**

- **ac1:** Given a broad request on a repository that is indexed, when the analysis is run, then it completes every stage and returns a final report, and what stopped it at any stage it did not pass today is found and corrected. _(operationalizes `k1`)_
- **ac2:** Given an analysis whose plan includes steps that themselves plan further steps, when it is run, then those nested steps run and their results reach the final report. _(operationalizes `k7`)_
- **ac3:** Given an analysis that stops part of the way through, when it ends, then the record of the run says at which stage it stopped and why, and is not left reading as still in progress. _(operationalizes `k3`)_
- **ac4:** Given a completed analysis, when it is asked for again by the same run, then the stored result is returned as before. _(operationalizes `k1`)_

## 7. References

- **[[c1]]** `analyze-bundle` `Lookups in src/analyze that return at most a fixed number of results (file:line of the constant, default / maximum): explore/search-text.ts:39-40 (30 / 200); explore/symbol-locate.ts:37-38 (50 / 200); explore/config-trace.ts:42-43 (40 / 200); explore/test-locate.ts:44-45 (20 / 100); explore/import-graph.ts:48-49 (15 / 60); explore/usage-example.ts:37-38 (12 / 40); explore/doc-mention.ts:37-38 (15 / 40); explore/concept-resolve.ts:64 (20); explore/capability-reuse-check.ts:58-59 (5 / 12); explore/db-tables-list.ts:36-37 (40 / 500); explore/manifests-locate.ts:51-52 (200 / 1,000); explore/data-model-trace.ts:47-49 (4 targets, 12 fields, 6 callers); explore/convention-detect.ts:54, :57 (5 subclasses, 8 idioms); runtimes/data/discovery-objects.ts:56 (200 files); runtimes/infra/_shared.ts:90 (5,000 files); runtimes/infra/discovery-families.ts:53 (8 samples). Cuts on the content of one item: explore/doc-constraint-enumerate.ts:227 and explore/doc-decision-trace.ts:242 (first 2,000 characters); runtimes/code/adherence-check.ts:92, runtimes/data/adherence-check.ts:100 and runtimes/infra/adherence-check.ts:89 (first 1,200); explore/module-profile.ts:222, :284 (first 4,096); summariser/driver.ts:317 (first 8,192). Not counted: text-length limits on plan fields (planner/schema.ts:42-44), which bound a model's own wording, not results. Found by an analyzer run of 2026-10-06 (two search.text explorations and a module.profile over src/analyze) and confirmed by reading each file. Found by the HLD's review and added: the maxSources parameter of the two document lookups (explore/executor.ts:315, :337); src/analyze/docs-retrieval.ts:290; explore/capability-reuse-check.ts:303, :348-350; explore/db-table-describe.ts:175, :181; runtimes/docs/family-summarise.ts:162; the preview limits explore/doc-mention.ts:39-40; and, in the shared grep primitive src/daemon/tools/builtins/search/grep.ts, the cut of a matching line at 500 characters (:107), the skip of files over 2 MB (:102), the silent skip of unreadable files (:111) and the per-file match limit (:178). Also in the shared grep primitive: the search's output is kept only up to 4 MB and the rest discarded without a signal (the ripgrep call at src/daemon/tools/builtins/search/grep.ts:181, through src/daemon/tools/shell-helper.ts:86-89), and the ripgrep path cuts a matching line at 500 characters too (:193); the two search backends leave out different files by rule (ripgrep honours .gitignore and skips hidden and binary files; the fallback skips dot-names and a fixed list of directories, :95). On the plan-tree path the same kinds of limit sit in the plan-task runtimes (runtimes/data/discovery-objects.ts:56, runtimes/infra/_shared.ts:90, runtimes/infra/discovery-families.ts:53, runtimes/docs/family-summarise.ts:162 and the three adherence checks).` — "const DEFAULT_TOP_K = 30;"
- **[[c2]]** `code` `src/analyze/classifier/scope-picker.ts` — "readonly totalEntityCount: number;"
- **[[c3]]** `doc` `CLAUDE.md` — "Accuracy is primary; cost is the least priority."
- **[[c4]]** `doc` `design/analyze-context-builder.md` — "The shaper has **no token budget, no summarize-down, no truncation knobs**."
- **[[c5]]** `stakeholder` `user, 2026-10-06` — "Analyzer's text search is capped, why? this will result in inconsistencies/incorrect analysis. REMOVE ANY CAPS from insrc analyzer."
- **[[c6]]** `step-output` `Tool-call counts from Claude Code's session logs for this project (the .jsonl files under ~/.claude/projects/-Users-subhagho-work-projects-insors-insrc/, counted on 2026-10-06 by tallying tool_use entries by name): in the session of that day, 882 shell commands of which 670 were grep, find, sed -n or cat, against 2 insrc_analyze_step calls; across all 843 session files, 12,931 shell commands and 1,032 Grep calls against 228 insrc_analyze_step and 46 insrc_analyze calls. Measured from logs outside the repository; not reproducible from the source tree.`
- **[[c7]]** `stakeholder` `user, 2026-10-06` — "the agent needs to be able to differentiate between and analysis request and a simple search, a question like "does this code use file IO", doesn't need analysis and a simple grep is good enough, but "
- **[[c8]]** `stakeholder` `user, 2026-10-06` — "Analyzer should scope the size the of the request - Have plans for handling different sizes. - Check the analyzer output template, there are different types of analyzers that were developed."
- **[[c9]]** `doc` `site/analyze.html` — "Every claim is grounded in a real exploration output"
- **[[c10]]** `doc` `design/analyze-plan-builder.md` — "its terminal aggregator's output becomes the value materialized at"
- **[[c11]]** `code` `src/mcp/analyze-step/phases/start.ts` — "const scope  = input.scope  ?? 'M';"
- **[[c12]]** `code` `src/analyze/context/driver.ts` — "const synthesizeTarget: 'code' | 'docs' | 'adherence' | 'capability' | 'data' | 'infra' ="
- **[[c13]]** `code` `src/prompts/analyze/synthesize.code.system.md` — "HARD CAP per scope: XS ≤10 exports, S ≤25, M ≤60, L ≤120, XL ≤250"
- **[[c16]]** `stakeholder` `user, 2026-10-07` — "the agent should be given proper steering for when to use it's own tools and when to use analyze. this doesn't need to be coded, just steering should be eoungh"
- **[[c17]]** `prior-artifact` `ISSUE-12f70133491114c9, filed 2026-10-07: the code graph loses cross-file import and call edges`
- **[[c18]]** `stakeholder` `user, 2026-10-07: reading one large item in full moves from Story s1 to Story s3; Story s1 removes the fixed cut and reports a partly read item`
- **[[c19]]** `stakeholder` `user, 2026-10-07` — "A. Both paths in this epic"
- **[[c20]]** `stakeholder` `user, 2026-10-07: 'go with A' to reordering the work so that completeness reporting comes first, then sizing, then handling in parts, then removal of the limits, then layouts`
- **[[c21]]** `step-output` `Live check of 2026-10-07 through the daemon: a request to build the run context for src/analyze/classifier with focused false fails at once with 'Local Ollama unavailable for shaper invocation: Run-mode exploration pipeline returned no bundle'; the same request with focused true and a focus sentence returns a bundle in 30 seconds. Cause in code: src/analyze/context/driver.ts:1102 returns for an unfocused intent and :276-282 then throws; src/analyze/orchestrator/driver.ts:219 marks every target-hinted request unfocused. Saved run records in ~/.insrc/analyze: 4,318 run directories, two plan-tree run records, both left at the classify stage as in progress. No client in this repository sends analyze.run.start.`
- **[[c22]]** `prior-artifact` `insrc_triage of 2026-10-07: bugfix, sized; taken into this Epic as Stories s6 and s7 at the stakeholder's direction ('traige this and then decide one or more new stories')`

## 8. Open questions

- Story s7 rests on a low-confidence assumption: no completed broad analysis is on record. Its design begins by running one and recording how far it gets; if what is found is larger than one Story, how should it be split?
