<!-- insrc:artifact PLAN-446ae69566d352dd-s1 -->

# Plan: STORY-446ae69566d352dd-s1

## Summary

**Epic:** `complete-shared-external-node-runtime-foundation`
**LLD run:** `wf-1795857414341-or9fli`
**LLD effective hash:** `e3d0af7b8c39...`

Apply the approved manual-review corrections within the existing ten-task runtime foundation, retaining its identifiers, dependency order and six accepted bootstrap fixes. Rework the owning verifier/publication, delivery, dev and consumer boundaries for protected runtimes, isolated writable build inputs, once-per-operation application integrity and precise failure behavior; introduce shared owned-fixture cleanup before protected tests need it. Run surrounding checks for each changed task, then current full scoped regression and actual macOS/Linux qualification, including Linux dash cancellation, before the final human Story BUILD approval. Windows remains deferred; hostv2/Ollama, unknown custom installations and blocked isolates remain untouched.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**: Standalone foundation work item; no sibling built Story in this unit.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Retain pinned profiles and separate production deadline policy | M | approved r1 | — | unit: runtime-policy-exact-identity-target-baseline-profile-and-pinned-inventory; unit: runtime-profile-metadata-is-reproducible-from-pinned-official-assets-without-target-execution; unit: ordinary-runtime-deadlines-ignore-qualification-env-and-trusted-qualifier-remains-bounded | [[c1]] [[c11]] [[c12]] |
| 2 | **`t2`** Enforce strict runtime modes and introduce owned fixture cleanup | M | approved r1 | `t1` | unit: resolver-import-boundary-excludes-application-paths-storage-provider-and-source-build; unit: resolver-returns-canonical-node-npm-headers-and-win-library-from-exact-identity; unit: resolver-rejects-missing-corrupt-extra-files-wrong-mode-target-digest-npm-headers-inventory-receipt; unit: rewritten-self-consistent-local-runtime-metadata-cannot-replace-policy-inventory-digest; unit: resolver-does-no-mkdir-download-lock-selection-db-or-provider-work; unit: runtime-caps-and-cancellation-are-finite-and-do-not-trigger-app-or-Ollama-hashing; unit: runtime-rejection-matrix-proves-positive-baseline-and-exact-diagnostic-for-each-mutation; unit: posix-runtime-protection-preserves-pinned-inventory-and-rejects-write-bits-or-execute-drift; unit: runtime-manual-unfinished-and-development-layout-diagnostics-preserve-entries-with-safe-path-guidance; integration: shared-runtime-fixture-cleanup-restores-owned-directory-write-after-positive-closure | [[c2]] [[c11]] [[c12]] |
| 3 | **`t3`** Preserve mutable source acquisition and closed-stage cleanup | M | approved r1 | `t1`, `t2` | integration: runtime-acquisition-checks-official-HTTPS-byte-hash-deadline-before-safe-extraction; integration: runtime-stage-cancellation-closes-owned-network-parser-actors-before-cleanup; integration: runtime-profile-rejects-unsafe-archive-collisions-links-and-missing-header-library-inputs | [[c3]] [[c11]] [[c12]] |
| 4 | **`t4`** Publish protected runtimes and finalize only root-write crash states | M | approved r1 | `t2`, `t3` | integration: runtime-native-lock-exclusive-durable-no-replace-publication-and-offline-entry-reuse; integration: runtime-publication-rejects-stale-owner-and-conflicting-incomplete-entry; integration: runtime-publication-stage-is-not-running-node-or-loaded-native-library; integration: posix-runtime-root-only-interrupted-publication-recovery-and-closed-stage-discard; integration: native-runtime-publication-keeps-root-writable-until-rename-and-finishes-root-seal; integration: runtime-postpublication-uncertainty-and-canonical-stat-errors-are-coded-and-retained | [[c4]] [[c11]] [[c12]] |
| 5 | **`t5`** Preserve accepted bootstrap fixes and finish path/test corrections | M | approved r1 | `t1`, `t2`, `t3`, `t4` | integration: bootstrap-no-host-node-verifies-archive-and-executable-before-execution; integration: bootstrap-native-operation-lock-exclusive-publication-exact-helper-exit-then-fresh-manager-lock; integration: bootstrap-publication-stage-distinct-from-running-node-and-loaded-native-library; integration: runtime-stage-cancellation-conflict-and-uncertain-closure-retain-safe-state; integration: bootstrap-verified-cached-runtime-control-offline-with-host-node-trap-and-quoted-paths; integration: bootstrap-work-normalized-once-and-foreign-archive-case-is-pinned-size-only | [[c5]] [[c11]] [[c12]] |
| 6 | **`t6`** Restore bundle activation integrity and precise publisher boundaries | L | approved r1 | `t1`, `t2`, `t4`, `t5` | integration: bundle-descriptor2-application-only-public-manifest1-and-legacy-descriptor-diagnostic; integration: publisher-app-and-IDE-inventory-exclude-Node-Ollama-distributions-and-archives-including-renamed-contributions; integration: bundle-publisher-probes-use-shared-external-runtime-without-tools-node-copy; integration: application-integrity-once-per-operation-and-full-recovery-before-activation; integration: publisher-single-link-collection-rechecks-captured-identity-and-renamed-exclusion-is-visited; integration: release-owned-target-exclusion-and-default-off-Windows-CI-cannot-self-qualify; integration: bundle-fixture-unknown-URL-is-refused-without-real-network | [[c6]] [[c11]] [[c12]] |
| 7 | **`t7`** Isolate writable dev SDK inputs and scope dev integrity proof | L | approved r1 | `t1`, `t2`, `t3`, `t4`, `t6` | integration: private-dev-node-npm-headers-native-env-and-worker-source-closure-preserved; integration: dev-receipt2-recipe-offer-compatibility-and-application-only-payload; integration: dev-candidate-open-has-no-implicit-runtime-acquisition-or-foreign-directory-trust; integration: application-integrity-once-per-operation-and-full-recovery-before-activation; integration: writable-dev-SDK-isolation-and-manual-runtime-recovery-guidance; integration: dev-toolchain-corruption-checks-have-positive-baselines-and-exact-diagnostics | [[c7]] [[c11]] [[c12]] |
| 8 | **`t8`** Consume operation integrity and bind installed/service processes | L | draft r2 | `t2`, `t4`, `t5`, `t6`, `t7` | integration: bundle-dev-manager-terminal-TUI-Retry-and-publisher-probes-use-shared-resolver; integration: status-readiness-and-control-checks-do-not-scan-full-app-Ollama-payload; integration: installed-consumer-process-executable-and-manifest-identity-bound-to-real-resolver; integration: application-integrity-once-per-operation-and-full-recovery-before-activation; integration: ollama-worker-runtime-binding-and-pre-admission-resolution-are-once-per-process; integration: owned-unresolvable-launcher-predecessor-has-distinct-actionable-diagnostic; integration: terminal-negative-assertions-use-exact-diagnostics-without-dead-branches | [[c8]] [[c11]] [[c12]] |
| 9 | **`t9`** Reconcile all review coverage and run the full scoped regression | L | approved r1 | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8` | smoke: descriptor2-and-dev-receipt2-application-only-with-public-manifest1-unchanged; smoke: legacy-embedded-runtime-formats-rejected-without-adoption; smoke: verified-runtime-and-control-reuse-offline-across-bundle-and-dev; smoke: S3-Ollama-consent-retention-agent-recommendations-and-install-only-Retry-preserved; smoke: terminal-install-success-ready-lock-release-same-terminal-TUI-and-failure-no-TUI-preserved; smoke: final-scoped-installer-publisher-bootstrap-dev-dependencies-terminal-regression; integration: shared-runtime-fixture-cleanup-restores-owned-directory-write-after-positive-closure; smoke: review-dispositions-and-current-evidence-reconcile-all32LLDsubjects-without-historical-rerun-claims | [[c9]] [[c11]] [[c12]] |
| 10 | **`t10`** Requalify current macOS/Linux foundation and record S4 handoff | M | draft r2 | `t9` | live: UTM-macOS-fresh-live-acquisition-offline-reuse-and-isolated-installed-consumer-smoke; live: OrbStack-Linux-fresh-live-acquisition-native-build-and-offline-reuse-smoke; live: unsupported-or-unavailable-target-is-not-enabled-by-cross-archive-metadata-or-foreign-tests | [[c10]] [[c11]] [[c12]] |

### 2.1 TASK-446ae69566d352dd-s1-t1 — Retain pinned profiles and separate production deadline policy

Retain independently pinned official Node/npm/header profiles and public identities. Correct installer production budget imports/context so ordinary manager/terminal/resolver/delivery work uses fixed deadlines regardless of the ambient qualification selector, while trusted qualification retains its approved bounded slow-VM policy. Define the approved internal source/published/root-only verification lane types without changing official inventory bytes or enabling targets.

**Acceptance checks:**
- All six declared os/arch policy identities retain Node22.22.1/npm10.9.4/header22.22.1 consistency; profile metadata is derived from verified official archive/assets and reproducible, not copied from an installed receipt.
- Completion64KiB, inventory16MiB,32768 entries,128MiB/file,1GiB expanded,256MiB/compressed asset,600s network and120s verification bounds are explicit and tested.
- RuntimeIdentity/ReleaseManifest/IPC fields remain unchanged; metadata computation alone neither executes target code nor enables a native target.
- Keep original archive/profile/inventory/completion bytes, hashes and public fields unchanged; POSIX mode protection is a verifier/publication rule, not regenerated official content or a new runtime identity/layout.
- Ordinary production entrypoint import and runtime/download deadline behavior are unchanged for unset, normal, slow-vm and invalid INSRC_QUALIFICATION_PROFILE; remove indirect production import-time selector failure as well as direct runtime-metadata/download coupling.
- Only explicit trusted qualification invocation installs bounded process-local context before relevant modules load; preserve approved normal/slow-VM harness propagation without exposing a wire/receipt/ambient-env override or changing unrelated completed harness contracts.
- Exercise normal manager/terminal/resolver import and relevant action paths with every selector case, including transitive budget imports; qualification-only invalid selectors retain their typed diagnostic. Actual native execution/publication eligibility is release-owned and separate from six-target profile metadata; deferred Windows and unqualified arch/baseline combinations cannot self-enable.

### 2.2 TASK-446ae69566d352dd-s1-t2 — Enforce strict runtime modes and introduce owned fixture cleanup

Extend the existing read-only resolver/content verifier with the approved three lanes and exact manual/unfinished/unsupported diagnostics. Strengthen independent negative fixtures. Introduce the single test-owned asynchronous cleanup helper now, with resolver-fixture adoption, so later publication tasks can safely dispose sealed homes without a circular test dependency.

**Acceptance checks:**
- Direct calls return frozen canonical absolute runtime paths only for the exact verified identity; tampered files/metadata, extra files, bad target/baseline, links and unsafe roots fail closed.
- A self-consistent rewritten receipt/inventory cannot replace the independently pinned expected inventory hash.
- Resolver imports no application paths/DB/provider/source builder and performs no network, mkdir, controller lock, selection or application/Ollama traversal.
- Task-local fixtures prove this API; production consumer wiring is assessed in t8, not required prematurely for t2 validation.
- Default canonical resolution accepts only exact published root/directories0500, metadata0400, files pinnedmode&~0222 with zero write bits and exact execute intent. Source-stage checks original modes; permission-transition accepts only root0700/0500 with every descendant protected. No arbitrary mixed subtree or old-home adoption, allocation or launch paths from a weak verifier flag.
- Use the exact LLD8 §4.3 runtime-invalid manual recovery, root-only unfinished and unsupported-development-layout messages. Manual text advises safely quoted root-only chmod, preservation/move and delete nothing, and explicitly disclaims product locking/all-consumer proof. Test spaces/Unicode/apostrophes and preservation; do not implement an operator move/recovery command.
- For every rejection mutation, establish a positive baseline beforehand, assert its precise expected code/message and prove restoration succeeds; no bare rejects or shared broken fixture false positives. Protected-fixture mutation helpers may deliberately alter only their captured isolated homes.
- Implement the proposed shared _owned-runtime-home.ts test helper using captured mkdtemp dev/inode/UID, retained child/resource closure and bounded nofollow checks. Restore directory ownerwrite only within that root after positive closure; never follow a link to chmod its target, mutate SDK/global/blocked roots or erase uncertain evidence. All adopting callers await cleanup, including allocation failure/after/finally. Prove cleanup/retention/refusal cases independently.
- Introduce the owned-home helper without turning raw/shared mutable SDK caches into cleanup targets. Resolver fixtures can seed the strict protected form independently before T4 is implemented; fixture APIs with asynchronous disposal are awaited by every changed caller.

### 2.3 TASK-446ae69566d352dd-s1-t3 — Preserve mutable source acquisition and closed-stage cleanup

Keep bounded official acquisition/extraction as mutable source stages with the approved source-mode checks. Integrate deadline policy and cleanup of positively closed owned stages, including permission restoration only for protected staging directories when discard is authorized. No publication/selection or arbitrary canonical repair belongs here.

**Acceptance checks:**
- Official assets are HTTPS/status/redirect/size/hash/deadline checked before extraction or target-code execution; POSIX and Windows profile extraction rejects unsafe/colliding/special entries and missing exact npm/header/library inputs.
- Cancellation and download/extraction failure close network/parser resources before removing only the owned stage; uncertain closure retains evidence and fails.
- Stage verification covers the fixed runtime limits and exact independent inventory digest; no runtime/release publication, selection or daemon lifecycle occurs in this staging task.
- Extracted source stages retain original pinned file modes,0700directories/0600metadata and exact independent inventory. Explicitly use source-stage verification rather than weakening canonical resolution.
- Use T1's approved runtime/qualifier policy at the existing acquisition/decoder/resource-drain boundaries; invalid ambient profile does not affect normal acquisition, and trusted slow-VM qualification stays bounded.
- Adopt/await the T2 test cleanup helper in acquisition/publishing fixture roots and failure hooks. Production discard may restore directory ownerwrite only in its positively closed original stage capability; uncertain actors/stages or canonical entries remain retained.

### 2.4 TASK-446ae69566d352dd-s1-t4 — Publish protected runtimes and finalize only root-write crash states

Correct existing controller publication under the original native lock: validate mutable source, protect descendants while root remains0700, native no-replace cross-parent publish, then root0500/fsync/strict verification before success. Add exact root-only crash finalization and typed uncertainty without conversion of old development homes.

**Acceptance checks:**
- Fresh publication is exclusive and durable under the original live controller lock, with canonical completion/inventory; matching verified entries are reused before network.
- Concurrent/stale/lost owners cannot publish; conflicting/corrupt/unsupported incomplete destinations are never overwritten or byte-repaired. Only the approved exact root-only permission-finalization state can be completed under current original-owner/closure requirements.
- Execution and publication stages are distinct, including Windows node.exe/loaded DLL constraints; final-runtime or application cleanup never deletes retained shared runtimes.
- No new manager action, lock transfer, PID/kill controller, S4 lifecycle peer or S5 migration implementation is introduced.
- Immediately before the actual native publishDirectory call, the verified candidate root is0700 and every descendant/file/metadata is protected. Keep the same live controller capability; publish the same inode across install/ and runtimes/ parents without replacing an existing destination.
- After publication and before returning any launch result, chmod only published root0500, fsync root and required source/destination namespace parents, then strict-verify exact protected content/modes and positive resource closure under that same lock.
- A later controller may finalize only the exact canonical root0700/otherwise-protected, independently hash-verified state. No network, byte rewrite, descendant-mode repair or entry replacement; old unsealed/mixed development layouts are rejected for isolated rebuild, corruption remains untouched.
- Use real native official-profile publication fixtures on enabled POSIX targets, with prepublication root assertion, same-inode/protected-descendant proof and injection after rename/after rootchmod-before-durability. Launch refuses unfinished states and no success precedes final fsync/verification.
- Classify failures after possible publication/durability/closure as resource-close-uncertain with retained evidence; wrap non-ENOENT canonical lstat errors in actionable InstallerError codes. Never clean canonical or uncertain paths by inference.
- Adopt/await T2 cleanup helper throughout runtime-install/publication fixtures; test both closed protected-stage discard and uncertain-stage retention. The retained small macOS primitive probe is supporting evidence, not this task's full-runtime/native acceptance.

### 2.5 TASK-446ae69566d352dd-s1-t5 — Preserve accepted bootstrap fixes and finish path/test corrections

Retain all six manually accepted bootstrap fixes and the real production publication/signal handler. Apply R2-4 honest foreign-size case naming and R2-5 one normalized work value, then adapt bootstrap fixtures/consumers to protected publication and common owned-home cleanup.

**Acceptance checks:**
- Manual and IDE-generated POSIX/PowerShell scripts use fixed independent Node/control digests and need no host Node; matching verified cached runtime/control can work offline while missing prerequisites fail clearly.
- The exact publication-helper child exits before the final manager starts/acquires a fresh lock; no inherited lock/session/source flag, PID heuristic or successful install claim substitutes for admission.
- Paths with spaces/Unicode/apostrophes, interruption, concurrent bootstrap and Windows nonmoving execution-stage behavior are covered by surrounding fixtures.
- Terminal owns prompts/I/O and existing same-terminal TUI semantics; no IDE adapter redesign or current host daemon operation is performed.
- Preserve home separator normalization, deferred real INT/TERM/HUP/exact child exit, immediate canonical Node/bootstrap/native hashes, required target/baseline and cached-control tamper cases at2f6bcaea7. Do not revert the production terminalMain delegation or claim fixture manager/TUI as lifecycle proof.
- Normalize the bootstrap work path once before containment/leaf extraction; use that canonical value in every later path/transport operation. Label the foreign archive row as pinned-size rejection, with target identity/digest coverage credited to its actual tests.
- Rendered bootstrap operates with T4 protected publication/root-only finalization; exact helper exit still precedes fresh manager ownership. No kill/forwarding redesign; document/test group-delivery behavior and retain the shell-PID/pre-fork latency limitation.
- Adopt/await common cleanup in bootstrap/control-source fixture failure/after/finally paths. Preserve uncertain resources and read-only stage/canonical boundary. PowerShell parity remains source-only while Windows native execution is deferred.

### 2.6 TASK-446ae69566d352dd-s1-t6 — Restore bundle activation integrity and precise publisher boundaries

Retain application-only descriptor2/public manifest1 and external runtime probes. Produce operation-scoped full bundle integrity evidence from fresh preparation or one recovered verification, strengthen source/collector diagnostics and target publication guards, and make transport fixtures fail closed.

**Acceptance checks:**
- New bundle/publisher receipts and accepted descriptor hashing consistently use private format2; old embedded descriptor1 is rejected diagnostically without reinterpretation or adoption.
- Bundle validation no longer requires tools/node or a runtime archive and still validates the exact production app/native closure and archive safety.
- Provenance/allowlisted collection rejects ordinary or renamed Node/Ollama distribution/archive contributions; native .node application dependencies remain legitimate.
- Publisher runtime probes and candidate preparation obtain the shared verified external runtime; no release-local/PATH fallback or full app/Ollama reconciliation is added.
- Bundle preparation/recovery performs one full independent application inventory/content/tree check before activation use; expose only process-local candidate/operation-bound evidence for T8 consumption, with cancellation/failure/new-operation invalidation. No serialized trusted flag or repeated full scan from bounded launch/status paths.
- Test truncated non-control modules/native addons after preparation followed by a new recovery operation, and count full scans for repeated verification within one operation. New/reopened operation cannot inherit an old preparation proof.
- Keep publisher guarantees exactly scoped to allowed real roots/exact generated files, excluded inputs, blocked paths and known pinned byte hashes; reject renamed excluded sources inside a tree actually collected. Do not add broad per-file license/vendor-JS hash denial or claim universal provenance.
- Read every collected file through captured traversal/open identity with no-follow recheck, including single-link files. Fix stale collectProductionPayload call signature and meaningful renamed-input fixture placement.
- Enforce an explicit release-owned Windows execution/publication exclusion independent of self-declared NativeQualification, while preserving foreign archive metadata computation. Remove or default-false explicitly gate the deferred manual Windows CI job; do not run it.
- Keep existing manifest-invalid/source-incompatible format contracts and make legacy-runtime-format diagnosis precise/actionable in exact messages and tests; do not silently reinterpret legacy receipts or introduce a contradictory code guarantee.
- All bundle fixture transports reject unknown URLs instead of reaching real HTTPS; seed/route only explicit known runtime inputs. Adopt/await the common owned-home cleanup and retain native/source qualification boundaries.
- Define the compatible private producer/operation-context evidence plumbing in this task so T7/T8 can consume it in dependency order. Missing/untrusted context performs fresh verification or refuses reuse; deep-cloned/serialized candidate data cannot grant proof reuse. Do not require unbuilt lifecycle peers for producer tests.

### 2.7 TASK-446ae69566d352dd-s1-t7 — Isolate writable dev SDK inputs and scope dev integrity proof

Keep canonical executing Node and approved closed source-worker/build proof while copying writable npm/node-gyp/header/library inputs into the owned build workspace. Apply operation-local dev payload verification and protected-runtime reuse, then tighten dev diagnostic fixtures.

**Acceptance checks:**
- Dev receipt2/new recipe, durable offers, canonical hashes and all readers agree; old embedded receipts/offers fail with an explicit compatibility diagnostic.
- Dev payloads omit Node/Ollama distributions/archives and preserve exact accepted source, native output closure, closed-worker proof and no duplicate writer.
- Dev build commands/owned npm aliases use resolved absolute private Node/npm/header/library paths; existing CUDA skip-if-unset and hostile environment isolation remain.
- Prepared candidate open/verify does not acquire/build a runtime implicitly or adopt an arbitrary runtimeDirectory; cross-mode runtime reuse is proven at the shared foundation boundary.
- Create one verified writable SDK copy per positively owned build workspace, preserving pinned source provenance and execute intent. npm/npx/node-gyp/nodedir/headers/library aliases point to that copy; Node execution stays the exact canonical protected Node. No global store/config mutation or arbitrary runtimeDirectory trust.
- Lifecycle writes adjacent to npm/headers succeed only in the isolated copy; canonical bytes/tree remain exact and ordinary direct canonical writes fail. Preserve CUDA skip only if unset, including empty/custom values; keep registry/auth delegation and source input/worker closure contracts.
- Use fresh runtime proof only within the same process/home/full identity/operation. Each new worker verifies/binds independently; reuse existing resolved objects within that worker instead of repeated full-tree checks. SDK cleanup waits for actors/resources to close.
- Dev preparation yields operation-scoped full app integrity evidence; recovered/new operation fully verifies once before destructive use, with the same invalidation rules as bundle. No app/Ollama scan added to bounded receipt/control launch.
- Tighten corrupt-toolchain assertions to exact diagnostics with positive baselines, preserve recipe2/offer identity and precise legacy diagnosis, and adopt/await common cleanup in dev/source/worker fixture homes.
- Form the manager/parent's process-local preparation evidence only after existing qualified worker/source/build/positive-close checks; never serialize a JS proof or trust a worker flag. Keep necessary inventory generation distinct from independent full verification and count the latter explicitly, with no repeated full verification for one operation.

### 2.8 TASK-446ae69566d352dd-s1-t8 — Consume operation integrity and bind installed/service processes

Wire the bundle/dev producer evidence into existing manager destructive boundaries and consume verified runtime objects within each process. Fix service-worker binding/pre-admission checks, bounded readiness and predecessor diagnostics while retaining current dependency consent/Retry/TUI behavior.

**Acceptance checks:**
- Every existing installed consumer owned by this correction selects the canonical resolved executable from explicit location+manifest identity, verifies actual process.execPath where required, and has no tools/node/PATH/runtimeDirectory trust fallback. S4 daemon boot consumes the real exposed resolver later; no S4 production consumer is required prematurely here. Future S7 bridge-process runtime selection/execution is not a current T8 consumer or a prerequisite to validating this task.
- Both delivery preparations acquire only under original controller ownership before lifecycle disruption; installed start/status/receipt resolution never downloads/builds source or traverses full app/Ollama payloads.
- S3 runtime readiness uses verified external paths, preserving Ollama consent/retention, agent recommendations, install-only Retry and terminal TUI flow.
- S4 boot/lease/shutdown/wrapper and S5 hooks remain consumers, not new implementations; separate manager action-specific peer gating is excluded and missing production peers still fail truthfully.
- Manager consumes full application proof before quiesce/migration/activation for install/upgrade/recovery and reuses it only within the same operation. Start/status/readiness/TUI control checks remain bounded; recovering or a new operation revalidates once, with proof bound to exact home/candidate identity, not a persisted receipt/wire flag.
- The --ollama-service-worker branch resolves and binds the explicit runtime before control work; workers independently validate their own executable, while same-process consumers reuse an already resolved result. No global durable runtime cache or skipped child verification.
- Resolve/validate required parent runtime before service frame/admission creation and readiness timing, with failure leaving no admitted attempt. Remove duplicate same-process supervisor resolution; preserve bounded worker readiness/ownership/closure and existing service protocol, consent/retention/agent recommendations/install-onlyRetry. Do not add lifecycle/recovery actions or change public IPC.
- Distinguish a proven owned but legacy/missing/corrupt predecessor from an unknown/unowned launcher with a specific actionable diagnostic. Never falsely label proven ownership as unrelated, overwrite unknown bytes, bypass runtime binding or claim successful TUI handoff on failure.
- Fix remaining terminal-install bare/dead assertions and exact service/launcher diagnostics; adopt/await common cleanup across installed/manager/terminal/dependency/service fixtures, retaining failure evidence and source-bound capabilities.
- Avoid double resolution when the terminal service branch delegates to executeOllamaServiceWorker: pass and validate the same process-local home/full-identity-bound result. Parent resolution precedes durable frame/admission/readiness; each actual child still performs its own one-time binding. Keep existing service admission/protocol semantics and test delayed/failed resolution before admission without adding a handshake or public field.

### 2.9 TASK-446ae69566d352dd-s1-t9 — Reconcile all review coverage and run the full scoped regression

Complete cross-consumer/fixture/qualifier integration after T1–T8 corrections. Reconcile every review item and all32LLDsubjects, run the current full scoped installer/publisher/bootstrap/dev/dependency/terminal regression, and prepare current-source native qualification scripts without treating old evidence as new.

**Acceptance checks:**
- All25 LLD subjects and ac1–ac6 have explicit owner mapping. All non-native surrounding/integrated regression evidence passes with canonical Node22 coordinator and confirmed actor cleanup after the last implementation task is built. Actual native evidence belongs to t10 and is neither required prematurely nor claimed by t9.
- Surrounding S2/S3/terminal/bridge/public-contract tests preserve source closure, consent/Retry/TUI and no full app/Ollama status/readiness rehash; no test fixture certifies a real unavailable lifecycle/migration peer.
- Generated ER retains one runtime ->0..N releases, sequence retains exact helper-exit/fresh-manager ownership ordering, and component/import boundaries match implementation. Source and render checks distinguish unavailable evidence.
- Final regression/source checks pass before completion; tracker/build admission failures are reported rather than bypassed with fabricated Define/issue bindings or raw workflow edits.
- Verify adoption and awaited cleanup across every runtime-publishing/copying fixture and allocation-error/after/finally/wrapper path, including native qualifier homes. Inventory actual creation/copy/publication call sites; no raw force-rm escape for sealed owned roots, no global/shared/blocked-root mutation.
- Complete qualifier/probe source changes here before evidence-onlyT10: actual helper staged executable comparison, current source pin/digests, protected publication/cleanup and real Linux dash signal checks. Preserve trusted slow-VM budgets for USB/VM operations and ordinary production constants.
- Run the full scoped foundation regression only after T1–T8 corrections pass their surrounding checks; use the canonical owned coordinator and appropriate direct controller selections, record exact current source/platform/runtime/TAP/actor disposal. Do not relabel prior306cases/old native reports or the small primitive probe as this execution.
- Reconcile all32 current LLD subjects, owner choices, round1/T1–T6/round2/R3 findings and code-vs-design dispositions; each closed item has meaningful exact evidence. Manual recovery follow-up is tracked for pre-general-release consideration, not a new implemented action or an extra per-finding issue.
- All tasks require registered validation and commit/source attribution. A300sMCP response timeout never triggers a duplicate while the original daemon validation may run; inspect its exact source-bound ledger/closure result first. No task/actor completion is inferred from age/PID. Preserve blocked isolate d7a67629 unchanged.
- No per-task human approval is requested. Final Story BUILD approval follows all task checks, current full regression, T10 qualification and applicable upstream/accounting/signoff gates; no automatic review endpoint or fabricated tracker binding.
- Large retained tasks are executed as bounded owner-local code/test batches, preserving task IDs and dependencies; do not split by finding or rewrite unrelated completed prerequisites. The canonical fixture inventory includes indirect copy/prepare/publication wrappers and all async cleanup awaits, with explicit retained uncertainty rather than silent temporary-root leaks.

### 2.10 TASK-446ae69566d352dd-s1-t10 — Requalify current macOS/Linux foundation and record S4 handoff

Keep evidence-only T10 ownership, but require current-source actual UTMmacOS and OrbStackLinux qualification after all corrections, including protected publication/reuse/cleanup and Linuxdash cancellation. Preserve historical source pins and Windows deferral; hand off only the runtime foundation after final human BUILD approval.

**Acceptance checks:**
- Actual UTM macOS and OrbStack Linux runtime-first-acquisition/native-build/offline-reuse/installed-consumer checks are distinguished from fixtures and host emulation; host v2/Ollama remain untouched. Retained native evidence is reusable only with exact relevant source/build-policy equivalence, pinned runtime/platform identity and verified actor closure; retain its original execution source pin.
- Current foundation completion covers macOS/Linux. The original native-Windows-first-install-reuse-named-path-ACL-header-library-and-loaded-DLL-safe-publication subject is deferred, not passed and not a current T10 gate. Windows requires genuine native ACL/path/header/library/loaded-DLL-safe-publication evidence before future enablement; POSIX execution, cross-archive metadata or an availability diagnostic cannot qualify it. ISSUE-cab5701fbefab736 remains its separate process-ownership prerequisite; Windows target publication/enablement stays disabled.
- Qualification is for the runtime foundation and existing installed-consumer boundaries; no end-to-end S4/S5 daemon activation proof is fabricated or introduced as a cyclic prerequisite.
- No source changes are made during this evidence-only task. Any required correction returns to its owning task and reruns appropriate tests/regression; user BUILD approval is requested only after all required validation/task accounting/tracker gates are satisfied.
- Use ordinary-user isolated UTMmacOS/OrbStackLinux homes and the explicitly selected trusted slow-VM profile. Prove live official runtime acquisition, exact Node22.22.1/npm10.9.4/header/native toolchain, actual root0700native publication/root0500finalization, protected direct-write denial, same-inode zero-request offline reuse, isolated writable SDK/native build and installed consumer binding with positive actor/resource closure.
- Run real foreground-group SIGINT/SIGTERM/SIGHUP bootstrap cleanup under Linux/bin/sh=dash at the current source; the old macOS bash-in-POSIX-mode run is not a substitute. Retain shell-only/pre-fork cancellation-latency limits and source-only PowerShell evidence.
- Fresh proofs keep exact execution source/build policy/runtime/platform and original timestamps, raw report/digest/export/probe/disposal records. Reuse evidence only with recorded relevant source/policy equivalence and positive closure; prior native/bootstrap/full regression results retain their historical source pins, not current qualification labels.
- Keep current hostv2/Ollama and all blocked/uncertain real isolates untouched; do not activate the daemon, install Ollama or enable/publish a release as part of foundation qualification. Windows/x64/bridge/lifecycle/migration gates remain deferred/separately owned, never passed from metadata or POSIX availability checks.
- No production, test or qualifier source edits in T10: any correction returns to its owning task for validation and appropriate regression before native rerun. Request human BUILD approval only after current required evidence and all task/integrity/upstream/team gates pass.

## 3. Test-strategy coverage

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
| runtime-rejection-matrix-proves-positive-baseline-and-exact-diagnostic-for-each-mutation | `t2` |
| ordinary-runtime-deadlines-ignore-qualification-env-and-trusted-qualifier-remains-bounded | `t1` |
| posix-runtime-protection-preserves-pinned-inventory-and-rejects-write-bits-or-execute-drift | `t2`, `t4` |
| bootstrap-no-host-node-verifies-archive-and-executable-before-execution | `t3`, `t5` |
| verified-runtime-and-control-reuse-offline-across-bundle-and-dev | `t4`, `t5`, `t7`, `t9` |
| bootstrap-native-operation-lock-exclusive-publication-exact-helper-exit-then-fresh-manager-lock | `t4`, `t5` |
| bootstrap-publication-stage-distinct-from-running-node-and-loaded-native-library | `t4`, `t5` |
| runtime-stage-cancellation-conflict-and-uncertain-closure-retain-safe-state | `t3`, `t4`, `t5` |
| bundle-dev-manager-terminal-TUI-Retry-and-publisher-probes-use-shared-resolver | `t6`, `t7`, `t8` |
| private-dev-node-npm-headers-native-env-and-worker-source-closure-preserved | `t7` |
| publisher-app-and-IDE-inventory-exclude-Node-Ollama-distributions-and-archives-including-renamed-contributions | `t6` |
| application-integrity-once-per-operation-and-full-recovery-before-activation | `t6`, `t7`, `t8` |
| writable-dev-SDK-isolation-and-manual-runtime-recovery-guidance | `t2`, `t7` |
| posix-runtime-root-only-interrupted-publication-recovery-and-closed-stage-discard | `t2`, `t3`, `t4` |
| native-runtime-publication-keeps-root-writable-until-rename-and-finishes-root-seal | `t4` |
| shared-runtime-fixture-cleanup-restores-owned-directory-write-after-positive-closure | `t2`, `t9` |
| S3-Ollama-consent-retention-agent-recommendations-and-install-only-Retry-preserved | `t8`, `t9` |
| terminal-install-success-ready-lock-release-same-terminal-TUI-and-failure-no-TUI-preserved | `t5`, `t8`, `t9` |
| status-readiness-and-control-checks-do-not-scan-full-app-Ollama-payload | `t8` |
| final-scoped-installer-publisher-bootstrap-dev-dependencies-terminal-regression | `t9` |
| UTM-macOS-fresh-live-acquisition-offline-reuse-and-isolated-installed-consumer-smoke | `t10` |
| OrbStack-Linux-fresh-live-acquisition-native-build-and-offline-reuse-smoke | `t10` |
| unsupported-or-unavailable-target-is-not-enabled-by-cross-archive-metadata-or-foreign-tests | `t10` |

## 4. References

- **[[c1]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#41-private-runtime-policy-and-resolvedprivateruntime` — "Approved private policy/original official bytes and full identity; §4.2fixed ordinary budgets plus explicit trusted qualifier context, no ambient selector override."
- **[[c2]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#3-contract-details` — "§3.2/§3.5read-only resolver and source/published/root-only lanes; exact error guidance, positive independent fixture matrix and §4.7owned-test-home cleanup."
- **[[c3]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#43-runtime-acquisition-and-bootstrap-handoff` — "Bounded official mutable source acquisition and closed original-owner stage handling; protected-stage discard only within owned capability."
- **[[c4]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#43-runtime-acquisition-and-bootstrap-handoff` — "Root0700through actual native cross-parent publication, then same-lock root0500/fsync/strict verification before paths; only exact root-write crash finalization, no broad conversion."
- **[[c5]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#34-renderinstallerbootstrap` — "Accepted bootstrap authentication/real child exit/same-terminal semantics; preserve signal limits and complete canonical-work/foreign-size case corrections."
- **[[c6]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#44-application-only-bundle-descriptor-and-dev-receipt` — "Application-only bundle/publisher known-source/content boundary, single-link identity recheck, formatdiagnostics and target exclusion; §4.5once-per-operation full application proof."
- **[[c7]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#45-installed-launch-and-preparation-binding` — "Owned writable dev SDK from verified protected source; canonical executing Node, closed source/build workers and process-local operation proof; no wire trust flag."
- **[[c8]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#45-installed-launch-and-preparation-binding` — "Existing manager/terminal/TUI/Retry/service consumers reuse verified runtime within process, bind new processes and place required parent resolution before service admission/readiness; bounded launch/"
- **[[c9]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#7-test-strategy` — "32current subjects, exact ac1–ac6mapping, real producer/consumer and diagnostic fixtures, shared awaited owned-home cleanup, final scoped regression and truthful evidence."
- **[[c10]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/LLD.md#8-migration` — "Current macOS/Linux actual qualification, root publication/cleanup and Linuxdash cancellation; original native Windows subject deferred, no hostv2/Ollama/blocked-isolate operations or S4/S5/S7scope."
- **[[c11]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/manual-review-20261128/disposition-status.json` — "Round1–3 review dispositions and accepted6codefixes; remaining implementation/design items are traced to their original owners. Owner choices resolved in LLD8metadata by the user's explicit approval."
- **[[c12]]** `prior-artifact` `docs/standalone/complete-shared-external-node-runtime-foundation-E20261126446ae695/S001/evidence/plan4-realignment/plan3-baseline.json` — "Exact approved PLAN3baseline captures all10existing task IDs/order/dependencies and historical accepted work; corrective PLAN4changes scope/tests without new per-finding tasks or issues."
