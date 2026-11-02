<!-- insrc:artifact PLAN-e6ddcdcb3d9cf330-s3 -->

# Plan: STORY-e6ddcdcb3d9cf330-s3

## Summary

**Epic:** `review-committed-work-task-checkpoints`
**LLD run:** `wf-1793616089066-m9k5hb`
**LLD effective hash:** `9644e9acbe91...`

Build the normal review interface on the existing task-review engine, then connect story approval to safe checkpoint cleanup. Keep review ownership shared across session workers and preserve current scope, diagnostics and recovery rules. Verify actual transport and filesystem behavior with focused fixtures before deployment.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Route task reviews through one daemon owner across session workers | M | — | — | integration: Cross-session and worker/direct duplicate review-id admission starts exactly one execution; integration: Different review ids overlap with serial per-review provider calls and merged CR history; integration: Daemon observer disconnect survives; controller disconnect fences late results and explicit resume skips durable tasks | [[c1]] [[c2]] |
| 2 | **`t2`** Expose the current task-review protocol through normal MCP requests | M | — | `t1` | integration: Normal MCP start/progress/publication use committed packets and reject retired or inferred scopes; integration: Normal controller/daemon routes preserve coverage/status/diagnostic policy, after-only scope and schema/guide parity | [[c1]] [[c2]] |
| 3 | **`t3`** Clean preserved story checkpoints after successful BUILD approval | M | — | `t1`, `t2` | integration: Successful story BUILD approval removes only matching fully preserved task/story checkpoints; integration: Cleanup defers for active admission/execution/publication and excludes concurrent starts under story fence; integration: Rejected approval, task validation and CR publication never clean checkpoints; repeated approval retries partial cleanup; integration: Cleanup retains malformed/symlink/foreign/future/unrepresented history and reports filesystem failures | [[c1]] [[c3]] |
| 4 | **`t4`** Verify and document the normal end-to-end review lifecycle | M | — | `t2`, `t3` | smoke: Production transport and worker routing smoke validates progress, restart/retrigger and design review remains unavailable | [[c1]] [[c2]] [[c3]] |

### 1.1 TASK-e6ddcdcb3d9cf330-s3-t1 — Route task reviews through one daemon owner across session workers

Keep one canonical project/review-id admission and execution owner in src/daemon/task-review-rpc.ts; connect worker/session/direct paths through existing trusted main-services/router facilities. Add minimal story cleanup admission fence reusable by t3. Preserve actual trusted controller connection lifetimes, independent daemon ownership, serial per-review provider calls and existing progress/diagnostic behavior. No thread subsystem, worker-local coordinator copies or new persistent leases.

**Acceptance checks:**
- Same-id duplicate start/resume across two sessions and worker/direct routes returns already-running before duplicate provider/writer work.
- Different ids may overlap native execution without global review queue; all per-review provider calls remain serial and CR publication merges through existing lifecycle owner.
- Controller disconnect fences late exchanges and explicit resume skips durable tasks; daemon observer disconnect does not cancel admitted work.
- Story admission/cleanup fence accounts for in-flight admission and publication, not only active assessment; release guaranteed after failures.

### 1.2 TASK-e6ddcdcb3d9cf330-s3-t2 — Expose the current task-review protocol through normal MCP requests

Replace only normal code-review stub with a typed thin adapter and daemon step-host forwarding to t1. Reuse start/resume/progress/publish and assignment/scope/activity/result schemas; own persistent connection per live MCP review/controller lifetime. Update schema discovery, code-review guide and steering with exact phase inputs and checkpoint progress behavior; preserve inactive design review and retired invocation rejection. No inferred HEAD scope, auto attempts or waiting for model completion inside tool timeout.

