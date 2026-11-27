<!-- insrc:artifact PLAN-a5d5b2bb021655d0-s1 -->

# Plan: STORY-a5d5b2bb021655d0-s1

## Summary

**Epic:** `propagate-longer-time-budgets-through-installer`
**LLD run:** `wf-1795787623125-0c9h3u`
**LLD effective hash:** `4d00a48b868b...`

Introduce one fixed, opt-in slow-VM timing policy and carry it through runtime I/O, owned build processes and native qualification without changing ordinary defaults. Child launch uses the parent’s remaining time and reserved cleanup, while outer deadlines cancel in-process preparation and containing runners reserve enough time. Validate each implementation task with surrounding tests, then qualify a fresh UTM home after prior-worker closure and run a final current-source scoped regression with an independent closure audit.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**: Standalone prerequisite with no approved BUILD in this work item.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Add and publish the fixed qualification budget policy | M | — | — | unit: qualification-profile-selects-frozen-normal-and-slow-vm-role-budgets; unit: invalid-profile-fails-before-any-filesystem-or-worker-admission; unit: profile-snapshot-cannot-change-after-module-import; integration: copied-policy-asset-has-source-bytes-and-loads-from-installed-control | [[c1]] [[c2]] [[c7]] |
| 2 | **`t2`** Propagate the profile through coordinator and Git scopes | M | — | `t1` | unit: explicit-short-scope-overrides-remain-exact-under-slow-vm; integration: omitted-child-profile-is-canonicalized-and-conflicting-profile-rejected; integration: qualification-profile-reaches-manager-worker-private-npm-and-runtime-helpers; integration: normal-coordinator-and-git-role-caps-remain-exact | [[c1]] [[c3]] |
| 3 | **`t3`** Apply selected budgets to runtime acquisition and resource closure | M | — | `t1` | integration: slow-vm-runtime-download-verification-and-decoder-drain-have-no-hidden-normal-cap; integration: profile-never-waives-positive-resource-or-process-closure; integration: normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged | [[c1]] [[c4]] |
| 4 | **`t4`** Bound worker launch by remaining parent time and cleanup reserve | M | — | `t2`, `t3` | integration: child-budget-is-parent-remaining-minus-reserve-after-runtime-setup; integration: parent-cooperative-reserve-covers-worker-drain-and-final-evidence; integration: qualification-profile-reaches-manager-worker-private-npm-and-runtime-helpers; integration: profile-never-waives-positive-resource-or-process-closure; integration: normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged | [[c1]] [[c3]] [[c5]] |
| 5 | **`t5`** Wire qualification cancellation, evidence and containing budgets | M | — | `t2`, `t3`, `t4` | integration: outer-deadline-cancels-independent-in-process-preparation; unit: ci-and-operator-containment-admit-only-sufficient-native-work-and-cleanup-headroom; integration: copied-policy-asset-has-source-bytes-and-loads-from-installed-control; integration: qualification-profile-reaches-manager-worker-private-npm-and-runtime-helpers | [[c1]] [[c5]] [[c6]] |
| 6 | **`t6`** Validate the slow profile on the UTM macOS guest | M | — | `t5` | live: fresh-UTM-macOS-slow-vm-profile-completes-native-foundation-and-confirmed-closure | [[c1]] [[c7]] [[c8]] |
| 7 | **`t7`** Complete current-source scoped regression and story validation | M | — | `t6` | smoke: current-budget-correction-surrounding-and-final-scoped-regression-have-confirmed-cleanup | [[c1]] [[c7]] [[c8]] |

### 2.1 TASK-a5d5b2bb021655d0-s1-t1 — Add and publish the fixed qualification budget policy

Add proposed src/installer/qualification-time-budgets.mjs and src/installer/qualification-time-budgets.d.mts. Select normal/slow-vm once at import, deeply freeze role values, validate the enum before admission, and preserve every normal numeric value. Update copy-assets.mjs to copy and byte-verify the MJS beside compiled consumers; exercise installed and bundled imports through existing payload publication. No application/source-builder dependencies in the policy.

**Acceptance checks:**
- Absent/normal and slow-vm snapshots match the LLD role table exactly; slow-vm includes 40min commands,4h worker/manager,2h qualification build/file,5h qualification run,120s manager cleanup and5min outer cleanup.
- Unknown/empty/whitespace/numeric selectors fail with qualification-profile-invalid before work; policy cannot change after import or mutation.
- Copied out policy matches source bytes and imports independently; repeat actual installed/bundled consumer integration in t5 once all consumers are wired. Preserve runtime identity/wire/payload provenance rules.

### 2.2 TASK-a5d5b2bb021655d0-s1-t2 — Propagate the profile through coordinator and Git scopes

Update scripts/test-harness/context.mjs and existing child environment composition in scripts/test-harness/process.mjs as required by actual call paths. Use fixed coordinator defaults and canonical profile in every owned child/custom/private-npm environment; supply omission, reject conflict and Windows case aliases. Preserve exact validated explicit overrides and lease/run schemas. Select Git role in src/installer/dev-git.ts. Use existing coordinator fixtures, with proposed focused policy tests as needed.

