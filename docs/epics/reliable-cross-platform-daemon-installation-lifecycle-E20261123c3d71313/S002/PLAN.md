<!-- insrc:artifact PLAN-c3d71313f34bce71-s2 -->

# Plan: STORY-c3d71313f34bce71-s2

## Summary

**Epic:** `reliable-cross-platform-daemon-installation-lifecycle`
**LLD run:** `wf-1795511211216-taq2ib`
**LLD effective hash:** `acb12724c316...`

Build development delivery around the completed S1 manager: accept an exact source offer, prepare a retained checkout with private tooling, verify a complete immutable dev payload and reopen it through installed manager/terminal composition. Nine bounded tasks separate metadata, tooling, worker/Git/payload work, normal manager integration, recovery and final regression. Per-task validation uses surrounding tests; final combined installer/native-host evidence follows composition, with real platform/live qualification remaining S8.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Define strict dev source, preparation and receipt metadata | M | — | — | unit: dev-source-offer-binds-repo-branch-commit-target-runtime-recipe-without-payload-hash; unit: dev-receipt-binds-final-manifest-inventory-and-contained-checkout-without-self-hash; unit: invalid-option-like-ref-source-and-ambiguous-receipts-rejected | [[c1]] [[c2]] [[c3]] |
| 2 | **`t2`** Use explicit verified private npm throughout source builds | M | — | `t1` | smoke: dev-private-node-and-explicit-npm-cli-work-with-no-host-npm-wrapper; smoke: dev-build-children-ignore-host-node-npm-and-preserve-explicit-cuda-setting; integration: missing-or-mismatched-private-toolchain-headers-and-prerequisites-refuse-without-elevation | [[c1]] [[c2]] [[c3]] [[c5]] |
| 3 | **`t3`** Implement owned preparation worker protocol and closure evidence | L | — | `t1`, `t2` | integration: cancel-or-terminal-eof-drains-owned-preparation-actors-before-return; integration: held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup; integration: worker-protocol-rejects-foreign-checkpoint-and-empty-prepared-result | [[c1]] [[c2]] [[c3]] [[c5]] |
| 4 | **`t4`** Resolve exact Git sources and preserve retained checkouts | L | — | `t1`, `t3` | integration: selected-repo-branch-exact-commit-and-unrelated-branch-never-selected; integration: dirty-conflicting-missing-or-foreign-selected-checkout-preserved; integration: read-only-dev-check-never-fetches-builds-or-writes-install-state; integration: offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned | [[c1]] [[c2]] [[c3]] |
| 5 | **`t5`** Assemble complete dev payloads and compose the preparation workload | L | — | `t1`, `t2`, `t3`, `t4` | integration: staged-dev-payload-requires-all-control-runtime-assets-and-clean-worker-result; integration: npm-build-fetch-and-native-probe-failure-preserve-incumbent; integration: immutable-dev-payload-tamper-or-existing-id-conflict-refuses-before-shutdown | [[c1]] [[c2]] [[c3]] [[c4]] |
| 6 | **`t6`** Integrate dev offers and publication with the S1 manager | L | — | `t1`, `t4`, `t5` | integration: dev-manager-separates-accepted-source-offer-from-final-artifact-and-publishes-once; integration: offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned; integration: dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build; integration: bundle-offer-receipt-and-required-sibling-admission-regressions-preserved | [[c1]] [[c2]] [[c3]] [[c5]] |
| 7 | **`t7`** Recover interrupted dev preparation without duplicate workers | L | — | `t3`, `t6` | integration: manager-self-exit-before-candidate-recovers-same-source-with-no-duplicate-worker; integration: held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup; integration: published-release-before-candidate-record-reconciles-without-rebuild; integration: cancel-or-terminal-eof-drains-owned-preparation-actors-before-return | [[c1]] [[c2]] [[c3]] [[c5]] |
| 8 | **`t8`** Wire dev receipts into installed manager and terminal composition | M | — | `t5`, `t6`, `t7` | integration: dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build; integration: dev-common-handoff-selects-candidate-bootstrap-runtime-and-retains-mode; integration: bundle-offer-receipt-and-required-sibling-admission-regressions-preserved | [[c1]] [[c2]] [[c3]] [[c5]] |
| 9 | **`t9`** Validate composed dev installation and preserve installer regressions | M | — | `t1`, `t2`, `t3`, `t4`, `t5`, `t6`, `t7`, `t8` | smoke: dev-complete-payload-native-probe-and-fresh-installed-manager-inspect; integration: combined-s1-s2-installer-regression-has-complete-coverage-and-confirmed-cleanup | [[c4]] [[c5]] [[c6]] [[c7]] |

