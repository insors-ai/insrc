<!-- insrc:artifact DEF-b9d5c5c40df5a574 -->

# Epic: make-insrc-analysis-complete-used-right

## Summary

**Flavor:** enhancement

An analysis that silently leaves results out cannot be trusted, and today the analyzer does exactly that: every lookup it makes stops at a fixed number of results and reports as if it had seen everything. This Epic makes an analysis complete whatever the size of the question, makes it say so, and gives its answers a shape that fits what was asked. It also teaches coding agents when a plain text search is enough and when a question needs the analyzer, so the analyzer is used for the questions only it can answer.

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

The analyzer's findings are incomplete in a way neither the analyzer nor its reader can see. Each of its lookups returns at most a fixed number of results, chosen once and unrelated to the size of the question, and the rest are dropped without the answer saying so; some lookups that fail outright read the same as ones that found nothing. The same question therefore gets a correct answer on a small area of a codebase and a wrong one on a large area, with nothing to tell them apart, which contradicts the framework's own stated rule that nothing relevant is cut. How large a request is gets decided up front from its wording and the overall size of the repository, not from what the question actually touches, and when the analyzer is called through the tools coding agents use it is not decided at all and a middle size is assumed; that size sets how many steps are planned and how much an answer may report, and plays no part in how a large result is dealt with. The answer is then written to one of six fixed layouts, chosen by the kind of source or check and not by the kind of question, each of which suits one sort of answer, such as a structural overview, and each of which itself limits how much may be reported. Alongside this, coding agents are told, in the guidance they are given and in a reminder on every turn, to use the analyzer first for every question about a codebase. Most such questions are plain text lookups, for which the analyzer is slower and no more informative, so agents disregard the instruction altogether, including for the relationship questions where a text lookup gives wrong or partial answers.

## 2. Functional requirements

- **E20261006b9d5c5c4:FR001** — No lookup the analyzer performs drops results because of a fixed limit. _(A fixed limit makes large questions silently wrong.)_
- **E20261006b9d5c5c4:FR002** — Every analyzer result states whether it is complete, and a lookup that failed is reported as failed, never as empty.
- **E20261006b9d5c5c4:FR003** — The analyzer determines the size of a request from what the request actually touches before it runs the request in full.
- **E20261006b9d5c5c4:FR004** — For each size of request the analyzer follows a defined way of handling it, and a result set too large to treat at once is processed in full, in parts, and combined.
- **E20261006b9d5c5c4:FR005** — The form of an analyzer's answer fits the kind of question asked, including a question that asks for every occurrence of something, for each kind of source the analyzer covers.
- **E20261006b9d5c5c4:FR006** — No answer layout limits how many findings may be reported.
- **E20261006b9d5c5c4:FR007** — The guidance given to coding agents states when the agent's own search tools are the right choice and when the analyzer is, with a test for telling them apart.

**s1:**

- **E20261006b9d5c5c4:S001:FR001** — No lookup drops results because of a fixed limit, in any kind of source the analyzer covers.
- **E20261006b9d5c5c4:S001:FR002** — Each lookup result carries a statement of completeness.
- **E20261006b9d5c5c4:S001:FR003** — A failed lookup is distinguishable from an empty one.
- **E20261006b9d5c5c4:S001:FR004** — A large single item is read in full.

**s2:**

- **E20261006b9d5c5c4:S002:FR001** — Request size is measured, not guessed from wording.
- **E20261006b9d5c5c4:S002:FR002** — The measured size and its basis are reported with the answer.

**s3:**

- **E20261006b9d5c5c4:S003:FR001** — A handling method exists for every request size.
- **E20261006b9d5c5c4:S003:FR002** — Large result sets are processed completely, in parts, and combined.
- **E20261006b9d5c5c4:S003:FR003** — The answer reports how the request was handled.

**s4:**

- **E20261006b9d5c5c4:S004:FR001** — A question asking for every occurrence gets a complete enumeration as its answer.
- **E20261006b9d5c5c4:S004:FR002** — The answer layouts of all analyzer kinds are free of limits on findings.
- **E20261006b9d5c5c4:S004:FR003** — Each layout covers every lookup its analyzer can run.

**s5:**

- **E20261006b9d5c5c4:S005:FR001** — Agent guidance distinguishes a plain search from an analysis request.
- **E20261006b9d5c5c4:S005:FR002** — The distinction is delivered as guidance text alone.

## 3. Non-goals

- **Reducing what an analysis costs in time or model usage.** — The project rule puts accuracy first and cost last; a complete answer may take longer and that is accepted.
- **Routing every codebase question through the analyzer.** — The stakeholder decided a simple text search stays a plain search; only questions about relationships or meaning need analysis.
- **Changing what the code index contains or how it is built.** — The problem is results being dropped after they are found, not what is indexed; index freshness for files created in a session is a separate matter.
- **Removing limits that protect a model's input from a single oversized item, without a replacement.** — A very large item must still be read in full by some means; the Epic requires that it be handled in full, not that the protection simply vanish.
- **Changing the limits of the general-purpose search tools for callers other than the analyzer.** — Other agents and tools call those primitives with their own expectations; the Epic concerns what the analyzer receives from them.
- **Checking in code that evidence submitted to a workflow step came from an analyzer run, or changing what multi-step exchanges send back.** — The stakeholder decided that steering the agent is enough; nothing about when to use the analyzer is to be enforced in code.

