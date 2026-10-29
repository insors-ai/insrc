<!-- insrc:artifact PLAN-7aaf7e1b4a54e86f-s1 -->

# Plan: STORY-7aaf7e1b4a54e86f-s1

## Summary

**Epic:** `provide-live-installed-review-qualification-before`
**LLD run:** `wf-1793302600193-rwk4r6`
**LLD effective hash:** `554086532d2f...`

Build a bounded installed-CLI probe path using the existing native adapters, private scoped bridge and one shared provider execution lane. Export independently checkable unsigned observations while preserving production evidence and approval gates. Ten ordered tasks separate software verification from actual installation probes and conditional real-review acceptance; activation signoff and legacy deletion follow later.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define strict probe contracts and private grants | M | — | — | unit: Probe schemas reject launch overrides, forged/serialized grants and invalid observation states; unit: Probe capability remains optional and cannot supply production qualification | [[c1]] [[c2]] |
| 2 | **`t2`** Share the existing provider lane with probes | S | — | `t1` | integration: Probe and review across repositories share one lane until actual teardown; integration: Cancelling queued probe does not invoke provider or release another owner's slot | [[c2]] [[c3]] |
| 3 | **`t3`** Build controlled fixtures and scoped probe observations | M | — | `t1` | integration: Synthetic probe bridge records ordered durable ACKs and rejects cross-run capabilities; integration: Private canaries leave real source/config/auth untouched and cleanup on failure | [[c1]] [[c2]] [[c4]] |
| 4 | **`t4`** Add bounded provider probe execution | M | — | `t1`, `t2`, `t3` | integration: Trusted probe executes once with exact pinned launch, inclusive budget and bounded cancellation; unit: Production native session refuses probe grants and unchanged installed-proof checks hold | [[c1]] [[c2]] [[c3]] [[c4]] |
| 5 | **`t5`** Collect actual Claude probe evidence | M | — | `t4` | unit: Claude observed inventory/denial parser rejects model claims, flags, gaps and stale identities; integration: Claude probe retains OAuth without credential copies and never fabricates cancellation proof | [[c2]] [[c4]] |
| 6 | **`t6`** Collect actual Codex probe evidence | M | — | `t4` | unit: Codex observation parser pins launcher and real runtime; missing inventory remains unsupported; integration: Codex probe preserves strict schema cleanup and actual process drain | [[c2]] [[c4]] |
| 7 | **`t7`** Wire the daemon-owned probe service and real IPC route | M | — | `t2`, `t3`, `t5`, `t6` | integration: Real routed probe IPC registers all operations on owning main daemon and strict gateway dispatcher; integration: Probe UUID replay/conflict, crash interruption, readonly status and bounded export; integration: Malformed probe never enters production investigation or legacy parsers | [[c1]] [[c3]] [[c5]] |
| 8 | **`t8`** Export evidence and document independent operator handoff | M | — | `t7` | unit: Unsigned export validates every required observation and never signs, approves or changes config; integration: IPC-only operator client reports missing attestation/readiness prerequisites without invoking production review | [[c1]] [[c2]] [[c5]] [[c6]] |
| 9 | **`t9`** Verify compiled contracts and focused regressions | M | — | `t8` | smoke: Compiled probe protocol and production build pass with unchanged default/admission; integration: Affected native/adoption/repository/MCP/routing regressions preserve legacy and design behavior | [[c3]] [[c4]] [[c5]] [[c6]] |
| 10 | **`t10`** Capture bounded installed probes and acceptance handoff | M | — | `t9` | live: Actual installed probe per authorized provider/mode produces supported observation evidence or explicit unsupported; live: Post-approval exact commit-scoped acceptance validates progress/cancel/recovery/CR receipt and truthful accounting; smoke: Acceptance report distinguishes pending prerequisites, software completion and explicit activation signoff | [[c2]] [[c4]] [[c5]] [[c6]] |

