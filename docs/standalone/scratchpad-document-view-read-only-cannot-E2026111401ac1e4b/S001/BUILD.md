<!-- insrc:artifact BUILD-01ac1e4b6a6c9c2f-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-15T05:06:15.905Z  ·  **Updated:** 2026-11-15T05:40:15.193Z

**Commit:** 553c5d35f

## Summary

t1 round 8 — destination-untouched on publish failure is now a hard guarantee, matching the plan acceptance check "write/publish failure → ScratchStoreError with destination untouched and temp unlinked". updateScratch: resolveInside + lstat validation, exclusive no-follow temp create (occupier never unlinked; own temp cleaned on write failure), backup hard link(path, .bak) taken BEFORE the unlink, per-attempt destination re-validation (lstat + O_NOFOLLOW open + fstat inode equality), unlink(dest)+link(temp,dest)+unlink(temp) publish (never rename), bounded EEXIST retry (5, each re-validated), and on a publish that never lands the original content is linked back over the destination name from the backup (mandatory restore; only if the restore itself races a concurrent recreate does the error path log and the name holds the concurrent actor's file — never partial temp content), then temp+backup cleaned and ScratchStoreError thrown. Daemon gate: tests 14/14 pass (incl. publish-failure restore asserting destination content intact), typecheck clean. Commits 11234b6ee/296a2fe35/9f6753341/164179a8b/553c5d35f all trailer Insrc-Story: 01ac1e4b6a6c9c2f/s1, touching only the three scratch-store files; ledger docs committed separately. Remaining worktree noise is foreign (other stories' .insrc/CR.md/docs, 234b9967's committed gate files) on shared v2.

## Tasks validated

- ✗ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/fake-scratch-fs.ts` — **insrc-build** (2026-11-15T05:40:15.193Z)
- `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` — **insrc-build** (2026-11-15T05:40:15.193Z)
- `vscode-plugin/src/chat/scratch-store.ts` — **insrc-build** (2026-11-15T05:40:15.193Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/ISSUE.md` — **insrc-build** (2026-11-15T05:40:15.193Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/S001/LLD-SELF-REVIEW.md` — **insrc-build** (2026-11-15T05:40:15.193Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/S001/sequence-diagram.html` — **insrc-build** (2026-11-15T05:40:15.193Z)
- `docs/standalone/scratchpad-document-view-read-only-cannot-E2026111401ac1e4b/S001/ux-mock.html` — **insrc-build** (2026-11-15T05:40:15.193Z)
