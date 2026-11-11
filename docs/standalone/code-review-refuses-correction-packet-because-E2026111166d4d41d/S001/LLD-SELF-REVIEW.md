# Design review record: LLD-66d4d41d99f805af-s1

Review id `lld-66d4d41d99f805af-s1`. Three rounds, the limit for one cycle.

## Round 1: daemon reviewer, changes requested

| Id | Severity | Finding | Change |
| :--- | :--- | :--- | :--- |
| cost-independence-unspecified | MED | The ac1 test did not say what it measures or how the N = 4 and N = 40 runs are compared. | The test counts `file()` calls for the selected path, the decoded bytes they return and the `pathChanges` calls. It asserts all three are equal for both fixtures, plus a check that the commit counts really differ. |
| f1 | LOW | The `pathChanges` call example left out `cwd`. | Passes `cwd: this.deps.repoPath` explicitly. |
| ac5-smoke-row-format-inconsistent | LOW | The ac5 row had no file/title and no reported form. | Stated as a reported smoke result `{ result, evidence }`. |

## Round 2: controller self-review (user instruction, 2026-11-11)

The daemon reviewer paused round 2 with `technical_retry_exhausted`. Its impact output left out the round-1 finding origins four times (`src/workflow/review/design-review/results.ts:47`), and no chunk was reviewed. The user then said: "design review is broken, use the process defined to do a manual self-review".

Checked against the code and real data:

- **Implementer list.** A text search for `isAncestor:` and `implements ReviewSources` finds no implementer beyond the eleven listed.
- **Git output limits.** `git_path_history` reads through `readGit`, which fails on a non-zero exit, spawn error or timeout. It parses through `parseOutput`, which refuses output cut at the 10 MiB limit, so a partial list never reaches `pathChanges`.
- **git semantics.** In a scratch repo, default history omitted a side-branch deletion, while `--full-history` listed it along with both kinds of merge: one matching a parent's file, one made with `-s ours`.
- **ac5 budget.** The packet has 28 commits, 135 file entries and 78 paths. Interval decoding comes to about 4.1 MiB, and about 225 commits are listed across all paths, well inside the unchanged limits.

| Id | Severity | Finding | Change |
| :--- | :--- | :--- | :--- |
| ac4-proof-not-cross-version | MED | The ac4 tests re-prepare attempts saved by the same code, so they cannot catch an identity change this Story introduces. | Added an identity computed with the pre-change code on a deterministic fixture and pinned as a constant, plus the real start of attempt 4 of `board-common-model-s1`, which re-prepares saved attempts 1-3 against their stored identities. |
| truncation-not-stated | LOW | The listing-failure case did not name output cut at the byte limit. | Named, with the existing `parseOutput` refusal. |

## Round 3: controller self-review, passed

- `projectReviewScope` returns `identity`, so the pinned-identity test can read it directly.
- The range-plus-literal-pathspec form `git log --full-history <from>..<to> -- ':(top,literal)<path>'` lists every expected commit in the scratch repo.
- The test fixtures run git with `GIT_CONFIG_GLOBAL=/dev/null` and `GIT_CONFIG_NOSYSTEM=1`, so commit signing and user config cannot change OIDs.

Advice for the build (LOW, not blocking): in the pinned-identity fixture, give every merge an explicit `-m` message and fixed author and committer dates, so merge OIDs do not depend on git's default merge message.

No open MED or HIGH findings.
