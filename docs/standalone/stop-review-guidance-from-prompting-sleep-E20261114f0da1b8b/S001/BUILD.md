<!-- insrc:artifact BUILD-f0da1b8b9cdb28b6-s1 -->

# Build (standalone trivial) — Story s1

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-14T14:44:33.468Z  ·  **Updated:** 2026-11-14T14:45:50.259Z

**Commit:** a46f12d95

## Scope

ISSUE-f0da1b8b9cdb28b6: change the polling wording in the design-review and code-review guidance so it no longer implies sleeping between polls. In src/prompts/steering-block.md (review section, about line 390, and code-review step 2, about line 475) and docs/design-review-execution.md (about line 24), replace 'poll progress about every 10–30 seconds' with: call progress again directly without sleeping, or wait with one background command that exits when the checkpoint reaches a terminal status; never arm placeholder or no-op waits; stop any armed wait before ending a turn that asks the user a question.

## Triage rationale

Small bugfix routed to build: wording-only change in the steering block and one doc; no code or contract change.

## Summary

Rewrote the progress-wait guidance in the review and code-review sections of src/prompts/steering-block.md and in docs/design-review-execution.md (no timed poll interval, no placeholder waits, stop armed waits before asking the user), and pinned the new rule in src/mcp/__tests__/review-rule-text.test.ts. Commit a46f12d95.

## Tasks validated

- ✗ `s1`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `docs/design-review-execution.md` — **insrc-build** (2026-11-14T14:45:50.259Z)
- `src/mcp/__tests__/review-rule-text.test.ts` — **insrc-build** (2026-11-14T14:45:50.259Z)
- `src/prompts/steering-block.md` — **insrc-build** (2026-11-14T14:45:50.259Z)
