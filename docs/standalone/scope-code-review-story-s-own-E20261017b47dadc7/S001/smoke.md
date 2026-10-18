# Smoke: ISSUE-b47dadc7 S001/t9 on the installed daemon

2026-10-18. Times are UTC.

## Trailer check

`git log --format='%h %s [%(trailers:key=Insrc-Story,valueonly)]' 576fe2d0..32dfd033`:

| Commit | Task | Insrc-Story |
|---|---|---|
| 4dba12cc | t1 | b47dadc7cf0cccb1/S001 |
| 8d526792 | t2 | b47dadc7cf0cccb1/S001 |
| 163b6dfd | t3 | b47dadc7cf0cccb1/S001 |
| 814f773f | t4 | b47dadc7cf0cccb1/S001 |
| edb8aafe | t5 | b47dadc7cf0cccb1/S001 |
| 7ddfc7eb | t6 | b47dadc7cf0cccb1/S001 |
| 440e3c1a | t7 | b47dadc7cf0cccb1/S001 |
| 32dfd033 | t8 | b47dadc7cf0cccb1/S001 |

Every task commit from t1 on carries the trailer. The one other commit in the range, 41ca7d7f
(`docs(plan): … plan approved`), is the plan's approval stamp, made before t1; it carries none
and so is not part of the Story's change set.

## Ship

- Full sweep before shipping (`npx tsx --test --test-force-exit 'src/**/__tests__/*.test.ts'`, Node 22):
  5,937 tests, 5,807 pass, 5 fail, 122 skipped. Each failing file was then run alone at HEAD and at
  576fe2d0 (before this Story), in a separate worktree:

  | File | HEAD alone | 576fe2d0 alone |
  |---|---:|---:|
  | src/cli/panes/__tests__/MCPSection.test.ts | 0 fail | 0 fail |
  | src/daemon/__tests__/search-filter.test.ts | 0 fail | 0 fail |
  | src/daemon/__tests__/search-guard.test.ts | 0 fail | 0 fail |
  | src/daemon/db/__tests__/sqlite-driver.test.ts | 1 fail | 1 fail |
  | src/workflow/__tests__/review-decision.test.ts | 1 fail | 1 fail |

  Three fail only inside the full sweep; two fail the same way before this Story. None is in code
  this Story changed.
- `git push origin main`: 63960395..32dfd033.
- Installed daemon updated with the maintenance `update` (sync to 32dfd033, build, config
  reconcile) and `restart`; up as pid 89905.

## Re-review of ISSUE-ae864466

`insrc_code_review_step` start for `ae864466e7f1f4ea/S001`, routed to the daemon (the controller
built it). The index was still processing after the restart; the review waited 133 s for it
(19 code-index jobs pending) and then reviewed the diff (`groundingMode: degraded`,
`fallbackReason.kind: freshness-timeout`).

| | Before (2026-10-17, full) | Re-review (2026-10-18, degraded) |
|---|---|---|
| Verdict | block | warn |
| Counts | 10 HIGH, 3 MED, 0 LOW | 0 HIGH, 2 MED, 4 LOW |
| changeSetAttribution | (not recorded) | first-parent-range |
| Coverage findings | 10 HIGH + 3 MED: 6 of the HIGHs (AGENTS.md, CLAUDE.md, four test files) and all 3 MEDs on Markdown or test files | 0 |

- The coverage HIGHs on Markdown (AGENTS.md, CLAUDE.md) and on the four test files are gone:
  sections and test-file entities are not coverage-eligible, and a diff review states that symbol
  coverage cannot be graded, so no symbol finding is possible.
- `changeSetAttribution: first-parent-range`: ISSUE-ae864466's commits predate the trailer, so the
  change set is the old derivation, the first-parent range from its base ef33e031. That range now
  holds 87 commits and 97 files, nearly all other Stories' work since 2026-10-17; every conventions
  and quality finding of the re-review is on such a file. This is the stated fallback for a Story
  with no trailered commit, and shows why the trailer is needed.
- The re-review's record is kept at /tmp/CR-ae864466-rereview.json for this note; ISSUE-ae864466's
  committed review record was restored, since the re-review judged other Stories' code.
