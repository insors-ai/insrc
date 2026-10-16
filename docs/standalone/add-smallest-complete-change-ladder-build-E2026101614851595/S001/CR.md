<!-- insrc:artifact CR-1485159578d9c257-S001 -->

# Code review: 1485159578d9c257:S001

⚠️ **WARN** — HIGH 0 · MED 2 · LOW 6 · model `claude:opus`

**Changed files:** 8

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/workflow/runners/scope-prompts.ts:43 | Tests exist but their pass-state is unverified. testsReaching is empty here only because this changed symbol is a diff-level file entity with no graph edges. The diff does contain tests for both constants: render.test.ts imports SMALLEST_CHANGE_RULE and checks the ladder order, the analyzer rung and the limits; adjacent-scope-gate.test.ts imports both and checks SMALLEST_SHAPE_RULE's content. There is no build record, so these tests are not confirmed green. |
| MED | src/daemon/steps/build-step/render.ts:168 | Tests exist but their pass-state is unverified. Both changed renderers are called directly by the new render.test.ts tests, which cover the plan-driven prompt and the standalone Small and Trivial prompts. The tests check that the section is there, that the rule sits inside it, that no '{{' placeholder is left, where the section is placed, and that the earlier sections are kept. There is no build record, so the pass-state is not confirmed. |
| LOW | src/prompts/build/implement-task.md:23 | Tests exist but their pass-state is unverified. renderImplementPrompt fills this template, and render.test.ts asserts that the filled section is there and that no placeholder is left. adjacent-scope-gate.test.ts also asserts that the template contains the slot. Not confirmed green: there is no build record. |
| LOW | src/workflow/runners/design-story/index.ts:204 | The test only checks the source text. adjacent-scope-gate.test.ts reads design-story/index.ts as a string and checks that 'SMALLEST_SHAPE_RULE' appears, in order, before ANTI_OVERREACH_RULE. No test runs the alternatives.enumerate runner to check that the system prompt it actually produces contains the rule's wording. The pass-state is also unverified, since there is no build record. |
| LOW | THIRD_PARTY_NOTICES.md:1 | A test exists but its pass-state is unverified. The new third-party-notice.test.ts reads this file and checks the Ponytail heading, the repository link, the copyright line, the MIT licence text, each place it names, and the credit in the source comment in scope-prompts.ts. Not confirmed green: there is no build record. |

## quality — 3 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/workflow/__tests__/adjacent-scope-gate.test.ts:283 | These tests check the source text: they count how many times `SMALLEST_SHAPE_RULE` appears in design-story/index.ts (exactly 2) and `SMALLEST_CHANGE_RULE` appears in render.ts (exactly 3). A harmless refactor, such as a second import line, a mention in a comment or a re-export, would fail them even though the prompts still behave the same. The alternatives-block test also cuts the block with `indexOf('userTurn:', start)` and does not check that `start` is >= 0. If the `id: 'alternatives.enumerate'` literal is renamed, it ends up searching from -1, and the error points at the wrong cause. Checking the rendered prompt (the `systemPrompt` the runner builds) would be sturdier than reading the source. |
| LOW | src/daemon/steps/build-step/__tests__/render.test.ts:214 | `prompt.indexOf('\n## ', start + 1)` is passed to `slice` without checking for -1. If the smallest-change section were ever the last section, `slice(start, -1)` would quietly drop the last character instead of taking the rest of the prompt. Today a section always follows it, so this is a robustness nit, not a live defect. |
| LOW | src/workflow/runners/scope-prompts.ts:58 | `SMALLEST_CHANGE_RULE` says 'End your report with what you deliberately left out or did not check'. implement-task.md already closes with its own report list ('report status (done / halted), files changed, the final test result, and the commit — then submit…'). The two instructions about the report's ending can pull against each other. The report is free text, so nothing breaks, but folding the left-out note into the template's closing report list would remove the ambiguity. |

