<!-- insrc:artifact LLD-1f7ade1a889013da-S001 -->

# LLD: E202610031f7ade1a:S001

## Summary

**Epic:** `both-cli-providers-reject-top-level`
**HLD base run:** `wf-1791050481658-ob70yg`
**HLD effective hash:** `11048c72b560...`

Both vendor CLIs refuse a JSON schema whose ROOT is a `oneOf`/`anyOf`/`allOf` union — `claude --json-schema` and `codex --output-schema` alike — but nothing in this repo says so. `CliProvider.completeStructuredOnce` hands the caller's schema to each binary verbatim, and the one helper that claims to handle the case, `normaliseSchemaForAnthropic`, has never been called and rests on a disproved algorithm, so it reads as reassurance that the case is covered when it is not. This Story adds a pure root-union predicate, rejects such a schema locally with a named error before any subprocess is spawned, and deletes the dead helper. The guard is asserted entirely in the hermetic sweep — the binaries are never reached, so no billed call is involved. PROBE EVIDENCE (2026-10-03, one deliberate out-of-band design probe; the ISSUE's no-billed-call rule constrains the GUARD'S TEST, not a one-time design probe). Five root shapes were sent through both binaries. Verbatim: (1) root `anyOf`, no root `type` — claude: `400 tools.8.custom.input_schema.type: Field required`; codex: `schema must have a 'type' key`. (2) root `allOf` WITH root `type: 'object'` — claude: `400 input_schema does not support oneOf, allOf, or anyOf at the top level`; codex: `In context=(), 'allOf' is not permitted.` (3) root `oneOf` WITH root `type: 'object'` — claude: the same top-level union error; codex: `schema must have type 'object' and not have 'oneOf'/'anyOf'/'allOf'/'enum'/'not' at the top level. Found 'oneOf'.` (4) root `$ref` into `$defs` at a union — claude: `input_schema.type: Field required`; codex: `schema must be a JSON Schema of 'type: "object"', got 'type: "None"'`. (5) plain object control — ACCEPTED by both. THREE CONCLUSIONS, each now evidenced rather than assumed. First, all three of `oneOf`/`anyOf`/`allOf` are refused at the top level by BOTH vendors, so the three-keyword set is correct. Second, a root `type: 'object'` does NOT exempt a root union — shapes (2) and (3) both carried one and were still refused — which conclusively falsifies `normaliseSchemaForAnthropic`: injecting a root `type` only clears the FIRST error (shape (1)'s missing-`type`) and reveals the union error underneath. Third, a bare root `$ref` fails on both vendors anyway, on the missing-root-`type` rule rather than the union rule, so the detector's `$ref` blind spot cannot hide a schema that would otherwise have worked.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)
10. [Open questions](#10-open-questions)

## 1. HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `rootUnionKey`

```typescript
export function rootUnionKey(schema: StructuredSchema): 'oneOf' | 'anyOf' | 'allOf' | undefined
```

**Parameters:**
- `schema: StructuredSchema` — The caller-declared JSON Schema about to be sent to a provider. Inspected at the ROOT only — nested unions are legal on both vendors and must not be reported. All three of `oneOf`/`anyOf`/`allOf` are in the keyword set, and a root `type: 'object'` does NOT exempt them — both facts are probe-confirmed (see the Probe evidence section). CLASSIFY_SCHEMA (src/workflow/triage/classify.ts:77-90) carries a root `allOf` beside a root `type` and is therefore genuinely un-sendable to either CLI; rejecting it locally is correct, not over-rejection.

**Returns:** `'oneOf' | 'anyOf' | 'allOf' | undefined` — The offending root-level union keyword when the schema root carries one as a non-empty array, else `undefined`. Returning the KEY rather than a boolean lets the caller name the exact keyword in its error, which is the difference between a diagnosable message and a generic one.

**Preconditions:**
- None. Total over any input: a non-object, null, or empty schema yields `undefined` rather than throwing, because a predicate that can itself fail is useless as a guard.

**Postconditions:**
- Pure — does not mutate or clone `schema`. Contrast `processSchemaForOpenAIStrict`, which mutates in place via `processInPlace`; this predicate must not, because it runs on the caller's object on every structured call.
- Inspects only own root keys. A union reached through `$ref`, `$defs`, or any nested position returns `undefined` — see error.paths for why that is deliberate rather than an omission.
- A root union present but empty (`{ anyOf: [] }`) returns `undefined`: it is a degenerate schema whose vendor behaviour was not established, and the guard must not claim a constraint it has not verified.

### 2.2 `CliProvider.completeStructured`

```typescript
async completeStructured<T>(messages: readonly LLMMessage[], schema: StructuredSchema, opts?: CompleteOptions): Promise<T>
```

**Parameters:**
- `messages: readonly LLMMessage[]` — Unchanged by this Story.
- `schema: StructuredSchema` — Now pre-flighted by `rootUnionKey` BEFORE the retry wrapper is entered.
- `opts: CompleteOptions` _(optional)_ — Unchanged by this Story.

**Returns:** `Promise<T>` — Unchanged on the success path. The schema that reaches the vendor is byte-identical to the one passed in — this Story adds no rewriting.

**Errors:**
- `Error (deterministic, non-retryable)` when `rootUnionKey(schema) !== undefined`. Thrown before any subprocess is spawned, so no vendor call is billed and no tmpfile is written.

**Preconditions:**
- The guard is placed in `completeStructured` (cli-provider.ts:175), OUTSIDE `withTransientRetry`, NOT inside `completeStructuredOnce` (:183) as the alternative first sketched. This is the load-bearing placement decision of the Story and the reason is mechanical: `withTransientRetry` (:151) decides retryability by STRING MATCH on the message via `isTransientCliError` (:409), whose pattern includes `/api error|timeout|overloaded|rate.?limit/i`. A guard throw raised inside the wrapper would be re-spawned three times with 2s+4s backoff the moment its message happened to contain any of that vocabulary. Throwing outside the wrapper makes non-retryability structural rather than contingent on error wording.

**Postconditions:**
- On the reject path, `withTransientRetry`, `runSubprocess`, and `resolveBin` are all unreached — observable in a test by pointing `binPath` at an impossible path and checking which error comes back.
- The thrown message must still avoid the `isTransientCliError` vocabulary (`api error`, `timeout`, `overloaded`, `rate limit`, `too many requests`, `internal server error`, `service unavailable`, and the bare tokens 429/500/502/503/504/529) as a defence-in-depth invariant, so that a future refactor moving the guard inside the wrapper does not silently convert a deterministic rejection into three billed retries. Naming the vendor FLAGS (`--json-schema`, `--output-schema`) rather than prose about API errors satisfies this naturally.
- The message names three things: the offending keyword returned by `rootUnionKey`, that BOTH vendor flags refuse it (so the reader does not try the other provider), and the remedy — wrap the union under one object property at the call site.

### 2.3 `normaliseSchemaForAnthropic`

```typescript
// REMOVED — was: export function normaliseSchemaForAnthropic(schema: StructuredSchema): StructuredSchema
```

**Returns:** `n/a` — Deleted along with its doc comment. Its stated algorithm — inject `type: 'object'` at the root of an all-object-branch union — does not satisfy either vendor, so there is no behaviour to preserve and nothing to 'make real'. s1 confirmed zero references in `src/` including tests, so removal needs no caller migration and no deprecation window.

**Preconditions:**
- s1's zero-reference finding must be re-confirmed at build time rather than trusted from this document, since any new caller added between design and build would turn a clean deletion into a compile break.

**Postconditions:**
- The orphaned doc comment is re-attached in the same edit. Today the 'Phases B.1-B.5 land per-provider implementations...' block that documents `notImplementedStructuredOutput` sits ABOVE the normalise helper's own comment, so the file currently reads as though the normalise helper were the not-implemented stub. Deleting the normalise function and its comment without moving the orphan would leave that block correctly adjacent to `notImplementedStructuredOutput` (:359) — the deletion fixes the mis-attachment as a side effect, and the build must verify that rather than assume it.
- `notImplementedStructuredOutput` is LEFT IN PLACE. It is also zero-caller, but it is a deliberate stub contract for providers that have not migrated, not a false claim that a broken case is handled — removing it is a different judgement than the one this ISSUE authorises.

### 2.4 `isTransientCliError`

```typescript
export function isTransientCliError(message: string): boolean   // widened from module-private to exported
```

**Parameters:**
- `message: string` — A CLI failure message. Unchanged behaviour; the export exists so the guard's own message can be asserted non-transient in a hermetic test.

**Returns:** `boolean` — Unchanged — true when the message looks like a transient upstream error worth re-issuing on a fresh subprocess.

**Preconditions:**
- No behavioural change whatsoever. This entry exists only to record the visibility widening as an intentional, reviewed part of the Story rather than an incidental edit.

**Postconditions:**
- Without this export the non-retryability claim could only be asserted by wall-clock timing, which is a weak proof on a loaded machine. With it, a future refactor that relocates the guard inside the retry wrapper gets a red test instead of a silent 6-second-slower failure.

## 3. Data model changes

### 3.1 `StructuredSchema` — invariant-change

The type is unchanged; its ACCEPTED VALUE SPACE narrows for one consumer. Any `StructuredSchema` remains valid to construct and remains valid for `validateAgainstSchema` (which runs ajv locally and handles root unions fine — `DOCGEN_OUTCOME_SCHEMA` is compiled exactly that way at docgen/__tests__/schema.test.ts:22). What narrows is specifically what `CliProvider.completeStructured` accepts: a root-level union is now rejected there. The asymmetry is deliberate and must be stated in the guard's message, because a schema that validates locally but cannot be REQUESTED from a CLI provider is otherwise a confusing distinction. No type-level change means no compile-time enforcement — the constraint is a runtime one by necessity, since a root union is perfectly well-typed.

```
No change to the TypeScript type. Runtime precondition added at one consumer: CliProvider.completeStructured rejects { oneOf | anyOf | allOf: [non-empty] } at the root.
```

**Call sites:**
- `src/agent/providers/cli-provider.ts:175 (completeStructured — guard added here)`
- `src/agent/providers/cli-provider.ts:193 (claude --json-schema serialisation — now unreachable with a root union)`
- `src/agent/providers/cli-provider.ts:206-210 (codex --output-schema tmpfile — now unreachable with a root union)`
- `src/agent/providers/structured-output.ts:80 (validateAgainstSchema — UNAFFECTED, still accepts root unions)`
- `src/docgen/schema.ts:72 (DOCGEN_OUTCOME_SCHEMA — the repo's only root union; ajv-only, never provider-bound, so unaffected)`

## 4. Diagrams

- [Sequence diagram](docs/standalone/both-cli-providers-reject-top-level-E202610031f7ade1a/S001/sequence-diagram.html)

## 5. Error paths

**Error cases**

- **A caller passes a schema whose root is a non-empty `oneOf`, `anyOf`, or `allOf` to `CliProvider.completeStructured`.** (recoverable)
  - Detection: `rootUnionKey(schema)` is called as the first statement of `completeStructured` (cli-provider.ts:175) and reads the three union keywords off the schema's OWN root keys, returning the first one present as a non-empty array. The check is a direct own-key read, not a tree walk, so detection cannot be confused by a nested union.
  - Response: Throw a plain `Error` synchronously-in-promise before `withTransientRetry` is entered. The message names the offending keyword, states that BOTH `claude --json-schema` and `codex --output-schema` refuse a root-level union, and gives the remedy: wrap it under one object property at the call site. Because the throw precedes the retry wrapper, `isTransientCliError` never sees the message and no subprocess is spawned.
  - User impact: The caller gets a message naming the exact schema defect and its fix, instead of today's outcome: an opaque vendor rejection surfacing as a claude envelope error or a codex non-zero exit, potentially after three billed retries if the vendor text happened to match the transient pattern.
- **A future refactor moves the guard INSIDE `withTransientRetry` (for instance by relocating it into `completeStructuredOnce`, which is where the alternative originally sketched it), and the guard message contains transient vocabulary.** (terminal)
  - Detection: Not detectable at runtime — this is the failure mode the design forecloses structurally rather than catches. `isTransientCliError` matches `/connection closed mid-response|api error|overloaded|rate.?limit|too many requests|internal server error|service unavailable|timeout|\b(429|500|502|503|504|529)\b/i` against the message text, so a deterministic rejection whose wording brushes that pattern would be silently re-spawned three times with 2s and 4s backoff.
  - Response: Two independent defences, neither relying on the other. Structural: the guard lives in `completeStructured`, outside the wrapper, so retryability is not a function of wording. Belt-and-braces: a hermetic test asserts `isTransientCliError` returns false for the guard's actual message, so a reviewer of a future relocation gets a red test rather than a silent 6-second-slower failure. The second defence is what makes the first one's rationale enforceable instead of merely documented in this LLD.
  - User impact: If both defences were absent: a deterministic schema defect costs three vendor invocations and ~6s of backoff before failing with the same error anyway.
- **`normaliseSchemaForAnthropic` has acquired a caller between this design and the build, so the planned deletion breaks compilation.** (recoverable)
  - Detection: A repo-wide reference search re-run at build time, not a reading of this document. s1's zero-reference finding is a point-in-time fact about the tree at design time and must not be trusted as a build-time precondition.
  - Response: Stop and re-decide rather than delete. A real caller would mean someone wired the disproved algorithm into a live path, which changes the disposition from 'delete dead code' to 'fix a live bug', and that is a different judgement than this ISSUE authorises.
  - User impact: None if caught; a compile break on the build's own tsc pass if not.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A schema with a root `type: 'object'` and a union nested inside a property, e.g. a `properties.outcome` carrying a `oneOf`. | `rootUnionKey` returns `undefined`; the call proceeds and the schema reaches the vendor unchanged. Nested unions are legal on both vendors — only the ROOT position is refused — so a guard that walked the tree would reject working schemas. This is the single most important negative case: over-rejection here would break real callers, whereas under-rejection only restores today's behaviour. |
| A root `allOf` alongside a root `type: 'object'` — the real in-repo shape of CLASSIFY_SCHEMA (src/workflow/triage/classify.ts:77-90), whose root `allOf` carries an if/then conditional-required ('a `bugfix` classification MUST carry a magnitude'). | `rootUnionKey` returns 'allOf' and the call is REJECTED. PROBE-CONFIRMED against both binaries: claude answers `400 input_schema does not support oneOf, allOf, or anyOf at the top level`, and codex answers `Invalid schema for response_format 'codex_output_schema': In context=(), 'allOf' is not permitted.` — both with a root `type: 'object'` present. So CLASSIFY_SCHEMA genuinely cannot be sent to either CLI today, and a local rejection reports a real constraint rather than over-rejecting. This row exists because the review raised it as a suspected over-rejection; the probe settled it the other way, which is why the guard keeps all three keywords. |
| A degenerate root union with an empty branch array: `{ anyOf: [] }`. | `rootUnionKey` returns `undefined` and the call proceeds. The vendors' behaviour on an empty-branch root union was never established, and the guard must not assert a constraint it has not verified — asserting one would be the same class of unearned confidence the dead helper embodied. The schema will fail downstream on its own merits if it is invalid. |
| A root union reached by indirection: a root `$ref` pointing into `$defs` at a `oneOf`. | `rootUnionKey` returns `undefined` and the call proceeds to the vendor, which may then reject it. This is a KNOWN, deliberate gap, recorded as such rather than quietly omitted: resolving `$ref` correctly means implementing pointer resolution, and whether either vendor even resolves a root `$ref` to a union before refusing it was not tested. Guessing would re-create the dead helper's exact mistake — shipping an untested claim about vendor behaviour. The guard covers the shape that was actually observed to fail. |
| A root carrying BOTH a union keyword and `type: 'object'`. | `rootUnionKey` returns the union keyword and the call is rejected. The presence of a root `type` must NOT suppress the guard — that is precisely the condition `normaliseSchemaForAnthropic` (:341) tested with its early `'type' in root` return, and the prior session established that injecting or finding a root `type` does not make either vendor accept the union. Encoding the dead helper's premise into the new guard would reproduce the defect being removed. |
| A non-object schema value: `null`, `undefined`, a string, or an array. | `rootUnionKey` returns `undefined` without throwing. A guard that can itself throw on malformed input converts a clear downstream error into a confusing one raised from the wrong place. |
| `validateAgainstSchema(DOCGEN_OUTCOME_SCHEMA, value)` — a root-union schema used for LOCAL ajv validation. | Completely unaffected; still compiles and validates. The narrowing applies only to what `CliProvider.completeStructured` will REQUEST from a vendor, never to what the repo may validate locally. docgen's own schema test must stay green unchanged, which is the cheapest available proof that the guard was not placed too broadly. |

**Invariants to preserve**

- The schema reaching the vendor is byte-identical to the schema the caller passed. `completeStructuredOnce` serialises it verbatim — inline for claude, to a tmpfile for codex — and this Story adds no normalisation, cloning, or rewriting on the success path, so a validated payload always matches the schema its caller wrote. [[c2]]
- `withTransientRetry` re-issues ONLY transient upstream failures; deterministic failures are re-thrown on the first attempt. Its own doc comment names 'bad schema' as the example of a deterministic failure, so a root-union rejection must not consume retries — placing the guard outside the wrapper honours an invariant the existing code already states. [[c4]]
- Nested unions remain legal and untouched. The repo's existing schema machinery deliberately recurses THROUGH `anyOf`/`allOf` branches rather than rejecting them, which is direct evidence that unions below the root are a supported shape; the guard must therefore be root-only. [[c8]]
- `validateAgainstSchema` continues to accept root unions. It is the module's most-used export — widely used across analyze/, workflow/, mcp/ and both providers — and runs ajv locally with no vendor involved, so the vendor constraint has no bearing on it. The narrowing is scoped to one consumer, not to the type. [[c6]]
- No production code path sends a root union to a CLI provider today — the repo's only root-level union is ajv-only and never provider-bound. The guard must therefore change no existing behaviour: if any currently-passing call starts failing, the guard is mis-scoped, not the caller. [[c5]]
- The hermetic sweep must stay free of billed calls. The existing structured-output probes are gated on `INSRC_LIVE_TESTS=1` plus `which claude`/`which codex` and spawn the real binaries; the new guard's tests must add nothing to that gated set, which the design makes natural — the guard rejects before the spawn, so there is no binary to reach. [[c7]]
- A helper must not survive as a claim that a broken case is handled. `normaliseSchemaForAnthropic`'s doc comment asserts the root-`type` injection fixes the rejection; that claim is false and the function has never run. Deleting it is what preserves this invariant — renaming or repurposing it while keeping the name would weaken the same guarantee the ISSUE exists to restore. [[c1]]

## 6. Test strategy

**Test framework:** `node:test + node:assert/strict, run via `npx tsx --test` under Node 22 (`PATH=/opt/homebrew/opt/node@22/bin:$PATH`). Matches the idiom s1 located in src/workflow/artifacts/companion/__tests__/metamodel.test.ts and src/docgen/__tests__/schema.test.ts — assert over literal schema objects, no runner config, no mocking framework. NEW FILE: src/agent/providers/__tests__/structured-output-root-union.test.ts (NOT a `.live.test.ts` — the filename itself records that nothing here is gated or billed; s1 found no hermetic test file for structured-output.ts at all, so this creates the first one).`

**Test levels**

- **unit** — Pin `rootUnionKey` as a total, pure, root-only predicate. This is the whole truth-table, written as a data-driven table so a new case is one row rather than one function — and so the ROOT-ONLY and TOTALITY properties are visible as rows rather than buried in prose.
  - Subjects: `A root `oneOf` returns 'oneOf'; a root `anyOf` returns 'anyOf'; a root `allOf` returns 'allOf' — all three are refused at the top level by BOTH vendors, verbatim-confirmed by probe.`, `POSITIVE CONTROL, the most important row: a root `type:'object'` with a union nested under a property returns undefined — a nested union must NOT be reported. Over-rejection breaks working callers; this row is what distinguishes the intended root-only check from a tree walk.`, `A root carrying BOTH `type:'object'` and a union still returns the keyword — a root `type` must NOT suppress the guard. This row directly contradicts normaliseSchemaForAnthropic's early `'type' in root` return, so it is the row that proves the new guard did not inherit the deleted helper's disproved assumption.`, `An empty-branch root union returns undefined — degenerate, deliberately not claimed.`, `A root `$ref` into `$defs` at a union returns undefined — the KNOWN $ref gap, asserted as the documented behaviour so it is a recorded decision rather than an accident a later reader must re-derive.`, `TOTALITY: null, undefined, 42, 'str', and [] each return undefined without throwing.`, `PURITY: deep-equal the input schema against a pre-call structural clone — rootUnionKey must not mutate, unlike processSchemaForOpenAIStrict which mutates in place via processInPlace.`
  - Fixtures: `Inline literal schema objects only — no files, no tmpdirs. DOCGEN_OUTCOME_SCHEMA is imported from src/docgen/schema.ts as the one REAL in-repo root union, so at least one row is grounded in a schema the repo actually wrote rather than only in hand-made fixtures.`
- **integration** — Prove the guard actually fires on the real `CliProvider.completeStructured` path and that no subprocess is reached — the ISSUE's central claim. The mechanism needs no stubbing and no spawn interception: `CliProviderOpts.binPath` is injectable (cli-provider.ts:80), so the provider is pointed at a path that cannot exist. Whether the guard works is then readable off WHICH error comes back.
  - Subjects: `GUARD FIRES: a claude-kind provider with an impossible binPath, called with a root-union schema, rejects with a message naming the keyword, BOTH vendor flags, and the envelope remedy. FALSIFYING MUTATION, to be run and confirmed red before the test is accepted: delete the guard line. The call then reaches runSubprocess and rejects with a spawn/ENOENT error instead — a message that shares no token with the expected one. The assertion is therefore not satisfiable by the pre-fix code, which is exactly the property my past vacuous checks lacked.`, `SAME FOR CODEX: identical assertion with kind:'codex'. The guard sits upstream of the kind branch, so one guard must cover both; running it per-kind is what proves that rather than assuming it. Under the pre-fix code this path would additionally have written a real tmpfile before failing — so the test also asserts no 'codex-schema-' tmpdir was created, which is a second, independent signal that the spawn path was never entered.`, `NO OVER-REJECTION (the negative control): the same impossible-binPath provider called with a plain object schema must reject with something that does NOT contain the guard's wording. This is the control that keeps the positive tests honest — a guard that rejected everything would pass every assertion above and fail only this one.`, `NON-RETRYABILITY, asserted two ways. (1) Structural: the rejection arrives in well under the 2s+4s backoff withTransientRetry would impose, so a wall-clock bound (< 1500ms) distinguishes 'threw once' from 'retried three times'. (2) Direct: assert isTransientCliError(<the guard's actual message>) === false. The second assertion is the one that survives a refactor — if someone later moves the guard inside the wrapper, the message is still proven non-transient, so a deterministic schema defect cannot silently become three billed vendor invocations. Note the first assertion must not be the only one: a timing bound is a weak proof on a loaded machine.`
  - Fixtures: `No fixtures. binPath is set to a path under an impossible directory so the test cannot accidentally find a real binary on PATH — critically, it must NOT be the bare name 'claude'/'codex', since resolveBin would then find the user's real installed binary and the negative control would make a billed call.`, `isTransientCliError is currently module-private (cli-provider.ts:409). Asserting against it directly requires exporting it. That export is part of this Story's change and must be noted in the plan — it is an intentional, minimal widening of the module surface for testability, not an incidental edit.`
- **contract** — Prove the DELETION landed and stays landed — the ISSUE's second invariant, which a behavioural test cannot cover because deleted code has no behaviour to assert.
  - Subjects: `A static assertion that the structured-output module namespace no longer exports `normaliseSchemaForAnthropic`, via a namespace import and an `in` check. This is a genuine regression guard rather than a tautology: it fails if the helper is ever re-added, which is the realistic way a false safety signal returns.`, `A deliberate NON-test, recorded so its absence is a decision: there is NO test asserting `notImplementedStructuredOutput` still exists. It is left in place as a stub contract, and pinning an unused export with a test would be exactly the kind of green-but-meaningless check this Story is cleaning up after.`
- **live** — EXPLICITLY NOTHING ADDED. Recorded as a level so the choice is legible rather than looking like an omission.
  - Subjects: `No new gated test. The existing src/agent/providers/__tests__/local-agents-structured.live.test.ts stays exactly as it is — it is gated on INSRC_LIVE_TESTS=1 plus which claude/which codex and spawns the real billed binaries, and this Story adds no row to it. The vendor rejection it once probed was established in the prior session and is now encoded as the guard's premise; re-probing it on every live run would spend billed calls to re-learn a settled fact.`, `This is what makes the ISSUE's 'assert the guard without a billed live call' invariant structurally true rather than aspirational: the guard rejects BEFORE the spawn, so there is no binary for a test to need. The hermetic suite can prove the guard completely because the guard's whole job happens before any vendor is involved.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: the rootUnionKey truth table — oneOf/anyOf/allOf at the root each return their own keyword`, `integration: GUARD FIRES on kind:'claude' with an impossible binPath, rejecting with a message naming the keyword` |
| `ac2` | `integration: SAME FOR CODEX — the identical rejection for kind:'codex', proving one guard covers both vendors`, `integration: no 'codex-schema-' tmpdir is created on the reject path` |
| `ac3` | `unit: nested-union row returns undefined (no over-rejection)`, `unit: root `type` present alongside a root union still returns the keyword (the deleted helper's premise is not inherited)`, `integration: NO OVER-REJECTION negative control — a plain object schema does not hit the guard`, `unaltered: src/docgen/__tests__/schema.test.ts must stay green, proving a real in-repo root union is still locally validatable` |
| `ac4` | `integration: isTransientCliError(<guard message>) === false`, `integration: the rejection arrives in < 1500ms, below the 2s+4s backoff three retries would cost` |
| `ac5` | `contract: 'normaliseSchemaForAnthropic' is absent from the module namespace`, `the build's own repo-wide reference re-check, re-run rather than read off this LLD` |
| `ac6` | `unit: TOTALITY rows — null/undefined/42/'str'/[] each return undefined without throwing`, `unit: PURITY row — the input schema deep-equals a pre-call clone` |
| `ac7` | `the full hermetic sweep runs with INSRC_LIVE_TESTS unset and the new file's test count is non-zero — i.e. none of the new tests are gated or skipped. This is the criterion that catches the failure mode where a guard test is written but silently skipped, which would reproduce the exact 'green suite over an unverified claim' problem the ISSUE names.` |

## 7. Migration

**State before:** Per s1: `CliProvider.completeStructured` (cli-provider.ts:175) wraps `completeStructuredOnce` (:183) in `withTransientRetry`, and that method hands the caller's schema to the vendor VERBATIM — inline via `'--json-schema', JSON.stringify(schema)` for claude (:193), or written to a tmpdir file and passed as `['exec','--output-schema',schemaPath,'--json']` for codex (:206-210). There is no pre-flight check of any kind. If a caller passes a root-level union, the schema reaches the binary, the binary refuses it, and the failure surfaces as a claude envelope error or a codex non-zero exit — possibly after up to three billed re-spawns, because `withTransientRetry` classifies retryability by string-matching the message against `isTransientCliError`. The module also carries `normaliseSchemaForAnthropic` (structured-output.ts:341) whose doc comment claims to handle exactly this case by injecting a root `type: 'object'`; s1 found it has ZERO references anywhere in `src/` including tests, and the prior session established its algorithm does not satisfy either vendor, so it is dead code asserting a false guarantee. Its neighbour comment block is also mis-attached: the 'Phases B.1-B.5 land per-provider implementations' paragraph documenting `notImplementedStructuredOutput` (:359) sits ABOVE the normalise helper's own comment. s1's test.locate found no hermetic test file for structured-output.ts at all; the one suite exercising its schema-shaping half is `local-agents-structured.live.test.ts`, gated on `INSRC_LIVE_TESTS=1` plus `which claude`/`which codex` and spawning the real billed binaries — and the anyOf-rooted fixture that once documented this very rejection was removed in 617734f, so the constraint currently has no assertion of any kind.

**State after:** A root-level union is refused locally, by name, before any subprocess exists. `rootUnionKey` is a new pure export of structured-output.ts; `CliProvider.completeStructured` calls it as its first act, OUTSIDE `withTransientRetry`, and throws a deterministic Error naming the offending keyword, both vendor flags, and the envelope remedy. The success path is byte-for-byte unchanged — no normalisation, no cloning, no rewriting — so every schema that works today still works and still reaches the vendor exactly as written. `normaliseSchemaForAnthropic` and its doc comment are gone, leaving the 'Phases B.1-B.5' block correctly adjacent to the stub it describes. `isTransientCliError` becomes an export so the non-retryability of the guard's message is assertable rather than merely asserted in prose. A new hermetic file, `src/agent/providers/__tests__/structured-output-root-union.test.ts`, covers the predicate's truth table (including the nested-union and root-`type`-present rows that keep it honest in both directions) and drives the real provider path with an impossible `binPath`, so the guard is fully proven with no vendor process and nothing billed.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. RE-VERIFY, do not trust this document: run a repo-wide reference search for `normaliseSchemaForAnthropic` and confirm it is still zero-caller. s1's finding is a point-in-time fact about the tree at design time. If any reference now exists, STOP and re-decide — a live caller turns 'delete dead code' into 'fix a live bug', which is a different judgement than this ISSUE authorises. — ↩ rollbackable
2. Add the `rootUnionKey` predicate to structured-output.ts as a new export. Purely additive: nothing calls it yet, so the tree's behaviour is unchanged at this point and the step is independently revertable. — ↩ rollbackable
3. Add the predicate's unit truth table in the new hermetic test file and RUN IT, including the two rows that constrain the predicate in opposite directions — nested union returns undefined (no over-rejection) and root-`type`-present-with-union still returns the keyword (the deleted helper's premise is not inherited). The predicate must be proven correct in isolation BEFORE it is wired into a call path, so that a later integration failure is unambiguously about placement rather than about the check itself. — ↩ rollbackable
4. Export `isTransientCliError` from cli-provider.ts. An intentional, minimal widening of the module surface for testability — called out explicitly rather than slipped in, because without it the non-retryability claim can only be asserted by timing, which is a weak proof on a loaded machine. — ↩ rollbackable
5. Wire the guard: call `rootUnionKey` as the first statement of `completeStructured` and throw on a hit. Placement is load-bearing and must be OUTSIDE `withTransientRetry` — inside it, retryability would depend on whether the message happens to brush the `isTransientCliError` pattern. This is the only step that changes runtime behaviour. — ↩ rollbackable
6. Write the integration assertions against a provider constructed with an impossible `binPath`, for BOTH kinds, and run the falsifying mutation FIRST: with the guard line removed the call must reach the spawn and fail with a path/ENOENT error sharing no token with the expected message. Confirm that red before accepting the test. A guard test that also passes against the pre-guard code proves nothing, and that is the specific way these checks have gone vacuous here before. — ↩ rollbackable
7. Add the negative control — a plain object schema against the same impossible-binPath provider must fail with something that does NOT contain the guard's wording — plus the two non-retryability assertions (`isTransientCliError(<guard message>) === false`, and a sub-1500ms wall-clock bound). The negative control is what keeps every positive assertion honest: a guard that rejected everything would satisfy all of them and fail only this. — ↩ rollbackable
8. Delete `normaliseSchemaForAnthropic` and its doc comment. Then READ the resulting region of the file to confirm the 'Phases B.1-B.5' block now sits directly above `notImplementedStructuredOutput` — verify it rather than assume the deletion fixed the mis-attachment as a side effect. Leave `notImplementedStructuredOutput` in place: it is also zero-caller, but it is a deliberate stub contract, not a false claim that a broken case is handled. — ↩ rollbackable
9. Add the contract-level assertion that `normaliseSchemaForAnthropic` is absent from the module namespace, so the false safety signal cannot silently return. — ↩ rollbackable
10. Run the full hermetic sweep under Node 22 with `INSRC_LIVE_TESTS` UNSET, and check the new file's reported test count is non-zero. A guard test that is written but silently skipped reproduces exactly the 'green suite over an unverified claim' failure this Story exists to remove, and a passing sweep does not by itself rule it out — the count must be read. Confirm `src/docgen/__tests__/schema.test.ts` is still green unchanged, which is the cheapest proof the guard was not scoped too broadly. — ↩ rollbackable

