<!-- insrc:artifact BUILD-0ee73dc7a00c0f11-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-10T06:23:00.767Z

**Commit:** eb86616c

## Scope

Fix ISSUE-0ee73dc7a00c0f11: a plan in which a task's scopeRef has a kind its template's family does not accept fails plan validation, with a message that names the task, the kind it was given and the kinds its family accepts. The catalog shown to the planner lists, for each template, only the kinds of scope its family accepts. The kinds per family come from the one existing table (TARGET_TO_KINDS). A plan whose tasks all carry accepted kinds validates and runs as today; the runtime's own refusal stays.

## Triage rationale

bugfix, magnitude small: the templates' scopeRef schema is built per family from the existing table and the plan validator's parameter rule names a refused kind; no design decision open.
