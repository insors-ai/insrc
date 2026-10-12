# Story s4, Task t9: search for code that opens the live store

Done 2026-10-11 and 2026-10-12, before Task t10 turns on the refusal of the
live store to any process that has not declared itself.

## Method

1. **Entry-point import closure.** For each entry point, every module reached
   through value imports (type-only imports skipped), and which of them import
   the storage layer (`src/db/`) directly.
2. **Test audit.** Every test file (`src/**` and `vscode-plugin/src/**`,
   `*.test.ts` / `*.test.tsx`), run alone with `HOME` pointed at a fresh
   temporary directory. A file that leaves `~/.insrc/graph.lmdb` in that home
   opened the store at its default path, which in a real run is the daemon's
   live store.

## Entry points covered

| Entry point | Reaches the store module | Through |
| :--- | :--- | :--- |
| `src/cli/index.tsx` (`insrc`) | yes | `steering-inject.ts` (repository list) and `review/source-roots.ts` (entities) |
| `src/bin/insrc-mcp.ts` (MCP server) | yes | 48 modules import `src/db` directly (34 under `src/analyze`) |
| `src/bin/insrc-migrate-docs.ts` | no | — |
| `vscode-plugin/src/extension.ts` | no | — |

## Openers found

| Opener | Status |
| :--- | :--- |
| CLI review of an artifact: `resolveSourceRoots` default reader | **Handled** by Task t8: the CLI passes a reader that calls the daemon request `repo.entitiesForSourceRoots`. |
| CLI update, post-build steering refresh: `refreshSteeringAcrossRepos` default `listRepos` | **Handled** here: the CLI passes `listReposFromDaemon` (daemon request `repo.list`); with no daemon running the refresh fails, is logged, and the daemon's boot refresh covers it. |
| MCP server: the analyze step and the in-process daemon builtins (`code_class_locate` / `code_class_references` call `getGraphStore`) | **Raised**: ISSUE-e980ffbb6dd346e7. Covered until Story s11 by the temporary permitted-reader declaration (Task t10); Story s11 moves this work into the daemon and deletes the declaration. |
| 15 test files that set no temporary store path (listed below) | **Handled** here: each sets a temporary path with `setGraphStorePath`; `src/db/graph/__tests__/no-live-store-in-tests.test.ts` runs each in a temporary home and checks that nothing appears at the default path. |

Test files repaired:

- `src/analyze/explore/__tests__/freeform-probe-scope.test.ts`
- `src/analyze/explore/__tests__/phase5-explorations-params.test.ts`
- `src/workflow/review/__tests__/probe-source-roots.test.ts`
- `src/daemon/__tests__/analyze-rpc.test.ts`
- `src/daemon/__tests__/code-review-rpc.test.ts`
- `src/daemon/__tests__/workflow-review-rpc.test.ts`
- `src/mcp/__tests__/analyze-step-handler.test.ts`
- `src/mcp/__tests__/analyze-step-narrow.test.ts`
- `src/mcp/__tests__/analyze-step-scope.test.ts`
- `src/mcp/review-step/__tests__/review-step-routing.test.ts`
- `src/mcp/review-step/__tests__/review-step.test.ts`
- `src/workflow/__tests__/spec-review-approve.test.ts`
- `src/workflow/review/__tests__/review.test.ts`
- `src/workflow/review/__tests__/same-party-refusal.test.ts`
- `src/workflow/review/__tests__/template-review.test.ts`

After the repair, the full test audit finds no file that opens the store at
the default path. The design named two such files. The full audit found
thirteen more: the first audit pass stopped partway, and the review and step
tests reach the store only through default readers.
