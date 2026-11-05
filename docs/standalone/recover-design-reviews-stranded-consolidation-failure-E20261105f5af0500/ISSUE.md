<!-- insrc:artifact ISSUE-f5af0500294370bc -->

# Recover design reviews stranded by consolidation failure

## Reproduction

Review design-final-pin-r1-1793853283849 attempt 2 accepted 11/11 chunks, then failed consolidation with invalid_result: Resolution requires accepted fresh inspection without mandatory gaps. Resume rejects failed status; attempt 3 rejects because no complete terminal report exists. Expected: explicit recovery preserves accepted evidence and reaches a valid report without rerunning unrelated chunks. [c4]

## Root cause

Live assessDesignResult reconciles finding decisions before normalizing missing mandatory coverage into incomplete status; later consolidation revalidates the normalized result and can reject a decision it previously accepted. Coordinator then stores failed, while admitRecovery excludes failed and admit requires a complete passed/changes_requested/incomplete report for a subsequent attempt. This leaves a durable checkpoint with no supported continuation. [c1][c2][c3]

## Fix intent

Make admission and consolidation validation consistent and idempotent while keeping mandatory inspection and finding-resolution checks strict. Add an explicitly user-directed recovery route for the stranded consolidation checkpoint, preserving accepted evidence/history and retrying only work actually requiring correction. Reject unrelated failure classes and changed-subject recovery. Cover live admission, consolidation, persistence/restart and existing failed-checkpoint regression paths. Do not manually edit the live checkpoint, relax coverage, or automatically replay completed reviews. [c1][c2][c3]

## Citations

- **[[c1]]** `code` `src/workflow/review/design-review/results.ts:85`
- **[[c2]]** `code` `src/workflow/review/design-review/coordinator.ts:105`
- **[[c3]]** `code` `src/workflow/review/design-review/coordinator.ts:386`
- **[[c4]]** `doc` `.insrc/tmp/design-review/design-final-pin-r1-1793853283849.json`
