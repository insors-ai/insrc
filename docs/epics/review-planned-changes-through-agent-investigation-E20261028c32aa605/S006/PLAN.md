<!-- insrc:artifact PLAN-c32aa60534232f36-s6 -->

# Plan: STORY-c32aa60534232f36-s6

## Summary

**Epic:** `review-planned-changes-through-agent-investigation`
**LLD run:** `wf-1793278587047-ozknr8`
**LLD effective hash:** `7d083bbbc4c1...`

Build S6 in 14 ordered tasks: trusted canonical/evidence adapters and recovery composition first, then the scoped bridge, qualified provider adapters, versioned client routing and truthful status. Finish with compatibility, rollout and evaluation evidence. Legacy remains the default; activation requires separate readiness and predecessor approval, and no live comparison or default change is included.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define versioned commands status and disabled engine selection | M | — | — | unit: Strict investigation commands status schema and default legacy selection | [[c1]] [[c2]] |
| 2 | **`t2`** Adapt canonical approved work and exact commit scope | M | — | `t1` | integration: Canonical approved planned and upstream scope rejects ambiguous attribution | [[c1]] [[c2]] |
| 3 | **`t3`** Compose pinned evidence test and caller-impact adapters | M | — | `t2` | integration: Pinned source artifact test and caller evidence preserve provenance and limitations | [[c1]] [[c2]] |
| 4 | **`t4`** Build repository-owned admission and recovery composition service | M | — | `t2`, `t3` | integration: Idempotent admission descriptor recovery and runtime source exclusions; integration: Service lease budget and frozen publication composition survive restart | [[c1]] [[c2]] |
| 5 | **`t5`** Expose authenticated scoped evidence and progress bridge | M | — | `t4` | integration: Scoped bridge accepts multiple block ACKs and rejects stale cross run capabilities | [[c1]] [[c2]] |
| 6 | **`t6`** Add native binding and effective-isolation qualification | M | — | `t5` | integration: Effective native isolation qualification rejects inherited tools and unproven binaries | [[c2]] |
| 7 | **`t7`** Integrate qualified Claude investigation sessions | M | — | `t6` | integration: Claude scoped session progress budget cancellation and legacy behavior | [[c2]] |
| 8 | **`t8`** Integrate qualified Codex investigation sessions | M | — | `t6` | integration: Codex scoped session progress budget cancellation and legacy behavior | [[c2]] |
| 9 | **`t9`** Route controller MCP and daemon commands by pinned engine | M | — | `t5`, `t7`, `t8` | integration: Entry parity across daemon controller source and indexed planned and planless runs; integration: Cross engine schema generation and capability replay are rejected | [[c1]] [[c2]] [[c3]] |
| 10 | **`t10`** Project truthful status reconnect and usage diagnostics | M | — | `t4`, `t9` | integration: Status reconnect progress accounting and pending unknown usage are truthful | [[c1]] [[c2]] [[c3]] |
| 11 | **`t11`** Verify end-to-end recovery cancellation and canonical publication | M | — | `t9`, `t10` | integration: Crash concurrent resume cancel and frozen publication recover without duplicate execution | [[c1]] [[c2]] |
| 12 | **`t12`** Implement explicit adoption rollback and predecessor reconciliation gate | M | — | `t9`, `t10`, `t11` | integration: Legacy S005 pre S005 design and installation order partitions remain compatible; integration: Opt in readiness and rollback retain status while refusing unsupported resumes | [[c3]] |
| 13 | **`t13`** Add independently adjudicated deterministic quality and baseline evaluation | M | — | `t11`, `t12` | unit: Adjudicated fixture baseline preserves required defects coverage and labelled efficiency metrics; unit: No default quality or savings claim without separately authorized live evidence | [[c1]] [[c3]] |
| 14 | **`t14`** Prove installation rollout matrix and complete focused verification | M | — | `t7`, `t8`, `t10`, `t11`, `t12`, `t13` | integration: Installed adapter and activation readiness remain explicit across the final matrix; smoke: Focused production integration domain legacy provider fixtures and production build | [[c1]] [[c2]] [[c3]] |

