<!-- insrc:artifact BUILD-a6b56dc93aa3d2fe-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-05T03:49:34.474Z  ·  **Updated:** 2026-11-05T03:58:12.675Z

**Commit:** 0556f0dc0

## Scope

Fix ISSUE-a6b56dc93aa3d2fe (docs/standalone/make-finished-code-review-story-plan-E20261105a6b56dc9/ISSUE.md): re-read a stored task code review of a Story with a Plan against the document set its route required at start, so publish/resume/second start succeed for {lld, plan} (legacy {story, lld, plan} still reads; start-side checks stay strict).

## Triage rationale

bugfix, magnitude small: one root cause in the stored-review re-read (task-review/packet.ts, publication.ts, admission.ts)

## Summary

pinnedTriple in task-review/packet.ts takes a historical flag: a stored re-read (publication and admission resume) accepts LLD and Plan alone and checks the story document only when it was pinned; a new packet without a route still needs all three. Tests: route-documents.test.ts (re-read parity with start, legacy triple still reads, new packet still refused, missing LLD/Plan and another story refused) and publication.test.ts (a stored {lld, plan} review publishes); both fail without the fix. Left out: the two other items in #100 (retrying a crashed reviewer unit; the design review 'Expected union value' result error). A pre-existing failure in history.test.ts ('all-reuse attempts…') fails without this change too.

## Tasks validated

- ✓ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-a6b56dc93aa3d2fe.json` — **insrc-build** (2026-11-05T03:58:12.675Z)
- `.insrc/artifacts/ISSUE-a6b56dc93aa3d2fe.log.jsonl` — **insrc-build** (2026-11-05T03:58:12.675Z)
- `docs/standalone/make-finished-code-review-story-plan-E20261105a6b56dc9/ISSUE.md` — **insrc-build** (2026-11-05T03:58:12.675Z)
- `src/workflow/code-review/task-review/__tests__/publication.test.ts` — **insrc-build** (2026-11-05T03:58:12.675Z)
- `src/workflow/code-review/task-review/__tests__/route-documents.test.ts` — **insrc-build** (2026-11-05T03:58:12.675Z)
- `src/workflow/code-review/task-review/packet.ts` — **insrc-build** (2026-11-05T03:58:12.675Z)
