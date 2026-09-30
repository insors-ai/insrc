<!-- insrc:artifact LLD-9b72686c1746af2b-s2 -->

# LLD: E202609309b72686c:S002

## Summary

**Epic:** `harden-insrc-artifact-creation-flows-two`
**HLD base run:** `wf-1790749192360-iyxm4i`
**HLD effective hash:** `a96cc61752b7...`

S002 makes the existing BUILD-record writer reachable for a small standalone story. Today build-step validate resolves its target only through the plan-driven task resolver, so a standalone (bugfix-routed) story is rejected before any record is written. This Story adds an optional standalone context to the validate input and a matching branch in the validate handler that resolves the story identity from that context (mirroring the implement phase), then reuses the existing verdict + fail-open persist path so the standalone story lands a BUILD-<hash>-<storyId> record with its file-level change trace. The record shape and writer are unchanged — only its reachability.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Interaction with shared contracts](#4-interaction-with-shared-contracts)
5. [Error paths](#5-error-paths)
6. [Test strategy](#6-test-strategy)
7. [Migration](#7-migration)
8. [Alternatives considered](#8-alternatives-considered)
9. [References](#9-references)

## 1. HLD context

> See **HLD-9b72686c1746af2b** § 2. Framework summary

**Rollout phase:** Phase A — Foundational fixes (two silent-failure regressions)
**Owns:** `sc1` (BUILD ledger record contract)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Entirely private to S001: the change to the finalize render helpers (renderErCompanionForBody / renderUxCompanionForBody / renderDiagramCompanionsForBody) so a HIGH companion-validation finding yields a finalize failure instead of a swallowed warn, and the plumbing that routes that failure through the existing FinalizeResult -> synthesize retryable-error path. No other story consumes this; S001 has no dependents and no dependencies. The retry semantics themselves are the existing synthesize contract, unchanged.
- `s3`: Private to S003: the additive omit-slot rendering of the new summary + feedback sections in the BUILD record markdown renderer, and the capture of build-cycle feedback into the record. It consumes the sc1 record contract established by S002 and extends its body with the optional summary slot; the omit-slot rendering + capture wiring are internal.

## 2. Contract details

**Surface level:** internal

### 2.1 `BuildStepInputValidate`

```typescript
interface BuildStepInputValidate { readonly phase: 'validate'; readonly target: string; readonly repo?: string; readonly epicHash?: string | undefined; readonly standalone?: BuildStandaloneContext | undefined }
```

**Parameters:**
- `standalone: BuildStandaloneContext | undefined` _(optional)_ — NEW optional field mirroring BuildStepInputImplement.standalone: present for a triage-routed no-plan (standalone) build, carrying the self-minted epicHash + storyId used to key the BUILD record. Absent → today's plan-driven behaviour.

**Returns:** `n/a (interface)` — The validate-phase input type, extended additively so the MCP router can thread the already-accepted standalone object into the typed handler.

**Preconditions:**
- When standalone is present with sizeClass 'small', standalone.epicHash must be set (it locates the story identity).

**Postconditions:**
- The plan-driven fields (target/epicHash) are unchanged; a call with no standalone behaves exactly as today.

### 2.2 `handleValidate`

```typescript
handleValidate(input: BuildStepInputValidate): Promise<BuildStepDone | BuildStepError>
```

**Parameters:**
- `input: BuildStepInputValidate` — The validate request; when input.standalone is present the handler takes the standalone branch instead of the plan-driven resolveTaskRef.

**Returns:** `Promise<BuildStepDone | BuildStepError>` — Unchanged shape: the daemon-run verdict ({ next:'done', verdict, passed }) or an error. The standalone branch produces the same BuildStepDone; its side effect is persisting the standalone BUILD record.

**Errors:**
- `BuildStepError('no-repo')` when No repo resolvable (unchanged).
- `BuildStepError('no-identity')` when input.standalone present for a Small build but standalone.epicHash is missing (mirrors implement's identity guard).
- `BuildStepError('unresolved-target')` when PLAN-DRIVEN path only (input.standalone absent) — unchanged; the standalone branch never calls resolveTaskRef.
- `BuildStepError('unparseable-verdict')` when The verdict session emitted no parseable JSON verdict (unchanged, applies to both branches).

**Preconditions:**
- The repo is registered + indexed (unchanged).
- When input.standalone is present, its epicHash + storyId (default 'S001') identify the standalone story.

**Postconditions:**
- When input.standalone is present, on a parseable verdict the handler persists BUILD-<epicHash>-<storyId>.json via persistBuildRecord + collectBuildChangeLog and returns the verdict; a persist failure is swallowed (fail-open) and the verdict is still returned.
- When input.standalone is absent, behaviour is byte-identical to today (resolveTaskRef → existing persist block).

## 3. Data model changes

### 3.1 `BuildStepInputValidate` — field-add

Add an optional `standalone?: BuildStandaloneContext` field, mirroring BuildStepInputImplement.standalone (types.ts:56). Additive + optional: existing plan-driven callers are unaffected. The MCP tool schema already accepts a standalone object on validate; this threads it into the typed input so handleValidate can read it.

**Call sites:**
- `src/mcp/build-step/types.ts:59`
- `src/mcp/build-step/phases/validate.ts:64`

### 3.2 `Standalone BUILD ledger record (BUILD-<epicHash>-<storyId>) on the validate path` — invariant-change

NEW invariant: a small standalone story's validate now WRITES a BUILD record. handleValidate gains a branch (gated on input.standalone) that resolves the identity from the context (sizeClass = ctx.sizeClass ?? 'small', epicHash = ctx.epicHash, storyId = ctx.storyId ?? 'S001'), runs the existing read-only verdict session, and reuses the existing persist-on-verdict block (validate.ts:93-112) with that identity — calling persistBuildRecord + collectBuildChangeLog. The record shape is UNCHANGED (S003 adds summary/feedback, not S002); k4 byte-identity + k5 fail-open are preserved because the existing block is reused verbatim.

**Call sites:**
- `src/mcp/build-step/phases/validate.ts:93`
- `src/mcp/build-step/phases/validate.ts:102`
- `src/workflow/runners/build/standalone-record.ts`
- `src/workflow/runners/build/changed-files.ts`

## 4. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | implements | S002 owns sc1 and establishes its reachability: it makes the existing persistBuildRecord writer (+ collectBuildChangeLog change trace) reach a small standalone story by resolving that story's identity in the validate handler. S002 consumes the record shape unchanged — it adds NO summary/feedback fields (those are S003's additive extension of this same contract), so the record it writes is byte-identical to a plan-driven record's body today (k4). |

## 5. Error paths

**Error cases**

- **A standalone validate call for a Small build arrives without standalone.epicHash, so the story identity cannot be resolved.** (recoverable)
  - Detection: The standalone branch checks standalone.epicHash before resolving identity (mirroring implement's identity guard at implement.ts:100-113); a missing epicHash is caught there, not by resolveTaskRef.
  - Response: Return BuildStepError('no-identity') with a message naming the required standalone.epicHash + storyId; do NOT write a BUILD-undefined path.
  - User impact: The caller re-invokes validate with the standalone epicHash (the same value used for implement). No partial/garbage record is written.
- **persistBuildRecord throws while writing the standalone BUILD json/md (e.g. a filesystem/permission fault).** (recoverable)
  - Detection: The existing try/catch that wraps the persist-on-verdict block (validate.ts:106-111) catches the throw and logs a warn; the daemon's parsed verdict is already computed by then.
  - Response: Swallow the persist failure (fail-open) and still return { next:'done', verdict, passed } — the verdict is never converted into an error.
  - User impact: The build verdict is returned as normal; the BUILD record may be absent for that run, but the build itself is not failed. A re-run (upsert) can write it.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A standalone story whose BUILD-<epicHash>-<storyId>.json already exists (a re-validate). | persistBuildRecord's upsert (mergeWithPrior) merges on the prior record — preserving the original createdAt and any approval/rejection stamps — rather than clobbering a possibly-completed story. |
| A standalone build whose changed set is empty (no files changed). | collectBuildChangeLog returns [] and the changeLog is omitted from the body (omit-slot), so the record renders byte-identically to a no-change record — the same behaviour a plan-driven no-change build gets. |
| A standalone context with no storyId. | storyId defaults to 'S001' (mirroring handleStandaloneImplement), so the record is keyed BUILD-<epicHash>-S001. |
| A validate call that carries BOTH a standalone context and a plan-driven target string. | The standalone branch is gated on input.standalone being present and takes precedence; the target is ignored for the standalone path (it is only used by the plan-driven resolveTaskRef path). |

**Invariants to preserve**

- When input.standalone is ABSENT, handleValidate behaves byte-identically to today: it calls resolveTaskRef and reaches the existing persist block unchanged — the plan-driven validate path is not altered. [[c1]]
- S002 does not change the BUILD record shape or renderer — it adds NO summary/feedback fields (those are S003's additive omit-slot extension), so a record it writes is byte-identical to a plan-driven record's body today (k4). [[c3]]
- A BUILD-record persist failure is fail-open: it is swallowed and never converts a real build verdict into an error (k5), exactly as the existing plan-driven persist block already behaves. [[c1]]
- persistBuildRecord is an upsert that preserves the original createdAt + completion/rejection stamps on a re-validate, so re-running validate never un-completes or churns a prior standalone record. [[c3]]

## 6. Test strategy

**Test framework:** `tsx --test (node:test + node:assert/strict) — the daemon repo test runner, matching the existing src/mcp/build-step/__tests__ suites (build-step.test.ts uses _setBuildValidateProviderForTests to stub the verdict session).`

**Test levels**

- **unit** — Prove the standalone validate branch persists a BUILD record with the change trace (ac1/ac3).
  - Subjects: `handleBuildStep({phase:'validate', standalone:{standalone:true, epicHash, storyId:'S001', sizeClass:'small'}}) with a stubbed passing verdict writes BUILD-<epicHash>-S001.json (existsSync) keyed to the story identity (ac1)`, `the persisted standalone record carries the file-level changeLog from collectBuildChangeLog when the changed set is non-empty (ac3)`, `the returned value is the verdict ({next:'done', verdict, passed}) — same shape as the plan-driven path`
  - Fixtures: `a tmp repo with a registered .insrc/artifacts + an approved standalone LLD for the story identity`, `the _setBuildValidateProviderForTests stub returning a canned JSON verdict`, `a git-changed file in the tmp repo so collectBuildChangeLog yields a non-empty list`
- **unit** — Prove fail-open + identity-guard error paths (ac4).
  - Subjects: `a persistBuildRecord throw (stubbed) during the standalone branch is swallowed and the verdict is still returned — the build is not turned into an error (ac4)`, `a standalone validate call missing standalone.epicHash returns BuildStepError('no-identity') and writes no BUILD-undefined path`
  - Fixtures: `a seam to force persistBuildRecord to throw (e.g. an unwritable artifacts dir) or a stubbed writer`, `the verdict-session stub`
- **unit** — Regression — the plan-driven validate path is unchanged (no standalone).
  - Subjects: `handleBuildStep({phase:'validate', target:'s1/t1'}) (no standalone) still resolves via resolveTaskRef and persists the plan-driven BUILD record exactly as the existing build-step.test.ts:280 test asserts`, `a plan-driven validate with an unresolved target still returns BuildStepError('unresolved-target')`
  - Fixtures: `the existing plan-driven fixtures from build-step.test.ts (approved plan + stubbed verdict)`
- **unit** — Prove the completion gate can approve the standalone record (ac2).
  - Subjects: `after the standalone validate writes BUILD-<epicHash>-S001.json, approveWorkflowTarget (the completion gate) finds it by the BUILD- prefix and approves it — extending the approve-build-completion.test.ts pattern`
  - Fixtures: `the tmp repo with the persisted standalone BUILD record + the approve-build-completion harness`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: standalone validate writes BUILD-<epicHash>-S001.json keyed to the story identity (existsSync)` |
| `ac2` | `unit: approveWorkflowTarget finds the persisted standalone BUILD record by BUILD- prefix and approves it (completion gate)` |
| `ac3` | `unit: the persisted standalone record carries the collectBuildChangeLog file-level change list for a non-empty changed set` |
| `ac4` | `unit: a persistBuildRecord throw is swallowed and the verdict is still returned (fail-open)` |

## 7. Migration

**State before:** Per s1 bundles: BuildStepInputValidate (types.ts:59-66) has no `standalone` field, so handleValidate (validate.ts:59) always calls resolveTaskRef at :64 and returns err('unresolved-target') at :65 for a standalone story — never reaching the persist-on-verdict block at :93-112. implement.ts already dispatches on input.standalone to handleStandaloneImplement (implement.ts:70) which resolves identity from BuildStandaloneContext; validate has no such branch. Net: a small standalone story's build validates but persists NO BUILD record, so the completion gate finds nothing to approve.

**State after:** BuildStepInputValidate carries an optional `standalone?: BuildStandaloneContext` (mirroring implement). handleValidate, when input.standalone is present, resolves the story identity from it (sizeClass ?? 'small', epicHash, storyId ?? 'S001'), skips resolveTaskRef, runs the existing read-only verdict session, and reuses the existing persist-on-verdict block to write BUILD-<epicHash>-<storyId>.json via persistBuildRecord + collectBuildChangeLog. The plan-driven path (no standalone) is unchanged. A small standalone story now lands a BUILD record with its change trace, which the completion gate can approve.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add an optional `standalone?: BuildStandaloneContext` field to the BuildStepInputValidate interface (additive, mirroring BuildStepInputImplement). — ↩ rollbackable
2. Thread the already-accepted `standalone` object from the MCP build-step tool input through the router into the typed BuildStepInputValidate for the validate phase. — ↩ rollbackable
3. In handleValidate, add an early branch gated on `input.standalone` present: resolve epicHash/storyId/sizeClass from the context (mirroring handleStandaloneImplement), returning a 'no-identity' error when a Small build lacks epicHash; when absent, fall through to the existing resolveTaskRef path unchanged. — ↩ rollbackable
4. In the standalone branch, run the existing verdict session and reuse the existing persist-on-verdict block (validate.ts:93-112) with the resolved identity, so persistBuildRecord + collectBuildChangeLog write the record; keep the try/catch fail-open behaviour verbatim. — ↩ rollbackable
5. Extend the build-step tests: assert a standalone validate persists BUILD-<hash>-S001.json with the change-log (ac1/ac3), a persist failure keeps the verdict (ac4), the completion gate approves the record (ac2), and the plan-driven path is unchanged; run the daemon test sweep to confirm green. — ↩ rollbackable

**Backward compat:** The only public-ish surface touched is the internal MCP BuildStepInputValidate type, extended ADDITIVELY with an optional field — every existing plan-driven validate caller (no standalone) is unaffected and behaves byte-identically (resolveTaskRef → existing persist block). No BUILD record shape change (S002 adds no fields; S003 owns that), so existing records + their renderer are untouched. The MCP tool's outer validate schema already accepts a standalone object, so no tool-contract change is visible to callers.

## 8. Alternatives considered

### 8.1 a1: Inline standalone branch in handleValidate, mirroring handleStandaloneImplement — **CHOSEN**

Add `standalone?: BuildStandaloneContext` to BuildStepInputValidate and give handleValidate an early standalone branch that resolves epicHash/storyId from the context (same defaults as implement), skips resolveTaskRef, runs the existing verdict session, and reaches the existing persistBuildRecord path.

BuildStepInputValidate gains an optional `standalone: BuildStandaloneContext` field (the type already used by implement), and the MCP input router threads the accepted standalone object into it. In handleValidate, before the resolveTaskRef call, a branch checks input.standalone: when present it derives the record identity inline exactly as handleStandaloneImplement does (sizeClass = ctx.sizeClass ?? 'small', epicHash = ctx.epicHash, storyId = ctx.storyId ?? 'S001'), runs the existing read-only verdict session, and then reuses the existing persist-on-verdict block (validate.ts:93-112) with that identity to write BUILD-<hash>-<storyId>.json via persistBuildRecord + collectBuildChangeLog.

The plan-driven path is untouched: when input.standalone is absent, control flows to resolveTaskRef exactly as today. No shared writer or record shape changes — S002 only makes the existing writer reachable for a standalone story.

### 8.2 a2: Extract a shared standalone-identity resolver used by both implement and validate

Same as a1, but factor the epicHash/storyId/sizeClass derivation into one small shared function that both handleStandaloneImplement and the new validate branch call, so the two phases cannot drift.

In addition to a1's input-field + branch, the identity-resolution defaults are lifted out of handleStandaloneImplement into a single shared helper (e.g. a resolveStandaloneIdentity(ctx) returning { epicHash, storyId, sizeClass }). Both the implement standalone path and the new validate standalone branch call it, guaranteeing they resolve identity identically.

Everything else is as a1: the verdict session, persistBuildRecord, collectBuildChangeLog, and the plan-driven path are unchanged.

**Rejected because:** Rank 2. Functionally equal to a1 and better at preventing implement/validate drift, but it refactors the working implement standalone path to extract a 3-field helper — more surface + a small regression risk to a passing path than an S story warrants. The duplication a1 leaves is trivial (three defaults).

### 8.3 a3: Minimal ref-shim: build a task ref from the standalone context and fall through to the existing persist block

Add standalone to BuildStepInputValidate and, when present, synthesize the { epicHash, storyId, taskId } ref directly from the context (bypassing resolveTaskRef and the admission gate), then let the existing verdict + persist block run unchanged.

handleValidate, when input.standalone is present, constructs the resolved-ref shape it already uses downstream ({ epicHash: ctx.epicHash, storyId: ctx.storyId ?? 'S001', taskId: ctx.storyId ?? 'S001' }) instead of calling resolveTaskRef, then continues into the unchanged verdict session + persist-on-verdict block. No separate standalone handler function; the only new code is the ref-shim guard.

**Rejected because:** Rank 3. Meets the acceptance criteria with the fewest lines but is the least faithful to the HLD's 'mirror implement' intent: it omits the admission gate implement applies and hard-couples to the internal ref shape, trading robustness for brevity.

## 9. References

- **[[c1]]** `analyze-bundle` `s1 'validate-phase gap' — src/mcp/build-step/types.ts:59 (BuildStepInputValidate, no standalone), :56 (implement has it), validate.ts:64 (resolveTaskRef), :102 (persistBuildRecord)` — "handleValidate always calls resolveTaskRef and bails on a standalone target before reaching the persist-on-verdict block; the block is fail-open."
- **[[c2]]** `analyze-bundle` `s1 'implement standalone pattern' — implement.ts:70 (handleStandaloneImplement), :100 (identity resolution), types.ts:33 (BuildStandaloneContext)` — "implement resolves standalone identity from BuildStandaloneContext (sizeClass/epicHash/storyId) — the pattern S002 mirrors in validate."
- **[[c3]]** `analyze-bundle` `s1 'writer + completion gate' — standalone-record.ts (persistBuildRecord upsert + mergeWithPrior), changed-files.ts (collectBuildChangeLog), approve-build-completion.test.ts` — "persistBuildRecord is an upsert preserving createdAt/stamps; the completion gate finds records by the BUILD- prefix; S002 consumes all three unchanged."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 5 LOW** · model `client` · reviewed 2026-09-30T06:43:24.703Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| 3.1 | citation | LOW | auto | BuildStepInputValidate (types.ts:59) currently has no standalone field, while BuildStepInputImplement (types.ts:56) carries standalone?: BuildStandaloneContext. | Confirmed: types.ts:59 `export interface BuildStepInputValidate {` (no standalone field), :56 `readonly standalone?: BuildStandaloneContext \| undefined;` on BuildStepInputImplement. | Accept — citation resolves. |
| 2.2 | citation | LOW | auto | handleValidate resolves via resolveTaskRef at validate.ts:64 and the persist-on-verdict block (persistBuildRecord) is at validate.ts:102, reached only after resolution. | Confirmed: validate.ts:64 `const resolved = resolveTaskRef(...)` and :102 `persistBuildRecord(...)`; collectBuildChangeLog is present in the persist block. | Accept — citation resolves. |
| c2 | citation | LOW | auto | implement.ts has handleStandaloneImplement resolving identity from a BuildStandaloneContext (the pattern S002 mirrors), with the identity guard around implement.ts:100-113. | Confirmed: implement.ts:70 `function handleStandaloneImplement` + a `BuildStandaloneContext` interface — the standalone identity-resolution pattern S002 mirrors. | Accept — citation resolves. |
| c3 | semantic | LOW | auto | persistBuildRecord is an upsert (mergeWithPrior) that preserves createdAt + approval stamps; collectBuildChangeLog yields the file-level change list; both are consumed unchanged. | Confirmed: standalone-record.ts has `function persistBuildRecord` + `function mergeWithPrior` (the upsert) and collectBuildChangeLog exists — all consumed unchanged. | Accept — semantic claim holds. |
| 4 | cross-artifact | LOW | auto | sc1 (BUILD ledger record contract) is owned by s2 per the HLD, so this LLD implementing sc1 matches the HLD ownership. | Confirmed: the sc1 'BUILD ledger record contract' exists in the approved HLD and its ownedByStory is s2 (authored + approved this session; the ownedByStory grep returned 0 only because the probe scans src/, not .insrc/artifacts/ where the HLD JSON lives). This LLD implementing sc1 matches the HLD ownership. | Accept — cross-artifact ownership holds. |
