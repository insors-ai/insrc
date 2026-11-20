<!-- insrc:artifact PLAN-03bd849749a52b41-s1 -->

# Plan: STORY-03bd849749a52b41-s1

## Summary

**Epic:** `align-historical-tests-retired-review-contract`
**LLD run:** `wf-1795162828625-eehjjh`
**LLD effective hash:** `0c2d5db0d8b7...`

Migrate obsolete review tests in five focused tasks while preserving transport, worker/token, persistence, isolation and retained-history/lifecycle controls. Run current baselines and map each valid old assertion to a surviving control; no production review implementation or compatibility shim is added.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Migrate review boundary and client assertions | M | — | — | integration: Retired review surfaces reject before argument inspection, providers or IO; integration: Generic client progress, synchronous errors and abort drains retain coverage on supported handlers; integration: Review-only label assertions reflect unavailable execution without changing active role tier tests | [[c1]] [[c2]] |
| 2 | **`t2`** Migrate worker routing and token lifecycle fixtures | M | — | `t1` | integration: Supported worker tokens survive idle release and preserve session isolation while retired kinds reject | [[c1]] [[c2]] |
| 3 | **`t3`** Repair current persistence fixture entry points | M | — | `t1` | integration: Temporary persistence canaries remain absent while saved artifact and history controls persist | [[c1]] [[c3]] |
| 4 | **`t4`** Replace deleted review isolation inventory entries | M | — | `t1`, `t2`, `t3` | integration: Current isolation inventories execute real tests and detect deliberate default-store opening | [[c3]] [[c4]] |
| 5 | **`t5`** Validate preserved history and publish Batch 04 evidence | S | — | `t1`, `t2`, `t3`, `t4` | integration: Retained review history and human lifecycle gates remain readable and enforced; smoke: Batch 04 assertion mapping, actual focused results and actor closure are recorded | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] |

### 1.1 TASK-03bd849749a52b41-s1-t1 — Migrate review boundary and client assertions

Capture focused baseline and assertion map; align review-specific labels, lifecycle wiring, in-daemon client and MCP checks with exact unavailable responses. Move valid generic transport assertions to supported or explicit test-only handlers.

**Acceptance checks:**
- Retired design/code surfaces reject with exact current family response before poisoned-argument reads, providers or IO; no synthetic success on review-named surfaces.
- Progress/done, synchronous throws, cancellation/drain and cwd/repo lookup retain equivalent positive controls on supported/test-only generic methods.
- Review-only label expectations change without weakening active model-role tier assertions or modifying production review/RPC classification.
- Record baseline and old-assertion→current-control mapping; preserve meaningful assertions rather than skipping/deleting suites.

### 1.2 TASK-03bd849749a52b41-s1-t2 — Migrate worker routing and token lifecycle fixtures

Update indexing-port, router-session and s3 acceptance review assumptions to current supported operations/kinds while preserving worker ownership and session lifecycle coverage.

**Acceptance checks:**
- Current analyze/workflow token mint/read/update behavior survives idle worker release, with session isolation and old-token semantics preserved.
- Retired review/code-review kinds reject without fabricated tokens; no worker/provider review execution restored.
- Supported routing/indexing-port controls retain worker identity and shared/session placement evidence using real workers where the original test requires them.
- Use bounded readiness, owned worker cleanup and fresh focused baseline; classify unrelated RPC/mutable-state failures separately without editing production method tables.

### 1.3 TASK-03bd849749a52b41-s1-t3 — Repair current persistence fixture entry points

Remove the deleted provenance writer import and map its valid assertions to current guarded boundaries/sinks and saved artifact/history controls, preserving the complete canary matrix.

**Acceptance checks:**
- Persistence fixture imports current modules and executes real assertions rather than failing during module loading.
- Temporary task/report/checkpoint/history/trace/cache/vector canaries remain absent from durable sinks; hostile getters remain unread at boundaries that guarantee preflight rejection.
- Saved artifact/history/cache/trace positive controls demonstrably persist and read back; no fake review records or resurrected writer export.
- Document replacement assertion mapping; if current APIs expose an independent production defect, triage it separately and do not weaken the test or claim green.

### 1.4 TASK-03bd849749a52b41-s1-t4 — Replace deleted review isolation inventory entries

Update store-isolation inventories to exercise current real coverage after the repaired fixtures are available. Preserve default-path negative evidence and deliberate-opening positive controls for graph and vectors.

**Acceptance checks:**
- Each removed fixture entry has a mapped current test/control, with real child execution proven by exit status and TAP cases; empty, skipped-only or failed child runs cannot prove isolation.
- Isolated HOME is established before application imports, and no live default LMDB/Lance artifact is created by the applicable current fixtures.
- Deliberate default-store-opening positive controls remain and prove the audit can detect violations.
- Only review-related inventory drift changes; unrelated failing fixture contracts remain visible in evidence rather than being removed or reclassified to force a pass.
- Replacement suites contain named applicable assertions with positive TAP counts and verified normal cleanup; forced exit alone never proves closure or isolation.

### 1.5 TASK-03bd849749a52b41-s1-t5 — Validate preserved history and publish Batch 04 evidence

Run final focused groups sequentially, verify retained history and human lifecycle/integrity guarantees, and record actual outcomes, assertion mappings, cleanup and remaining sibling failures.

**Acceptance checks:**
- All seven LLD test subjects and ac1–ac4 map to actual test evidence; current retained history/rendering, human approval, integrity and task/build completion controls pass without fake review entries.
- Root typecheck and appropriate source/compiled checks run under supported Node22 with exact pass/fail/skip/cancel counts and confirmed actor closure; no overlapping broad sweeps.
- Audit and batch index preserve original observations, replacement mappings and remaining defects; do not claim green for failed/incomplete cases or refresh qualification evidence.
- Document unchanged production behavior/API/data and visual relevance; no new review implementation, RPC classification, deprecated IDE compatibility or untracked production fix.
- Any independent defect that prevents an acceptance check leaves that task non-green until resolved through an approved tracked path; final evidence distinguishes completed and blocked work.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| Retired review surfaces reject before argument inspection, providers or IO | `t1` |
| Generic client progress, synchronous errors and abort drains retain coverage on supported handlers | `t1` |
| Supported worker tokens survive idle release and preserve session isolation while retired kinds reject | `t2` |
| Temporary persistence canaries remain absent while saved artifact and history controls persist | `t3` |
| Current isolation inventories execute real tests and detect deliberate default-store opening | `t4` |
| Retained review history and human lifecycle gates remain readable and enforced | `t5` |
| Review-only label assertions reflect unavailable execution without changing active role tier tests | `t1` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/align-historical-tests-retired-review-contract-E2026112003bd8497/S001/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/standalone/align-historical-tests-retired-review-contract-E2026112003bd8497/S001/LLD.md#3-error-paths`
- **[[c3]]** `prior-artifact` `docs/standalone/align-historical-tests-retired-review-contract-E2026112003bd8497/S001/LLD.md#4-test-strategy`
- **[[c4]]** `prior-artifact` `docs/standalone/align-historical-tests-retired-review-contract-E2026112003bd8497/S001/LLD.md#5-migration`
- **[[c5]]** `prior-artifact` `docs/standalone/align-historical-tests-retired-review-contract-E2026112003bd8497/S001/LLD.md#4-test-strategy`
