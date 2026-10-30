<!-- insrc:artifact LLD-4bfefb556f0dc560-s1 -->

# LLD: STORY-4bfefb556f0dc560-s1

## Summary

**Epic:** `complete-native-review-isolation-qualification-so`
**HLD base run:** `wf-1793352936717-rrtzbq`
**HLD effective hash:** `1868cba8a782...`

Complete the approved activation-blocking bugfix by making native qualification both meaningful and reachable. ac1: the restricted launch disables unwanted plugins, hooks, inherited instructions and auto-memory while retaining OAuth and the scoped bridge. ac2: versioned evidence distinguishes the schema-output protocol tool from executable capabilities and independently reconstructs every required result; unknown or contradictory facts refuse. ac3: the real installed runner emits a completed candidate only after both modes prove the capability boundary, ordered ACKs and actual teardown. ac4: unchanged readiness/evaluation/reconciliation gates lead to a real new-engine review and explicit activation handoff; diagnostics alone cannot complete this fix. The boundary concerns review-agent capabilities/customization, not OS isolation of the CLI or its necessary authentication/network transport.

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

**Framework:** Standalone approved bugfix ISSUE-4bfefb556f0dc560; no parent HLD.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `claudeInvestigationArgs`

```typescript
claudeInvestigationArgs(schema: StructuredSchema, modelArgs: readonly string[], cwd: string, indexed: boolean): string[]
```

**Parameters:**
- `schema: StructuredSchema` — Pinned final protocol schema
- `modelArgs: readonly string[]` — Resolved review model/effort
- `cwd: string` — Private fixture or qualified directory
- `indexed: boolean` — Exact scoped impact-tool mode

**Returns:** `string[]` — One restricted launch shared by real probes and production; no safe-mode, bare mode, permission bypass or generic shell.

**Preconditions:**
- New Claude adapter version claude-scoped-v2; old v1 diagnostic reports cannot qualify this launch.
- Session-local configuration disables three observed builtin plugin IDs, all nonmanaged hooks, auto-memory and nonmanaged instruction discovery; explicit strict MCP and empty executable builtin tools remain. Add supported restricted/no-chrome controls where compatible.
- Managed customization cannot be silently overridden: native source diagnostics plus host source inventory must establish no conflicting managed instructions/hooks/plugins; ambiguity refuses.

**Postconditions:**
- Control launch deliberately enables only synthetic canaries; restricted launch uses exactly production flags/config/environment.
- Launch digest binds schema, version, model, cwd, sanitized environment and configuration policy. No user config or credential copies.
- Existing args/config consumers in adoption and export use the same builder/template.

### 2.2 `collectClaudeProbeObservations`

```typescript
collectClaudeProbeObservations(result: ProcessGroupResult, identity: NativeProbeInvocationIdentity): readonly InvestigationProbeObservation[]
```

**Parameters:**
- `result: ProcessGroupResult` — Actual bounded native output/diagnostics
- `identity: NativeProbeInvocationIdentity` — Version, mode, launch and effective pins

**Returns:** `readonly InvestigationProbeObservation[]` — Native facts only; combined qualification is performed by host evidence replay, not model claims. Unverifiable is a typed observation result, not a thrown error.

**Preconditions:**
- Claude 2.1.310 parser is exact-version pinned; new versions require qualification.
- Native complete tools list must equal exact mode catalog plus the known StructuredOutput schema protocol tool; duplicates/unknown prefixes/names refuse.
- StructuredOutput exception requires exact schema-bound launch and recognized native event provenance; it is recorded as a protocol tool, never hidden as an empty builtin inventory.

**Postconditions:**
- Any Bash/read/network/unknown tool or unexpected plugin causes failure.
- Raw marker assessments remain unverifiable when silent; combined policy+native+positive-control evidence is a distinct versioned host result.
- No terminal/model text becomes inventory or denial evidence.

### 2.3 `runNativeInvestigationProbe`

```typescript
runNativeInvestigationProbe(input: NativeProbeInvocation): Promise<InvestigationProbeExport>
```

**Parameters:**
- `input: NativeProbeInvocation` — Daemon-granted installed attempt and private fixture

**Returns:** `Promise<InvestigationProbeExport>` — Failed for leaks/bounds; unsupported for missing facts; completed plus candidate only when every required check is independently reproducible.

