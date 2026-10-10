<!-- insrc:artifact BUILD-0ee73dc7a00c0f11-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-10T06:23:00.767Z  ·  **Updated:** 2026-10-10T06:34:15.036Z

**Commit:** 769030cf

## Scope

Fix ISSUE-0ee73dc7a00c0f11: a plan in which a task's scopeRef has a kind its template's family does not accept fails plan validation, with a message that names the task, the kind it was given and the kinds its family accepts. The catalog shown to the planner lists, for each template, only the kinds of scope its family accepts. The kinds per family come from the one existing table (TARGET_TO_KINDS). A plan whose tasks all carry accepted kinds validates and runs as today; the runtime's own refusal stays.

## Triage rationale

bugfix, magnitude small: the templates' scopeRef schema is built per family from the existing table and the plan validator's parameter rule names a refused kind; no design decision open.

## Summary

Each template's scopeRef schema is now built from its family's row of the one table (TARGET_TO_KINDS) by scopeRefSchemaFor, so the catalog shown to the planner lists only the kinds of scope the family accepts, and the plan validator's parameter rule (INV-5) fails a plan whose task carries another kind with a message naming the task, the kind and the accepted kinds. The runtime's refusal is unchanged. A subrun task's childIntent keeps the schema with every kind, because its kind of source is not fixed by the template; checking a child intent's kind against its own target is not part of this fix. Two tests over the real catalog in src/analyze/planner/__tests__/templates.test.ts; three mutations each fail them.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/BUILD-4fb22dc28697cc14-S001.json` — **insrc-build** (2026-10-10T06:34:15.036Z)
- `.insrc/artifacts/BUILD-8f90988572f4d5b2-S001.json` — **insrc-build** (2026-10-10T06:34:15.036Z)
- `docs/standalone/bug-analyzer-s-plan-tree-child-E202610108f909885/S001/BUILD.md` — **insrc-build** (2026-10-10T06:34:15.036Z)
- `docs/standalone/bug-data-plan-task-names-connection-E202610094fb22dc2/S001/BUILD.md` — **insrc-build** (2026-10-10T06:34:15.036Z)
