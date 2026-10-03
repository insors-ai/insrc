<!-- insrc:artifact PLAN-1f7ade1a889013da-S001 -->

# Plan: E202610031f7ade1a:S001

## Summary

**Epic:** `both-cli-providers-reject-top-level`
**LLD run:** `wf-1791050481658-ob70yg`
**LLD effective hash:** `11048c72b560...`

Ten small tasks across two source files plus one new test file — the work is narrow, and almost all the care goes into proving it rather than writing it. The shape: add a pure root-key predicate next to the module's existing `isObject` helper, unit-prove it in isolation, then wire it as the first statement of `CliProvider.completeStructured` so the throw lands outside the retry wrapper, and finally delete the dead helper the ISSUE was filed about. The ordering is deliberate and load-bearing — the predicate is proven before it is wired so a later failure is unambiguously about placement, and the falsifying mutation is its own task with its own recorded red run, because this repo has shipped vacuous tests three times by folding that step into the test-writing task. Nothing is added to the billed, gated live suite: the guard rejects before any subprocess is spawned, so the hermetic sweep can prove it completely.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Re-verify the deletion precondition | S | — | smoke: reference-search gate: `normaliseSchemaForAnthropic` resolves to exactly one src/ line (its declaration) — a recorded command output, not a code test | [[c1]] [[c6]] |
| 2 | **`t2`** Add the `rootUnionKey` predicate | S | `t1` | smoke: `tsc --noEmit` clean and the pre-existing suite unchanged — the predicate is additive and uncalled at this point | [[c2]] [[c7]] |
| 3 | **`t3`** Unit-prove the predicate in isolation, before any wiring | M | `t2` | unit: rootUnionKey: root oneOf -> 'oneOf', root anyOf -> 'anyOf', root allOf -> 'allOf' (all three refused by both vendors); unit: rootUnionKey: a union NESTED under a property returns undefined — the root-only positive control that rules out a tree walk; unit: rootUnionKey: root `type:'object'` alongside a root union still returns the keyword — the row that proves the deleted helper's premise was not inherited; unit: rootUnionKey: an empty-branch root union returns undefined — degenerate, deliberately not claimed; unit: rootUnionKey: a root `$ref` into `$defs` at a union returns undefined — the known gap, pinned as documented behaviour; unit: rootUnionKey TOTALITY: null, undefined, 42, 'str', [] each return undefined without throwing; unit: rootUnionKey PURITY: the input deep-equals a pre-call structural clone — no mutation, unlike processInPlace; unit: rootUnionKey against the real in-repo DOCGEN_OUTCOME_SCHEMA returns 'oneOf' | [[c7]] [[c8]] |
| 4 | **`t4`** Export `isTransientCliError` | S | — | smoke: `isTransientCliError` is importable from cli-provider.js and its regex behaviour is byte-unchanged on a known transient string | [[c4]] [[c9]] |
| 5 | **`t5`** Wire the guard into `completeStructured`, outside the retry wrapper | S | `t3` | smoke: placement check by reading the source: the `rootUnionKey` call is the first statement of `completeStructured` and textually precedes the `withTransientRetry` invocation; unit: the guard's message string contains none of the isTransientCliError vocabulary tokens — asserted against the exported predicate, not by eye | [[c2]] [[c3]] [[c4]] [[c5]] |
| 6 | **`t6`** Assert the guard on the real provider path, both vendors | M | `t5`, `t4` | integration: GUARD FIRES, claude kind: impossible binPath + root-union schema rejects naming the keyword, both vendor flags, and the envelope remedy; integration: GUARD FIRES, codex kind: the identical rejection, proving one guard site covers both vendors; integration: the guard message conveys the local-ajv-validates-but-provider-refuses asymmetry; integration: no subprocess reached: the set of `codex-schema-*` tmpdir entries is identical before and after the rejected call (set difference, not an existence check); integration: NEGATIVE CONTROL: a plain `{type:'object'}` schema on the same impossible-binPath provider fails WITHOUT the guard's wording; integration: NON-RETRYABILITY, direct: isTransientCliError(<the guard's actual message>) === false; integration: NON-RETRYABILITY, structural: the rejection returns in < 1500ms, below the 2s+4s backoff three retries would cost | [[c2]] [[c3]] [[c9]] [[c10]] |
| 7 | **`t7`** Run the falsifying mutation and confirm it RED | S | `t6` | smoke: mutation run, guard line removed: the t6 assertions go RED with a spawn/ENOENT-class message sharing no token with the guard message — the actual output recorded; smoke: restoration run, guard line replaced: the t6 assertions go GREEN again — the actual output recorded | [[c8]] |
| 8 | **`t8`** Delete `normaliseSchemaForAnthropic` and fix the orphaned comment | S | `t1`, `t7` | smoke: pre-deletion re-run of the reference search still returns exactly one line — recorded, not inherited from t1; smoke: post-deletion read of the file region confirms the 'Phases B.1-B.5' block now sits directly above notImplementedStructuredOutput; smoke: `tsc --noEmit` clean after removal, and notImplementedStructuredOutput + processSchemaForOpenAIStrict both still present and unmodified | [[c1]] [[c5]] |
| 9 | **`t9`** Pin the deletion against regression | S | `t8` | unit: namespace assertion: 'normaliseSchemaForAnthropic' is absent from the structured-output module namespace (the LLD's contract-level check, expressed at the unit level since `contract` is not a plan test level); smoke: falsification + verified restoration: re-add the helper and confirm the namespace assertion goes RED, then remove it and re-run BOTH the reference search and the assertion, recording both outputs | [[c1]] [[c8]] |
| 10 | **`t10`** Run the hermetic sweep and READ the test count | S | `t9` | smoke: full hermetic sweep on Node 22 with INSRC_LIVE_TESTS unset: pass/fail/skip counts recorded from real output; smoke: the new file's reported test count is non-zero with zero skips — the count READ, not assumed from a green sweep; smoke: src/docgen/__tests__/schema.test.ts green and unmodified; local-agents-structured.live.test.ts unmodified and no row added to the gated set | [[c7]] [[c8]] |

### 1.1 E202610031f7ade1a:S001:T001 — Re-verify the deletion precondition

Run a repo-wide reference search for `normaliseSchemaForAnthropic` and confirm it is still zero-caller. A read-only go/no-go gate for the whole Story, not an edit. If any reference now exists, STOP and re-decide: a live caller turns 'delete dead code' into 'fix a live bug', which is a different judgement than this ISSUE authorises. Re-verified at plan time (1 hit, the declaration itself), but the build must re-run it rather than inherit that result. Per the s3 critique this check is ALSO re-run inside t8, because a gate eight tasks upstream of the action it protects is itself inherited rather than current.

**Acceptance checks:**
- A repo-wide search over src/ for `normaliseSchemaForAnthropic` returns exactly one line: its own declaration at structured-output.ts:341.
- The actual search output is recorded in the BUILD record, so the precondition is evidenced rather than asserted.
- If the count is anything other than one, the task halts and raises rather than proceeding.

### 1.2 E202610031f7ade1a:S001:T002 — Add the `rootUnionKey` predicate

Add a new exported pure predicate to structured-output.ts returning `'oneOf' | 'anyOf' | 'allOf' | undefined`, placed immediately after the existing module-private `isObject` helper (:310) and before the stub-error section (:317). Reuse `isObject` for the totality guard rather than hand-writing an object check that could drift from the module's own notion of an object. Reads ONLY the schema's own root keys — no tree walk, no `$ref` resolution. Purely additive: nothing calls it yet, so the tree's behaviour is unchanged after this task.

**Acceptance checks:**
- Returns the keyword for a root `oneOf`, `anyOf`, or `allOf` carried as a non-empty array — all three, since both vendors refuse all three at the top level.
- Returns the keyword even when a root `type: 'object'` is also present: a root `type` grants NO exemption (probe-confirmed verbatim on both binaries).
- Returns `undefined` for a union nested below the root, for an empty-branch root union, for a root `$ref` into `$defs`, and for null/undefined/number/string/array input — without throwing on any of them.
- Does not mutate or clone the input schema, unlike `processSchemaForOpenAIStrict` which mutates in place via `processInPlace`.
- `tsc --noEmit` is clean and the existing suite is unaffected, since nothing calls it yet.

### 1.3 E202610031f7ade1a:S001:T003 — Unit-prove the predicate in isolation, before any wiring

Create the new hermetic file src/agent/providers/__tests__/structured-output-root-union.test.ts — deliberately NOT a `.live.test.ts`, since that suffix is this repo's marker for the gated billed suites — and drive the predicate's full truth table as a data-driven table. This must land BEFORE t5 wires the guard, so that any later integration failure is unambiguously about placement rather than about the check itself. Import DOCGEN_OUTCOME_SCHEMA so at least one row is grounded in a schema the repo actually wrote rather than only in hand-made fixtures.

**Acceptance checks:**
- The three positive rows (root oneOf / anyOf / allOf) pass, including the root-`type`-present-with-union row that contradicts the deleted helper's premise.
- The negative rows pass: nested union, empty-branch union, root `$ref`, and the five non-object inputs.
- A purity row deep-equals the input against a pre-call structural clone.
- A row uses the real in-repo DOCGEN_OUTCOME_SCHEMA.
- The file runs with INSRC_LIVE_TESTS UNSET and reports a non-zero test count — no row is skipped.

### 1.4 E202610031f7ade1a:S001:T004 — Export `isTransientCliError`

Widen `isTransientCliError` (cli-provider.ts:409) from module-private to exported. One keyword, but kept as its own task because it widens a module surface for testability and a reviewer should see that as a deliberate line item rather than discover it inside a behavioural change. Without it the non-retryability claim can only be asserted by wall-clock timing, which is a weak proof on a loaded machine. Per the s3 critique: this task's `order` is FREE — it has no prerequisites and may be done at any point before t6, which is the first task that consumes the export.

**Acceptance checks:**
- `isTransientCliError` is exported; its body and regex are unchanged.
- `tsc --noEmit` is clean and no existing behaviour changes — the only effect is that the symbol becomes importable.

### 1.5 E202610031f7ade1a:S001:T005 — Wire the guard into `completeStructured`, outside the retry wrapper

Call `rootUnionKey` as the first statement of `CliProvider.completeStructured` (cli-provider.ts:175) and throw a deterministic `Error` on a hit. Placement is load-bearing: it MUST be in `completeStructured`, OUTSIDE `withTransientRetry` — NOT in `completeStructuredOnce` (:183). Inside the wrapper, retryability would depend on whether the message happened to brush the `isTransientCliError` regex. This is the only task that changes runtime behaviour.

**Acceptance checks:**
- The guard is the first statement of `completeStructured`, textually outside the `withTransientRetry` call.
- A plain `Error` is thrown — no new error class and no taxonomy (a named class is a recorded follow-up, triggered only by a caller needing to branch programmatically).
- The message contains the keyword `rootUnionKey` returned, both vendor flag names, and the envelope remedy.
- ADDED PER CRITIQUE: the message makes clear the constraint is about what a CLI PROVIDER WILL ACCEPT, not about the schema's validity — so a reader who just watched the same schema pass `validateAgainstSchema` locally is not left guessing why it is refused here. The LLD names this asymmetry as the one genuinely confusing consequence of the change and requires the message to state it.
- The message contains NONE of the `isTransientCliError` vocabulary tokens (`api error`, `timeout`, `overloaded`, `rate limit`, `too many requests`, `internal server error`, `service unavailable`, 429/500/502/503/504/529).
- The success path is untouched: the schema still reaches the vendor byte-identical, with no normalisation, cloning, or rewriting added.

### 1.6 E202610031f7ade1a:S001:T006 — Assert the guard on the real provider path, both vendors

REORDERED PER CRITIQUE — this now precedes the falsifying mutation, which had depended on an assertion that did not yet exist. Add the integration assertions to the new hermetic file, driving the REAL `CliProvider.completeStructured` with `binPath` pointed at an impossible absolute path — no stubbing and no spawn interception needed, because `CliProviderOpts.binPath` is injectable (cli-provider.ts:80) and the constructor honours it (:104, `opts.binPath ?? opts.kind`). Critically it must NOT be the bare name 'claude'/'codex', since `resolveBin` would then find the user's real installed binary and the negative control would make a billed call. This task's completion is 'the assertions are written and pass' — it does NOT claim the assertions are proven non-vacuous; t7 owns that.

**Acceptance checks:**
- GUARD FIRES for kind:'claude' with a root-union schema — rejects with a message naming the keyword, both vendor flags, and the remedy.
- GUARD FIRES identically for kind:'codex', proving one guard site covers both vendors rather than assuming it.
- ADDED PER CRITIQUE: the message is asserted to convey the local-validation-versus-provider-request asymmetry, so t5's new check is verified rather than merely intended.
- REWORKED PER CRITIQUE: the no-subprocess evidence is a SET DIFFERENCE, not an existence check — snapshot the `codex-schema-*` entries in tmpdir immediately before the call and again after, and assert the two sets are equal. An existence check would pass or fail on leftover directories from other runs, and this repo demonstrably accumulates them (1580 stale insrc-* fixture dirs). If the set-difference proves awkward, DROP the check rather than keep a flaky one — the guard-fires and negative-control assertions already carry the load.
- NEGATIVE CONTROL, a first-class assertion rather than a clause inside a positive one: a plain `{ type:'object' }` schema against the SAME impossible-binPath provider fails with something that does NOT contain the guard's wording. A guard that rejected everything would satisfy every positive assertion above and fail only this one.
- NON-RETRYABILITY asserted two ways: `isTransientCliError(<the guard's actual message>) === false`, AND the rejection arrives in under 1500ms (below the 2s+4s backoff three retries would cost). The direct assertion is the one that survives a refactor; the timing bound must not be the only proof.
- binPath is an impossible ABSOLUTE path in every case — verified by inspection, since a bare kind name would reach the user's real binary and bill a call.

### 1.7 E202610031f7ade1a:S001:T007 — Run the falsifying mutation and confirm it RED

REORDERED PER CRITIQUE — now depends on t6, the assertions it mutates against, rather than on t5. Delete the t5 guard line and confirm the t6 integration assertions then FAIL with a spawn/path error that shares no token with the expected guard message. Kept as its own task with its own observable output, not a line inside the test-writing task: this repo has shipped vacuous tests three times by treating it as the latter, and a guard test that also passes against the pre-guard code proves nothing. Restore the guard line afterwards and re-confirm green. This task owns the 'proven non-vacuous' acceptance for t6.

**Acceptance checks:**
- With the guard line removed, the t6 assertions FAIL, and the BUILD record carries the actual failing output rather than a claim that it failed.
- The failure is a spawn/ENOENT-class error, demonstrably different in content from the guard message — not merely a different line number or a different assertion count.
- The guard line is restored and the assertions pass again; BOTH the red run and the green run are recorded.
- No number is written into the BUILD record or a commit message that was not read off an actual run.

### 1.8 E202610031f7ade1a:S001:T008 — Delete `normaliseSchemaForAnthropic` and fix the orphaned comment

Remove the helper and its doc comment. Then READ the resulting region to CONFIRM the 'Phases B.1-B.5 land per-provider implementations' block (:320) now sits directly above `notImplementedStructuredOutput` (:359) — verify it rather than assume the deletion fixed the mis-attachment as a side effect. Leave `notImplementedStructuredOutput` in place: it is also zero-caller, but it is a deliberate stub contract, not a false claim that a broken case is handled. `processSchemaForOpenAIStrict` is likewise untouched — its missing production caller is a separate backlog item, and this Story must not be read as wiring the OpenAI-strict path.

**Acceptance checks:**
- ADDED PER CRITIQUE: the t1 reference search is RE-RUN inside this task, immediately before the deletion, and still returns exactly one line. t1's result is eight tasks old by now and must not be inherited.
- The function and its doc comment are gone; `tsc --noEmit` is clean.
- The 'Phases B.1-B.5' comment block is verified BY READING the file region to sit directly above `notImplementedStructuredOutput`, and that verification is recorded.
- `notImplementedStructuredOutput` and `processSchemaForOpenAIStrict` are both still present and unmodified.
- No shim, re-export, or deprecated alias is left behind — a shim would preserve the false signal that is the whole defect.

### 1.9 E202610031f7ade1a:S001:T009 — Pin the deletion against regression

Add a contract-level assertion that the structured-output module namespace no longer exports `normaliseSchemaForAnthropic`, via a namespace import and an `in` check. Not a tautology: it fails if the helper is ever re-added, which is the realistic way a false safety signal returns. Deliberately does NOT add a matching assertion that `notImplementedStructuredOutput` still exists — pinning an unused export with a test would be exactly the green-but-meaningless check this Story is cleaning up after.

**Acceptance checks:**
- The assertion passes after t8.
- The assertion is FALSIFIED: temporarily re-add the helper, confirm the assertion goes red, then remove it again.
- REWORKED PER CRITIQUE: the restoration is VERIFIED, not trusted — after removing the re-added helper, re-run both the t1 reference search and this namespace assertion, and record both outputs. Re-adding a just-deleted function mid-build risks leaving it behind on an interruption, which would silently restore the exact false safety signal this Story exists to delete.
- No assertion is added for `notImplementedStructuredOutput`'s continued existence.

### 1.10 E202610031f7ade1a:S001:T010 — Run the hermetic sweep and READ the test count

Run the full suite under Node 22 (`PATH=/opt/homebrew/opt/node@22/bin:$PATH`) with INSRC_LIVE_TESTS UNSET, and read the new file's reported test count rather than just the pass/fail line. A guard test that is written but silently SKIPPED reproduces exactly the 'green suite over an unverified claim' failure this Story exists to remove, and a passing sweep does not by itself rule it out. Note `tsc --noEmit` excludes `**/__tests__/**`, so a clean tsc proves nothing about the new tests — only running them does. Also confirm docgen's own schema suite is still green unchanged — the cheapest proof the guard was not scoped too broadly.

**Acceptance checks:**
- The full sweep runs on Node 22 with INSRC_LIVE_TESTS unset; pass/fail/skip counts are recorded from the actual output.
- The new test file's count is non-zero and NONE of its tests are reported as skipped.
- src/docgen/__tests__/schema.test.ts is green and unmodified.
- No test was added to the INSRC_LIVE_TESTS-gated set, and local-agents-structured.live.test.ts is unmodified.
- Every count in the BUILD record is read off real output — none typed from expectation.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| A root `oneOf` returns 'oneOf'; a root `anyOf` returns 'anyOf'; a root `allOf` returns 'allOf' — all three are refused at the top level by BOTH vendors, verbatim-confirmed by probe. | `t3` |
| POSITIVE CONTROL, the most important row: a root `type:'object'` with a union nested under a property returns undefined — a nested union must NOT be reported. Over-rejection breaks working callers; this row is what distinguishes the intended root-only check from a tree walk. | `t3` |
| A root carrying BOTH `type:'object'` and a union still returns the keyword — a root `type` must NOT suppress the guard. This row directly contradicts normaliseSchemaForAnthropic's early `'type' in root` return, so it is the row that proves the new guard did not inherit the deleted helper's disproved assumption. | `t3` |
| An empty-branch root union returns undefined — degenerate, deliberately not claimed. | `t3` |
| A root `$ref` into `$defs` at a union returns undefined — the KNOWN $ref gap, asserted as the documented behaviour so it is a recorded decision rather than an accident a later reader must re-derive. | `t3` |
| TOTALITY: null, undefined, 42, 'str', and [] each return undefined without throwing. | `t3` |
| PURITY: deep-equal the input schema against a pre-call structural clone — rootUnionKey must not mutate, unlike processSchemaForOpenAIStrict which mutates in place via processInPlace. | `t3` |
| GUARD FIRES: a claude-kind provider with an impossible binPath, called with a root-union schema, rejects with a message naming the keyword, BOTH vendor flags, and the envelope remedy. FALSIFYING MUTATION, to be run and confirmed red before the test is accepted: delete the guard line. The call then reaches runSubprocess and rejects with a spawn/ENOENT error instead — a message that shares no token with the expected one. The assertion is therefore not satisfiable by the pre-fix code, which is exactly the property my past vacuous checks lacked. | `t6`, `t7` |
| SAME FOR CODEX: identical assertion with kind:'codex'. The guard sits upstream of the kind branch, so one guard must cover both; running it per-kind is what proves that rather than assuming it. Under the pre-fix code this path would additionally have written a real tmpfile before failing — so the test also asserts no 'codex-schema-' tmpdir was created, which is a second, independent signal that the spawn path was never entered. | `t6` |
| NO OVER-REJECTION (the negative control): the same impossible-binPath provider called with a plain object schema must reject with something that does NOT contain the guard's wording. This is the control that keeps the positive tests honest — a guard that rejected everything would pass every assertion above and fail only this one. | `t6` |
| NON-RETRYABILITY, asserted two ways. (1) Structural: the rejection arrives in well under the 2s+4s backoff withTransientRetry would impose, so a wall-clock bound (< 1500ms) distinguishes 'threw once' from 'retried three times'. (2) Direct: assert isTransientCliError(<the guard's actual message>) === false. The second assertion is the one that survives a refactor — if someone later moves the guard inside the wrapper, the message is still proven non-transient, so a deterministic schema defect cannot silently become three billed vendor invocations. Note the first assertion must not be the only one: a timing bound is a weak proof on a loaded machine. | `t6`, `t4` |
| A static assertion that the structured-output module namespace no longer exports `normaliseSchemaForAnthropic`, via a namespace import and an `in` check. This is a genuine regression guard rather than a tautology: it fails if the helper is ever re-added, which is the realistic way a false safety signal returns. | `t9` |
| A deliberate NON-test, recorded so its absence is a decision: there is NO test asserting `notImplementedStructuredOutput` still exists. It is left in place as a stub contract, and pinning an unused export with a test would be exactly the kind of green-but-meaningless check this Story is cleaning up after. | `t9`, `t8` |
| No new gated test. The existing src/agent/providers/__tests__/local-agents-structured.live.test.ts stays exactly as it is — it is gated on INSRC_LIVE_TESTS=1 plus which claude/which codex and spawns the real billed binaries, and this Story adds no row to it. The vendor rejection it once probed was established in the prior session and is now encoded as the guard's premise; re-probing it on every live run would spend billed calls to re-learn a settled fact. | `t10` |
| This is what makes the ISSUE's 'assert the guard without a billed live call' invariant structurally true rather than aspirational: the guard rejects BEFORE the spawn, so there is no binary for a test to need. The hermetic suite can prove the guard completely because the guard's whole job happens before any vendor is involved. | `t10`, `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD S001 — contractDetails.api[2]: the normaliseSchemaForAnthropic REMOVAL` — "Deleted along with its doc comment. Its stated algorithm — inject `type: 'object'` at the root of an all-object-branch union — does not satisfy either vendor, so there is no behaviour to preserve and "
- **[[c2]]** `prior-artifact` `LLD S001 — contractDetails.api[0]: the rootUnionKey predicate contract` — "export function rootUnionKey(schema: StructuredSchema): 'oneOf' | 'anyOf' | 'allOf' | undefined"
- **[[c3]]** `prior-artifact` `LLD S001 — contractDetails.api[1]: CliProvider.completeStructured guard placement` — "The guard is placed in `completeStructured` (cli-provider.ts:175), OUTSIDE `withTransientRetry`, NOT inside `completeStructuredOnce` (:183) as the alternative first sketched."
- **[[c4]]** `prior-artifact` `LLD S001 — contractDetails.api[3]: the isTransientCliError export widening` — "Without this export the non-retryability claim could only be asserted by wall-clock timing, which is a weak proof on a loaded machine."
- **[[c5]]** `prior-artifact` `LLD S001 — dataModelChanges[0]: the StructuredSchema invariant-change and the local-versus-provider asymmetry` — "The asymmetry is deliberate and must be stated in the guard's message, because a schema that validates locally but cannot be REQUESTED from a CLI provider is otherwise a confusing distinction."
- **[[c6]]** `prior-artifact` `LLD S001 — errorPaths.errorCases[2]: the helper may have acquired a caller since design` — "A repo-wide reference search re-run at build time, not a reading of this document. s1's zero-reference finding is a point-in-time fact about the tree at design time and must not be trusted as a build-"
- **[[c7]]** `prior-artifact` `LLD S001 — errorPaths.edgeCases: the seven root-shape rows including the probe-confirmed root-allOf-with-root-type case` — "`rootUnionKey` returns 'allOf' and the call is REJECTED. PROBE-CONFIRMED against both binaries."
- **[[c8]]** `prior-artifact` `LLD S001 — testStrategy: the falsifying-mutation requirement and the hermetic-sweep discipline` — "FALSIFYING MUTATION, to be run and confirmed red before the test is accepted: delete the guard line. The assertion is therefore not satisfiable by the pre-fix code, which is exactly the property my pa"
- **[[c9]]** `prior-artifact` `LLD S001 — testStrategy.testLevels[1].fixturesNeeded: the injectable binPath mechanism and the module-private isTransientCliError` — "binPath is set to a path under an impossible directory so the test cannot accidentally find a real binary on PATH — critically, it must NOT be the bare name 'claude'/'codex', since resolveBin would th"
- **[[c10]]** `prior-artifact` `LLD S001 — migration.migrationSteps[6]: the negative control plus the two non-retryability assertions` — "The negative control is what keeps every positive assertion honest: a guard that rejected everything would satisfy all of them and fail only this."