### 1.1 TASK-c32aa60534232f36-s6-t1 — Define versioned commands status and disabled engine selection

Add the exact sc7 status type, discriminated production command/diagnostic envelopes, errors and capability declarations in proposed src/shared/review-investigation.ts; add default-legacy selection/readiness configuration without enabling starts.

**Acceptance checks:**
- Exact ReviewClientStatusV1 matches HLD; progress/usage diagnostics remain explicitly versioned outer fields.
- Strict commands distinguish engine/version/operation and reject unknown fields/versions before dispatch; no client-supplied reviewer party is authoritative.
- Default behavior remains legacy and a config value alone cannot enable investigation.

### 1.2 TASK-c32aa60534232f36-s6-t2 — Adapt canonical approved work and exact commit scope

Implement the daemon-owned verified WorkInputReader and scope/attestation adapter over existing registry and canonical lifecycle/history; feed sc1/sc2 without deriving scope from HEAD.

**Acceptance checks:**
- Canonical integrity, approved revision and source bindings are checked; a present invalid PLAN cannot be bypassed by planless routing.
- Planned and approved-upstream small/planless builds retain required criteria and all selected changed blocks.
- Mixed/ambiguous attribution refuses or requires explicit verified scope evidence; Story trailers alone are not exclusivity proofs.

### 1.3 TASK-c32aa60534232f36-s6-t3 — Compose pinned evidence test and caller-impact adapters

Add trusted bounded source/artifact/test-result reads and optional graph caller lookup tied to exact selected entities and registered dependency closure.

**Acceptance checks:**
- Evidence identities derive from actual pinned reads and verified test records, never reviewer attestations or mutable markdown.
- Source-only exposes no caller query; indexed lookup verifies source/index/entity mapping and retains partial/stale/unknown limitations.
- Empty or partial caller results do not imply no impact; unresolved impact obligations remain required, with no client DB access.

### 1.4 TASK-c32aa60534232f36-s6-t4 — Build repository-owned admission and recovery composition service

Add immutable private production descriptor discovery and one daemon service per registered repo, composing existing S1-S5 state, continuation and publication APIs.

**Acceptance checks:**
- Exact repeated requestId reuses one run; conflicting inputs refuse and admission-orphan crashes cannot infer accepted work.
- Descriptor records scope/mode/policy/backend/party identity under restrictive runtime paths without a second acceptance journal or private sc4 format changes.
- Lease claim occurs when execution is admitted; resume/cancel/restart preserve accepted progress, budget and frozen publication semantics; no provider executes until a qualified adapter is injected.
- Production descriptor and scoped bridge runtime material is excluded from explicit packet selection and source/context reads through the shared path guard; no sc4 private namespace or event format is altered.

### 1.5 TASK-c32aa60534232f36-s6-t5 — Expose authenticated scoped evidence and progress bridge

Implement the service bridge for read/impact/progress/final-reply calls, binding private capability authority to process epoch/run/subject/attempt/request/generation/role/expiry.

**Acceptance checks:**
- The only reviewer operations reach trusted sc1/sc2 reads or validated sc3/sc4 progress/reply; no general RPC, shell, filesystem, approval or cross-repo capability.
- Several blocks can be durably acknowledged before a final reply in one session; final deltas cannot bypass checkpoints.
- Cross-run/stale/expired/revoked callbacks refuse, exact retries remain idempotent, and cancellation drains authority before reuse.

### 1.6 TASK-c32aa60534232f36-s6-t6 — Add native binding and effective-isolation qualification

Extend shared provider options additively with the approved trusted investigation binding and common qualification records; preserve the existing no-binding review path.