**Acceptance checks:**
- Normal insrc_code_review_step registration, insrc_schema, guide and actual host routing agree on exact reused task protocol.
- Start requires committed packet and returns durable acknowledgement promptly; progress is read-only and explicit resume uses pinned input.
- Both actual reviewer parties reach same scope/coverage/status/diagnostic validation; controller uses live connection with execution/sequence fencing, never a relabelled CLI.
- MCP session shutdown/cancellation releases controller connection ownership without cancelling detached daemon review; reconnection requires explicit retrigger.
- Design review remains unavailable and old review-engine routes stay rejected.
- Cancellation of one review closes only its owned controller connection and leaves other review ids in the MCP process active.

### 1.3 TASK-e6ddcdcb3d9cf330-s3-t3 — Clean preserved story checkpoints after successful BUILD approval

Integrate post-success BUILD approval and retry cleanup with t1 authority and existing lifecycle. Under short story fence enumerate bounded no-follow literal checkpoint files; derive canonical project/Plan epic/story identity and validate all completed attempts against durable task CR before unlink. Preserve unfinished/unrepresented/unknown/foreign files and active work with explicit retained/retryable metadata. No caller deletion paths, artifact schema changes or cleanup before success; preserve current BUILD approval freshness fixes. Use a reusable canonical post-success approval hook with injected delegation to owner, not daemon imports in workflow domain code; direct/outer single/batch routes share it.

**Acceptance checks:**
- Single, batch and direct story BUILD approval trigger cleanup only after approval succeeds and required CR history is preserved; earlier task validation/CR publication/rejected approval cannot delete files.
- All safe matching task/story review ids are deleted; unrelated projects/stories, symlinks, corrupt/future/oversized files and unfinished/unrepresented history remain with reasons.
- Concurrent starts/admissions/publications cannot race deletion; active same-story work defers cleanup without revoking approval or blocking unrelated stories.
- Per-file unlink failures report deleted/retained/errors; repeated approval retries without model calls, BUILD regeneration or changed review fingerprints.

### 1.4 TASK-e6ddcdcb3d9cf330-s3-t4 — Verify and document the normal end-to-end review lifecycle

Exercise compiled normal MCP/daemon worker routes and both reviewer adapters using fake native CLI and real local IPC/Git/filesystem, covering scoped review, progress, concurrent sessions, interruption/re-review and post-approval cleanup. Record production build and smoke evidence. Document deployment restart and explicit retry of already-approved S2 cleanup as rollout step, without another S2 model review; no broad full-project sweep or hosted accuracy claims from fake transport tests.

**Acceptance checks:**
- Compiled normal entrypoint smoke proves duplicate rejection, different-id activity overlap, per-review order and actual disconnect semantics.
- Pinned after-only selected scope, mandatory coverage inspection, optional execution and native diagnostic feedback remain identical through both normal reviewer parties.
- Restart requires explicit resume; existing terminal attempts/pinned history cannot be rewritten and CR remains after cleanup.
- Production build and focused tests recorded honestly; fake-provider mechanics distinguished from hosted review evidence; updated docs describe cleanup retries and unchanged design review boundary.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Normal MCP start/progress/publication use committed packets and reject retired or inferred scopes | `t2` |
| Cross-session and worker/direct duplicate review-id admission starts exactly one execution | `t1` |
| Different review ids overlap with serial per-review provider calls and merged CR history | `t1` |
| Daemon observer disconnect survives; controller disconnect fences late results and explicit resume skips durable tasks | `t1` |
| Successful story BUILD approval removes only matching fully preserved task/story checkpoints | `t3` |
| Cleanup defers for active admission/execution/publication and excludes concurrent starts under story fence | `t3` |
| Rejected approval, task validation and CR publication never clean checkpoints; repeated approval retries partial cleanup | `t3` |
| Cleanup retains malformed/symlink/foreign/future/unrepresented history and reports filesystem failures | `t3` |
| Normal controller/daemon routes preserve coverage/status/diagnostic policy, after-only scope and schema/guide parity | `t2` |
| Production transport and worker routing smoke validates progress, restart/retrigger and design review remains unavailable | `t4` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s3 contractDetails and interactionWithShared`
- **[[c2]]** `prior-artifact` `LLD s3 errorPaths and testStrategy`
- **[[c3]]** `prior-artifact` `LLD s3 dataModelChanges and migration`
