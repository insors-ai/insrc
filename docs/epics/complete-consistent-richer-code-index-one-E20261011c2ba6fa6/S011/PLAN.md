<!-- insrc:artifact PLAN-c2ba6fa62a148ed1-s11 -->

# Plan: E20261012c2ba6fa6:S011

## Summary

**Epic:** `complete-consistent-richer-code-index-one`
**LLD run:** `wf-1791802659373-1u5nx9`
**LLD effective hash:** `8ec1c5d92f54...`

Building this Story is thirteen tasks in four strands. First two small independent changes: the review stream's error type moves to a shared module, and the vector store gets the owner rule with its test repairs. Then the move itself, in three behaviour-preserving slices (analyze, then workflow/build/triage, then review/code-review), followed by the per-call context, the in-daemon client that replaces the loopback calls, and the step host. Last the MCP side: forwarders, the retirement of MCP sampling, the deletion of the reader allowance, proof over a real MCP process, and a shipped daemon checked with every client session restarted.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Move the review stream error and types to a shared module | S | — | unit: review stream module: ReviewStreamError from src/shared/review-stream.ts is the same class daemon-stream.ts exports, and the routing tests pass unchanged | [[c1]] |
| 2 | **`t2`** Give the vector store the owner rule | M | — | unit: vector store owner rule: live path refused with no declaration and nothing created; opens after declareLiveStoreOwner; a temporary path opens; relative path and symbolic link refused; integration: no test opens the live vector store: each repaired test file run in a temporary home leaves no lance directory | [[c1]] [[c2]] [[c3]] |
| 3 | **`t3`** Move the analyze step, bundle-md and the one-shot analyze body into the daemon's tree | M | `t1` | unit: moved analyze tests pass at src/daemon/steps (the analyze-step suite, bundle-md, and the repointed importers and source scans) | [[c2]] [[c5]] |
| 4 | **`t4`** Move the workflow, build and triage steps into the daemon's tree | M | `t3` | unit: moved workflow, build and triage tests pass at src/daemon/steps, and workflow-rpc imports nothing from src/mcp | [[c2]] [[c5]] |
| 5 | **`t5`** Move the review and code-review steps into the daemon's tree | M | `t1`, `t4` | unit: moved review and code-review tests pass at src/daemon/steps, including the routing tests and the three conditional tests | [[c2]] [[c5]] |
| 6 | **`t6`** Carry the caller's cwd, INSRC_REPO and client in a per-call context | M | `t3`, `t4`, `t5` | unit: resolveRepoPath inside a step.call uses the context's cwd and envRepo, not the process's; outside one it keeps process defaults; unit: scope directoryOf: a bare file name inside a step.call resolves against the context's cwd, and outside one against process.cwd(); unit: client identity: the context holds 'claude' / 'codex'; the code-review deps receive it as is and the one-shot analyze converts it to 'cli-claude' / 'cli-codex'; unit: step context isolation: two concurrent contexts each see their own cwd and client | [[c2]] [[c1]] |
| 7 | **`t7`** Give the moved review handlers an in-daemon client and a signal | M | `t1`, `t5`, `t6` | integration: in-daemon review client equivalence: timeout, aborted (code daemon-review-aborted, not retryable), daemon-error with reason, and the diff-unavailable fallback behave as before; integration: no loopback: during a moved review or code-review call the daemon's request server sees no second connection from the daemon itself | [[c1]] [[c3]] |
| 8 | **`t8`** Add the step host: the step.call stream request | M | `t6`, `t7` | unit: step host: done frame carries the handler's envelope unchanged; unknown tool gives step-unknown-tool; a throwing handler gives step-failed with its message; integration: equivalence: each of the seven tools through step.call returns the same envelope as the handler called directly on the same temporary store; integration: cancellation: closing the stream during a design-review wait and during a code-review wait aborts the inner run in the daemon; unit: state store miss: each of the four stores says the daemon was restarted and the run must be started again | [[c1]] [[c3]] |
| 9 | **`t9`** Turn the MCP tools into forwarders | M | `t8` | unit: forwarder named errors: ENOENT/ECONNREFUSED give DaemonUnreachableError, unknown method or step-unknown-tool give DaemonTooOldError, and no handler runs; unit: forwarder progress: frames relayed only with a progress token; the done envelope returned unchanged; integration: import graph (ac4): the MCP server's modules reach nothing under src/db, src/analyze or src/daemon/steps; a fixture import makes it fail; unit: MCP tool surface: the twelve tools keep their names, descriptions and input schemas | [[c1]] [[c2]] [[c3]] |
| 10 | **`t10`** Retire the MCP sampling path | S | `t9` | unit: sampling retired: no source names the sampling bridge, the MCP sampling provider or runWithSamplerContext, and the shaper provider tests pass | [[c2]] |
| 11 | **`t11`** Delete the temporary reader allowance | M | `t2`, `t9`, `t10` | unit: source scan: the reader declaration's name appears nowhere under src/; integration: refusal of a third process: beside the owner, a process with no declaration is refused the live graph store and holds no descriptor; integration: ac6: the MCP server's process is refused the live graph store and the live vector store | [[c1]] [[c2]] [[c5]] |
| 12 | **`t12`** Prove the MCP server holds no store and runs survive its restart | M | `t9`, `t11` | integration: no store in the MCP process: lsof of a real MCP server process shows no store file or lance path after each tool; integration: ac2 restart: an analyze step and a workflow step continue through a new MCP process with the same state token; integration: ac5 pass-through: emit_plan and emit_step prompts, schemas and state are byte-identical to the in-process replies; integration: ac3: with no daemon every moved tool returns DaemonUnreachableError through a real MCP process, which opens no store; against a daemon without step.call, DaemonTooOldError | [[c4]] |
| 13 | **`t13`** Ship and check the installed daemon with every session restarted | S | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8`, `t9`, `t10`, `t11`, `t12` | smoke: installed daemon: an analysis through a restarted client session works; smoke: installed daemon: a multi-turn workflow step continues after the client session's MCP server restarts; smoke: installed daemon after every client session has restarted: lsof shows only the daemon on the store files and the lance directory | [[c4]] [[c5]] |

### 1.1 E20261012c2ba6fa6:S011:T001 — Move the review stream error and types to a shared module

Move ReviewStreamError and the types ReviewStreamOpts, ReviewArtifactStreamParams, CodeReviewStreamParams and CodeReviewStreamResult from src/mcp/daemon-stream.ts to src/shared/review-stream.ts; daemon-stream.ts re-exports them so its importers are unchanged.

**Acceptance checks:**
- src/shared/review-stream.ts exports the class and the four types; daemon-stream.ts re-exports them
- the review and code-review routing tests pass unchanged

### 1.2 E20261012c2ba6fa6:S011:T002 — Give the vector store the owner rule

getLanceConn refuses the live ~/.insrc/lance (resolved through links, relative paths included) with LanceStoreNotOwnerError to a process that has not called declareLiveStoreOwner, before creating or connecting; add isLiveStoreOwnerDeclared to the store module; audit every test file in a temporary home for opens of the live vector store and give each a temporary path. Independent of the move, so it lands early and every later sweep runs with it.

**Acceptance checks:**
- no declaration: the live path is refused and nothing is created
- after the declaration it opens; a temporary path opens without one; a relative path and a symbolic link to the live path are refused
- the audit finds no test file that leaves ~/.insrc/lance in its temporary home

### 1.3 E20261012c2ba6fa6:S011:T003 — Move the analyze step, bundle-md and the one-shot analyze body into the daemon's tree

Move src/mcp/analyze-step, bundle-md.ts and the one-shot analyze body with oneShotRunParams to src/daemon/steps with their tests, unchanged in behaviour; repoint the importing test files (report-head, executor-lmdb, answer-step-failed-callers, analyze-rpc-measure, completeness.live, lookup-measure) and the two source-scan tests (no-size, bundle-report-schema). The MCP server calls them from their new location.

**Acceptance checks:**
- every moved and repointed test passes under Node 22
- the full sweep shows no newly failing test

### 1.4 E20261012c2ba6fa6:S011:T004 — Move the workflow, build and triage steps into the daemon's tree

Move src/mcp/workflow-step, build-step and triage-step to src/daemon/steps with their tests; add the daemon-side copy of resolveRepoPath there and point the moved handlers at it (src/mcp/resolve-repo.ts stays for docgen and approve); repoint src/daemon/workflow-rpc.ts; update path mentions in comments.

**Acceptance checks:**
- src/daemon/workflow-rpc.ts imports nothing from src/mcp
- every moved test passes; the full sweep shows no newly failing test

### 1.5 E20261012c2ba6fa6:S011:T005 — Move the review and code-review steps into the daemon's tree

Move src/mcp/review-step and code-review-step to src/daemon/steps with their tests; repoint the three code-review conditional tests in src/workflow/code-review/__tests__; they keep calling the daemon through daemon-stream until t7.

**Acceptance checks:**
- the review and code-review routing tests pass at their new location
- no file under src/mcp other than server.ts imports src/daemon/steps

### 1.6 E20261012c2ba6fa6:S011:T006 — Carry the caller's cwd, INSRC_REPO and client in a per-call context

Add StepCallContext in an AsyncLocalStorage; the daemon-side resolveRepoPath, the code-review handler's repo fallback and directoryOf in src/analyze/context/scope.ts read it inside a call and keep process defaults outside one; the client is held as 'claude' | 'codex' and converted to 'cli-*' only for runWithClientProviderContext in the one-shot analyze.

**Acceptance checks:**
- inside a context, resolveRepoPath, the code-review fallback and directoryOf use the context's cwd and INSRC_REPO, not the process's
- outside a context they behave as before
- two concurrent contexts never see each other's values

### 1.7 E20261012c2ba6fa6:S011:T007 — Give the moved review handlers an in-daemon client and a signal

Build, in src/daemon/index.ts, an in-daemon client from the same unary and stream handler maps passed to the IpcServer, with the shapes of reviewArtifactStream, codeReviewStream, fetchCodeReviewGrounding, fetchCodeReviewFreshness and resolveRepoForCwd, keeping reviewStreamRequest's failure mapping (timeout, aborted, daemon-error with reason). Add an optional signal to handleReviewStep and handleCodeReviewStep and pass it to their waits.

**Acceptance checks:**
- no module under src/daemon/steps imports src/mcp/daemon-stream.ts
- a timed-out wait gives 'timeout', an aborted one 'aborted', an error frame with reason 'diff-unavailable' takes the diff fallback, as before
- an aborted signal ends the inner review run

### 1.8 E20261012c2ba6fa6:S011:T008 — Add the step host: the step.call stream request

Register step.call as a stream handler with a table of the seven tools; run the handler under the StepCallContext with the stream's signal; answer with a 'done' frame carrying the envelope unchanged, 'step-unknown-tool' and 'step-failed' error frames. Reword the four moved state stores' miss message to say the daemon was restarted and the run must be started again.

**Acceptance checks:**
- for each of the seven tools, the reply through step.call deep-equals the reply of the handler called directly on the same temporary store
- unknown tool and throwing handler give the named error frames; a socket close fires the handler's signal
- each state store's miss message names a daemon restart

### 1.9 E20261012c2ba6fa6:S011:T009 — Turn the MCP tools into forwarders

The seven tools forward over step.call with the MCP process's cwd, INSRC_REPO and the converted client; DaemonUnreachableError and DaemonTooOldError as isError envelopes; progress relayed only with a progress token. runInsrcMcpStdio stops registering the builtins, data drivers and workflow runners. Add the import-graph test of the MCP server.

**Acceptance checks:**
- the MCP server's import graph, apart from ipc-client.ts and daemon-stream.ts, reaches nothing under src/db, src/analyze or src/daemon/steps, and a fixture import makes the test fail
- with no daemon every moved tool returns DaemonUnreachableError; against a daemon without step.call, DaemonTooOldError
- the twelve tools keep their names, descriptions and input schemas

### 1.10 E20261012c2ba6fa6:S011:T010 — Retire the MCP sampling path

Delete src/mcp/sampling-bridge.ts, src/agent/providers/mcp-sampling-provider.ts, runWithSamplerContext and the ambient-sampler branch of buildShaperProvider, with their tests (sampling-bridge, mcp-sampling-provider, sampler-context, the sampler cases of shaper-provider); delete progress-forward.ts and its test.

**Acceptance checks:**
- no source mentions runWithSamplerContext, the MCP sampling provider or the sampling bridge
- the shaper's other providers' tests pass unchanged

### 1.11 E20261012c2ba6fa6:S011:T011 — Delete the temporary reader allowance

Delete declareLiveStoreReaderUntilS11, _mayReadLiveStore and the call in the MCP server; remove the store-child 'declare-reader' command; turn the reader cases of live-store-owner.test.ts and live-store-refusal.test.ts into refusal cases; replace the 'exactly two places' scan with one that fails on any occurrence and builds the name from pieces; run and record the full sweep under Node 22.

**Acceptance checks:**
- the name occurs nowhere under src/
- the MCP server's process is refused the live graph store and the live vector store
- the full sweep is recorded with nothing newly failing

### 1.12 E20261012c2ba6fa6:S011:T012 — Prove the MCP server holds no store and runs survive its restart

Integration tests over a real MCP server process (stdio) against a daemon in a temporary home: after one call of each moved tool lsof shows no store file or lance directory in the MCP process; a multi-turn analyze step and workflow step continue through a new MCP process with the same state token; prompts, schemas and state tokens are byte-identical to the in-process replies.

**Acceptance checks:**
- lsof of the MCP process shows no graph.lmdb, graph.lmdb-lock or lance path after each tool
- a run continues across an MCP process restart
- the emit_plan / emit_step replies are byte-identical

### 1.13 E20261012c2ba6fa6:S011:T013 — Ship and check the installed daemon with every session restarted

Push, update and restart the installed daemon, then restart every client session; smoke-check an analysis and a multi-turn step across a session restart; check with lsof that no process but the daemon holds the store files or the lance directory; record the result beside the build.

**Acceptance checks:**
- each smoke check is recorded with what was run and seen
- lsof shows only the daemon on ~/.insrc/graph.lmdb, its lock file and ~/.insrc/lance

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| step host: a known tool runs its handler under the context and the 'done' frame carries the handler's envelope unchanged (deep-equal); an unknown tool gives an error frame 'step-unknown-tool'; a throwing handler gives 'step-failed' with its message | `t8` |
| step host context: two concurrent calls with different cwd and client each see their own context inside the handler | `t6` |
| forwarder: ENOENT and ECONNREFUSED give an isError envelope naming DaemonUnreachableError; 'unknown method: step.call' and 'step-unknown-tool' give DaemonTooOldError; neither runs a handler | `t9` |
| forwarder: progress frames are relayed only with a progress token; the done envelope is returned unchanged | `t9` |
| resolveRepoPath inside a step.call uses the context's cwd and envRepo, not the process's; outside one it keeps process defaults | `t6` |
| vector store owner rule: getLanceConn on the live path with no declaration throws LanceStoreNotOwnerError and creates nothing; after declareLiveStoreOwner it opens; a temporary path set with setLanceConnPath opens without a declaration; the live path through a relative path and a symbolic link is refused | `t2` |
| source scan: the name declareLiveStoreReaderUntilS11 appears nowhere under src/ | `t11` |
| client identity: 'cli-claude' / 'cli-codex' from detectClientProvider reach the context as 'claude' / 'codex', the code-review deps receive 'claude' / 'codex' and the one-shot analyze's runWithClientProviderContext receives 'cli-claude' / 'cli-codex' | `t6` |
| scope directoryOf: a bare file name inside a step.call resolves against the context's cwd, and outside one against process.cwd() | `t6` |
| equivalence: each of the seven tools, called through the forwarder and step.call against a daemon in a temporary home, returns the same envelope as the handler called directly in-process for the same input (golden comparison per tool, including the first reply of every multi-turn tool) | `t8` |
| ac2 restart: a multi-turn analyze step and a workflow step started through forwarder A continue through forwarder B in a new process after A has exited, with the same state token | `t12` |
| ac5 pass-through: the prompt, schema and state fields of an emit_plan / emit_step reply are byte-identical to the in-process reply | `t12` |
| no store in the MCP process: after one call of each tool through a real MCP server process (stdio) against a daemon in a temporary home, lsof of the MCP process shows no descriptor on graph.lmdb, graph.lmdb-lock or the lance directory | `t12` |
| ac3: with no daemon, every step tool returns DaemonUnreachableError and the MCP process opens no store; against a stand-in daemon that does not know step.call, DaemonTooOldError | `t12`, `t9` |
| ac6: the MCP server's process (no declaration) is refused the live graph store and the live vector store | `t11` |
| import graph (ac4): every module reachable by value imports from src/mcp/**, src/bin/insrc-mcp.ts, apart from src/shared/ipc-client.ts and src/mcp/daemon-stream.ts, imports nothing under src/db, src/analyze or src/daemon/steps; a fixture that adds such an import makes the test fail | `t9` |
| cancellation: closing the forwarder's socket during a design-review wait and during a code-review wait aborts the inner run in the daemon (its own abort observed), not only the outer wait | `t8`, `t7` |
| no loopback: during each moved tool's call, the daemon's request server sees no second connection from the daemon's own process (the moved handlers use the in-daemon client) | `t7` |
| in-daemon review client equivalence: a design-review wait that passes timeoutMs fails with ReviewStreamError('timeout') and the same retryable reply as before; a code-review run whose daemon run fails with reason 'diff-unavailable' takes the same diff fallback as before; an 'error' frame becomes ReviewStreamError('daemon-error', error, reason); an aborted wait fails with ReviewStreamError('aborted') and code 'daemon-review-aborted', not retryable | `t7` |
| refusal of a third process: beside the owner, a process with no declaration is refused the live graph store and holds no descriptor (replaces the reader case of live-store-refusal.test.ts) | `t11` |
| installed daemon: an analysis through a restarted client session works, and lsof shows only the daemon holding the store files and the lance directory | `t13` |
| installed daemon: a multi-turn workflow step continues after the client session's MCP server is restarted between turns | `t13` |
| installed daemon after every client session has restarted: lsof shows no process but the daemon holding ~/.insrc/graph.lmdb, graph.lmdb-lock or ~/.insrc/lance | `t13` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s11 contract details`
- **[[c2]]** `prior-artifact` `LLD s11 data model changes`
- **[[c3]]** `prior-artifact` `LLD s11 error paths`
- **[[c4]]** `prior-artifact` `LLD s11 test strategy`
- **[[c5]]** `prior-artifact` `LLD s11 migration`
