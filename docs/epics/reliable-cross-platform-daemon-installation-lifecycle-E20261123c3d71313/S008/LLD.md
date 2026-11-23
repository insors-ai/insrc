<!-- insrc:artifact LLD-c3d71313f34bce71-s8 -->

# LLD: STORY-c3d71313f34bce71-s8 — Qualify installation, upgrades and lifecycle across platforms

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**HLD base run:** `wf-1795445383474-itgkv3`
**HLD effective hash:** `77bfb88eed6d...`
**Tracker:** [insors-ai/insrc#250](https://github.com/insors-ai/insrc/issues/250)

Qualification proves both delivery modes and both IDE integrations on isolated real platforms. Each result names the exact release/runtime, environment and scenario, with unavailable coverage kept separate from passes. This story supplies evidence and release gates, not another implementation of the installer.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. HLD context

> See **HLD-c3d71313f34bce71** § 2. Framework summary

**Rollout phase:** F — platform qualification
**Consumes:** `sc1` (Installation and release identity), `sc2` (Manager command and operation state), `sc3` (Dependency report and consent), `sc4` (Daemon shutdown and readiness), `sc5` (Ordered upgrade hook delegation), `sc6` (Local transport and explicit installation home), `sc7` (Shared terminal installer launch)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Own the foundational manifest, controller/operation/consent/hook/transport contracts because every branch already depends on s1. Private implementation covers bootstrap, runtime/payload integrity, bundle preparation/publication, platform lock adapter and atomic install records. Later stories implement lifecycle, checks and hooks behind these contracts. The canonical scripts and interactive installer mode are shared with manual invocation and both IDEs; terminal prompts and durable results are part of this foundation. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. The s1 LLD must explicitly reserve ManagerAction.install to the shared terminal bootstrap script and forbid IDE-adapter invocation. DEF traceability: E20261123c3d71313:S001:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc1`, `sc2`, `sc3`, `sc5`, `sc6`, `sc7`
- `s2`: Private dev checkout/branch sync, lockfile installation and native build preparation; returns the same immutable prepared candidate. It does not define a second lifecycle or migration engine. Include the selected release's installed TUI entry/assets in the payload and default successful interactive installer-to-TUI handoff. DEF traceability: E20261123c3d71313:S002:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s3`: Private platform dependency detection, user-level Ollama installation and agent CLI recommendations. It implements foundational reports/consent and never auto-installs agent CLIs. DEF traceability: E20261123c3d71313:S003:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s4`: Private daemon start/readiness, boot guard integration, shutdown drain/immediate exit and exit-completion launcher wrapper; transport is shared. No delivery sync/build on start and no signal/PID daemon control. DEF traceability: E20261123c3d71313:S004:FR001 and this story's DEF acceptance criteria apply unchanged. — owns `sc4`
- `s5`: Private ordered migration runner, daemon migration-only mode, blocked-state persistence, interrupted-run validation and explicit retry. Hooks alone choose data changes and recovery policy. DEF traceability: E20261123c3d71313:S005:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s6`: Private VS Code native terminal open/focus/launch integration, duplicate-action handling and post-install reconnect. It invokes the shared script and leaves all install prompts/output in that terminal, including after failure. Existing ordinary lifecycle and upgrade-consent UI remains thin. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S006:FR001 and this story's DEF acceptance criteria apply unchanged.
- `s7`: Private JetBrains native terminal open/focus/launch integration with the same script, stdin/output and post-install readiness behavior as VS Code; no independent wizard or hidden install. Preserve background activation/control and Windows IPC bridge for ordinary daemon operations. Successful installation automatically enters the installed TUI in that same terminal; the IDE only reconnects/status-checks and does not require a second click. DEF traceability: E20261123c3d71313:S007:FR001 and this story's DEF acceptance criteria apply unchanged.

## 2. Contract details

**Surface level:** internal

## 3. Data model changes

### 3.1 `Qualification profile and result` — new

New private test record contains profileId, scenarioId, OS/version/kernel, process and kernel architectures, virtualization/translation mode, filesystem, CPU/GPU context where relevant, IDE product/version/terminal engine, runtime version/ABI, source commit, script/manifest/archive/native-binding digests, timestamps, expected/observed behavior, result(pass/fail/unavailable), diagnostics/log refs and cleanup outcome. One profile has many scenario results; one result binds exactly one candidate identity and environment. No new public daemon API or DB entity is introduced. Proposed test/evidence boundaries: src/installer/__tests__/qualification.test.ts and this story's evidence directory.


### 3.2 `Selected environment matrix` — new

Linux primary: isolated Ubuntu 24.04 OrbStack arm64 and x64 guests, recreating previously deleted test VMs when execution is authorized. Record x64 translation; native x64 Linux runner supplies architecture-sensitive gaps. macOS arm64 primary: existing insrc-macos-arm64 UTM VM on external storage; current guest success does not prove the declared minimum OS baseline. Use an isolated macOS x64 runner/host and baseline-matching environment for Intel/minimum-version coverage. Windows: Windows 11 ARM64 UTM guest for native ARM64/explicit x64-emulation cases plus actual Windows x64 runner for native x64 modules/pipe behavior. These are selected execution environments, not claims they exist or tests have passed. Missing environment/package support marks target unavailable and prevents advertising that target.


### 3.3 `Scenario matrix` — new

For both bundle and dev delivery: clean install with no/wrong host Node; exact successor upgrade; unchanged delivery/ref selection; shared terminal/manual script parity; readiness-confirmed same-terminal TUI; start/no-build; graceful stop; explicit immediate override; restart/actual exit proof; migration skip/success/check-run-test failure/interruption/retry; dependency existing/missing/decline/install; zero/one/many agent recommendations; concurrent windows; Unicode/space/metacharacter paths; download/digest/target/archive corruption; source dirty/build failure; stale offers; and corrupt controller/journal recovery. Each IDE separately proves native terminal visibility/focus, ordinary control, startup autostart, explicit upgrade accept/dismiss including plugin updates, blocked migration UI and close/cancel behavior. Cross-review regression matrix explicitly includes: two clients escalate immediate while graceful operation lock remains held; first migration admission versus ordinary startup; manager death with live candidate at every journal boundary, no second runner, exact journal/exit reconciliation; correlated Windows per-request pre-write cancel, first-write race, helper death and protocol mismatch. Record full owner/session/operation identities with secrets redacted. Proposed sc2/sc6 amendments must be approved and consumer designs rebased before this matrix executes. Require migration-wrapper durable receipts on natural success, hook failure and manager death, including crash before/after receipt fsync/publication and mismatched session/nonce/digest. Require protocol-2 hello/ready success, 3-second timeout, malformed/duplicate/wrong version/nonce/early outcome and unsupported-helper cases with zero pre-ready application sends.


### 3.4 `Isolation and native probes` — new

Every fixture uses explicit isolated home, endpoint, operation identity and test repository registration. Record/assert resolved home/socket/pipe before mutation and refuse the host default home or active host v2 endpoint. Native module imports and representative LMDB/Lance/DuckDB/parser paths run only in owned disposable test/daemon processes; graph fixtures register repositories through the daemon contract before inserts. No model downloads or cloud LLM requests are needed for installer qualification. Run CPU-only dependency smoke when GPU drivers are absent; never install drivers or elevated packages.


### 3.5 `Evidence and acceptance gate` — new

Use bounded canonical Node coordinator, existing JetBrains JUnit and native IDE harnesses. Test timeouts are failures/unavailable—not successful shutdown—and generic test-child cleanup is recorded separately from product IPC-only lifecycle proof. Preserve exact logs/artifact identities and host fingerprint; redact auth/capabilities. A target passes only when all required target/mode/IDE scenarios and native probes match exact candidate bytes. Missing/failed/translated-only baseline evidence blocks that target's qualification; signing is not introduced. A later changed source/archive/runtime invalidates prior evidence. All sibling implementation issues remain owned by their stories.


## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | Exercise the actual owner implementation and capture observable evidence; test fixtures never replace an owner with synthetic success for final acceptance. |
| `sc2` | consumes | Exercise the actual owner implementation and capture observable evidence; test fixtures never replace an owner with synthetic success for final acceptance. |
| `sc3` | consumes | Exercise the actual owner implementation and capture observable evidence; test fixtures never replace an owner with synthetic success for final acceptance. |
| `sc4` | consumes | Exercise the actual owner implementation and capture observable evidence; test fixtures never replace an owner with synthetic success for final acceptance. |
| `sc5` | consumes | Exercise the actual owner implementation and capture observable evidence; test fixtures never replace an owner with synthetic success for final acceptance. |
| `sc6` | consumes | Exercise the actual owner implementation and capture observable evidence; test fixtures never replace an owner with synthetic success for final acceptance. |
| `sc7` | consumes | Exercise the actual owner implementation and capture observable evidence; test fixtures never replace an owner with synthetic success for final acceptance. |

## 5. Error paths

**Error cases**

- **Missing real platform or native dependency** (recoverable)
  - Detection: Profile setup/native probe cannot execute on declared target/baseline.
  - Response: Record unavailable with concrete blocker; do not mark passed or publish support.
  - User impact: Qualification remains honest.
- **Evidence identity mismatch** (recoverable)
  - Detection: Candidate/runtime/script/native digests or environment do not match profile.
  - Response: Reject evidence for acceptance and rerun the exact candidate.
  - User impact: Old success cannot authorize new bytes.
- **Isolation check fails** (recoverable)
  - Detection: Resolved home/endpoint equals host v2/default or another profile's ownership.
  - Response: Abort before any mutation.
  - User impact: Host daemon/data remain untouched.
- **Scenario times out or cleanup fails** (recoverable)
  - Detection: Coordinator budget expires or owned resources remain unresolved.
  - Response: Failed/unavailable scenario plus cleanup diagnostics; no silent background loop.
  - User impact: Test suite does not claim lifecycle success from forced cleanup.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| x64 user-space translated on ARM kernel | Record both architectures and translation; require native evidence for remaining architecture-sensitive gaps. |
| Existing UTM guest is newer than minimum OS | Functional evidence applies to that guest, not the untested minimum baseline. |
| One target passes while another is unavailable | Report per-target status; do not collapse into all-platform green. |

**Invariants to preserve**

- Remain inside s8 boundary; no elevated commands, PID/kill daemon fallback, direct cloud LLM REST, or host v2 daemon mutation. [[c1]]
- Approved HLD shared contracts, terminal-only install and success-to-TUI handoff remain unchanged. [[c2]]
- DEF E20261123c3d71313:S008:FR001 and this story acceptance criteria apply unchanged. [[c3]]

## 6. Test strategy

**Test framework:** `Canonical node:test coordinator plus existing JetBrains JUnit/native IDE harnesses; per-target live evidence is mandatory and not substituted by mocks.`

**Test levels**

- **contract** — Validate matrix/evidence completeness and identity binding.
  - Subjects: `no missing AC/scenario entries`, `unavailable distinct from pass`, `digest/environment mismatch rejected`
- **integration** — Bounded isolated orchestration with actual owner components.
  - Subjects: `all mode/scenario combinations`, `fault injection and cleanup evidence`, `host-home/endpoint sentinel`, `All four cross-design regression scenarios use actual owner components and exact candidate/platform evidence.`, `Real target migration receipt persistence/recovery and Node/Kotlin handshake failures, independent of fixture-only evidence.`, `Actual Windows outer protocol-2 negotiation with unchanged inner protocol-1 RPC frames.`
- **live** — Native platform and real IDE acceptance.
  - Subjects: `OrbStack Linux, UTM macOS, actual Windows`, `native/translated/minimum-baseline distinctions`, `terminal/manual/TUI and IPC/migration behavior`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `both-mode-clean-install-upgrade-runtime-isolation-matrix`, `native-start-graceful-immediate-restart-matrix`, `migration-skip-success-failure-interruption-retry-matrix`, `exact-target-native-provenance`, `held-lock-cross-window-immediate`, `first-migration-and-owner-death-journal-recovery`, `migration-durable-exit-receipt-platform-matrix` |
| `ac2` | `both-IDE-real-terminal-tui-and-startup-matrix`, `upgrade-accept-dismiss-plugin-update-consent`, `dependency-prompt-and-migration-diagnostics-parity`, `missing-Windows-never-counts-as-pass`, `Windows-correlated-bridge-cancellation-parity`, `bridge-hello-ready-target-matrix` |
| `ac3` | `host-v2-home-endpoint-mutation-sentinel`, `no-elevation-no-daemon-kill-control-sentinel`, `bounded-owned-fixture-cleanup-and-diagnostics` |

## 7. Alternatives considered

### 7.1 a1: Explicit matrix with immutable evidence records — **CHOSEN**

Each target/scenario records exact candidate, environment and observed result.

Run bounded test scenarios against disposable installations and record pass/fail/unavailable per exact OS/architecture/runtime/source/archive identity. Reuse the canonical test coordinator and native IDE sandboxes.

Publication/readiness is gated by complete matching evidence for the advertised target; unit/fixture results and translated-host results are never silently promoted to native coverage.

### 7.2 a2: One aggregate cross-platform smoke result

Run a common smoke script and publish one consolidated status.

Use the same isolated scenarios but aggregate all outcomes into one report after runners finish. Detailed logs can still be retained per runner.

To meet the HLD, this design still needs explicit target/provenance fields and unavailable statuses, so the aggregate adds no simplification to the underlying evidence model.

**Rejected because:** An aggregate smoke result does not remove the required target/provenance matrix and risks hiding missing native coverage.

## 8. References

- **[[c1]]** `doc` `AGENTS.md`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/HLD.md`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/DEF.md`
- **[[c4]]** `analyze-bundle` `scripts/test-harness/run.mjs`
- **[[c5]]** `analyze-bundle` `scripts/test-harness/build.mjs`
- **[[c6]]** `analyze-bundle` `vscode-plugin/src/activation.ts`
- **[[c7]]** `analyze-bundle` `jetbrains-plugin/src/main/kotlin/ai/insors/insrc/jetbrains/daemon/UnixSocketDaemonRpc.kt`
- **[[c8]]** `doc` `docs/testing.md`
- **[[c9]]** `stakeholder` `User-selected Linux OrbStack and existing macOS UTM validation; Windows remains required and not inferred from Linux/macOS.`