**Backward compat:** The public surface changes in three ways, all of them safe for current callers, and the reasoning rests on evidence rather than on assumption. (1) `CliProvider.completeStructured` gains a rejection path. Formally this narrows what an existing public method accepts, which would normally be breaking — but s1's scan of every `*_SCHEMA` const outside `__tests__` found exactly ONE root-level union in the repo, `DOCGEN_OUTCOME_SCHEMA` (docgen/schema.ts:72), and it is consumed only by ajv in its own test and never handed to a provider. So no existing call path can hit the new rejection. This is also a falsifiable claim rather than a reassurance: if any currently-passing call starts failing after the guard lands, the guard is mis-scoped and must be revisited, not the caller. (2) `rootUnionKey` and `isTransientCliError` are purely additive exports — no existing import can break. (3) `normaliseSchemaForAnthropic` is REMOVED, which is a breaking change to the module's declared surface in the abstract. It carries no deprecation window and no shim, and the justification is specifically that it has zero callers AND never worked: a shim would preserve the false signal that is the whole defect. Step 1 re-verifies the zero-caller precondition at build time rather than inheriting it from this document. Also unchanged by design: `validateAgainstSchema` still accepts root unions in full, because it runs ajv locally with no vendor involved. That asymmetry — a schema may be validated locally but not REQUESTED from a CLI provider — is the one genuinely confusing consequence of this change, which is why the guard's message must state it rather than leave a reader to infer it. REVIEW CORRECTION, then PROBE CORRECTION. The original draft claimed DOCGEN_OUTCOME_SCHEMA was the repo's only non-test root-level union; the review refuted that — CLASSIFY_SCHEMA (src/workflow/triage/classify.ts:84) carries a root-level `allOf`, and src/daemon/tools/builtins/db/index.ts:1846 carries an `anyOf` nested under `properties.key`. The nested one is always out of scope. The review then proposed narrowing the guard to `oneOf`/`anyOf` on the theory that a root `allOf` beside a root `type` is a legitimate conjunction both vendors accept, and that narrowing was briefly applied. The probe REFUTED it: both vendors refuse a root `allOf` even with a root `type` present, so the narrowing was withdrawn and all three keywords restored. The corrected position: CLASSIFY_SCHEMA is genuinely un-sendable to either CLI today, so the guard rejecting it reports a real constraint rather than over-rejecting. It does not reach completeStructured today (its consumers are validateAgainstSchema at mcp/triage-step/phases/classify.ts:23 and the MCP tool response at start.ts:58), so no currently-passing call breaks — but the latent landmine is now documented instead of merely suspected, and anyone who later routes the triage classification turn through a CLI provider gets a named local error instead of an opaque vendor 400.