### 1.1 TASK-7aaf7e1b4a54e86f-s1-t1 — Define strict probe contracts and private grants

Add proposed src/shared/review-investigation-probe.ts schemas and optional LLMProvider probe capability in src/shared/types.ts; add a proposed provider-local opaque single-use probe grant registry. Define start/status/cancel/export, UUID identity, observation verdicts, nullable accounting and unsigned candidate shape. Preserve NativeIsolationEvidence version 1 and production binding APIs.

**Acceptance checks:**
- Reject arbitrary launch args/prompts/paths/keys or caller-claimed effective inventory.
- Serialized/forged/scripted grants cannot invoke installed probes or production reviewSession.
- Version/mode/state/observation schemas retain explicit unsupported and unknown values.

### 1.2 TASK-7aaf7e1b4a54e86f-s1-t2 — Share the existing provider lane with probes

Extract existing module-private providerTail ownership from src/daemon/review-investigation-repository.ts into a proposed src/daemon/review-investigation-provider-lane.ts; use it from review and probe orchestration with unchanged drain semantics. Do not add a second queue.

**Acceptance checks:**
- Two review/probe requests across repos never overlap provider invocation.
- Queued cancellation makes no model call or lease acquisition; active cancellation holds lane until real teardown.
- Prior repository concurrency/recovery behavior remains intact.

### 1.3 TASK-7aaf7e1b4a54e86f-s1-t3 — Build controlled fixtures and scoped probe observations

Add proposed src/daemon/review-investigation-probe-fixtures.ts for private 0700 fixture roots, inert canaries and dedicated scoped protocol. Reuse private MCP entry/configuration and per-invocation files from native-investigation-session.ts. Own bounded observations and synthetic ACK journal without production subject/binding authority.

**Acceptance checks:**
- No actual user/project config writes, auth copying, arbitrary source access or external network effects.
- Cross-run capability rejection is observed by host; ACKs are durable and ordered.
- Fixtures/bridge close and revoke on cancellation/crash; over-limit evidence fails without truncation.

### 1.4 TASK-7aaf7e1b4a54e86f-s1-t4 — Add bounded provider probe execution

Extend CliProvider and native-investigation-session.ts through the optional provider abstraction using exact existing launch functions and in-memory probe grants. Add a distinct synthetic-only bootstrap execution path, never a requireInstalled=false production bypass. Observe launch/process events and expose collection hooks for version-pinned native observation support.

**Acceptance checks:**
- One explicit start permits at most one 300-second attempt, inclusive 128K budget and no internal retry.
- Exact binary/runtime/config/environment/profile/catalog identity matches recorded launch.
- Actual process-group exit and bridge teardown are awaited; model output alone never establishes proof.
- Existing native production qualification and ordinary review paths unchanged.

### 1.5 TASK-7aaf7e1b4a54e86f-s1-t5 — Collect actual Claude probe evidence

Implement Claude-specific observation integration in proposed src/agent/providers/claude-investigation-probe.ts, reusing claude-investigation-session.ts launch/configuration helpers and CliProvider runner. Version-pin supported independently observable telemetry; represent unsupported fields explicitly rather than manufacturing an inventory.

**Acceptance checks:**
- Keep existing OAuth; never --bare or copied credentials.
- Every inventory/denial claim points to attempt-bound runtime or independently attested observation; requested flags/model text/silence insufficient.
- Require two actual durable ACKs followed by live cancellation/exit for candidate; any missing fact gives unsupported/no candidate.

### 1.6 TASK-7aaf7e1b4a54e86f-s1-t6 — Collect actual Codex probe evidence

Implement Codex-specific observation integration in proposed src/agent/providers/codex-investigation-probe.ts, reusing codex-investigation-session.ts exact strict schema/config/args. Pin launcher, actual runtime/vendor executable and configuration identity, and explicitly reject unsupported effective inventory visibility.

