<!-- insrc:artifact LLD-7aaf7e1b4a54e86f-s1 -->

# LLD: STORY-7aaf7e1b4a54e86f-s1

## Summary

**Epic:** `provide-live-installed-review-qualification-before`
**HLD base run:** `wf-1793302600193-rwk4r6`
**HLD effective hash:** `554086532d2f...`

Add a daemon-owned operator probe that runs the actual installed review CLI against controlled canaries, collects independently checkable isolation/progress/cancellation observations and emits unsigned evidence. External attestation and canonical approval remain required before a bounded end-to-end review can run through production admission. Missing effective-inventory visibility produces unsupported, never fabricated qualification or automatic activation.

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

### 2.1 `CliProvider`

```typescript
class CliProvider implements LLMProvider
```

**Returns:** `CliProvider` — Existing provider owns model subprocesses. Add an optional provider-level qualification probe operation, implemented only by CLI; default unsupported for other providers. It accepts only an opaque daemon-issued single-use probe grant, signal, exact profile/budget and deadline. No arbitrary executable, args, prompt, paths or production binding may be supplied through IPC.

**Errors:**
- `unsupported` when Provider/binary has no independently observable effective inventory or exact launch support
- `probe-refused` when Untrusted grant, stale pins, budget, cancellation or launch identity mismatch

**Preconditions:**
- Use the selected high-tier review role through the existing role router.
- The main daemon allocates a private 0700 fixture root outside all registered repositories and resolves actual runtime images.
- Acquire the same process-wide provider execution lane used by investigation reviews; probe requests serialize and cancellation drains actual processes.

**Postconditions:**
- Probe execution creates no production qualification, review run, canonical CR, readiness, signature or configuration change.
- Record actual process events and unknown usage as null; never count estimates as observations.

### 2.2 `nativeReviewMcpConfiguration`

```typescript
nativeReviewMcpConfiguration(cwd: string, indexed: boolean): { mcpServers: Record<string, unknown> }
```

**Parameters:**
- `cwd: string` — Daemon-private pinned fixture/production cwd
- `indexed: boolean` — Exact source-only or indexed-impact catalogue

**Returns:** `object` — Reuse exact dedicated MCP catalogue and launch configuration. Probe-only grants resolve synthetic fixtures; production grants remain separately issued and inaccessible.

**Errors:**
- `probe-refused` when Configuration/runtime fingerprint differs from the independently observed launch

**Preconditions:**
- Per-invocation capability file and socket isolation remain mandatory.

**Postconditions:**
- No general daemon tools, DB or raw repository access is exposed.

### 2.3 `qualifyInvestigationAdapter`

```typescript
qualifyInvestigationAdapter(reference: string, expected: NativeAdapterIdentity, repoPath: string, indexed: boolean, authority: NativeIsolationEvidenceAuthority, supportedAdapterVersions: readonly string[], now?: number): Promise<NativeInvestigationQualification>
```

**Parameters:**
- `reference: string` — Approved signed evidence reference, never unsigned probe output
- `expected: NativeAdapterIdentity` — Current actual installation/launch/profile/catalog pins
- `repoPath: string` — Registered canonical project
- `indexed: boolean` — Qualification mode
- `authority: NativeIsolationEvidenceAuthority` — Unchanged independent installed signature verification
- `supportedAdapterVersions: readonly string[]` — Explicit supported adapters
- `now: number` _(optional)_ — Existing expiry check

**Returns:** `Promise<NativeInvestigationQualification>` — Existing private verified authority only after signed evidence and file/configuration checks; no probe bypass is added.

**Errors:**
- `InvestigationQualificationError` when Any missing, stale, forged, scripted or unsupported installed evidence

**Preconditions:**
- Independent signing key is provisioned outside daemon; daemon never creates/copies private keys or OAuth credentials.

**Postconditions:**
- Existing in-memory qualification issuance and production reviewSession checks remain unchanged.