## 8. Alternatives considered

### 8.1 a1: Reject locally at the chokepoint — **CHOSEN**

completeStructuredOnce pre-flights the schema and throws a named, non-retryable error on a root-level union before either CLI is spawned.

Add an exported pure predicate to structured-output.ts — `rootUnionKey(schema)` — that inspects only the schema root. Call it once in the CliProvider structured path so a single call site covers both vendors. On a hit, throw a deterministic error whose message names the offending key, the fact that BOTH claude --json-schema and codex --output-schema refuse it, and the remedy. The throw must be classified as a deterministic failure, not transient, so withTransientRetry does not re-spawn the binary on it. normaliseSchemaForAnthropic is deleted outright: its algorithm is disproved, so there is nothing to make real — keeping it would contradict the guard sitting two functions away. The orphaned 'not implemented' doc comment is re-attached to notImplementedStructuredOutput as part of the same edit. REFINED AT s4: the guard's call site moved from completeStructuredOnce to completeStructured, i.e. OUTSIDE withTransientRetry, so non-retryability is structural rather than contingent on error wording.

### 8.2 a2: Wrap into an object envelope at the chokepoint

completeStructuredOnce transparently wraps a root union into an object envelope and unwraps the envelope field from the response.

Extend structured-output.ts with a bidirectional adapter returning both the envelope schema and an unwrap function — identity when no wrap occurred, and a field read when it did. The CliProvider structured path applies the wrap before serialising for either vendor and applies unwrap to the parsed claude structured_output / codex --json stream payload before the result is handed back, so callers still receive a value matching THEIR schema. normaliseSchemaForAnthropic is 'made real' in the sense the ISSUE allows — its file position and name are reused for the new adapter — but its actual algorithm (inject root type) is discarded as disproved.

