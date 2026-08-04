<!-- insrc:artifact PLAN-761a43a6fa645815-s7 -->

# Plan: E20260804761a43a6:S007

**Epic:** `add-daemon-driven-code-review-stage`
**LLD run:** `wf-1785828130220-ya1ai8`
**LLD effective hash:** `47535369867a...`

## Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Additive CONFIG_CATALOG entry codeReview.enforce (default false) | S | — | unit: CONFIG_CATALOG contains { path:'codeReview.enforce', type:'boolean', default:false } (asserted in gate.test.ts / the config-catalog-contract coverage); unit: reconcileConfig fills codeReview.enforce=false on a config lacking it (carry-forward) and preserves an explicitly-set true | [[c4]] |
| 2 | **`t2`** The gate: CodeReviewGateResult + enforceCodeReviewGate (pure, read-only, fail-open) | M | `t1` | unit: enforceCodeReviewGate reads body.verdict from a temp CR json and returns the discriminated CodeReviewGateResult; unit: enforce on + verdict 'block' + no override => { status:'blocked', counts, message } (ac1); unit: enforce on + verdict 'block' + overrideReview => { status:'overridden', overrideReason, at } (ac2); unit: verdict 'warn' => { status:'warn', counts, message } under enforce on AND off (ac3); unit: verdict 'pass' => { status:'pass', counts }; the gate is pure + performs no write (ac4/read-only); unit: enforce OFF + block => non-blocking advisory (advisory:true + message naming the demoted block, distinct from a genuine warn) (critique 1) | [[c1]] [[c3]] [[c5]] [[c2]] |
| 3 | **`t3`** Fake-file unit tests for the gate + catalog carry-forward | M | `t2` | unit: absent record => { status:'no-review' } (additive; ac4); unit: fail-open on malformed / unknown-verdict CR json => 'no-review' (never a spurious block); unit: override reason on a non-block verdict (pass/warn) is a no-op; unit: readEnforceFlag fail-safe: no config file + opts.enforce omitted => a block is advisory, not blocked (default false, never throws) (critique 2); unit: enforceCodeReviewGate performs no write — CR json bytes unchanged after the call (read-only); unit: CONFIG_CATALOG declares codeReview.enforce with type:'boolean', default:false | [[c6]] [[c1]] [[c4]] |

### E20260804761a43a6:S007:T001 — Additive CONFIG_CATALOG entry codeReview.enforce (default false)

Add one additive entry { path:'codeReview.enforce', type:'boolean', default:false, desc:'enforce a blocking code-review verdict at Story completion (off => advisory)' } to CONFIG_CATALOG in src/config/config-catalog.ts. No existing entry is edited; the schema-driven reconcile carries it forward (fills false) on existing configs at daemon boot/update. This is the opt-in flag the gate reads so enforcement can be validated before it gates real completions.

**Acceptance checks:**
- src/config/config-catalog.ts CONFIG_CATALOG contains { path:'codeReview.enforce', type:'boolean', default:false } with a desc
- no existing CONFIG_CATALOG entry is modified or removed (purely additive)
- tsc --noEmit is clean

### E20260804761a43a6:S007:T002 — The gate: CodeReviewGateResult + enforceCodeReviewGate (pure, read-only, fail-open)

Add src/workflow/code-review/gate.ts exporting the CodeReviewGateResult discriminated union (no-review | pass | warn | blocked | overridden; counts mirrors CR body.counts, verdict reuses ReviewVerdict from ../review/types.js via import type) and enforceCodeReviewGate(repoPath, epicHash, storyId, opts?: { overrideReview?: string; enforce?: boolean }): CodeReviewGateResult. Flow: locate the CR json via codeReviewArtifactPaths(repoPath,epicHash,storyId).json (S006); if it does not exist => 'no-review'. Read+JSON.parse; a parse failure or a body.verdict outside the closed set {'pass','warn','block'} => fail-open 'no-review' (logged via getLogger, never a spurious block). Resolve effective enforce = opts.enforce ?? (a private readEnforceFlag() that reads codeReview.enforce from PATHS.config JSON, DEFAULTING to false when the file is absent or the key is missing and NEVER throwing). Branch: verdict 'pass' => {status:'pass',counts}; 'warn' => {status:'warn',counts,message}; 'block' with enforce OFF => a NON-BLOCKING advisory {status:'warn', advisory:true, counts, message} whose message explicitly states the underlying verdict was 'block' and enforcement is off (DISTINGUISHABLE from a genuine warn via advisory:true — critique 1); 'block' with enforce on + a non-empty overrideReview => {status:'overridden',verdict:'block',counts,overrideReason,at:new Date().toISOString()}; 'block' with enforce on + no override => {status:'blocked',verdict:'block',counts,message}. An override on a non-block verdict is a no-op. Read-only: never writes/mutates the CR record and never touches meta.review; an UnregisteredRepoError from a downstream read propagates unchanged. .js imports, import type, getLogger not console.log, strict optional/indexed handling.

**Acceptance checks:**
- src/workflow/code-review/gate.ts exports enforceCodeReviewGate + CodeReviewGateResult; CodeReviewGateResult is the {no-review|pass|warn|blocked|overridden} discriminated union with counts + (block arms) verdict + the warn arm carrying an optional advisory flag, reusing ReviewVerdict from ../review/types.js
- locates the record via codeReviewArtifactPaths(...).json (S006, storage.ts:318); absent/malformed/unknown-verdict json => fail-open 'no-review' (never a spurious block), logged via getLogger
- effective enforce = opts.enforce ?? readEnforceFlag(); enforce on + block + no override => 'blocked' with counts + message; enforce on + block + overrideReview => 'overridden' with overrideReason + at
- enforce OFF + block => a NON-BLOCKING outcome that is DISTINGUISHABLE from a genuine warn (advisory:true + a message naming the demoted 'block' verdict) and NEVER withholds completion (critique 1)
- readEnforceFlag defaults to false when PATHS.config is absent or lacks codeReview.enforce and NEVER throws; opts.enforce always wins when provided (critique 2)
- verdict 'warn' => 'warn' (enforce on or off); 'pass' => 'pass'; an override reason on a non-block verdict is a no-op; the gate reads body.verdict/counts VERBATIM and never touches meta.review or writes the record
- tsc --noEmit clean; .js imports + import type; no console.log; read-only (no writeAtomic; no provider used)

