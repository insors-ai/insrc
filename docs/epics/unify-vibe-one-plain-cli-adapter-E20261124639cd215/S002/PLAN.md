<!-- insrc:artifact PLAN-639cd2159a87aedb-s2 -->

# Plan: STORY-639cd2159a87aedb-s2

## Summary

**Epic:** `unify-vibe-one-plain-cli-adapter`
**LLD run:** `wf-1795755966936-1ybaxj`
**LLD effective hash:** `67d59677de6a...`

Building this Story turns src/shared/vibe-adapter.ts's placeholder read-only refusal into a live, qualified, and live-enforced authorization. Most of the work is one file: a new capability type and cache, a read-only argv branch with a stable cache key that survives the per-turn temp-dir churn, a standalone live-qualification probe suite with bounded retry and structural (never mutating) evidence, and the wiring that makes startTurn and readOnlySessionOnce actually use it. A failed live proof against the real binary is an accepted terminal outcome, not a blocking defect. One task is pure process: filing the HLD amendment this Story's own LLD already proposed but that was never tracked as a standalone artifact.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Stories covered:** `s1`

s1 built and landed sc1/sc2, matching their HLD interfaceSketches exactly, and left s2's own contract (sc3) as a pure placeholder refusal with no read-only buildArgv branch and no signal/deadline forwarding in readOnlySessionOnce. s2's work is genuinely greenfield within its own boundary (confirmed this round by direct re-read of the current file, not just the LLD's own claim); s1's BUILD was approved with a disclosed full-sweep gap (t7) and an unrelated documentation-only discrepancy, neither touching sc3. readExitEvidence (confirmed read this round) is the exact existing internal helper s2's qualification suite and post-dispatch fingerprint check reuse directly, in-module.

**Sources:**
- src/shared/vibe-adapter.ts:639-665
- src/shared/vibe-adapter.ts:302-318
- src/shared/vibe-adapter.ts:365-375
- src/agent/providers/cli-provider.ts:866-941
- .insrc/artifacts/BUILD-639cd2159a87aedb-s1.json
- docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S001/BUILD.md

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add ReadOnlyCapability type and the stableDescriptorHash-keyed qualification cache | S | — | — | unit: stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache | [[c1]] |
| 2 | **`t2`** Add buildArgv's read-only branch and the stable-descriptor computation | M | — | `t1` | unit: stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache; unit: buildArgv's read-only branch emits exactly the two connector_insrc_* flags and no approval flag; integration: the recorded argv matching buildArgv's own values exactly except outputDir | [[c2]] |
| 3 | **`t3`** Implement the live qualification suite | L | — | `t1` | unit: effectiveConfigFingerprint extraction from a fake export.json at qualification time; a missing/unparsable export.json fails qualification closed; unit: concurrent cache misses for the identical stable descriptor coalescing into one in-flight qualification promise; unit: the allow-side probe's bounded retry tolerating simulated connector-not-registered attempts; unit: structural catalog evidence: exclusion/denial of a disallowed tool passes qualification; exclusion/denial of a REQUIRED tool fails it -- the reconciled polarity; unit: a genuine bypass-absence failure (a disallowed tool actually completes) failing qualification immediately, never retried; integration: the VibeReadOnlyUnavailableError path when probes exhaust the retry bound or export.json is unusable; live: the allowed-tool execution proof: a confirmed completed-call effect row for insrc_analyze and insrc_analyze_step under --enabled-tools connector_insrc_insrc_analyze/connector_insrc_insrc_analyze_step, tolerating connector flakiness via bounded retry -- an unresolved result here is accepted as 'stays unavailable', per review r3 finding 4, not a test failure; live: the blocked-tool proof via structural catalog enumeration (no actual write attempted); live: the blanket-bypass absence proof via catalog enumeration; live: the ac4 no-mutation proof via structural catalog evidence that write/bash tools are absent or denied, never via an actual write under the production profile; live: the export.json effective-config fingerprint actually present and parsable on a real run | [[c3]] |
| 4 | **`t4`** Wire createVibeAdapter to populate the readOnly field from the cache | S | — | `t1`, `t3` | integration: the cache-miss-on-descriptor-change path when the binary content or pinned env changes | [[c4]] |
| 5 | **`t5`** Wire startTurn's read-only dispatch and post-dispatch fingerprint invalidation | M | — | `t2`, `t3`, `t4` | unit: a qualified dispatch whose own export.json diverges from the cached fingerprint invalidating the entry while still returning its own result; unit: startTurn's mode:'read-only' branch re-checking the cache by stableDescriptorHash at dispatch time; integration: a scripted post-dispatch export.json mismatch invalidating the cache for the NEXT call while the current call's result is unaffected; integration: the VibeReadOnlyUnavailableError path when probes exhaust the retry bound or export.json is unusable | [[c5]] |
| 6 | **`t6`** Wire readOnlySessionOnce's vibe branch to await the dispatched turn | S | — | `t5` | integration: readOnlySessionOnce's vibe branch returning the schema-validated answer on a qualified capability; integration: the recorded argv matching buildArgv's own values exactly except outputDir; integration: the VibeReadOnlyUnavailableError path when probes exhaust the retry bound or export.json is unusable; integration: the capabilityPolicy precondition refused before readOnlySessionOnce is reached | [[c6]] |
| 7 | **`t7`** File the HLD amendment for sc3's provenAgainst field shape | S | — | — | smoke: the filed amendment exists as a tracked AMD-* artifact for sc3's provenAgainst rename and is readable via the workflow's own amendment listing | [[c7]] |

### 2.1 TASK-639cd2159a87aedb-s2-t1 — Add ReadOnlyCapability type and the stableDescriptorHash-keyed qualification cache

Add the ReadOnlyCapability interface (status, allowedTools, reason?, provenAgainst: { stableDescriptorHash, effectiveConfigFingerprint } | undefined) to src/shared/vibe-adapter.ts, plus a module-level cache keyed by stableDescriptorHash. No behavior wiring yet -- this is the type/data-structure foundation the rest of the Story builds on.

**Acceptance checks:**
- ReadOnlyCapability type matches sc3's amended interfaceSketch (stableDescriptorHash, effectiveConfigFingerprint) exactly, not the HLD's stale field names
- The cache is a module-level Map (or equivalent) keyed by stableDescriptorHash, empty at module load

### 2.2 TASK-639cd2159a87aedb-s2-t2 — Add buildArgv's read-only branch and the stable-descriptor computation

Add a request.mode==='read-only' branch inside buildArgv (src/shared/vibe-adapter.ts:365) that emits exactly the two connector_insrc_* allow flags and no approval flag, plus a stableDescriptorHash function that hashes buildArgv's own output with --output-dir excluded, the binary's resolved content identity, the adapter's pinned env subset, and cwd.

**Acceptance checks:**
- buildArgv's read-only branch emits exactly the two connector_insrc_* flags and no approval flag, for any approval value (read-only requests with an approval setting are already rejected upstream by startTurn)
- stableDescriptorHash is identical across two calls differing only in --output-dir (confirmed: buildArgv mints a fresh mkdtemp() path into --output-dir on every call per vibe-adapter.ts:365-375,470,481-482)
- stableDescriptorHash changes when the binary content identity, pinned env subset, or cwd changes

### 2.3 TASK-639cd2159a87aedb-s2-t3 — Implement the live qualification suite

Implement a standalone function that runs the bounded-retry allow-side probe (insrc_analyze / insrc_analyze_step reachable and completing), the immediate-fail deny/bypass probes using structural catalog evidence with the reconciled pass/fail polarity (a REQUIRED tool's exclusion/denial fails qualification; a DISALLOWED tool's exclusion/denial passes it; an actual bypass-absence failure -- a disallowed tool completing -- fails immediately, never retried), and export.json fingerprint extraction (readExitEvidence, reused in-module) with fail-closed behavior on a missing/unparsable export. Concurrent qualification requests for the same stable descriptor are coalesced into one in-flight probe run.

**Acceptance checks:**
- The allow-side probe retries a bounded number of times on simulated connector-not-registered failures, then reports 'unavailable' with the reason if still unresolved
- A structural catalog exclusion/denial of a disallowed tool PASSES qualification; exclusion/denial of a REQUIRED tool FAILS it
- A genuine bypass-absence failure (a disallowed tool actually completes) fails qualification immediately with no retry
- A missing or unparsable export.json fails qualification closed, never silently treated as passing
- effectiveConfigFingerprint is extracted from a successful qualification probe's own export.json
- Two concurrent calls that miss the cache for the identical stable descriptor share one in-flight qualification promise rather than running the probe suite twice

### 2.4 TASK-639cd2159a87aedb-s2-t4 — Wire createVibeAdapter to populate the readOnly field from the cache

Add the readOnly field to the object createVibeAdapter (src/shared/vibe-adapter.ts:639) returns, populated synchronously from the qualification cache by stableDescriptorHash computed for this context.

**Acceptance checks:**
- VibeExecutionAdapter.readOnly reflects the cached capability for this adapter's stable descriptor
- A cache miss on first construction triggers qualification (via t3's suite) before readOnly is populated

### 2.5 TASK-639cd2159a87aedb-s2-t5 — Wire startTurn's read-only dispatch and post-dispatch fingerprint invalidation

Replace startTurn's mode:'read-only' placeholder throw (src/shared/vibe-adapter.ts:653-656) with: re-check the cache by stableDescriptorHash at dispatch time, dispatch via buildArgv's read-only branch (t2) when 'qualified', throw VibeReadOnlyUnavailableError with the recorded reason when 'unavailable'; after a qualified dispatch completes, compare its own export.json against the cached effectiveConfigFingerprint and invalidate the cache entry on a mismatch (the completed turn's own result is unaffected by the mismatch).

**Acceptance checks:**
- A read-only request with a 'qualified' cached capability dispatches via buildArgv's read-only branch and returns the schema-validated result
- A read-only request with an 'unavailable' cached capability throws VibeReadOnlyUnavailableError carrying the cached reason, without spawning a process
- A qualified dispatch whose own export.json diverges from the cached effectiveConfigFingerprint invalidates the cache entry for the NEXT call, while the current call's own result is returned unaffected

### 2.6 TASK-639cd2159a87aedb-s2-t6 — Wire readOnlySessionOnce's vibe branch to await the dispatched turn

In src/agent/providers/cli-provider.ts's readOnlySessionOnce, replace the vibe branch's current 'unreachable' throw with: call startTurn with mode:'read-only', await its result with the absolute deadline already computed at call entry, and parse the result against the caller's schema.

**Acceptance checks:**
- readOnlySessionOnce's vibe branch returns the schema-validated answer on a qualified capability, end to end
- readOnlySessionOnce's vibe branch surfaces VibeReadOnlyUnavailableError (with its reason) when the capability is unavailable, rather than throwing 'unreachable'
- The absolute deadline computed once at call entry is honored even while waiting on a shared/in-flight qualification

### 2.7 TASK-639cd2159a87aedb-s2-t7 — File the HLD amendment for sc3's provenAgainst field shape

File the HLD-amendment proposal (sharedContract.rename on sc3, breaking: true, replacing { binaryVersion, effectivePolicy } with { stableDescriptorHash, effectiveConfigFingerprint }) as a tracked artifact, reconciling the HLD document with this Story's own LLD shape. Non-code: a process/documentation action, not gated by t1-t6's implementation.

**Acceptance checks:**
- The HLD amendment proposal for sc3's provenAgainst field rename is filed as a tracked artifact (previously raised by this Story's own LLD and again by s6's reconciliation Story, but never tracked as a standalone AMD-* artifact per this session's direct verification)
- The filed amendment's rationale cites both this Story's LLD section 4.1-4.2 and s6's already-approved reconciliation LLD

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache | `t1`, `t2` |
| effectiveConfigFingerprint extraction from a fake export.json at qualification time; a missing/unparsable export.json fails qualification closed | `t3` |
| a qualified dispatch whose own export.json diverges from the cached fingerprint invalidating the entry while still returning its own result | `t5` |
| concurrent cache misses for the identical stable descriptor coalescing into one in-flight qualification promise | `t3` |
| the allow-side probe's bounded retry tolerating simulated connector-not-registered attempts | `t3` |
| structural catalog evidence: exclusion/denial of a disallowed tool passes qualification; exclusion/denial of a REQUIRED tool fails it -- the reconciled polarity | `t3` |
| a genuine bypass-absence failure (a disallowed tool actually completes) failing qualification immediately, never retried | `t3` |
| startTurn's mode:'read-only' branch re-checking the cache by stableDescriptorHash at dispatch time | `t5` |
| buildArgv's read-only branch emits exactly the two connector_insrc_* flags and no approval flag | `t2` |
| readOnlySessionOnce's vibe branch returning the schema-validated answer on a qualified capability | `t6` |
| the recorded argv matching buildArgv's own values exactly except outputDir | `t2`, `t6` |
| the VibeReadOnlyUnavailableError path when probes exhaust the retry bound or export.json is unusable | `t3`, `t5`, `t6` |
| the cache-miss-on-descriptor-change path when the binary content or pinned env changes | `t4` |
| a scripted post-dispatch export.json mismatch invalidating the cache for the NEXT call while the current call's result is unaffected | `t5` |
| the capabilityPolicy precondition refused before readOnlySessionOnce is reached | `t6` |
| the allowed-tool execution proof: a confirmed completed-call effect row for insrc_analyze and insrc_analyze_step under --enabled-tools connector_insrc_insrc_analyze/connector_insrc_insrc_analyze_step, tolerating connector flakiness via bounded retry -- an unresolved result here is accepted as 'stays unavailable', per review r3 finding 4, not a test failure | `t3` |
| the blocked-tool proof via structural catalog enumeration (no actual write attempted) | `t3` |
| the blanket-bypass absence proof via catalog enumeration | `t3` |
| the ac4 no-mutation proof via structural catalog evidence that write/bash tools are absent or denied, never via an actual write under the production profile | `t3` |
| the export.json effective-config fingerprint actually present and parsable on a real run | `t3` |

## 4. References

- **[[c1]]** `prior-artifact` `LLD s2 migrationSteps order 1 (ReadOnlyCapability type + stableDescriptorHash-keyed cache)`
- **[[c2]]** `prior-artifact` `LLD s2 migrationSteps order 2 (buildArgv read-only branch + stable-descriptor computation)`
- **[[c3]]** `prior-artifact` `LLD s2 migrationSteps order 3 (live qualification suite)`
- **[[c4]]** `prior-artifact` `LLD s2 migrationSteps order 4 (createVibeAdapter readOnly field wiring)`
- **[[c5]]** `prior-artifact` `LLD s2 migrationSteps order 5 (startTurn read-only dispatch + fingerprint invalidation)`
- **[[c6]]** `prior-artifact` `LLD s2 migrationSteps order 6 (readOnlySessionOnce vibe-branch wiring)`
- **[[c7]]** `prior-artifact` `LLD s2 migrationSteps order 7 (HLD amendment filing for sc3's provenAgainst rename)`
