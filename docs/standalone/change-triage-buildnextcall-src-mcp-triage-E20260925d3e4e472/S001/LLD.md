<!-- insrc:artifact LLD-d3e4e4727d31985a-S001 -->

# LLD: E20260925d3e4e472:S001

**Epic:** `change-triage-buildnextcall-src-mcp-triage`
**HLD base run:** `wf-1790328529145-sdfs9k`
**HLD effective hash:** `d3e4e4727d31...`

## HLD context

**Framework:** Standalone feature — no parent HLD. Design directly against the repo, grounded on the s1 analyze passes. There are no HLD shared contracts to honour.
**Rollout phase:** standalone

## Contract details

**Surface level:** internal

### `buildNextCall`

```typescript
function buildNextCall(result: TriageResult, focus: string, repo: string): TriageDone['nextCall']
```

**Parameters:**
- `result: TriageResult` — The classified triage result whose route.startStage selects the branch.
- `focus: string` — The story focus/spec forwarded into the emitted call params.
- `repo: string` — The repo path forwarded into the emitted call params.

**Returns:** `TriageDone['nextCall']` — The advisory pre-filled next tool call. Behaviour change: the define / issue / design.story branches now return tool:'insrc_workflow_step' with params.phase:'start' prepended (same repo/workflow/focus/params otherwise); the trivial branch still returns tool:'insrc_build_step' unchanged.

**Errors:**
- `none` when Pure function over the four fixed route.startStage values; no new error paths.

**Preconditions:**
- result.route.startStage is one of define/issue/build/design.story (unchanged)

**Postconditions:**
- No branch returns tool:'insrc_workflow_run'; the run path is never recommended
- The emitted design.story/define/issue call is directly executable as an insrc_workflow_step START (phase:'start')

## Data model changes

### `TriageDone.nextCall.tool (src/mcp/triage-step/types.ts)` — field-modify

Narrow the union from 'insrc_workflow_run' | 'insrc_build_step' to 'insrc_workflow_step' | 'insrc_build_step' so the compiler forbids re-introducing a workflow_run nextCall.

```
- readonly tool: 'insrc_workflow_run' | 'insrc_build_step'
+ readonly tool: 'insrc_workflow_step' | 'insrc_build_step'
```

**Call sites:**
- `src/mcp/triage-step/phases/classify.ts`

### `BugfixNextCall.tool (src/workflow/bugfix/types.ts)` — field-modify

Same narrowing on the deliberately-duplicated bugfix descriptor (kept separate so the bugfix module does not import triage-step internals).

```
- readonly tool: 'insrc_workflow_run' | 'insrc_build_step'
+ readonly tool: 'insrc_workflow_step' | 'insrc_build_step'
```

**Call sites:**
- `src/workflow/bugfix/next-after-issue.ts`

## Error paths

### Error cases

- **A future edit re-introduces tool:'insrc_workflow_run' in a nextCall** (recoverable)
  - Detection: The narrowed union type ('insrc_workflow_step' | 'insrc_build_step') makes tsc reject the 'insrc_workflow_run' literal at compile time.
  - Response: Compile fails; the run path cannot silently come back.
  - User impact: None at runtime — caught in the build.

### Edge cases

| Input | Expected |
| :--- | :--- |
| route.startStage === 'build' (trivial) | Unchanged: returns tool:'insrc_build_step' with phase:'implement' — not touched by this Story. |
| route.startStage === 'define' (epic) | Returns tool:'insrc_workflow_step', params:{phase:'start', repo, workflow:'define', focus} (no standalone params, as before). |
| route.startStage === 'issue' (bugfix) / 'design.story' (feature\|small) | Returns tool:'insrc_workflow_step', params:{phase:'start', repo, workflow, focus, params:{...}} — the standalone params block preserved verbatim, only tool + phase added. |
| bugfix next-after-issue sized path | Returns tool:'insrc_workflow_step' with phase:'start' for the design.story follow-up; the trivial/small build_step branch is unchanged. |

### Invariants to preserve

- nextCall is ADVISORY output only — no runtime code dispatches on nextCall.tool; it is a string the controller reads to decide its next call. Changing the value therefore cannot break any consumer. [[c1]]
- The trivial route continues to emit tool:'insrc_build_step' (phase:'implement') unchanged — only the three workflow_run branches (+ the sized bugfix branch) are converted. [[c2]]
- The triage/bugfix module boundary is preserved: BugfixNextCall stays a local re-declaration (no import of triage-step internals), just with the narrowed union. [[c3]]
- The insrc_workflow_run MCP tool + its server dispatch remain registered; only the RECOMMENDATION (the pre-filled nextCall) stops pointing at it. [[c4]]

## Test strategy

**Test framework:** `node:test (tsx --test) + node:assert/strict — the convention used by src/mcp/triage-step/__tests__/handler.test.ts`

