<!-- insrc:artifact PLAN-dae67bfc7da310cc-s1 -->

# Plan: STORY-dae67bfc7da310cc-s1

## Summary

**Epic:** `remove-design-code-review-implementations-while`
**LLD run:** `wf-1794835125681-aqgphg`
**LLD effective hash:** `810021dce1a3...`

Replace automated design and code reviews with stateless unavailable endpoints, then delete their engines and all live wiring. Remove automated-review requirements from workflow gates while preserving human approvals, build/task checks, shared daemon services and historical reads. Validate the exact endpoint contracts, absence of side effects, remaining guards, current client behavior and clean packaged output using user-authorized self-checks.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Retain review endpoints as stateless rewritten errors | L | — | — | integration: All preserved review operations and accepted MCP phases report exact rewrite errors without allocating review state; integration: Repeated unavailable MCP calls allocate no persistent review connections and preserve transport error envelopes | [[c1]] [[c2]] |
| 2 | **`t2`** Decouple approval and completion from automated reviews | L | — | `t1` | integration: Human approval and Story Epic completion work without CR while non-review integrity build task and team guards remain effective; integration: Historical review versions remain readable unchanged through an inert dependency closure | [[c3]] [[c4]] |
| 3 | **`t3`** Remove review runtime wiring from shared daemon services | L | — | `t1`, `t2` | integration: Daemon startup shutdown and dispatch create no review services workers progress producers or cleanup owners; integration: Normal ThreadServices worker routing step state provider broker and task progress continue without review hooks | [[c5]] |
| 4 | **`t4`** Delete obsolete review implementation and update operational guidance | L | — | `t1`, `t2`, `t3` | integration: Production source import and asset audit retains only review endpoints inert historical readers and human decisions; integration: Review unavailability guidance and settings agree across backend VS Code and JetBrains contracts | [[c5]] [[c6]] |
| 5 | **`t5`** Verify complete removal and compatibility with self-check evidence | M | — | `t1`, `t2`, `t3`, `t4` | smoke: Clean production build and package contain no deleted review implementation or planted stale review output; integration: End-to-end unavailable review calls preserve historical data and do not start client polling or unrelated service regressions | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] |

### 1.1 TASK-dae67bfc7da310cc-s1-t1 — Retain review endpoints as stateless rewritten errors

Freeze existing MCP schemas and exact 27-operation inventory. Isolate public schema definitions from execution contracts, replace MCP/step/IPC/legacy review entrypoints with family-specific errors, remove MCP persistent review connections, and preserve ordinary error transport and human decision endpoints. Remove/bypass review-specific host/router ownership allocation before unavailable dispatch; defer deletion of orphan ownership infrastructure to t3.

**Acceptance checks:**
- All 2 MCP tools and 25 IPC review methods remain registered with unchanged callable MCP schemas and accepted phase sets.
- Every valid review operation reports the exact family-specific rewritten error without repo resolution, provider/file access, worker/process creation or retained MCP connections.
- Human workflow.reviewDecision and generic artifact/team endpoints remain outside automated-review retirement.
- Unavailable review dispatch allocates no review owner in step host or router before reaching the error handler.

### 1.2 TASK-dae67bfc7da310cc-s1-t2 — Decouple approval and completion from automated reviews

Remove automated-review gates, party/freshness/approval fences and cleanup hooks from workflow/lifecycle approval and Story/Epic completion. Extract minimal dependency-free historical schema/read/render contracts where generic artifact views require them, preserving data and all non-review guards. Historical schema/readers must have a dependency-free inert closure; do not preserve entire execution-contract trees.

**Acceptance checks:**
- Human artifact approval and completion of approved validated builds with passing current tasks work without any CR or review override.
- Integrity, upstream approval, team/signoff, build and task-accounting denials still apply; no fake clean review or altered historical verdict is written.
- Approval/completion and generic historical reads do not load review execution or call cleanup endpoints; representative stored review versions remain readable.
- Transitive imports of generic historical readers and preserved public schemas contain no review execution, provider, worker, checkpoint-writing or cleanup modules.

### 1.3 TASK-dae67bfc7da310cc-s1-t3 — Remove review runtime wiring from shared daemon services

