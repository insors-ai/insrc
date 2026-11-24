<!-- insrc:artifact LLD-a9ae072ce3b7b794-s1 -->

# LLD: STORY-a9ae072ce3b7b794-s1 — Amend this Story's approved LLD: readOnlySessionOnce's codex branch must recover from an unexcludable companion server's bootstrap rejection by retrying once without it, since the current fail-closed behavior breaks the daemon's own internal judge session on any machine with such a server registered.

## Summary

**Epic:** `cliprovider-runreadonlysession-s-read-only-tool`
**HLD base run:** `wf-1795528342766-2zq1rk`
**HLD effective hash:** `11ae9c0b7421...`

This amendment fixes a regression this Story's own earlier Tasks (t3/t4) introduced: the per-server disable mechanism now breaks codex as a usable provider on any machine where an unexcludable companion server is globally registered, including the daemon's own internal judge session used by every insrc_build_step validate call. readOnlySessionOnce's codex branch now catches CodexMcpServerOverrideUnsafeError, drops the named server from the disable list, and retries once -- so a session still completes instead of failing outright, at the cost of leaving that one already-unexcludable server's tools reachable in that one retry.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [HLD context](#2-hld-context)
3. [Contract details](#3-contract-details)
4. [Error paths](#4-error-paths)
5. [Test strategy](#5-test-strategy)
6. [Migration](#6-migration)
7. [Alternatives considered](#7-alternatives-considered)
8. [References](#8-references)

## 1. Epic impact analysis

**Does not apply**.

## 2. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 3. Contract details

**Surface level:** internal

### 3.1 `readOnlySessionOnce (private, codex branch -- modifies the existing flow at src/agent/providers/cli-provider.ts:749-767)`

```typescript
private async readOnlySessionOnce<T>(prompt: string, schema: StructuredSchema, exec: ExecOverride & { cwd: string; timeoutMs: number; watchStall: boolean }): Promise<T>
```

**Parameters:**
- `prompt: string` — the task prompt
- `schema: StructuredSchema` — the output schema
- `exec: ExecOverride & { cwd: string; timeoutMs: number; watchStall: boolean }` — per-call overrides including the required cwd and the remaining deadline budget

**Returns:** `Promise<T>` — the parsed, schema-checked structured reply

**Errors:**
- `CodexMcpServerOverrideUnsafeError` when NEW behavior -- thrown only when the FIRST retry (with the originally-offending server removed from the disable list) ALSO fails with an unsafe-override match (a second unexcludable server)
- `Error (unchanged)` when any failure that does not match the bootstrap-rejection pattern, on either attempt, re-throws unchanged

**Preconditions:**
- this.kind === 'codex' branch

**Postconditions:**
- on catching CodexMcpServerOverrideUnsafeError(name) from the first runCodex attempt, the servers list is filtered to drop the entry named name, codexReadOnlySessionArgs is rebuilt from the filtered list, and runCodex is called exactly ONE more time with the same recomputed remaining budget
- a second failure of any kind re-throws as today -- never more than one retry
- a session that succeeds on the retry returns normally, exactly as a session that never hit this path

## 4. Error paths

**Error cases**

- **The first runCodex attempt fails and its message matches the bootstrap-rejection pattern naming server X; X is the ONLY other non-insrc server in the discovered list (or removing it leaves at least one safe server).** (recoverable)
  - Detection: The existing CODEX_MCP_SERVER_OVERRIDE_UNSAFE regex match on the first attempt's error message/said field.
  - Response: Filter X out of the servers list, rebuild codexReadOnlySessionArgs from the filtered list, call runCodex exactly once more with the same recomputed remaining budget.
  - User impact: The session completes successfully instead of failing outright; X's tools remain reachable for this one session (X was never going to be excludable anyway, per the live-confirmed finding this amendment responds to).
- **The retry (with X removed) ALSO fails with a bootstrap-rejection match, naming a second unexcludable server Y.** (recoverable)
  - Detection: The same regex match fires again on the retry's own failure.
  - Response: Re-throw CodexMcpServerOverrideUnsafeError(Y) immediately -- no second retry, no unbounded loop.
  - User impact: The session fails with a clear, named error identifying the second unexcludable server; the caller sees exactly one retry attempt was made.
- **The first attempt fails with a bootstrap-rejection match naming X, but X was the ONLY entry in the servers list needing a disable override.** (recoverable)
  - Detection: After filtering X out, the resulting servers list has no entries needing a disable override (every remaining entry is insrc, or the list is otherwise already override-free).
  - Response: Retry anyway with the filtered (override-free for non-insrc) argv -- codexReadOnlySessionArgs simply emits no disable overrides, which is valid input, not a special case.
  - User impact: The session completes with no other server excluded at all for this one call; no new error path needed since codexReadOnlySessionArgs already handles an all-insrc servers list today.
- **The first attempt fails for a reason that does NOT match the bootstrap-rejection pattern (the existing unchanged non-matching path).** (recoverable)
  - Detection: The regex does not match the first attempt's error message/said field.
  - Response: Re-throw the original error unchanged -- exactly as today; no retry is attempted for a non-bootstrap-rejection failure.
  - User impact: No behavior change for any failure this amendment does not target.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Both the first attempt's unsafe server X and the retry both consume meaningful time against the remaining budget. | The retry uses whatever budget remains after the first attempt (the same recomputed-remaining-budget pattern t4 already established) -- a ReadOnlySessionTimeoutError is still possible if the combined time exceeds the deadline, and that is not a new error path, just the existing timeout check applied to a now-two-attempt flow. |
| The discovered servers list has exactly one non-insrc entry and it is unsafe. | Covered by error case 3 above: the retry runs with an override-free (for non-insrc) argv and succeeds, since codex's own bootstrap only crashes on a DISABLE override for that server, not on its mere presence with no override at all. |

**Invariants to preserve**

- readOnlySessionOnce's existing ordering (walkProjectMcpConfigLayers, schema temp file, discoverCodexMcpServers, budget recompute, codexReadOnlySessionArgs, runCodex, reply parsing) and its claude/vibe branches stay unaffected -- this amendment adds ONLY a bounded one-time retry around the existing runCodex call, with no reordering of any other step. [[c1]]
- A failure that does not match the bootstrap-rejection pattern, on either the first attempt or the retry, re-throws unchanged -- the amendment never changes behavior for a caller whose failure this mechanism does not target. [[c1]]

## 5. Test strategy

**Test framework:** `node:test (npx tsx --test), matching this repo's existing cli-provider/cli-readonly-session test suites`

**Test levels**

- **unit** — verify the bounded one-retry recovery against a fake codex binary, without spawning the real codex binary
  - Subjects: `readOnlySessionOnce retries once with the offending server removed from the disable list, and succeeds, when the first attempt throws CodexMcpServerOverrideUnsafeError and the servers list has another, safe server remaining`, `readOnlySessionOnce retries once with no non-insrc disable overrides at all, and succeeds, when the first attempt's unsafe server was the only non-insrc entry`, `readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError naming the SECOND server when the retry also fails with a bootstrap-rejection match for a different server -- never more than one retry`, `readOnlySessionOnce re-throws the original, unmodified error (no retry attempted) when the first attempt's failure does not match the bootstrap-rejection pattern`, `readOnlySessionOnce's retry uses the recomputed remaining budget, not a fresh one, and still throws ReadOnlySessionTimeoutError if the combined attempts exhaust it`
  - Fixtures: `the existing scripted fake-codex harness in cli-readonly-session.test.ts, extended to script a FIRST attempt failing with the bootstrap-rejection wording and a SECOND (retry) attempt either succeeding or also failing`
- **live** — prove, against the real installed codex binary and this machine's own real MCP server registrations (gated INSRC_LIVE_TESTS=1), that a real session recovers from the unexcludable-server crash instead of failing outright
  - Subjects: `codex: a real runReadOnlySession call whose discovered servers include an unexcludable server (this machine's own live registrations) succeeds via the one-time retry, instead of throwing CodexMcpServerOverrideUnsafeError`, `codex: insrc_build_step validate's own judge session (which resolves to codex for the 'build' role tier on this machine) completes successfully end to end, where it previously failed with verdict-session-failed`
  - Fixtures: `real codex CLI binary installed and authenticated, gated by INSRC_LIVE_TESTS=1`, `this environment's own real unexcludable-server registration (already present, confirmed live this session) to exercise the retry path`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: readOnlySessionOnce retries once with the offending server removed and succeeds, when a safe server remains`, `unit: readOnlySessionOnce retries once with no non-insrc overrides at all and succeeds, when the unsafe server was the only non-insrc entry`, `live: a real session whose discovered servers include an unexcludable server succeeds via the one-time retry` |
| `ac2` | `unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError naming the second server when the retry also fails -- never more than one retry` |
| `ac3` | `unit: readOnlySessionOnce re-throws the original, unmodified error when the first attempt's failure does not match the bootstrap-rejection pattern`, `unit: the retry uses the recomputed remaining budget and still throws ReadOnlySessionTimeoutError if combined attempts exhaust it` |
| `ac4` | `live: insrc_build_step validate's own judge session, which resolves to codex on this machine, completes successfully end to end where it previously failed with verdict-session-failed` |

## 6. Migration

**State before:** Per s1: readOnlySessionOnce's codex branch (src/agent/providers/cli-provider.ts:749-767) catches a runCodex failure, checks it against CODEX_MCP_SERVER_OVERRIDE_UNSAFE, and on a match throws CodexMcpServerOverrideUnsafeError(name) with no retry and no fallback -- the session always ends in failure. insrc_build_step validate's judge session (src/daemon/steps/build-step/phases/validate.ts:512-532) calls runReadOnlySession exactly once through whatever provider resolveValidateProvider resolves for the 'build' role tier (this repo: cli-codex), with a generic catch that has no special handling for CodexMcpServerOverrideUnsafeError -- it falls through to verdict-session-failed, which is what t4's own validate call hit today.

**State after:** readOnlySessionOnce's codex branch retries exactly once, with the originally-offending server removed from the disable list, when the first attempt throws CodexMcpServerOverrideUnsafeError. A session with one unexcludable server now completes (with that one server's tools reachable for that session) instead of failing outright. A second unexcludable server on the retry, or any non-matching failure, still ends the call exactly as today.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. in readOnlySessionOnce's codex branch, wrap the existing single runCodex call in a bounded retry: on catching CodexMcpServerOverrideUnsafeError(name), filter name out of the servers list, rebuild codexReadOnlySessionArgs from the filtered list, and call runCodex exactly one more time with the recomputed remaining budget — ↩ rollbackable
2. a second failure of any kind (including another CodexMcpServerOverrideUnsafeError) re-throws unchanged -- no second retry — ↩ rollbackable
3. add unit tests covering the retry-succeeds path, the retry-also-fails path, the non-matching-failure path, and the budget/timeout interaction — ↩ rollbackable
4. add live tests proving the real recovery against this environment's own unexcludable-server registration, and confirming insrc_build_step validate's judge session now succeeds end to end — ↩ rollbackable

**Backward compat:** readOnlySessionOnce's public call surface (runReadOnlySession) and its claude/vibe branches are unaffected. Every failure mode that does NOT match the bootstrap-rejection pattern, on either attempt, re-throws exactly as before. A caller that previously saw CodexMcpServerOverrideUnsafeError for a RECOVERABLE case now sees success instead -- a strict improvement.

## 7. Alternatives considered

### 7.1 a1: Retry once with the unsafe server removed from the disable list, inside CliProvider itself — **CHOSEN**

readOnlySessionOnce's codex branch catches CodexMcpServerOverrideUnsafeError, drops that one server from the discovered servers list, and retries codexReadOnlySessionArgs+runCodex once more (bounded: stop and re-throw if a retry also fails, or if removing would leave an empty non-insrc list and it STILL fails).

On catching CodexMcpServerOverrideUnsafeError(name) from the first attempt, filter `servers` to drop the entry matching `name`, rebuild the argv via codexReadOnlySessionArgs with the filtered list, and call runCodex exactly one more time with whatever budget remains. A second failure (whether another CodexMcpServerOverrideUnsafeError for a different server, or any other error) re-throws as today -- no unbounded loop. On success, the session completes with every OTHER server still disabled except the one(s) actually unsafe, which (by definition, per the original ISSUE's own finding) codex itself refuses to let be disabled anyway -- so its tools were never truly excludable in the first place; this changes nothing about THAT server's own exposure, it only stops an unrelated, unexcludable server from blocking the whole session.

### 7.2 a2: Narrow fallback inside the daemon's own judge-session catch only

Leave CliProvider's codex branch fail-closed exactly as ISSUE-08f9dd3412bc10f0 left it; instead teach validate.ts's judge-session catch to recognize CodexMcpServerOverrideUnsafeError and retry the SAME judge call once against a different CLI kind (e.g. claude).

In handleValidate's judge-session catch (validate.ts:524-532), add a branch: if `e instanceof CodexMcpServerOverrideUnsafeError`, construct a fallback provider (e.g. the 'build' tier's claude equivalent, or a fixed claude CliProvider) and retry `runReadOnlySession` once against it before falling through to `verdict-session-failed`.

**Rejected because:** A valid, smaller-footprint fix for the one caller failing right now, but leaves the actual defect unaddressed for every other real caller of CliProvider's codex read-only session path.

### 7.3 a3: Accept the current fail-closed behavior; document the operational requirement instead of changing code

Treat this as an environment/configuration fact, not a code defect: a machine with an unexcludable companion server globally registered must not configure codex as the 'build' role's provider; document this and move on.

No code change to readOnlySessionOnce or validate.ts. Add an operational note (docs/daemon.md or similar) that the 'build' role tier's provider must be claude (or another CLI without this class of unexcludable companion server) on a machine where codex has one registered, and that a misconfigured machine will see every insrc_build_step validate call fail with CodexMcpServerOverrideUnsafeError via verdict-session-failed.

**Rejected because:** Leaves the daemon permanently unable to validate ANY build on this machine with no code-level recovery, and does not let this Story's own build finish here.

## 8. References

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:749-767`
- **[[c2]]** `code` `src/daemon/steps/build-step/phases/validate.ts:512-532`
- **[[c3]]** `code` `src/daemon/steps/build-step/phases/validate.ts:193-210`
