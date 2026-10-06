<!-- insrc:artifact ISSUE-9bf89afcc1bf58b1 -->

# Approving a BUILD record with uncommitted files replaces the Story's change log with those files

## Reproduction

1. Build a Story so its BUILD record carries a change log (on 2026-10-05, BUILD-1716f77ba9ba017b-S001 listed 75 files). 2. Commit the work. 3. Leave any unrelated file uncommitted (that day: CLAUDE.md and AGENTS.md, re-stamped by a daemon restart, plus the Story's code-review json and md). 4. Approve the BUILD record through approveWorkflowTarget. Observed: the record's change log now lists only the 4 uncommitted files; the 75 entries are gone. Expected: approval leaves the Story's change log as the build recorded it, or adds to it; it never drops entries.

## Root cause

Two behaviours combine. First, the approval-time writer, ensureBuildRecordOnCompletion, always recomputes a change log and writes it, even when the record already has one. It gets the file list from changedFiles, which returns the working-tree set whenever that set is not empty and reads the Story's committed range (base..HEAD) only when the working tree is clean. So with any uncommitted file, the list is just the uncommitted files. Second, the record merge (mergeWithPrior) spreads the prior body and then the new body, so a new `changeLog` replaces the stored one outright; only `tasks` are merged by union. The approval-time write therefore overwrites a full change log with whatever happened to be dirty.

## Fix intent

Approval must not lose a change log the build already recorded. The completion write should keep the stored entries, and the file list it derives at approval should describe the Story's committed range rather than unrelated uncommitted files. Cover it with a test that approves a BUILD record carrying a change log while an unrelated file is uncommitted, and asserts no entry is lost.

## Citations

- **[[c1]]** `code` `src/workflow/runners/build/completion-record.ts` — "body: { ...base.body, ...(changeLog.length > 0 ? { changeLog } : {}) },"
- **[[c2]]** `code` `src/workflow/runners/build/changed-files.ts` — "if (kept.length > 0) return kept;"
- **[[c3]]** `code` `src/workflow/runners/build/standalone-record.ts` — "...prior.body,"
- **[[c4]]** `prior-artifact` `BUILD-1716f77ba9ba017b-S001`
