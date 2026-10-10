<!-- insrc:artifact BUILD-4fb22dc28697cc14-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-10T06:16:08.279Z  ·  **Updated:** 2026-10-10T06:16:23.276Z

**Commit:** a7353b78

## Scope

Fix ISSUE-4fb22dc28697cc14: a task refused because it names a connection outside the request's connection scope is recorded as a scope refusal: its task record and its entry in tasksFailed carry a code a client can read, and the reason is the error's own message with no 'runtime-threw:' in front. The refusal's message and the point of refusal stay as they are; the three existing codes keep their meaning; the daemon guide lists the code.

## Triage rationale

bugfix, magnitude small: a typed error for the refusal and one more code in the plan walk's mapping; the one open decision (own code or an existing one) is taken in the fix as the issue allows.

## Summary

The refusal of a task that names a connection outside the request's connection scope is now a typed error (ConnectionOutsideScopeError), and the plan walk records it with the code connection-outside-scope and the error's own message, with no 'runtime-threw:' in front. The decision the issue left to the fix was taken as a code of its own: it is a task's code only, so the three scope codes a request fails with, and their mapping, are unchanged. The refusal's message and the point of refusal are unchanged. docs/daemon.md lists the code. Tests: one new test in src/analyze/executor/__tests__/walker.test.ts and a strengthened one in src/analyze/runtimes/data/__tests__/data-runtimes.test.ts; two mutations each fail them.

## Tasks validated

- ✓ `S001`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `.insrc/artifacts/ISSUE-4fb22dc28697cc14.json` — **insrc-build** (2026-10-10T06:16:23.276Z)
- `docs/daemon.md` — **insrc-build** (2026-10-10T06:16:23.276Z)
- `src/analyze/context/invariants.ts` — **insrc-build** (2026-10-10T06:16:23.276Z)
- `src/analyze/executor/__tests__/walker.test.ts` — **insrc-build** (2026-10-10T06:16:23.276Z)
- `src/analyze/executor/types.ts` — **insrc-build** (2026-10-10T06:16:23.276Z)
- `src/analyze/executor/walker.ts` — **insrc-build** (2026-10-10T06:16:23.276Z)
- `src/analyze/runtimes/data/__tests__/data-runtimes.test.ts` — **insrc-build** (2026-10-10T06:16:23.276Z)
- `src/analyze/runtimes/data/_shared.ts` — **insrc-build** (2026-10-10T06:16:23.276Z)
