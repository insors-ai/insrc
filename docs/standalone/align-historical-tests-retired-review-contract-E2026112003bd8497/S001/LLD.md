<!-- insrc:artifact LLD-03bd849749a52b41-s1 -->

# LLD: STORY-03bd849749a52b41-s1 — Align historical tests with the retired review contract

## Summary

**Epic:** `align-historical-tests-retired-review-contract`
**HLD base run:** `wf-1795162828625-eehjjh`
**HLD effective hash:** `0c2d5db0d8b7...`

Repair historical tests and fixture inventories for the intentionally retired automated-review contract. Assert exact unavailable responses before provider, parser or IO work; preserve generic transport, worker/token, lifecycle, historical-data and temporary-versus-saved persistence coverage through current supported surfaces. Production review execution and RPC classification remain unchanged.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Error paths](#3-error-paths)
4. [Test strategy](#4-test-strategy)
5. [Migration](#5-migration)
6. [Alternatives considered](#6-alternatives-considered)
7. [References](#7-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal

### 2.1 `reviewUnavailable`

```typescript
reviewUnavailable(family: 'design' | 'code' = 'design', ..._args: readonly unknown[]): never
```

**Parameters:**
- `family: 'design' | 'code'` _(optional)_ — Select existing family-specific unavailable message.
- `_args: readonly unknown[]` _(optional)_ — Retained arguments remain uninspected.

**Returns:** `never` — Existing exact Design/Code review functionality is being rewritten exception.

**Errors:**
- `Error` when Every retired execution, grounding/freshness, lifecycle operation and review step; no provider/IO side effects.

**Preconditions:**
- Test inputs may be malformed/poisoned to prove no argument inspection.
- Do not bypass production refusal through synthetic success mocks on review-named surfaces.

**Postconditions:**
- Use exact family messages and current error envelopes for daemon, step and MCP boundaries; no start/poll provider review workload.
- Move still-valid generic progress/done, synchronous-throw, abort/drain, cwd lookup and worker identity assertions to supported methods or explicitly test-only generic handlers.
- Worker token lifecycle covers current analyze/workflow kinds and explicit rejection of retired kinds; preserve session isolation, update/old-token and idle-release assertions for supported kinds.
- Current inert historical rendering/metadata and human lifecycle/integrity/build completion gates remain tested, with no fake review entry or provider execution.
- Replace deleted fixture paths with real current suites; require child execution evidence and zero live LMDB/Lance artifacts, plus deliberate-opening positive controls.
- Persistence repair maps removed writer checks to current guarded sinks and supported entry points: retain hostile-input zero-read/no-write checks at boundaries that guarantee them, and saved artifact/history/cache/trace positives. Do not silently claim a low-level writer offers stronger preflight guarantees than its implementation; any uncovered production defect requires separate triage.
- Relationship impact is test-only: tests invoke existing boundaries; daemon owns stores, request owns child/drain lifetime, session owns supported continuation tokens, artifacts retain existing historical records. No production ownership/cardinality/API/IPC/entity/UX change. Prose and assertion mapping suffice; no ERD or companion visual required.

## 3. Error paths

**Error cases**

- **Historical test expects a retired review to execute or mint a token.** (recoverable)
  - Detection: Current exact unavailable exception or unsupported-kind result.
  - Response: Require that refusal and absence of work, while moving generic transport/token assertions to supported operations.
  - User impact: Tests match intentional retirement without simulating successful reviews.
- **Isolation inventory names a deleted test or nested runner executes no cases.** (recoverable)
  - Detection: Verify path existence, child exit, TAP pass count and no cancellations before checking store absence.
  - Response: Replace entry with current real coverage; do not accept empty/failed child runs as isolation proof.
  - User impact: Trustworthy no-live-store assertions retain deliberate-open positive controls.
- **Persistence fixture imports removed provenance writer.** (recoverable)
  - Detection: Module-load failure from original audit; current writer and guarded sink source inspection.
  - Response: Remove obsolete import, map valid assertion intent onto current guarded entry/sink and saved persistence control. Keep hostile getters/canaries and reject any claimed safety not actually observed.
  - User impact: Persistence matrix runs meaningfully rather than failing at import.
- **Replacement exposes an independent production/privacy/routing defect.** (terminal)
  - Detection: Reproduce with current supported API and separate from removed contract assumptions.
  - Response: Record and route separately; do not relax assertions or change production authority to force this batch green.
  - User impact: Remaining failures are explicit and linked to correct scope.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Review call receives poison getters, missing repo, stale token or malformed phase. | Exact family refusal before inspection/work; no provider call or persisted review output. |
| Generic test previously used review methods as transport stand-ins. | Use supported or explicit test-only handlers and preserve progress/done, sync throw, cancellation/drain, cwd/repo behavior. |
| Idle worker release and session change. | Supported token kinds retain their current continuity, isolation and invalidation semantics; retired kinds reject without fabricated tokens. |
| Old review findings/history and approved BUILD records. | Inert history/presentation and current approval/integrity/build/task accounting remain valid; no fake review generated. |
| RPC method coverage, inventory classification, generic role defaults or spawn exemptions drift. | Keep Batch05, Batch15 and Batch06/09 responsibilities separate; change only retired-review assumptions in shared tests, recording sibling failures. |

**Invariants to preserve**

- Automated design/code reviews remain unavailable; no provider/IO execution is restored. [[c1]]
- History, human approval, integrity, task accounting and build completion guarantees remain exercised. [[c2]]
- Temporary no-persistence and saved positive controls, true child execution and live-store isolation evidence remain meaningful. [[c3]]

## 4. Test strategy

**Test framework:** `node:test with tsx on supported Node22 under the owned coordinator, serial focused groups. Run baseline before each group's edits; retain actual counts/failures, not blanket skips or longer deadlines. Audit dates back to d7bcd4f9; current checkpoint aa76e132b may expose different later failures. Preserve generic test semantics with an old-assertion→current-control mapping. Typecheck and appropriate source/compiled worker checks; inspect cleanup and final quiescence. No live provider or automatic review session, broad overlapping sweep or release qualification.`

**Test levels**

- **integration** — Verify retired contract at backend/client/MCP boundaries with no execution.
  - Subjects: `Retired review surfaces reject before argument inspection, providers or IO`, `Generic client progress, synchronous errors and abort drains retain coverage on supported handlers`
  - Fixtures: `Existing review-unavailable suite; poison inputs and provider/IO sentinels.`, `In-daemon client and lifecycle wiring fixtures with supported or explicit test-only handlers; no production method additions.`
- **integration** — Preserve worker and session continuation semantics independently of retired reviews.
  - Subjects: `Supported worker tokens survive idle release and preserve session isolation while retired kinds reject`
  - Fixtures: `Existing indexing-port, router-session and s3 acceptance fixtures with bounded readiness and owned workers.`
- **integration** — Restore meaningful persistence and default-store isolation probes.
  - Subjects: `Temporary persistence canaries remain absent while saved artifact and history controls persist`, `Current isolation inventories execute real tests and detect deliberate default-store opening`
  - Fixtures: `task-persistence current guarded sinks and saved artifact/history/cache/trace fixtures.`, `Temporary HOME before imports; actual LMDB/Lance sentinels and nested TAP execution counts; replace deleted review fixture paths with current suites.`
- **contract** — Preserve historical records and lifecycle gates while aligning review-specific labels.
  - Subjects: `Retained review history and human lifecycle gates remain readable and enforced`, `Review-only label assertions reflect unavailable execution without changing active role tier tests`
  - Fixtures: `Existing review-retirement-workflow and inert history report/resolution tests; valid and failing gate controls.`, `Original role-router-global-tiers suite retaining active tier assertions.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Retired review surfaces reject before argument inspection, providers or IO`, `Review-only label assertions reflect unavailable execution without changing active role tier tests` |
| `ac2` | `Generic client progress, synchronous errors and abort drains retain coverage on supported handlers`, `Supported worker tokens survive idle release and preserve session isolation while retired kinds reject` |
| `ac3` | `Temporary persistence canaries remain absent while saved artifact and history controls persist`, `Current isolation inventories execute real tests and detect deliberate default-store opening` |
| `ac4` | `Retained review history and human lifecycle gates remain readable and enforced` |

## 5. Migration

**State before:** Tests mix valid transport/isolation/history assertions with obsolete review execution, labels, tokens, fixture paths and a removed writer import; the historical audit records resulting failures.

**State after:** Focused tests assert current unavailable responses and preserve surviving semantics through supported operations/current persistence sinks; inventories reference executable suites with genuine isolation controls. Production review behavior and persisted records are unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Inventory affected assertions and capture current focused baselines, mapping each legitimate intent to a current supported control before editing. — ↩ rollbackable
2. Migrate backend/client/MCP and worker review-specific assumptions, retaining positive transport/token/lifecycle controls; do not alter RPC classification. — ↩ rollbackable
3. Repair removed writer import and deleted isolation inventories using current boundaries and meaningful saved/temporary/store-opening controls; record any independent production gap rather than weakening tests. — ↩ rollbackable
4. Run serial focused verification, typecheck and needed compiled worker checks; document counts, cleanup, assertion mapping and sibling failures, then obtain human BUILD approval. — ↩ rollbackable

**Backward compat:** Tests/fixtures only. Current public error text/envelopes, APIs/IPC, token types, artifact formats, model roles and historical data stay unchanged. No data deletion, review restoration, shim exports or production policy bypass.

## 6. Alternatives considered

### 6.1 a1: Migrate tests to current contracts — **CHOSEN**

Separate unavailable-review assertions from supported transport, worker, history and persistence controls.

Keep review production behavior unchanged. Replace obsolete model-label/execution/token assumptions with exact family-specific rejection and pre-work assertions. Rehome generic transport/lifecycle/worker assertions onto supported analyze/workflow/model operations or test-only handlers. Replace deleted fixture inventory entries with current real suites, and replace removed persistence writer imports with supported guarded storage calls while retaining canary and saved positive controls.

### 6.2 a2: Compatibility shims for old review fixtures

Reintroduce old review tokens/writer exports solely to keep historical tests running.

Provide compatibility functions and retained routes that emulate removed review behavior so unchanged tests still receive execution-shaped results.

**Rejected because:** Production shims contradict the retired contract.

### 6.3 a3: Delete or skip obsolete tests

Drop any failing test that references review.

Remove review-related suites and their isolation/persistence entries without establishing equivalent current controls.

**Rejected because:** Deletion/skip is not equivalent retained-history or isolation evidence.

## 7. References

- **[[c1]]** `code` `src/workflow/review-unavailable.ts`
- **[[c2]]** `code` `src/workflow/__tests__/review-retirement-workflow.test.ts`
- **[[c3]]** `code` `src/daemon/steps/__tests__/fixtures/task-persistence.ts`
- **[[c4]]** `prior-artifact` `docs/standalone/align-historical-tests-retired-review-contract-E2026112003bd8497/ISSUE.md`
- **[[c5]]** `code` `src/db/graph/__tests__/no-live-store-in-tests.test.ts`
- **[[c6]]** `code` `src/workflow/review-history/index.ts`
- **[[c7]]** `analyze-bundle` `s1.analyzeBundles[0]`
