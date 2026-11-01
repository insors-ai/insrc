<!-- insrc:artifact ISSUE-bf7a00d3e57dfc7c -->

# Allow active native reviews to outlive duplicate-tracking capacity

## Reproduction

S2 review review-e6ddcdcb3d9cf330-s2-final attempt 3 completed attribution and passed tasks t1, t3 and t4, but t2 failed after about eight minutes with 'Review native event identity limit exceeded'. Independently reproduce by feeding ReviewActivityStream more than 4096 valid frames with distinct UUIDs before a valid final assessment.

## Root cause

src/agent/providers/review-activity-stream.ts retains every native UUID in a session-wide Set. Its lines() decoder throws once that Set already contains 4096 identities, before processing the next new event. This converts a memory bound into a cumulative event quota that kills useful active reviews. src/agent/providers/cli-provider.ts constructs this decoder for native review sessions. Streaming activity can produce many events within a single model session; event count is not model-call count or inactivity.

## Fix intent

Keep duplicate-event memory bounded without imposing a maximum number of events over the review lifetime. Continue processing valid long Claude and Codex streams and accepting valid final feedback, while suppressing duplicate events within the retained window. Preserve tool lifecycle bookkeeping, candidate finality/acceptance, event identity length limits, frame/candidate byte limits, malformed event errors, and inactivity supervision. Add focused regressions beyond multiple tracking-window lengths, repeated recent IDs, tool start/completion across window turnover, final feedback acceptance, and genuine malformed/oversized input failures. Do not launch a new S2 review or rewrite existing results as part of this correction.

## Citations

- **[[c1]]** `code` `src/agent/providers/review-activity-stream.ts`
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts`
- **[[c3]]** `prior-artifact` `docs/epics/review-committed-work-task-checkpoints-E20261030e6ddcdcb/S002/CR.md`
- **[[c4]]** `stakeholder` `User instruction: yes, fix it.`
