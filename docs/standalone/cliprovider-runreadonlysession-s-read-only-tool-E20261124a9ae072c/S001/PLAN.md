<!-- insrc:artifact PLAN-a9ae072ce3b7b794-s1 -->

# Plan: STORY-a9ae072ce3b7b794-s1

## Summary

**Epic:** `cliprovider-runreadonlysession-s-read-only-tool`
**LLD run:** `wf-1795528342766-2zq1rk`
**LLD effective hash:** `11ae9c0b7421...`

Building this amendment means wrapping the one existing codex retry-targetable call in readOnlySessionOnce with a second, bounded attempt: when codex's bootstrap rejects a disable override for one server, that server is dropped from the list and the call is retried exactly once more. The daemon's own judge session, which exercises this exact path, is the acceptance proof that the fix actually restores a working build pipeline on a machine like this one.

## Contents

1. [Epic impact analysis](#1-epic-impact-analysis)
2. [Tasks](#2-tasks)
3. [Test-strategy coverage](#3-test-strategy-coverage)
4. [References](#4-references)

## 1. Epic impact analysis

**Does not apply**.

## 2. Tasks

| # | Task | Size | Status | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t5`** Add a bounded one-retry recovery to readOnlySessionOnce's codex branch when a disabled server is unexcludable | S | — | — | unit: readOnlySessionOnce retries once with the offending server removed from the disable list, and succeeds, when the first attempt throws CodexMcpServerOverrideUnsafeError and the servers list has another, safe server remaining; unit: readOnlySessionOnce retries once with no non-insrc disable overrides at all, and succeeds, when the first attempt's unsafe server was the only non-insrc entry; unit: readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError naming the SECOND server when the retry also fails with a bootstrap-rejection match for a different server -- never more than one retry; unit: readOnlySessionOnce re-throws the original, unmodified error (no retry attempted) when the first attempt's failure does not match the bootstrap-rejection pattern; unit: readOnlySessionOnce's retry uses the recomputed remaining budget, not a fresh one, and still throws ReadOnlySessionTimeoutError if the combined attempts exhaust it; live: codex: a real runReadOnlySession call whose discovered servers include an unexcludable server (this machine's own live registrations) succeeds via the one-time retry, instead of throwing CodexMcpServerOverrideUnsafeError; live: codex: insrc_build_step validate's own judge session (which resolves to codex for the 'build' role tier on this machine) completes successfully end to end, where it previously failed with verdict-session-failed | [[c1]] [[c2]] [[c3]] |

### 2.1 TASK-a9ae072ce3b7b794-s1-t5 — Add a bounded one-retry recovery to readOnlySessionOnce's codex branch when a disabled server is unexcludable

Wrap the existing runCodex call (and its existing CodexMcpServerOverrideUnsafeError catch) in readOnlySessionOnce's codex branch with a bounded retry: on catching CodexMcpServerOverrideUnsafeError(name) from the first attempt, filter name out of the servers list, rebuild codexReadOnlySessionArgs from the filtered list, and call runCodex exactly one more time with the same recomputed remaining budget. A second failure of any kind (including another CodexMcpServerOverrideUnsafeError) re-throws unchanged -- never more than one retry. A non-matching first-attempt failure is unaffected and re-throws immediately as today.

**Acceptance checks:**
- readOnlySessionOnce retries once with the offending server removed, and succeeds, when a safe server remains after filtering
- readOnlySessionOnce retries once with no non-insrc disable overrides at all, and succeeds, when the unsafe server was the only non-insrc entry
- readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError naming the SECOND server when the retry also fails with a bootstrap-rejection match -- never more than one retry
- readOnlySessionOnce re-throws the original, unmodified error (no retry attempted) when the first attempt's failure does not match the bootstrap-rejection pattern
- the retry uses the recomputed remaining budget, not a fresh one, and still throws ReadOnlySessionTimeoutError if combined attempts exhaust it
- insrc_build_step validate's own judge session (which resolves to codex for the 'build' role tier on this machine) completes successfully end to end, where it previously failed with verdict-session-failed

## 3. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| readOnlySessionOnce retries once with the offending server removed from the disable list, and succeeds, when the first attempt throws CodexMcpServerOverrideUnsafeError and the servers list has another, safe server remaining | `t5` |
| readOnlySessionOnce retries once with no non-insrc disable overrides at all, and succeeds, when the first attempt's unsafe server was the only non-insrc entry | `t5` |
| readOnlySessionOnce throws CodexMcpServerOverrideUnsafeError naming the SECOND server when the retry also fails with a bootstrap-rejection match for a different server -- never more than one retry | `t5` |
| readOnlySessionOnce re-throws the original, unmodified error (no retry attempted) when the first attempt's failure does not match the bootstrap-rejection pattern | `t5` |
| readOnlySessionOnce's retry uses the recomputed remaining budget, not a fresh one, and still throws ReadOnlySessionTimeoutError if the combined attempts exhaust it | `t5` |
| codex: a real runReadOnlySession call whose discovered servers include an unexcludable server (this machine's own live registrations) succeeds via the one-time retry, instead of throwing CodexMcpServerOverrideUnsafeError | `t5` |
| codex: insrc_build_step validate's own judge session (which resolves to codex for the 'build' role tier on this machine) completes successfully end to end, where it previously failed with verdict-session-failed | `t5` |

## 4. References

- **[[c1]]** `prior-artifact` `LLD a9ae072ce3b7b794 s1 contractDetails+errorPaths+invariantsToPreserve`
- **[[c2]]** `prior-artifact` `LLD a9ae072ce3b7b794 s1 migration stateBefore validate.ts grounding`
- **[[c3]]** `prior-artifact` `LLD a9ae072ce3b7b794 s1 testStrategy ac4`