**Errors:**
- `Error` when Identity/runtime/config changes, inactive controls, deadline/capture/budget admission or process failure

**Preconditions:**
- Use existing serial provider lane; one control then one restricted subprocess, combined 300sec/128K/8MiB bounds, no retry.
- All four native-backed controls active, exact restricted native catalog/MCP/permission inventory, no restricted marker hits, pinned disabling policy and source exclusion evidence.
- Native policy-source diagnostics are bounded and parsed as host evidence, not a model assertion; managed/remote source ambiguity stays unsupported.

**Postconditions:**
- Completed path now constructs actual effective inventory, denial basis, ordered ACK/cancel trace and bounded validity (up to24h). Operator cancellation cannot become completed.
- Credential-copy fact derives from host-owned fixture manifest/environment/file operations; no claim that native CLI cannot read its original OAuth location.
- Approval denial means no agent-exposed approval/bypass capability and native dontAsk/none policy plus broker refusal, not an OS privilege assertion.

### 2.4 `validateInstalledProbeExport`

```typescript
validateInstalledProbeExport(input: unknown): InvestigationProbeExport
```

**Parameters:**
- `input: unknown` — Untrusted persisted report

**Returns:** `InvestigationProbeExport` — Strict independently replayed report; no approval or automatic activation authority.

**Errors:**
- `Error` when Missing/mismatched raw evidence, stale pins, forged basis/candidate, unsafe files or source mismatch

**Preconditions:**
- Recompute effective inventory, per-check evidence basis, verdicts, trace and candidate from same-attempt raw files; never trust supplied summaries.
- All existing installed source/profile/catalog/binary/config/launch/directory checks retained.

**Postconditions:**
- Control evidence cannot be promoted to restricted denial.
- Only identical recomputed candidate passes inspection. Canonical approval and installed authority are still required.

## 3. Data model changes

### 3.1 `NativeIsolationEvidence / EffectiveInvestigationIsolation` — invariant-change

Claude v2 evidence explicitly declares boundary review-agent-capabilities-v1. Preserve version1 envelope for compatibility; add optional typed boundary/protocolTools/evidenceBasis fields required only for Claude v2. builtinTools continues to enumerate executable tools and must be empty; protocolTools explicitly records StructuredOutput with schema/launch binding. Existing v1 scripted/native schemas retain their old rules and cannot mint v2 evidence. Each of the 14 required checks has one bounded basis record referencing same-attempt raw evidence digests and policy version; no unknown basis. Denials describe agent exposures; CLI OAuth/transport is outside them. Source inventory distinguishes excluded user/project/local from managed inputs; unmanaged exclusion requires actual bound host policy and active native controls, not absent output alone. Managed inputs require native policy provenance or refuse. Exact additive effective fields: boundary?: 'review-agent-capabilities-v1'; protocolTools?: readonly {name:'StructuredOutput';schemaDigest:string}[]; evidenceBasis?: readonly {check:required-check;basis:'native-catalog'|'native-source-policy-control'|'native-permission-broker'|'host-cross-run'|'durable-journal'|'actual-process-exit';policyVersion:1;rawDigests:readonly string[]}[]. V2 requires boundary plus complete unique basis entries, exact protocol tool/schema digest and 64hex raw digests. V1 rejects v2 fields; v2 identity+source pin distinguishes policy interpretation. Collector alone cannot create these fields. Candidate construction occurs only after verified basis replay. Native diagnostic grammar must be demonstrated against installed CLI before implementation is considered feasible; no invented native source-completeness assertion. Installed feasibility evidence now exists: /tmp/insrc-qualification-feasibility-LlcutM/native-debug.log from one synthetic CliProvider.completeStructured call on Claude2.1.310. Recognized native diagnostics report Found4 plugins(0enabled,4disabled), Registered0hooks from0plugins, Initialized versioned plugins system with0plugins, and cc-plugin-sec-default@builtin not seated:no managed settings and not a Team or Enterprise organization(max). Parser must bind those exact-version messages to the same actual native invocation; host must additionally verify the named managed-settings path is absent (not broken symlink) and no later conflicting managed/plugin/hook/instruction events. Do not assume that the existing debug wording proves arbitrary future organization/remote policy state. The actual schema-only dispatch finished successfully with the disabled-plugin policy. Raw diagnostic/file bytes remain private, bounded and hashed; redact before any user-facing report. No full live qualification is claimed by this feasibility test.