## 3. Data model changes

### 3.1 `Operator probe request/status` — new

Version 1 additive main-daemon IPC codeReview.investigation.probe with strict discriminated operations start/status/cancel/export. Start carries request UUID, registered canonical repo, source mode and an explicit host budget declaration; no caller-supplied observed inventory, key, command, prompt or evidence. Daemon selects current high-tier review provider and fixture suite. Status owns one probe ID with queued/running/cancelling/completed/unsupported/failed/cancelled state, attempt ID, immutable launch pins, coverage of required observations and nullable usage. Exact UUID replay returns the same attempt and never invokes twice. No automatic retry/resume after crash: interrupted probes require a new explicit request; partial evidence is never exportable as qualification. The owning daemon alone creates mutable records, 0600 under a private probe root, with observations and output limits; no DB access from client. Proposed internal modules stay in src/daemon and src/agent/providers. The operation uses the existing main-daemon method routing and provider lane rather than worker-local state. Integration registration [[c6]] [[c7]]: add the strict codeReview.investigation.probe handler to buildHandlerRuntime in src/daemon/handler-runtime.ts. Add its session/non-worker classification and include the method in MAIN_DAEMON_CONNECTION_METHODS in src/daemon/threads/method-class.ts, following the existing investigation siblings. start/status/cancel/export must all reach the owning main daemon instance, including connections arriving via worker dispatch. Registration and runtime inventories are build change sites; existing qualification/adoption entries remain unchanged. Probe dispatch home [[c8]]: src/daemon/review-investigation-gateway.ts owns a new separately parsed probe dispatcher for start/status/cancel/export, delegated by the new handler-runtime entry. It composes a dedicated daemon-owned probe service and emits only the probe response schema. It never passes probe packets into dispatchInvestigation, production admission or legacy parsers; existing investigationTransport and production gateway semantics remain unchanged. The new dispatcher is an explicit change site, alongside main-daemon registration/classification.

**Call sites:**
- `src/agent/providers/cli-provider.ts`
- `src/agent/providers/native-investigation-session.ts`
- `src/daemon/review-investigation-adoption.ts`
- `src/daemon/handler-runtime.ts`
- `src/daemon/threads/method-class.ts`
- `src/daemon/review-investigation-gateway.ts`

### 3.2 `NativeIsolationEvidence` — new

Preserve the existing version-1 NativeIsolationEvidence schema unchanged. Add an unsigned observation envelope version 1 with sourceCommit/sourceDigest, probe ID/mode, adapter identity, exact configuration/environment/runtime pins, started/ended times, bounded raw observation hashes, per-required-probe verdict observed-denied/observed-allowed/unverifiable, and optional candidate NativeIsolationEvidence. One probe owns many observations, each observation belongs to exactly one probe; one candidate binds exactly one mode/provider/install/configuration. Observation records are never signature authority. Every denial and effective-inventory field needs process/runtime telemetry or a separately attested observer artifact bound to exact process attempt/launch/configuration. CLI model statements, requested flags, absent tool calls, generated empty arrays or timeout alone are not proof. If the installed CLI exposes no authoritative inventory/probe result for any required capability, emit unsupported with explicit missingEvidence and no candidate. Existing independently provisioned trust anchor verifies externally signed existing installed-probe report; no signing/export operation can auto-publish or approve it. Existing model metadata inspection remains non-certifying.

**Call sites:**
- `src/agent/providers/investigation-session.ts`
- `src/daemon/review-investigation-adoption.ts`
- `src/agent/providers/__tests__/native-investigation-fixtures.ts`

### 3.3 `Probe fixture and acceptance evidence relationships` — new

