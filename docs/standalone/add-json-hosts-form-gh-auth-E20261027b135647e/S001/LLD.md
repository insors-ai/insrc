<!-- insrc:artifact LLD-b135647ed951c0c1-s1 -->

# LLD: STORY-b135647ed951c0c1-s1

## Summary

**Epic:** `add-json-hosts-form-gh-auth`
**HLD base run:** `wf-1793099452991-11r744`
**HLD effective hash:** `b135647ed951...`

The gh_auth tool gets a fourth op, hosts, that runs `gh auth status --json hosts` and returns the signed-in hosts and accounts as parsed JSON under its own typed output. It runs under a 15 second limit, refuses output over 256 KB, and reports a missing gh, a timeout, a non-zero exit and a cut or oversized output as different diagnostics. It never falls back to the text form, so a gh without --json fails as it does today. The existing status, switch and logout ops, and the tool id, do not change.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)
9. [Open questions](#9-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `ghAuthTool (op hosts added)`

```typescript
ghAuthTool.execute({ op: 'hosts' }, deps): Promise<ToolResult>; output data: { op: 'hosts'; hosts: Record<string, Array<{ state: string; login: string } & Record<string, unknown>>> }
```

**Parameters:**
- `op: 'hosts'` — Selects the new op; it takes no other field.

**Returns:** `ToolResult with data { op: 'hosts', hosts }` — The object gh prints under `hosts`: one array of account objects per host, each with at least state and login (the fields githubIdentities reads); any other field gh prints is kept as it is.

**Errors:**
- `ToolFailure kind 'missing-tool'` when gh is not on PATH or failed to spawn (ghFailureOf, src/daemon/tools/builtins/gh/helpers.ts:202)
- `ToolFailure kind 'timed-out'` when gh did not finish within 15 s
- `ToolFailure kind 'rejected', 'missing-signin' or 'unreachable'` when gh exited non-zero (including 'unknown flag: --json' on gh 2.46.0); the kind follows the text of gh's message as in ghFailureOf
- `ToolFailure kind 'rejected'` when the output was cut at the capture cap, is longer than 256 KB in bytes, is not JSON, or has no hosts object of arrays with a string state and login on each account

**Preconditions:**
- gh is installed and recent enough to accept `auth status --json hosts`.

**Postconditions:**
- Runs exactly `gh auth status --json hosts`: no -h, no text conversion, no model call.
- The existing ops status, switch and logout and the tool id gh_auth are byte-for-byte unchanged in behaviour.
- The GH_COVERAGE row for the command `auth status` lists the op as 'status,hosts'.

### 2.2 `buildAuthHosts (new, module-private build function)`

```typescript
async function buildAuthHosts(c: BuildContext): Promise<Record<string, unknown> | ToolResult>
```

**Parameters:**
- `c: BuildContext` — The captured stdout, stderr, input and deps of the op (src/daemon/tools/builtins/gh/op-table.ts:148).

**Returns:** `Promise<{ hosts: ... } | ToolResult>` — The parsed hosts, or a failed ToolResult.

**Errors:**
- `ToolFailure kind 'rejected'` when c.truncated, stdout longer than 256 KB (256 * 1024 bytes, counted with Buffer.byteLength), JSON parse error, or the shape check fails

**Preconditions:**
- None.

**Postconditions:**
- Pure: no I/O, no model call.

## 3. Data model changes

### 3.1 `gh_auth op hosts output` — new

{ hosts: Record<string, Array<{ state: string, login: string, ...other fields kept>>> }. state and login are required because they are what the consumer reads; the other fields are not listed because gh's field set differs between versions and none was observed on this machine (gh 2.46.0 does not support --json for auth status). The existing status op keeps its own output {hosts: Array<{host, login, active, state: 'logged-in'|'failed'}>} from the text conversion; the two have the same property name hosts but different shapes, and the op name tells them apart.

**Call sites:**
- `src/daemon/tools/builtins/gh/account.ts:160`
- `src/understanding/identity.ts:105`

### 3.2 `GH_COVERAGE row for auth status` — field-modify

The row for the command 'auth status' has op 'status'; its op field already accepts a comma-separated list (GhCoverageRow, read with split(',') by gh-coverage.test.ts and gh-inputs.test.ts), so the row becomes op 'status,hosts'. No second row and no change to either check.

**Call sites:**
- `src/daemon/tools/builtins/gh/coverage.ts:22`
- `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts:11`

## 4. Error paths

**Error cases**

- **gh is not installed or cannot be spawned** (recoverable)
  - Detection: ghExec reports spawnError and ghFailureOf returns kind 'missing-tool' (src/daemon/tools/builtins/gh/helpers.ts:202)
  - Response: The op returns that failure unchanged; the consumer reads kind 'missing-tool' as missing-integration.
  - User impact: The identity lookup reports missing-integration, as today.
- **gh is older than the --json support (2.46.0 here)** (recoverable)
  - Detection: gh exits non-zero with 'unknown flag: --json'; ghFailureOf returns kind 'rejected' (the text matches neither the sign-in nor the network pattern)
  - Response: The failure is returned with gh's message; no retry with the text form.
  - User impact: The identity lookup reports unavailable, as it does today on this machine, which the Story s9 criterion ac4 allows.
- **gh does not finish within 15 s** (recoverable)
  - Detection: ghFailureOf returns kind 'timed-out' naming the command and the limit
  - Response: Returned unchanged.
  - User impact: unavailable.
- **gh is not signed in or has no network** (recoverable)
  - Detection: non-zero exit whose text matches GH_AUTH_RE (kind 'missing-signin') or GH_NETWORK_RE (kind 'unreachable')
  - Response: Returned unchanged.
  - User impact: unavailable, with a message that says why.
- **The output is cut at the capture cap or is longer than 256 KB** (recoverable)
  - Detection: ctx.truncated (the capture cap is 4 MiB; without maxBytes a cut is a 'rejected' failure in ghFailureOf) or Buffer.byteLength(ctx.stdout, 'utf8') greater than 262144 (256 * 1024) in buildAuthHosts, so multibyte text is counted in bytes as the captured output is
  - Response: A failed result of kind 'rejected' that says the output is too large; nothing is parsed.
  - User impact: unavailable.
- **The output is not JSON or lacks the expected shape** (recoverable)
  - Detection: JSON.parse throws, or the parsed value has no hosts object whose values are arrays of objects with string state and login
  - Response: A failed result of kind 'rejected' naming what was missing; the executor's schema check also rejects a result that does not fit the declared output.
  - User impact: unavailable; no partial hosts are returned.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| gh prints {"hosts":{}} (not signed in to any host) | The op succeeds with hosts {}; the consumer decides it means disconnected. |
| An account object has fields the schema does not list | They are kept; only state and login are required. |
| A host has an empty account array | Accepted: the value is an array of zero accounts. |
| Several accounts on one host, some with state other than 'success' | All are returned as gh printed them; filtering by state belongs to the consumer. |
| Output of exactly 256 KB | Accepted; only output longer than 256 KB is refused. |

**Invariants to preserve**

- gh_auth's existing ops status, switch and logout keep their commands, fields, limits (30 s), approval classes and output shapes, and the tool id stays gh_auth (k7). [[c3]]
- A spawn error (missing-tool) and a timeout (timed-out) keep their own ToolFailure kinds; a non-zero exit (rejected, missing-signin, or unreachable when the text names a network failure) and a cut capture (rejected) are told apart by their messages, as ghFailureOf produces them today. The new op adds no failure kind and no handling of its own for them. [[c3]]
- The text-converted status op still reads gh's text and converts it; the new op never calls the model. [[c3]]

## 5. Test strategy

**Test framework:** `node:test with tsx (npx tsx --test), assert/strict; gh tests in src/daemon/tools/builtins/gh/__tests__ with the fake gh executable of _fakegh.ts; use --test-force-exit.`

**Test levels**

- **unit** — The op's arguments, limit, output shape and every failure, against a fake gh.
  - Subjects: `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: the hosts op runs exactly `gh auth status --json hosts` with a 15 s limit and no other argument, and returns the hosts object as gh printed it with extra account fields kept`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: a missing gh, a timeout, a non-zero exit (including unknown flag --json), a cut capture and output over 256 KB are five different diagnostics (kinds missing-tool, timed-out, rejected for the non-zero exit, rejected for the cut capture, rejected for the over-size output, each with its own message) and a network failure is kind unreachable, and nothing is returned as data`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: valid JSON whose account fields hold multibyte text is accepted at exactly 262144 bytes and refused at 262145 bytes even when its character count is below 262144`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: a gh that outlives the hosts limit (lowered through registerGhLimits for the test, restored afterwards) is a timed-out failure that names the command and the limit`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: output of exactly 256 KB is accepted and output of 256 KB plus one byte is refused`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: output that is not JSON, has no hosts object, or has an account without a string state or login is refused with no partial data`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: an empty hosts object and a host with no accounts are accepted`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: the ops status, switch and logout still have their commands, fields, 30 s limits, approval classes and output shapes, and the hosts op makes no model call`
  - Fixtures: `the fake gh executable in src/daemon/tools/builtins/gh/__tests__/_fakegh.ts`, `registerGhLimits (src/daemon/tools/builtins/gh/op-table.ts:479) to lower the limit in one test`
- **contract** — The family tables and the coverage record accept the new op.
  - Subjects: `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts: the existing coverage check passes with the hosts op recorded for the command auth status, and all 69 tools are still registered`, `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts: the limit table has gh_auth.hosts at 15 s`, `src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts: the hosts output schema validates a real-shape sample and rejects a sample without login`, `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts: the family sweep exercises gh_auth.hosts from the hosts case in _family-rows.ts (JSON stdout, exact argv, class none, 15 s limit) and gh-output-schemas.test.ts validates its output`
  - Fixtures: `GH_COVERAGE`, `the registered gh limits`, `the ROWS3 family fixtures in _family-rows.ts`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: the hosts op runs exactly `gh auth status --json hosts` with a 15 s limit and no other argument, and returns the hosts object as gh printed it with extra account fields kept`, `src/daemon/tools/builtins/gh/__tests__/gh-timeouts.test.ts: the limit table has gh_auth.hosts at 15 s`, `src/daemon/tools/builtins/gh/__tests__/gh-family-tools.test.ts: the family sweep exercises gh_auth.hosts from the hosts case in _family-rows.ts (JSON stdout, exact argv, class none, 15 s limit) and gh-output-schemas.test.ts validates its output` |
| `ac2` | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: a missing gh, a timeout, a non-zero exit (including unknown flag --json), a cut capture and output over 256 KB are five different diagnostics (kinds missing-tool, timed-out, rejected for the non-zero exit, rejected for the cut capture, rejected for the over-size output, each with its own message) and a network failure is kind unreachable, and nothing is returned as data`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: output of exactly 256 KB is accepted and output of 256 KB plus one byte is refused`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: valid JSON whose account fields hold multibyte text is accepted at exactly 262144 bytes and refused at 262145 bytes even when its character count is below 262144`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: a gh that outlives the hosts limit (lowered through registerGhLimits for the test, restored afterwards) is a timed-out failure that names the command and the limit` |
| `ac3` | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: output that is not JSON, has no hosts object, or has an account without a string state or login is refused with no partial data`, `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: an empty hosts object and a host with no accounts are accepted`, `src/daemon/tools/builtins/gh/__tests__/gh-output-schemas.test.ts: the hosts output schema validates a real-shape sample and rejects a sample without login` |
| `ac4` | `src/daemon/tools/builtins/gh/__tests__/gh-auth-hosts.test.ts: the ops status, switch and logout still have their commands, fields, 30 s limits, approval classes and output shapes, and the hosts op makes no model call` |
| `ac5` | `src/daemon/tools/builtins/gh/__tests__/gh-coverage.test.ts: the existing coverage check passes with the auth status row listing the ops 'status,hosts', and all 69 tools are still registered` |

## 6. Migration

**State before:** gh_auth has three ops: status (plain `gh auth status`, 30 s, text converted by the model into an array of {host, login, active, state}), switch and logout (s1 bundle 1). Nothing in the registry runs `gh auth status --json hosts`; the only consumer that needs it, githubIdentities, spawns gh itself (s1 bundle 3). GH_COVERAGE records `auth status` against op status (s1 bundle 4).

**State after:** gh_auth has a fourth op, hosts, that runs `gh auth status --json hosts` under a 15 s limit and returns the parsed hosts object, with its own failures for a missing gh, a timeout, a non-zero exit and an over-size or malformed output. The three existing ops are unchanged. GH_COVERAGE lists the op for `auth status`, the limit table has it at 15 s and the family fixtures exercise it.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the hosts op and its build function to the gh_auth op list in the account file, with its output schema. — ↩ rollbackable
2. Change the GH_COVERAGE row for `auth status` to op 'status,hosts' and register the 15 s limit for gh_auth.hosts; no check is changed. — ↩ rollbackable
3. Add a hosts case to the family fixtures (ROWS3 in _family-rows.ts) with JSON stdout, the exact argv, class none and the 15 s limit, so the family sweeps in gh-family-tools.test.ts and gh-output-schemas.test.ts exercise the new op. — ↩ rollbackable
4. Add the new test file and the contract cases (including multibyte size cases and a timeout case that lowers the limit through registerGhLimits); run the gh suites and the typecheck. — ↩ rollbackable

**Backward compat:** Purely additive: a new op name on an existing tool. The tool id gh_auth, the ops status, switch and logout, their inputs, limits, approval classes and outputs do not change, and the registry's tool count stays 69. A client that does not know the op ignores it.

## 7. Alternatives considered

### 7.1 a1: New op hosts on gh_auth with a custom JSON build — **CHOSEN**

Add a fourth op to ghAuthTool that runs `gh auth status --json hosts` with limitS 15 and a custom build that parses the JSON object and fails when stdout is over 256 KB.

In src/daemon/tools/builtins/gh/account.ts add an OpDef named hosts: command ['auth','status'], args [lit('--json','hosts')], cls none, limitS 15, no fields, out custom with a shape {hosts: Record<host, Array<{state, login, active, host, tokenSource, ...optional fields>}>} built from the parsed stdout. The build returns a failed ToolResult (kind rejected) when ctx.stdout is longer than 256 KB, when the JSON does not parse, or when hosts is not an object of arrays. Spawn error, timeout and non-zero exit are reported by the existing ghFailureOf (missing-tool, timed-out, rejected / missing-signin). The existing status, switch and logout ops are unchanged. A row for the new op is added to the coverage table.

### 7.2 a2: Add a json flag to the existing status op

status gains an optional boolean json field that adds `--json hosts` and returns the JSON-built hosts instead of the text-converted ones.

Add a field json to the status op; when true, the arguments carry `--json hosts` and the build parses JSON, otherwise it converts text as today. One op, two behaviours.

**Rejected because:** Violates the unchanged-ops, limit and typed-output requirements (req1, req2, req5).

### 7.3 a3: A capture cap that fails on a cut, in the op table

Extend the op table so an op can declare a capture cap whose cut is a failure, then use it for hosts with 256 KB.

Add an OpDef option (for example maxBytesFail) that sets ghExec's maxBytes without cutIsAnswer, so a stdout over the cap is a 'rejected' failure at capture time. Then add the hosts op as in a1 using it with 256 KB.

**Rejected because:** Meets the requirements but widens the shared op table and its tests for an output that is a few hundred bytes; ranked second behind a1.

## 8. References

- **[[c1]]** `analyze-bundle` `the gh_auth tool and its op table (read from the files; the analyzer call graph was not run)` — "ghAuthTool through defineGhFamily with three ops: status, switch and logout"
- **[[c2]]** `analyze-bundle` `how a gh op reports spawn errors, timeouts, truncation and non-zero exits` — "a spawn error is kind 'missing-tool'; a timeout is 'timed-out'; a stdout cut at the capture cap is 'rejected' unless the op declares maxBytes"
- **[[c3]]** `analyze-bundle` `the gh_auth tool and its op table; how a gh op reports failures` — "the existing ops status, switch and logout and the failure kinds of ghFailureOf"
- **[[c4]]** `analyze-bundle` `the consumer and the installed gh` — "githubIdentities runs `gh auth status --json hosts` with timeoutMs 15000 and maxBytes 256 KB"
- **[[c5]]** `code` `src/daemon/tools/builtins/gh/account.ts:171` — "id: 'gh_auth', dashSafe: true"
- **[[c6]]** `code` `src/understanding/identity.ts:105` — "const status = await run(['gh', 'auth', 'status', '--json', 'hosts'], { timeoutMs: 15_000, maxBytes: 256 * 1024 });"

## 9. Open questions

- The Story record has no acceptance criteria; ac1 to ac5 were written in the test strategy from the Story text and each has proving tests. Confirm them as the acceptance baseline, or add them to the Story. The originating request is the Story's userValue text in the Story record (the user's 2026-10-27 request to add the JSON hosts form for Story s9 of the one-tool-registry epic).
- The JSON field set gh prints under `hosts` on a gh that supports `auth status --json` is not verified: gh 2.46.0 here rejects --json, so no real output was seen. The schema requires only state and login (taken from src/understanding/identity.ts:105) and keeps other fields. The build should check the real shape against a newer gh when one is available, and until then the contract tests use a sample shaped like the consumer's parse.
- Alternative scoring (alt2): there are no Story criteria, shared contracts or Epic constraints, so the alternatives were scored against six requirements read from the Story text (req1 to req6).
- Invariant sources (ep3): all three invariants cite c3; the evidence is in s1 bundles 1 and 2.
- The account objects carry Record<string, unknown> beyond state and login, deliberately, because gh's field set differs between versions; this is the one unknown-typed part of the output.
- Review round 1 (2026-10-27) found: the 256 KB check counted code units not bytes (now Buffer.byteLength); the failure kinds are not all distinct (now described as different diagnostics, with unreachable named); the coverage row takes a comma-separated op list (now 'status,hosts', no check change); the family fixtures and sweeps need a hosts case (now in the plan); the fake gh sleeps 5 s, shorter than the 15 s limit, and the byte-boundary tests lacked multibyte cases (now a limit-lowering seam and multibyte cases). The content was changed by hand through the lifecycle service, revision 2, and is not yet re-reviewed.

<!-- insrc:review -->

## Review

### ⚠️ Review `WARN` — design.story (design.story)

**0 do not hold · 2 could not be verified · 7 hold** · template `design-spec` · model `cli-codex:gpt-6.1-sol` · reviewed 2026-10-27T11:18:48.140Z

Only a premise that does not hold blocks approval. One that could not be verified is listed for the reader and does not block.

#### Does not hold (blocks approval)

_None._

#### Could not verify (does not block)

| Check item | Premise | What was tried and what was missing | Action |
| --- | --- | --- | --- |
| coverage-of-intent | The inferred ac1–ac5 cover all upstream requirements for this standalone Story. | Repository searches for the hash and title found the LLD and its artifact record, but no independent originating Story acceptance baseline. The artifact explicitly states: 'The Story record has no acceptance criteria'. The analyzer returned an off-topic, incomplete bundle with empty upstream evidence. [files: .insrc/artifacts/LLD-b135647ed951c0c1-s1.json, docs/standalone/add-json-hosts-form-gh-auth-E20261027b135647e/S001/LLD.md] | Attach the originating Story userValue and establish ac1–ac5 as its acceptance baseline. |
| error-paths | The proposed schema matches output from a gh version supporting auth status --json hosts. | identity.ts supports the proposed consumer-facing map and account fields, but this is parser evidence rather than producer evidence. The design explicitly reports that no supported-gh output was observed and supplies no captured producer fixture. Repository reads and the incomplete analyzer bundle did not establish actual producer compatibility. [files: src/understanding/identity.ts, docs/standalone/add-json-hosts-form-gh-auth-E20261027b135647e/S001/LLD.md] | Provide a sanitized capture from a supporting gh version and validate it against the builder and output schema. |
