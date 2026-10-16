<!-- insrc:artifact LLD-3c6a109dffcde0c1-S001 -->

# LLD: E202610163c6a109d:S001

## Summary

**Epic:** `write-project-file-references-relative-project`
**HLD base run:** `wf-1792135419222-dzfrxi`
**HLD effective hash:** `3c6a109dffcd...`

The authoring stages learn one way to write a file reference and the artifact check enforces its shape. A project file is written relative to the project root, with an optional line number, on its own and with no prose beside it; a file outside the project is written with its full path. The rule is defined once and placed in the prompts and the schema descriptions of the fields that carry paths, and a new check refuses an artifact whose call sites or code and doc citations are not in that form, so the model is told which entries to fix and re-emits. Existing records are not rewritten.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `validateBodyAndCitations`

```typescript
validateBodyAndCitations<Body>(artifact: WorkflowArtifact<Body>, renderedBody: string): ValidationResult
```

**Parameters:**
- `artifact: WorkflowArtifact<Body>` — The artifact; its citations and, for an LLD, its dataModelChanges[].callSites are the path fields to check
- `renderedBody: string` — The rendered markdown, checked for boundary and citation grounding as today

**Returns:** `ValidationResult` — ok, or a failure; a path failure is returned after the boundary and citation checks pass

**Errors:**
- `ValidationFailure kind 'paths'` when a call site, or the ref of a citation of kind code or doc, is not in the path form

**Preconditions:**
- The artifact has already passed its schema check

**Postconditions:**
- The existing boundary and citation results are unchanged for an artifact whose path fields are well formed
- A path failure lists each offending entry in details, so the retry prompt names what to fix

### 2.2 `checkPathForms (new)`

```typescript
checkPathForms(citations: readonly Citation[], callSites: readonly string[]): ValidationResult
```

**Parameters:**
- `citations: readonly Citation[]` — Only citations of kind code or doc are checked; their ref is path[:line]
- `callSites: readonly string[]` — The call sites of an LLD's data model changes; empty for artifacts without them

**Returns:** `ValidationResult` — ok, or a 'paths' failure naming every entry that is not a path

**Postconditions:**
- Looks only at the strings: never reads the disk and never resolves a path against the repo
- A project path is accepted when it is a bare relative path with an optional line form (:N, :N-M or :N:C) and an optional #anchor, with no leading ./, no .. segment, no whitespace and no characters outside a path; an absolute path and an http(s) URL are accepted as external references

### 2.3 `PATH_FORM_RULE (new)`

```typescript
export const PATH_FORM_RULE: string
```

**Returns:** `string` — The one wording of the rule, for the step prompts and the schema descriptions. It also says that a path copied from a step output that is not in this form is written in this form instead of copied as it is.

**Postconditions:**
- Defined once in the shared prompt fragments module and imported at every site, like ANTI_OVERREACH_RULE
- The design.story synthesize prompt states the exception beside its 'verbatim from s4' hard rule: dataModelChanges are copied from s4 except that a call site is written in the path form

## 3. Data model changes

### 3.1 `ValidationFailure` — field-modify

The kind union gains 'paths', next to 'schema' | 'citations' | 'boundary'. No consumer switches exhaustively on it. The daemon's correction loop only tests for 'boundary', so a 'paths' failure takes the same plain re-emit as a citations failure. The in-session phase (the one controllers use through insrc_workflow_step) builds the error code from the kind, so a path failure comes back as a retryable 'synthesize-paths' error with the offending entries in its message, and the controller re-emits.

**Call sites:**
- `src/workflow/synthesizer.ts`
- `src/daemon/workflow-rpc.ts`
- `src/daemon/steps/workflow-step/phases/synthesize.ts`

### 3.2 `dataModel[].callSites and pathsCited field descriptions` — field-modify

