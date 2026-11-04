<!-- insrc:artifact ISSUE-d792f3aa6f135f1c -->

# Repair incomplete code-review task attribution before assessment

## Reproduction

Submit a whole-story review packet with unchanged cross-engine regression tests. In design-review S2 attempt 2, reviewer omitted test indexes 19–22 as another story's tests despite exhaustive attribution instructions. Host rejected the mapping; all eight tasks became failed without assessment.

## Root cause

attributionPrompt requires every test but does not explicitly distinguish regression evidence from changed-source scope. deriveTaskAssignments detects missing coverage but emits a generic combined error without omitted indexes or paths. Native output host validation terminates the session; the coordinator has no attribution-only correction loop and caches the shared failure for remaining tasks.

## Fix intent

Make unchanged/cross-engine regression evidence explicitly attributable without expanding source scope; identify omitted entries precisely; allow a bounded correction cycle for invalid shared attribution using pointed host feedback, while preserving exhaustive validation, accepted assessments and native/controller semantics. Do not retry unrelated CLI or assessment failures or alter provider-wide behavior.

## Citations

- **[[c1]]** `code` `src/workflow/code-review/task-review/assessment.ts:17`
- **[[c2]]** `code` `src/workflow/code-review/task-review/packet.ts:188`
- **[[c3]]** `doc` `.insrc/tmp/code-review/design-review-s2-1793721015585.json`
- **[[c4]]** `doc` `src/workflow/code-review/task-review/coordinator.ts:198`
- **[[c5]]** `doc` `src/agent/providers/review-activity-stream.ts:109`
