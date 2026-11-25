<!-- insrc:artifact PLAN-c3d71313f34bce71-s3 -->

# Plan: STORY-c3d71313f34bce71-s3

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**LLD run:** `wf-1795544885792-xw1ws3`
**LLD effective hash:** `acb12724c316...`

Build the production dependency adapter on the completed installer foundation, with truthful read-only checks, exact terminal consent, bounded platform payload preparation and a durable user-session Ollama handoff. Ten ordered tasks separate the two extraction paths, publication, service behavior and manager/packaging integration; Linux ARM64 auto-install must pass real OrbStack qualification before enablement. Run surrounding tests for each task, then one complete S1/S2/S3 installer regression after implementation; final human BUILD approval follows story validation.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define private dependency context and qualified offer policy | S | — | — | unit: dependency-policy-and-offer-bind-exact-target-home-destination-and-side-effects; unit: private-context-preserves-public-wire-shapes-and-rejects-unowned-install | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Implement bounded read-only dependency and coding-agent detection | M | — | `t1` | unit: dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable; integration: healthy-service-without-path-binary-is-reused; integration: inspect-and-decline-have-zero-mutation-or-process-side-effects; unit: stopped-existing-ollama-has-manual-guidance-without-start-action; unit: agent-zero-one-many-detection-never-spawns-auth-model-or-install; unit: private-runtime-provenance-rejects-path-node-and-wrong-target | [[c1]] [[c3]] [[c4]] [[c5]] |
| 3 | **`t3`** Implement bounded Linux zstd and tar decoding | M | — | `t1` | integration: linux-zstd-large-window-truncation-and-output-bombs-refuse-before-unsafe-write; integration: linux-tar-path-collision-device-and-link-escape-inputs-stay-contained; integration: stream-decoding-cancellation-yields-and-leaves-no-published-payload | [[c2]] [[c5]] [[c6]] |
| 4 | **`t4`** Implement qualified ZIP layouts and contained archive alias materialization | M | — | `t1`, `t3` | integration: qualified-zip-app-layout-requires-correct-executable-and-library-closure; integration: internal-archive-links-materialize-only-qualified-contained-files; integration: zip-and-layout-escapes-collisions-and-abort-preserve-existing-bytes | [[c2]] [[c5]] [[c6]] |
| 5 | **`t5`** Prepare and durably publish immutable private Ollama payloads | M | — | `t1`, `t2`, `t3`, `t4` | integration: stale-forged-and-cross-home-offers-reject-before-mutation; integration: consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state; integration: download-size-digest-layout-and-fsync-failures-never-report-ready; integration: finite-actor-closure-uncertainty-blocks-retry-and-cleanup; integration: private-preparation-cancellation-blocks-later-publication | [[c1]] [[c2]] [[c3]] [[c7]] [[c8]] |
| 6 | **`t6`** Implement consented user-session service handoff and reconciliation | M | — | `t2`, `t5` | integration: service-admission-is-durable-and-distinct-from-finite-preparation-drain; integration: interrupted-attempt-reconciles-existing-receipt-without-duplicate-download-or-spawn; integration: owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener; integration: service-admission-cancellation-retains-only-explicitly-accepted-service-intent | [[c2]] [[c3]] [[c4]] [[c8]] |
| 7 | **`t7`** Integrate dependency context and exact consent into manager and terminal | M | — | `t2`, `t5`, `t6` | integration: accepted-official-payload-is-user-only-and-discloses-install-and-start; integration: cancellation-and-eof-block-later-publication-or-service-admission; integration: terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions; integration: dependency-uncertain-recovery-preserves-operation-and-prevents-duplicate-side-effects | [[c1]] [[c2]] [[c3]] [[c8]] [[c9]] |
| 8 | **`t8`** Compose and package the real dependency adapter in both control entrypoints | S | — | `t7` | integration: production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5; smoke: published-control-payload-includes-real-dependency-adapter-without-application-boot-imports; integration: both-control-entrypoints-use-identical-installation-bound-dependency-policy | [[c1]] [[c2]] [[c9]] [[c10]] |
| 9 | **`t9`** Qualify the Linux OrbStack dependency route and gate other exact targets | L | — | `t8` | live: qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target; live: existing-installation-reuse-and-decline-preserve-platform-state; live: official-large-archive-streaming-and-library-layout-match-policy; unit: enabled-target-policy-requires-matching-native-evidence-and-mandatory-linux-route | [[c5]] [[c6]] [[c10]] [[c11]] |
| 10 | **`t10`** Run the final composed installer regression and reconcile evidence | M | — | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8`, `t9` | smoke: combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup; integration: terminal-install-upgrade-consent-and-ready-before-tui-regressions | [[c2]] [[c5]] [[c9]] [[c10]] [[c11]] |

### 1.1 TASK-c3d71313f34bce71-s3-t1 — Define private dependency context and qualified offer policy

Add S3 private operation/probe context and schema-checked immutable Ollama policy/attempt identity helpers in the proposed dependency modules and existing internal peer contracts. Preserve all foundational wire schemas.

**Acceptance checks:**
- DependencyReport, DependencyDecision, ManagerRequest and their JSON schemas/protocols remain unchanged; optional internal probe/operation context is source compatible with existing fixtures.
- A qualified entry binds exact target/baseline/version/official immutable URL/SHA256/byte and extraction limits/layout/executable/endpoint/model-log paths/start intent; invalid, incomplete or unqualified entries never generate an offer.
- Canonical offer id binds installation identity/home, target, destination, endpoint, effective side effects and current absence state; encode within the existing token bound.
- Define operation/attempt identity and bounded progress/current-owner/signal context without exposing ControllerStore, release publication, lifecycle, migration or application-data capability.

### 1.2 TASK-c3d71313f34bce71-s3-t2 — Implement bounded read-only dependency and coding-agent detection

Build truthful runtime/Ollama state inspection and executable-only claude/codex/vibe detection behind the existing DependencyPort, without any installation or provider side effects.

**Acceptance checks:**
- Inspection completes within one 3-second aggregate budget, performs no writes/downloads/spawns, and uses exact owned runtime/target provenance rather than PATH Node/npm.
- Loopback version GET has a 16 KiB response bound, no redirect/credential/remote-host fallback, and accurately distinguishes ready, installed-not-running, missing and unavailable across refused/slow/malformed/permission/configuration cases.
- A ready endpoint without PATH Ollama is reused; a stopped existing binary gets quoted manual serve guidance without an install offer or invented start action; non-ready required dependencies remain visible blockers.
- Bounded absolute candidate/PATH/PATHEXT and known user/macOS-app lookup reports zero/one/many agent binaries, with lookup diagnostics; never execute an agent, authenticate, call models, or make an agent a required blocker.
- Offers appear only for qualified missing routes with clean private destination absence; decline returns unchanged unmet state without mutation.

### 1.3 TASK-c3d71313f34bce71-s3-t3 — Implement bounded Linux zstd and tar decoding

Add the pinned bundled fzstd streaming path and validated tar reader for official Linux payloads, reusing existing safe path/inventory patterns and returning controlled layout metadata for later qualified alias materialization.

**Acceptance checks:**
- Pin and bundle the decoder; validate zstd frame/window headers before allocation, enforce its 2^25-byte backreference limit and compressed/expanded/per-file/count/memory bounds, and fail closed on malformed/truncated/multiframe input.
- Canonical tar members reject traversal, absolute/drive/UNC paths, ADS, collisions, device nodes and link escapes before any unsafe write; link metadata is never traversed or created as an on-disk archive link.
- Bound parsing/output chunks and yield/check AbortSignal so cancellation and progress remain responsive; errors leave only contained private staging with no publication.
- Linux extraction never invokes the privileged upstream installer, root/system decompressor, GPU driver setup or model work. Actual large official-archive qualification remains the later route task.

### 1.4 TASK-c3d71313f34bce71-s3-t4 — Implement qualified ZIP layouts and contained archive alias materialization

Add qualified standalone Windows ZIP/macOS app layout handling and the bounded shared materializer for explicitly allowed internal regular-file aliases, preserving required libraries and strict existing bundle rules.

**Acceptance checks:**
- Validate ZIP directory/member metadata, paths, bytes/count/expansion limits, compression/truncation and collisions before writes, using S3-specific policy without weakening unrelated S1 safe-zip acceptance.
- Qualify Windows standalone CLI/library and macOS user-local app/CLI layouts; reject missing/wrong executable/library members and never launch setup/GUI/global-link/quarantine-removal/system-service actions.
- For both tar and ZIP/app layouts, materialize only policy-qualified contained regular-file alias targets with bounded cycles/depth/expanded output; directory aliases need an explicitly qualified complete layout. Published dependency trees contain no traversable archive links.
- Path aliases cannot escape via case/Unicode/drive/UNC/ADS/symlink/reparse-point differences; unqualified aliases/layouts produce concrete limitations and preserve existing destination bytes.
- Abort/error leaves only contained unpublished private stage; no elevation, host PATH edits, application boot imports or archive-side commands.

### 1.5 TASK-c3d71313f34bce71-s3-t5 — Prepare and durably publish immutable private Ollama payloads

Implement consent-rechecked bounded download, private staging, complete inventory/receipt verification, finite owned-work drain and exclusive durable publication under the manager-supplied S3 context.

**Acceptance checks:**
- Production install acceptance requires valid manager-owned operation context and exact current offer; recompute before first side effect and immediately before publication; policy/path/endpoint/existing-install races reject stale.
- Download enforces exact bytes/SHA256/HTTPS and S3 asset limits without inheriting an inappropriate S1 bundle cap; overall finite preparation deadline is 20 minutes and cleanup deadline is 5 seconds with bounded diagnostics.
- Derive contained user-owned staging, payload and attempt paths from the selected home; complete inventory/layout verification precedes publication and same-id reuse requires all receipt/inventory/target bytes to agree.
- Flush payload/receipt files, bottom-up directories and source/destination parents using existing filesystem-only durability and non-replacing publication; publication/fsync uncertainty never becomes false success or overwrite.
- Abort/EOF/current-owner loss prevents later admission, drains finite work and deletes only proven-private unpublished staging after positive closure. Unknown admitted/cooperating actor closure retains evidence and returns dependency-uncertain for manager blocking.
- Adapter writes private dependency records only; incumbent daemon release/data/running intent and existing Ollama binaries/services remain untouched.

### 1.6 TASK-c3d71313f34bce71-s3-t6 — Implement consented user-session service handoff and reconciliation

Start only the accepted qualified private Ollama executable, separate its intentional retained lifetime from finite preparation, and reconcile interrupted attempt/receipt/endpoint state without replaying uncertain work.

**Acceptance checks:**
- Verify the immutable published payload and reprobe existing service before durable service-start admission; a healthy existing service is reused without spawn, stop or replacement.
- After explicit install-and-start consent and immediately rechecked cancellation/owner state, launch only the absolute qualified executable with argv and scoped sanitized OLLAMA_HOST/OLLAMA_MODELS/log environment; no shell, global PATH, system service or implicit models.
- Record service admission before spawn and truthful outcome/readiness after it; a 30-second version probe checks availability, and spawn/exit/port/timeout errors never claim endpoint process ownership or authorize stopping another listener.
- Finite preparation drain excludes only the explicitly recorded intentionally retained service; cancellation before admission forbids launch, while later cancellation halts installer continuation and describes retained installed/unverified service state without promising rollback.
- Fresh-process inspection of interrupted attempts validates identities/inventory/receipt and current endpoint without automatic download/spawn. Reuse ready service, diagnose a proven stopped binary, and block unresolved finite actors or ambiguous admitted launch until evidence reconciles.
- Retries do not create a second unconfirmed service or replace payload identity; no PID/age/free-lock/log-line inference, application DB access or daemon lifecycle operation is introduced.

### 1.7 TASK-c3d71313f34bce71-s3-t7 — Integrate dependency context and exact consent into manager and terminal

Thread S3 probe/mutation context through the existing terminal and lock-owning manager, record preparation before side effects, and preserve blocked recovery/cancellation with unchanged public request/report shapes.

**Acceptance checks:**
- Terminal displays version/destination/endpoint/start/model-log side effects and asks Install and start Ollama with default no; only its explicit existing DependencyDecision reaches mutation. IDE flags and ManagerRequest.installOllama cannot grant consent.
- Manager persists the current operation/preparing intent and supplies bound operation/attempt/signal/current-owner/progress context before dependency mutation, while retaining sole controller ownership.
- Recheck consent under lock, reject stale replacements without silent acceptance, preserve dependent cancellation before/after awaited probes/decision and before any later shutdown/publication/service start.
- dependency-uncertain retains a blocked operation and private evidence instead of clearing it. Explicit same-operation recovery reconciles recorded dependency evidence before ordinary continuation and cannot duplicate unconfirmed work.
- Preserve read-only inspect/check-upgrade semantics, stop/recovery bypass of dependency-health checks, actual sibling-port admission, immutable delivery/source identity, and existing ready/lock-release/TUI/cancellation/retry semantics.

### 1.8 TASK-c3d71313f34bce71-s3-t8 — Compose and package the real dependency adapter in both control entrypoints

Wire S3 into productionPeers and package its policy/decoder/helpers into target-specific manager/bootstrap artifacts, retaining real S1/S2 delivery and explicit missing S4/S5 capabilities.

**Acceptance checks:**
- Both existing managerMain and terminalMain productionPeers callers obtain the same installation/target-bound production dependency adapter; factory construction performs no probes, writes, installs or provider boot.
- Keep actual bundle/dev adapters and exact private-runtime provenance; lifecycle/migration peers remain absent until their owning stories supply them, with truthful capability-unavailable rather than fixture success.
- Update only directly affected installed-dev composition/asset expectations; package the pinned decoder/policy and proposed dependency helpers without importing daemon/indexer/config-store/provider/DB application boot.
- Fresh target-control process can load/inspect the S3 adapter through its private runtime with no host Node/npm/tool dependency, no broad spawn-scanner exemption and no changed daemon IPC or IDE install flow.

### 1.9 TASK-c3d71313f34bce71-s3-t9 — Qualify the Linux OrbStack dependency route and gate other exact targets

Exercise the completed S3 adapter with a pinned official Ollama payload in a disposable Linux ARM64 OrbStack guest, enable that exact passing route, and record evidence/limitations for the planned macOS/Windows/native-x64 routes.

**Acceptance checks:**
- Provision/use a disposable Linux ARM64 OrbStack environment and actually install the exact official payload with the selected private Node toolchain, exercising large archive/library layout, executable version and user-session readiness without models/elevation/global writes.
- Record exact version/URL/SHA256/compressed-expanded sizes/target-baseline/native-versus-translated status, decoder limits, private filesystem/argv/env/log results, reuse/decline and finite cleanup/retained-service evidence; enable Linux auto-install only for the route actually qualified.
- A Linux payload/decoder/platform failure is a real story blocker requiring diagnosis or user-directed design correction, not a fabricated pass or silent removal of Linux support.
- For each planned darwin/linux/win32 × arm64/x64 target, record either native exact-policy payload qualification before offer enablement or a concrete pending/unavailable/unsupported reason and manual user-level guidance. Use the existing macOS ARM64 UTM guest and genuine available Windows/native-x64 runners for dependency-only validation; translated evidence is explicitly labeled and cannot certify native gaps. A missing optional environment cannot silently enable a route or hide the required Linux result.
- Do not mutate/restart installed host daemon/Ollama or claim full daemon installation, migration, IDE, signing or complete S8 platform-matrix qualification. Preserve all Linux/macOS/Windows targets in the plan and evidence table.

### 1.10 TASK-c3d71313f34bce71-s3-t10 — Run the final composed installer regression and reconcile evidence

After all implementation and route-qualification tasks, run the complete scoped S1/S2/S3 installer regression once and record exact coverage/fingerprints/build/cleanup evidence plus current limitations.

**Acceptance checks:**
- Run the canonical Node 22 installer test selection only after t1–t9 are built and task-local checks pass, including all S1/S2/S3 installer files, installation-home, relevant build/scanner/coordinator and packaging regression cases; no unrelated backend sweep.
- The final audit reconciles exact selected files, discovered/executed test counts with zero skips/failures/cancellations, current source/output fingerprints, successful canonical build and per-admission close/disposal journals with confirmed finite-work cleanup. Include the split archive paths and current S3 production packaging/qualification evidence in the recorded selection and audit.
- Keep intentionally retained dependency-service evidence separate from finite actor closure; fixture tests clean their owned services explicitly and never leave unaccounted work.
- Record real Linux OrbStack exact-route evidence and any separately qualified target results/limits; passing fakes/native host tests do not claim unsupported target/VM/IDE/migration qualification.
- Update story validation evidence and keep the relevant S3 sequence/ownership documentation aligned with any approved implementation refinements. Human final BUILD presentation/approval follows validation and is not a precondition of this task acceptance.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable | `t2` |
| healthy-service-without-path-binary-is-reused | `t2` |
| inspect-and-decline-have-zero-mutation-or-process-side-effects | `t2`, `t7` |
| stale-forged-and-cross-home-offers-reject-before-mutation | `t1`, `t5`, `t7` |
| stopped-existing-ollama-has-manual-guidance-without-start-action | `t2`, `t7` |
| agent-zero-one-many-detection-never-spawns-auth-model-or-install | `t2` |
| private-runtime-provenance-rejects-path-node-and-wrong-target | `t2`, `t8` |
| accepted-official-payload-is-user-only-and-discloses-install-and-start | `t5`, `t6`, `t7` |
| consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state | `t5`, `t7` |
| hostile-archive-and-large-zstd-window-fail-before-unsafe-write-or-allocation | `t3`, `t4` |
| internal-archive-links-materialize-only-qualified-contained-files | `t4` |
| download-size-digest-layout-and-fsync-failures-never-report-ready | `t5` |
| cancellation-and-eof-block-later-publication-or-service-admission | `t3`, `t5`, `t6`, `t7` |
| finite-actor-closure-uncertainty-blocks-retry-and-cleanup | `t5`, `t7` |
| service-admission-is-durable-and-distinct-from-finite-preparation-drain | `t6` |
| interrupted-attempt-reconciles-existing-receipt-without-duplicate-download-or-spawn | `t6`, `t7` |
| owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener | `t6` |
| production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5 | `t8` |
| terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions | `t7`, `t10` |
| qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target | `t9` |
| existing-installation-reuse-and-decline-preserve-platform-state | `t9` |
| official-large-archive-streaming-and-library-layout-match-policy | `t9` |
| combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup | `t10` |
| published-control-payload-includes-real-dependency-adapter-without-application-boot-imports | `t8`, `t10` |
| terminal-install-upgrade-consent-and-ready-before-tui-regressions | `t7`, `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#2-contract-details` — "DependencyPort/DependencyReport/productionPeers/runTerminalInstall interfaces; optional internal context and unchanged public wire schemas."
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#3-data-model-changes` — "Dependency operation context and integration boundary: bound operation/attempt, current-owner/signal/progress; manager-only controller writes and blocked uncertainty."
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#3-data-model-changes` — "Immutable qualified Ollama policy and exact offer: exact target/version/asset/layout/limits/destination/endpoint/side effects and stale rechecks."
- **[[c4]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#3-data-model-changes` — "Detection and service-state table: bounded runtime/local endpoint/executable-only agent checks, truthful stopped/missing/unavailable classification."
- **[[c5]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#6-error-paths` — "Error cases, valid edge cases and preserved invariants: consent races, probe/archive/fsync/cancellation/port/ownership/interruption failure behavior."
- **[[c6]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#3-data-model-changes` — "Platform extraction and endpoint compatibility: bounded fzstd/tar/ZIP/app layouts, contained alias materialization, no elevation/system installer or published links."
- **[[c7]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#3-data-model-changes` — "Private payload, receipt and filesystem ownership: exact verification, finite preparation budget/drain, immutable no-replace publication and durable namespaces."
- **[[c8]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#3-data-model-changes` — "Consented Ollama service handoff and interrupted attempts: admitted retained service versus finite preparation, readiness, cancellation and no blind replay."
- **[[c9]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#7-test-strategy` — "Contract/integration/smoke strategy, acceptance mapping and surrounding per-task tests followed by one final combined installer regression."
- **[[c10]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#3-data-model-changes` — "Composition, packaging and verification boundaries: both entrypoints, real S1/S2 delivery, dependency adapter, truthful absent S4/S5, control import isolation."
- **[[c11]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#7-test-strategy` — "Live target qualification: mandatory first Linux ARM64 OrbStack route, separate macOS UTM/Windows/native-x64 evidence and no enabled target inferred from fixtures."