**Rejected because:** VIOLATES fi3, the ISSUE's hermetic-assertion invariant, and that is decisive: the claim the whole fix rests on — that an envelope-wrapped union is actually ACCEPTED by claude --json-schema and codex --output-schema — is knowable only from a billed live call, so the hermetic suite would go green while the premise stayed unverified. That is the precise failure mode the invariant was written to prevent. Also VIOLATES rp1 by silently rewriting the caller's declared contract and inventing a wire-visible envelope field, trading the project's first-priority axis (accuracy) for convenience. Only PARTIAL on fi1, because the wrap is single-sited but the unwrap must cover two differing vendor response paths, and PARTIAL on fi2, because keeping the helper's name while discarding its entire algorithm is a subtler version of the same false signal — now harder to spot because the function is genuinely called. The one real benefit, making root unions usable, is owed to no existing caller: s1 found the repo's only root union is ajv-only and never provider-bound.

### 8.3 a3: Reject at the chokepoint plus a repo-wide static schema assertion

a1's runtime guard, plus a hermetic test that scans every exported schema const in the repo and fails if one carries a root-level union without an explicit opt-out.

Take a1 whole — pure root-union predicate, deterministic non-retryable throw, deletion of normaliseSchemaForAnthropic, comment re-attachment. Then add a second, static layer: a hermetic test that imports the repo's provider-bound schema consts and asserts no root union among them, so a root union is caught when it is WRITTEN rather than when it is first sent. DOCGEN_OUTCOME_SCHEMA is the one known exception and must be handled explicitly — either an allow-list entry justified by the fact it is ajv-only and never provider-bound, or by narrowing the scan to schemas actually reachable from a completeStructured call site.