### 1.1 TASK-c3d71313f34bce71-s2-t1 — Define strict dev source, preparation and receipt metadata

Add the approved source-offer, checkpoint/result/cancel and dev receipt types/parsers in the proposed dev modules. Reuse S1 canonical hashing, bounds, path and target/runtime validators; keep public wire records and current bundle consumers compiling until the coordinated integration task.

**Acceptance checks:**
- Validate unknown fields, versions, IDs, source/ref forms, target/runtime/recipe, portable checkout/stage paths, nonce/run identity and record-size bounds; preserve shared Windows drive canonicalization.
- Compute the approved noncircular source digest/prospective release ID separately from final receipt/inventory digests; define full PreparedCandidate reconstruction and reject same-ID/different-source or mixed receipt modes.
- Validate commit-bound optional package.json insrcInstaller hook references in order, without executing hooks or importing application services.
- Do not switch existing PreparedReleaseOffer consumers to a partially wired union or alter public Delivery/Installation/ReleaseManifest/ManagerRequest/UpgradeOffer/Phase schemas.

### 1.2 TASK-c3d71313f34bce71-s2-t2 — Use explicit verified private npm throughout source builds

Extend the existing canonical build stages with the approved explicit npmCli option and add the private source-build environment composition. Reuse runtime policy and coordinator ownership rather than introduce another build pipeline.

**Acceptance checks:**
- Run npm ci and every coordinated stage through absolute verified Node 22.22.1 and matching npm 10.9.4 CLI, including when bin/npm is absent. Existing ordinary coordinator defaults remain unchanged.
- Prepend private Node for child scripts, clear Node injection and inherited foreign coordinator identity, pin native runtime/header settings and fail concretely on missing verified prerequisites without host/elevated fallback.
- Preserve explicit CUDA-install values including empty; default skip only when absent. Preserve delegated Git/registry credentials without capturing them or changing global config, HOME or PATH.
- Resolve accepted-checkout helpers/dev dependencies from that checkout; any necessary packaging root/npm override stays minimal and retains the existing writer, fingerprint and native-probe gates.

### 1.3 TASK-c3d71313f34bce71-s2-t3 — Implement owned preparation worker protocol and closure evidence

Implement bounded private worker launch/cancel/result validation and lifetime ownership using the existing coordinator/process machinery. Establish the reusable source-command runner before composing the complete worker workload.

**Acceptance checks:**
- Bind launch, cancel, result, cleanup digest and child-close evidence to installation/operation/attempt/source/nonce/run and derive all paths from the validated owned checkpoint.
- Propagate AbortSignal and terminal/owner EOF into the retained preparation actor scope, bound drain and return explicit uncertainty when closure cannot be established.
- Finalize outcomes only after all admitted command actors close and cleanup/ownership evidence agrees; a log line, PID/age, free lock or status projection alone never authorizes success or cleanup.
- Worker code has no controller commit, candidate-publication or daemon/application-data capability. It can finish/dispose private work after manager self-exit but cannot select or activate.
- Missing work or an incomplete staged result cannot emit prepared. Full production worker workload is composed only after the Git and payload components are implemented.
- A command-parent close is not proof that all admitted work closed: reconcile nested coordinator actors/close journals and cleanup digests, and retain uncertainty for unconfirmed descendants or unsupported target closure evidence before publication or retry.

### 1.4 TASK-c3d71313f34bce71-s2-t4 — Resolve exact Git sources and preserve retained checkouts

Implement read-only dev source discovery and the isolated accepted-commit Git preparation/preflight component in the proposed dev boundary, using the owned runner for all commands and retaining source outside immutable payloads.

**Acceptance checks:**
- Resolve only the configured refs/heads branch with bounded argument-array Git; check-upgrade performs no fetch, clone, npm/build or mutation of controller/selected source/preparation records.
- Create a new private attempt checkout, fetch only the configured source and detach at the accepted commit. Branch movement cannot substitute another commit; unavailable exact objects fail before disruption.
- Inspect the selected receipt's exact managed checkout for expected origin/HEAD, tracked/untracked edits, conflicts and build-input fingerprint; inspect an explicitly selected local source working tree as required. Preserve dirty/missing/foreign trees with actionable diagnostics.
- Use contained checkout and staging roots, disable untrusted Git hooks/fsmonitor where applicable, and never reset/clean/switch the selected checkout or alter global Git settings.
- Verify supported same-source/target/protocol/recipe predecessor provenance and forward ancestry; carry accepted commit hook metadata for final manifest preparation without implementing migration policy.