**Acceptance checks:**
- No JS launcher-only identity or broad-tool fallback.
- All required inventory/denial/progress/cancellation observations bind exact invocation and mode.
- Schema/config cleanup and process drain preserve existing native behavior; absent proof gives unsupported/no candidate.

### 1.7 TASK-7aaf7e1b4a54e86f-s1-t7 — Wire the daemon-owned probe service and real IPC route

Add proposed src/daemon/review-investigation-probe.ts service with strict repo registration, identity replay, private durable state, crash interruption, shared lane, bounded status/export and observer collection. Add isolated probe dispatcher in review-investigation-gateway.ts; register codeReview.investigation.probe in handler-runtime.ts, method-class.ts session classification and MAIN_DAEMON_CONNECTION_METHODS. Keep all operations on owning main daemon.

**Acceptance checks:**
- Actual routed start/status/cancel/export reaches the same owner, including worker-originated connections.
- UUID exact replay never invokes twice; changed payload conflicts; reboot never automatically retries or exports incomplete qualification.
- Probe packets cannot enter dispatchInvestigation, production/legacy parsers or mint canonical CR/readiness.
- 8MiB observation bound and 2MiB response bound fail explicitly; status remains read-only.

### 1.8 TASK-7aaf7e1b4a54e86f-s1-t8 — Export evidence and document independent operator handoff

Implement validated unsigned export with immutable observation digests and exact candidate when fully supported, using the unchanged NativeIsolationEvidence schema. Add a proposed scripts/review-investigation-probe.mjs IPC-only operator client and update docs/review-investigation.md for probe execution, independent verification/signature/approval import and bounded acceptance prerequisites.

**Acceptance checks:**
- Daemon never generates/copies signing keys, signs reports, approves evidence, changes engine config or relabels fixtures.
- Partial/stale/over-limit/failed evidence remains diagnostic and cannot export a qualification candidate.
- Runbook maps signed probe, approved oracle/evaluation/readiness, predecessor AMD, exact scope proof and all-tasks-passed real BUILD; system actor cannot be asserted as independent person.
- Reports remain in /tmp/private runtime storage; no temporary review documents in artifact folders.

### 1.9 TASK-7aaf7e1b4a54e86f-s1-t9 — Verify compiled contracts and focused regressions

Run focused affected provider/daemon/MCP/method-class suites under Node22, then npm run build. Verify compiled operator IPC surface, strict schemas, canonical integrity and unchanged legacy/design and production admission behavior. Use fake subprocesses only as explicitly nonqualifying deterministic fixtures; no full repository sweep.

**Acceptance checks:**
- Tests cover forged grants, strict routing, UUID replay, shared lane/drain, crash interruption, bounded export and schema/config cleanup.
- Affected native/adoption/repository/MCP/method-class tests and production build pass; report failures without rerunning unrelated hours-long suites.
- Compiled protocol smoke makes no model calls and does not change engine selection or qualification evidence.

### 1.10 TASK-7aaf7e1b4a54e86f-s1-t10 — Capture bounded installed probes and acceptance handoff

Using the built operator path, run actual installed probes serially for explicitly authorized provider/mode combinations, at most one 300-second attempt each and no automatic retry. Capture actual observations, supported candidate or unsupported reasons, calls/tokens/latency or null. Execute bounded real-review acceptance through unchanged production admission only once separately approved evidence and explicit test opt-in authorization exist; otherwise leave acceptance pending with exact prerequisites. Perform one mandatory final Story code-review call; no automatic repeated rounds.

