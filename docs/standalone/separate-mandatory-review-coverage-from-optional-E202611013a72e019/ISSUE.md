<!-- insrc:artifact ISSUE-3a72e01900a0ce59 -->

# Separate mandatory review coverage from optional execution

## Reproduction

Live review review-e6ddcdcb-s4-t4-live-20261101 completed with zero HIGH/MED/LOW findings and independently verified all four task tests plus typecheck. It nevertheless returned incomplete because it disclosed that production integration and the broader builder tests/build were not separately rerun. Expected: optional execution disclosures alone do not block; skipped in-scope code/modules, requirements or test-coverage inspection do block. [[c1]] [[c3]]

## Root cause

The task-review policy places every limitation in the same blocking bucket. Shared normalization and validation conservatively make any limitations entry incomplete, while the renderer separately supports nonblocking advice. Optional execution boundaries were emitted as mandatory limitations, so a fully assessed task could not pass. The validator rule is appropriate for mandatory missing evidence; the prompt/field semantics fail to distinguish optional execution from mandatory inspection. [[c1]] [[c2]]

## Fix intent

Require complete inspection of all submitted code/modules, requirements and relevant test coverage. Treat executing integration checks, tests and builds as optional and disclose omissions in the existing nonblocking output section. Make verified testCoverage mean completed evidence-based coverage assessment, not mandatory reviewer execution; demonstrated coverage defects remain findings. Keep mandatory omissions incomplete regardless of reason, preserve HIGH/MED handling and pinned historical results, and add regressions for optional nonexecution, skipped modules and unassessed coverage. No new result fields, compatibility mode, automatic verdict promotion or revived review engine. [[c1]] [[c2]] [[c3]]

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/results.ts`
- **[[c2]]** `code` `src/workflow/code-review/task-review/record.ts`
- **[[c3]]** `stakeholder` `User clarified that all in-scope module/code and test-coverage review is mandatory; only integration/test/build execution is optional.`
