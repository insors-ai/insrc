<!-- insrc:artifact LLD-761a43a6fa645815-s7 -->

# LLD: E20260804761a43a6:S007

**Epic:** `add-daemon-driven-code-review-stage`
**HLD base run:** `wf-1785741597494-lbzdo7`
**HLD effective hash:** `47535369867a...`

## HLD context

**Framework:** A hybrid code-review stage (winner a3): a code-review-specific orchestrator runs the four dimensions (adherence/conventions/coverage/quality) as an explicit SERIAL provider loop, reusing src/daemon/workflow-rpc.ts's proven machinery (buildShaperProvider resolution, synthesize-with-retry, writeAtomic, meta-stamping, optional boundary re-audit, the runStart StreamHandler shape) rather than cloning it, and mirroring the existing review vocabulary (ReviewVerdict / Severity / ReviewReport from src/workflow/review/types.ts) so the persisted CodeReviewArtifact carries a block/warn/pass verdict downstream approval already understands. The daemon-driven path and the controller-driven insrc_code_review_step (which mirrors insrc_review_step's start/emit/done/error/opaque-state envelope) share ONE orchestrator, differing only in who supplies each dimension's judgement. The stage runs after build, consumes the build record + approved LLD/PLAN as its fixed subject without re-deriving them, and never modifies the code it judges.
**Rollout phase:** Phase D — Completion gate + independent controller path
**Consumes:** `sc4` (CodeReviewArtifact)

## Contract details

**Surface level:** internal

### `enforceCodeReviewGate`

```typescript
export function enforceCodeReviewGate(repoPath: string, epicHash: string, storyId: string, opts?: { readonly overrideReview?: string; readonly enforce?: boolean }): CodeReviewGateResult
```

**Parameters:**
- `repoPath: string` — Absolute repo root; joined with codeReviewArtifactPaths to locate the CR-<epic>-<story> record.
- `epicHash: string` — Epic hash component of the CR record id.
- `storyId: string` — Story id component of the CR record id.
- `opts: { readonly overrideReview?: string; readonly enforce?: boolean }` _(optional)_ — overrideReview: an explicit reason that bypasses a block verdict (records the override, ac2). enforce: overrides the codeReview.enforce config flag (defaults to the config value; injected in tests). When enforce is false/absent-and-config-off the gate NEVER blocks (advisory).

**Returns:** `CodeReviewGateResult` — A discriminated outcome the caller presents to the user before the explicit approval act: 'no-review' (no CR record => never blocks, strictly additive), 'pass', 'warn' (allowed, warnings surfaced), 'blocked' (present block verdict + enforce on + no override => withholds completion, carries a human message + counts), or 'overridden' (block + override reason => proceeds, records overrideReason + at).

**Errors:**
- `UnregisteredRepoError` when Propagates unchanged if a downstream read touches an unregistered repo (never swallowed). A malformed/unreadable CR json is treated as 'no-review' (never a spurious block), NOT thrown — the gate is strictly additive and fail-open on absence/corruption.

**Preconditions:**
- The S006 runner may or may not have written a CR-<epic>-<story> record; the gate tolerates its absence.
- The gate is READ-ONLY: it never runs the runner and never mutates the CR record (the override is returned to the caller, not stamped by the gate).

**Postconditions:**
- Absence of a CR record OR enforce off => a non-blocking outcome ('no-review' / advisory) => completion behaves exactly as before this Story (ac-additive).
- A present 'block' verdict with enforce on and no override => 'blocked' with the blocking reason relayed (ac1).
- A present 'block' verdict with an overrideReview reason => 'overridden' carrying the reason + timestamp alongside the bypassed verdict (ac2).
- A 'warn' verdict => allowed, with the warning counts surfaced for the caller to present (ac3).
- The outcome is returned for the caller to present BEFORE approval; the gate never approves on the user's behalf (ac4).

### `codeReviewArtifactPaths`

```typescript
export function codeReviewArtifactPaths(repoPath: string, epicHash: string, storyId: string, epicSlug?: string): { readonly md: string; readonly json: string }
```

**Parameters:**
- `repoPath: string` — Absolute repo root the paths are joined under.
- `epicHash: string` — Epic hash into the CR json id.
- `storyId: string` — Story id into the CR json id.
- `epicSlug: string` _(optional)_ — Optional slug for the md segment (unused by the gate, which reads only .json).

**Returns:** `{ readonly md: string; readonly json: string }` — The CR record's paths; the gate reads `.json` (under ARTIFACTS_DIR) to load the record. Existing S006 helper, reused verbatim — not reshaped.