### Test levels

- **unit** — Prove buildNextCall (and the bugfix next-after-issue) emit insrc_workflow_step START calls for every non-trivial route, and never insrc_workflow_run.
  - Subjects: `classify: feature/small route -> nextCall.tool==='insrc_workflow_step' AND params.phase==='start' AND params.workflow==='design.story' (standalone params preserved)`, `classify: epic route -> nextCall.tool==='insrc_workflow_step', params.phase==='start', params.workflow==='define', no standalone params`, `classify: bugfix route -> nextCall.tool==='insrc_workflow_step', params.phase==='start', params.workflow==='issue'`, `classify: trivial route -> nextCall.tool==='insrc_build_step' (unchanged regression guard)`, `classify: no route emits tool==='insrc_workflow_run'`, `bugfix next-after-issue sized path -> nextCall.tool==='insrc_workflow_step' with params.phase==='start'`
  - Fixtures: `Existing handler.test.ts start()/classify() helpers driving each sizeClass`, `Any existing bugfix next-after-issue unit test fixture`
- **contract** — The narrowed union is compiler-enforced: tsc --noEmit must pass with the union set to 'insrc_workflow_step' | 'insrc_build_step' (a residual 'insrc_workflow_run' literal would fail to compile).
  - Subjects: `tsc --noEmit clean after narrowing TriageDone.nextCall.tool and BugfixNextCall.tool`

### Acceptance mapping

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `classify: feature/small -> insrc_workflow_step + phase:'start' + workflow design.story`, `classify: epic -> insrc_workflow_step + phase:'start' + workflow define`, `classify: bugfix -> insrc_workflow_step + phase:'start' + workflow issue` |
| `ac2` | `classify: trivial -> insrc_build_step unchanged`, `classify: no route emits insrc_workflow_run` |
| `ac3` | `bugfix next-after-issue sized path -> insrc_workflow_step + phase:'start'` |
| `ac4` | `tsc --noEmit clean with the narrowed nextCall.tool unions` |

## Migration

**State before:** src/mcp/triage-step/phases/classify.ts buildNextCall emits tool:'insrc_workflow_run' for the define/issue/design.story branches, and src/workflow/bugfix/next-after-issue.ts emits it for the sized design.story follow-up; both nextCall.tool unions (triage-step/types.ts, bugfix/types.ts) allow 'insrc_workflow_run'. So triage/bugfix route the controller to the async START→POLL path, which stalls in a resolution loop and errors on the completion handoff.

**State after:** Those branches emit tool:'insrc_workflow_step' with params.phase:'start' (all other params unchanged); the trivial insrc_build_step branch is untouched. Both nextCall.tool unions are narrowed to 'insrc_workflow_step' | 'insrc_build_step', so the compiler forbids re-introducing the run path. The controller is always routed to the supported turn-by-turn driver.

**Zero downtime:** yes — **Data rewrite:** no

### Steps

1. Narrow TriageDone.nextCall.tool (src/mcp/triage-step/types.ts) and BugfixNextCall.tool (src/workflow/bugfix/types.ts) from 'insrc_workflow_run' | 'insrc_build_step' to 'insrc_workflow_step' | 'insrc_build_step'. — ↩ rollbackable
2. In classify.ts buildNextCall, change the define / issue / design.story branches to tool:'insrc_workflow_step' and prepend phase:'start' to their params; leave the trivial insrc_build_step branch unchanged. — ↩ rollbackable
3. In bugfix next-after-issue.ts, change the sized design.story follow-up to tool:'insrc_workflow_step' with phase:'start'; leave the trivial/small build_step branch unchanged. — ↩ rollbackable
4. Update the asserting unit tests (handler.test.ts + any bugfix next-after-issue test) to expect tool:'insrc_workflow_step' and params.phase==='start', keeping the build_step/workflow assertions. — ↩ rollbackable

**Backward compat:** nextCall is advisory output the controller reads; no runtime code dispatches on nextCall.tool, so changing it breaks no consumer. The insrc_workflow_run MCP tool and its server dispatch remain registered and callable — only the pre-filled recommendation stops pointing at it. No wire/schema/persisted-data change.

## Alternatives considered

### a1: In-place swap + narrow the union to insrc_workflow_step — **CHOSEN**

Convert each workflow_run branch to {tool:'insrc_workflow_step', params:{phase:'start', ...}} in place, and change both nextCall.tool unions to 'insrc_workflow_step'|'insrc_build_step'.

In classify.ts buildNextCall, the define/issue/design.story branches keep their exact params but change tool to 'insrc_workflow_step' and prepend phase:'start'; mirror the sized branch in next-after-issue.ts; narrow both unions so the compiler forbids the run path; update the handler tests.

### a2: Extract a shared stepStartCall() helper