Detach ProductionReviews, dedicated workers/native/preparation/resource/cleanup owners, router/request ownership and live review progress producer registration. Preserve shared ThreadServices, worker hub/step state, process broker/providers and ordinary index/analyze/workflow task progress.

**Acceptance checks:**
- Daemon startup/shutdown and normal requests allocate no review worker, runtime service, recovery scan, preparation or cleanup owner.
- Shared ThreadServices, ordinary daemon worker routing, step state, provider broker and unrelated progress validation still function.
- Historical review task rows remain inert/readable; no fabricated live or completed review progress is published.

### 1.4 TASK-dae67bfc7da310cc-s1-t4 — Delete obsolete review implementation and update operational guidance

Delete now-unreachable review engines, preparation/checkpoint/publication/cleanup/activation code, review-only helpers/assets/config/prompts and obsolete implementation tests. Update canonical steering/user guidance and current client metadata for unavailable endpoints and human approval. Keep only endpoint/schema/error and generic historical read compatibility, with no dormant execution trees.

**Acceptance checks:**
- No executable review engine, worker/bootstrap/native host, activation, checkpoint writer, publication or cleanup implementation remains in production imports or shipped output.
- Remaining review-named files contain only endpoint schemas/errors, historical data/read/render types or explicitly preserved human artifact decisions; shared packages and generic analyze adherence remain.
- Guidance and current IDE configuration match endpoint unavailability and removal of automated-review requirements; repository history artifacts/checkpoints are unchanged.

### 1.5 TASK-dae67bfc7da310cc-s1-t5 — Verify complete removal and compatibility with self-check evidence

Run focused production-registration, no-side-effect, human approval/completion, historical read and unrelated service checks; clean production build and inspect packaged output for stale runtime files; verify both current IDE clients surface errors without polling. Record self-check evidence and limitations without invoking broken automated reviews or deploying/restarting the daemon.

**Acceptance checks:**
- Endpoint/schema inventory and exact error contracts pass across accepted phases and unary/stream/MCP dispatch; repeated failures allocate no review state/connections.
- Missing/failed BUILD, stale/incomplete task set, integrity/team/signoff/upstream refusal checks remain effective; valid human-approved work completes without CR.
- Clean build removes planted stale review output; package/import inspection finds no deleted runtime; historical fixtures/hashes and both current IDE client error contracts pass.
- Self-review evidence records actual commands/results and limitations; no installed-daemon update, restart or automated-review certification is claimed.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| All contractDetails.api entries | `t1`, `t5` |
| Unary and stream error propagation | `t1`, `t5` |
| MCP error-envelope mapping | `t1`, `t5` |
| MCP handlers | `t1`, `t5` |
| Daemon handler maps and step host | `t1`, `t5` |
| Daemon startup/shutdown and router/hub review hooks | `t3`, `t5` |
| Human workflow.reviewDecision | `t2`, `t5` |
| Workflow approval and lifecycle completion | `t2`, `t5` |
| Missing/failed BUILD and incomplete/stale task sets | `t2`, `t5` |
| Integrity/team/signoff/upstream approval denials | `t2`, `t5` |
| Generic historical review rendering | `t2`, `t5` |
| Normal indexing/analyze/workflow workers and task progress | `t3`, `t5` |
| npm run build and scripts/clean-output.mjs | `t5` |
| Import/transitive dependency and obsolete prompt/config audit | `t4`, `t5` |
| VS Code and JetBrains contract/error handling checks | `t4`, `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s1 contractDetails.api: exact 27 public review operations and schema/error contracts`
- **[[c2]]** `prior-artifact` `LLD s1 errorPaths: no side effects, transport errors, no persistent review connections`
- **[[c3]]** `prior-artifact` `LLD s1 dataModelChanges: Workflow approval and completion`
- **[[c4]]** `prior-artifact` `LLD s1 errorPaths and testStrategy: historical reads and remaining non-review guards`
- **[[c5]]** `prior-artifact` `LLD s1 dataModelChanges: Shared daemon and historical infrastructure`
- **[[c6]]** `prior-artifact` `LLD s1 migration and testStrategy: runtime/asset deletion, guidance, clean output and client validation`