Probe fixtures are daemon-owned canary files, inert fake user/project MCP servers, hook/plugin/instruction markers and a local network listener with no external effects. Never edit actual user/project configuration or install anything into real auth homes. Any test requiring ambient config perturbation or credential copying is unsupported. Reuse exact adapter launch, environment policy and private MCP entry; no --bare. Raw filesystem canary outside fixture cwd is harmless; shell can only request an inert canary operation; network target is loopback. A separate cross-run invalid capability must be refused by host, not by model assertion. Host verifies two durable ACKs using the existing scoped protocol on synthetic work, then requests cancellation while the process is live and records actual process-group exit/bridge closure. Probe runs are not reviews of the active repo and cannot mint production qualification/bindings. After separately approved signed probes, evaluation/oracle/readiness and predecessor AMD, bounded acceptance uses an approved real subject with all build tasks passed, explicit commit/parent/block scope attestations and independent reviewer. Compare exact findings/coverage, progress, cancellation/reconnect, final canonical CR receipt and observed accounting; missing index impact remains explicit required evidence. User signs activation after this evidence; legacy deletion is a separate tracked follow-up.

**Call sites:**
- `src/agent/providers/native-investigation-session.ts`
- `src/daemon/__tests__/review-investigation-adoption.test.ts`
- `src/daemon/__tests__/review-investigation-evaluation.test.ts`
- `src/mcp/__tests__/review-investigation-native-restart.test.ts`

## 4. Diagrams