## 4. Assumptions

- `med` Every place the analyzer drops results can be found by reading its recipes, runtimes, prompts and the search primitives it calls. [[c1]]
- `med` The number of results a request will touch can be counted before the request is run in full; today only the size of the whole repository is counted. [[c2]]
- `med` A result set too large to reason over at once can be divided, reasoned over part by part, and combined without losing findings, building on the way the framework already runs a large plan as child plans whose results an aggregator combines. [[c10]]
- `med` An agent can tell a text lookup from a relationship question from the wording of the question and a short stated test. [[c7]]
- `med` Guidance text alone is enough to change which tool an agent reaches for; the blanket 'analyzer first' instruction is what agents have been disregarding. [[c6]]

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

### 6.1 E20261006b9d5c5c4:S001 — Every analyzer lookup returns everything and says whether it is complete

**User value:** `size: L`

As someone relying on an analysis, I get every result a lookup found, and I am told plainly when a result is partial or the lookup failed, so I never act on an answer that silently left things out.

**Extends:** [[c1]]

**Acceptance criteria:**

- **ac1:** Given a lookup whose true number of results is larger than any limit the analyzer used to apply, when the analyzer performs that lookup, then every result is returned and none is dropped. _(operationalizes `k2`, `k3`)_
- **ac2:** Given any lookup the analyzer performs, when its result is produced, then the result states whether it is complete, and if it is not, how many results exist and why some are missing. _(operationalizes `k3`)_
- **ac3:** Given a lookup that cannot be carried out, when the analyzer reports on it, then it is reported as failed with the reason, and never as a lookup that found nothing. _(operationalizes `k3`, `k7`)_
- **ac4:** Given a single item, such as a long document section, that is larger than what was previously kept, when the analyzer reads it, then its whole content is taken into account, not only its beginning. _(operationalizes `k2`)_
- **ac5:** Given the analyzer's own instructions and examples to the model that plans a lookup, when they are read, then none of them states or suggests a fixed number of results to ask for. _(operationalizes `k2`)_

### 6.2 E20261006b9d5c5c4:S002 — The analyzer sizes a request from what it actually touches

**User value:** `size: M`

As someone asking a question, the analyzer finds out how big my question really is before it answers, so a large question is recognised as large and is not treated like a small one.

**Depends on:** `s1`

**Extends:** [[c2]] [[c11]]

**Acceptance criteria:**

- **ac1:** Given a request, however it reaches the analyzer, including through the tools coding agents use, when the analyzer begins work on it, then it determines the size of the request from counts of what the request touches, before running the request in full. _(operationalizes `k1`)_
- **ac2:** Given two requests with similar wording, one touching a small area and one touching a large area, when each is sized, then they are given different sizes that reflect what each touches. _(operationalizes `k1`)_
- **ac3:** Given a request that has been sized, when its answer is delivered, then the answer states the size that was determined and the counts it was determined from. _(operationalizes `k3`, `k7`)_
- **ac4:** Given a request whose size cannot be determined, when the analyzer proceeds, then it says so and treats the request as the largest size, never as a small one. _(operationalizes `k1`, `k3`)_

### 6.3 E20261006b9d5c5c4:S003 — Each request size has a defined way of being handled, in full

**User value:** `size: L`

As someone asking a large question, the analyzer works through all of it by a known method for its size and gives me one combined answer, so the size of my question never decides how much of it gets looked at.

**Depends on:** `s1`, `s2`

**Acceptance criteria:**

- **ac1:** Given each size a request can have, when the analyzer's handling of that size is examined, then there is a stated way of handling it that covers the whole of the request. _(operationalizes `k2`)_
- **ac2:** Given a request whose results are too many to be reasoned over at once, when the analyzer handles it, then the results are divided into parts, every part is reasoned over, and the findings are combined into one answer with none lost. _(operationalizes `k2`, `k4`)_
- **ac3:** Given a request handled in parts, when its answer is delivered, then the answer states how many parts there were and that all were processed, or names any part that was not and why. _(operationalizes `k3`)_
- **ac4:** Given a small request, when the analyzer handles it, then its results are returned whole without being divided. _(operationalizes `k1`)_
- **ac5:** Given a part that fails while a large request is being handled, when the answer is assembled, then the findings of the other parts are kept and the failed part is reported as not covered. _(operationalizes `k3`, `k7`)_

### 6.4 E20261006b9d5c5c4:S004 — The form of an answer fits the question, for every kind of analyzer

**User value:** `size: L`

