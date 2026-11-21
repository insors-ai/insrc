# S5 manual self-review

Reviewed 2026-11-21 by the implementation author (controller). Automated design/code review is retired and unavailable (CLAUDE.md); this is the substitute self-check evidence, with the explicit limitation that author and reviewer are the same party.

**Result: both Tasks (t1, t2) pass the daemon's build-validation gate, and all six externally-reported P2 defects (across two review rounds) have since been fixed and re-validated.** This report does not constitute an independent daemon review.

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

### Externally reported, after pinning `6c654af9e`: three P2s, fixed across five rounds

An external reviewer reported three P2 defects against the pinned self-review packet revision. All three were fixed within this Story, per the Epic's own established direction that a defect belongs in the Story it was found against, not deferred elsewhere:

1. **Ancestor replacement could redirect writes and recursive deletion (`checkpoint.ts:166,225` at the time of the report).** `requireNoSymlinkInPath`'s lstat-based check and the mkdir/open/rename/rmSync that followed it were still separate syscalls re-resolving the same mutable path string, so replacing the review directory (or `.insrc/tmp` itself) in the instant after the check could redirect `writeCheckpoint`'s publish or `finalizeAndCleanup`'s delete outside the repository. Reproduced directly, both ways, against the actual writer.
   - **Round 1 fix** pinned only the leaf directory via an atomic `O_DIRECTORY|O_NOFOLLOW` open immediately before use -- insufficient, since the *subsequent* `publishGuarded`/`rmSync` calls still re-resolved the same mutable path from scratch, discarding the proof the instant it was made. A concurrent regression test (a background process racing to swap the review directory for a symlink while `writeCheckpoint`/`finalizeAndCleanup` ran in a tight loop) caught this reliably.
   - **Round 2 fix** introduced `pinDirectory`'s `/proc/self/fd/<fd>` alias (Linux) so every subsequent operation resolves against the pinned inode directly, never re-looking up the mutable name -- but `rmdir(2)` refuses that alias for removing the directory the fd itself refers to (EPERM), so cleanup's own self-removal step needed reworking into "empty contents through the alias, then remove the now-empty directory by its real name" (safe regardless, since `rmdir` refuses anything that isn't literally an empty directory).
   - **Round 3 fix**, caught by the gate: only the *top-level* directory was pinned; every *nested* subdirectory `emptyDirectoryContents` recursed into was still resolved by re-deriving its path from `readdirSync`'s own listing. Fixed by pinning recursively at every level.
   - **Round 4 fix**, also caught by the gate: only the *leaf* was pinned, not the ancestors above it (e.g. `.insrc/tmp` itself) -- the exact second repro case. Fixed by `pinDirectoryChain`: pin `repoRoot` first, then pin each subsequent path segment built on the *previous* segment's own already-pinned alias, so no ancestor at any level is ever resolved against a mutable name after the first step; closed via 6 consecutive clean runs of the same concurrent regression test (reliable escape before the fix, zero escapes across 6+13 runs after).
   - On any non-Linux platform (no `/proc`), this falls back to the prior best-effort, narrowed-not-eliminated behaviour -- a documented platform limitation of Node's public `fs` module, which exposes no portable `openat`/`mkdirat`/`unlinkat`-family alternative.
2. **Reads could return another review's checkpoint (`checkpoint.ts:187,197` at the time of the report).** `readCheckpoint` followed any symlink at the checkpoint path and never compared the stored record's own `reviewId` against the one requested. Reproduced both ways: a mismatched record, and a well-formed record reached through a symlink. Fixed by adding the same `requireNoSymlinkInPath` check the write/delete paths already use (treated as absent, matching `readCheckpoint`'s own never-throw contract) and an explicit `reviewId` equality check before trusting a parsed record. The symlink-read test was deliberately constructed so the symlinked record's own `reviewId` field matches the *reader's* request (not the real file's own identity), isolating the symlink defense from the separate identity check -- an early draft of this test was flawed (the mismatch check alone already caught it) and was corrected before being trusted.
3. **Cleanup could start before the final output was durably committed (`checkpoint.ts:125,222` at the time of the report).** `publishGuarded`'s rename was atomic but never fsynced, so a crash could lose the write entirely or leave a directory entry pointing at data never flushed to disk. Fixed by fsyncing the file before the rename and the containing directory after it. This fix is verified by code inspection only, per the reviewer's own note -- machine-crash recovery is not practically testable in this suite.

All fixes were verified by reverting each individually and confirming its own regression test (and no unrelated others) then fails.

### Externally reported, after pinning `18b4ea9d1`: three further P2s

A second review round found three more defects, all fixed within this Story:

1. **Checkpoint reads still had a symlink race (`checkpoint.ts:326` at the time of the report).** `readCheckpoint` validated the path via `requireNoSymlinkInPath`, then separately called `readFileSync(path)` -- two syscalls re-resolving the same mutable path, so a substitution between them could still redirect the read even when the substituted record carried the requested identity (a `reviewId` match alone cannot detect a substitution that happens to name the id it was swapped onto). Reproduced directly: a checkpoint initially holding round 1, replaced after the check, handed back round 77. Fixed the same way `writeCheckpoint`/`finalizeAndCleanup` already are: pin the ancestor chain, then open the leaf file itself with `O_NOFOLLOW` and read through that descriptor -- a single atomic check-and-use, never a second, separately resolved lookup (`readThroughPinnedLeaf`). Verified three ways: a deterministic substitution test matching the report's own scenario, a direct unit test of the new primitive (exported test-only as `_readThroughPinnedLeafForTests`, mirroring review-report.ts's `_publishGuardedForTests` convention) against a pre-existing symlink, and folding `readCheckpoint` into the existing concurrent race test.
2. **The non-Linux fallback retained the original vulnerability (`checkpoint.ts:202` at the time of the report).** Without `/proc/self/fd`, `pinDirectory` opened a real descriptor but returned the original *mutable* pathname as `.path` -- every caller believed its operations were bound to a validated identity when they were bound to nothing at all, reproduced directly by exercising that branch. Fixed two ways: `/dev/fd` (present on macOS/BSD as well as Linux) is now tried as a second alias root, so both real-world platforms this daemon targets get full protection; a platform with neither alias root now **throws** rather than silently degrading, since a quiet fallback is strictly worse than an honest refusal. (macOS's own `/dev/fd` branch could not be exercised directly in this Linux session; the fix was verified by code inspection and by confirming `/dev/fd` exists and behaves identically to `/proc/self/fd` for this purpose on Linux.)
3. **Newly created ancestor directories were not durably linked (`checkpoint.ts:345` at the time of the report).** `publishGuarded`'s fsync covered the output file and its immediate containing directory, but `mkdirSync`'s `recursive: true` can silently create new ancestor directories first (e.g. `.insrc/artifacts`, the first time a review ever finalizes) -- each one is new metadata in *its own* parent that still needed its own fsync. Fixed by fsyncing every directory in the pinned chain, not just the leaf, after every publish (`fsyncDirectoryChain`). Verified by code inspection only, per the reviewer's own evidentiary standard for this class of fix -- machine-crash recovery is not practically testable in this suite.

All three were verified the same way as the first round: reverting each fix individually and confirming its own regression test (and no unrelated others) then fails.

## Source review

| Area inspected | Invariant and assessment |
| --- | --- |
| `checkpoint.ts` | `ReviewCheckpoint{reviewId, lastCompletedUnit}` is exactly sc5's interfaceSketch. All three functions validate `reviewId` first (before any filesystem/IPC access, proven by a dedicated test), then resolve the repo via the canonical chain. `writeCheckpoint` publishes through `publishGuarded` (temp-file + atomic rename), never a direct `writeFileSync`. `readCheckpoint` treats a missing file, invalid JSON, and a malformed shape identically (`undefined`), never throwing. `finalizeAndCleanup` writes the durable copy before the recursive delete, propagates a copy failure without deleting, and is idempotent (a second call after cleanup re-runs the copy and finds nothing left to delete). Every write and the delete are preceded by the lstat-based symlink walk. |
| `__type-tests__/checkpoint.typecheck.ts` | Exact-keys, exact-parameter-tuple, and exact-return-type proofs for `ReviewCheckpoint` and all three functions, plus per-field required/readonly/no-extra-field and union-narrowing `@ts-expect-error` cases -- the same pattern `review-report.typecheck.ts` established. |
| `__tests__/checkpoint.test.ts` | All 14 LLD-named subjects exist as individual `it()` cases with titles matching the LLD verbatim, plus 5 regression tests added for the externally-reported P2s across both rounds (19 total); `ac1`-`ac4`'s `provingTests` pass. |

## Verification

- `npx tsc --noEmit`: clean, 0 errors.
- `npx tsx --test src/workflow/review-round/__tests__/checkpoint.test.ts`: **19 passed, 0 failed** (14 LLD-named + 5 externally-reported-P2 regression tests).
- `npx tsx --test 'src/workflow/review-round/**/*.test.ts'` (broader sweep): **73 passed, 0 failed.**
- `insrc_build_step` (phase=validate): t1 and t2 both passed cleanly on final resubmission after all fixes — final verdict `passed: true` for both Tasks, with `typecheckClean: true` and `testsPassed: true`.

## Limits and continuation

This is a manual self-review substituting for the retired automated design/code review; author and reviewer are the same party. No independent party inspected this diff ahead of time, though six P2 defects were caught by an external reviewer across two review rounds after this packet first pinned `6c654af9e` -- all six fixed within this Story, all recorded here, not omitted. The build-validation gate's own rejections, plus these external catches, are the closest available substitute for adversarial review in this session.

An integration gap is recorded as an explicit, non-blocking open item (per the LLD's own resolved question): wiring `writeCheckpoint`/`readCheckpoint`/`finalizeAndCleanup` into s1's own round-driver cycle is s1's adjacent-boundary responsibility, not built here.

s5 is Phase B's checkpoint-lifecycle Story, and the last Story this Epic's HLD defines. Once s5's BUILD is approved, the Epic itself can complete.
