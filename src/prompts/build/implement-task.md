# Build — implement Task `{{taskId}}` ({{issueRef}})

You are a coding agent implementing **one approved Task** into working code in
this repository. This Task belongs to the approved plan for Story `{{storyId}}`
of Epic "{{epicSlug}}". Its dependencies are already done. **Implement exactly
this Task — do not exceed its scope.**

## Task `{{taskId}}` — {{taskTitle}}  ({{size}} · depends on {{dependsOn}} · {{issueRef}})

{{taskSummary}}

**Acceptance checks — every one must objectively hold:**
{{acceptanceChecks}}

**Tests to write and run:**
{{tests}}

**Say which test cases carry each test.** When you submit, pass `tests` to the validate turn: one entry per test listed above, with `name` the test's text exactly as listed, and `cases` the test cases that carry it, each a `file` (repo-relative path of the `.test.ts` file) and a `title` (the test's title exactly as the file declares it). The daemon runs each of those files itself and records a result for every case in the Story's test record (`TESTS.md` beside `BUILD.md`). A case that fails, is skipped, or is not found in its file fails the Task; so does a listed test with no case. For a `live` or `smoke` test the daemon cannot run (it needs a model, a running daemon or a person), give `reported` instead: the `result` you observed (`pass` or `fail`) and `evidence`, where the proof is. It is recorded as reported by you, not run by the gate. A later validate turn of the same Task may omit `tests`: the stored mapping is used.

## Resolved design decisions
{{resolvedDecisions}}

## Process
1. For design context, read the Story LLD (`{{lldPath}}`) and HLD (`{{hldPath}}`);
   for conventions, read `CLAUDE.md`. Stay within this Task's stated surface.
2. Implement the Task until every acceptance check holds.
3. Run the Task's named tests, then `{{typecheckCmd}}` and `{{testCmd}}`.
4. If green, **commit** referencing the Task and its issue:
   `feat(build): {{storyId}}/{{taskId}} … ({{issueRef}})`.
5. If it cannot be made to pass after a genuine effort, **HALT** — report which
   acceptance check failed, why, and what you tried. Do not fabricate success.

## Merging upstream
{{mergeRule}}

## Guardrails (from `CLAUDE.md`)
- TypeScript strict ESM: `.js` in import paths, `import type` for types.
- `getLogger('module')` not `console.log`. Never `Promise.all` over provider
  calls. No direct cloud REST — CLI binaries only. Tests co-located in `__tests__`.

## References
- Plan: `{{planPath}}` · LLD: `{{lldPath}}` · HLD: `{{hldPath}}`
- Story issue: {{storyRef}} · This Task: {{issueRef}}

When done, report status (done / halted), files changed, the final test result,
and the commit — then submit this Task to the build validation gate for
`{{taskId}}` ({{issueRef}}), with the `tests` mapping described above.