The bare string-array schemas for callSites and pathsCited gain a description that carries the shared rule wording, and the synthesize prompts that emit citations carry the rule itself; no pattern is added to the schema, because a violation is reported by the check with the entries named, not by a generic schema error. The design.story synthesize prompt's 'verbatim from s4' hard rule gets the one stated exception for call sites.

**Call sites:**
- `src/workflow/runners/design-story/schemas.ts`
- `src/workflow/runners/define/schemas.ts`
- `src/workflow/runners/design-epic/schemas.ts`
- `src/workflow/runners/plan/schemas.ts`
- `src/workflow/orchestrator.ts`
- `src/workflow/runners/issue/index.ts`

## 4. Error paths

**Error cases**

- **A call site or a code or doc citation ref carries prose beside the path, for example 'src/workflow/artifacts/plan.ts (new artifact module)'.** (recoverable)
  - Detection: checkPathForms finds whitespace or a character outside a path in the entry and adds it to the failure details.
  - Response: validateBodyAndCitations returns a 'paths' failure naming the entry; the synthesize turn is re-emitted with the entries listed. A call site that came from the s4 step is corrected in the re-emit, because the rule in the synthesize prompt lets the synthesizer write it in the path form instead of copying s4 verbatim.
  - User impact: None once re-emitted; the artifact is not written until every entry is a path.
- **A model keeps emitting a bad path on every re-emit.** (terminal)
  - Detection: The retry limit that bounds a citations failure is reached (the daemon-side loop), or, in a controller-driven run, the controller stops re-emitting; the in-session error stays retryable.
  - Response: The synthesize turn fails with the 'paths' failure and its details, as a citations failure does today.
  - User impact: The stage reports the entries that were refused instead of writing a record with references that do nothing.
- **A well-formed project path that is shortened, such as artifacts/plan.ts, is emitted.** (recoverable)
  - Detection: Not detected: the check reads only the string and cannot tell a shortened path from a path to another directory.
  - Response: None at write time; the shared rule in the prompts is what prevents it.
  - User impact: The reference is written and does nothing when clicked, as today; this is the known limit of the chosen alternative.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A citation of kind code with ref 'src/workflow/synthesizer.ts:93' | Accepted: a relative path with a line number. |
| A citation of kind code with ref '/home/user/.insrc/daemon/out/index.js' | Accepted: an absolute path is an external file written in full. |
| A citation of kind analyze-bundle, step-output, stakeholder, convention or prior-artifact | Not checked: the ref of those kinds is not a path. |
| An LLD with no dataModelChanges, or an artifact that is not an LLD | No call sites are read; only the citations are checked. |
| A ref with a line range such as 'src/workflow/synthesizer.ts:93-96', or a line and column such as ':93:5' | Accepted: the chat page links :N, :N-M and :N:C (CREF_CORE in vscode-plugin/src/chat/link-markup.ts) and opens the file at the first line. |
| A path with a leading './' or a '..' segment | Rejected: it is not written relative to the project root. |
| An absolute path in a code citation | Accepted by the check as an external file written in full; the chat's link opener refuses a path outside the workspace, so it is not clickable, which is intended. |
| A doc citation whose ref is a path with an anchor, such as 'docs/plans/workflow-define.md#as-built-deltas' | Accepted: a relative path with a #anchor; existing records use this form. |
| A doc citation whose ref is an http(s) URL | Accepted as an external reference written in full; a URL is not a project path and is never refused. |
| A project file with no extension, such as Makefile or LICENSE | Accepted by the check, which does not require an extension; the chat page links only names with a known extension, so it is not clickable, which is outside this Story. |

**Invariants to preserve**

- The existing boundary and citation results are unchanged for an artifact whose path fields are well formed; the path check runs after them. [[c3]]
- A well-formed bundle path from s1 (pathsCited) still validates; the schema gains a description only, never a pattern. [[c1]]
- The shared prompt fragments are defined once and imported at each site, so the new rule cannot drift between steps. [[c2]]

## 5. Test strategy