**Acceptance checks:**
- Existing normal DEFAULT_BUDGETS and Git values remain exact; slow role values reach run.json and actual retained child environments.
- Deliberately short explicit clocks remain exact after selection; invalid overrides still reject.
- Omitted selectors are restored from admitted snapshot and conflicting/invalid selectors reject before spawn, including duplicate Windows key casing; private npm aliases retain the profile.
- Existing lease ownership, unique admission/close/disposal journals and strict closure behavior are preserved.

### 2.3 TASK-a5d5b2bb021655d0-s1-t3 — Apply selected budgets to runtime acquisition and resource closure

Update timing fields only in src/installer/runtime-metadata.ts and existing src/installer/runtime-acquire.ts, src/installer/runtime-store.ts, src/installer/controller-store.ts, src/installer/bootstrap-foundation.ts, src/installer/runtime-archive.ts and src/installer/download.ts consumers. Cover deadline wrappers, ZIP decoder drains and enclosing resource guards. Keep src/installer/owned-file.ts successful-close semantics; it has no standalone close timer. Audit actual related callers for hidden normal caps without redesigning resource ownership.

**Acceptance checks:**
- slow-vm acquisition/download/extraction40min, read-only verification/publication8min and existing resource/decoder drains30s reach actual helper timers; normal600s/120s/5s remain.
- downloadBoundedAsset retains its owner's signal; no redundant shorter hidden acquisition cap or invented synchronous-close timeout.
- RUNTIME_LIMITS shape, structural byte/count caps, independent integrity pins, headers/npm binding, durable writes and actual resource closure remain unchanged.
- Accelerated cancellation/uncertainty tests confirm expiry never authorizes stage removal or successful publication.

### 2.4 TASK-a5d5b2bb021655d0-s1-t4 — Bound worker launch by remaining parent time and cleanup reserve

Update src/installer/dev-delivery.ts ownedScope and src/installer/dev-worker.ts to use manager/worker roles and canonical inherited profile. Capture monotonic parent expiry at admission and pass the LLD local-only deadline option. Immediately after runtime verification, before scope.start, cap selected/explicit worker allowance by parent remaining minus reserve; fail before spawn when exhausted. Preserve existing cancel frames, DevWorkerLaunch JSON and finalization proof. Verify private toolchain env in src/installer/dev-toolchain.ts without unrelated refactoring.

**Acceptance checks:**
- Barrier-controlled runtime setup consumes parent allowance; child clock is computed after setup and never resets parent time.
- No positive remaining allowance yields source-build-failed before spawn; short explicit budgetMs remains a cap.
- Worker/manager use selected role values and manager120s reserve contains worker30s drain/final evidence; early cancellation remains immediate.
- Actual result, worker lease closure and parent command disposal remain required; wire/controller/receipt schemas unchanged; missing proof stays preparation-uncertain.

### 2.5 TASK-a5d5b2bb021655d0-s1-t5 — Wire qualification cancellation, evidence and containing budgets

Update scripts/qualify-runtime-foundation.mjs to select outer role before allocation, record profile/resolved role caps at evidence start and connect outer work expiry to its AbortController across independent/in-process preparation. Update runtime-foundation-only .github/workflows/ci.yml profile selection and containment240min normal/360min slow; retain backend20min behavior. Add proposed scripts/qualification-containment.mjs with focused proposed scripts/__tests__/qualification-containment.test.ts for shared finite admission checks, and document the local detached supervisor envelope in docs/testing.md. Bound setup/preflight and refuse native admission with insufficient remaining allowance. Do not dispatch Windows job.

**Acceptance checks:**
- Invalid selector fails before fresh home/lease allocation; evidence records selected role values without certifying success.
- Outer expiry and explicit cancellation reach independently owned worker/in-process packaging, with cascading bounded cleanup; timers/listeners dispose on all exits.
- Hosted slow profile fits360min: preflight work<=40min plus setup/drain<=5min; native5h plus cascade<=7min; remaining diagnostic headroom. Admission refuses insufficient remaining time.
- Normal runtime-foundation job contains existing2h native budget; backend workflow behavior is unchanged. Local supervisor covers selected5h work plus drain/diagnostics, with no hidden60/90/120min wrapper.
- Use owned coordinator for preflight; selected-test run/file caps are reconciled with enclosing allowance; Windows ownership prerequisite remains separate, no native dispatch.
- After t2-t4 wiring, prove actual installed/bundled consumers receive copied policy bytes and preserve import boundaries; avoid a generic supervisor framework.

### 2.6 TASK-a5d5b2bb021655d0-s1-t6 — Validate the slow profile on the UTM macOS guest

After all implementation surrounding checks pass, use a committed built source in the existing ordinary-user UTM macOS guest. First establish qualified retired-worker closure/reconciliation through existing proof; retain iq-wZetTc stage, checkpoint and lease untouched while proof is absent. Once admitted, use a fresh home and retained detached supervisor under slow-vm for live official Node acquisition, offline reuse, private npm/build/payload/native consumers. Record exact source, OS/runtime, budget roles, stages and independent parent/worker closure in this story's evidence. Do not claim historical Linux or fixture Windows evidence as current native proof.