**Call sites:**
- `src/agent/providers/native-investigation-probe.ts`
- `src/agent/providers/claude-investigation-probe.ts`
- `src/daemon/review-investigation-probe-export.ts`
- `src/daemon/review-investigation-adoption.ts`

### 3.2 `InvestigationProbeExport candidate and evidence files` — field-add

One export owns exactly one attempt identity and ordered control/restricted pair; it owns zero-or-one candidate, exactly one candidate when completed. Add bounded native diagnostic/source-policy evidence kind if needed; same private fixture root, no links, file hashes and combined retention. Qualification facts are host reconstructed: tools/network/shell/raw-filesystem from exact native available-tool/MCP inventory; plugins/hooks/instructions from explicit disabling policy, complete native applicable inventory/source diagnostics and active labelled controls; user/project MCP from exact connected dynamic-only server inventory and strict config; approval from native permission mode/template plus host broker refusal; cross-run from six real foreign-field refusals between positive reads; progress/cancel from durable journal and actual process observation. A control hit never by itself proves restricted denial. Raw canary status remains honestly unverifiable on silence; host combined basis explains why the resulting policy-scoped denial is justified. Relationship directions: export->phases 1:2 ordered owned; export->raw 1:many owned; export->candidate 1:0..1 derived; approved probe record->candidate 1:1 referenced; readiness->mode probes 1:2 referenced, never owns their approval.

**Call sites:**
- `src/agent/providers/native-investigation-probe.ts`
- `src/daemon/review-investigation-probe-export.ts`
- `src/daemon/review-investigation-adoption.ts`

### 3.3 `Activation acceptance and readiness handoff` — invariant-change

Reuse canonical mode-specific probe ISSUE, independent oracle/evaluation ISSUE, readiness ISSUE, predecessor reconciliation AMD and installed authority. Do not add signatures or delete gates. Inventory existing pending records first; prepare exact missing documents/pins and present for explicit approval as needed. Build acceptance requires genuine installed completed candidates for both source modes and a real explicitly scoped plan-investigation-v1 review after its prerequisites are approved. If prerequisite approval is pending, mark acceptance pending and name it; do not claim completion or reroute to legacy. Final default activation signoff and subsequent legacy CODE deletion remain separate human decisions.