**Test framework:** `node:test run with tsx (npx tsx --test), tests under src/workflow/__tests__`

**Test levels**

- **unit** — checkPathForms accepts the path forms and refuses prose, leading ./, .. segments, whitespace and other non-path text, naming each offending entry.
  - Subjects: `src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a root-relative path with and without a line number`, `src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an absolute path as an external file`, `src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a call site with prose beside the path and names it`, `src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a leading ./ and a .. segment`, `src/workflow/__tests__/path-forms.test.ts: checkPathForms checks only citations of kind code and doc`, `src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a path with a line range, a column and a #anchor`, `src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an http(s) URL in a doc citation`
- **integration** — validateBodyAndCitations runs the path check after the boundary and citation checks and leaves a well-formed artifact's result unchanged.
  - Subjects: `src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations returns a paths failure for an LLD whose call site carries prose`, `src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations keeps the citation result for a well-formed artifact`
- **unit** — The shared rule is defined once and reaches every prompt and schema description that authors a path.
  - Subjects: `src/workflow/__tests__/path-forms.test.ts: every synthesize prompt and the step prompts that author paths contain PATH_FORM_RULE`, `src/workflow/__tests__/path-forms.test.ts: the callSites and pathsCited schema descriptions carry the rule wording`, `src/workflow/__tests__/path-forms.test.ts: the design.story synthesize prompt lets a call site taken from s4 be corrected to the path form`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/workflow/__tests__/path-forms.test.ts: every synthesize prompt and the step prompts that author paths contain PATH_FORM_RULE`, `src/workflow/__tests__/path-forms.test.ts: the callSites and pathsCited schema descriptions carry the rule wording` |
| `ac2` | `src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a call site with prose beside the path and names it`, `src/workflow/__tests__/path-forms.test.ts: checkPathForms refuses a leading ./ and a .. segment`, `src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations returns a paths failure for an LLD whose call site carries prose`, `src/workflow/__tests__/path-forms.test.ts: the design.story synthesize prompt lets a call site taken from s4 be corrected to the path form` |
| `ac3` | `src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a root-relative path with and without a line number`, `src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an absolute path as an external file`, `src/workflow/__tests__/path-forms.test.ts: validateBodyAndCitations keeps the citation result for a well-formed artifact`, `src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts a path with a line range, a column and a #anchor`, `src/workflow/__tests__/path-forms.test.ts: checkPathForms accepts an http(s) URL in a doc citation` |

## 6. Migration

**State before:** The path-valued fields (dataModel[].callSites, the analyze-bundle pathsCited, and the ref of a code or doc citation) are bare strings. Nothing states the form of a path to the model and validateBodyAndCitations checks only boundary rules and citation grounding, so a shortened path or a path with prose beside it is written as it is emitted (search.text and file reads of src/workflow/synthesizer.ts, src/workflow/runners/design-story/schemas.ts and src/workflow/artifacts/lld.ts in s1).

**State after:** The shared rule PATH_FORM_RULE sits in every synthesize prompt and in the step prompts and schema field descriptions that author paths, and validateBodyAndCitations also runs checkPathForms on call sites and on the refs of code and doc citations, returning a 'paths' failure that names the entries to fix. Records already written are not changed or re-checked.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add PATH_FORM_RULE to the shared prompt fragments module and describe the path-valued schema fields with it. — ↩ rollbackable
2. Add the 'paths' kind to the validation failure and the path check, and call it from validateBodyAndCitations after the boundary and citation checks. — ↩ rollbackable
3. Interpolate the rule into every synthesize prompt in src/workflow/orchestrator.ts (stub, brainstorm, issue, define, design.epic, design.story, plan), because validateBodyAndCitations is shared by all of them, and into the step prompts that author callSites or pathsCited. — ↩ rollbackable