**Preconditions:**
- Existing storage helper shipped in S006 (storage.ts:318).

**Postconditions:**
- Returns the canonical CR-<epic>-<story>.json path the gate stats + reads.

## Data model changes

### `CodeReviewGateResult` — new

The gate's discriminated return union (private to s7): { status:'no-review' } | { status:'pass'; counts } | { status:'warn'; counts; message } | { status:'blocked'; verdict:'block'; counts; message } | { status:'overridden'; verdict:'block'; counts; overrideReason: string; at: string }. `counts` mirrors the CR body.counts {high,med,low}; `message` is a human string the caller relays. `verdict` reuses ReviewVerdict verbatim. No new persisted shape — this is an in-memory result type only. [[c1]] [[c3]]

```
+ type CodeReviewGateResult =
+   | { readonly status: 'no-review' }
+   | { readonly status: 'pass';       readonly counts: { high:number; med:number; low:number } }
+   | { readonly status: 'warn';       readonly counts: {...}; readonly message: string }
+   | { readonly status: 'blocked';    readonly verdict: 'block'; readonly counts: {...}; readonly message: string }
+   | { readonly status: 'overridden'; readonly verdict: 'block'; readonly counts: {...}; readonly overrideReason: string; readonly at: string };
```

**Call sites:**
- `src/workflow/code-review/gate.ts (new, returned by enforceCodeReviewGate)`
- `src/workflow/code-review/types.ts (or gate.ts local; consumes ReviewVerdict from ../review/types.js)`

### `codeReview.enforce (config option)` — field-add

A new boolean CONFIG_CATALOG entry { path:'codeReview.enforce', type:'boolean', default:false }. Default OFF so enforcement is opt-in until validated; the schema-driven reconcile carries it forward on daemon boot/update. The gate reads it unless opts.enforce overrides. Additive: no existing catalog entry is edited. [[c4]]

```
+ { path: 'codeReview.enforce', type: 'boolean', default: false, desc: '...' }   // in CONFIG_CATALOG
```

**Call sites:**
- `src/config/config-catalog.ts (CONFIG_CATALOG, additive entry)`
- `src/workflow/code-review/gate.ts (reads the flag)`

## Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | consumes | Reads the sc4 CodeReviewArtifact read-only: locates it via codeReviewArtifactPaths(repoPath, epicHash, storyId).json, parses body.verdict (the block/warn/pass value it enforces) + body.counts (surfaced to the user). Adds no field and never writes the record — body.verdict stays the single source (the override is returned to the caller, not stamped onto the record by the gate). Absence of the record => 'no-review' => never blocks. [[c1]] [[c8]] |

## Error paths

### Error cases

- **The CR-<epic>-<story>.json exists but is malformed / unparseable (a truncated or corrupt record).** (recoverable)
  - Detection: The gate reads the file and JSON.parse throws, or the parsed object lacks a body.verdict in the ReviewVerdict union; the gate catches the parse/shape failure around its own read.
  - Response: Treat it as 'no-review' (fail-OPEN) — the gate never manufactures a 'block' from a record it cannot read, so a corrupt file cannot silently withhold completion. It logs a warning via getLogger and returns { status:'no-review' }.
  - User impact: Completion proceeds as if no review ran (the additive default); the reviewer re-runs the code review to regenerate a clean record rather than being hard-blocked by corruption.
- **The CR record carries a verdict value outside the ReviewVerdict union (e.g. an unknown string from a future/foreign writer).** (recoverable)
  - Detection: After parsing, the gate checks body.verdict against the closed set {'pass','warn','block'}; a value not in the set fails the check.
  - Response: Fail-open to 'no-review' (same as a malformed record) rather than guessing — an unrecognized verdict is not treated as a block. Logged.
  - User impact: Never a spurious block from an unrecognized verdict; completion behaves as no-review until a valid record is written.
- **enforce is ON, the verdict is 'block', and NO override reason is supplied.** (recoverable)
  - Detection: The gate branches on body.verdict==='block' && effectiveEnforce===true && (opts.overrideReview is undefined/empty).
  - Response: Returns { status:'blocked', verdict:'block', counts, message } — the message names the block + counts so the caller relays the refusal + reason (ac1). Nothing is written; the CR record is untouched.
  - User impact: The Story's completion is withheld and the blocking reason is surfaced to the person attempting it (ac1) — the review is a real gate.