**Call sites:**
- `src/daemon/review-investigation-adoption.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/complete-native-review-isolation-qualification-so-E202610304bfefb55/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Unknown or executable tool/plugin appears in restricted native inventory** (recoverable)
  - Detection: Exact native mode catalog/protocol allowlist, plugin list and permission-mode checks detect extra, missing or duplicate fields/names.
  - Response: Fail attempt; preserve bounded raw output and offending check; no candidate, retry or activation.
  - User impact: Concrete isolation leak blocks readiness.
- **Missing policy-source provenance or managed customization overrides restrictions** (recoverable)
  - Detection: Versioned native diagnostics/source inventory cannot establish exclusions or reports active managed hooks/instructions/plugins.
  - Response: Unsupported with exact missing source/check; do not fabricate empty effective arrays or mark build complete. Resolve supported diagnostics or explicitly revise design rather than waive.
  - User impact: Precise incompatibility surfaced for correction; no false qualification.
- **Control inactive, native stream malformed, hidden capability or model assertion used as proof** (recoverable)
  - Detection: Control markers and native inventory completeness fail; independent replay rejects model result fields, duplicate init/version conflicts and contradictory evidence.
  - Response: No candidate; failure for actual leak, unsupported for missing evidence.
  - User impact: No unsupported proof promoted.
- **Tampered/stale/foreign raw evidence, launch or candidate** (recoverable)
  - Detection: Private real paths, file ownership/modes/hashes, same-attempt bindings and deterministic candidate reconstruction mismatch; current source/binary/profile/catalog/config pins differ.
  - Response: Refuse export/qualification before production invocation.
  - User impact: Requires deliberate fresh verification; no automatic model rerun.
- **Budget/deadline/capture overflow, operator cancel or daemon crash** (recoverable)
  - Detection: Existing aggregate128K/300sec/8MiB admission, cancellation signal, process observer and persisted attempt status.
  - Response: Await actual drain, retain diagnostics/checkpoints; operator cancel/interruption never becomes completed. Resume/status same identity without automatic replay.
  - User impact: Bounded work and honest incomplete acceptance.
- **Qualification passed but readiness/evaluation/reconciliation approval absent** (recoverable)
  - Detection: Existing adoption policy reads current canonical approved references/source/profile/catalog/policy pins.
  - Response: Prepare/present concrete missing records and retain pending real-review acceptance; no legacy substitution or default flip.
  - User impact: Human approval of known evidence is the remaining step, not an unexplained blocker.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Only StructuredOutput plus exact scoped bridge inventory | Allowed as explicitly recorded schema-bound protocol surface for Claude v2; any schema/source/version mismatch refuses. |
| Control canary hits and no restricted hit | Raw silence stays unverifiable; only combined current policy/native/source/positive-control basis can justify a capability-scoped denial. |
| Native auto-memory directory path listed with autoMemoryEnabled false | Path alone is not proof of loaded memory; must verify disabling policy and source diagnostics. Conflicting loaded-memory evidence fails. |
| Host cancellation after second ACK vs operator cancellation | Internal deliberate post-ACK probe cancellation may support completed proof after actual SIGKILL drain; external cancel cannot. |
| Old Claude v1 diagnostic or existing Codex/scripted fixture | Historical interpretation retained; cannot mint v2 installed evidence. Codex qualification not fabricated; modes use current selected supported provider. |

**Invariants to preserve**

- Existing paired probe serial lane, inclusive budgets, bounded raw evidence and ordered control/restricted identity remain. [[c1]]
- No model text, CLI flag alone or scripted fixture grants installed authority; independent export/source/runtime checks retained. [[c1]]
- Production adoption keeps canonical readiness/evaluation/reconciliation approvals and real installed qualification; explicit activation signoff and legacy CODE removal stay separate. [[c1]]

## 6. Test strategy

**Test framework:** `node:test and node:assert/strict through tsx; extend existing Claude native session/probe/export/adoption fixtures. Focused affected suite plus npm run build; no full multi-hour sweep.`

**Test levels**

- **unit** — ac1/ac2 exact native inventory, protocol classification and policy-source interpretation
  - Subjects: `Claude v2 launch disables plugins hooks instructions and memory without breaking OAuth or scoped MCP`, `StructuredOutput is schema-bound protocol only and every unknown duplicate malformed or contradictory native capability refuses`, `Missing or managed policy provenance cannot become an empty effective inventory`
  - Fixtures: `Pinned native JSONL and diagnostic captures; synthetic private settings/plugin/instruction fixtures`
- **integration** — ac2/ac3 host-derived candidate reachability and strict replay
  - Subjects: `Complete paired host evidence emits a completed Claude v2 candidate and qualifies through installed authority`, `Deleting changing or swapping any evidence basis raw phase pin or candidate refuses qualification`, `Internal post-ACK cancellation qualifies only after actual process drain while operator cancellation stays cancelled`, `V1 fixtures Codex ordinary provider and design review compatibility remain intact`
  - Fixtures: `Existing scripted native process and canonical authority fixtures; no real LLM`
- **live** — ac1/ac3 actual installed proof, not diagnostics-only acceptance
  - Subjects: `Installed source-only and indexed-impact probes each complete with a validated candidate using one serial control restricted pair`
  - Fixtures: `Updated daemon and exact binary/source/model/profile pins; saved request IDs; actual raw private evidence`
- **live** — ac4 production acceptance through the new engine
  - Subjects: `Approved current qualification evaluation readiness and reconciliation enable one real scoped plan-investigation-v1 review with accepted per-block checkpoints and final publication`
  - Fixtures: `Concrete approved canonical evidence references, known relevant commit packets and complete BUILD; independent oracle/evaluation, explicit test opt-in`
- **smoke** — ac4 honest operator handoff
  - Subjects: `Activation handoff lists concrete verified evidence references real review result and remaining explicit default activation signoff`
  - Fixtures: `Operator report in /tmp and canonical workflow records`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Claude v2 launch disables plugins hooks instructions and memory without breaking OAuth or scoped MCP`, `Installed source-only and indexed-impact probes each complete with a validated candidate using one serial control restricted pair` |
