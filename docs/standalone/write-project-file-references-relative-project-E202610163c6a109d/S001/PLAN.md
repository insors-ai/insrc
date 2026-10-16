<!-- insrc:artifact PLAN-3c6a109dffcde0c1-S001 -->

# Plan: E202610163c6a109d:S001

## Summary

**Epic:** `write-project-file-references-relative-project`
**LLD run:** `wf-1792135419222-dzfrxi`
**LLD effective hash:** `3c6a109dffcd...`

The build adds the one shared wording of the path rule and puts it in the schema descriptions, then in every synthesize prompt and the step prompts that author paths, and only then adds the write-time check that refuses a call site or a code or doc citation that is not in that form. The order keeps the check from refusing stages that have not yet been told the rule. Existing records are not touched.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add PATH_FORM_RULE and describe the path-valued schema fields with it | S | — | unit: src/workflow/__tests__/path-forms.test.ts: the callSites and pathsCited schema descriptions carry the rule wording | [[c1]] [[c2]] [[c5]] |
| 2 | **`t2`** Put the rule in every synthesize prompt and the path-authoring step prompts | M | `t1` | unit: src/workflow/__tests__/path-forms.test.ts: every synthesize prompt and the step prompts that author paths contain PATH_FORM_RULE; unit: src/workflow/__tests__/path-forms.test.ts: the design.story synthesize prompt lets a call site taken from s4 be corrected to the path form | [[c1]] [[c2]] [[c4]] [[c5]] |
| 3 | **`t3`** Add the path check and the 'paths' failure kind | M | `t2` | unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a root-relative path with and without a line number; unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an absolute path as an external file; unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a call site with prose beside the path and names it; unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a leading ./ and a .. segment; unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms checks only citations of kind code and doc; unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a path with a line range, a column and a #anchor; unit: src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an http(s) URL in a doc citation; integration: src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations returns a paths failure for an LLD whose call site carries prose; integration: src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations keeps the citation result for a well-formed artifact | [[c1]] [[c2]] [[c3]] |

### 1.1 E202610163c6a109d:S001:T001 — Add PATH_FORM_RULE and describe the path-valued schema fields with it

Add the PATH_FORM_RULE string constant to src/workflow/runners/scope-prompts.ts, stating the form (project file relative to the root, optional :N, :N-M or :N:C and #anchor, no prose in the span, never shortened; external file written in full; a path copied from a step output that is not in this form is corrected rather than copied). Add a description carrying that wording to the callSites and pathsCited fields in the design-story, define, design-epic and plan schemas, without adding a pattern.

**Acceptance checks:**
- PATH_FORM_RULE is exported from src/workflow/runners/scope-prompts.ts and nowhere else defines the wording
- The callSites field in the design-story schema and the pathsCited field in the design-story, define, design-epic and plan schemas have a description that carries the rule wording
- No schema gains a pattern or a new required field, and the existing schema tests still pass

### 1.2 E202610163c6a109d:S001:T002 — Put the rule in every synthesize prompt and the path-authoring step prompts

Interpolate PATH_FORM_RULE into the stub, brainstorm, issue, define, design.epic, design.story and plan synthesize prompts in src/workflow/orchestrator.ts, and into the step prompts that author callSites or pathsCited (the design-story s1 and s4 prompts and the issue capture prompt). In the design.story synthesize prompt, state the exception beside the 'verbatim from s4' hard rule: dataModelChanges are copied from s4 except that a call site is written in the path form. The tracker synthesize prompt is left alone because it does not reach validateBodyAndCitations.

**Acceptance checks:**
- The seven synthesize prompts for stub, brainstorm, issue, define, design.epic, design.story and plan each contain PATH_FORM_RULE, imported and not retyped, and the tracker synthesize prompt is not changed
- The design-story s1 and s4 prompts and the issue capture prompt contain PATH_FORM_RULE
- The design.story synthesize prompt lets a call site taken from s4 be written in the path form, beside the verbatim rule
- The existing prompt-pinning tests (adjacent-scope-gate and the synthesizer tests) still pass

### 1.3 E202610163c6a109d:S001:T003 — Add the path check and the 'paths' failure kind

Add the 'paths' kind to ValidationFailure in src/workflow/synthesizer.ts and add checkPathForms(citations, callSites), which checks the ref of code and doc citations and an LLD's call sites by their strings only (accepting the line forms and #anchor, absolute paths and http(s) URLs, refusing prose, whitespace, a leading ./ and .. segments, and naming every offending entry). Call it from validateBodyAndCitations after the boundary and citation checks, reading dataModelChanges[].callSites from the body when present. Added last, after the prompts carry the rule. Leave the daemon correction loop in src/daemon/workflow-rpc.ts and the in-session phase in src/daemon/steps/workflow-step/phases/synthesize.ts unchanged and confirm they handle the new kind.

**Acceptance checks:**
- checkPathForms accepts a relative path with :N, :N-M, :N:C and #anchor, an absolute path and an http(s) URL, and refuses prose, whitespace, a leading ./ and a .. segment, naming each offending entry
- Only citations of kind code and doc are checked, and an artifact with no dataModelChanges reads no call sites
- validateBodyAndCitations returns the existing boundary and citation results unchanged for a well-formed artifact and a 'paths' failure otherwise
- The daemon correction loop still tests only 'boundary', and the in-session phase returns a retryable synthesize-paths error with the entries in its message

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a root-relative path with and without a line number | `t3` |
| src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an absolute path as an external file | `t3` |
| src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a call site with prose beside the path and names it | `t3` |
| src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a leading ./ and a .. segment | `t3` |
| src/workflow/__tests__/path-forms.test.ts: checkPathForms checks only citations of kind code and doc | `t3` |
| src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a path with a line range, a column and a #anchor | `t3` |
| src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an http(s) URL in a doc citation | `t3` |
| src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations returns a paths failure for an LLD whose call site carries prose | `t3` |
| src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations keeps the citation result for a well-formed artifact | `t3` |
| src/workflow/__tests__/path-forms.test.ts: every synthesize prompt and the step prompts that author paths contain PATH_FORM_RULE | `t2` |
| src/workflow/__tests__/path-forms.test.ts: the callSites and pathsCited schema descriptions carry the rule wording | `t1` |
| src/workflow/__tests__/path-forms.test.ts: the design.story synthesize prompt lets a call site taken from s4 be corrected to the path form | `t2` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 contractDetails: validateBodyAndCitations, checkPathForms (new), PATH_FORM_RULE (new)`
- **[[c2]]** `prior-artifact` `LLD S001 dataModelChanges: ValidationFailure kind, callSites and pathsCited field descriptions`
- **[[c3]]** `prior-artifact` `LLD S001 errorPaths: prose beside a path, retry limit, shortened path limit, edge cases`
- **[[c4]]** `prior-artifact` `LLD S001 testStrategy: path-forms.test.ts subjects and acceptance mapping ac1-ac3`
- **[[c5]]** `prior-artifact` `LLD S001 migration: three rollbackable steps (rule, check, prompts)`
