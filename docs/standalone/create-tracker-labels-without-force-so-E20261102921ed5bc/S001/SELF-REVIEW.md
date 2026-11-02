# Controller self-review: build of ISSUE-921ed5bc6e27e50f (tracker labels without force)

Reviewer: the controller, who also wrote the code, so approval of the BUILD needs an override (the daemon code review is not working).

Scope: commit `1a1deec14`, `ghCreateLabel` in `src/workflow/tracker/registry-table.ts` and the tracker tests.

- **The call is no longer destructive**: `gh_label create` is class common and `ghApprovalClass` raises it only when `force` is sent; the new test counts approvals and finds none.
- **An existing label is success**: the create fails, then a list for the name must hold it (case-insensitive, exact name, up to 100 results of the search). Checked with a stand-in gh for found, not found and a failing list.
- **A denial is still thrown**: both calls go through `soft`, which rethrows denials; the existing denial test passes.
- **Limits**: a repository with more than 100 labels matching the name as a search term could hide the exact name (the list is a search, capped at 100); an existing label is now left as it is, not updated to the tracker's colour or description (the old `force` updated it). The tracker passes no colour or description, so nothing was being updated.
- Found while testing: the stand-in's `case` glob `*label*create*` also matched `createdAt` in the list's `--json` fields; the tests use `label\ create*`.

Verdict: pass. Approval needs `overrideReview` naming this file.