As someone reading an analysis, the answer is laid out for the question I asked, including when I asked for every occurrence of something, and no layout holds back findings.

**Depends on:** `s1`

**Extends:** [[c12]] [[c13]]

**Acceptance criteria:**

- **ac1:** Given a question that asks for every occurrence of something, when the analyzer answers it, then the answer is a complete list of the occurrences with where each is, and is not forced into an overview of a module. _(operationalizes `k2`, `k6`)_
- **ac2:** Given each answer layout the analyzer has, for code, documents, rule adherence, capability discovery, data and infrastructure, and the older per-source layouts it falls back to, when its answer layout is examined, then the layout places no limit on how many findings may be reported. _(operationalizes `k2`, `k3`)_
- **ac3:** Given an answer layout, when it describes the lookup results it may draw on, then every kind of lookup that analyzer can run is described. _(operationalizes `k7`)_
- **ac4:** Given a question whose kind does not match the layout that would be used, when the analyzer answers, then it uses a layout for that kind of question and does not require parts of a layout the question has nothing to fill. _(operationalizes `k7`)_
- **ac5:** Given any answer, when it is delivered, then it states whether its findings are complete. _(operationalizes `k3`)_

**Local constraints:**

- `lc1` (convention) Structural reference in a prompt goes at its end. [[c3]]

### 6.5 E20261006b9d5c5c4:S005 — Agents are steered on when to use their own search tools and when to use the analyzer

**User value:** `size: S`

As someone working with a coding agent, the agent uses its own search tools for a plain lookup and the analyzer for a question about relationships or meaning, because the guidance it is given tells it how to tell the two apart.

**Extends:** [[c14]]

**Acceptance criteria:**

- **ac1:** Given the guidance an agent receives about exploring a codebase, when it is read, then it states that a question answered by whether or where text occurs is a plain search, that a question depending on relationships or meaning needs the analyzer, and gives a test and examples for telling them apart. _(operationalizes `k6`)_
- **ac2:** Given the same guidance, when they are read, then neither instructs the agent to use the analyzer first for every question. _(operationalizes `k6`)_
- **ac3:** Given the change this Story makes, when it is examined, then it consists of guidance text only, and no tool or workflow step behaves differently. _(operationalizes `k6`)_

**Local constraints:**

- `lc1` (stakeholder) The search-versus-analysis distinction is delivered by steering text only; it is not enforced or checked in code. [[c16]]

## 7. References

- **[[c1]]** `analyze-bundle` `Lookups in src/analyze that return at most a fixed number of results (file:line of the constant, default / maximum): explore/search-text.ts:39-40 (30 / 200); explore/symbol-locate.ts:37-38 (50 / 200); explore/config-trace.ts:42-43 (40 / 200); explore/test-locate.ts:44-45 (20 / 100); explore/import-graph.ts:48-49 (15 / 60); explore/usage-example.ts:37-38 (12 / 40); explore/doc-mention.ts:37-38 (15 / 40); explore/concept-resolve.ts:64 (20); explore/capability-reuse-check.ts:58-59 (5 / 12); explore/db-tables-list.ts:36-37 (40 / 500); explore/manifests-locate.ts:51-52 (200 / 1,000); explore/data-model-trace.ts:47-49 (4 targets, 12 fields, 6 callers); explore/convention-detect.ts:54, :57 (5 subclasses, 8 idioms); runtimes/data/discovery-objects.ts:56 (200 files); runtimes/infra/_shared.ts:90 (5,000 files); runtimes/infra/discovery-families.ts:53 (8 samples). Cuts on the content of one item: explore/doc-constraint-enumerate.ts:227 and explore/doc-decision-trace.ts:242 (first 2,000 characters); runtimes/code/adherence-check.ts:92, runtimes/data/adherence-check.ts:100 and runtimes/infra/adherence-check.ts:89 (first 1,200); explore/module-profile.ts:222, :284 (first 4,096); summariser/driver.ts:317 (first 8,192). Not counted: text-length limits on plan fields (planner/schema.ts:42-44), which bound a model's own wording, not results. Found by an analyzer run of 2026-10-06 (two search.text explorations and a module.profile over src/analyze) and confirmed by reading each file.` — "const DEFAULT_TOP_K = 30;"
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
- **[[c14]]** `code` `src/prompts/steering-block.md` — "Do this BEFORE manual"
- **[[c15]]** `convention` `~/.claude/hooks/insrc-steering-reminder.sh, the per-turn reminder: a hook script installed on the user's machine; no copy of it was found in this repository's source` — "inject a reminder so the model"
- **[[c16]]** `stakeholder` `user, 2026-10-07` — "the agent should be given proper steering for when to use it's own tools and when to use analyze. this doesn't need to be coded, just steering should be eoungh"

## 8. Open questions

- The per-turn reminder that tells agents to use the analyzer first is a hook script on the user's machine (~/.claude/hooks/insrc-steering-reminder.sh) and no source for it was found in this repository. Where is it maintained and installed from, so that Story s5 can change it?