**Backward compat:** An artifact already on disk is neither rewritten nor re-validated: the check runs only when a stage synthesizes a new artifact. The record shapes are unchanged (call sites and refs remain strings), so every reader and renderer of an existing record keeps working. A new synthesize that previously passed with a prose-bearing call site or ref now fails once and is re-emitted.

## 7. Alternatives considered

### 7.1 a1: Rule in prompts and schema descriptions only

Define the path rule once in scope-prompts.ts and put it in the prompts and field descriptions that author path-valued fields; add no check.

Add one shared constant (beside ANTI_OVERREACH_RULE) that states the form: a project file is written relative to the project root with an optional :line, never shortened and never with prose in the same span; an external file is written with its full path. Interpolate it into every synthesize prompt in src/workflow/orchestrator.ts (each of which emits citations) and into the step prompts that author callSites and pathsCited, and add a description to those schema fields that points at the same wording. Nothing rejects a bad path, so a model that ignores the rule is not caught.

**Rejected because:** Fixes the stated cause with the smallest change, but leaves nothing to catch a lapse, and the issue asks to consider a write-time check.

### 7.2 a2: Rule plus a shape check at write time — **CHOSEN**

a1, plus a check in the artifact validation that rejects a path-valued field that is not a bare root-relative or absolute path.

