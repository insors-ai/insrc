<!-- insrc:artifact CR-b7a68147dcf72034-s8 -->

# Code review: s8

Status: **passed** · task-based schema version 2

## review-b7a68147dcf72034-s8-t1-live-20261102 — attempt 1

Scope: task t1 · reviewer: daemon · 2026-11-02T12:42:18.515Z

1 selected task assessment(s): passed.

### Submitted scope

- `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:src/daemon/tools/builtins/git/op-table.ts` — [{"after":[1,323]}]
- `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:src/daemon/tools/builtins/git/__tests__/op-table.test.ts` — [{"after":[1,162]}]

### t1: passed

Verified the final committed `op-table.ts` (323 lines) and `op-table.test.ts` (162 lines) exactly match the pinned commit (byte-for-byte diff against 073a0e50e9's task-1 parent is empty for both files), and the current working-tree checkout is identical to the pinned commit for these two files. Independently ran the test file against this exact source: all 6 cases pass, and `tsc --noEmit` is clean project-wide. Cross-checked every dependency the module imports (`gh/op-table.ts`'s `field`/`fieldSchema`/`refuseInput`/`OpDef`/`FieldSpec`, `shell-helper.ts`'s `runShellBytes`, `types.ts`'s `ApprovalClass`/`ToolApprovalGate`/`ToolDeps`/`ToolResult`, `call-tool.ts`'s `TypedTool`, `provenance.ts`'s `markDefinition`/`isDefinitionOf`, `git/helpers.ts`'s failure helpers, `git/stash.ts`'s `gitStashTool`, and the test fixtures `_repo.ts`/`_standin.ts`/`_proc.ts`) and found every signature used matches what is actually exported. Confirmed the gh family files are byte-identical between the parent and this commit (acceptance check 6). All six Plan acceptance checks for s8/t1 map 1:1 onto the six test cases and each is genuinely exercised; the LLD's `buildGitFamilyTool`/`extendGitTool` signatures, postconditions and error conditions match the implementation exactly. The `executeTool` flow (schema check → approval → execute) confirms the LLD's ordering guarantee ("field the op does not take" / "pattern" refused before any approval request) holds for every path the tests actually exercise, and the field-pattern case specifically is enforced at the JSON-schema layer (pre-approval) per the gh module's own documented contract that op-table.ts imports unchanged. No HIGH/MED defects found in the reviewed code or its tests.

Coverage: **verified** — I read every line of both selected files against the pinned commit (confirmed byte-identical to the current checkout and to the task-1 parent), traced each of the six Plan acceptance checks to its corresponding test case in op-table.test.ts and confirmed each genuinely exercises the described behavior (schema-enum/union shape, build-time throws for duplicate/no-class/missing-stdin-field/disagreeing-fields, pre-approval field/pattern refusal, cut-output rejection + schema-mismatch with original text kept, stdin delivery failure, and extendGitTool's input/class preservation plus its own collision throws). I independently executed the test file against the exact pinned source (all 6 pass) rather than relying on the builder's reported run, and typechecked the whole project cleanly. I also identified two generic-engine branches (function-valued `cls` inside `buildGitFamilyTool`'s own approval, and the spawn-error/timeout paths of `runIn`) that are not exercised by any test in this file, reported as LOW findings; I verified their correctness by code inspection rather than execution, so they are a coverage gap rather than a demonstrated defect.

- **LOW** `src/daemon/tools/builtins/git/op-table.ts:97-100`: The function-valued `cls` branch of `classOf` (used by `buildGitFamilyTool`'s own `approval`) is never exercised by any op built with `buildGitFamilyTool` in op-table.test.ts — all three fixture ops (read/wipe/feed) use a static `cls`. The only function-approval case tested (`extendGitTool keeps existing inputs and classes...`) exercises the *base* tool's (`gitStashTool`) own approval function via pass-through, not `classOf` itself.
  GitOpSpec explicitly types `cls` as `ApprovalClass | ((input: ToolInput) => ApprovalClass)` and the LLD's data-model notes a class that depends on input is a function and must be tested for both branches (for the real ops that will use this, in later tasks) — within t1 itself this engine branch has no direct unit case. I verified by reading that the one-line ternary is correct, so this is a coverage gap, not a demonstrated defect.
  Evidence: `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:src/daemon/tools/builtins/git/op-table.ts`, `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:src/daemon/tools/builtins/git/__tests__/op-table.test.ts`
- **LOW** `src/daemon/tools/builtins/git/op-table.ts:199-205`: The `spawnError` (missing-tool) and `timedOut` (+ the mutating-only unknown-outcome suffix) paths of `runIn` have no direct test in op-table.test.ts; none of the six tests simulate a missing git binary or a timeout.
  The LLD's postcondition for `buildGitFamilyTool` explicitly states "a command that did not start is missing-tool, one that was killed is timed-out and carries the unknown-outcome text when the op changes something," but none of the Plan's six acceptance checks for t1 require this scenario and none of the six tests cover it. I traced the logic by hand (the `fail` closure's conditional `original`/`message` parameters into `withFailure`) and it is correct, but it is unexercised at this layer.
  Evidence: `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:src/daemon/tools/builtins/git/op-table.ts`, `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:.insrc/artifacts/LLD-b7a68147dcf72034-s8.json`

Optional verification and advice (nonblocking):

- Optional execution: I ran `node --import tsx --test --test-force-exit src/daemon/tools/builtins/git/__tests__/op-table.test.ts` myself against the exact pinned source (current checkout matched the pinned commit byte-for-byte for both files) — all 6 cases passed, corroborating the builder-reported run independently rather than relying on it.
- Optional execution: I also ran a full project `tsc --noEmit`, which was clean (no errors in op-table.ts or its test, and no project-wide errors at all).
- Consider adding a unit case for a function-valued `cls` built through `buildGitFamilyTool` itself (not just via `extendGitTool`'s base pass-through) and a stand-in-git timeout/spawn-missing case, when a later task first defines a real op that needs either — this is a non-blocking suggestion, not a defect in t1.

Inspected references:

- `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:src/daemon/tools/builtins/git/op-table.ts`
- `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:src/daemon/tools/builtins/git/__tests__/op-table.test.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/builtins/gh/op-table.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/builtins/git/helpers.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/shell-helper.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/types.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/call-tool.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/provenance.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/executor.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/builtins/git/stash.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/builtins/git/safe-args.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/builtins/git/__tests__/_standin.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/builtins/git/__tests__/_repo.ts`
- `073a0e50e93a171641f2ec365b2fd7257a9fe01d:src/daemon/tools/__tests__/_proc.ts`
- `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:.insrc/artifacts/DEF-b7a68147dcf72034.json`
- `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:.insrc/artifacts/LLD-b7a68147dcf72034-s8.json`
- `0cd27ed33d8d9526d891ff65ca711c8f3172ea4b:.insrc/artifacts/PLAN-b7a68147dcf72034-s8.json`

Test: `node --import tsx --test --test-force-exit src/daemon/tools/builtins/git/__tests__/op-table.test.ts` — pass
Reviewer-executed (not builder-reported): all 6 pass, 0 fail, duration ~467ms. Current checkout verified byte-identical to pinned commit 0cd27ed3 for both files via `git diff` before running.
