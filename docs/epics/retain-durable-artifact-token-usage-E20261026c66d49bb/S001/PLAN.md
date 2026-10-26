<!-- insrc:artifact PLAN-c66d49bb81925886-s1 -->

<!-- governing-native-coverage-v1 -->
> **Governing user-approved scope decision, 2026-10-27.** Complete-leaf replacement is rejected in v1 with `native-coverage-unverified`; retain explicit aggregate fallback. This supersedes contrary complete-leaf success expectations below. Native invocation coverage needs a later schema/design extension. Canonical provenance: `.insrc/artifacts/PLAN-c66d49bb81925886-s1.feedback.jsonl`, entry `user-decision-native-coverage-v1-plan`, and its revision-less scope-decision log entry. The original approved revision and its approval history are retained; this records the subsequent explicit user instruction, not a new automatic artifact approval.


# Plan: STORY-c66d49bb81925886-s1

## Summary

**Epic:** `retain-durable-artifact-token-usage`
**LLD run:** `wf-1793015298554-i9ai1b`
**LLD effective hash:** `eaf9512e2067...`

Build the first story's pure usage-accounting foundation in dependency order: typed facts and schemas, safe source identity and attribution validation, bounded deterministic reduction, then effective ownership and qualified source evidence. Finish by composing the public contracts and proving that packaged schemas and all six acceptance criteria work without provider capture, filesystem ledgers or daemon reporting.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define immutable usage and attribution types | M | approved r1 | — | integration: src/workflow/usage/__tests__/schema-contract.test.ts: compiler-backed valid/invalid v1 discriminator fixtures and HLD sc1/sc2 plus AMD-1 type compatibility | [[c1]] [[c2]] |
| 2 | **`t2`** Add versioned logical and Avro schemas | M | approved r1 | `t1` | unit: src/workflow/usage/__tests__/schema-contract.test.ts: closed logical schema and in-memory typed Avro round-trips, null defaults, exact counters and illegal payload cases | [[c1]] [[c3]] |
| 3 | **`t3`** Implement bounded canonical source identity | M | approved r1 | `t1` | unit: src/workflow/usage/__tests__/identity.test.ts: source equality versus server metadata, owner/payload conflicts, canonical key order and unsafe getter/prototype/cycle/Unicode/limit inputs | [[c1]] [[c4]] |
| 4 | **`t4`** Validate record, scope and capability boundaries | M | approved r1 | `t2`, `t3` | unit: src/workflow/usage/__tests__/validation.test.ts: closed shape/version/digest/counter/quality rules and scope evidence refusals; unit: src/workflow/usage/__tests__/source-capabilities.test.ts: malformed/unqualified declarations cannot claim native completeness | [[c1]] [[c3]] [[c4]] [[c5]] |
| 5 | **`t5`** Implement charged-subject attribution policy | M | approved r1 | `t1`, `t4` | unit: src/workflow/usage/__tests__/attribution.test.ts: full positive/negative charged-subject table, context inheritance and non-additive reference cases | [[c1]] [[c2]] [[c6]] |
| 6 | **`t6`** Build bounded group reduction and exact totals | M | approved r1 | `t4`, `t5` | unit: src/workflow/usage/__tests__/reducer.test.ts: bounded unique/input accounting, exact bigint metrics and known/estimated/pending/unavailable partitions; integration: src/workflow/usage/__tests__/domain-contract.test.ts: truncated closure, iterator failure/cancellation, duplicate flood and no successful resource-truncated total | [[c1]] [[c4]] [[c5]] |
| 7 | **`t7`** Resolve correction and aggregate observation bases | M | approved r1 | `t6` | unit: src/workflow/usage/__tests__/reconciliation.test.ts: replacement corrections, forks/cycles/missing refs, aggregate fallback/decomposition and stale/new candidate invalidation; unit: src/workflow/usage/__tests__/reducer.test.ts: shuffled complete groups and repeated delivery retain deterministic basis/totals | [[c1]] [[c5]] [[c7]] |
| 8 | **`t8`** Validate cumulative baseline intervals | M | approved r1 | `t7` | unit: src/workflow/usage/__tests__/reducer.test.ts: cumulative selected interval, reference-only cross-invocation baseline, common-baseline overlap, resets and model/session mismatches | [[c1]] [[c5]] [[c7]] |
| 9 | **`t9`** Expose effective ownership and transfer state | M | approved r1 | `t7`, `t8` | unit: src/workflow/usage/__tests__/transfer-state.test.ts: same-root single commitment, cross-root phase closure, pending/conflicting owner versions and typed effectiveOwners provenance/replay | [[c1]] [[c2]] [[c5]] [[c8]] |
| 10 | **`t10`** Qualify source capability evidence and fixtures | M | approved r1 | `t2`, `t4` | unit: src/workflow/usage/__tests__/source-capabilities.test.ts: version/source-evidence survey, Ollama absent counters, CLI aggregate/cumulative/unknown leaf and explicitly synthetic external-host cases | [[c1]] [[c5]] [[c9]] |
| 11 | **`t11`** Compose public contracts and verify packaged handoff | M | approved r1 | `t9`, `t10` | integration: src/workflow/usage/__tests__/domain-contract.test.ts: complete public domain surface, ownership/basis consistency, replay/permutation and no sibling side effects; integration: src/workflow/usage/__tests__/schema-contract.test.ts: isolated /tmp compiled-output imports with no source tree and matching schema digests; unit: src/workflow/__tests__/artifact-ids.test.ts: existing canonical identity regression suite; integration: npm run build and the focused src/workflow/usage/__tests__/*.test.ts suite pass or unrelated baseline blockers are explicitly identified | [[c1]] [[c2]] [[c3]] [[c4]] [[c5]] [[c6]] [[c7]] [[c8]] [[c9]] |

### 1.1 TASK-c66d49bb81925886-s1-t1 — Define immutable usage and attribution types

Add proposed src/workflow/usage/types.ts with HLD-compatible sc1/sc2 interfaces, closed v1 payload variants, normalized counters/quality, closure/capability evidence and AMD-1 effectiveOwners types. Export types only initially; preserve existing provider, identity and content contracts.

**Acceptance checks:**
- All usage/control discriminators and required/null payload combinations are represented without provider SDK types or mutable history.
- UsageBinding, attribution input and EffectiveAccounting retain approved signatures; effectiveOwners is optional for compatibility but fully typed, including unresolved states and immutable capture provenance.
- Safe-counter/sequence, ID, group and resource-limit constants are explicit. Existing ArtifactIds behavior is consumed unchanged.

### 1.2 TASK-c66d49bb81925886-s1-t2 — Add versioned logical and Avro schemas

Add proposed src/workflow/usage/ledger-record.v1.schema.json, src/workflow/usage/ledger-record.v1.avsc.json and src/workflow/usage/schemas.ts. Statically import JSON with ESM attributes, define typed nullable context/observation/control records and validate in-memory record encoding only.

**Acceptance checks:**
- Logical schema rejects unknown fields/kinds, illegal payload combinations, unsafe counts and invalid null/default shapes.
- Avro record fixtures round-trip exact safe counters, nullable model/counter fields and both transfer modes without opaque transcript blobs.
- Production imports cause schema JSON emission under NodeNext/resolveJsonModule; no source-tree fs lookup, Avro file/header writer or copy-assets assumption is introduced.

### 1.3 TASK-c66d49bb81925886-s1-t3 — Implement bounded canonical source identity

Implement proposed src/workflow/usage/canonical.ts for strict safe-data traversal, canonical source bytes and the usage-specific digest. Ignore only service-assigned sequence/recordedAt/digest; keep capture owner and all typed source payload in identity.

**Acceptance checks:**
- Reordered object keys produce equal identity; changed source payload/owner is different; changing only service metadata does not create another source event.
- Object inputs use one central usage-domain safe snapshot/serialization boundary; getters/toJSON/custom prototypes/cycles/sparse arrays/symbols/undefined/invalid Unicode and unsafe values are rejected without invoking hooks. Traversal, retained bookkeeping and output are bounded; initial JavaScript own-key enumeration allocation is excluded. Oversized arrays are rejected before key enumeration.
- 16 KiB/depth/node limits and the exact domain-separated SHA-256 format are enforced; existing lifecycle/design-corpus canonicalizers remain unchanged.

### 1.4 TASK-c66d49bb81925886-s1-t4 — Validate record, scope and capability boundaries

Implement proposed src/workflow/usage/validation.ts and pure capability-declaration validation in src/workflow/usage/capabilities.ts. Combine safe-data guards, closed schemas, digest checks, counter quality and typed closure evidence, with stable notice/error codes.

**Acceptance checks:**
- Malformed/version-unknown inputs yield explicit notices rather than silent zero; no getter/prototype side effects reach schema evaluation.
- Reported, estimated, unavailable and pending constraints, disjoint counters, reasoning subset and safe integer limits match approved rules.
- Closed scope evidence validates expected IDs/count/set digest, reference-only roles, capability evidence and binding versions; a completeness boolean alone is insufficient.
- Capability claims without version/source evidence remain unqualified; structural validation does not claim root ownership, authorization or native physical-call completeness.

### 1.5 TASK-c66d49bb81925886-s1-t5 — Implement charged-subject attribution policy

Implement proposed src/workflow/usage/attribution.ts with the mandatory normalized activity table and supplied binding consistency checks. Consume ArtifactIds syntax/kinds without resolving actual repository roots or instrumenting dispatch.

**Acceptance checks:**
- DEF/HLD/LLD/PLAN/TASK/BUILD/ISSUE/SPEC and nested context positive cases charge the exact approved subject.
- Design reviews require the reviewed LLD; task work/validation requires its TASK; shared validation/code review requires story BUILD. CR/TASKS/summary references never add charges.
- Wrong kind/hash/story/task/subject, missing parent context and unsupported activities produce explicit notices without root fallback, registry changes or provider calls.

### 1.6 TASK-c66d49bb81925886-s1-t6 — Build bounded group reduction and exact totals

Implement the core of proposed src/workflow/usage/reducer.ts: bounded collection, event/call identity consistency, closure checks, deterministic notice ordering and exact reported/estimated metric partitions. Keep incomplete behavior internal until final composition; do not publish a stubbed reducer API.

**Acceptance checks:**
- Validate at most 1024 records/8 MiB per group and compare unique input IDs/count/digest to the expected descriptor; duplicate delivery is non-additive.
- Exact bigint accumulation returns decimal strings, including safe-input sums beyond Number.MAX_SAFE_INTEGER; reasoning is never added twice.
- Known zero, partial counters, pending/interrupted/unavailable/legacy/missing and failed calls with reported consumption remain distinct.
- Iterator failure/cancellation or resource overflow rejects with no successful partial total; frozen input remains unchanged.
- Count every received row and canonical byte against the processing budget, including identical replay floods; separately compare unique IDs/count/digest for closure.

### 1.7 TASK-c66d49bb81925886-s1-t7 — Resolve correction and aggregate observation bases

Extend private reducer graph/basis logic for terminal/correction heads and explicit aggregate/leaf reconciliation. Preserve originals, validate current candidate sets and surface missing/forked/cyclic/conflicting references.

**Acceptance checks:**
- Out-of-order complete closure is permutation-invariant; missing starts/predecessors, multiple unlinked finishes, correction forks/cycles and cross-group references cannot select a speculative winner.
- A full replacement correction contributes once; selected/excluded observation heads are unique/disjoint and account for the current candidate set.
- Aggregate fallback and qualified complete-leaf decomposition never overlap; partial leaves cannot manufacture residuals or a physical-call count.
- New candidates or stale corrected heads invalidate an old reconciliation until an explicit successor covers them.

### 1.8 TASK-c66d49bb81925886-s1-t8 — Validate cumulative baseline intervals

Extend reducer basis logic for qualified cumulative evidence: select one endpoint/baseline interval, allow explicitly reference-only prior-invocation baselines and prevent overlapping deltas from being added.

**Acceptance checks:**
- Baseline, intermediate frames and reference-only records do not add consumption; two endpoints sharing a baseline are overlapping candidates, not two charges.
- Same-session/model-slice monotone fixtures produce exact disjoint counter deltas only for the selected validated interval.
- Missing/reset/different-session/model or unknown bucket baselines yield explicit unknown/partial outcomes; no timestamp winner or cross-session subtraction.
- Cross-invocation baselines are accepted only under declared reference-only closure and qualified native session/model evidence.

### 1.9 TASK-c66d49bb81925886-s1-t9 — Expose effective ownership and transfer state

Implement pure owner-version evaluation and the approved AMD-1 effectiveOwners result in the reducer. Separate same-root single commitments from cross-root prepared/accepted/committed reference chains; perform no transfer IO.

**Acceptance checks:**
- A valid same-root transfer.committed with null phase refs changes the effective artifact once; a cross-root commit requires its matching phase/closure evidence.
- Pending transfer retains the current committed owner; conflicting versions, cycles/forks or missing ownership proof produce explicit unresolved mappings, not destination charges.
- Every new result contains typed effectiveOwners tying call/basis to effective root/artifact/version, capture owner and provenance. Grouping consumers cannot fall back to capture IDs when mapping is absent.
- Replay is idempotent; no counters or original observations are copied/mutated. No root resolver, writer, lock or coordinator is introduced.

### 1.10 TASK-c66d49bb81925886-s1-t10 — Qualify source capability evidence and fixtures

Complete the source-capability survey and proposed src/workflow/usage/__tests__/fixtures/source-capabilities.v1.json using exact inspected source revisions/tool versions and sanitized contract envelopes. Extend capability validation fixtures without adding native adapters or live capture.

**Acceptance checks:**
- Survey records evidence/version, granularity, physical-call coverage, input/cache/reasoning conventions and qualification status for every entry.
- Ollama final/missing-counter/warm-up source cases preserve absent metrics; CLI/native leaf visibility is marked unknown unless qualified evidence proves it.
- Invocation aggregates, cumulative snapshots and synthetic external-host declarations cannot be relabeled complete physical calls; estimates cannot replace missing reported counters.
- No transcripts/credentials or historical backfill are retained; no provider, controller-host or daemon telemetry implementation is added.

### 1.11 TASK-c66d49bb81925886-s1-t11 — Compose public contracts and verify packaged handoff

Publish complete runtime implementations and schema/type exports from proposed src/workflow/usage/index.ts, then run the public domain-contract fixtures and compiled-output schema smoke checks. Validate the additive migration and sc1/sc2 handoff to later stories.

**Acceptance checks:**
- UsageReducer.validate/reduce and UsageAttributionPolicy.validate match approved HLD/LLD signatures and all six acceptance criteria pass through the public domain surface.
- No placeholder implementations, hidden filesystem/provider/DB side effects or sibling service activation remain; immutable source facts and typed effective ownership agree across replay/permutation fixtures.
- In a private /tmp fixture containing copied compiled usage/identity modules, package metadata and dependency access but no source tree, production exports load both schemas under the supported Node runtime. Do not move/delete workspace src; schema digests and record round-trips match source fixtures.
- Run npm run build, npx tsx --test 'src/workflow/usage/__tests__/*.test.ts' and npx tsx --test src/workflow/__tests__/artifact-ids.test.ts. Report unrelated baseline failures without scope expansion; document no data rewrite and optional-owner compatibility.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| LedgerRecord local shape and payload digests | `t2`, `t4` |
| Exact counters/quality bounds | `t4`, `t6` |
| Canonical payload equivalence and safe data traversal | `t3` |
| UsageAttributionPolicy activity/subject rules | `t5` |
| UsageReducer bounded group reduction | `t6`, `t11` |
| Correction/reconciliation reference graphs | `t7` |
| Cumulative interval basis and model/session baselines | `t8` |
| Transfer reference-state evaluation | `t9` |
| Versioned JSON schema and Avro record type catalog | `t1`, `t2`, `t11` |
| HLD-compatible public interfaces and unknown-version outcomes | `t1`, `t4`, `t11` |
| SourceCapability evidence declarations | `t4`, `t10` |
| Validating and reducing shuffled/replayed golden groups | `t7`, `t9`, `t11` |
| Complete versus truncated closure descriptors | `t6`, `t11` |
| Iterator error/cancellation and resource-bound outcomes | `t6`, `t11` |
| Input immutability and absence of sibling side effects | `t3`, `t6`, `t11` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/LLD.md`
- **[[c2]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/LLD.md#5-interaction-with-shared-contracts`
- **[[c3]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/LLD.md:116`
- **[[c4]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/LLD.md:148`
- **[[c5]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/LLD.md:156`
- **[[c6]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/LLD.md:175`
- **[[c7]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/LLD.md#6-error-paths`
- **[[c8]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/LLD.md:197`
- **[[c9]]** `prior-artifact` `docs/epics/retain-durable-artifact-token-usage-E20261026c66d49bb/S001/LLD.md:185`