Do a1, and add a check beside the citation check in src/workflow/synthesizer.ts that reads the path fields the artifact carries (an LLD's callSites, and the ref of a citation of kind code or doc) and fails with kind 'paths' and the offending entries in details. pathsCited is a step output, not part of the artifact, so it gets the schema description only and is not checked at write time. A project path passes when it is a bare path, optionally with a line form the chat page already links (:N, :N-M or :N:C), that does not start with ./ or contain .. or spaces or prose; an external path passes when it is absolute. The check looks only at the string, never at the disk, so it is deterministic and needs no repo access. The failure goes through the existing retry loop, so the model is told which entries to fix.

### 7.3 a3: Rule plus a check that the path resolves from the root

a2, and the check also requires every project path to exist under meta.repoPath.

Do a2, and in addition resolve each project-relative entry against the artifact's meta.repoPath and fail an entry that does not exist there. This is the only form that catches a shortened path. It also fails a path to a file the story is about to create (a planned new file in callSites or a plan task), so it needs an allowance for new files, and it makes validation depend on the state of the working tree at write time.

**Rejected because:** Catches the shortened path but cannot tell a planned new file from a wrong one from the string, and makes validation depend on the working tree. It risks rejecting good artifacts, so it is the wrong trade for a bugfix.

## 8. References

- **[[c1]]** `analyze-bundle` `Path-valued fields and the prompts around them across the authoring workflows`
- **[[c2]]** `analyze-bundle` `Shared prompt fragments and where each is interpolated`
- **[[c3]]** `analyze-bundle` `Write-time validation of a synthesized artifact`
- **[[c4]]** `code` `src/workflow/runners/design-story/schemas.ts:260` — "callSites:  { type: 'array', items: { type: 'string' } },"
- **[[c5]]** `code` `src/workflow/artifacts/lld.ts:388` — "for (const cs of d.callSites) l.push(`- \`${cs}\``);"
- **[[c6]]** `code` `src/workflow/synthesizer.ts:207` — "export function validateBodyAndCitations<Body>("
- **[[c7]]** `prior-artifact` `docs/standalone/write-project-file-references-relative-project-E2026101667124d9a/ISSUE.md`

## 9. Open questions

- Decision: a2 does not catch a well-formed but shortened path (for example artifacts/plan.ts), the defect the issue names first; only the shared prompt rule prevents it. Accept that limit, or choose a3, which also requires the path to exist under the repo but must then tell a planned new file from a wrong path and makes validation depend on the working tree?
- Acceptance criteria are derived from the issue (the Story has none): ac1 the rule reaches the prompts and schema descriptions; ac2 a bad entry is refused with the entry named; ac3 a well-formed project or external path is accepted and a well-formed artifact's result is unchanged.
- Audit partial (cd1): checkPathForms and PATH_FORM_RULE are new symbols this Story creates, so they are not in an s1 bundle.
- Audit partial (dm1): src/daemon/workflow-rpc.ts is a call site found by a grep for 'boundary' (it tests failure.kind === 'boundary'), not by an s1 bundle.
- Audit partial (dm2, ts2): the ValidationFailure entry carries its invariant in s5 rather than a citation id of its own, and the node:test framework comes from the project's documented test command, not from the s1 test.locate result.
- Resolved from the code: the chat page parses :N, :N-M and :N:C in a code reference (vscode-plugin/src/chat/link-markup.ts), so the check accepts those line forms.

## Resolved questions

- `q1611e728` — Decision: a2 does not catch a well-formed but shortened path (for example artifacts/plan.ts), the defect the issue names first; only the shared prompt rule prevents it. Accept that limit, or choose a3, which also requires the path to exist under the repo but must then tell a planned new file from a wrong path and makes validation depend on the working tree?
  - **resolved**: Accept a2's limit — User approved the LLD with a2 chosen and its known gap stated. _(2026-10-16T07:39:35.320Z)_
- `qa10b3984` — Acceptance criteria are derived from the issue (the Story has none): ac1 the rule reaches the prompts and schema descriptions; ac2 a bad entry is refused with the entry named; ac3 a well-formed project or external path is accepted and a well-formed artifact's result is unchanged.
  - **resolved**: Adopt the derived ACs as stated — The approved LLD carries ac1-ac3 as its acceptance mapping. _(2026-10-16T07:40:22.215Z)_
- `qe21d7779` — Audit partial (cd1): checkPathForms and PATH_FORM_RULE are new symbols this Story creates, so they are not in an s1 bundle.
  - **resolved**: Accept as new-symbol partial — The symbols are created by this Story, so they cannot be in the index. _(2026-10-16T07:41:00.840Z)_
- `q1dab013f` — Audit partial (dm1): src/daemon/workflow-rpc.ts is a call site found by a grep for 'boundary' (it tests failure.kind === 'boundary'), not by an s1 bundle.
  - **resolved**: Record it as an untouched consumer that must not break — The LLD does not change the 'boundary' kind; the daemon loop must keep working. _(2026-10-16T07:41:29.501Z)_
- `qb77997ac` — Audit partial (dm2, ts2): the ValidationFailure entry carries its invariant in s5 rather than a citation id of its own, and the node:test framework comes from the project's documented test command, not from the s1 test.locate result.
  - **resolved**: Accept partial, proceed with note — Provenance quirk only; the facts hold. _(2026-10-16T07:41:58.077Z)_
- `q0ea4eae1` — Resolved from the code: the chat page parses :N, :N-M and :N:C in a code reference (vscode-plugin/src/chat/link-markup.ts), so the check accepts those line forms.
  - **resolved**: Mirror the chat parser exactly — Matches the LLD: accept :N, :N-M, :N:C. _(2026-10-16T07:42:08.875Z)_

## Citations

- **[[c1]]** `analyze-bundle` `Path-valued fields and the prompts around them across the authoring workflows`
- **[[c2]]** `analyze-bundle` `Shared prompt fragments and where each is interpolated`
- **[[c3]]** `analyze-bundle` `Write-time validation of a synthesized artifact`
- **[[c4]]** `code` `src/workflow/runners/design-story/schemas.ts:260` — "callSites:  { type: 'array', items: { type: 'string' } },"
- **[[c5]]** `code` `src/workflow/artifacts/lld.ts:388` — "for (const cs of d.callSites) l.push(`- \`${cs}\``);"
- **[[c6]]** `code` `src/workflow/synthesizer.ts:207` — "export function validateBodyAndCitations<Body>("
- **[[c7]]** `prior-artifact` `docs/standalone/write-project-file-references-relative-project-E2026101667124d9a/ISSUE.md`