- **A downstream read touches an unregistered repo while resolving the record path.** (terminal)
  - Detection: An UnregisteredRepoError surfaces from the storage/repo layer during the read.
  - Response: PROPAGATES unchanged — the gate never swallows an unregistered-repo error into 'no-review' (that class is a real misconfiguration, distinct from an absent/corrupt record).
  - User impact: The caller sees the genuine repo-registration error rather than a masked 'no-review', so the misconfiguration is fixed rather than hidden.

### Edge cases

| Input | Expected |
| :--- | :--- |
| No CR-<epic>-<story>.json exists (a pre-existing Story, or one where the review was never run). | { status:'no-review' } — completion behaves exactly as before this Story; absence NEVER blocks (the strictly-additive guarantee). |
| enforce is OFF (config default) and the verdict is 'block'. | A non-blocking advisory outcome (the block is surfaced informationally, e.g. { status:'warn' }-like with the counts + message) that NEVER withholds completion — enforcement is opt-in until validated. |
| verdict is 'block' and a non-empty overrideReview reason is supplied (enforce on). | { status:'overridden', verdict:'block', counts, overrideReason, at } — completion proceeds and the override is recorded alongside the bypassed verdict (ac2). |
| verdict is 'warn' (enforce on or off). | { status:'warn', counts, message } — allowed either way; the warnings are still surfaced for the caller to present before the user acts (ac3). |
| verdict is 'pass' with counts {0,0,0} (a clean review) or only LOW findings. | { status:'pass', counts } — completion is allowed with no warning noise; LOW findings neither warn nor block (consistent with the S006 fold). |
| An overrideReview reason is supplied but the verdict is 'pass' or 'warn' (not a block). | The override is a no-op: the outcome is the plain 'pass'/'warn' — an override only applies to a block it actually bypasses, so it is not recorded when there was nothing to override. |

### Invariants to preserve

- Absence (or unreadability) of a CR record NEVER blocks completion — the gate is strictly additive and fail-open, so a Story with no code review completes exactly as it did before this Story. Only a PRESENT, readable block verdict (with enforce on and no override) withholds completion. [[c1]]
- The gate enforces the sc4 body.verdict (the CODE review) and NEVER touches meta.review (the design-artifact review) — the two review kinds stay distinct (k8), so the gate mirrors the block-or-override semantics rather than reusing approveArtifactByJsonPath on the CR record. [[c2]]
- body.verdict stays the SINGLE source of the code-review verdict: the gate is read-only and returns the override to the caller rather than stamping it onto the CR record, so the verdict is never duplicated or mutated by the gate (sc4 single-source). [[c1]]
- The gate reads body.verdict/counts in the existing ReviewVerdict / Severity vocabulary VERBATIM (block/warn/pass) — no second verdict interpretation is introduced (k1). [[c3]]
- Enforcement is opt-in behind the codeReview.enforce flag (default OFF): a flag-off config keeps every Story completing exactly as today, so enforcement can be validated before it gates real completions (the HLD risk-mitigation). [[c4]]
- The gate returns a discriminated outcome for the caller to PRESENT before the explicit approval act and never approves on the user's behalf — approval stays the existing gated user act (k7/ac4). [[c5]]

## Test strategy

**Test framework:** `node:test + node:assert/strict via `npx tsx --test` (matching src/workflow/code-review/__tests__ and the config reconcile tests)`

### Test levels

- **unit** — Prove enforceCodeReviewGate's branch table (no-review / pass / warn / blocked / overridden), its strictly-additive fail-open behaviour, and the enforce-flag gating — pure I/O over a temp CR record file + an injected enforce flag, no daemon/Ollama.
  - Subjects: `enforceCodeReviewGate reading body.verdict from a temp CR-<epic>-<story>.json and returning the discriminated CodeReviewGateResult`, `the block branch: enforce on + verdict 'block' + no override => { status:'blocked', counts, message }`, `the override branch: enforce on + verdict 'block' + overrideReview reason => { status:'overridden', overrideReason, at }`, `the warn branch: verdict 'warn' => { status:'warn', counts, message } (enforce on OR off)`, `the additive branches: absent record => 'no-review'; enforce OFF + verdict 'block' => a non-blocking advisory outcome`, `fail-open on a malformed / unknown-verdict CR json => 'no-review' (never a spurious block)`, `the override-is-a-no-op-on-non-block case (override reason supplied but verdict pass/warn)`
  - Fixtures: `A tmp repo dir under which codeReviewArtifactPaths(...).json is written with a scripted CodeReviewBody (verdict block/warn/pass, counts) — or omitted for the absent case; a malformed json for the fail-open case`, `opts.enforce injected true/false so the config read is bypassed (no live config)`, `node:test + node:assert/strict; the existing src/workflow/code-review/__tests__ layout`
