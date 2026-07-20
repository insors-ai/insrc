# Plan-quality audit — streaming-progress epic (`6d6cfaf9a9b14bd4`)

**Date:** 2026-07-20 · **Scope:** the 37 approved PLAN tasks across Stories s1/s2/s3
(GitHub #45–#81) · **Method:** one auditor per Story, each verifying every
load-bearing premise (counts, inventories, closed unions, `file:line` anchors,
external-contract assumptions, cross-artifact traces) against real source.

This audit was triggered when the build's `t1` stop-and-widen guard fired on a
truncated producer sweep. It is the manual precedent for the **integrated
post-stage review cycle** (see `docs/reviews/review-cycle-design.md` once built).

## Summary

| Story | Tasks | Issues | HIGH | MED | LOW | Verdict |
|-------|-------|--------|------|-----|-----|---------|
| s1 (daemon producers → uniform frames) | 10 | #45–#54 | **1** (t9) | 5 | 4 | Safe task-by-task with targeted fixes |
| s2 (MCP callers → progressToken) | 11 | #55–#65 | **3** (t6,t7,t8) | 3 | 5 | **Re-scope the wiring cluster before building** |
| s3 (IDE consumption API) | 16 | #66–#81 | 0 | 5 | 11 | Safe; 2 hard preconditions |
| **Total** | **37** | | **4** | **13** | **20** | |

## HIGH findings (would ship broken)

- **s2 t6/t7/t8 (#60/#61/#62)** — the story's central premise (the three MCP
  tools are uniform long-running daemon-streaming ops whose `progressToken` is a
  field on their result envelopes) is false three ways: (1) the MCP
  `progressToken` arrives via the SDK **`extra`** callback arg, discarded in all
  three registrations (`server.ts:300/419/471` = `(rawArgs,_extra)=>handle*(rawArgs)`),
  not on the envelope/args; (2) the handlers run **in-process** (`resumeRun`,
  `runEditSession`), not as consumers of the daemon `stream:'progress'` frames the
  plan points them at; (3) **build-step has no streaming producer** — `build.run`
  isn't in sc1's `ProgressOperation` union. Wiring progress to build-step targets
  a producer that does not exist.
- **s1 t9 (#53)** — the workflow.run integration/conformance deliverable (the
  "sole proof of ac3") is premised on reusing an "existing `stream` method at
  `workflow-rpc.test.ts:42`", which is actually an unused `throw new Error('unused')`
  provider stub. The same misresolved anchor also weakens t6/t7. Fix: build a real
  `runStart`/`runWorkflowServerSide` capture harness; strike the phantom anchor.

## Root-cause taxonomy (what a review cycle must catch)

1. **Stale / truncated inventory** — counts and producer lists taken from
   truncated or mis-scoped greps. *Exemplar:* s1 t1's "four IpcStreamMessage
   producers" (a fifth, `workflow-rpc.ts:206`, was whitespace-hidden). *Systemic
   confusion:* the plans conflate two different sets — `send:(msg:IpcStreamMessage)`
   producers (~5 sites) vs `stream:'progress'` emitters (~15 sites); s1 t1 used the
   first, s3 t3/t8 the second, and both cited the wrong members.
2. **Wrong-referent citation** — a `file:line`/symbol that *exists* but points to
   a semantically irrelevant entity. *Exemplar:* s1 t6/t7/t9's `workflow-rpc.test.ts:42`
   `stream` — the graph index resolved the wrong `stream` symbol (an unused stub).
3. **False external-contract assumption** — a premise about an out-of-process
   contract never verified against its real definition. *Exemplar:* s2's MCP
   `progressToken` delivery (SDK `extra` arg, per `@modelcontextprotocol/sdk`).
4. **False in-repo seam** — assuming a local module is a certain kind of surface.
   *Exemplar:* s3 t2/t12's `cli/client.ts` "streaming attach point" — it's a
   **unary** request/response helper (`client.ts:11-48`, closes on first line);
   the real stream consumer lives in the IDE fork.
5. **Semantic gap** — a type that can't hold the data it's fed. *Exemplar:* s1 t3
   — analyze's only token event carries a `preview` text tail with **no count**,
   which `TokenProgressEvent` has no field for.

## Recommendation for the streaming build

- **s1** — build task-by-task; apply targeted fixes to t6/t7/t9 (real capture
  harness, drop the `:42` phantom) and add an LLD note on t3's token-mapping gap.
- **s2** — **re-scope t6–t8** (and the tests t9/t11 that cover them) before
  building: establish the real `progressToken` seam (SDK `extra` in `server.ts`
  registrations) and drop build-step from the progress rollout, or add a
  `build.run` streaming op + union member first. t2–t5, t10 are safe.
- **s3** — gated on s1 landing the four sc1 types (t4 correctly HALTs until then);
  honor t2's finding that `cli/client.ts` is unary, so treat client-side attach +
  abnormal-close (t9/t12/t15) as fake-client/deferred. 0 tasks are out-of-repo.

## Cross-check note

The three auditors independently converged on the same producer-inventory
confusion (s1 t1 ↔ s3 t3), which is strong evidence it is a systemic plan defect,
not a one-off — and the reason a grounded review cycle belongs in the workflow,
not in a human's spare attention.
