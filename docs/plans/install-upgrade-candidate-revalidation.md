# Candidate list revalidation

Revalidated on 2026-11-22, branch `installer`, HEAD `69b8145359d4f201d9e80da1baa4e9fed9067271`. Criterion remains the user's exclusive-functionality rule: dedicated daemon install/upgrade/start/stop/restart code and tests are candidates even when live. **No implementation or existing test file was changed or deleted.**

The revalidation found scope mistakes and omissions and corrected both lists.

| List | Before | After |
|---|---:|---:|
| Whole-file candidates | 280 | **278** |
| Member/test candidate entries | 171 | **176** |
| Files containing member entries | 69 | **70** |
| Test/fixture entries within the member list | 54 | **54** |

Current lists: [whole-file scope](install-upgrade-scope-candidates.md), [member-level scope](install-upgrade-member-candidates.md). Their JSON files are the corresponding machine-readable sources. Member entries identify declarations, grouped fields, branches or assertion slices; they are not counts of distinct methods.

## Corrections to whole-file candidates

Five files were removed from whole-file deletion scope:

| File | Corrected boundary |
|---|---|
| `src/shared/daemon-process.ts` | Generic process identity supports retained guard acquisition/conflict/reclamation through `daemon-run-files.ts`, which protects keystore writes. Preserve the shared identity dependency closure. |
| `src/shared/__tests__/daemon-process.test.ts` | Preserve identity/parser/reincarnation coverage for that shared behavior. |
| `src/daemon/__tests__/boot-cold-import.test.ts` | Primarily model catalog validation, import side effects and alternate catalog/default behavior. Preserve assertions; the old child launch/stop fixture slice is listed separately. |
| `src/daemon/__tests__/config-boot-reconcile.test.ts` | Configuration/default evolution, reconciliation and module boundaries remain useful. A boot-related name does not make the suite exclusively process lifecycle. |
| `src/daemon/__tests__/shutdown-store-failure.test.ts` | Mixed suite: keep general `storeFailure` status coverage. List lifecycle mechanism assertions separately while preserving bounded shutdown, resource drain ordering and store-health guarantees. |

Three additional files were promoted from individual test-method entries into whole-file test scope after inspecting all their test methods:

- `src/config/__tests__/installer-defs.test.ts`
- `src/daemon/__tests__/daemon-status-field.test.ts`
- `jetbrains-plugin/src/test/kotlin/ai/insors/insrc/jetbrains/daemon/Sc4GatewayBindingsTest.kt`

These cover installer behavior or update/freshness contracts. The file classification now contains **449 entries**: the original 446-file catalog plus these three discoveries. Whole-file candidates comprise **143 implementation/script/asset/CI files, 115 dedicated tests and 20 dedicated helpers**.

## Corrections to member candidates

- Removed **12 duplicated test-method entries** after promoting their containing files into the whole-file set.
- Added `RunFileGuardPin`, `readRunFileGuardPin` and `sameOwner`: their remaining uses are the old lifecycle transfer/pinning branch. Preserve shared identity, `runFileIdentity`, `sameRunFile`, acquisition, conflict and reclaim behavior.
- Added five lifecycle assertion slices from the mixed shutdown/store-failure suite and the launch/stop fixture slice from the preserved model catalog boot suite.
- Added the omitted VS Code onboarding installation step, controller dependency and six corresponding test/fixture slices. Preserve workspace registration, AI host wiring, generic sequencing/failure isolation, per-action consent and retryable onboarding state.
- Explicitly tagged mixed blocks and tests as requiring extraction. Source anchors and AST boundaries are navigation aids; an enclosing mixed function or test is not a whole-range deletion candidate.

The net change is **12 entries removed and 17 added**. There is no whole-file/member overlap.

## Revalidation performed

1. Checked every listed path, classification count, member identifier/selector, line anchor and available end boundary; checked cross-list overlap and Markdown links.
2. Recorded SHA-256 fingerprints for every whole-file candidate and every member-entry source. These make later source drift detectable; they do not certify semantic deletion safety.
3. Inspected source and test bodies at the corrected boundaries, using TypeScript AST test/declaration locations and actual Kotlin test method names. Checked remaining guard helper uses against acquisition/conflict/reclamation behavior.
4. Completed a fresh `insrc_analyze_step` session with **six deterministic probes**: import graphs for `daemon-process.ts` and `daemon-run-files.ts`; profiles for both boot suites and shutdown/store-failure tests; and the diagnostic `readVersion` caller. [Analyzer evidence](install-upgrade-revalidation-analysis-evidence.json).
5. Scanned relative imports and dynamic import literals from retained production JS/TS in `src`, `scripts` and `vscode-plugin`, resolving `.js` imports to source `.ts`/`.tsx`. Found **37 retained-to-candidate import boundaries across 13 consumer files**. These exposed the missing onboarding slice. The boundaries are saved in the [revalidation record](install-upgrade-candidate-revalidation.json).

The import boundaries also identify obligations rather than deletions: the debug status card imports `DAEMON_ROOT` from the candidate maintenance module; preserve a replacement installation-root resolver so version display survives. CLI service construction exposes `isRunning` from the candidate lifecycle helper; preserve equivalent status behavior. Keep generic reachability, status, backup/compact and host/MCP contracts while replacing lifecycle imports.

## Limits and result

The analyzer reports incomplete graph coverage: eight relationships reference ignored files, and some call examples are inferred or ambiguous. Filesystem profiles establish that files exist; they do not prove assertion scope. Current source/AST inspection supplies the classification corrections. The relative-import audit does not cover computed paths, shell dispatch, Kotlin resolution or every external installation recipe; earlier client/packaging source checks remain supporting evidence.

This was **static revalidation**, not an executable proof that removing the current engine leaves a working replacement. No builds, tests, daemon operations, commits, merges or pushes ran. The original catalog and older analyzer evidence remain historical snapshots; use the corrected lists linked above for current scope.

## Repeat validation after reported corpus change

The repeat check keeps **278 whole-file candidates** and **176 member/test entries across 70 other files**. Every stored candidate/member source hash still matches, all paths/anchors exist, and the lists remain disjoint. Current retained-production relative import scans still find the same **37 boundaries across 13 files**, with no additions or removals.

Six fresh `insrc_analyze_step` probes checked process identity, shared guards, owned runtime, CLI lifecycle, guard transfer and guard borrowing. They support the existing classifications; no new correction was warranted. [Repeat analyzer evidence](install-upgrade-corpus-revalidation-evidence.json).

**Changed-corpus freshness is unconfirmed:** the daemon still reports `repoLastIndexedAt=1795339735794` (**2026-11-22 09:28:55.794 UTC**), identical to prior evidence. It also reports the same eight ignored-file relationships. The current checkout was revalidated, but the available evidence does not establish that the user-referenced corpus change is reflected in the served index. No reindex, daemon action, implementation edit or deletion was performed.
