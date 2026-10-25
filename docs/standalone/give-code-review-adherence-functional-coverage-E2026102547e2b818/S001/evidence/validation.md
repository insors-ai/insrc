# Validation for ISSUE-47e2b81827433589

The implementation opts adherence and functional coverage into the existing read-only reviewer-session path. The adapter carries that execution through single, chunk, obligation, relation and reduction calls. Shared divided prompts no longer close the evidence set for these dimensions. Explicit source-proven breaches retain severity; observations and legacy missing confidence map to LOW.

## Checks

- `npm run build`: passed (including local Linux process broker and watchdog bundle). Initial sandbox attempt could not launch `cc`; the normal host build passed.
- `npx tsx --test 'src/workflow/code-review/**/*.test.ts' 'src/workflow/review-pipeline/__tests__/*.test.ts' 'src/daemon/steps/code-review-step/__tests__/*.test.ts'`: 402 tests, 398 passed, 4 live tests skipped, zero failures. Log: `/tmp/issue47-final-affected.log`.
- `npx tsx --test 'src/daemon/tools/builtins/git/__tests__/*.test.ts'`: 57/57 passed. Log: `/tmp/issue47-git-regressions.log`.
- Both t1 and t2 passed the daemon's independent build validation, including its own typecheck and mapped tests. t2 initially lacked the filter matrix in its mapped evidence; added outside-file and unknown-FR findings to the single/divided cases and passed the repeat validation.
- New source-evidence cases use a deterministic provider that actually reads isolated temporary source files. They test pipeline routing and evidence normalization, not LLM semantic accuracy. The live check below uses the real Codex CLI.

## Targeted live re-review of the four false HIGH findings

Command from the repository root:

```sh
node docs/standalone/give-code-review-adherence-functional-coverage-E2026102547e2b818/S001/evidence/review-four-highs.mjs
```

The harness imports the freshly built checkout's production `judgeAdherence` and `CliProvider`, uses `codex:gpt-6.1-sol` with high effort, and runs the actual read-only reviewer session. It selects verbatim the approved error case, two edge cases and state-after clause that caused the four prior HIGH findings. Its navigation summaries deliberately omit implementation details. The original full Story CR is preserved.

Result: **zero findings**, including zero HIGHs. Raw timestamps, selected clauses, prior findings, source hashes and result are in `four-highs-result.json`. This is a targeted four-clause regression re-review, not a claim that the entire 170-file Story now passes every review dimension.

Source-backed dispositions, corroborated by the passing 57-test git suite:

| Prior false HIGH | Existing implementation/evidence |
| --- | --- |
| Delete/force refspec safeguard | `src/daemon/tools/builtins/git/push.ts:40` classifies forced/deleting refspecs; `src/daemon/tools/builtins/git/push.ts:111` refuses protected-ref deletion/overwrite without `forceToMain`. `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts:167` exercises the protected-ref guard. |
| `:dev` destructive approval | `src/daemon/tools/builtins/git/push.ts:43` and the following refspec classification implement destructive approval. `src/daemon/tools/builtins/git/__tests__/git-approval.test.ts:130` pins classification; `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts:136` proves approval refusal prevents execution in auto mode. |
| `+main:main` destructive approval | The leading-plus refspec path in `src/daemon/tools/builtins/git/push.ts:40` applies independently of force flags; classification tests cover leading-plus short/full refspecs, and the protected-ref integration test covers forced overwrite. |
| Whole-Story state-after claimed absent | `src/daemon/tools/builtins/git/schemas.ts:15` and its subsequent schemas/types implement TypeBox/Static result contracts; registrations in `src/daemon/tools/builtins/git/index.ts` expose read tools; shared parsers are in `src/daemon/tools/builtins/git/parsers.ts`; `src/daemon/tools/builtins/git/__tests__/git-coverage.test.ts:33` fixes the inventory at 169 commands and checks ownership; `src/daemon/tools/builtins/git/__tests__/git-tools-integration.test.ts:26` checks each read tool's output against its schema using temporary repositories. |

## Full-sweep limits

The unbounded first full sweep stalled with open handles and was stopped; it produced no completed result. The completed force-exit run was:

```sh
npx tsx --test-force-exit --test 'src/**/__tests__/*.test.ts'
```

It reported **6,937 tests: 6,715 pass, 85 fail, 134 skip, 3 todo**, in 105.6 seconds (`/tmp/issue47-full.log`). One failure was an additional daemon diff-path scripted provider that needed the new session method; it was corrected and passed in the final 402-test affected run. No new full-sweep total is claimed after that fixture correction.

Other failures include missing historical BUILD fixtures, workflow lifecycle/registry fixture behavior, writer inventory drift (`handler-runtime.ts` versus `index.ts`), existing design-session deadline expectations and platform/timing tests. Baseline comparison results are recorded separately; this full sweep is explicitly non-green. No installed daemon was replaced or restarted for this change, and no Darwin runtime validation is claimed.

Baseline comparison: archived pre-change commit `f6b3b573e` into `/tmp/insrc-issue47-baseline`, built it, and ran the same 30 files that failed in the full sweep. In the isolated checkout: 309 tests, 285 pass, 24 fail. With baseline imports and the workspace cwd: 309 tests, 262 pass, 47 fail. These differences demonstrate working-directory/repository-state sensitivity; they do not establish that every full-sweep failure is pre-existing. A same-file current-code rerun is used for the final comparison.

The same-file current-code recheck reported 309 tests, 267 pass and 42 fail (33.4 seconds). The baseline with workspace cwd reported 47 failures; failure identities also differed, including many timing-sensitive TUI outcomes. Eighteen current-only names remained in workflow approval, build-ledger and synthesis fixture tests whose implementation files this issue does not modify. This comparison is **not proof of an entirely clean regression baseline**. The exact name differences are retained in `baseline-comparison.json`; the affected 402-test suite and live four-clause evidence are the positive validation for this fix.