Add a helper that builds the step-start descriptor and call it from both classify.ts and next-after-issue.ts.

Create a helper stepStartCall(repo, workflow, focus, params?) in a neutral shared location used at all four emit sites.

**Rejected because:** Violates dc2: the bugfix module deliberately re-declares BugfixNextCall to avoid importing triage-step internals, so a shared helper breaks that boundary (or needs a new module); over-engineered for a fixed 5-field shape at 4 sites (dc3 partial). Rank 2.

## Citations

- **[[c1]]** `analyze-bundle` `src/mcp/triage-step/phases/classify.ts (buildNextCall) + src/mcp/server.ts` — "nextCall is advisory output the controller reads; no runtime code dispatches on nextCall.tool."
- **[[c2]]** `analyze-bundle` `src/mcp/triage-step/phases/classify.ts:70` — "build(trivial) -> {tool:'insrc_build_step', params:{phase:'implement',...}} (UNCHANGED — already the right shape)."
- **[[c3]]** `code` `src/workflow/bugfix/types.ts:20-24` — "The routed next-stage descriptor — the SAME shape buildNextCall emits, re-declared locally so s4 does not import triage-step internals."
- **[[c4]]** `analyze-bundle` `src/mcp/server.ts (insrc_workflow_run registration + dispatch)` — "The insrc_workflow_run MCP tool + its server dispatch stay registered (only the RECOMMENDATION changes)."

<!-- insrc:review -->

## Review

### ✅ Review `PASS` — design.story (design.story)

**0 HIGH · 0 MED · 7 LOW** · model `client` · reviewed 2026-09-25T09:34:09.390Z

| Ref | Kind | Severity | Fixability | Premise | Evidence | Action |
| --- | --- | --- | --- | --- | --- | --- |
| cl1 | inventory | LOW | auto | src/mcp/triage-step/phases/classify.ts buildNextCall has exactly three branches emitting tool:'insrc_workflow_run' (define, issue, design.story) plus one emitting tool:'insrc_build_step' (trivial). | Confirmed: classify.ts has 3 tool:'insrc_workflow_run' branches + 1 tool:'insrc_build_step'; read at :45 confirmed. | Confirmed — no change needed. |
| cl2 | citation | LOW | auto | TriageDone.nextCall.tool is declared as 'insrc_workflow_run' \| 'insrc_build_step' in src/mcp/triage-step/types.ts. | Confirmed: the union 'insrc_workflow_run' \| 'insrc_build_step' at src/mcp/triage-step/types.ts:61. | Confirmed — no change needed. |
| cl3 | citation | LOW | auto | BugfixNextCall.tool is declared as 'insrc_workflow_run' \| 'insrc_build_step' in src/workflow/bugfix/types.ts, deliberately re-declared to avoid importing triage-step internals. | Confirmed: interface BugfixNextCall at src/workflow/bugfix/types.ts:23 with the same union (the 'does not import' phrasing grep missed the exact wording but the :23 read confirmed the declaration). | Confirmed — no change needed. |
| cl4 | citation | LOW | auto | src/workflow/bugfix/next-after-issue.ts emits tool:'insrc_workflow_run' for the sized design.story follow-up and tool:'insrc_build_step' for the trivial/small path. | Confirmed: next-after-issue.ts emits both tool literals; the sized design.story branch at :74 emits insrc_workflow_run. | Confirmed — no change needed. |
| cl5 | citation | LOW | auto | src/mcp/triage-step/__tests__/handler.test.ts asserts done.nextCall.tool==='insrc_workflow_run' (feature->design.story and bugfix->issue) and ==='insrc_build_step' (trivial). | Confirmed: handler.test.ts asserts nextCall.tool==='insrc_workflow_run' (2) + 'insrc_build_step' (1); :53 confirmed. | Confirmed — update these assertions in the build. |
| cl6 | external-contract | LOW | manual | insrc_workflow_step's START call is shaped {phase:'start', workflow, focus, params?} (plus repo), so each converted branch is directly executable as an insrc_workflow_step START. | The deterministic probe was capped/inconclusive (0 src matches surfaced), but insrc_workflow_step's START shape {phase:'start', workflow, focus, params?} is verified by this session's own repeated insrc_workflow_step START calls. The claim holds; only the probe was weak. | Confirmed by direct usage; the build will still be validated by tsc + the running MCP contract. |
| cl7 | semantic | LOW | auto | nextCall is advisory output only — no runtime code dispatches on nextCall.tool (no switch/if on the emitted tool value), so changing it breaks no consumer. | Confirmed: no `switch.*\\.tool` in src; the only `.tool ===` matches are the test assertions (handler.test.ts), not runtime dispatch — so nextCall.tool is advisory-only and changing it breaks no consumer. | Confirmed — no change needed. |
