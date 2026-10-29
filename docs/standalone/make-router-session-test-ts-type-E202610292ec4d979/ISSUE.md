<!-- insrc:artifact ISSUE-2ec4d97980969dd5 -->

# Make router-session.test.ts type-check clean

## Reproduction

Type-check src/daemon/threads/__tests__/router-session.test.ts on its own: write a temporary tsconfig in the repo root that extends tsconfig.json and includes only that file, then run `npx tsc -p` on it. Observed: 6 TS2345 errors. Three are at src/daemon/threads/__tests__/router-session.test.ts:426, :433 and :444 ('ReplyEnvelope | FrameEnvelope' is not assignable to '{ kind: string; requestId: string; error: string; }'). Three are at :469, :475 and :480 ('"s1"' or '"s2"' is not assignable to 'never'). Expected: no errors. The project's own `npx tsc --noEmit` reports nothing because tsconfig.json excludes test folders, and tsx strips types when it runs the tests, so the tests pass.

## Root cause

Node's strict `assert.deepEqual` is typed as a type assertion: after `assert.deepEqual(x, expected)` TypeScript treats `x` as having the type of `expected`. In the ack tests added by 92b13b4cc, `acks` is declared `string[]`, then checked with `assert.deepEqual(acks, [], ...)` (src/daemon/threads/__tests__/router-session.test.ts:466). From then on TypeScript treats it as `never[]`, so `acks.includes('s1')` (src/daemon/threads/__tests__/router-session.test.ts:469) and the later `acks.push('s2')` and `acks.includes('s2')` (:475, :480) do not type-check. In the same way, `replies` is checked against `[{ kind: 'reply', requestId: 'f1', error: ... }]` (src/daemon/threads/__tests__/router-session.test.ts:425), so the later `replies.push(e)` calls with a reply or frame envelope (:426, :433, :444) do not type-check. At run time the arrays are ordinary arrays, so every test behaves as written.

## Fix intent

src/daemon/threads/__tests__/router-session.test.ts type-checks with no errors, and every test asserts exactly what it asserts today. Nothing outside the test file changes.

## Citations

- **[[c1]]** `code` `src/daemon/threads/__tests__/router-session.test.ts:469` — "await until(() => acks.includes('s1'), 's1 acked');"
- **[[c2]]** `code` `src/daemon/threads/__tests__/router-session.test.ts:466` — "assert.deepEqual(acks, [], 'no ack past the reply while its work drains');"
- **[[c3]]** `code` `src/daemon/threads/__tests__/router-session.test.ts:426` — "paths.toSessionWorker(portless, drainRequest('p1'), e => { replies.push(e); }, () => {}, () => { acks.push('p1'); });"
- **[[c4]]** `code` `src/daemon/threads/__tests__/router-session.test.ts:425` — "assert.deepEqual(replies, [{ kind: 'reply', requestId: 'f1', error: 'the worker could not start' }]);"
- **[[c5]]** `code` `tsconfig.json`