### E20260804761a43a6:S007:T003 — Fake-file unit tests for the gate + catalog carry-forward

Add src/workflow/code-review/__tests__/gate.test.ts (node:test + node:assert/strict via npx tsx --test): write a temp CR-<epic>-<story>.json under a tmp repo dir via codeReviewArtifactPaths with a scripted CodeReviewBody (verdict block/warn/pass + counts), or omit it (absent), or write malformed/unknown-verdict json; inject opts.enforce true/false to bypass the live config read; assert the discriminated CodeReviewGateResult for every branch: block=>blocked (message+counts), block+override=>overridden (overrideReason+at), warn=>warn (enforce on AND off), pass=>pass, absent=>no-review, enforce-off+block=>non-blocking advisory (advisory:true + message naming the demoted block, distinguishable from a genuine warn), malformed/unknown=>no-review, override-on-non-block=>no-op. Also assert: (a) enforceCodeReviewGate performs no write (the CR json bytes are unchanged after the call); (b) readEnforceFlag fail-safe — with NO config file and opts.enforce omitted, a block is advisory (not blocked), proving the default-false-never-throws behaviour. Plus a CONFIG_CATALOG assertion that codeReview.enforce is present with default false (extending the existing config-catalog-contract test coverage). No live daemon/Ollama.

**Acceptance checks:**
- src/workflow/code-review/__tests__/gate.test.ts runs under `npx tsx --test` (node:test + node:assert/strict) using temp CR json files + injected opts.enforce — no live daemon/Ollama/config
- tests cover every branch: blocked, overridden, warn (enforce on+off), pass, no-review (absent), enforce-off-block advisory (advisory:true + demoted-block message, distinct from a genuine warn), fail-open (malformed/unknown-verdict), override-no-op-on-non-block; plus a read-only assertion (CR json unchanged after the call)
- a test proves the readEnforceFlag fail-safe: no config file + opts.enforce omitted => a block is advisory, not blocked (default false, never throws)
- a CONFIG_CATALOG assertion confirms codeReview.enforce is declared with type:'boolean', default:false
- the full `npx tsx --test 'src/workflow/code-review/**/*.test.ts'` sweep passes (S001-S007 green; live tests skip cleanly when INSRC_LIVE_TESTS unset)

## Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| enforceCodeReviewGate reading body.verdict from a temp CR-<epic>-<story>.json and returning the discriminated CodeReviewGateResult | `t2`, `t3` |
| the block branch: enforce on + verdict 'block' + no override => { status:'blocked', counts, message } | `t2` |
| the override branch: enforce on + verdict 'block' + overrideReview reason => { status:'overridden', overrideReason, at } | `t2` |
| the warn branch: verdict 'warn' => { status:'warn', counts, message } (enforce on OR off) | `t2` |
| the additive branches: absent record => 'no-review'; enforce OFF + verdict 'block' => a non-blocking advisory outcome | `t2`, `t3` |
| fail-open on a malformed / unknown-verdict CR json => 'no-review' (never a spurious block) | `t3` |
| the override-is-a-no-op-on-non-block case (override reason supplied but verdict pass/warn) | `t3` |
| CONFIG_CATALOG contains { path:'codeReview.enforce', type:'boolean', default:false } | `t1`, `t3` |
| reconcileConfig fills codeReview.enforce=false on a config that lacks it (carry-forward), and preserves an explicitly-set true | `t1` |

## Citations

- **[[c1]]** `prior-artifact` `LLD s7 handoff — the gate consumes sc4 read-only: codeReviewArtifactPaths(...).json (storage.ts:318, S006) locates the CR record; the gate reads body.verdict + body.counts; body.verdict stays the single source (never mutated)`
- **[[c2]]** `prior-artifact` `LLD s7 handoff — the gate MIRRORS the gates.ts block-or-override pattern (ReviewBlockedError:71 / approveArtifactByJsonPath:488 / approveWorkflowTarget:586) on body.verdict, never on meta.review; the two review kinds stay distinct (k8)`
- **[[c3]]** `prior-artifact` `LLD s7 handoff — the gate reuses the ReviewVerdict='pass'|'warn'|'block' vocabulary VERBATIM (review/types.ts:43); a body.verdict outside that closed set is the fail-open trigger (k1)`
- **[[c4]]** `prior-artifact` `LLD s7 handoff — the additive CONFIG_CATALOG entry { path:'codeReview.enforce', type:'boolean', default:false } (config-catalog.ts) the schema-driven reconcile carries forward; enforcement is opt-in until validated (default OFF)`
- **[[c5]]** `prior-artifact` `LLD s7 handoff — the gate returns a discriminated CodeReviewGateResult for the caller to PRESENT before the explicit approval act; it never approves on the user's behalf (k7/ac4)`
- **[[c6]]** `prior-artifact` `LLD s7 handoff — fake-file test discipline: node:test + node:assert/strict via npx tsx --test, temp CR json under a tmp repo dir + injected opts.enforce (no live daemon/Ollama/config); mirrors the S006 code-review __tests__ layout + the config-catalog-contract coverage`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — plan (plan)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T07:49:51.287Z

_No load-bearing premises were extracted._
