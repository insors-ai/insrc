# S5 manual self-review

Reviewed 2026-11-21 by the implementation author (controller). Automated design/code review is retired and unavailable (CLAUDE.md); this is the substitute self-check evidence, with the explicit limitation that author and reviewer are the same party.

**Result: both Tasks (t1, t2) pass the daemon's build-validation gate.** This report does not constitute an independent daemon review.

## Scope

s5 adds the review checkpoint record (HLD sc5, owned by this Story): a new `src/workflow/review-round/checkpoint.ts` exporting `ReviewCheckpoint` and three functions -- `writeCheckpoint`, `readCheckpoint`, `finalizeAndCleanup` -- implementing the generic JSON side-record and `.insrc/tmp/<reviewId>/` folder lifecycle (per-review-type granularity, durable copy before deletion, reviewId as one identity) per k1/k7/k8/lc4. New code only; no existing file in `review-round/` was modified.

| File | Purpose |
| --- | --- |
| `src/workflow/review-round/checkpoint.ts` | `ReviewCheckpoint`, `writeCheckpoint`, `readCheckpoint`, `finalizeAndCleanup`, `_setCheckpointDepsForTests` |
| `src/workflow/review-round/__type-tests__/checkpoint.typecheck.ts` | Compile-time exact-keys and exact-parameter/return-shape proofs |
| `src/workflow/review-round/__tests__/checkpoint.test.ts` | The full named test suite, one `it()` per `testStrategy.testLevels[0].subjects` (14 total) |

## Design decisions reused, not reinvented

This Story deliberately reuses review-report.ts's and reconciliation.ts's established conventions verbatim rather than inventing new ones: the literal-identifier `reviewId` regex, canonical repo resolution via `resolveRepoPath` (never the daemon process's own cwd), the lstat-based `requireNoSymlinkInPath` walk (checked before every write and the recursive delete, re-checked immediately before publication), and the guarded temp-file+rename `publishGuarded` primitive s4's own externally-reported P2 fix established -- so a crash mid-write can only ever leave the complete prior checkpoint or the complete new one, never a partial file.

The durable artifact storage location (`'the review's durable artifact storage location'` in the HLD's own prose, left unpinned) was chosen as `.insrc/artifacts/REVIEW-<reviewId>.json`, matching this directory's existing role as the governance artifact store.

A design-level finding from the LLD phase: the HLD's sc5 interfaceSketch references "ReviewContext's header-level field" as though a `ReviewContext` type exists; it does not, anywhere in the codebase (confirmed directly via `insrc_analyze_step` and direct reads). This was resolved without an HLD amendment: k8's actual intent (a resume recovers the id from the artifact/context itself) is satisfied by `ReviewCheckpoint`'s own `reviewId` field, proven directly by the "readCheckpoint's own reviewId field..." named test.

## Gate rounds and fixes

The build-validation gate rejected t2 three times before passing, each catching a genuine gap:

1. **Round 1** — the symlink-write test only exercised a symlinked *directory*, never a symlinked `checkpoint.json` *file*, though the subject's own wording named both. Fixed by extending the same test with a second scenario (a real directory whose `checkpoint.json` leaf is itself a symlink to an external file), asserting the external file survives untouched.
2. **Round 2** — the ordering test ("`finalizeAndCleanup` copies ... before deleting ... in that order") only checked both end states independently after the call returned, which would also pass under a reversed (delete-then-copy) implementation. Fixed by having the injected `writeDurableCopy` spy observe that the temp folder still exists at the instant it runs, then perform the real write itself -- verified by temporarily reversing the real implementation's order and confirming this test (and the separate write-failure test) both then fail, before restoring and reconfirming green.
3. **Round 2, same submission** — the resubmitted commit also amended the already-approved PLAN artifact (removing an acceptance check the gate could never itself verify: a "broader sweep passes" line, since the gate only ever runs a Task's own named test file) bundled into the same commit as the test fix. The gate correctly flagged this as scope creep -- a build Task's own commit must stay within its own scope. Fixed by splitting into two commits: the test fix (attributed to t2) and a separate `docs(plan):` correction to the PLAN (not attributed to either Task), mirroring the convention this Epic already established for post-approval artifact corrections (Story s4).

All three were genuine catches, not false positives — each is a real test-coverage or process-scope gap this self-review would not have caught without the gate.

## Source review

| Area inspected | Invariant and assessment |
| --- | --- |
| `checkpoint.ts` | `ReviewCheckpoint{reviewId, lastCompletedUnit}` is exactly sc5's interfaceSketch. All three functions validate `reviewId` first (before any filesystem/IPC access, proven by a dedicated test), then resolve the repo via the canonical chain. `writeCheckpoint` publishes through `publishGuarded` (temp-file + atomic rename), never a direct `writeFileSync`. `readCheckpoint` treats a missing file, invalid JSON, and a malformed shape identically (`undefined`), never throwing. `finalizeAndCleanup` writes the durable copy before the recursive delete, propagates a copy failure without deleting, and is idempotent (a second call after cleanup re-runs the copy and finds nothing left to delete). Every write and the delete are preceded by the lstat-based symlink walk. |
| `__type-tests__/checkpoint.typecheck.ts` | Exact-keys, exact-parameter-tuple, and exact-return-type proofs for `ReviewCheckpoint` and all three functions, plus per-field required/readonly/no-extra-field and union-narrowing `@ts-expect-error` cases -- the same pattern `review-report.typecheck.ts` established. |
| `__tests__/checkpoint.test.ts` | All 14 named subjects exist as individual `it()` cases with titles matching the LLD verbatim; `ac1`-`ac4`'s `provingTests` pass, including the gate-caught symlink-file and ordering-causality fixes. |

## Verification

- `npx tsc --noEmit`: clean, 0 errors.
- `npx tsx --test src/workflow/review-round/__tests__/checkpoint.test.ts`: **14 passed, 0 failed.**
- `npx tsx --test 'src/workflow/review-round/**/*.test.ts'` (broader sweep): **68 passed, 0 failed.**
- `insrc_build_step` (phase=validate): t1 passed on its first round; t2 passed on its third round after two real test-coverage fixes and one process-scope correction — final verdict `passed: true` for both Tasks, with `typecheckClean: true` and `testsPassed: true`.

## Limits and continuation

This is a manual self-review substituting for the retired automated design/code review; author and reviewer are the same party. No independent party inspected this diff ahead of time. The build-validation gate's own three rejections (two real content gaps, one process-scope correction) are the closest available substitute for adversarial review in this session.

An integration gap is recorded as an explicit, non-blocking open item (per the LLD's own resolved question): wiring `writeCheckpoint`/`readCheckpoint`/`finalizeAndCleanup` into s1's own round-driver cycle is s1's adjacent-boundary responsibility, not built here.

s5 is Phase B's checkpoint-lifecycle Story, and the last Story this Epic's HLD defines. Once s5's BUILD is approved, the Epic itself can complete.
