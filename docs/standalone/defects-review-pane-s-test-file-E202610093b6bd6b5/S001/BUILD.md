<!-- insrc:artifact BUILD-3b6bd6b5fa3c30d1-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-09T13:40:22.149Z  ·  **Updated:** 2026-10-09T15:41:35.394Z

**Commit:** e1f3e1f0

## Summary

t6 done, in commits e0c56326 and its follow-up. Two guards were added near the top of docs-review-panel.test.ts.

`git(t: Skipper, need: { commits?, window?: { from, to } }, root = REPO_ROOT)` returns a git runner, or null after calling t.skip with the reason. It skips when:
- the directory is not a work tree ('not a git work tree: <root>');
- the clone is shallow (`rev-parse --is-shallow-repository`; 'shallow clone: history needed for <what>');
- a named commit is missing (`cat-file -e sha^{commit}`; 'commit <sha> is not in this history');
- the window has no real span: an end with no commit, equal ends, or no ancestry by `merge-base --is-ancestor`. The reason is 'no build window between <from> and <to>: <why>'.

`tscOrSkip(t, path = TSC)` skips with 'TypeScript compiler not installed at <path>'.

Every check is routed through them:
- The t3 contract test uses git(t, {commits: ['09e6efa']}).
- The first t6 uses git(t, {commits: ['8908338']}).
- The t1 src/ guard drops its local git helper for git(t, {window: S004 PLAN.md→BUILD.md}).
- The second t6 drops its direct log/diff execFileSync calls for the same window.
- typecheckAgainstPanel(t, snippet) now returns null after a skip, and its callers return.
- The never-witness probe uses tscOrSkip.

When the history is present, each check runs the same git commands and assertions it ran before.

New test: 'history and compiler checks skip with a stated reason when what they need is missing, and never run on an empty window'. It uses a recording {skip} context against tmp directories and asserts the exact reason for each case:
- a non-work-tree directory;
- a one-commit repo, which gives equal window ends;
- an end that no commit touches;
- a missing commit;
- an inverted window, after a second commit;
- a missing compiler path.
Its positive controls are a real two-commit window, which runs with no skip, and the installed tsc, which is returned with no skip. It also scans the source and finds no `execFileSync('git', [`, no local `const git = (`, exactly one `function git(`, and no `existsSync(tsc)`.

Results:
- Full clone: 202/202 pass, 0 skipped.
- Fresh `git clone --depth 1` of the commit: 198 pass, 0 fail, 4 skipped. The four are the t3 contract test, both t6 tests and t1, and each skip states its reason. Before this task the shallow clone had 3 failures plus a vacuous pass.
- Plugin suite: 901 pass, the 1 known manifest-catalog failure, and 4 skips, all of them env-gated live CLI tests.
- Both typechecks are clean, and strict errors stay at the baseline of 10.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`
- ✓ `t5`
- ✓ `t6`

## Changes

- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts` — **insrc-build** (2026-10-09T15:41:35.394Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.test.ts` — **insrc-build** (2026-10-09T15:41:35.394Z)
- `vscode-plugin/src/chat/__tests__/fake-dom.ts` — **insrc-build** (2026-10-09T15:41:35.394Z)
