<!-- insrc:artifact BUILD-01ac1e4b6a6c9c2f-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-15T05:06:15.905Z  ·  **Updated:** 2026-11-15T05:30:51.036Z

**Commit:** f96f6881b

## Summary

t1 round 5. All 8 acceptance checks satisfied by the judge in the last two rounds; tests 14/14 pass and typecheck clean. Scope: this Story's own units since build base 60570d87 are 11234b6ee, 296a2fe35, 9f6753341 (code, Insrc-Story: 01ac1e4b6a6c9c2f/s1) plus f96f6881b (its own ledger docs, same trailer) — nothing else of ours is uncommitted or untracked. The remaining dirty paths are other Stories' committed work on the shared v2 branch (234b9967/s1's installation-mutation-gate.ts+test in base..HEAD) and pre-existing ledger files (.insrc/artifacts, two foreign CR.md) — none belongs to this Task's surface. updateScratch: resolveInside id validation, exclusive no-follow temp create (occupier untouched), backup hard link before unlink, per-attempt lstat+O_NOFOLLOW-open+fstat inode re-validation, unlink+link+unlink publish (never rename), bounded EEXIST retry, restore-from-backup on publish failure.

## Tasks validated

- ✗ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/fake-scratch-fs.ts` — **insrc-build** (2026-11-15T05:30:51.036Z)
- `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` — **insrc-build** (2026-11-15T05:30:51.036Z)
- `vscode-plugin/src/chat/scratch-store.ts` — **insrc-build** (2026-11-15T05:30:51.036Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/ISSUE.md` — **insrc-build** (2026-11-15T05:30:51.036Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/S001/LLD-SELF-REVIEW.md` — **insrc-build** (2026-11-15T05:30:51.036Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/S001/sequence-diagram.html` — **insrc-build** (2026-11-15T05:30:51.036Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/S001/ux-mock.html` — **insrc-build** (2026-11-15T05:30:51.036Z)
