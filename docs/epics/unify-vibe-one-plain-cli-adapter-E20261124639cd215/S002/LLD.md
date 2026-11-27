<!-- insrc:artifact LLD-639cd2159a87aedb-s2 -->

# LLD: STORY-639cd2159a87aedb-s2 — Read-only Vibe sessions run the insrc analysis tools, or honestly report them unavailable

## Summary

**Epic:** `unify-vibe-one-plain-cli-adapter`
**HLD base run:** `wf-1795535373279-l4wumn`
**HLD effective hash:** `67d59677de6a...`
**Tracker:** [insors-ai/insrc#316](https://github.com/insors-ai/insrc/issues/316)

This Story turns the adapter's placeholder read-only refusal into a real, live-qualified, and LIVE-ENFORCED authorization. The qualification cache key is now a STABLE authorization descriptor that excludes the per-turn --output-dir value (confirmed by reading buildArgv's own source: it mints a fresh temp directory on every call), binds to the resolved binary's own content identity, and is additionally bound to an effective-config fingerprint read back from the binary's own export.json self-report -- checked post-hoc on every dispatch. The blocked-tool and write-refusal proofs use structural catalog evidence instead of a real write under the production profile, with the pass/fail polarity reconciled. A live-proof failure for either connector_insrc_* tool is an explicit, accepted 'stays unavailable' outcome.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Data model changes](#4-data-model-changes)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. Epic impact analysis

**Stories covered:** `s1`

s1 built and landed sc1/sc2, matching their HLD interfaceSketches exactly, and left s2's own contract (sc3) as a pure placeholder refusal with no read-only buildArgv branch and no signal/deadline forwarding in readOnlySessionOnce. s2's work is genuinely greenfield within its own boundary; s1's BUILD was approved with a disclosed full-sweep gap and an unrelated documentation-only discrepancy, neither touching sc3. s1's own buildArgv (confirmed read this round) is the exact function whose per-turn --output-dir behavior drives round 4's cache-key redesign.

**Sources:**
- src/shared/vibe-adapter.ts:639-665
- src/shared/vibe-adapter.ts:365-375
- src/shared/vibe-adapter.ts:470-482
- src/agent/providers/cli-provider.ts:866-941
- .insrc/artifacts/BUILD-639cd2159a87aedb-s1.json
- docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S001/BUILD.md

## 2. HLD context

> See **HLD-639cd2159a87aedb** § 2. Framework summary

**Rollout phase:** Phase B — Adapter consumers
**Owns:** `sc3` (Adapter-owned read-only authorization and its qualification evidence)
**Consumes:** `sc1` (Vibe execution adapter interface), `sc2` (Qualified insrc tool naming — general identity plus the analysis allowlist)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Everything behind the adapter interface: argv construction from the qualified 3.1.4 flag surface (headless mode selection, model and thinking pinning for NEW sessions, prompt transport through the programmatic input contract, budget-guard forwarding, the ordinary approval mapping — undefined/default→CLI defaults, manual→ask, edit-auto→accept-edits, auto→auto-approve, with the read-only request REJECTING any approval setting — exit-evidence parsing including the session's effective selection), the adapter-construction execution context with the DUAL process-group policy and per-turn cancellation (adapter-owned mode: the adapter leads a detached group and owns termination, escalation, descendant-exit confirmation and group cleanup on every exit path; supervisor-owned mode: the child inherits the caller's group, the supervisor owns escalation and sweeping, the adapter retains turn-scoped temporary-file cleanup only), transient-error classification and the bounded retry semantics shared with the claude/codex clients, the local schema-validation loop for structured-output requests, the tool-result output normalization (outputText/output, else error message, else reason — the existing chat precedence), the type-level resumed-session selection rule, and the deletion of src/shared/vibe-session.ts plus the rewiring of the backend provider paths (complete, completeStructured, runReadOnlySession's launch mechanics) and structured-output.ts onto the adapter. The read-only launch MODE exists from s1 but every 'read-only' request REFUSES before dispatch until the adapter's own qualification succeeds (s2) — the refusal reason is surfaced to the caller. — owns `sc1`, `sc2`
- `s3`: The chat surface migration: the vibe mapper and job runner become consumers of the adapter (argv and VIBE_ACTIVE_MODEL pinning deleted from the plugin; the worker's signal threads into the adapter's per-turn cancellation; the worker keeps its supervisor-owned process group and its forced-stop sweep), while the transcript rendering, streaming event mapping over the RICH events (tool-call identity and arguments for command correlation, tool-result OUTPUT content, session identity and resume-handle delivery), worker lifecycle, resume handles and attachments keep their existing behavior (lc2). Also internal: the live verifications whose outcomes s6 records — the approval parity cases (undefined/default, manual, edit-auto, auto map to the same tool policies the private launch path used today), the tool-result output parity fixture (actual output text, not only correlation and success/failure), the worker forced-termination and descendant-cleanup parity check under the supervisor-owned group, the prompt-transport check (multiline, option-like text), the resume round-trip including that a resumed turn preserves the session's model/thinking and that the tool rejects a selection change on a resumed session before dispatch, and the general-naming check that chat tool-activity rendering and insrc_present declarations parse through sc2's general identity.
- `s4`: The reader's internals: parse-for-understanding via the existing smol-toml dependency following the codex project-config guard's refuse-don't-rewrite precedent, the surgical byte-preserving edit engine (upsert/remove of exactly the insrc entry, comments and unrelated tables untouched), the refusal path for configs that cannot be changed safely, and the rewiring of the daemon's registration checks and cleanup (mcp-register) and the plugin's config writer (toml-mcp-writer) onto it — with src/shared/toml-inline-list.ts deleted. — owns `sc4`
- `s5`: The model-family alignment: catalog, registry, check and definitions entries for cli-vibe rebuilt to exactly the models and thinking levels the adapter honors (verified against the installed tool's catalog), the selection-delivery semantics through the adapter — new sessions take the selection, resumed sessions inherit and report — and the fail-before-dispatch error naming supported choices. No other story consumes these records; settings and tier resolution do.
- `s6`: The reconciliation work itself: verifying the chat prompt-transport fix, the approval parity cases, the tool-result output parity, the resume-selection behavior and the worker cleanup parity live with s3's evidence, checking catalog coverage, closing the implemented issues (read-only authorization via sc3's qualification evidence incl. its provenAgainst record, TOML parsing via sc4's story validation), stamping the review-dependent deferrals with their recorded dependency on the review rewrite, and attaching evidence to every closure.

## 3. Contract details

**Surface level:** internal-shared

### 3.1 `createVibeAdapter`

```typescript
function createVibeAdapter(context: VibeAdapterContext, deps: VibeAdapterDeps = {}): VibeExecutionAdapter
```

**Parameters:**
- `context: VibeAdapterContext` — Unchanged from sc1: fixes cwd/env/processGroup; the stable authorization descriptor (not the full per-turn argv) is now the read-only qualification cache key.
- `deps: VibeAdapterDeps` _(optional)_ — Unchanged from sc1: injectable spawn/mkdtemp/readFile/rm/command seams for testing.

**Returns:** `VibeExecutionAdapter` — Unchanged shape plus the new readOnly: ReadOnlyCapability field (sc3), populated synchronously from the current cache entry for this adapter's own stable descriptor -- never by blocking on a live subprocess inside this call.

**Errors:**
- `Error` when context.cwd is not an existing directory (unchanged pre-existing behavior).

**Preconditions:**
- Unchanged from sc1.

**Postconditions:**
- The returned adapter's readOnly field reflects the qualification cache's CURRENT entry for this exact stable descriptor.
- This function never awaits the live qualification suite.

### 3.2 `buildArgv`

```typescript
function buildArgv(request: VibeTurnRequest, outputDir: string): readonly string[]
```

**Parameters:**
- `request: VibeTurnRequest` — Unchanged.
- `outputDir: string` — Unchanged: a fresh mkdtemp() path on every call, confirmed by reading src/shared/vibe-adapter.ts:365-375,470,481-482 -- this is exactly why --output-dir is excluded from the stable descriptor rather than hashed verbatim.

**Returns:** `readonly string[]` — Unchanged for request.mode==='default'. For request.mode==='read-only', gains the fixed launch profile: --enabled-tools connector_insrc_insrc_analyze, --enabled-tools connector_insrc_insrc_analyze_step. No approval flag is added for read-only. The qualification suite and real dispatch both call this exact function, so the argv shape is always identical except for outputDir.

**Preconditions:**
- Unchanged.

**Postconditions:**
- This is the single place the read-only launch profile is constructed; the qualification suite and real dispatch spawn through this exact same function with the same request shape, differing only in outputDir.

### 3.3 `readOnlySessionOnce`

```typescript
readOnlySessionOnce(prompt: string, schema: StructuredSchema, exec: ExecOverride & { cwd: string; timeoutMs: number; watchStall: boolean; capabilityPolicy: 'write-sandboxed' | 'strict-read-analyze' }): Promise<T>
```

**Parameters:**
- `prompt: string` — Unchanged.
- `schema: StructuredSchema` — Unchanged.
- `exec: ExecOverride & { cwd: string; timeoutMs: number; watchStall: boolean; capabilityPolicy: 'write-sandboxed' | 'strict-read-analyze' }` — Unchanged. An absolute deadline is computed once at call entry and carried through any wait on a shared qualification.

**Returns:** `Promise<T>` — For kind 'vibe': the schema-validated structured answer from a successfully dispatched, qualified read-only turn. After the turn completes, its own export.json is checked against the cached effectiveConfigFingerprint; a mismatch invalidates the cache entry for subsequent calls but does not retroactively fail THIS already-completed turn's own answer.

**Errors:**
- `VibeReadOnlyUnavailableError` when readOnly.status is 'unavailable' for this exact stable descriptor -- surfaces readOnly.reason, which distinguishes a genuine policy/safety finding, a connector-flakiness retry exhaustion, or a missing/unparsable export.json self-report from each other.
- `VibeReadOnlyApprovalRejectedError` when Unchanged: a read-only request carrying any ordinary approval setting.

**Preconditions:**
- this.kind === 'vibe'.
- exec.capabilityPolicy === 'write-sandboxed' (unchanged).

**Postconditions:**
- The vibe branch awaits startTurn's result and parses it against schema, instead of throwing 'unreachable'.
- An expired or aborted wait on a shared qualification never proceeds to dispatch.

## 4. Data model changes

### 4.1 `ReadOnlyCapability` — new

sc3's interfaceSketch, AMENDED to replace provenAgainst's itemized fields with TWO authoritative identities: provenAgainst: { stableDescriptorHash: string; effectiveConfigFingerprint: string } | undefined. stableDescriptorHash hashes the resolved binary's real path + content identity, the launch-profile argv WITH outputDir excluded, the adapter's pinned env subset, and cwd -- stable across turns, unlike round 3's full-argv hash (buildArgv always bakes a fresh mkdtemp() path into --output-dir per turn, confirmed by reading src/shared/vibe-adapter.ts:365-375,470,481-482). effectiveConfigFingerprint is extracted from the qualification probe's own --output-dir export.json self-report -- the authoritative binding to the actual effective MCP-registration/policy state that static inputs alone cannot observe. A missing or unparsable export.json fails qualification closed. Every later qualified dispatch checks its own export.json against the recorded fingerprint post-hoc; a mismatch invalidates the cache entry immediately. The allow-side probe retries a bounded number of times to tolerate connector flakiness; structural catalog evidence that a required tool is excluded, or a disallowed tool is actually reachable, is never retried past.

**Call sites:**
- `src/shared/vibe-adapter.ts:639-665`
- `src/agent/providers/cli-provider.ts:866-941`

### 4.2 `VibeExecutionAdapter` — field-add

Adds the readOnly: ReadOnlyCapability field sc3 composes onto sc1's adapter shape. startTurn's mode:'read-only' branch re-checks the cache (by stableDescriptorHash) at dispatch time and dispatches via buildArgv's read-only branch when 'qualified'. After a qualified dispatch completes, its export.json is compared against the cached effectiveConfigFingerprint and a mismatch invalidates the entry.

**Call sites:**
- `src/shared/vibe-adapter.ts:639-665`
- `src/agent/providers/cli-provider.ts:547-563`
- `src/agent/providers/cli-provider.ts:866-941`
- `src/shared/vibe-adapter.ts:746-815`

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc3` | implements | s2 owns and builds sc3 in full: the stable authorization descriptor excluding turn-local argv (r3 finding 1), the effective-config fingerprint read back from the binary's own export.json self-report and checked post-hoc on every dispatch (r3 finding 2), the structural-catalog-evidence probe methodology with reconciled pass/fail polarity (r3 finding 3), and the explicit 'stays unavailable' acceptance for an unresolved live-proof or HLD amendment (r3 finding 4). |
| `sc1` | consumes | readOnly composes onto sc1's VibeExecutionAdapter; buildArgv's new read-only branch extends sc1's argv builder without touching VibeAdapterContext/VibeTurnRequest/VibeTurnEvent/VibeTurnResult. The stable descriptor is built FROM sc1's own buildArgv output with outputDir excluded, not a separate argv builder. |
| `sc2` | consumes | The launch profile's --enabled-tools values are vibe's own published-name form built FROM sc2's restricted VibeInsrcAnalysisToolId allowlist's two raw tool names; sc2's own journal spelling is a separate, display-only surface this launch profile does not use. |

## 6. Error paths

**Error cases**

- **stable descriptor computation throws (unresolvable binary real path, content-hash read failure, env serialization failure)** (recoverable)
  - Detection: hashing the stable descriptor's inputs throws before the qualification suite can run
  - Response: qualification for this descriptor fails closed to 'unavailable' with a reason naming the hashing failure; never falls back to an un-pinned or partial key
  - User impact: read-only analysis reports unavailable with a specific reason instead of silently using a weaker key
- **qualification probe's export.json is missing or unparsable** (recoverable)
  - Detection: the qualification probe completes but --output-dir's export.json cannot be read or does not parse as the expected shape
  - Response: qualification fails closed to 'unavailable' -- the effective-config fingerprint this design requires has no source, so it is never silently treated as unchanged
  - User impact: analysis is reported unavailable rather than trusting an unverifiable effective-config state
- **a qualified dispatch's own export.json diverges from the cached effectiveConfigFingerprint** (recoverable)
  - Detection: after the turn completes, its export.json's self-reported version/effective-config fields are compared against the entry's recorded fingerprint and differ
  - Response: the cache entry for this stable descriptor is invalidated immediately so the next read-only demand re-qualifies from scratch; the turn that just completed under the stale fingerprint still returns its own result, since the drift is detected, not prevented, and re-dispatching it would not undo what already ran
  - User impact: a one-turn delay before the system notices a config/MCP-registration drift and re-proves the authorization; the affected turn's own answer is unaffected
- **connector-flakiness retry succeeds within the bound** (recoverable)
  - Detection: early allow-probe attempts show the connector tool absent, a later attempt within the bound shows a confirmed completed call
  - Response: qualification proceeds to 'qualified'
  - User impact: analysis becomes available despite ambient flakiness
- **connector-flakiness retry exhausted** (recoverable)
  - Detection: every attempt within the bound shows the connector tool absent with no confirmed call
  - Response: qualification concludes 'unavailable' with a reason distinct from policy-denial
  - User impact: analysis reported unavailable with a reason distinguishing flakiness from a policy block
- **structural catalog evidence shows a disallowed tool excluded or denied** (terminal)
  - Detection: the disallowed tool never appears in the enabled-tool catalog enumeration under the pinned descriptor, or an attempted call to it returns a structural denial
  - Response: counts as a PASS toward qualification -- exclusion or denial of a tool OUTSIDE the two-tool allowlist is the correct, expected restriction
  - User impact: none directly; this is the evidence that strengthens an eventually-qualified capability
- **structural catalog evidence shows a REQUIRED allowed tool excluded or denied** (recoverable)
  - Detection: insrc_analyze or insrc_analyze_step never appears in the enabled-tool catalog enumeration, or an attempted call to either returns a structural denial, under the pinned descriptor
  - Response: counts as a FAIL -- the launch profile is not actually enabling the two tools it is supposed to, so qualification concludes 'unavailable' with a reason naming the missing/denied required tool; this is the polarity review r3 finding 3 required be reconciled
  - User impact: analysis correctly stays unavailable rather than claiming a qualification the launch profile cannot actually deliver
- **write/mutating-tool probe would otherwise execute in the production cwd** (terminal)
  - Detection: the qualification suite's design identifies any probe that could cause a real side effect under the production profile
  - Response: the suite never attempts a real write under the production profile; structural catalog evidence (the write/bash tool's absence from or denial in the enabled-tool catalog enumeration) is the proof for ac4, since a disposable-sub-path write still executes for real if the profile is accidentally permissive -- review r3 finding 3
  - User impact: ac4's no-mutation guarantee is proven without ever risking an actual mutation during the proof itself
- **bypass-absence failure** (terminal)
  - Detection: any probe under the pinned descriptor shows a tool outside the two-tool allowlist actually completing (not merely appearing available)
  - Response: qualification fails immediately to 'unavailable' with reason naming the bypassing tool; never retried, since this is a genuine safety finding, not flakiness
  - User impact: analysis is withheld rather than risk a broader-than-intended grant
- **cache miss on stable-descriptor change** (recoverable)
  - Detection: any pinned input (binary real path/content, argv minus outputDir, pinned env subset, cwd) differs from a cached entry's own descriptor
  - Response: treated as a cold miss: a synchronous 'unavailable' snapshot is returned immediately, and a fresh qualification run is kicked off in the background for the new descriptor
  - User impact: a brief window where analysis reports unavailable immediately after a config/binary change, until the fresh qualification completes
- **live proof of both connector_insrc_* tools completing does not succeed at build time** (recoverable)
  - Detection: the qualification suite's allow-side probe, after exhausting its bounded retry for ambient connector flakiness, still cannot obtain a confirmed completed call for insrc_analyze and/or insrc_analyze_step
  - Response: the capability is reported 'unavailable' with that reason -- this is an EXPLICIT, ACCEPTED outcome of this design, not a defect to be papered over; the feature ships honest-but-unavailable rather than a forced success (review r3 finding 4)
  - User impact: read-only analysis stays unavailable until a future qualification succeeds; no silent fallback to a broader grant
- **the sc3 HLD amendment for provenAgainst's new shape is not yet resolved** (recoverable)
  - Detection: the amendment proposed in this LLD has not been confirmed filed/approved as a tracked AMD artifact
  - Response: the evidence contract (sc3) is not claimed approved until that amendment resolves -- the LLD records this as an open item rather than assuming the proposal already landed
  - User impact: none to the running system; this governs when the design itself can be considered complete

**Edge cases**

| Input | Expected |
| :--- | :--- |
| concurrent cold misses for the identical stable descriptor | coalesced into one in-flight qualification promise; all waiters share its result |
| the same-path binary is replaced with different content | the stable descriptor's content-identity component changes, forcing a cold miss and fresh qualification -- unlike round 3's path-only binding |
| an adapter instance was constructed before a cache invalidation | always re-checks the shared module-level cache by its own stable descriptor at dispatch time (startTurn), never trusts a snapshot taken at construction time |
| a caller requests capabilityPolicy:'strict-read-analyze' for vibe | unreachable for readOnlySessionOnce's vibe branch -- refused earlier by the existing UnqualifiedCapabilityPolicyError gate, unchanged by this Story |
| two separate launches share the identical stable descriptor and effective-config fingerprint | the second launch reuses the cached 'qualified' proof without re-running the qualification suite -- this is the reuse review r3 finding 1 required the design to actually deliver |

**Invariants to preserve**

- A read-only session never executes a tool outside the two-tool insrc analysis allowlist, under any qualification state. [[c5]]
- Qualification runs only against the real installed binary through the gated live suites; a mock-based result is never sufficient to enable analysis. [[c13]]
- When the narrow authorization cannot be established without a blanket bypass, the session reports analysis unavailable instead of enabling it. [[c5]]

## 7. Test strategy

**Test framework:** `node:test (npx tsx --test), matching s1's own convention`

**Test levels**

- **unit** — Exercise the stable-descriptor cache key, the export.json fingerprint check, coalescing, bounded connector-flakiness retry, and reconciled catalog-evidence polarity without spawning any real subprocess.
  - Subjects: `stableDescriptorHash computation excluding outputDir and its hit/miss decision -- two calls differing only in outputDir still hit the cache`, `effectiveConfigFingerprint extraction from a fake export.json at qualification time; a missing/unparsable export.json fails qualification closed`, `a qualified dispatch whose own export.json diverges from the cached fingerprint invalidating the entry while still returning its own result`, `concurrent cache misses for the identical stable descriptor coalescing into one in-flight qualification promise`, `the allow-side probe's bounded retry tolerating simulated connector-not-registered attempts`, `structural catalog evidence: exclusion/denial of a disallowed tool passes qualification; exclusion/denial of a REQUIRED tool fails it -- the reconciled polarity`, `a genuine bypass-absence failure (a disallowed tool actually completes) failing qualification immediately, never retried`, `startTurn's mode:'read-only' branch re-checking the cache by stableDescriptorHash at dispatch time`, `buildArgv's read-only branch emits exactly the two connector_insrc_* flags and no approval flag`
  - Fixtures: `injectable deps matching sc1's VibeAdapterDeps test seams`, `a fake qualification-suite runner stub with a controllable export.json fixture`, `a fake catalog enumeration returning configurable allowed/disallowed tool sets`, `a controllable AbortController and fake clock`
- **integration** — Exercise readOnlySessionOnce's vibe branch end to end against a scripted fake vibe binary, including the post-dispatch fingerprint check.
  - Subjects: `readOnlySessionOnce's vibe branch returning the schema-validated answer on a qualified capability`, `the recorded argv matching buildArgv's own values exactly except outputDir`, `the VibeReadOnlyUnavailableError path when probes exhaust the retry bound or export.json is unusable`, `the cache-miss-on-descriptor-change path when the binary content or pinned env changes`, `a scripted post-dispatch export.json mismatch invalidating the cache for the NEXT call while the current call's result is unaffected`, `the capabilityPolicy precondition refused before readOnlySessionOnce is reached`
  - Fixtures: `a scripted fake 'vibe' binary that records its exact argv/env/cwd, writes a controllable export.json, and can simulate connector-flakiness and catalog-exclusion via a mode flag`
- **live** — Prove the qualification suite's probes against the REAL installed vibe binary in the production cwd, using structural catalog evidence rather than real mutating probes.
  - Subjects: `the allowed-tool execution proof: a confirmed completed-call effect row for insrc_analyze and insrc_analyze_step under --enabled-tools connector_insrc_insrc_analyze/connector_insrc_insrc_analyze_step, tolerating connector flakiness via bounded retry -- an unresolved result here is accepted as 'stays unavailable', per review r3 finding 4, not a test failure`, `the blocked-tool proof via structural catalog enumeration (no actual write attempted)`, `the blanket-bypass absence proof via catalog enumeration`, `the ac4 no-mutation proof via structural catalog evidence that write/bash tools are absent or denied, never via an actual write under the production profile`, `the export.json effective-config fingerprint actually present and parsable on a real run`
  - Fixtures: `INSRC_LIVE_TESTS=1 gate`, `no disposable write sub-path needed -- the production-cwd probes are read-only/structural only`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: dispatch through buildArgv's read-only branch when readOnly.status is 'qualified', with the stable descriptor hitting across calls that differ only in outputDir`, `integration: readOnlySessionOnce's vibe branch returns the schema-validated answer`, `live: confirmed completed-call effect row under the corrected published-name contract, tolerating connector flakiness via bounded retry, or an accepted 'stays unavailable' outcome` |
| `ac2` | `unit: structural catalog evidence of a disallowed tool's exclusion/denial passes qualification while a required-tool exclusion/denial fails it -- the reconciled polarity`, `live: the blocked-tool proof via catalog enumeration under the pinned descriptor` |
| `ac3` | `unit: the bypass-absence-failure case resolves to 'unavailable' with a reason, never 'qualified'`, `integration: readOnlySessionOnce's vibe branch surfaces VibeReadOnlyUnavailableError(reason) when probes exhaust the retry bound or export.json is unusable`, `live: the blanket-bypass absence proof via catalog enumeration` |
| `ac4` | `unit: the required-tool-exclusion and bypass-absence cases both resolve to 'unavailable', never a silent pass`, `unit: a missing/unparsable export.json fails qualification closed rather than skipping the mutation check`, `live: the ac4 no-mutation proof via structural catalog evidence only, never an actual write under the production profile` |

## 8. Migration

**State before:** startTurn's mode:'read-only' branch unconditionally throws VibeReadOnlyUnavailableError('no qualified capability yet'); buildArgv has no branch for request.mode==='read-only'; readOnlySessionOnce's vibe branch calls startTurn then throws 'unreachable'. buildArgv (src/shared/vibe-adapter.ts:365-375) always bakes a fresh mkdtemp() path into --output-dir on every call (confirmed by reading lines 470,481-482), so no prior design iteration's verbatim-argv hash could ever reuse proof across turns.

**State after:** createVibeAdapter's returned adapter carries a readOnly field whose provenAgainst is { stableDescriptorHash, effectiveConfigFingerprint } -- a key that excludes the per-turn outputDir and binds to the binary's own self-reported effective config. buildArgv gains a read-only branch; startTurn's mode:'read-only' branch dispatches when qualified and re-validates the post-dispatch fingerprint; readOnlySessionOnce's vibe branch awaits the dispatched turn instead of throwing 'unreachable'. The qualification suite's blocked-tool and write-refusal proofs use structural catalog evidence instead of a real write under the production profile.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the ReadOnlyCapability type with its two-part provenAgainst shape and the module-level qualification cache keyed by stableDescriptorHash. — ↩ rollbackable
2. Add buildArgv's read-only branch behind request.mode==='read-only', and the stable-descriptor computation that builds its hash FROM buildArgv's own output with outputDir excluded. — ↩ rollbackable
3. Implement the live qualification suite as a standalone function: bounded-retry allow probe; immediate-fail deny/bypass probes using structural catalog evidence with the reconciled pass/fail polarity; export.json fingerprint extraction with fail-closed behavior on a missing/unparsable export. — ↩ rollbackable
4. Wire createVibeAdapter to populate the readOnly field synchronously from the cache by stableDescriptorHash. — ↩ rollbackable
5. Wire startTurn's mode:'read-only' branch to re-check the cache and dispatch when qualified, and to compare a completed dispatch's own export.json against the cached effectiveConfigFingerprint, invalidating the entry on a mismatch. — ↩ rollbackable
6. Wire readOnlySessionOnce's vibe branch to await startTurn with the absolute deadline and parse the result against schema. — ↩ rollbackable
7. File the HLD amendment adding sc3's provenAgainst.stableDescriptorHash and effectiveConfigFingerprint fields, replacing the prior round's single spawnRecipeHash proposal. — ↩ rollbackable

**Backward compat:** VibeExecutionAdapter gains a field and loses none; existing callers unaffected. buildArgv's existing request.mode==='default' branch and its argv shape for that mode are untouched. readOnlySessionOnce's public signature and its 'strict-read-analyze' refusal are unchanged. The provenAgainst shape itself has never shipped in a BUILD, so there is no prior production shape to migrate away from -- this is additive within the LLD's own iteration, not a runtime backward-compat break.

## 9. Alternatives considered

### 9.1 a1: Cache keyed by the full verbatim argv (round 3's design)

Hash the complete resolved spawn call including every argv element.

The qualification suite records the complete argv it is about to spawn, including --output-dir, and hashes it as one key; a real dispatch computes the same hash from its own about-to-spawn argv and requires an exact match.

**Rejected because:** Hashing the full verbatim argv including the per-turn --output-dir can never produce a cache hit in production, confirmed by reading buildArgv's own source.

### 9.2 a2: Stable authorization descriptor excluding turn-local argv, still itemized

Key on binary real path + content identity + the argv WITH --output-dir (and any other turn-local segment) stripped out, plus pinned env subset and cwd.

Resolve the binary to its real path and a content fingerprint (e.g. a hash of the file); build the launch-profile argv the SAME way for qualification and dispatch, but omit --output-dir (and any other per-turn value) before hashing, so repeated turns under an unchanged policy actually hit the cache. Combine with the adapter's pinned env subset and cwd.

**Rejected because:** Fixes the cache-hit defeat by excluding outputDir, but still does not bind to the effective MCP-registration or policy-content state behind an unchanged cwd/env -- review r3 finding 2.

### 9.3 a3: Stable descriptor (per a2) plus a live effective-config fingerprint read back from the qualification run itself, checked on every dispatch — **CHOSEN**

Use a2's stable, turn-local-free descriptor as the cache key, but ALSO capture the installed binary's own self-reported effective-config snapshot (version + resolved policy/tool state, read from the same --output-dir export.json every run already produces) at qualification time, and verify every later qualified dispatch's own export.json still matches that recorded snapshot -- a mismatch invalidates the cache immediately.

At qualification time, after a probe run completes, read its export.json (already produced by every run per the installed CLI's own --output-dir contract) and extract the binary's own self-reported version and effective-config fields; store that as the recorded fingerprint alongside the a2-style stable descriptor. The qualification's own allow/deny/bypass probes already prove the TOOL-LEVEL behavior under that fingerprint. A later qualified dispatch is not blocked on re-reading export.json before it runs (that would require a probe round-trip on every call, defeating the cache again), but its OWN export.json is checked immediately after the turn completes; a fingerprint mismatch invalidates the cached entry from that point so the NEXT demand re-qualifies, and the mismatched turn's own result is still returned (the drift is detected and cached retroactively, never silently trusted). This directly answers r3 finding 2's 'pin an actual content/effective-config identity ... or refuse when that binding is unavailable': the binding is the installed tool's OWN self-report, not an assumption about what unchanged inputs imply, and when the tool doesn't produce one (export.json missing/unparsable) qualification fails closed to unavailable rather than skipping the check.

### 9.4 a4: No caching: qualify fresh on every read-only turn

Every single mode:'read-only' startTurn call re-runs the full live qualification suite before deciding.

startTurn's read-only branch runs the qualification suite on every call -- no memoization, no key, no invalidation logic, and therefore no verbatim-argv or turn-local-value problem at all.

**Rejected because:** Qualifying fresh on every call defeats sc1's synchronous, subprocess-free construction/dispatch contract and multiplies connector-flakiness exposure on the critical path.

## 10. References

- **[[c1]]** `code` `src/shared/vibe-adapter.ts:639-665` — "createVibeAdapter / startTurn"
- **[[c2]]** `code` `src/shared/vibe-adapter.ts:365-375` — "buildArgv always includes --output-dir"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:866-941` — "readOnlySessionOnce's vibe branch throws 'unreachable'"
- **[[c4]]** `code` `src/agent/providers/capability-qualification.ts` — "QUALIFIED_FOR_STRICT_READ_ANALYZE = new Set(['claude', 'ollama'])"
- **[[c5]]** `doc` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/HLD.md` — "sc3: Adapter-owned read-only authorization and its qualification evidence"
- **[[c6]]** `prior-artifact` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S001/BUILD.md` — "s1 BUILD -- sc1/sc2 landed"
- **[[c7]]** `code` `src/daemon/steps/build-step/phases/validate.ts:523` — "runReadOnlySession call omitting capabilityPolicy (defaults to write-sandboxed)"
- **[[c8]]** `code` `src/workflow/security-review/security-round-hooks.ts:82-85` — "runReadOnlySession call requesting capabilityPolicy:'strict-read-analyze'"
- **[[c9]]** `code` `src/agent/providers/cli-provider.ts:812-836` — "UnqualifiedCapabilityPolicyError gate preceding readOnlySessionOnce"
- **[[c10]]** `code` `src/shared/vibe-adapter.ts:470` — "tempDir = await deps.mkdtemp() -- fresh on every turn"
- **[[c11]]** `code` `src/shared/vibe-adapter.ts:481-482` — "argv = buildArgv(request, tempDir); child = deps.spawn(...)"
- **[[c13]]** `code` `src/shared/vibe-adapter.ts:118-120` — "VIBE_INSRC_ANALYSIS_TOOL_IDS allowlist and fromStreamedName journal naming"

## 11. Open questions

- The HLD amendment proposal adding sc3's provenAgainst.stableDescriptorHash and effectiveConfigFingerprint fields has been submitted but no AMD-* artifact has been found on disk confirming it was formally filed/tracked separately -- disclosed honestly; the evidence contract is not claimed approved until this resolves.
- Whether the corrected published-name values, combined with bounded-retry tolerance, actually succeed in practice against the real installed vibe binary is not proven at design time -- 'stays unavailable' is an explicit, accepted outcome if live proof fails; deferred to the Story's own build-phase live qualification-suite tests.

## Citations

- **[[c1]]** `code` `src/shared/vibe-adapter.ts:639-665` — "createVibeAdapter / startTurn"
- **[[c2]]** `code` `src/shared/vibe-adapter.ts:365-375` — "buildArgv always includes --output-dir"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:866-941` — "readOnlySessionOnce's vibe branch throws 'unreachable'"
- **[[c4]]** `code` `src/agent/providers/capability-qualification.ts` — "QUALIFIED_FOR_STRICT_READ_ANALYZE = new Set(['claude', 'ollama'])"
- **[[c5]]** `doc` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/HLD.md` — "sc3: Adapter-owned read-only authorization and its qualification evidence"
- **[[c6]]** `prior-artifact` `docs/epics/unify-vibe-one-plain-cli-adapter-E20261124639cd215/S001/BUILD.md` — "s1 BUILD -- sc1/sc2 landed"
- **[[c7]]** `code` `src/daemon/steps/build-step/phases/validate.ts:523` — "runReadOnlySession call omitting capabilityPolicy (defaults to write-sandboxed)"
- **[[c8]]** `code` `src/workflow/security-review/security-round-hooks.ts:82-85` — "runReadOnlySession call requesting capabilityPolicy:'strict-read-analyze'"
- **[[c9]]** `code` `src/agent/providers/cli-provider.ts:812-836` — "UnqualifiedCapabilityPolicyError gate preceding readOnlySessionOnce"
- **[[c10]]** `code` `src/shared/vibe-adapter.ts:470` — "tempDir = await deps.mkdtemp() -- fresh on every turn"
- **[[c11]]** `code` `src/shared/vibe-adapter.ts:481-482` — "argv = buildArgv(request, tempDir); child = deps.spawn(...)"
- **[[c13]]** `code` `src/shared/vibe-adapter.ts:118-120` — "VIBE_INSRC_ANALYSIS_TOOL_IDS allowlist and fromStreamedName journal naming"
