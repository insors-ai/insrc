<!-- insrc:artifact BUILD-a6b56dc93aa3d2fe-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-05T03:49:34.474Z

**Commit:** 5b04603c2

## Scope

Fix ISSUE-a6b56dc93aa3d2fe (docs/standalone/make-finished-code-review-story-plan-E20261105a6b56dc9/ISSUE.md): re-read a stored task code review of a Story with a Plan against the document set its route required at start, so publish/resume/second start succeed for {lld, plan} (legacy {story, lld, plan} still reads; start-side checks stay strict).

## Triage rationale

bugfix, magnitude small: one root cause in the stored-review re-read (task-review/packet.ts, publication.ts, admission.ts)