| `ac2` | `StructuredOutput is schema-bound protocol only and every unknown duplicate malformed or contradictory native capability refuses`, `Missing or managed policy provenance cannot become an empty effective inventory`, `Deleting changing or swapping any evidence basis raw phase pin or candidate refuses qualification` |
| `ac3` | `Complete paired host evidence emits a completed Claude v2 candidate and qualifies through installed authority`, `Internal post-ACK cancellation qualifies only after actual process drain while operator cancellation stays cancelled`, `Installed source-only and indexed-impact probes each complete with a validated candidate using one serial control restricted pair` |
| `ac4` | `Approved current qualification evaluation readiness and reconciliation enable one real scoped plan-investigation-v1 review with accepted per-block checkpoints and final publication`, `Activation handoff lists concrete verified evidence references real review result and remaining explicit default activation signoff`, `V1 fixtures Codex ordinary provider and design review compatibility remain intact` |

## 7. Migration

**State before:** s1 analyzer and direct reads show Claude v1 empty configuration, generic builtin/plugin failure classification, diagnostic-only runner without candidate, and installed export/adoption gates already present. Actual probes on6693bf60f fail, while scripted continuation infrastructure exists; default engine is legacy.

**State after:** Claude v2 capability-scoped evidence and shared restriction policy can yield an independently replayed completed installed candidate. Source-only and indexed-impact qualification plus existing canonical evaluation/readiness/reconciliation approvals support one explicit real-engine acceptance review. Default switch remains a separate signoff.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Add strict optional v2 evidence fields and current-policy validators while preserving v1 interpretation and default legacy; extend negative and positive fixtures. — ↩ rollbackable
2. Deploy shared restricted configuration and completed candidate construction with installed replay; update daemon only after source/build tests, checking other sessions before restart. — ↩ rollbackable
3. Run one deliberate serial installed control/restricted pair per mode with saved request IDs and pinned source; inspect actual raw proof. Do not automatically retry failed diagnostics. — ↩ rollbackable
4. Prepare concrete mode probe records and independent oracle/evaluation/readiness evidence plus existing predecessor amendment; obtain explicit approvals where required. Pending approvals keep real-review acceptance pending. — ↩ rollbackable
5. With explicit test opt-in and approved pins, enable only the required scheduling selection for one real plan-investigation-v1 acceptance review of relevant committed scope. Preserve prior config and drain/restore on failure. Do not substitute legacy or claim production default activation. — ↩ rollbackable
6. Present successful acceptance and exact activation configuration for final signoff; default activation and legacy CODE deletion require separate subsequent decisions. — ↩ rollbackable

**Backward compat:** No rewrite of old diagnostics, approved history or saved legacy states. V1 retains existing interpretation; only v2 can carry the new boundary/protocol/basis contract. New strict optional fields require matching updated daemon and adapter; unsupported versions refuse. Codex and design review remain unchanged. Engine rollout preserves status/cancel/accepted receipts and frozen publication.

## 8. Alternatives considered

### 8.1 a1: Versioned capability qualification on existing paired probes — **CHOSEN**



Reuse launch/collector/host/candidate/export/adoption; explicit capability boundary and independent raw replay.

### 8.2 a2: OS isolation supervisor



Add process sandbox and syscall/network policy including OAuth transport.

### 8.3 a3: Suppress inventory findings only



Adjust reported leaks but keep unsupported without candidate.

## 9. References

- **[[c1]]** `analyze-bundle` `insrc_analyze_step: native launch/collector/probe/export relationships, completed in this session` — "Located claudeInvestigationArgs, collectClaudeProbeObservations, runNativeInvestigationProbe and validateInstalledProbeExport; graph coverage incomplete; adoption is an actual caller."
- **[[c2]]** `prior-artifact` `.insrc/artifacts/ISSUE-4bfefb556f0dc560.json`
- **[[c3]]** `code` `src/agent/providers/native-investigation-probe.ts`
- **[[c4]]** `code` `src/daemon/review-investigation-probe-export.ts`
- **[[c5]]** `code` `src/daemon/review-investigation-adoption.ts`
- **[[c6]]** `step-output` `/tmp/inventory-canaries-live-acceptance.json`
- **[[c7]]** `doc` `https://code.claude.com/docs/en/settings-reference#enabledplugins`
- **[[c8]]** `doc` `https://code.claude.com/docs/en/plugins/mods/overview#mods-built-into-claude-code`
- **[[c9]]** `step-output` `/tmp/insrc-qualification-feasibility-LlcutM/native-debug.log`
- **[[c10]]** `step-output` `/tmp/insrc-qualification-feasibility-LlcutM/result.json`
