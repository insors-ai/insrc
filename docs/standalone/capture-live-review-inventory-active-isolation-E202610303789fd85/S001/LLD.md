<!-- insrc:artifact LLD-3789fd85d0bbeb22-s1 -->

# LLD: STORY-3789fd85d0bbeb22-s1

## Summary

**Epic:** `capture-live-review-inventory-active-isolation`
**HLD base run:** `wf-1793342352842-seipma`
**HLD effective hash:** `ae55aecf8510...`

Capture actual Claude startup inventory before cancellation and replace inert shadow files with active, temporary isolation canaries. A labelled positive-control phase establishes that each canary is detectable; the restricted phase uses the same pinned native launch as production review. Report observed facts and retain unsupported results where the installed CLI cannot demonstrate exclusion.

Acceptance criteria:
- ac1: Preserve version-pinned native startup inventory through cancellation while retaining valid native final-reply parsing and unchanged ordinary completion behavior.
- ac2: Exercise temporary project hook, plugin, instruction and MCP canaries with attributable positive controls; fail observed restricted leakage and retain unsupported for unobservable facts.
- ac3: Keep control/restricted evidence separate and enforce exact runtime/launch pins, aggregate bounds, serial execution, cancellation and no retries.
- ac4: Record one authorized installed verification per mode honestly and document residual limits; do not enable the engine or imply activation signoff.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `claudeInvestigationArgs`

```typescript
claudeInvestigationArgs(schema: StructuredSchema, modelArgs: readonly string[], cwd: string, indexed: boolean): string[]
```

**Parameters:**
- `schema: StructuredSchema` — Final reply contract
- `modelArgs: readonly string[]` — Selected high-tier model and effort pins
- `cwd: string` — Private invocation directory
- `indexed: boolean` — Exact scoped catalog selection

**Returns:** `string[]` — Native Claude invocation with stream-json, verbose and native hook events; no safe-mode, bare or permission bypass

**Preconditions:**
- Existing private configuration and exact model pins

**Postconditions:**
- Production and restricted probe use the same adapter args and launch-digest derivation; all previous explicit tool/settings/MCP restrictions remain

### 2.2 `collectClaudeProbeObservations`

```typescript
collectClaudeProbeObservations(result: ProcessGroupResult, identity: NativeProbeInvocationIdentity): readonly InvestigationProbeObservation[]
```

**Parameters:**
- `result: ProcessGroupResult` — Bounded actual process output retained through cancellation
- `identity: NativeProbeInvocationIdentity` — Version and immutable invocation provenance

**Returns:** `readonly InvestigationProbeObservation[]` — Version-pinned native facts, explicit leaks or unverified checks; no model-supplied proof

**Preconditions:**
- Native bytes are size-bounded and associated with exact phase/launch

**Postconditions:**
- Strictly parse complete JSONL frames; tolerate only an unfinished final frame on actual cancellation; contradictory/duplicate init, malformed interior frames, bounds or observer failure refuse positive evidence
- Native final reply parser in CliProvider applies only to native investigation, requires exactly one valid terminal result and preserves ordinary buffered completion behavior

## 3. Data model changes

### 3.1 `Bounded native Claude event capture` — invariant-change

Shared production/probe launch switches from buffered JSON to version-pinned stream-json. Raw startup frames survive host cancellation. Collector handles native frames only; assistant/result claims and structured-output tools never certify isolation. Actual inventories must have exact scoped tool names and one expected MCP server with required complete typed fields; unknown fields/versions/gaps remain unverified. Unexpected tools/MCP/plugins/hooks/instructions are failures. A complete scoped tool catalog may support individual tool-exposure checks only; it does not prove OS-level network/filesystem denial or absent unreported configuration. Update native-only CliProvider terminal parsing; keep schema validation and accepted-reply equality. Changed args invalidate prior launch fingerprints and require fresh evidence.

**Call sites:**
- `src/agent/providers/claude-investigation-session.ts`
- `src/agent/providers/cli-provider.ts`
- `src/agent/providers/claude-investigation-probe.ts`
- `src/agent/providers/native-investigation-probe.ts`
- `src/daemon/review-investigation-probe-export.ts`
- `src/daemon/review-investigation-adoption.ts`