- **unit** — Prove the codeReview.enforce config option is declared in CONFIG_CATALOG (default false) so the schema-driven reconcile carries it forward and enforcement is opt-in.
  - Subjects: `CONFIG_CATALOG contains { path:'codeReview.enforce', type:'boolean', default:false }`, `reconcileConfig fills codeReview.enforce=false on a config that lacks it (carry-forward), and preserves an explicitly-set true`
  - Fixtures: `The existing config reconcile test harness (src/config/__tests__) + CONFIG_CATALOG import`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `unit: 'enforce on + block + no override => blocked' — write a CR json with verdict:'block', call enforceCodeReviewGate with enforce:true, assert { status:'blocked' } and the message carries the block reason + counts (the refusal relayed to the caller)` |
| `ac2` | `unit: 'enforce on + block + overrideReview reason => overridden' — assert { status:'overridden', overrideReason, at } so completion proceeds and the override is recorded alongside the bypassed block verdict`, `unit: 'override is a no-op when verdict is not block' — override reason + verdict pass/warn => plain pass/warn, override not recorded` |
| `ac3` | `unit: 'verdict warn => warn' — write a CR json with verdict:'warn', assert { status:'warn', counts, message } (allowed, warnings surfaced) under enforce on AND enforce off` |
| `ac4` | `unit: 'the gate returns a discriminated outcome and never approves' — assert enforceCodeReviewGate is a pure function returning CodeReviewGateResult (no write, no approval side-effect), so the caller presents it before the explicit approval act`, `unit: 'absent record => no-review (additive)' — no CR json => { status:'no-review' }, proving completion is not auto-taken or auto-blocked on the user's behalf` |

## Migration

**State before:** S006 shipped the sc4 CodeReviewArtifact + its storage peers (codeReviewArtifactId/Paths, storage.ts:172/:318) and the runCodeReview runner that WRITES a CR-<epic>-<story> record carrying body.verdict (block/warn/pass) + counts — but NOTHING reads that verdict to gate anything: the record is inert. Completion/approval today runs through gates.ts (approveArtifactByJsonPath:488 enforces meta.review — the DESIGN-artifact review — via ReviewBlockedError:71/override; approveWorkflowTarget:586 routes a block into skipped[]); the code-review body.verdict has no equivalent enforcement. Config options are declared once in CONFIG_CATALOG (config-catalog.ts:71) and carried forward by the schema-driven reconcile; there is no codeReview.enforce key yet.

