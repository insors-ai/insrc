# Controller self-review of the s8 build (BUILD-b7a68147dcf72034-s8)

Reviewer: the controller session. It also wrote the code, so this is a self-review and approval of the BUILD needs an override. The daemon review framework was not working; the one daemon task review that exists (`CR.md`, task t1, passed, two LOW notes) is a separate record, and both of its notes were closed (below).

Scope: the commits with the trailer `Insrc-Story: b7a68147dcf72034/s8` (t1 to t9 and their fixes) in `src/daemon/tools/builtins/git/`, `src/daemon/tools/__tests__/`, `docs/daemon.md` and `docs/plans/tool-registry.md`.

## What I checked, and found

1. **The gh files are unchanged** (`git diff cb2c00d4f..HEAD -- src/daemon/tools/builtins/gh` is empty); the git builder imports `field`, `fieldSchema` and `refuseInput` from them.
2. **Every old input of the five extended tools keeps its class and result**: `git-approval.test.ts` runs every old op through both the old and the extended tool and compares the class and the `list` answer, and the pinned snapshot is compared after taking off exactly the inputs and `op` values listed as added by s8; `required` is checked unchanged. `op` keeps the base's optionality (git_stash defaults to push). Found and fixed while writing t8: the first `extendGitTool` made `op` optional for tools where it was required.
3. **Destructive classes**: each destructive input and its safe pair is asserted in `git-objects`, `git-patch`, `git-tree` and `git-maintenance` tests, and every destructive input is run through `executeTool` with a gate that denies (`no-client`) while a stand-in `git` records that it never started.
4. **Schema refusal before approval**: new fields of the extended tools carry the safety patterns (SAFE_REF, SAFE_REV, SAFE_REFS_REF, SAFE_PATH); `op-table.test.ts` shows a value outside a pattern and a field the op does not take are refused with `asked() === 0`.
5. **Standard input**: content goes through `runShellBytes`; empty content is delivered, content over 1 MiB is refused before git starts, a write that fails is a `rejected` failure with no answer. Binary input and output are base64.

## Defects found by the gates and by this review, all fixed

- **`git bugreport` opens an editor** (found by the validate gate when it ran with `EDITOR=vim`): the op now runs with `GIT_EDITOR=true`; a test pins it.
- **`git submodule` ops had no guard against `ext::` urls**, which run a command: every submodule action now passes `-c protocol.ext.allow=never`, and `add` refuses an `ext::` or `-`-leading url (`git-tree.test.ts`). `git_setup clone` already did.
- **`op-table.test.ts` gaps named by the daemon's task review of t1** (LOW): a function-valued class built through `buildGitFamilyTool`, the `timed-out` path with and without the unknown-outcome text, and the `missing-tool` path now have a test.
- **Coverage-test data**: merge-file and mailsplit cases had inputs that conflicted or too few commits; fixed in the tests, not in the code.

## Residual risks and limits (also in docs/plans/tool-registry.md)

- `git stash export --to-ref` and `git fast-import` can move or create refs and are class common, not destructive.
- A new op that must reuse an old field (`ref` of the stash, `path` of the worktree, `message`) takes it with the old, looser schema; the value is checked by `assertSafeArg` in execute, after the approval, as the old ops already do.
- `git read-tree` without reset replaces the index (staged work is lost) and is class common, as the LLD says.
- The ops are written for git 2.53.0. An older git that lacks one fails with git's message and the version the table was written for; no test runs an older git.
- `git backfill` was exercised only in a partial clone made for the test; `git refs migrate` only in a fresh repository (git refuses it with linked worktrees).
- The full sweep found no failure added by s8 (see "s8 full sweep"); the known failures of other suites remain.

## Verdict

Pass, with the limits above. Approval of the BUILD needs `overrideReview` naming this file.