**Acceptance checks:**
- Qualification checks effective isolated tool/config catalogue, adapter/binary/profile identity, cancellation and scoped progress support rather than trusting a boolean or read-only sandbox.
- Inherited user/project MCP, plugins/hooks, executable repo instructions and broad tools cannot enter a qualified session; OAuth is not copied or replaced.
- Unsupported/unproven adapter versions refuse before a provider call; deterministic fake-CLI evidence is labelled and does not certify an installed binary.

### 1.7 TASK-c32aa60534232f36-s6-t7 — Integrate qualified Claude investigation sessions

Implement the Claude-specific isolated invocation adapter behind LLMProvider/CliProvider using the common bridge and qualification boundary.

**Acceptance checks:**
- Qualified invocation exposes only the scoped bridge and supports multiple per-block ACKs in one managed CLI session.
- 128K inclusive estimated admission includes actual schema/tool catalogue and reserves; internalRetry:false, 5-minute cap and abort/stall behavior retain existing owner accounting.
- No-binding legacy/design invocation behavior remains unchanged; unqualified installed versions fail closed without broad-tool fallback or direct REST.

### 1.8 TASK-c32aa60534232f36-s6-t8 — Integrate qualified Codex investigation sessions

Implement the Codex-specific isolated invocation adapter through the same provider abstraction and bridge with independent effective-configuration qualification.

**Acceptance checks:**
- Codex effective tool/config isolation is verified independently of a read-only sandbox; broad registered MCP/tools and executable startup context are not admitted.
- One scoped session can accept multiple durable blocks; full reply validation, budget, retry and cancellation behavior match the common domain.
- Unsupported installed versions refuse explicitly; existing no-binding Codex/design behavior and CLI OAuth ownership remain unchanged.

### 1.9 TASK-c32aa60534232f36-s6-t9 — Route controller MCP and daemon commands by pinned engine

Register additive production IPC/MCP operations and route explicit new-engine calls before legacy resolution; adapt authenticated controller turns and fresh declared budgets to the same service.

**Acceptance checks:**
- Daemon/controller x source/indexed x planned/planless use the same subject, evidence, progress, recovery and completion service.
- Controller replies cannot supply author identity, forge inspection receipts or reuse cross-engine/schema/generation tokens; budgets are declared estimates, not measured host context.
- Existing legacy/predecessor/design handlers retain valid original frames and states; new-engine errors never fall through to legacy execution or HEAD diff.

### 1.10 TASK-c32aa60534232f36-s6-t10 — Project truthful status reconnect and usage diagnostics

Implement one sc7 serializer and bounded status/heartbeat projections across transports, using verified recovery and the existing qualified idempotent usage writer/outbox.

**Acceptance checks:**
- Covered/required/unresolved and latest block/checkpoint differ explicitly from provider liveness; detach is no verdict or automatic retry.
- Observed, estimated, reserved, pending and unavailable usage remain distinct; unknown counters stay null and cumulative snapshots are not double counted.
- Legacy status uses labelled diagnostic units and unavailable/non-resumable states without fabricating an investigation journal; status reads consume no execution allowance.

### 1.11 TASK-c32aa60534232f36-s6-t11 — Verify end-to-end recovery cancellation and canonical publication

Integrate production start/read/progress/reply/status/resume/cancel through real domain and canonical stores with deterministic provider/controller fixtures.

**Acceptance checks:**
- Per-block ACKs survive provider/transport/daemon interruption; exact concurrent retries converge and late/revoked replies cannot create a terminal result.
- Pinned source/contracts/BUILD/party changes and edited canonical heads refuse; frozen lost-ACK publication reconciles without rerunning judgments.
- Incomplete/failed execution produces no successful CR while accountable WARN/BLOCK findings and pending usage remain intact.

### 1.12 TASK-c32aa60534232f36-s6-t12 — Implement explicit adoption rollback and predecessor reconciliation gate

Add readiness policy and schema/guide documentation; prepare the supported tracked predecessor code-only reconciliation for separate explicit approval, without rewriting sibling LLDs.