**Acceptance checks:**
- Each actual installed attempt is bound to exact source/provider/runtime/config/mode pins; deterministic fixtures never certify installation.
- Unsupported/missing observer facts produce no candidate and no false acceptance pass. Independent signer/trust anchor and canonical approval remain operator decisions.
- Only a fully authorized approved real subject with explicit commit scope may produce the production acceptance findings/coverage/progress/CR receipt; otherwise record pending, not passed.
- Final technical completion/code review does not imply activation signoff; activation and tracked legacy CODE deletion remain subsequent explicit user decisions.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Every required isolation observation must be independently supported; model text/flags/silence cannot pass | `t1`, `t4`, `t5`, `t6`, `t8` |
| Candidate requires exact install/config/profile/catalog identity, two ACKs and live cancellation exit | `t3`, `t4`, `t5`, `t6`, `t8` |
| Unsigned/scripted/partial/stale records never become production authority | `t1`, `t4`, `t8` |
| Strict start/status/cancel/export routing; exact UUID idempotency and payload conflicts | `t7` |
| Concurrent probe/review sessions share global lane and drain before next launch | `t2`, `t4`, `t7` |
| Per-invocation files/socket cleanup; crash marks interrupted with no auto retry | `t3`, `t4`, `t7` |
| No real configuration/auth writes or source reads; diagnostic/report bounds | `t3`, `t7`, `t8` |
| Handler inventory includes codeReview.investigation.probe; method classification and MAIN_DAEMON_CONNECTION_METHODS pin every operation to main daemon; exercise real routed IPC start/status/cancel/export, not only a directly called handler | `t7`, `t9` |
| Registered probe handler delegates to the gateway probe dispatcher; malformed/probe packets cannot enter dispatchInvestigation, legacy codeReview.run or production admission | `t7`, `t9` |
| Selected high-tier installed CLI actual image/launch identity and effective inventory | `t4`, `t5`, `t6`, `t10` |
| All required denied-capability probes with independently attributable observations | `t3`, `t5`, `t6`, `t10` |
| Two durable scoped ACKs then host cancellation and actual process-group exit | `t3`, `t4`, `t10` |
| Post-approval approved real commit-scoped subject yields findings/coverage, recoverability and frozen CR receipt | `t8`, `t10` |
| Report observed model calls/tokens/latency, unknown fields null | `t4`, `t7`, `t10` |
| Legacy and design review routing unchanged | `t7`, `t9` |
| Probe grants unusable as production qualification/binding or ordinary provider options | `t1`, `t4`, `t9` |
| Unsupported/missing report never selects fallback or mutates engine config | `t7`, `t8`, `t9` |
| npm run build and affected native/adoption/MCP focused suites under Node22 | `t9` |
| Installed daemon health/commit/capability checks and read-only acceptance report | `t9`, `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/provide-live-installed-review-qualification-before-E202610297aaf7e1b/S001/LLD.md#2-contract-details` — "Approved revision 3 contract API and operator probe request/status data model."
- **[[c2]]** `prior-artifact` `docs/standalone/provide-live-installed-review-qualification-before-E202610297aaf7e1b/S001/LLD.md#3-data-model-changes` — "Unsigned observation/candidate shape, exact native identity, independently verified evidence and unchanged qualification authority."
- **[[c3]]** `prior-artifact` `docs/standalone/provide-live-installed-review-qualification-before-E202610297aaf7e1b/S001/LLD.md#5-error-paths` — "Single attempt limits, shared provider lane, cancellation/process drain, crash invalidation, identity replay and bounds."
- **[[c4]]** `prior-artifact` `docs/standalone/provide-live-installed-review-qualification-before-E202610297aaf7e1b/S001/LLD.md#6-test-strategy` — "Controlled fixture/native observation/progress/cancellation acceptance and focused coverage."
- **[[c5]]** `prior-artifact` `docs/standalone/provide-live-installed-review-qualification-before-E202610297aaf7e1b/S001/LLD.md#3-data-model-changes` — "Explicit gateway dispatch home, handler-runtime registration and method-class/main-daemon ownership."
- **[[c6]]** `prior-artifact` `docs/standalone/provide-live-installed-review-qualification-before-E202610297aaf7e1b/S001/LLD.md#7-migration` — "Additive rollout, independent operator handoff, conditional real acceptance and separate activation/legacy removal."