**Acceptance checks:**
- Retired worker closure prerequisite is positively satisfied before a new qualification; PID/age/closed child commands alone do not suffice. If absent, record blocked with retained evidence and do not retry.
- Fresh UTM run uses INSRC_QUALIFICATION_PROFILE=slow-vm and sufficient supervisor allowance, with Node22 and matching npm; CUDA skip is set only if absent.
- Live acquisition, offline zero-network reuse, private build/payload/native consumer probes complete successfully with matching identity and full independent parent/worker closure.
- No release enablement or host daemon/Ollama mutation; failed/missing native evidence remains unsatisfied. Feedback corrections go through affected task checks before completion.
- Evidence explicitly distinguishes blocked admission, failed actual qualification and passing actual qualification; no native work overlaps canonical final regression. An unfulfilled prerequisite cannot mark t6 or story complete.

### 2.7 TASK-a5d5b2bb021655d0-s1-t7 — Complete current-source scoped regression and story validation

After all implementation tasks and native feedback corrections, run one canonical Node22 regression over all installer tests plus installation-home/build/scanner/coordinator consumers using a fixed enumerated selection. Perform independent post-run exact coverage, source/input/output fingerprints and positive command/resource closure audit on the same output without rebuilding. Record per-task checks, native evidence limitations and source identity; submit story BUILD validation only after required tasks pass. No unrelated backend sweep or per-task human approval.

**Acceptance checks:**
- Every required LLD test subject maps to recorded task evidence; canonical current-source selection has no failures/incomplete/unexpected omissions.
- Independent audit proves exact selected coverage, unchanged pinned inputs/outputs, all owned command admission/close/disposal pairs, no remaining actors/leases and strict positive cleanup.
- Old275-test pass and Linux native proof remain historical; source changes after final run invalidate current regression until affected checks and final audit are repeated as justified.
- All required native and regression gates are satisfied before story completion/final human BUILD approval; foundation/S4 and Windows remain separate gated work.

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| qualification-profile-selects-frozen-normal-and-slow-vm-role-budgets | `t1` |
| invalid-profile-fails-before-any-filesystem-or-worker-admission | `t1` |
| profile-snapshot-cannot-change-after-module-import | `t1` |
| copied-policy-asset-has-source-bytes-and-loads-from-installed-control | `t1`, `t5` |
| explicit-short-scope-overrides-remain-exact-under-slow-vm | `t2` |
| omitted-child-profile-is-canonicalized-and-conflicting-profile-rejected | `t2` |
| qualification-profile-reaches-manager-worker-private-npm-and-runtime-helpers | `t2`, `t4`, `t5` |
| slow-vm-runtime-download-verification-and-decoder-drain-have-no-hidden-normal-cap | `t3` |
| profile-never-waives-positive-resource-or-process-closure | `t3`, `t4` |
| normal-runtime-identity-inventory-worker-wire-and-controller-schema-remain-unchanged | `t3`, `t4` |
| child-budget-is-parent-remaining-minus-reserve-after-runtime-setup | `t4` |
| parent-cooperative-reserve-covers-worker-drain-and-final-evidence | `t4` |
| outer-deadline-cancels-independent-in-process-preparation | `t5` |
| ci-and-operator-containment-admit-only-sufficient-native-work-and-cleanup-headroom | `t5` |
| fresh-UTM-macOS-slow-vm-profile-completes-native-foundation-and-confirmed-closure | `t6` |
| current-budget-correction-surrounding-and-final-scoped-regression-have-confirmed-cleanup | `t7` |

## 4. References

- **[[c1]]** `prior-artifact` `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/LLD.md` — "Add an explicit qualification profile for slow USB-backed VMs"
- **[[c2]]** `prior-artifact` `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/LLD.md#4-data-model-changes` — "one deeply frozen process-local QUALIFICATION_TIME_BUDGETS value selected once"
- **[[c3]]** `prior-artifact` `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/LLD.md#3-contract-details` — "Explicit overrides remain last and are never multiplied"
- **[[c4]]** `prior-artifact` `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/LLD.md#4-data-model-changes` — "Runtime acquisition/download/extraction: normal10min,slow-vm40min"
- **[[c5]]** `prior-artifact` `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/LLD.md#3-contract-details` — "After runtime verification, immediately before scope.start, cap the child allowance"
- **[[c6]]** `prior-artifact` `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/LLD.md#4-data-model-changes` — "Refuse before native admission if remaining hosted job allowance cannot contain the selected qualifier and cleanup"
- **[[c7]]** `prior-artifact` `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/LLD.md#7-test-strategy` — "Run surrounding tests only per task; one final scoped regression after all source tasks"
- **[[c8]]** `prior-artifact` `docs/standalone/propagate-longer-time-budgets-through-installer-E20261127a5d5b2bb/S001/LLD.md#8-migration` — "establish the retired attempt's worker closure/reconciliation through existing qualified ownership proof"