**Acceptance checks:**
- Readiness requires compatible readers/client/daemon, real qualified backend, version-pinned evidence and approved predecessor reconciliation; missing/draft evidence keeps starts disabled.
- Both S005 installation orders and valid pre-S005/legacy/design routes remain compatible; only predecessor code-only chunk/gather/new frames are superseded at adoption.
- Rollback rejects new investigation work, safely pauses/drains current turns and preserves compatible status/export/cancel/frozen publication reconciliation; unsupported older resumes refuse without conversion.
- Preparing the reconciliation never auto-approves it or enables opt-in; record any pending external approval explicitly.

### 1.13 TASK-c32aa60534232f36-s6-t13 — Add independently adjudicated deterministic quality and baseline evaluation

Implement versioned fixture/oracle and recorded-baseline comparison for required defects/coverage plus labelled call/time/repeated-input metrics and readiness evidence hashes.

**Acceptance checks:**
- Fixture oracle provenance is independently adjudicated; baseline and candidate records bind source/policy/schema/adapter/fixture identity and required coverage/defects cannot silently disappear.
- Deterministic/provider-script metrics are labelled and unknown actual tokens/latency stay unavailable; no per-iteration full legacy review or live model run is required.
- Passing deterministic evaluation can support explicit opt-in only alongside all other gates; no default quality/savings claim or default flip without separately authorized live evidence and decision.

### 1.14 TASK-c32aa60534232f36-s6-t14 — Prove installation rollout matrix and complete focused verification

Run the final daemon/controller/source/index/planned/planless/native/legacy installation matrix, actual adapter qualification diagnostics, focused suites and production build; retain required sequence documentation and one final independent code review.

**Acceptance checks:**
- Matrix covers capability mismatch, both installation orders, scope ambiguity, unknown impact/usage, concurrency, crash/reconnect and rollback without legacy/design regressions.
- Installed adapter qualification is reported truthfully; an unsupported binary or pending reconciliation leaves opt-in closed rather than manufacturing readiness.
- Focused affected suites and production build pass without whole-repo/live sweeps; record logs in /tmp, update relevant diagram if integration changes its boundaries, and run exactly one mandatory independent code review before asking BUILD completion approval.
- Final BUILD distinguishes completed implementation from activation readiness, listing any unsupported installed adapter or separately pending reconciliation approval explicitly.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Entry parity across daemon controller source and indexed planned and planless runs | `t9`, `t11`, `t14` |
| Cross engine schema generation and capability replay are rejected | `t1`, `t5`, `t9` |
| Legacy S005 pre S005 design and installation order partitions remain compatible | `t9`, `t12`, `t14` |
| Qualified native bridge permits multiple durable block ACKs and refuses broad tools | `t5`, `t7`, `t8` |
| Canonical work packet attribution and snapshot evidence adapters reject ambiguous scope | `t2`, `t3`, `t11` |
| Status reconnect progress accounting and pending unknown usage are truthful | `t10`, `t11` |
| Crash concurrent resume cancel and frozen publication recover without duplicate execution | `t4`, `t11`, `t14` |
| Opt in readiness and rollback retain status while refusing unsupported resumes | `t12`, `t14` |
| Native session isolation budget cancellation and OAuth boundaries remain explicit | `t6`, `t7`, `t8`, `t14` |
| Adjudicated fixture baseline preserves required defects coverage and labelled efficiency metrics | `t13` |
| No default quality or savings claim without separately authorized live evidence | `t13`, `t14` |
| Focused production integration domain legacy provider fixtures and production build | `t14` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s6 contractDetails, dataModelChanges and errorPaths: canonical work, scope, evidence, descriptor, recovery and completion composition`
- **[[c2]]** `prior-artifact` `LLD s6 contractDetails and dataModelChanges: qualified native/controller sessions, versioned transport, status and usage`
- **[[c3]]** `prior-artifact` `LLD s6 migration and testStrategy: predecessor reconciliation, installation order, adoption/rollback, independent-oracle baseline and focused verification`
