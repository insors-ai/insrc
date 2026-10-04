<!-- insrc:artifact BUILD-11e4fa8831105a05-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-04T12:52:39.593Z  ·  **Updated:** 2026-10-04T12:56:56.487Z

**Commit:** 8e5e186

## Scope

Fix ISSUE-11e4fa8831105a05: code-review findings whose file is outside the Story's changed set are dropped in silence. Keep the filter, but make every scope-drop visible: recorded per dimension on the persisted code-review record (and rendered in CR.md), reported on the insrc_code_review_step response, and logged. The verdict and counts must not change.

## Triage rationale

Approved small bugfix (issue -> build): one fold branch drops out-of-scope findings without recording it; the fix adds disclosure only.

## Summary

The controller code-review path still filters out findings whose file is outside the changed set, but no longer discards them: each dimension carries its dropped findings verbatim as outOfScope on the record, CR.md lists them and says they are not counted, and the insrc_code_review_step response reports scopeDropped (total, per dimension, changed-set size) with a warn log. Verdict and counts are unchanged, and a record with no drops is byte-identical. 4 tests added; 13 mutations each turn them red. The daemon-driven dimension judges apply the same filter and remain silent.

## Tasks validated

- ✗ `S001`

## Changes

- `.insrc/artifacts/ISSUE-11e4fa8831105a05.json` — **insrc-build** (2026-10-04T12:56:56.487Z)
