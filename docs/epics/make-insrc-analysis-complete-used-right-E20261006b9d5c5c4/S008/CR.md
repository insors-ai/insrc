<!-- insrc:artifact CR-b9d5c5c40df5a574-s8 -->

# Code review: b9d5c5c40df5a574:s8

⚠️ **WARN** — HIGH 0 · MED 0 · LOW 12 · model `claude:opus`

**Changed files:** 11

## adherence — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/runtimes/shared/source-modules.ts:176 | moduleOfEntityId takes a third parameter, `taskId` (the test pins `moduleOfEntityId.length === 3`, and the runtime calls it with `args.task.taskId`). The approved signature has two parameters: the value and the lookup callback. The extra parameter carries the task id needed to keep the wrong-kind message word for word as before, and the function still takes no scope and no entity list, so behaviour matches the design; only the declared contract shape differs from the LLD. |

## conventions — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/runtimes/code/__tests__/module-directories.test.ts:80 | The test-local interface `ModuleRecord` declares `entityId?: string` without `\| undefined`. The later `Surface` interface in the same file does the same with `module.entityId?: string` and `exports[].body?: string`. The production counterparts in this Story (`ModuleRecord.entityId?: string \| undefined`, `SourceModule.entity?: Entity \| undefined`) follow the rule, so the test declarations are the ones that drift. |
| LOW | src/analyze/runtimes/__tests__/completeness-all-runtimes.test.ts:230 | The inline cast type `{ module: { directory: string; entityId?: string }; ... }` declares an optional property without the explicit `\| undefined`. |
| LOW | src/analyze/runtimes/shared/__tests__/source-modules.test.ts:23 | The fixture builds entity ids by hand as `sha256(kind\0rel\0name).slice(0, 32)`, leaving out the repo, rather than through `makeEntityId(repo, file, kind, name)`. The sibling new test, module-directories.test.ts, uses `makeEntityId`. The ids are hex-32 and deterministic, but they do not follow the documented recipe. This is a fixture only, so it is reported as an observation. |
| LOW | src/analyze/runtimes/code/structure-module-tree.ts:66 | The exported `MODULE_TREE_RULE` constant is declared between `const TEMPLATE_ID` and `const log = getLogger(...)`. In the sibling runtimes of this module (discovery-modules.ts, surface-functional.ts) those two lines are adjacent and other module constants follow them; surface-functional.ts places `SURFACE_RULE` after `log` and `SURFACE_KINDS`. The idiom is sampled from three files only. |
| LOW | src/analyze/runtimes/code/__tests__/module-directories.test.ts:33 | The import block imports twice from the same modules: `import type { PlannedTask, TemplateExecuteArgs, ... }` and a separate `import type { PlanTask }`, both from '../../../executor/types.js', and a type import plus a later value import from '../../../completeness.js'. Type and value imports are also interleaved rather than grouped by module as in the touched runtime files. The idiom is sampled from few files. |

## coverage — 1 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/runtimes/code/__tests__/module-directories.test.ts:1 | No coverage gap found; pass-state is present but not independently re-run by this review. The empty testsReaching edges on all 11 changed files are a grounding artefact (the diff entries are file-level and two test files are new), not a real not-exercised gap: the changed test files import and execute sourceModulesOf, moduleOfDirectory, moduleOfEntityId and the three changed runtimes directly. All 22 promised unit/integration tests exist by name in the changed test files, and the Story's recorded run (S008/measurements/after/analyze.txt and deterministic-runtimes.gated.txt, taken at ba4b5014, with no src change since) lists each as `ok` — 1099 tests, 1004 pass, 0 fail; the gated file 11 of 11 with INSRC_LIVE_TESTS=1. The three non-code promises are backed by records in the Story folder: S008/baseline/ (baseline), measurements/baseline-comparison-t5.md (no baseline-passing test fails), and measurements/live-run-t5.md (12 tasks, 0 failed, 37 modules, every functional-surface task succeeded). My own attempt to re-run the four ungated files was not permitted in this session, so the green rests on those recorded outputs. |

## quality — 5 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| LOW | src/analyze/runtimes/shared/source-modules.ts:236 | Correctness: absoluteDirectory strips leading './' and trailing '/' but does not normalise '..' or inner '.' segments, and moduleOfDirectory then tests containment by string prefix. A value such as 'src/pay/../ship' or 'src/./pay' names a real source directory, passes the repo and area checks textually, and is then refused with 'no stored source file lies under it'. Under a module scope, a path that climbs out of the area gets that same reason instead of the 'outside the area' refusal. Nothing outside the area is ever returned, so the effect is a wrong refusal or a wrong reason, not a leak. Normalising the path before the three tests would close it. |
| LOW | src/analyze/runtimes/shared/source-modules.ts:122 | Correctness: rule (b) explicitly excludes stored module entities with an empty file ('an imported module owns no directory of this repo'), but rule (a) has no such guard. If an imported-module entity with file '' ever reaches `entities`, it becomes a module with directory ''. In structure-module-tree that yields the prefix '/', which matches every absolute path, so every otherwise unowned file would be attributed to that import. Today this relies only on inAreaOf filtering such entities out upstream; the same `e.file.length > 0` guard in rule (a) would make it local. |
| LOW | src/analyze/runtimes/code/discovery-modules.ts:78 | Correctness: fileCount is documented as 'source files directly in the directory' but is counted from the area-narrowed entities, so the same stored module reports a different count per scope. The Story's own test shows pay-pkg with fileCount 2 under a repo scope and 0 under a file scope on its package.json. A reader of the module list can take 0 to mean an empty module. Either count from the whole read for a stored module entity or document the field as 'within the area'. |
| LOW | src/analyze/runtimes/code/surface-functional.ts:111 | Duplication: the id branch tests membership with `modulePrefixOf(byId.path)` plus `startsWith(prefix)`, while the directory branch uses `liesUnder(named.directory, e.file)`. `byId.directory` is already computed by moduleOfEntityId, and directoryOf in shared/source-modules.ts re-derives the directory of a file that modulePrefixOf already derives. There are now two parallel 'directory of a file / lies under it' idioms in one routine; both branches could share `liesUnder(named.directory, e.file)` and differ only in which entity list they read. |
| LOW | src/analyze/runtimes/__tests__/scope-sources.test.ts:118 | Taste / test fragility: readFormProblem pins exact source text (variable names, column-aligned whitespace, and exactly three occurrences of the word `repoEntities`, comments included). A comment that mentions repoEntities or a harmless rename in a runtime fails the suite with a message about the read being 'used for something else'. The `ALL.length === 25` assertion in completeness-all-runtimes.test.ts:237 is the same kind of pin. Neither is a production risk. |

