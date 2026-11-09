<!-- insrc:artifact ISSUE-d6ba77b81bccfc4b -->

# Register the analyze templates and runtimes in each session worker thread

## Reproduction

1. Start the daemon. At boot the main thread logs `analyze templates registered` (27 templates) and registers the runtimes.
2. Send `analyze.run.start` for a docs request (targetHint docs) over the daemon socket, as the live test src/analyze/orchestrator/__tests__/docs-broad-live.test.ts does.
3. The context stage runs and the run then fails at the plan stage with `Plan Builder refused: no task template is registered for target 'docs'` (before the guard: a codex `invalid schema keyword` rejection of an empty `anyOf`).
Observed: every analyze run through the daemon ends at the plan stage. Expected: the run plans against the 6 docs templates and executes their runtimes.

## Root cause

analyze.run.start is classed `session` (src/daemon/threads/method-class.ts), so a session worker thread serves it. registerBuiltinTemplates() and registerBuiltinRuntimes() are called only in the main thread's boot (src/daemon/index.ts). Worker threads do not share module state with the main thread, so in a session worker the template registry (src/analyze/planner/templates/registry.ts) and the task runtime registry are empty: the planner has no catalog and, past that, the executor would find no runtime. The session worker start (src/daemon/threads/session-worker.ts) registers nothing for the analyze framework.

## Fix intent

Make a session worker thread register the analyze templates and the analyze runtimes when it starts, using the existing registration functions, so the catalog and runtime registry a worker sees match the main thread's. Add a test that a session worker thread has a non-empty template catalog (including docs templates) and a non-empty runtime registry.

## Citations

- **[[c1]]** `code` `src/daemon/threads/method-class.ts` — "['analyze.run.start', 'session', true],"
- **[[c2]]** `code` `src/daemon/index.ts` — "registerBuiltinTemplates();"
- **[[c3]]** `code` `src/daemon/threads/session-worker.ts` — "const hub = startDaemonWorker(init);"
- **[[c4]]** `code` `src/analyze/planner/templates/registry.ts` — "const REGISTRY = new Map<string, AnalyzeTaskTemplate>();"