### 3.2 `Active temporary canary fixture and paired evidence` — new

One daemon-created private root owns one probe attempt; that attempt owns separately labelled control and restricted phase evidence (0 or 1 each), one hashed canary manifest, and temporary project discovery paths. Place harmless CLAUDE.md, .claude/settings.json SessionStart/InstructionsLoaded hooks, .mcp.json and a local .claude-plugin manifest with local hook/MCP marker components under the root. Do not install into or edit HOME, real repos, settings, plugins or OAuth files; do not copy credentials or override auth. Control loads fixture settings/plugin explicitly through a fixed provider-internal launch template, while restricted launch uses the production template. Each marker is bound to capability, root, probe/attempt/phase and manifest digest. User-level inherited config not safely injectable remains unverified. Plugin fixtures require an actual supported discovery/load path and observable positive control; merely creating a plugin folder or omitting --plugin-dir never proves denial.

**Call sites:**
- `src/daemon/review-investigation-probe-fixtures.ts`
- `src/agent/providers/native-investigation-probe.ts`
- `src/agent/providers/cli-provider.ts`
- `src/daemon/review-investigation-probe.ts`

### 3.3 `Canary evidence and admission semantics` — field-add

Add strict bounded optional phase-evidence/manifest descriptors to diagnostic exports, with exact source/runtime/model/catalog/config/launch/version pins, phase start/end/order, control signals and restricted observations. Extend export validation's owned-root/file allowlist narrowly for these files; validate bytes, size, ownership, digests and same attempt. Control output never merges into restricted inventory or qualifies production. Report observed-denied for a tested exclusion only with successful positive control plus affirmative version-supported native exclusion/complete instrumentation for that capability; marker absence, model claims or final text are insufficient. Missing InstructionsLoaded or plugin metadata stays unsupported. Installed NativeIsolationEvidence remains unchanged; no candidate or approval minted unless all existing requirements actually hold. No signing keys.

**Call sites:**
- `src/shared/review-investigation-probe.ts`
- `src/daemon/review-investigation-probe-export.ts`
- `src/agent/providers/native-investigation-probe.ts`

### 3.4 `Probe phase lifecycle and limits` — invariant-change

All LLM invocations remain serial through CliProvider under the existing daemon global provider lane. Entire attempt retains the current absolute <=300-second deadline, inclusive 128K budget across both phase prompts, schemas/catalogs/native reserves and accumulated traffic, aggregate bounded retained output, and one control plus one restricted subprocess maximum per mode with no automatic retry. Both children drain before release; same UUID replay remains idempotent and interruptions stay interrupted. Usage is per phase when observed; unknown model calls/tokens remain null and subprocess count is not model-call count. All event files are private; revoke and cleanup sockets/processes, retain only bounded diagnostics. Unavailable controls fail qualification honestly.