- [Sequence diagram](docs/standalone/provide-live-installed-review-qualification-before-E202610297aaf7e1b/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **Installed CLI lacks authoritative effective inventory or denial telemetry** (recoverable)
  - Detection: Required observation matrix contains unverifiable fields; parse structured runtime events only, never model assertions or requested flags.
  - Response: unsupported with missingEvidence; emit diagnostic observations but no NativeIsolationEvidence candidate, signed report or production binding.
  - User impact: Activation remains closed for this installation.
- **Any prohibited capability is observed available or canary is accessed** (recoverable)
  - Detection: Observer records effective extra tool/config or canary listener/file/hook event bound to the attempt.
  - Response: failed isolation; drain process and revoke fixture bridge. Retain bounded redacted evidence, never candidate.
  - User impact: Must correct native isolation before qualification.
- **Grant forgery, changed installation or configuration** (recoverable)
  - Detection: Private grant registry, pinned actual files and launch/catalog/profile/environment digests checked before launch and before export.
  - Response: probe-refused; stale/incomplete evidence cannot export candidate.
  - User impact: Explicit new probe required after correcting pins.
- **Budget/time limit, cancel or daemon crash** (recoverable)
  - Detection: Monotonic deadline, abort signal, observed process liveness and persisted nonterminal attempt on boot.
  - Response: At most one 300-second actual process attempt per explicit start, no retry; inclusive 128K context policy. Cancel queued operation without invocation; hold global lane until process group and bridge drain. Mark crash interrupted and invalidate candidate. Bound logs to 8MiB and status/export to 2MiB; overrun fails instead of truncating proof.
  - User impact: No hidden repeated model cost; interrupted evidence cannot qualify.
- **External evidence signature or canonical approval absent/stale** (recoverable)
  - Detection: Unchanged approved-reference and installed-probe signature verification fails.
  - Response: Do not call production review. Display exact missing prerequisite; no key generation, autoapproval, config mutation or legacy fallback.
  - User impact: Independent attestation/approval needed before live acceptance.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Same request UUID replayed after client disconnect | Return same probe/status without a new CLI call. Changed payload for same UUID is identity conflict. |
| Source-only passes; indexed mode lacks caller evidence or observer support | Keep separate mode-bound results; no inferred indexed qualification. Index gaps stay required/unverified. |
| Two operator sessions start probe/review concurrently | One global provider lane, queued status and cancellation; no overlap or worker-local grants. |
| Model completes after one ACK or exits naturally before cancellation | Insufficient proof; no synthetic second ACK or cancelled exit. Fresh explicitly requested attempt required. |

**Invariants to preserve**

- Qualification accepts installed evidence only after independent verification; scripted fixtures cannot upgrade to installed proof. [[c1]]
- CLI model execution remains in CliProvider; no cloud REST, credential copying or production review authorization from probe grants. [[c2]]
- Native session exact configuration and private dedicated MCP remain shared launch authority; production qualification checks unchanged. [[c3]]

## 6. Test strategy

**Test framework:** `Existing TypeScript node:test suites executed with Node22 --import tsx; SDK stdio/socket integration patterns from native restart tests. Live runs explicit and serial; deterministic tests never certify installed binaries.`

**Test levels**

- **unit** — Reject unobservable or forged proof and enforce strict observation/export schemas.
  - Subjects: `Every required isolation observation must be independently supported; model text/flags/silence cannot pass`, `Candidate requires exact install/config/profile/catalog identity, two ACKs and live cancellation exit`, `Unsigned/scripted/partial/stale records never become production authority`
  - Fixtures: `Recorded bounded CLI telemetry labelled synthetic`, `Tampered identities, forged grants, missing/extra tools, canary violations and expired reports`
- **integration** — Exercise main-daemon ownership, actual child lifecycle and scoped fixture bridge without live model cost.
  - Subjects: `Strict start/status/cancel/export routing; exact UUID idempotency and payload conflicts`, `Concurrent probe/review sessions share global lane and drain before next launch`, `Per-invocation files/socket cleanup; crash marks interrupted with no auto retry`, `No real configuration/auth writes or source reads; diagnostic/report bounds`, `Handler inventory includes codeReview.investigation.probe; method classification and MAIN_DAEMON_CONNECTION_METHODS pin every operation to main daemon; exercise real routed IPC start/status/cancel/export, not only a directly called handler`, `Registered probe handler delegates to the gateway probe dispatcher; malformed/probe packets cannot enter dispatchInvestigation, legacy codeReview.run or production admission`
  - Fixtures: `Deterministic fake subprocess binaries clearly marked nonqualifying`, `Controlled canary root and local listener`, `Existing MCP restart and production adoption fixtures`
- **live** — Run one explicitly initiated actual installed provider attempt per mode, classify unsupported honestly, then bounded real acceptance only after independent evidence approvals.
  - Subjects: `Selected high-tier installed CLI actual image/launch identity and effective inventory`, `All required denied-capability probes with independently attributable observations`, `Two durable scoped ACKs then host cancellation and actual process-group exit`, `Post-approval approved real commit-scoped subject yields findings/coverage, recoverability and frozen CR receipt`, `Report observed model calls/tokens/latency, unknown fields null`
  - Fixtures: `Existing CLI OAuth only`, `Independent observer/attestor and externally provisioned trust anchor`, `Separately approved oracle/evaluation/probes/readiness/predecessor AMD/scope ISSUE and all-tasks-passed BUILD`
- **contract** — Preserve existing review behavior and admission checks.
  - Subjects: `Legacy and design review routing unchanged`, `Probe grants unusable as production qualification/binding or ordinary provider options`, `Unsupported/missing report never selects fallback or mutates engine config`
- **smoke** — Verify actual compiled installation has operator surface and remains closed until signoff.
  - Subjects: `npm run build and affected native/adoption/MCP focused suites under Node22`, `Installed daemon health/commit/capability checks and read-only acceptance report`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `Actual installed provider launches only from trusted bounded probe grant; one attempt, no retries, global serialization` |
| `ac2` | `Every effective inventory/denial observation independently supported or explicit unsupported with no candidate` |
| `ac3` | `Two durable ACKs and cancellation/process-group/bridge teardown; restart invalidates incomplete proof` |
| `ac4` | `Signed evidence import/current canonical approval required; no automated keys, approvals, configuration or qualification bypass` |
| `ac5` | `After independent prerequisite approvals, production-path source-only/indexed real acceptance reports exact scoped CR/receipt and truthful accounting; activation signoff remains separate` |

## 7. Migration

**State before:** s1 analyzer identifies existing qualification verifier, production adoption consumer, native session execution and scripted fixture callers. Installed daemon dc8c3797f is deployed, default legacy, missing signed installed-probe/readiness evidence. No live probe producer is established. [[c1]] [[c2]] [[c3]]

**State after:** Additive operator probe can collect real bounded observations without opening production admission. Qualifying evidence is externally signed and canonically approved before normal acceptance. Installation may remain unsupported if inventory cannot be independently established. Activation/default and legacy code removal stay separate user decisions.

**Zero downtime:** no — **Data rewrite:** no

**Steps**

1. Deploy additive daemon probe/provider contracts with production engine selection and existing saved review formats unchanged. — ↩ rollbackable
2. Run deterministic boundaries and actual installed observation attempts serially, retaining bounded reports in /tmp and private runtime state outside artifact folders. Unsupported results remain diagnostic. — ↩ rollbackable
3. Operator independently verifies observations and provisions trust anchor/signs reports outside daemon. Present separate oracle/evaluation/probe/readiness/predecessor/scope records for explicit approval; do not synthesize lifecycle actor identity or elevate a system approval into a person. — ↩ rollbackable
4. With qualified exact installation, use normal admission for bounded real acceptance under explicit opt-in authorization, present findings/coverage/receipt/accounting and ask activation signoff. Revert opt-in and drain if unsuccessful; never automatically fall back. — ↩ rollbackable
5. Only after acceptance and user activation signoff, route legacy CODE-review deletion as a separate tracked change preserving design review and durable old-run diagnostics. — ↩ rollbackable

**Backward compat:** Additive IPC/provider optional capability; old clients and non-CLI providers remain valid and unsupported for probe. Existing NativeIsolationEvidence/readiness schemas, signed report verification, production bindings, legacy/design routes, saved states and canonical CR receipts unchanged. No migration of old review records or automatic default switch.

## 8. Alternatives considered

### 8.1 a1: Daemon-owned bounded probe and external evidence attestation — **CHOSEN**

Separate non-review probe execution from production qualification while sharing exact native launch identity.

Add an explicit daemon operator probe operation using the selected CliProvider and existing adapter launch/configuration functions. Probe execution accepts only controlled synthetic canaries, never repository content or production review authority. It emits bounded unsigned observations plus existing NativeIsolationEvidence only when every required fact is externally observable. Independently supplied signature and current canonical approvals remain mandatory before production qualification. Run acceptance through the unchanged production route only after readiness approvals.

### 8.2 a2: External standalone qualification program

Run probes outside the daemon and import signed reports.

Implement a separate installed operator program that duplicates native launch setup and evidence collection then imports signed qualification reports into canonical governance records. Production remains unchanged, but the program must independently bind every runtime, environment and configuration detail to the daemon's selected provider.

**Rejected because:** Independent operation is possible but adds duplicated launch authority and drift risk.

## 9. References

- **[[c1]]** `analyze-bundle` `s1.analyzeBundles[0]` — "Existing qualification verifier and observed production/scripted consumers; graph completeness limited."
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts`
- **[[c3]]** `code` `src/agent/providers/native-investigation-session.ts`
- **[[c4]]** `prior-artifact` `ISSUE-7aaf7e1b4a54e86f`
- **[[c5]]** `code` `src/daemon/review-investigation-adoption.ts`
- **[[c6]]** `code` `src/daemon/handler-runtime.ts:608-615` — "Sibling investigation handler registration in buildHandlerRuntime."
- **[[c7]]** `code` `src/daemon/threads/method-class.ts:89-91` — "Session classification plus MAIN_DAEMON_CONNECTION_METHODS near line 283 pin process-local investigation operations."
- **[[c8]]** `code` `src/daemon/review-investigation-gateway.ts` — "Existing investigation handler dispatch home; add an isolated strict probe dispatcher without changing production/legacy parsing."
