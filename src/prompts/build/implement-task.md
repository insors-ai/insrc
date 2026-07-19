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

## Guardrails (from `CLAUDE.md`)
- TypeScript strict ESM: `.js` in import paths, `import type` for types.
- `getLogger('module')` not `console.log`. Never `Promise.all` over provider
  calls. No direct cloud REST — CLI binaries only. Tests co-located in `__tests__`.

## References
- Plan: `{{planPath}}` · LLD: `{{lldPath}}` · HLD: `{{hldPath}}`
- Story issue: {{storyRef}} · This Task: {{issueRef}}

When done, report status (done / halted), files changed, the final test result,
and the commit — then submit this Task to the build validation gate for
`{{taskId}}` ({{issueRef}}).