### 1.5 TASK-c3d71313f34bce71-s2-t5 — Assemble complete dev payloads and compose the preparation workload

Compose the source worker's real Git/private npm/build/packaging workload. Reuse S1 bundling, production-closure/inventory and native/runtime probes to leave a verified private stage plus dev receipt/result for the manager.

**Acceptance checks:**
- Build only the accepted isolated checkout under canonical ownership, preserve build-input/output fingerprints, and retain its managed source separately from the runtime inventory.
- Stage bootstrap.mjs, manager.mjs, native/control.node, tools/node, compiled daemon/TUI/MCP/assets and the full production/workspace/native dependency closure using the existing helpers and bounded contained inventory rules.
- Write canonical inventory/dev receipt with the approved digest semantics and exact source/runtime/target/predecessor/hook identity; probe before returning prepared and reject incomplete, linked, escaped, colliding or changed payload files.
- Emit a nonce/run/source-bound worker result only after confirmed child cleanup; do not publish/select a release or fabricate qualified bundle/native/live evidence.
- Use controlled payload fixtures for task-level failure coverage; the actual complete dev payload and fresh installed-manager smoke belong to the final composed regression task.

### 1.6 TASK-c3d71313f34bce71-s2-t6 — Integrate dev offers and publication with the S1 manager

Implement the dev DeliveryPort and switch private offer/context types together with all manager, bundle-adapter and fixture consumers. Preserve public protocol shapes and the common final candidate contract.

**Acceptance checks:**
- Use a real private bundle/dev-source offer discriminant. Keep bundle descriptor checks unchanged while dev offer IDs bind source digest plus installation/location/predecessor/delivery without a fabricated payload manifest.
- Re-resolve at locked acceptance, reject stale offers and persist accepted source/checkpoint before worker admission through bounded same-operation manager callbacks; expose no unrestricted metadata/controller writer to the adapter.
- After verified worker closure, publish only through the original restricted manager-held lease, fully verify the final receipt/source/payload identity, and persist the ordinary candidate record before existing lifecycle/migration handoff.
- Dev open/verify use persisted receipt/inventory/runtime only, require no adapter memory, Git, npm or build, and reuse an existing same-source release only after complete validation; conflicting bytes never overwrite an immutable ID.
- Retain all actual sibling-port admission and S1 terminal/offer/stop/escalation/selection safeguards. Unconfirmed cleanup retains blocked preparation instead of taking the ordinary error path that clears an operation.

### 1.7 TASK-c3d71313f34bce71-s2-t7 — Recover interrupted dev preparation without duplicate workers

Add the approved explicit pre-publication retry path to the existing manager and connect cancellation end to end. Use the same operation/source checkpoint and S1 post-publication recovery after candidate reconciliation.

**Acceptance checks:**
- Existing retry-migration can reconcile preparing dev operations without candidate metadata by validating original intent/source/attempt/run/nonce and positive actor cleanup/ownership evidence; never re-resolve the branch during recovery.
- Finalize a fully verified prepared/published candidate once, or start one fresh serial attempt for the same accepted source only after the prior failed/cancelled attempt is confirmed closed.
- Missing, foreign, held or unknown evidence remains preparation-uncertain with retained checkpoint/diagnostics and refusal of independent mutation; no PID/age/endpoint inference, duplicate worker or automatic retry loop.
- Confirmed pre-disruption failure/cancellation preserves prior selection and ready/stopped result; edited/uncertain source is retained. Abort/EOF prevents later publication or TUI handoff.
- Once candidate metadata exists, use S1 exact-candidate migration/activation recovery unchanged; no daemon lifecycle, migration-hook or application DB implementation is added.

### 1.8 TASK-c3d71313f34bce71-s2-t8 — Wire dev receipts into installed manager and terminal composition

Add strict installed receipt-mode dispatch and compose the real dev adapter in productionPeers. Consume the existing S1 shared terminal, selected-release launcher and TUI handoff without creating a separate installation path.

**Acceptance checks:**
- An installed manager accepts exactly one qualified bundle or local dev receipt, validates version/target/runtime and controller delivery identity, and opens dev candidates in a fresh process without Git/build or in-memory offer caches.
- Compose peers.dev while preserving existing bundle delivery and explicit absence of owning S3/S4/S5 ports; no fixture/no-op certifies a production installation.
- Pass terminal cancellation through the new preparation context; preserve forged ordinary-install rejection, all TTY checks, exact offer consent and same-terminal success handoff after ready commit and lock release.
- Publish/retry using the selected dev release's own complete bootstrap/private runtime/manager/TUI pair; TUI launch failure cannot undo completed selection and prints the selected retry command.
- Keep current application IPC, IDE launch contracts and host v2 installation untouched; no IDE-specific installer, bridge or daemon boot implementation is introduced.

