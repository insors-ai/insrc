<!-- insrc:artifact BUILD-1102dc7125ad0c07-S001 -->

# Build (standalone) — Story S001

**Standalone:** yes  ·  **Created:** 2026-10-17T06:56:06.405Z  ·  **Updated:** 2026-10-17T07:07:48.129Z

**Commit:** ebc27d78

## Summary

ebc27d78: IndexQueue keeps the job in flight (set before processor(job), cleared in finally) and adds codeIndexWorkFor(repoPath) => { inFlight, pending } over full/reconcile jobs naming the repo and file jobs under repoPath or repoPath+sep; depthForRepo unchanged (asserted in the test, and queue-depth-for-repo.test.ts passes). Five falsifying mutations each fail the test. Daemon suites 282 pass, 0 fail; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/daemon/__tests__/queue-code-index-work.test.ts` — **insrc-build** (2026-10-17T07:07:48.129Z)
- `src/daemon/queue.ts` — **insrc-build** (2026-10-17T07:07:48.129Z)
- `src/workflow/code-review/__tests__/subject.test.ts` — **insrc-build** (2026-10-17T07:07:48.129Z)
- `src/workflow/code-review/dimensions/__tests__/coverage.test.ts` — **insrc-build** (2026-10-17T07:07:48.129Z)
- `src/workflow/code-review/dimensions/coverage.ts` — **insrc-build** (2026-10-17T07:07:48.129Z)
- `src/workflow/code-review/dimensions/test-record-view.ts` — **insrc-build** (2026-10-17T07:07:48.129Z)
- `src/workflow/code-review/subject.ts` — **insrc-build** (2026-10-17T07:07:48.129Z)
- `src/workflow/code-review/types.ts` — **insrc-build** (2026-10-17T07:07:48.129Z)
