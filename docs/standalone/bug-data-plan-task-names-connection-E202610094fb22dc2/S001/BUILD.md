<!-- insrc:artifact BUILD-4fb22dc28697cc14-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-10-10T06:16:08.279Z

**Commit:** 5d549b63

## Scope

Fix ISSUE-4fb22dc28697cc14: a task refused because it names a connection outside the request's connection scope is recorded as a scope refusal: its task record and its entry in tasksFailed carry a code a client can read, and the reason is the error's own message with no 'runtime-threw:' in front. The refusal's message and the point of refusal stay as they are; the three existing codes keep their meaning; the daemon guide lists the code.

## Triage rationale

bugfix, magnitude small: a typed error for the refusal and one more code in the plan walk's mapping; the one open decision (own code or an existing one) is taken in the fix as the issue allows.
