<!-- insrc:artifact BUILD-01ac1e4b6a6c9c2f-s1 -->

# Build (standalone) — Story s1

**Standalone:** yes  ·  **Created:** 2026-11-15T05:06:15.905Z  ·  **Updated:** 2026-11-15T05:29:07.413Z

**Commit:** 9f6753341

## Summary

t1 round 4 (checks all satisfied in rounds 2-3; only the scope flag remains). This Story's own commits since the build-start base 60570d87 are exactly 11234b6ee, 296a2fe35, 9f6753341, each carrying Insrc-Story: 01ac1e4b6a6c9c2f/s1 and touching only vscode-plugin/src/chat/scratch-store.ts + its two __tests__ files; the worktree has NO uncommitted changes under vscode-plugin/. Every other dirty path is another Story's committed work on this shared v2 branch (234b9967/s1: src/shared/installation-mutation-gate.ts + its test, in base..HEAD) or pre-existing ledger/doc files (.insrc/**, two foreign CR.md docs, docs/reqs html) — none is this Task's surface. implementation: updateScratch with resolveInside validation, exclusive O_CREAT|O_EXCL|O_NOFOLLOW temp write (occupier untouched), backup hard link before unlink, per-attempt lstat+O_NOFOLLOW open+fstat inode equality re-validation, unlink+link+unlink publish (never rename), bounded EEXIST retry x5, restore-from-backup on publish failure so the destination is never absent/partial. Tests 14/14 pass (incl. publish-failure restore, inode-swap refusal, EEXIST retry), daemon typecheck clean.

## Tasks validated

- ✗ `t1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `vscode-plugin/src/chat/__tests__/fake-scratch-fs.ts` — **insrc-build** (2026-11-15T05:29:07.413Z)
- `vscode-plugin/src/chat/__tests__/scratch-store.test.ts` — **insrc-build** (2026-11-15T05:29:07.413Z)
- `vscode-plugin/src/chat/scratch-store.ts` — **insrc-build** (2026-11-15T05:29:07.413Z)
