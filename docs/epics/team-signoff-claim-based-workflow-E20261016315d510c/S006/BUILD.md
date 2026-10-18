<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:37:49.980Z

**Commit:** 3796d634

## Summary

The judge's last finding was that a parker path quoted inside params, executor state or step outputs would survive a rebind. handoff.ts now has REPO_ROOT_TOKEN ('<repo-root>') and portablePaths(value, parkerRepoPath), a deep copy that replaces the parker's absolute repository path, wherever it appears in a string (not a longer sibling like repo2 or repo.v2; a path ending a sentence is replaced), with the token; the park step (t6) will run the run's params, executor state and step outputs through it so a checkpoint never stores a machine path. rebindCheckpoint now maps every REPO_ROOT_TOKEN in the intent (focus, params), the executor state and the step outputs to the receiving clone's path, besides setting repoPath and repoIndexedAt on both intents and resetting startedAtMs. The third named test now includes step outputs that quote the parker's full path: portablePaths turns '<parker>/src/todos/filter.ts' and 'see <parker>.' into token form and leaves '<parker>2/other.ts' alone; rebind turns them into '/Users/bob/clone/...' for a checkpoint at awaiting_llm_step (executor.stepOutputs, intent focus and params) and at awaiting_synthesize (stepOutputs), with no token left and no parker path in the serialized payload. The earlier fixes (normal-form path containment, committed-at-HEAD stage inference tested in a real git repo) are unchanged. handoff-pure (3 tests) passes; tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✗ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:37:49.980Z)