### 1.9 TASK-c3d71313f34bce71-s2-t9 — Validate composed dev installation and preserve installer regressions

Run the final combined S1/S2 installer regression after implementation tasks, add the actual complete dev payload/native-host/fresh-manager smoke and record scoped evidence and qualification limits for the story BUILD gate.

**Acceptance checks:**
- Exercise real local Git source selection/private-tooling preparation plus fixture owning-peer handoff; verify exact accepted commit, delivery mode, incumbent preservation, recovery and selected bootstrap/runtime behavior together.
- Build and verify the actual complete dev payload under canonical ownership, load/probe native/runtime components, then run the installed manager inspect in a fresh process with no host Node/npm dependency.
- Run the combined installer/installation-home regression including S1 bundle, controller, escalation, terminal and payload boundaries after all source changes; record actual case counts, typecheck, timeouts/skips and confirmed actor cleanup truthfully.
- Keep per-task iteration limited to surrounding tests, avoid an unrelated legacy/backend sweep, and do not represent local/fixture evidence as actual UTM/OrbStack/Windows or live migration/IDE qualification.
- Preserve generated ownership/sequence definitions if implementation changes documented boundaries and present the complete story BUILD only after all tasks and required tests pass.
- Keep expensive actual payload/native-host smoke in a separate final integration test file so parser/Git/ownership task selectors remain surrounding-only; required formal validation is still run, with local/fixture/live evidence distinguished.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| dev-source-offer-binds-repo-branch-commit-target-runtime-recipe-without-payload-hash | `t1`, `t4`, `t6` |
| dev-receipt-binds-final-manifest-inventory-and-contained-checkout-without-self-hash | `t1`, `t5` |
| invalid-option-like-ref-source-and-ambiguous-receipts-rejected | `t1`, `t4`, `t8` |
| read-only-dev-check-never-fetches-builds-or-writes-install-state | `t4`, `t6` |
| offer-moves-before-acceptance-is-stale-after-acceptance-remains-pinned | `t4`, `t6` |
| dev-open-verify-and-fresh-manager-reopen-never-fetch-or-build | `t6`, `t8`, `t9` |
| bundle-offer-receipt-and-required-sibling-admission-regressions-preserved | `t6`, `t8`, `t9` |
| dev-common-handoff-selects-candidate-bootstrap-runtime-and-retains-mode | `t8`, `t9` |
| selected-repo-branch-exact-commit-and-unrelated-branch-never-selected | `t4`, `t5`, `t9` |
| dirty-conflicting-missing-or-foreign-selected-checkout-preserved | `t4`, `t7` |
| npm-build-fetch-and-native-probe-failure-preserve-incumbent | `t5`, `t6`, `t9` |
| cancel-or-terminal-eof-drains-owned-preparation-actors-before-return | `t3`, `t7` |
| manager-self-exit-before-candidate-recovers-same-source-with-no-duplicate-worker | `t7` |
| held-unknown-or-mismatched-preparation-result-blocks-retry-and-cleanup | `t3`, `t7` |
| published-release-before-candidate-record-reconciles-without-rebuild | `t7` |
| immutable-dev-payload-tamper-or-existing-id-conflict-refuses-before-shutdown | `t5`, `t6` |
| dev-private-node-and-explicit-npm-cli-work-with-no-host-npm-wrapper | `t2`, `t9` |
| dev-build-children-ignore-host-node-npm-and-preserve-explicit-cuda-setting | `t2`, `t9` |
| dev-complete-payload-native-probe-and-fresh-installed-manager-inspect | `t9` |

## 3. References

- **[[c1]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/LLD.md#2-contract-details`
- **[[c2]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/LLD.md#3-data-model-changes`
- **[[c3]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/LLD.md#5-error-paths`
- **[[c4]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/LLD.md#6-test-strategy`
- **[[c5]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/LLD.md#4-interaction-with-shared-contracts`
- **[[c6]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/LLD.md#1-hld-context`
- **[[c7]]** `prior-artifact` `docs/epics/reliable-cross-platform-daemon-installation-lifecycle-E20261123c3d71313/S002/LLD.md`