**Call sites:**
- `src/agent/providers/native-investigation-probe.ts`
- `src/daemon/review-investigation-probe.ts`
- `src/shared/review-investigation-probe.ts`
- `src/daemon/review-investigation-probe-fixtures.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/capture-live-review-inventory-active-isolation-E202610303789fd85/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Malformed, oversized or contradictory native stream** (recoverable)
  - Detection: Bounded JSONL parser rejects invalid complete frames, duplicate/conflicting init/session identities, excess bytes, observer failures or unsupported runtime version
  - Response: Keep diagnostic refusal/unsupported reason, no positive isolation observation or candidate
  - User impact: Correct capture/version support before qualifying
- **Control canary inactive or unobservable** (recoverable)
  - Detection: Expected capability-specific native event or host marker missing/mismatched after a valid bounded control phase; no reliable native instructions/plugin signal
  - Response: Mark the affected check unverified; never infer denial from missing restricted hits
  - User impact: Runtime may remain unsupported until it exposes adequate evidence
- **Restricted phase loads forbidden configuration or capability** (recoverable)
  - Detection: Recognized native event, loaded inventory or bound host marker exposes unexpected tool/MCP/plugin/hook/instruction
  - Response: Fail isolation, retain bounded provenance and stop candidate production
  - User impact: Launch restrictions need correction; no automatic activation
- **Foreign/tampered phase evidence or launch drift** (recoverable)
  - Detection: Strict schema checks phase labels, manifest/file digests, private owned root, exact attempt/source/profile/catalog/config/binary/runtime/launch pins
  - Response: Refuse export qualification; a diagnostic control cannot satisfy restricted-phase pins
  - User impact: Rerun only after corrected code/version and explicit authorization
- **Budget, deadline, abort or daemon restart during phases** (recoverable)
  - Detection: Existing absolute deadline/signal and shared inclusive preflight fail, or persisted attempt is interrupted
  - Response: Drain child and broker, release lane only after teardown; no retry/rescheduling; keep unknown accounting null
  - User impact: Incomplete diagnostics stay incomplete

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Host SIGKILL after two durable ACKs leaves complete startup frames and one partial tail | Retain valid startup diagnostics, tolerate only that unfinished tail; never treat partial tail as an event or final reply |
| Production stream finishes naturally without exactly one valid accepted terminal result | Native-only final parser refuses; ordinary buffered completions and Codex remain unchanged |
| Hook control detects startup hook but native runtime cannot report loaded instruction sources | Hook observations may be evidenced separately; instruction exclusion stays unverified |
| Control uses explicit fixture plugin-dir, restricted phase omits it | Control proves fixture plugin works, but omission alone does not prove inherited-plugin exclusion; require complete relevant native inventory/config instrumentation |
| Same probe UUID replay or concurrent review | Return same probe without new phases; shared lane serializes all real provider calls |
| Older export lacks optional paired diagnostic descriptors | Read as prior diagnostics; never backfill or synthesize new verification facts |
| Cross-run and approval checks under paired-canary scheme | Cross-run requires actual host-observed rejection of foreign binding/run/generation/attempt identities by the installed scoped bridge; a no-session-persistence flag is insufficient. Approval requires actual rejection of approval/escalation operations through the scoped interface plus reliable native evidence about permission escalation outside that interface. If native evidence is unavailable, the overall approval check stays unverified; --permission-mode dontAsk or launch digest alone cannot pass it. Keep these existing required checks; do not infer them from canary silence. |

**Invariants to preserve**

- Bounded raw output, actual two ACKs/cancellation exit, private ownership, no credential copies, actual installed pins and source-mode identity remain required. [[c1]]
- All model calls use CliProvider and existing serial lane; no direct REST, key-based attestation, synthetic authority or automatic activation. [[c1]]
- Requested flags, model claims and marker silence alone cannot establish denied access. Preserve unsupported when facts are unobservable. [[c1]]

## 6. Test strategy

**Test framework:** `node:test with tsx; reuse native investigation and probe-fixture integration suites`

**Test levels**

- **unit** — Parse actual bounded event formats without manufacturing evidence
  - Subjects: `Native JSONL startup inventory survives cancellation; partial tail is diagnostic only`, `Malformed contradictory unknown-version and oversized streams never pass isolation`, `Native-only terminal result validation preserves ordinary Claude buffered completions`
  - Fixtures: `Pinned native-shaped JSONL frames including init, hook, tools/MCP/plugin inventory and one terminal result`
- **integration** — Make active temporary fixtures and phase separation testable without real auth/config changes
  - Subjects: `Project discovery canaries and labelled positive controls produce attributable host observations`, `Inactive controls missing native telemetry and model claims remain unverified`, `Restricted capability leaks fail and control-phase evidence cannot qualify production`, `Combined phase deadline budget capture bounds and shared provider lane prevent retries or overlap`, `Raw phase export rejects tampering foreign roots stale pins and control-to-production promotion`
  - Fixtures: `Private temporary project settings/hooks/CLAUDE.md/.mcp.json/local plugin fixture`, `Scripted CLI process controls explicitly labelled nonqualifying`
- **live** — Verify selected actual installed Claude after deployment without automatic rounds
  - Subjects: `Serial bounded installed control and restricted attempts record startup inventory and canary results honestly for both modes`
  - Fixtures: `Explicit live-test authorization, updated installed daemon and existing CLI OAuth; no copied credentials`
- **smoke** — Keep operator expectations accurate
  - Subjects: `Runbook distinguishes verified capabilities diagnostic controls unsupported facts and separate activation signoff`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Native JSONL startup inventory survives cancellation; partial tail is diagnostic only`, `Malformed contradictory unknown-version and oversized streams never pass isolation`, `Native-only terminal result validation preserves ordinary Claude buffered completions` |
