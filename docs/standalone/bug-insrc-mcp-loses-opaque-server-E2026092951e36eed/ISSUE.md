<!-- insrc:artifact ISSUE-51e36eed6c638c8a -->

# Workflow `state` token dropped on long turn-by-turn runs, forcing a stage restart

## Reproduction

Drive a long insrc workflow stage turn-by-turn through `insrc_workflow_step` (observed twice on a design.epic/HLD run, which has many `step` turns and heavy controller reasoning between calls). Mid-stage, a subsequent phase call fails with StateTokenNotFound ("workflow state token '<...>' not found: server restarted, TTL expired, or the run was already completed. Restart with phase='start'.") even though the MCP server never restarted and the run was not completed. Observed: the opaque `state` token stops resolving and the whole stage must restart from phase='start', losing the in-progress (partially synthesized) artifact. Expected: a long turn-by-turn run survives realistic inter-turn gaps and normal per-run turn counts without the active token being evicted.

## Root cause

The `state` token is backed by a process-local in-memory Map in the MCP server (NOT the daemon and NOT the ~/.insrc/daemon.sock IPC — so the 'IPC run timeout' candidate is ruled out). The store has two eviction paths: a hard `MAX_ENTRIES = 100` LRU cap and a 1-hour TTL keyed on each entry's `touchedAt`, both applied by `sweep()` which runs at the top of every `saveState`. Two compounding factors cause the active run's token to be evicted on a long run: (1) every intermediate turn (`plan`, each `step`) calls `saveState`, which MINTS A NEW token, but `releaseState` is only called at the TERMINAL `synthesize` phase — so each turn LEAKS its now-superseded token, and a long multi-step stage (plus chained stages within one session) inflates the store toward the 100-entry cap, at which point `sweep()`'s LRU eviction deletes the least-recently-touched entries; (2) the 1-hour TTL is refreshed only when a token is loaded, so a long inter-turn gap (heavy controller reasoning between two phase calls) can let the active token cross the TTL and be swept. Either path makes `loadState` return undefined → StateTokenNotFound → forced stage restart. The same LRU+TTL pattern is duplicated across four near-identical stores (workflow-step, analyze-step, review-step, code-review-step), whose own docstring notes the TTLs/caps 'may drift', so any lifecycle fix must be applied deliberately and reconcile with the existing retry-safety property where code-review-step already releases a token on consume (so a resend fails, preventing a double-write).

## Fix intent

Make a long turn-by-turn workflow run survive realistic inter-turn gaps and normal per-run turn counts without the ACTIVE token being evicted — by hardening the state-store lifecycle so intermediate turns no longer leak superseded tokens into the LRU/TTL pressure, and so the active run is not dropped mid-stage. The exact strategy (e.g. release the superseded token when the next state for the same run is saved; and/or re-key a run to a single slot; and/or soften the caps/TTL; and/or refresh-on-save) is a design decision to be made in the LLD, reconciled across the four parallel stores and against the existing release-on-consume retry-safety property — not decided here. No behavioural change to a healthy short run; the token contract (opaque, single controller holds the latest) is unchanged.

## Citations

- **[[c1]]** `code` `src/mcp/workflow-step/state-store.ts:27` — "const MAX_ENTRIES = 100; const TTL_MS = 60 * 60 * 1_000; — the in-process Map store's LRU cap + 1h TTL."
- **[[c2]]** `code` `src/mcp/workflow-step/state-store.ts:91` — "sweep(): deletes entries whose touchedAt > TTL_MS, then LRU-evicts the least-recently-touched down below MAX_ENTRIES; called at the top of saveState."
- **[[c3]]** `code` `src/mcp/workflow-step/state-store.ts:52` — "loadState throws StateTokenNotFound when store.get(token) is undefined — the forced-restart path."
- **[[c4]]** `code` `src/mcp/workflow-step/phases/synthesize.ts:91` — "releaseState is called only at the terminal synthesize phase — intermediate turns mint via saveState (state.ts:88) but never release, leaking superseded tokens."
- **[[c5]]** `code` `src/mcp/code-review-step/handler.ts:493` — "releaseState(token) on consume: 'a resend of this token fails loadState (no double-write)' — the retry-safety property any release-on-read fix must preserve."
- **[[c6]]** `code` `src/mcp/analyze-step/state-store.ts:56` — "The same MAX_ENTRIES=100 + 1h TTL LRU pattern is duplicated across the analyze / review / code-review step stores (docstring: TTLs/caps 'may drift')."