**State after:** A new src/workflow/code-review/gate.ts exports enforceCodeReviewGate (+ the CodeReviewGateResult type): it reads the sc4 record's body.verdict via codeReviewArtifactPaths and returns a discriminated outcome (no-review / pass / warn / blocked / overridden), mirroring the ReviewBlockedError/override semantics on body.verdict (never on meta.review, keeping the two review kinds distinct). CONFIG_CATALOG gains an additive { path:'codeReview.enforce', type:'boolean', default:false } option the gate reads (unless opts.enforce overrides), so enforcement is opt-in until validated. Absence of a record => 'no-review' => completion is unchanged from before this Story. The four dimension modules, the S006 runner + record, ReviewVerdict/gates.ts, and every existing config option are untouched.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Add the additive config option { path:'codeReview.enforce', type:'boolean', default:false } to CONFIG_CATALOG. The schema-driven reconcile fills it (false) on existing configs at daemon boot/update; no existing entry is edited, so a flag-off default keeps every Story completing exactly as today. — ↩ rollbackable
2. Add src/workflow/code-review/gate.ts with the CodeReviewGateResult type + enforceCodeReviewGate: locate the CR json via codeReviewArtifactPaths, read body.verdict/counts, read the codeReview.enforce flag (opts.enforce overrides), and return the discriminated outcome (fail-open to 'no-review' on absent/malformed/unknown-verdict). Pure, read-only; inert until a caller invokes it. — ↩ rollbackable _(needs: `codeReview.enforce`)_
3. Add unit tests (gate.test.ts) writing a temp CR json per branch (block/warn/pass/absent/malformed) + toggling opts.enforce, asserting the CodeReviewGateResult; plus a CONFIG_CATALOG carry-forward test. Test-only; no runtime surface change. — ↩ rollbackable
4. (Deferred to the consumer wiring, not this Story's core) The approval/completion caller invokes enforceCodeReviewGate and PRESENTS its outcome before the explicit approval act, withholding only on 'blocked'. Ships behind codeReview.enforce so it can be validated before gating real completions. — ↩ rollbackable _(needs: `codeReview.enforce`)_

**Backward compat:** Strictly additive — no existing public API changes behaviour. enforceCodeReviewGate + CodeReviewGateResult are NEW symbols; codeReview.enforce is a NEW catalog option (default false); codeReviewArtifactPaths is reused unchanged. The generic approveArtifactByJsonPath/approveWorkflowTarget path is NOT edited (the gate is a parallel, distinct-verdict function), so the design-artifact review approval is unaffected. The one guarantee to hold: absence of a CR record => 'no-review' => a pre-existing Story (or one whose review never ran) completes exactly as before, and with the flag OFF a present block is advisory only — so enforcement can be validated before it ever withholds a real completion. Reverting is clean: delete gate.ts + its tests + the one catalog entry.

## Alternatives considered

### a1: Pure gate function over the CR record + enforce flag — **CHOSEN**

A new pure enforceCodeReviewGate(repoPath, epicHash, storyId, opts?) reads body.verdict + the codeReview.enforce flag and returns a discriminated outcome the caller relays before approval.



### a2: Fold code-review enforcement into approveArtifactByJsonPath/approveWorkflowTarget

Teach the existing generic approve path to also cross-read the story's CR record and throw ReviewBlockedError on a block verdict.



**Rejected because:** Conflates the two DISTINCT verdicts (violates k8): approveArtifactByJsonPath enforces meta.review, and folding in the CR body.verdict entangles the code review into the generic design-artifact approve path; it also scope-creeps a load-bearing generic function (regression risk vs the additive guarantee) and only partially covers warn (ac3) + present-first (ac4).

### a3: Stamp a synthesized ReviewReport onto the CR record's meta.review

Fabricate a ReviewReport from the code-review findings and write it to meta.review so the EXISTING approve gate enforces it unchanged.



**Rejected because:** Violates sc4 (duplicates the verdict into meta.review AND body.verdict — two driftable sources) and k8 (fabricates a design-review-shaped ReviewReport from code-review findings, conflating the two kinds the HLD deliberately separates); it also misaligns the approval target with story completion.

## Citations

- **[[c1]]** `analyze-bundle` `s1 symbol.locate — the sc4 CodeReviewArtifact + storage peers the gate reads: src/workflow/code-review/types.ts (CodeReviewBody.verdict/counts) + src/workflow/storage.ts:172 codeReviewArtifactId / :318 codeReviewArtifactPaths (CR-<epic>-<story>, json under ARTIFACTS_DIR)`
- **[[c2]]** `analyze-bundle` `s1 symbol.locate — the block-or-override enforcement pattern the gate mirrors: src/workflow/gates.ts ReviewBlockedError:71 + approveArtifactByJsonPath:488 (meta.review block/override) + approveWorkflowTarget:586 (routes a block into skipped[]); the DESIGN-review vs CODE-review distinction (k8)`
- **[[c3]]** `analyze-bundle` `s1 symbol.locate — the verdict vocabulary the gate reuses verbatim: src/workflow/review/types.ts ReviewVerdict='pass'|'warn'|'block' (:43) + Severity (:41); effectiveReviewVerdict (review/resolve.ts:57)`
- **[[c4]]** `analyze-bundle` `s1 search.text — where the codeReview.enforce flag is declared: src/config/config-catalog.ts CONFIG_CATALOG (:71), { path, type, default, desc }; the schema-driven reconcile (reconcile.ts) carries new options forward at boot/update`
- **[[c5]]** `analyze-bundle` `s1 symbol.locate — the approval flow the gate outcome is presented through: gates.ts approveWorkflowTarget:586 + WorkflowApproveResult; the MCP insrc_workflow_approve tool + the 'present, ask, then approve' explicit-user-act rule (k7/ac4)`
- **[[c6]]** `analyze-bundle` `s1 test.locate — the test harness the gate's unit tests extend: src/workflow/code-review/__tests__ (node:test + node:assert/strict via npx tsx --test, fake-dep injection) + the src/workflow/__tests__ ReviewBlockedError/override coverage`
- **[[c7]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — k7: approval remains the existing gated act (an artifact is presented, the user explicitly approves, and a blocking review verdict is enforced unless explicitly overridden); the assumption behind ac1/ac2/ac4`
- **[[c8]]** `prior-artifact` `DEF/HLD 761a43a6fa645815 — k8: the code review stays distinct in kind from the artifact review, both coexisting; the assumption behind the gate enforcing body.verdict (not meta.review) and sc4's distinctness`

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 0 LOW** · model `client` · reviewed 2026-08-04T07:31:03.710Z

_No load-bearing premises were extracted._