| `ac2` | `Project discovery canaries and labelled positive controls produce attributable host observations`, `Inactive controls missing native telemetry and model claims remain unverified`, `Restricted capability leaks fail and control-phase evidence cannot qualify production` |
| `ac3` | `Combined phase deadline budget capture bounds and shared provider lane prevent retries or overlap`, `Raw phase export rejects tampering foreign roots stale pins and control-to-production promotion` |
| `ac4` | `Serial bounded installed control and restricted attempts record startup inventory and canary results honestly for both modes`, `Runbook distinguishes verified capabilities diagnostic controls unsupported facts and separate activation signoff` |

## 7. Migration

**State before:** c1: Claude native investigation uses buffered output; host cancellation loses startup envelope. Probe fixture writes shadow canaries outside discovery paths. Collector never establishes complete denial evidence; legacy engine remains selected.

**State after:** Native probe and production investigation share a streaming launch with validated native-only final reply parsing. Active temporary project canaries and separately labelled control evidence support host/runtime observations; missing facts remain unsupported and activation remains separate.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Deploy coordinated shared args/native-only parser and optional bounded phase evidence support, with existing engine selection unchanged. — ↩ rollbackable
2. After the installed daemon is updated, run one explicitly authorized serial control/restricted pair per selected mode under shared attempt limits, without retries. Publish honest observations and residual limitations. — ↩ rollbackable
3. Require fresh version-pinned qualification evidence for the changed launch digest; retain old records as historical diagnostics rather than rewriting approvals. — ↩ rollbackable

**Backward compat:** Ordinary Claude completions, design review and Codex transports retain existing behavior. Legacy diagnostic exports without optional phase descriptors remain readable. Changed native launch digest invalidates older installed qualifications and requires fresh evidence; no automatic conversion, key provisioning, credential copies, engine selection or activation.

## 8. Alternatives considered

### 8.1 a1: Shared streaming launch with controlled temporary canaries — **CHOSEN**

Capture startup events under the same pinned launch used for real review; pair active canaries with a separate labelled control.

Use bounded stream-json for Claude native investigation in both probe and production, with native-only terminal-envelope parsing. Place harmless version-valid project canaries under private temporary discovery paths and validate them with one explicitly labelled positive-control launch before the restricted launch. Keep control and target evidence/identities separate and retain unobservable facts as unsupported.

### 8.2 a2: Probe-only streaming diagnostics

Switch only diagnostic probes to streaming and leave production buffered.

Add streaming output only to probe arguments and collect init events plus canary controls. Keep the distinct launch digest explicit and export the result as diagnostic-only, so it cannot qualify the buffered production launch.

**Rejected because:** Useful diagnostics but cannot verify the exact production launch. Rejected because it leaves the identified mismatch.

## 9. References

- **[[c1]]** `analyze-bundle` `src/agent/providers/native-investigation-probe.ts` — "Analyzer locates four key entities, but dynamic caller graph incomplete. Direct source confirms CliProvider.runInvestigationProbe shares Claude adapter args with production runReviewSession; private r"
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts`
- **[[c3]]** `code` `src/daemon/review-investigation-probe-fixtures.ts`
- **[[c4]]** `doc` `https://code.claude.com/docs/en/hooks`
- **[[c5]]** `doc` `https://code.claude.com/docs/en/plugins-reference`
- **[[c6]]** `stakeholder` `user:2026-10-30` — "go ahead with this"

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 do not hold · 0 could not be verified · 13 hold** · template `design-spec` · model `cli-claude:claude-sonnet-5` · reviewed 2026-10-30T06:44:05.686Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

_None._
