<!-- insrc:artifact PLAN-446ae69566d352dd-s1 -->

# Plan: STORY-446ae69566d352dd-s1

## Summary

**Epic:** `complete-shared-external-node-runtime-foundation`
**LLD run:** `wf-1795676543322-bhz2eh`
**LLD effective hash:** `10ef12ead6b2...`

Build the shared external Node foundation first, then adapt bootstrap, bundle/dev payloads and installed consumers to it. Ten ordered tasks retain all25 LLD test subjects, with surrounding tests per task and the full scoped installer regression after implementation. Native evidence is collected separately in isolated UTM macOS, OrbStack Linux and genuine Windows environments; unavailable evidence stays unsatisfied and unqualified targets stay disabled. S4 resumes only after the corrective build passes its required gates; the installed host daemon remains untouched.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Pin deterministic runtime profiles and integrity metadata | M | — | — | unit: runtime-policy-exact-identity-target-baseline-profile-and-pinned-inventory; unit: runtime-profile-metadata-is-reproducible-from-pinned-official-assets-without-target-execution | [[c1]] [[c9]] |
| 2 | **`t2`** Implement the read-only verified runtime resolver | M | — | `t1` | unit: resolver-import-boundary-excludes-application-paths-storage-provider-and-source-build; unit: resolver-returns-canonical-node-npm-headers-and-win-library-from-exact-identity; unit: resolver-rejects-missing-corrupt-extra-files-wrong-mode-target-digest-npm-headers-inventory-receipt; unit: rewritten-self-consistent-local-runtime-metadata-cannot-replace-policy-inventory-digest; unit: resolver-does-no-mkdir-download-lock-selection-db-or-provider-work; unit: runtime-caps-and-cancellation-are-finite-and-do-not-trigger-app-or-Ollama-hashing | [[c1]] [[c2]] [[c9]] |
| 3 | **`t3`** Acquire and safely stage the official runtime | M | — | `t1`, `t2` | integration: runtime-acquisition-checks-official-HTTPS-byte-hash-deadline-before-safe-extraction; integration: runtime-stage-cancellation-closes-owned-network-parser-actors-before-cleanup; integration: runtime-profile-rejects-unsafe-archive-collisions-links-and-missing-header-library-inputs | [[c1]] [[c3]] [[c9]] |
| 4 | **`t4`** Publish and reuse runtime entries under controller ownership | M | — | `t2`, `t3` | integration: runtime-native-lock-exclusive-durable-no-replace-publication-and-offline-entry-reuse; integration: runtime-publication-rejects-stale-owner-and-conflicting-incomplete-entry; integration: runtime-publication-stage-is-not-running-node-or-loaded-native-library | [[c3]] [[c4]] [[c9]] [[c10]] |
| 5 | **`t5`** Unify terminal bootstrap verification and runtime handoff | M | — | `t1`, `t2`, `t3`, `t4` | integration: bootstrap-no-host-node-verifies-archive-and-executable-before-execution; integration: bootstrap-native-operation-lock-exclusive-publication-exact-helper-exit-then-fresh-manager-lock; integration: bootstrap-publication-stage-distinct-from-running-node-and-loaded-native-library; integration: runtime-stage-cancellation-conflict-and-uncertain-closure-retain-safe-state; integration: bootstrap-verified-cached-runtime-control-offline-with-host-node-trap-and-quoted-paths | [[c4]] [[c7]] [[c9]] [[c10]] |
| 6 | **`t6`** Publish and validate application-only bundle format | M | — | `t1`, `t2`, `t4`, `t5` | integration: bundle-descriptor2-application-only-public-manifest1-and-legacy-descriptor-diagnostic; integration: publisher-app-and-IDE-inventory-exclude-Node-Ollama-distributions-and-archives-including-renamed-contributions; integration: bundle-publisher-probes-use-shared-external-runtime-without-tools-node-copy | [[c2]] [[c5]] [[c7]] [[c9]] |
| 7 | **`t7`** Prepare dev candidates with the shared external runtime | M | — | `t1`, `t2`, `t3`, `t4`, `t6` | integration: private-dev-node-npm-headers-native-env-and-worker-source-closure-preserved; integration: dev-receipt2-recipe-offer-compatibility-and-application-only-payload; integration: dev-candidate-open-has-no-implicit-runtime-acquisition-or-foreign-directory-trust | [[c2]] [[c3]] [[c6]] [[c9]] |
| 8 | **`t8`** Bind installed consumers to the verified external runtime | M | — | `t2`, `t4`, `t5`, `t6`, `t7` | integration: bundle-dev-manager-terminal-TUI-Retry-bridge-and-publisher-probes-use-shared-resolver; integration: status-readiness-and-control-checks-do-not-scan-full-app-Ollama-payload; integration: installed-consumer-process-executable-and-manifest-identity-bound-to-real-resolver | [[c2]] [[c3]] [[c5]] [[c6]] [[c7]] [[c9]] [[c10]] |
| 9 | **`t9`** Complete integrated coverage and run the scoped regression | M | — | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8` | smoke: descriptor2-and-dev-receipt2-application-only-with-public-manifest1-unchanged; smoke: legacy-embedded-runtime-formats-rejected-without-adoption; smoke: verified-runtime-and-control-reuse-offline-across-bundle-and-dev; smoke: S3-Ollama-consent-retention-agent-recommendations-and-install-only-Retry-preserved; smoke: terminal-install-success-ready-lock-release-same-terminal-TUI-and-failure-no-TUI-preserved; smoke: final-scoped-installer-publisher-bootstrap-dev-dependencies-terminal-regression | [[c8]] [[c9]] [[c10]] |
| 10 | **`t10`** Record native runtime qualification and S4 handoff evidence | M | — | `t9` | live: UTM-macOS-fresh-live-acquisition-offline-reuse-and-isolated-installed-consumer-smoke; live: OrbStack-Linux-fresh-live-acquisition-native-build-and-offline-reuse-smoke; live: native-Windows-first-install-reuse-named-path-ACL-header-library-and-loaded-DLL-safe-publication; live: unsupported-or-unavailable-target-is-not-enabled-by-cross-archive-metadata-or-foreign-tests | [[c8]] [[c9]] [[c10]] |

### 1.1 TASK-446ae69566d352dd-s1-t1 — Pin deterministic runtime profiles and integrity metadata

Extend the existing private policy with deterministic distribution profiles, official archive byte counts and independently derived Node/inventory hashes. Include pinned official Windows header/library inputs when needed, without executing foreign binaries or enabling unqualified targets. Define bounded runtime receipt/inventory/result types and canonical layout without changing public contracts.

**Acceptance checks:**
- All six declared os/arch policy identities retain Node22.22.1/npm10.9.4/header22.22.1 consistency; profile metadata is derived from verified official archive/assets and reproducible, not copied from an installed receipt.
- Completion64KiB, inventory16MiB,32768 entries,128MiB/file,1GiB expanded,256MiB/compressed asset,600s network and120s verification bounds are explicit and tested.
- RuntimeIdentity/ReleaseManifest/IPC fields remain unchanged; metadata computation alone neither executes target code nor enables a native target.

### 1.2 TASK-446ae69566d352dd-s1-t2 — Implement the read-only verified runtime resolver

Replace the unused privateRuntimePaths constructor with the approved async resolver, implemented through the proposed runtime-store module. Verify explicit home/full identity, protected canonical root, independent policy-bound inventory and exact Node/npm/header file set, with no allocation or application imports.

**Acceptance checks:**
- Direct calls return frozen canonical absolute runtime paths only for the exact verified identity; tampered files/metadata, extra files, bad target/baseline, links and unsafe roots fail closed.
- A self-consistent rewritten receipt/inventory cannot replace the independently pinned expected inventory hash.
- Resolver imports no application paths/DB/provider/source builder and performs no network, mkdir, controller lock, selection or application/Ollama traversal.
- Task-local fixtures prove this API; production consumer wiring is assessed in t8, not required prematurely for t2 validation.

### 1.3 TASK-446ae69566d352dd-s1-t3 — Acquire and safely stage the official runtime

Implement bounded live official runtime/header/library download, digest verification and safe deterministic extraction in the proposed acquisition module. Produce only owned validated stages; close actors before cleanup and reuse the read-only verifier/profile rules without application payload access.

**Acceptance checks:**
- Official assets are HTTPS/status/redirect/size/hash/deadline checked before extraction or target-code execution; POSIX and Windows profile extraction rejects unsafe/colliding/special entries and missing exact npm/header/library inputs.
- Cancellation and download/extraction failure close network/parser resources before removing only the owned stage; uncertain closure retains evidence and fails.
- Stage verification covers the fixed runtime limits and exact independent inventory digest; no runtime/release publication, selection or daemon lifecycle occurs in this staging task.

### 1.4 TASK-446ae69566d352dd-s1-t4 — Publish and reuse runtime entries under controller ownership

Add immutable durable runtime publication and verified reuse through the existing native operation.lock and original controller capability. Keep executing helper/runtime/DLL paths outside the publication tree and preserve conflicting entries for explicit recovery.

**Acceptance checks:**
- Fresh publication is exclusive and durable under the original live controller lock, with canonical completion/inventory; matching verified entries are reused before network.
- Concurrent/stale/lost owners cannot publish; incompatible/incomplete immutable destinations are never overwritten or silently repaired.
- Execution and publication stages are distinct, including Windows node.exe/loaded DLL constraints; final-runtime or application cleanup never deletes retained shared runtimes.
- No new manager action, lock transfer, PID/kill controller, S4 lifecycle peer or S5 migration implementation is introduced.

### 1.5 TASK-446ae69566d352dd-s1-t5 — Unify terminal bootstrap verification and runtime handoff

Adapt both shared terminal templates, renderer and publication helper to the same verified external store. Authenticate cached/fresh Node and control bytes before execution, publish under the existing lock, wait for exact helper exit, then invoke the canonical runtime manager with fresh ordinary admission.

**Acceptance checks:**
- Manual and IDE-generated POSIX/PowerShell scripts use fixed independent Node/control digests and need no host Node; matching verified cached runtime/control can work offline while missing prerequisites fail clearly.
- The exact publication-helper child exits before the final manager starts/acquires a fresh lock; no inherited lock/session/source flag, PID heuristic or successful install claim substitutes for admission.
- Paths with spaces/Unicode/apostrophes, interruption, concurrent bootstrap and Windows nonmoving execution-stage behavior are covered by surrounding fixtures.
- Terminal owns prompts/I/O and existing same-terminal TUI semantics; no IDE adapter redesign or current host daemon operation is performed.

### 1.6 TASK-446ae69566d352dd-s1-t6 — Publish and validate application-only bundle format

Advance private ReleaseDescriptor to format2 without runtimeArchive and adapt bundle inventory, ZIP validation and publisher assembly/probes together. Preserve public manifest1, exact source/target/digests and native qualification while separating runtime acquisition inputs from all app/IDE payload collection.

**Acceptance checks:**
- New bundle/publisher receipts and accepted descriptor hashing consistently use private format2; old embedded descriptor1 is rejected diagnostically without reinterpretation or adoption.
- Bundle validation no longer requires tools/node or a runtime archive and still validates the exact production app/native closure and archive safety.
- Provenance/allowlisted collection rejects ordinary or renamed Node/Ollama distribution/archive contributions; native .node application dependencies remain legitimate.
- Publisher runtime probes and candidate preparation obtain the shared verified external runtime; no release-local/PATH fallback or full app/Ollama reconciliation is added.

### 1.7 TASK-446ae69566d352dd-s1-t7 — Prepare dev candidates with the shared external runtime

Advance private dev receipts/recipe to application-only semantics and adapt source offers, toolchain, worker staging, verification and immutable publication. Consume the same resolved Node/npm/header/library distribution instead of copying tools/node into dev releases.

**Acceptance checks:**
- Dev receipt2/new recipe, durable offers, canonical hashes and all readers agree; old embedded receipts/offers fail with an explicit compatibility diagnostic.
- Dev payloads omit Node/Ollama distributions/archives and preserve exact accepted source, native output closure, closed-worker proof and no duplicate writer.
- Dev build commands/owned npm aliases use resolved absolute private Node/npm/header/library paths; existing CUDA skip-if-unset and hostile environment isolation remain.
- Prepared candidate open/verify does not acquire/build a runtime implicitly or adopt an arbitrary runtimeDirectory; cross-mode runtime reuse is proven at the shared foundation boundary.

### 1.8 TASK-446ae69566d352dd-s1-t8 — Bind installed consumers to the verified external runtime

Wire manager/terminal entry, TUI/Retry/bridge launch selection, production peer dependency readiness and both delivery modes to real shared resolution/acquisition. Remove process/release-directory guesses and duplicate trust paths, while keeping lifecycle and migration ports under their existing owners.

**Acceptance checks:**
- Every existing installed consumer owned by this correction selects the canonical resolved executable from explicit location+manifest identity, verifies actual process.execPath where required, and has no tools/node/PATH/runtimeDirectory trust fallback. S4 daemon boot consumes the real exposed resolver later; no S4 production consumer is required prematurely here.
- Both delivery preparations acquire only under original controller ownership before lifecycle disruption; installed start/status/receipt resolution never downloads/builds source or traverses full app/Ollama payloads.
- S3 runtime readiness uses verified external paths, preserving Ollama consent/retention, agent recommendations, install-only Retry and terminal TUI flow.
- S4 boot/lease/shutdown/wrapper and S5 hooks remain consumers, not new implementations; separate manager action-specific peer gating is excluded and missing production peers still fail truthfully.

### 1.9 TASK-446ae69566d352dd-s1-t9 — Complete integrated coverage and run the scoped regression

Finish cross-mode/consumer/regression fixtures and validation-only native harness setup, maintain structured design companions if relationships change, and run the complete scoped installer regression after all source tasks are built. Preserve final human BUILD approval after validation rather than per-task approvals.

**Acceptance checks:**
- All25 LLD subjects and ac1–ac6 have explicit owner mapping. All non-native surrounding/integrated regression evidence passes with canonical Node22 coordinator and confirmed actor cleanup after the last implementation task is built. Actual native evidence belongs to t10 and is neither required prematurely nor claimed by t9.
- Surrounding S2/S3/terminal/bridge/public-contract tests preserve source closure, consent/Retry/TUI and no full app/Ollama status/readiness rehash; no test fixture certifies a real unavailable lifecycle/migration peer.
- Generated ER retains one runtime ->0..N releases, sequence retains exact helper-exit/fresh-manager ownership ordering, and component/import boundaries match implementation. Source and render checks distinguish unavailable evidence.
- Final regression/source checks pass before completion; tracker/build admission failures are reported rather than bypassed with fabricated Define/issue bindings or raw workflow edits.

### 1.10 TASK-446ae69566d352dd-s1-t10 — Record native runtime qualification and S4 handoff evidence

Run the completed runtime/installed-consumer qualification harness in isolated UTM macOS and OrbStack Linux homes, and a genuine Windows runner when available. Record exact platform/runtime/asset/actor evidence and unsupported routes; hand the actual resolver contract back to S4 after the corrective BUILD passes all required gates.

**Acceptance checks:**
- Actual UTM macOS and OrbStack Linux runtime-first-acquisition/native-build/offline-reuse/installed-consumer checks are distinguished from fixtures and host emulation; host v2/Ollama remain untouched.
- Windows qualification requires actual native ACL/path/header/library/loaded-DLL-safe-publication evidence, not Linux/macOS execution or metadata extraction. Missing infrastructure remains explicitly unavailable and the target cannot be enabled/published. An unavailable native subject remains unsatisfied; recording an availability diagnostic is not a passing native test or a waiver of required BUILD acceptance.
- Qualification is for the runtime foundation and existing installed-consumer boundaries; no end-to-end S4/S5 daemon activation proof is fabricated or introduced as a cyclic prerequisite.
- No source changes are made during this evidence-only task. Any required correction returns to its owning task and reruns appropriate tests/regression; user BUILD approval is requested only after all required validation/task accounting/tracker gates are satisfied.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| runtime-policy-exact-identity-target-baseline-profile-and-pinned-inventory | `t1` |
| descriptor2-and-dev-receipt2-application-only-with-public-manifest1-unchanged | `t6`, `t7`, `t9` |
| legacy-embedded-runtime-formats-rejected-without-adoption | `t6`, `t7`, `t9` |
| resolver-import-boundary-excludes-application-paths-storage-provider-and-source-build | `t2` |
| resolver-returns-canonical-node-npm-headers-and-win-library-from-exact-identity | `t2` |
| resolver-rejects-missing-corrupt-extra-files-wrong-mode-target-digest-npm-headers-inventory-receipt | `t2` |
| rewritten-self-consistent-local-runtime-metadata-cannot-replace-policy-inventory-digest | `t2` |
| resolver-does-no-mkdir-download-lock-selection-db-or-provider-work | `t2` |
| runtime-caps-and-cancellation-are-finite-and-do-not-trigger-app-or-Ollama-hashing | `t2` |
| bootstrap-no-host-node-verifies-archive-and-executable-before-execution | `t3`, `t5` |
| verified-runtime-and-control-reuse-offline-across-bundle-and-dev | `t4`, `t5`, `t7`, `t9` |
| bootstrap-native-operation-lock-exclusive-publication-exact-helper-exit-then-fresh-manager-lock | `t4`, `t5` |
| bootstrap-publication-stage-distinct-from-running-node-and-loaded-native-library | `t4`, `t5` |
| runtime-stage-cancellation-conflict-and-uncertain-closure-retain-safe-state | `t3`, `t4`, `t5` |
| bundle-dev-manager-terminal-TUI-Retry-bridge-and-publisher-probes-use-shared-resolver | `t6`, `t7`, `t8` |
| private-dev-node-npm-headers-native-env-and-worker-source-closure-preserved | `t7` |
| publisher-app-and-IDE-inventory-exclude-Node-Ollama-distributions-and-archives-including-renamed-contributions | `t6` |
| S3-Ollama-consent-retention-agent-recommendations-and-install-only-Retry-preserved | `t8`, `t9` |
| terminal-install-success-ready-lock-release-same-terminal-TUI-and-failure-no-TUI-preserved | `t5`, `t8`, `t9` |
| status-readiness-and-control-checks-do-not-scan-full-app-Ollama-payload | `t8` |
| final-scoped-installer-publisher-bootstrap-dev-dependencies-terminal-regression | `t9` |
| UTM-macOS-fresh-live-acquisition-offline-reuse-and-isolated-installed-consumer-smoke | `t10` |
| OrbStack-Linux-fresh-live-acquisition-native-build-and-offline-reuse-smoke | `t10` |
| native-Windows-first-install-reuse-named-path-ACL-header-library-and-loaded-DLL-safe-publication | `t10` |
| unsupported-or-unavailable-target-is-not-enabled-by-cross-archive-metadata-or-foreign-tests | `t10` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#3-data-model-changes` — "Approved revision3 §3.1–3.2: independently pinned official distribution profiles, metadata/types, canonical runtime store and fixed finite bounds; public runtime/manifest contracts unchanged."
- **[[c2]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#2-contract-details` — "§2.2–2.3: privateRuntimePaths is the verified async read-only resolver; exact runtime integrity and explicit home, no allocation/acquisition/application imports or arbitrary runtimeDirectory trust."
- **[[c3]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#3-data-model-changes` — "§3.3: live official bounded download/safe stage; controller-owned immutable publication, exact verified reuse and closed actors, using original native operation.lock ownership."
- **[[c4]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#2-contract-details` — "§2.4/§3.3: shared POSIX/PowerShell bootstrap verifies Node/control bytes before execution, publishes a nonexecuting stage, observes exact helper exit before fresh manager admission, including Windows "
- **[[c5]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#3-data-model-changes` — "§3.4: private descriptor2/application-only inventory and publisher/probe adaptation; reject embedded formats and runtime byte contributions while preserving public manifest1 and native closure/qualifi"
- **[[c6]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#3-data-model-changes` — "§3.4–3.5: dev receipt2/new recipe and canonical offers/readers with shared external Node/npm/header/library; retain accepted source, worker closure and owned native build environment."
- **[[c7]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#3-data-model-changes` — "§3.5: manager/terminal/TUI/Retry/bridge/dependency readiness and delivery consumers use the real shared foundation; no source build on installed status/start and no release-local/PATH fallback."
- **[[c8]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#6-test-strategy` — "All25 LLD subjects and ac1–ac6; surrounding tests per task, full scoped regression after implementation, real isolated UTM macOS/OrbStack Linux/Windows evidence kept separate from fixtures."
- **[[c9]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#5-error-paths` — "§5/§7: fail closed on corrupt runtime/legacy format/ownership/closure; preserve consent/install-only Retry, same-terminal TUI, current host daemon and immutable entries; unavailable native evidence is"
- **[[c10]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#3-data-model-changes` — "§3.6 and diagrams: standalone ISSUE correction with external epic compatibility references only; S4 boot/control/lease/wrapper, S5 hooks and action-specific peer gating stay with their existing owners"
