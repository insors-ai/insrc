<!-- insrc:artifact PLAN-c3d71313f34bce71-s3 -->

# Plan: STORY-c3d71313f34bce71-s3

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**LLD run:** `wf-1795622684271-4t6oq9`
**LLD effective hash:** `ca69fcdcd2b0...`

Preserve the 11 completed S3 tasks and their historical evidence, then apply approved LLD revision6 in seven coherent correction batches. Explicit install Retry completes safe owned cleanup before normal fresh installation; update and later candidate/hook recovery remain separate. Each batch runs surrounding tests, followed by observed Linux native qualification and one composed S1/S2/S3 installer regression with current fingerprints and positive finite-actor closure. Final human BUILD approval occurs after all tasks validate.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define private dependency context and qualified offer policy | S | approved r1 | — | unit: dependency-policy-and-offer-bind-exact-target-home-destination-and-side-effects; unit: private-context-preserves-public-wire-shapes-and-rejects-unowned-install | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Implement bounded read-only dependency and coding-agent detection | M | approved r1 | `t1` | unit: dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable; integration: healthy-service-without-path-binary-is-reused; integration: inspect-and-decline-have-zero-mutation-or-process-side-effects; unit: stopped-existing-ollama-has-manual-guidance-without-start-action; unit: agent-zero-one-many-detection-never-spawns-auth-model-or-install; unit: private-runtime-provenance-rejects-path-node-and-wrong-target | [[c1]] [[c3]] [[c4]] [[c5]] |
| 3 | **`t3`** Implement bounded Linux zstd and tar decoding | M | approved r1 | `t1` | integration: linux-zstd-large-window-truncation-and-output-bombs-refuse-before-unsafe-write; integration: linux-tar-path-collision-device-and-link-escape-inputs-stay-contained; integration: stream-decoding-cancellation-yields-and-leaves-no-published-payload | [[c2]] [[c5]] [[c6]] |
| 4 | **`t4`** Implement qualified ZIP layouts and contained archive alias materialization | M | approved r1 | `t1`, `t3` | integration: qualified-zip-app-layout-requires-correct-executable-and-library-closure; integration: internal-archive-links-materialize-only-qualified-contained-files; integration: zip-and-layout-escapes-collisions-and-abort-preserve-existing-bytes | [[c2]] [[c5]] [[c6]] |
| 5 | **`t5`** Prepare and durably publish immutable private Ollama payloads | M | draft r2 | `t1`, `t2`, `t3`, `t4` | integration: stale-forged-and-cross-home-offers-reject-before-mutation; integration: consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state; integration: download-size-digest-layout-and-fsync-failures-never-report-ready; integration: finite-actor-closure-uncertainty-blocks-retry-and-cleanup; integration: private-preparation-cancellation-blocks-later-publication | [[c1]] [[c2]] [[c3]] [[c7]] [[c8]] |
| 6 | **`t6`** Implement consented user-session service handoff and reconciliation | M | approved r1 | `t2`, `t5` | integration: service-admission-is-durable-and-distinct-from-finite-preparation-drain; integration: interrupted-attempt-reconciles-existing-receipt-without-duplicate-download-or-spawn; integration: owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener; integration: service-admission-cancellation-retains-only-explicitly-accepted-service-intent | [[c2]] [[c3]] [[c4]] [[c8]] |
| 7 | **`t7`** Integrate dependency context and exact consent into manager and terminal | M | approved r1 | `t2`, `t5`, `t6` | integration: accepted-official-payload-is-user-only-and-discloses-install-and-start; integration: cancellation-and-eof-block-later-publication-or-service-admission; integration: terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions; integration: dependency-uncertain-recovery-preserves-operation-and-prevents-duplicate-side-effects | [[c1]] [[c2]] [[c3]] [[c8]] [[c9]] |
| 8 | **`t8`** Compose and package the real dependency adapter in both control entrypoints | S | approved r1 | `t7` | integration: production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5; smoke: published-control-payload-includes-real-dependency-adapter-without-application-boot-imports; integration: both-control-entrypoints-use-identical-installation-bound-dependency-policy | [[c1]] [[c2]] [[c9]] [[c10]] |
| 9 | **`t11`** Remove repeated installed-file hashing from dependency validation | M | approved r1 | `t5`, `t6`, `t7`, `t8` | integration: inspection-and-reconciliation-share-three-second-bound-without-payload-hashing; integration: receipt-closure-and-layout-errors-block-reuse-without-content-rehash; integration: same-size-installed-content-change-does-not-trigger-digest-reverification; integration: archive-digest-mismatch-still-rejects-live-acquisition; integration: reuse-and-service-admission-never-rehash-installed-files | [[c12]] [[c13]] |
| 10 | **`t9`** Qualify the Linux OrbStack dependency route and gate other exact targets | L | draft r2 | `t8`, `t11` | live: qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target; live: existing-installation-reuse-and-decline-preserve-platform-state; live: official-large-archive-streaming-and-library-layout-match-policy; unit: enabled-target-policy-requires-matching-native-evidence-and-mandatory-linux-route; live: native-large-payload-inspection-avoids-content-reads-within-three-seconds | [[c5]] [[c6]] [[c10]] [[c11]] |
| 11 | **`t10`** Run the final composed installer regression and reconcile evidence | M | draft r2 | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8`, `t9`, `t11` | smoke: combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup; integration: terminal-install-upgrade-consent-and-ready-before-tui-regressions | [[c2]] [[c5]] [[c9]] [[c10]] [[c11]] |
| 12 | **`t12`** Complete dependency attempt closure and explicit cleanup primitives | L | — | `t10`, `t11` | integration: stale-forged-and-cross-home-offers-reject-before-mutation; integration: consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state; integration: download-size-digest-layout-and-fsync-failures-never-report-ready; integration: cancellation-and-eof-block-later-publication-or-service-admission; integration: unknown-actor-proof-blocks-install-retry-cleanup; integration: cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect; integration: repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first; integration: qualified-in-process-lock-proof-excludes-live-inherited-and-unknown-actors; integration: late-settlement-records-true-outcome-and-completes-disposal-under-held-handle; integration: policy-change-reconciles-exact-accepted-copy-without-current-policy-substitution; integration: immutable-record-publication-never-replaces-existing-target-and-cleans-owned-temp | [[c14]] [[c15]] [[c16]] |
| 13 | **`t13`** Add terminal install Retry cleanup gate and durable offer recovery | L | — | `t12` | integration: inspect-and-decline-have-zero-mutation-or-process-side-effects; integration: stale-forged-and-cross-home-offers-reject-before-mutation; integration: accepted-official-payload-is-user-only-and-discloses-install-and-start; integration: consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state; integration: explicit-install-retry-completes-cleanup-before-fresh-install; integration: terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions; integration: install-retry-requires-explicit-terminal-admission-and-original-install-intent; integration: upgrade-retry-never-enters-install-cleanup-or-changes-selected-release; integration: cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect; integration: repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first; integration: fresh-bundle-peer-validates-durable-descriptor-without-resolve-map; integration: decline-creates-no-dependency-context-record-or-process-and-remains-certain | [[c14]] [[c15]] [[c16]] [[c17]] |
| 14 | **`t14`** Close supervisor signal and retained-service reporting gaps | M | — | `t12`, `t13` | integration: cancellation-and-eof-block-later-publication-or-service-admission; integration: service-admission-is-durable-and-distinct-from-finite-preparation-drain; integration: owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener; integration: terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions; integration: sighup-sigterm-and-sigkill-at-preparation-and-handoff-preserve-correct-evidence; integration: supervisor-log-validation-and-pre-spawn-failures-have-bounded-not-started-diagnostics; integration: production-worker-dispatch-argv-path-and-sanitized-environment-with-seeded-sentinels; integration: supervisor-death-does-not-imply-retained-service-death-or-authorize-replay; integration: retained-service-cancellation-is-explicit-and-total-deadline-bounds-readiness | [[c14]] [[c15]] [[c18]] |
| 15 | **`t15`** Preserve verified ZIP descriptor and expand archive boundary coverage | M | — | `t12` | integration: hostile-archive-and-large-zstd-window-fail-before-unsafe-write-or-allocation; integration: internal-archive-links-materialize-only-qualified-contained-files; integration: download-size-digest-layout-and-fsync-failures-never-report-ready; integration: archive-digest-mismatch-still-rejects-live-acquisition; integration: zip-extraction-uses-verified-descriptor-across-path-swap-and-positive-close; integration: hostile-tar-zstd-zip-boundary-matrix-rejects-before-unsafe-write; integration: alias-copy-cancellation-closes-before-owned-cleanup | [[c14]] [[c15]] [[c19]] |
| 16 | **`t16`** Make detection diagnostics and validation tests non-vacuous | M | — | `t12`, `t13`, `t14`, `t15` | integration: dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable; integration: healthy-service-without-path-binary-is-reused; integration: inspect-and-decline-have-zero-mutation-or-process-side-effects; integration: stopped-existing-ollama-has-manual-guidance-without-start-action; integration: agent-zero-one-many-detection-never-spawns-auth-model-or-install; integration: inspection-and-reconciliation-share-three-second-bound-without-payload-hashing; integration: receipt-closure-and-layout-errors-block-reuse-without-content-rehash; integration: same-size-installed-content-change-does-not-trigger-digest-reverification; integration: reuse-and-service-admission-never-rehash-installed-files; integration: invalid-receipt-closure-layout-reject-with-specific-code-and-zero-transport-calls; integration: payload-read-sentinel-covers-sync-async-stream-and-path-read-entrypoints; integration: redirect-target-local-listener-is-never-contacted; integration: coding-cli-advice-emitted-once-and-install-spawn-sentinels-remain-zero | [[c14]] [[c15]] [[c20]] |
| 17 | **`t17`** Requalify exact Linux route with observed native and upstream provenance | L | — | `t13`, `t14`, `t15`, `t16` | integration: accepted-official-payload-is-user-only-and-discloses-install-and-start; live: qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target; live: existing-installation-reuse-and-decline-preserve-platform-state; live: official-large-archive-streaming-and-library-layout-match-policy; live: native-large-payload-inspection-avoids-content-reads-within-three-seconds; live: native-platform-glibc-translation-and-upstream-digest-provenance-are-observed; live: native-write-observations-and-cache-advice-are-recorded-with-limits | [[c14]] [[c15]] [[c21]] |
| 18 | **`t18`** Run final scoped regression and refresh manual review evidence | M | — | `t12`, `t13`, `t14`, `t15`, `t16`, `t17` | integration: private-runtime-provenance-rejects-path-node-and-wrong-target; integration: production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5; smoke: combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup; smoke: published-control-payload-includes-real-dependency-adapter-without-application-boot-imports; smoke: terminal-install-upgrade-consent-and-ready-before-tui-regressions | [[c14]] [[c15]] [[c16]] [[c21]] [[c22]] |

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

Implement consent-rechecked bounded download, private staging, bounded inventory/receipt identity validation, finite owned-work drain and exclusive durable publication under the manager-supplied S3 context.

**Acceptance checks:**
- Production install acceptance requires valid manager-owned operation context and exact current offer; recompute before first side effect and immediately before publication; policy/path/endpoint/existing-install races reject stale.
- Download enforces exact bytes/SHA256/HTTPS and S3 asset limits without inheriting an inappropriate S1 bundle cap; overall finite preparation deadline is 20 minutes and cleanup deadline is 5 seconds with bounded diagnostics.
- Derive contained user-owned staging, payload and attempt paths from the selected home; safe inventory/layout validation precedes publication and same-id reuse requires receipt/inventory/target metadata and positive preparation closure to agree; t11 removes redundant installed-content rereads.
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

### 1.9 TASK-c3d71313f34bce71-s3-t11 — Remove repeated installed-file hashing from dependency validation

Apply the approved S3 verification boundary across staged second-pass validation, installed reuse, reconciliation and service admission. Keep live archive SHA-256 and bounded metadata/layout/header/closure checks without changing public contracts or adding a deep-verification phase.

**Acceptance checks:**
- Verify exact official compressed archive size/SHA-256 during live acquisition and reject mismatch before publication; preserve bounded contained extraction and qualified layout/target-header checks.
- Remove full-file content hash rereads of staged/extracted/installed Ollama payloads from validation, same-ID reuse, fresh read-only inspection/reconciliation and service admission. Existing streaming member hashes may remain for inventory schema compatibility; small inventory-record digests remain for identity binding.
- Retain canonical bounded receipt/inventory/policy/version/target/archive identity and positive preparation/finite-handoff closure/admission bindings. Preserve safe path/ancestor/link/reparse/regular-file/size/mode/required-layout checks and bounded target header reads. Invalid or uncertain evidence blocks mutation without automatic re-download, overwrite or spawn.
- Read-only inspection and recorded-attempt reconciliation use one aggregate three-second cancellation-aware budget; no twenty-second extension, digest cache, new certificate, parallel hashing worker or new wire field.
- Tests demonstrate no full installed-content reads in inspection/reconciliation/reuse/service admission, including same-size content changes that no longer trigger digest verification; receipt/closure/layout/size/link errors still fail and cancelled/late work never authorizes mutation.
- Preserve stop bypass, terminal exact consent, intentionally retained service semantics and manager ownership. Do not modify Node verification, S1/S2 packaging or host daemon/Ollama. Record this as a corrective follow-up; completed t1-t8 evidence remains historical.

### 1.10 TASK-c3d71313f34bce71-s3-t9 — Qualify the Linux OrbStack dependency route and gate other exact targets

Exercise the completed S3 adapter with a pinned official Ollama payload in a disposable Linux ARM64 OrbStack guest, enable that exact passing route, and record evidence/limitations for the planned macOS/Windows/native-x64 routes.

**Acceptance checks:**
- Provision/use a disposable Linux ARM64 OrbStack environment and actually install the exact official payload with the selected private Node toolchain, exercising large archive/library layout, executable version and user-session readiness without models/elevation/global writes.
- Record exact version/URL/SHA256/compressed-expanded sizes/target-baseline/native-versus-translated status, decoder limits, private filesystem/argv/env/log results, reuse/decline and finite cleanup/retained-service evidence; enable Linux auto-install only for the route actually qualified.
- A Linux payload/decoder/platform failure is a real story blocker requiring diagnosis or user-directed design correction, not a fabricated pass or silent removal of Linux support.
- For each planned darwin/linux/win32 × arm64/x64 target, record either native exact-policy payload qualification before offer enablement or a concrete pending/unavailable/unsupported reason and manual user-level guidance. Use the existing macOS ARM64 UTM guest and genuine available Windows/native-x64 runners for dependency-only validation; translated evidence is explicitly labeled and cannot certify native gaps. A missing optional environment cannot silently enable a route or hide the required Linux result.
- Do not mutate/restart installed host daemon/Ollama or claim full daemon installation, migration, IDE, signing or complete S8 platform-matrix qualification. Preserve all Linux/macOS/Windows targets in the plan and evidence table.
- Re-run fresh-process inspection on the actual multi-GB private payload with the corrected no-rehash code; record total inspection latency and absence of full payload content reads under the existing three-second target. Preserve historical cold full-hash failure as superseded evidence, never relabel it passed. Enable only the currently qualified route.

### 1.11 TASK-c3d71313f34bce71-s3-t10 — Run the final composed installer regression and reconcile evidence

After all implementation and route-qualification tasks, run the complete scoped S1/S2/S3 installer regression once and record exact coverage/fingerprints/build/cleanup evidence plus current limitations.

**Acceptance checks:**
- Run the canonical Node 22 installer test selection only after t1–t9 plus t11 are built and task-local checks pass, including all S1/S2/S3 installer files, installation-home, relevant build/scanner/coordinator and packaging regression cases; no unrelated backend sweep.
- The final audit reconciles exact selected files, discovered/executed test counts with zero skips/failures/cancellations, current source/output fingerprints, successful canonical build and per-admission close/disposal journals with confirmed finite-work cleanup. Include the split archive paths and current S3 production packaging/qualification evidence in the recorded selection and audit.
- Keep intentionally retained dependency-service evidence separate from finite actor closure; fixture tests clean their owned services explicitly and never leave unaccounted work.
- Record real Linux OrbStack exact-route evidence and any separately qualified target results/limits; passing fakes/native host tests do not claim unsupported target/VM/IDE/migration qualification.
- Update story validation evidence and keep the relevant S3 sequence/ownership documentation aligned with any approved implementation refinements. Human final BUILD presentation/approval follows validation and is not a precondition of this task acceptance.

### 1.12 TASK-c3d71313f34bce71-s3-t12 — Complete dependency attempt closure and explicit cleanup primitives

Repair the shared recovery root in owned dependency records and preparation: accepted policy, true late closure, bounded disposal, temp files and atomic no-replace evidence. Expose cleanup only to the explicit install-retry owner; do not start installation.

**Acceptance checks:**
- Persist the exact accepted policy in a strict versioned private attempt record and verify its digest/home/target/paths for historical reconciliation without substituting current catalog. Legacy v1 closure remains readable; unavailable exact legacy policy yields a concrete blocker rather than guessed policy.
- Late finite settlement records the actual outcome and completes bounded cleanup/disposal while retaining its original actor handle. Cancellation/owner loss never admits later publication/service start. Remove failed unpublished stages only after positive closure; preserve complete installed dependencies.
- Implement bounded idempotent cleanup planning and immutable per-item completion records bound to the original install/attempt; derive canonical owned targets from validated evidence. Remove only proven abandoned temporary stages/archive/temp records; preserve diagnostics, installed dependencies/services/models/logs and foreign/unknown artifacts.
- Positive closure or the exact qualified in-process-only actor/admission/non-inherited anchored-lock protocol is required and held during cleanup. Generic lock/PID/age/health cannot authorize deletion; live, external, inherited or unknown actor evidence blocks.
- Use actual atomic no-replace record publication through existing native primitives, qualifying regular-file use on supported platforms. Clean exact temp writes after known descriptor close; uncertain close/publication and interrupted disposal remain explicit retry inputs without silently weakening unknown-evidence checks.
- Interruption/deadline/cancellation at each cleanup step retains durable progress and prevents any fresh install. Surrounding records/prepare/layout tests prove true late outcome, policy changes, cleanup interruption/idempotence, and no side effects when closure is unknown.
- Retain approved finite-operation and cleanup budgets, cooperative cancellation and positive handle close. Prove held/live, unknown/external and inherited-lock actor cases cannot be disposed; cleanup budget expiry persists blocked state and permits no new install.

### 1.13 TASK-c3d71313f34bce71-s3-t13 — Add terminal install Retry cleanup gate and durable offer recovery

Integrate explicit Retry for original install dependency preparation: cleanup first, retire old operation, then normal fresh install with new identity/current consent. Make accepted bundle data survive fresh peers and keep update recovery separate.

**Acceptance checks:**
- Add approved internal InstallerManager.retryInstall terminal capability without a new ManagerRequest action. Check original durable action=install, preparing phase, exact id/home, no selected release/candidate/dev-worker/shutdown/daemon admission before cleanup writes.
- Terminal defaults Retry install to no; inspection/startup/IDE flags never trigger cleanup and no separate Discard flow is added. On yes, finish all owned cleanup and retire the old operation before ordinary install with a new operation/attempt, normal release resolution and current dependency consent.
- Cleanup failure, cancellation or process death blocks every new install/download/publication/service launch. Repeated explicit Retry completes missing cleanup steps idempotently. Preserve already installed dependencies/services as existing state found by normal fresh installation, not partial-work resume.
- Original upgrade intent never enters install cleanup. Existing update same-candidate acceptance, migration hooks, lifecycle, selected releases and installed daemon remain intact; later-stage install work with another owner blocks rather than inventing its reset policy.
- Persist complete parsed descriptor in versioned private accepted-offer data and validate canonical digest/manifest/target/delivery on fresh bundle peer construction. No factory-local Map dependency, no resolve-latest substitution; invalid/unavailable legacy exact data fails closed.
- Create dependency context/attempt data only for install choice, not decline; certain decline survives interruption without dependency-uncertain. Do not clear disruption/blocked state before positive cleanup or existing recovery completion.
- Use fresh manager AND fresh delivery peers in restart tests. Assert strict cleanup-before-install event ordering, current-offer reconsent, cancellation/death/retry, decline-zero-dependency-writes and categorical upgrade exclusion. Preserve stop/TUI/terminal-only admission regressions.
- Sentinels separately seed original upgrade intent, candidateId/durable candidate, admitted dev-preparation, shutdown and daemon migration/activation admission; every case rejects before cleanup writes. The fresh-install gate is confined to S3 dependency preparation and cannot substitute a different admitted HLD candidate.

### 1.14 TASK-c3d71313f34bce71-s3-t14 — Close supervisor signal and retained-service reporting gaps

Make finite signal drain, production worker launch and retained Ollama facts truthful across failures and process death without terminating services or controlling the host daemon.

**Acceptance checks:**
- Route EOF/SIGINT/SIGHUP/SIGTERM into cooperative finite abort/drain with bounded completion and diagnostic output. Process-death tests exercise preparation and handoff, including SIGKILL, without relying on cooperative handlers to prove hard-death closure.
- Durable service admission/launch/outcome remains separate from finite handoff markers. A stale marker does not suppress valid retained facts or truthful availability. Health never proves ownership; ambiguous launch forbids duplicate spawn and service/payload removal.
- Make pre/post-admission entrypoint regular-file/nlink/header checks identical. Known pre-spawn failures (including log creation/validation) record bound not-started outcome and bounded diagnostic file; unknown launches never get fabricated exit receipts.
- Exercise production detached launchWorker and valid --ollama-service-worker dispatch with actual argv/relative path boundaries. Test supervisor death with service possibly alive and preserve admitted service. Use isolated owned test actors and positive closure evidence.
- Seed harmless credentials/NODE_OPTIONS in parent environment before spawn and restore afterward; child allowlist must strip them. Cancellation/failure after admission explicitly says Ollama may remain.
- Use min(overall, readiness) deadline and distinguish owner loss, abort, overall timeout and startup failure. Task-local service/terminal/worker tests pass without host daemon/Ollama changes.

### 1.15 TASK-c3d71313f34bce71-s3-t15 — Preserve verified ZIP descriptor and expand archive boundary coverage

Extract ZIP from its verified descriptor and strengthen risk-focused tar/zstd/ZIP and alias-copy cancellation tests without weakening existing archive controls.

**Acceptance checks:**
- Hash/envelope validation and yauzl.fromFd extraction use the same open descriptor through actual ZIP close, with explicit positive close ownership and cancellation; no path reopen/swap window.
- Add hostile tar GNU L/K/base256-negative/PAX-size/padding/endmarker/link-data/setuid/nested-inventory vectors and zstd reserved/dictionary/content-size/skippable/dual-decoder mismatch vectors. Assert intended validation codes/paths instead of incidental EEXIST.
- Cover ZIP64 descriptors, EOCD signature in comment, Unicode extra names, gap/overlap and verified-fd path swap, plus cancellation during alias copy. Preserve byte/file/memory/path bounds and contained publication.
- Check real destination/stage/publication paths and safe event-based synchronization/margins in archive tests. No fixture can pass a no-publication assertion against an unused path.
- Run only archive/tar/ZIP/prepare surrounding selectors and relevant packaging/scanner checks for changed ownership paths; defer combined installer suite to final task.

### 1.16 TASK-c3d71313f34bce71-s3-t16 — Make detection diagnostics and validation tests non-vacuous

Strengthen no-rehash/read-only/redirect/agent assertions and actionable diagnostics, correcting the manual-review test findings without adding installation behavior.

**Acceptance checks:**
- Invalid receipt/closure/layout tests assert exact intended error codes and zero transport calls; a throwing download stub cannot mask accidental redownload. Preserve acquisition SHA checks and metadata-only installed validation.
- Expand content-read sentinel over practical sync/async/stream/path APIs and retain same-size-content cases. Demonstrate bounded metadata/header allowance without full installed-content reads.
- Use second loopback listener returning a valid version to prove redirect/remote target is never contacted; assert listener count zero instead of relying on external.invalid DNS failure.
- Provide actionable unsupported-ancestor-alias blocker while preserving S1 canonical-home/link ownership. Emit agent recommendation once and assert no coding CLI install/auth/spawn for zero/one/many presence cases.
- Replace tight wall-clock or half-written-JSON polling with hooks/events or safe margins in touched prepare/detection/validation tests; assertions must prove claimed behavior.
- Correct TESTS traceability: transient readiness timeout maps to its service test; never-installs-agent assertions are real. Run surrounding detection/validation/policy/terminal selectors only.

### 1.17 TASK-c3d71313f34bce71-s3-t17 — Requalify exact Linux route with observed native and upstream provenance

Update the qualification driver and re-run the current Linux ARM64 dependency route in OrbStack, generating claims from observed raw evidence and independently attributed official asset identity.

**Acceptance checks:**
- Record observed os.machine/process.arch/platform, uid>0, Node executable/version, raw /etc/os-release, process.report glibcVersionRuntime and meaningful translation check. Never hardcode uid501 or hand-author native/glibc conclusions.
- Capture independent official upstream asset digest/checksum source and raw supporting metadata, bind exact URL/version/bytes/SHA to it. If evidence unavailable, mark provenance/route qualification pending rather than inventing a match.
- Record scoped before/after installation-home, ~/.ollama and relevant temp-path observations; private argv/env/log/zero-model/decline/reuse results. Record unprivileged cache-advice action/result and limits; no claim of global cache eviction or exhaustive filesystem-write proof.
- Run exact pinned route under private Node22 in isolated OrbStack VM; verify large archive layout, service readiness, fresh-process inspection within three-second aggregate target and bounded payload-read behavior after corrections. Leave intentional service/finite actor status accounted and VM stopped afterward.
- Preserve previous successful and failed evidence as historical pre-review runs. Generate revised qualification summary from raw script output, with current source hashes and correct test mapping. Only native-qualified exact routes are enabled; other Linux/macOS/Windows architectures keep explicit pending/manual guidance.
- No elevation/model download/global cache drop/host daemon or host Ollama change; missing UTM/Windows/native-x64 evidence is reported honestly. Tests of the evidence validator prove wrong platform/glibc/digest/translation claims cannot enable a route.

### 1.18 TASK-c3d71313f34bce71-s3-t18 — Run final scoped regression and refresh manual review evidence

After all corrective tasks and local checks, run one composed S1/S2/S3 installer regression, reconcile current evidence and generate an updated manual-review delta packet.

**Acceptance checks:**
- Canonical Node22 build and one final all-installer plus installation-home/build/scanner/coordinator regression after t12–t17. Set INSRC_BUILD_CONFIRM_CLOSURE=1 and --concurrency=1; no unrelated backend sweep or per-task full suite.
- Audit exact selected/discovered/executed counts with zero unexplained skips/failures/cancellations; current source/output fingerprints; matching unique admission/close/disposal sets, confirmed finite closure and no unaccounted owned work.
- Keep retained-service admissions separate from finite actor closure. Account/clean isolated fixture actors without any PID/kill daemon fallback or host-service mutation.
- Update BUILD/TESTS mapping and revised native/inspection evidence; identify the prior152/152 packet as pre-review history, preserve it unchanged, and map every finding to corrected files/tests or an honest pending qualification limit.
- Keep approved sequence/ownership docs aligned and prepare a fresh /tmp/.insrc manual-review packet/delta with commits, changed files, epic/HLD/LLD/PLAN trail and raw test/native evidence. Automated review endpoints remain unavailable; do not invent CR registration or request per-task human BUILD approvals.
- Only after all tasks validate, present final story BUILD for specific human approval using available supported flow; report any known disabled-review presentation gate accurately.
- Do not renumber/reissue/rebuild completed t1–t11 as if newly failed. Their original test evidence remains historical, while t12–t18 supply current revision validation; every current LLD strategy item maps to an executing corrective/qualification/final task.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| dependency-state-matrix-distinguishes-ready-stopped-missing-and-unavailable | `t16` |
| healthy-service-without-path-binary-is-reused | `t16` |
| inspect-and-decline-have-zero-mutation-or-process-side-effects | `t13`, `t16` |
| stale-forged-and-cross-home-offers-reject-before-mutation | `t12`, `t13` |
| stopped-existing-ollama-has-manual-guidance-without-start-action | `t16` |
| agent-zero-one-many-detection-never-spawns-auth-model-or-install | `t16` |
| private-runtime-provenance-rejects-path-node-and-wrong-target | `t18` |
| accepted-official-payload-is-user-only-and-discloses-install-and-start | `t13`, `t17` |
| consent-races-on-policy-destination-and-endpoint-never-overwrite-existing-state | `t12`, `t13` |
| hostile-archive-and-large-zstd-window-fail-before-unsafe-write-or-allocation | `t15` |
| internal-archive-links-materialize-only-qualified-contained-files | `t15` |
| download-size-digest-layout-and-fsync-failures-never-report-ready | `t12`, `t15` |
| cancellation-and-eof-block-later-publication-or-service-admission | `t12`, `t14` |
| unknown-actor-proof-blocks-install-retry-cleanup | `t12` |
| service-admission-is-durable-and-distinct-from-finite-preparation-drain | `t14` |
| explicit-install-retry-completes-cleanup-before-fresh-install | `t13` |
| owned-service-start-port-conflict-and-readiness-failure-preserve-existing-listener | `t14` |
| production-dependencies-compose-with-real-delivery-and-no-fake-s4-s5 | `t18` |
| terminal-manager-dependency-context-preserves-stop-and-cancellation-regressions | `t13`, `t14` |
| inspection-and-reconciliation-share-three-second-bound-without-payload-hashing | `t16` |
| receipt-closure-and-layout-errors-block-reuse-without-content-rehash | `t16` |
| same-size-installed-content-change-does-not-trigger-digest-reverification | `t16` |
| archive-digest-mismatch-still-rejects-live-acquisition | `t15` |
| reuse-and-service-admission-never-rehash-installed-files | `t16` |
| install-retry-requires-explicit-terminal-admission-and-original-install-intent | `t13` |
| upgrade-retry-never-enters-install-cleanup-or-changes-selected-release | `t13` |
| cleanup-cancellation-or-partial-failure-prevents-every-new-install-side-effect | `t12`, `t13` |
| repeated-retry-after-death-is-idempotent-and-finishes-cleanup-first | `t12`, `t13` |
| sighup-sigterm-and-sigkill-at-preparation-and-handoff-preserve-correct-evidence | `t14` |
| qualified-in-process-lock-proof-excludes-live-inherited-and-unknown-actors | `t12` |
| late-settlement-records-true-outcome-and-completes-disposal-under-held-handle | `t12` |
| policy-change-reconciles-exact-accepted-copy-without-current-policy-substitution | `t12` |
| fresh-bundle-peer-validates-durable-descriptor-without-resolve-map | `t13` |
| decline-creates-no-dependency-context-record-or-process-and-remains-certain | `t13` |
| supervisor-log-validation-and-pre-spawn-failures-have-bounded-not-started-diagnostics | `t14` |
| production-worker-dispatch-argv-path-and-sanitized-environment-with-seeded-sentinels | `t14` |
| supervisor-death-does-not-imply-retained-service-death-or-authorize-replay | `t14` |
| retained-service-cancellation-is-explicit-and-total-deadline-bounds-readiness | `t14` |
| zip-extraction-uses-verified-descriptor-across-path-swap-and-positive-close | `t15` |
| immutable-record-publication-never-replaces-existing-target-and-cleans-owned-temp | `t12` |
| invalid-receipt-closure-layout-reject-with-specific-code-and-zero-transport-calls | `t16` |
| payload-read-sentinel-covers-sync-async-stream-and-path-read-entrypoints | `t16` |
| redirect-target-local-listener-is-never-contacted | `t16` |
| coding-cli-advice-emitted-once-and-install-spawn-sentinels-remain-zero | `t16` |
| hostile-tar-zstd-zip-boundary-matrix-rejects-before-unsafe-write | `t15` |
| alias-copy-cancellation-closes-before-owned-cleanup | `t15` |
| qualified-exact-ollama-payload-version-and-user-session-readiness-on-enabled-target | `t17` |
| existing-installation-reuse-and-decline-preserve-platform-state | `t17` |
| official-large-archive-streaming-and-library-layout-match-policy | `t17` |
| native-large-payload-inspection-avoids-content-reads-within-three-seconds | `t17` |
| native-platform-glibc-translation-and-upstream-digest-provenance-are-observed | `t17` |
| native-write-observations-and-cache-advice-are-recorded-with-limits | `t17` |
| combined-s1-s2-s3-installer-regression-has-exact-coverage-and-confirmed-cleanup | `t18` |
| published-control-payload-includes-real-dependency-adapter-without-application-boot-imports | `t18` |
| terminal-install-upgrade-consent-and-ready-before-tui-regressions | `t18` |

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
- **[[c12]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md` — "Approved revision5 installed dependency trust boundary: archive digest verified at acquisition, bounded metadata/closure/health thereafter, three-second aggregate inspection."
- **[[c13]]** `stakeholder` `User correction, 2026-11-25: remove redundant second installed-file hashing check; S3 LLD revision5 approved.`
- **[[c14]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#summary` — "Approved revision6: explicit install Retry, owned cleanup then fresh install, never UPDATE; grouped manual-review corrections."
- **[[c15]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#9-references` — "c93 exact manual-review source docs/plans/s3-manual-review-feedback-2026-11-25.md and c94 owner decision; keep corrections in existing S3."
- **[[c16]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#3-data-model-changes` — "Install retry cleanup evidence, historical accepted policy, true late disposal and atomic no-replace records."
- **[[c17]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#2-contract-details` — "Terminal-admitted InstallerManager.retryInstall and fresh durable bundle descriptor; reject updates and other-owner candidate/lifecycle artifacts."
- **[[c18]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#6-error-paths` — "Supervisor pre-spawn failure, signals/process death, service retention, owner loss and total/readiness deadline."
- **[[c19]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#7-test-strategy` — "Verified ZIP descriptor lifetime and risk-focused tar/zstd/ZIP/alias-copy cancellation boundary cases."
- **[[c20]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#7-test-strategy` — "Non-vacuous zero-transport/specific-code/read-sentinel/env/redirect/agent assertions, actual publication paths and robust synchronization."
- **[[c21]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#7-test-strategy` — "Live native qualification from observed platform/glibc/translation and independent upstream asset digest evidence, scoped writes/cache advice with limits."
- **[[c22]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S003/LLD.md#7-test-strategy` — "Surrounding tests per task, final composed regression after all tasks; canonical coordinator, current fingerprints, positive admission/close/disposal audit and human final BUILD approval."