**Rejected because:** Ranked second, and only because it strictly CONTAINS a1 — the increment is the part that fails. VIOLATES rp2 on scope: it exceeds the ISSUE's fixIntent, which asks for a guard and a disposition rather than a repo-wide schema lint, and it needs a notion of 'provider-bound schema' the repo does not have, so it lands on either a drifting allow-list or reachability analysis, both larger than a sized bugfix. Only PARTIAL on rp1, because the allow-list the scan requires — forced immediately by the legitimately-ajv-only DOCGEN_OUTCOME_SCHEMA at docgen/schema.ts:72 — reproduces exactly the false-safety-signal pattern this ISSUE exists to delete: an entry added to silence the scan is indistinguishable from a considered exemption. Its fi3 pass is also not load-bearing, since fi3 is already fully met by a1 alone. The authoring-time catch is genuinely valuable and is recorded as a follow-up open question rather than folded in.

## 9. References

- **[[c1]]** `code` `src/agent/providers/structured-output.ts:341` — "export function normaliseSchemaForAnthropic(schema: StructuredSchema): StructuredSchema {"
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:193` — "'--json-schema', JSON.stringify(schema),"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:210` — "const args = ['exec', '--output-schema', schemaPath, '--json', ...this.modelArgs(opts)];"
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts:409` — "function isTransientCliError(message: string): boolean {"
- **[[c5]]** `code` `src/docgen/schema.ts:72` — "export const DOCGEN_OUTCOME_SCHEMA = {"
- **[[c6]]** `code` `src/agent/providers/structured-output.ts:80` — "export function validateAgainstSchema<T>("
- **[[c7]]** `code` `src/agent/providers/__tests__/local-agents-structured.live.test.ts:55` — "const GATE = process.env['INSRC_LIVE_TESTS'] === '1';"
- **[[c8]]** `code` `src/agent/providers/structured-output.ts:302` — "for (const arrKey of ['anyOf', 'allOf'] as const) {"
- **[[c9]]** `code` `src/agent/providers/cli-provider.ts:151` — "private async withTransientRetry<T>(label: string, op: () => Promise<T>): Promise<T> {"
- **[[c10]]** `code` `src/agent/providers/cli-provider.ts:80` — "readonly binPath?: string | undefined;"
- **[[c11]]** `code` `src/agent/providers/structured-output.ts:359` — "export function notImplementedStructuredOutput(provider: string): never {"
- **[[c12]]** `code` `src/docgen/__tests__/schema.test.ts:22` — "const validate = ajv.compile(DOCGEN_OUTCOME_SCHEMA);"
- **[[c13]]** `convention` `src/workflow/artifacts/companion/__tests__/metamodel.test.ts:98` — "assert.equal(validateAgainstSchema(schema, good).ok, true);"
- **[[c14]]** `analyze-bundle` `s1:symbol.locate — structured-output.ts exported surface and which exports have real callers` — "TWO ARE DEAD: normaliseSchemaForAnthropic (declared at :341, ZERO references anywhere in src/ including tests) and notImplementedStructuredOutput (declared at :359, ZERO references)."
- **[[c15]]** `analyze-bundle` `s1:data-model.trace — which schemas in the repo actually carry a root-level union` — "A scan of every *_SCHEMA const outside __tests__ found exactly ONE root-level union: DOCGEN_OUTCOME_SCHEMA (src/docgen/schema.ts:72) ... consumed only by ajv directly and never handed to a provider."
- **[[c16]]** `prior-artifact` `ISSUE-1f7ade1a889013da` — "the dead helper must not survive as a false signal of safety — either removed or made real and actually called — and the constraint should be asserted by a test that does NOT require a billed live cal"

## 10. Open questions

- The Story arrived with an EMPTY acceptanceCriteria list, so ac1-ac7 were derived inside this LLD from the ISSUE's three fixIntent invariants plus the s5 edge cases. They are therefore self-consistent by construction — a weaker guarantee than mapping against criteria an upstream artifact fixed independently. The plan and build stages should treat ac1-ac7 as the inherited contract rather than re-deriving their own.
- ANSWERED BY PROBE (2026-10-03), no longer open: both root `allOf` and a root `type: 'object'` present alongside a root union were probed directly against both binaries. Both vendors refuse all three of `oneOf`/`anyOf`/`allOf` at the top level, and a root `type` does NOT exempt them. The residual, NARROWER gap is codex-only: codex's message enumerates `oneOf`/`anyOf`/`allOf`/`enum`/`not` at the top level, so a root `enum` or root `not` is also refused by codex, while claude's message names only the three union keywords. The guard covers the three BOTH vendors name; root `enum`/`not` on codex is a recorded, deliberately-uncovered gap rather than an oversight, since claude's behaviour on those two was not probed.
- The guard throws a plain `Error` rather than a named class. Chosen deliberately: nothing in the provider layer defines a structured-output error taxonomy, and introducing one is wider than this ISSUE authorises. Non-retryability is instead carried structurally and asserted directly, which is what a class would have bought. If a caller ever needs to BRANCH on this failure programmatically rather than report it, a named error class becomes the right follow-up.
- A root union reached through a root `$ref` into `$defs` is NOT detected — a known, deliberate gap. Closing it needs JSON-pointer resolution, and it was never established whether either vendor resolves a root `$ref` to a union before refusing it. Guessing would repeat the deleted helper's exact mistake of shipping an untested claim about vendor behaviour. Worth re-opening only with a real caller or a real probe.
- a3's authoring-time schema scan — catching a root union when it is WRITTEN rather than when it is first sent — is the one rejected idea worth keeping. It was excluded from this Story on scope and because the allow-list it needs reproduces the false-signal pattern being removed. It belongs on the backlog as its own item, contingent on the repo first gaining a reliable marker for which schemas are provider-bound.
- `processSchemaForOpenAIStrict` also has NO production caller — s1 found it referenced only from the gated live suite and one doc comment. That is a pre-existing gap wider than this Story and is deliberately NOT addressed here; it is recorded so this LLD is not read as a claim that the OpenAI-strict path is wired.

## Resolved questions

- `q5ed33a66` — ANSWERED BY PROBE (2026-10-03), no longer open: both root `allOf` and a root `type: 'object'` present alongside a root union were probed directly against both binaries. Both vendors refuse all three of `oneOf`/`anyOf`/`allOf` at the top level, and a root `type` does NOT exempt them. The residual, NARROWER gap is codex-only: codex's message enumerates `oneOf`/`anyOf`/`allOf`/`enum`/`not` at the top level, so a root `enum` or root `not` is also refused by codex, while claude's message names only the three union keywords. The guard covers the three BOTH vendors name; root `enum`/`not` on codex is a recorded, deliberately-uncovered gap rather than an oversight, since claude's behaviour on those two was not probed.
  - **resolved**: Guard the three probed keywords only — The only option fully backed by the probe on BOTH binaries. claude names exactly oneOf/allOf/anyOf; codex additionally names enum/not, but claude's behaviour on those two was never probed, so covering them would reintroduce the unprobed-vendor-claim mistake this Story exists to remove. Recorded as deliberate codex-only non-coverage; widen only after probing claude. _(2026-10-03T19:04:15.043Z)_
- `q8cc398bc` — The Story arrived with an EMPTY acceptanceCriteria list, so ac1-ac7 were derived inside this LLD from the ISSUE's three fixIntent invariants plus the s5 edge cases. They are therefore self-consistent by construction — a weaker guarantee than mapping against criteria an upstream artifact fixed independently. The plan and build stages should treat ac1-ac7 as the inherited contract rather than re-deriving their own.
  - **resolved**: Inherit plus independent trace check — Keeps ac1-ac7 as the single contract the LLD asks for, and replaces the self-consistent-by-construction weakness with an explicit per-criterion trace back to the ISSUE's three fixIntent invariants and the s5 edge cases. Gaps surface as LLD amendments rather than the plan silently re-deriving a second contract. No extra upstream approval round. _(2026-10-03T19:05:13.821Z)_

## Citations

- **[[c1]]** `code` `src/agent/providers/structured-output.ts:341` — "export function normaliseSchemaForAnthropic(schema: StructuredSchema): StructuredSchema {"
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts:193` — "'--json-schema', JSON.stringify(schema),"
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:210` — "const args = ['exec', '--output-schema', schemaPath, '--json', ...this.modelArgs(opts)];"
- **[[c4]]** `code` `src/agent/providers/cli-provider.ts:409` — "function isTransientCliError(message: string): boolean {"
- **[[c5]]** `code` `src/docgen/schema.ts:72` — "export const DOCGEN_OUTCOME_SCHEMA = {"
- **[[c6]]** `code` `src/agent/providers/structured-output.ts:80` — "export function validateAgainstSchema<T>("
- **[[c7]]** `code` `src/agent/providers/__tests__/local-agents-structured.live.test.ts:55` — "const GATE = process.env['INSRC_LIVE_TESTS'] === '1';"
- **[[c8]]** `code` `src/agent/providers/structured-output.ts:302` — "for (const arrKey of ['anyOf', 'allOf'] as const) {"
- **[[c9]]** `code` `src/agent/providers/cli-provider.ts:151` — "private async withTransientRetry<T>(label: string, op: () => Promise<T>): Promise<T> {"
- **[[c10]]** `code` `src/agent/providers/cli-provider.ts:80` — "readonly binPath?: string | undefined;"
- **[[c11]]** `code` `src/agent/providers/structured-output.ts:359` — "export function notImplementedStructuredOutput(provider: string): never {"
- **[[c12]]** `code` `src/docgen/__tests__/schema.test.ts:22` — "const validate = ajv.compile(DOCGEN_OUTCOME_SCHEMA);"
- **[[c13]]** `convention` `src/workflow/artifacts/companion/__tests__/metamodel.test.ts:98` — "assert.equal(validateAgainstSchema(schema, good).ok, true);"
- **[[c14]]** `analyze-bundle` `s1:symbol.locate — structured-output.ts exported surface and which exports have real callers` — "TWO ARE DEAD: normaliseSchemaForAnthropic (declared at :341, ZERO references anywhere in src/ including tests) and notImplementedStructuredOutput (declared at :359, ZERO references)."
- **[[c15]]** `analyze-bundle` `s1:data-model.trace — which schemas in the repo actually carry a root-level union` — "A scan of every *_SCHEMA const outside __tests__ found exactly ONE root-level union: DOCGEN_OUTCOME_SCHEMA (src/docgen/schema.ts:72) ... consumed only by ajv directly and never handed to a provider."
- **[[c16]]** `prior-artifact` `ISSUE-1f7ade1a889013da` — "the dead helper must not survive as a false signal of safety — either removed or made real and actually called — and the constraint should be asserted by a test that does NOT require a billed live cal"
