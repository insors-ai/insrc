# Batch 03 — live-store search exclusion

Scope: approved `ISSUE-9c2482c594fd8df5`, `LLD-9c2482c594fd8df5-s1` and `PLAN-9c2482c594fd8df5-s1`. Implementation commits `bbe489829` and `d955c581b`; t1 passed daemon validation after correction. t2 also passed daemon validation. Human BUILD approval on 2026-11-20 completed the story and epic; GitHub tracker attachment remains unbound.

## Result and compatibility

Shared `runGrepSearch` refuses protected direct roots first, then independently resolves the configured data and lock paths and compares component-wise containment before backend admission. A directory containing either protected target uses Node before any ripgrep spawn. Its existing per-file store predicate prevents content reads. That predicate now independently resolves the configured lock path too; the initial implementation incorrectly derived it from the resolved data target, and build validation caught this. The corrected fixture relocates both configured files to separate directories simultaneously and checks direct targets, aliases and both containing roots.

Other roots retain ripgrep with `--no-config` and `--no-follow`, so ambient config cannot expand traversal through nested symbolic links. Same-name allowed files and canonical-prefix sibling directories remain searchable. Store-ancestor searches deliberately use the documented Node ignore/size semantics; `usedRipgrep` and `excludedByRule` report the actual selection. Public options, result/IPC shapes and persistent entities are unchanged. This is pre-read admission, not post-filtering of protected content.

Many tool/analyzer callers use one shared grep entry and one selected backend per search. Search retains ownership of any ripgrep child; the store module owns protected path identity. The conditional order is refusal → canonical ancestry → backend selection → guarded reads → result. No new entity relationships or UI flow exists, and this prose documents the interaction fully; no generated visual is required. No visual rendering was claimed.

## Observed validation

All runs used Node v22.23.2 and the supported coordinator with serial file admission and a fresh full build. Results retain runtime, build fingerprints, exact per-file counts, TAP hashes and confirmed closure.

| Run | Pass | Fail | Cancel / skip | Meaning |
| --- | ---: | ---: | --- | --- |
| Baseline `0e08a40d-5df6-4a56-94e5-99fa223b5b73` | 15 | 2 | 0 / 0 | Original store-content leak and separate 300ms fake-rg startup deadline failure. |
| Final `c264fefe-d90f-4144-bf50-3960ecba16cc` | 29 | 1 | 0 / 0 | All search safety, compatibility, compiled guard, grep core/omission, analyzer parameter and cross-process store checks pass. One stale tool fixture call remains. |

[Baseline evidence](live-store-search-evidence-2026-11-20/baseline-results.json) and [final evidence](live-store-search-evidence-2026-11-20/final-results.json) link retained TAP files. Final coverage is complete and cleanup confirms all owned actors closed. The final 30-test run is not reported green.

### Acceptance evidence

- ac1: protected configured paths, actual targets and symbolic-link aliases refuse in bounded/complete modes before sentinel backend startup or protected `fs.readFile` calls.
- ac2: directory/ancestor aliases and independently relocated data/lock containing roots select Node before rg startup; read instrumentation records zero protected reads.
- ac3: real ripgrep and forced Node return allowed matches, including store-named lookalikes and prefix siblings, while ignoring nested store aliases; backend and omission descriptions stay truthful. Bounded length/hit limits remain enforced; complete mode retains full lines and all matches.
- ac4: a deterministic nonzero-exit backend emits an allowed hit before failing; complete mode throws `GrepIncompleteError` with that hit. Default mode records the backend failure and falls back truthfully. Existing deadline controls remain unchanged and passed in the final run.
- The compiled guard test imports fresh `out/` code in an isolated HOME through a retained managed child, verifies both modes and direct lock refusal, then confirms child completion before removing its fixture.
- Root typechecks passed in t1 validation; t2 submits a fresh typecheck and mapped controls. No broad suite or release qualification was run.

### Remaining failures and limits

The original file-tool fixture now gets past its repaired directory leak to `executeTool` at `src/daemon/tools/builtins/file/__tests__/live-store-file-refusal.test.ts:117`. It intentionally casts away the current signature and omits required dependencies, causing `Cannot read properties of undefined (reading 'connectionExecution')`. This is retained for Batch 11 fixture-contract remediation; production authority checks were not weakened to make it pass.

The unchanged fake-rg complete-mode test failed in the baseline because its 300ms deadline fired before any hit was gathered; it passed in the final run. The earlier observation is retained. No larger deadline, skip or output-forcing change was made.

The current policy compares resolved paths; concurrent hostile path replacement and hard-link/inode aliases are outside this defect scope. No race-free filesystem access guarantee is claimed. No actual user store was used in safety fixtures, and native lifecycle/qualification work remains with its own batches. No evidence digest was refreshed.
