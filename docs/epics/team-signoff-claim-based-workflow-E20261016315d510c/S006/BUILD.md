<!-- insrc:artifact BUILD-315d510cb28100e2-s6 -->

# Build (plan-driven) — Story s6

**Standalone:** no  ·  **Created:** 2026-10-18T17:06:54.425Z  ·  **Updated:** 2026-10-18T17:39:37.745Z

**Commit:** 35e5c249

## Summary

A checkpoint that quotes the parker's path cannot be valid any more, and the only builder of one removes it. handoff.ts: (1) buildRunCheckpoint(input) is the single constructor of a run checkpoint from a live payload: it drops repoPath, repoIndexedAt and the executor's own intent, and runs the params, focus, executor state and step outputs through portablePaths with the payload's own repoPath, which replaces the parker's path with REPO_ROOT_TOKEN in every string and in object KEYS (mapStrings now maps keys too); it sets portable: true. (2) Both checkpoint variants carry portable: true and validateCheckpoint refuses one without it ('not made portable'), so a hand-built or edited checkpoint cannot reach rebind as valid. (3) rebindCheckpoint maps every REPO_ROOT_TOKEN, in strings and keys, in the intent, executor and step outputs to the receiving clone's path and sets repoPath/repoIndexedAt on both intents and the clock. The third named test now runs the whole chain: a live awaiting_llm_step payload whose focus, params, plan step params, step output text and a step-output KEY all contain the parker's full path is built, serialized, validated, and rebound onto a different path; the built checkpoint's JSON contains no parker path, has no repoPath/repoIndexedAt/executor intent, and the rebound payload has the receiving path in all those places, no token and no parker path anywhere; keys are rebound too. The second named test adds the not-portable refusals for both variants. Earlier fixes are unchanged (normal-form path containment, committed-at-HEAD inference tested in a real git repo, sibling-path 'repo2' left alone). handoff-pure passes (3), tsc clean.

## Tasks validated

- ✓ `t1`
- ✓ `t2`
- ✓ `t3`
- ✓ `t4`

**Tests:** [TESTS.md](TESTS.md) — what the gate ran for each Task, and what each test case did.

## Changes

- `src/cli/__tests__/settings-modal.test.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/config/__tests__/fixtures/repo-fields-catalog.json` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/config/__tests__/repo-fields.test.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/config/repo-fields.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/daemon/steps/workflow-step/__tests__/handoff-ownership.test.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/daemon/steps/workflow-step/__tests__/state-store-meta.test.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/daemon/steps/workflow-step/phases/start.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/daemon/steps/workflow-step/state-store.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/daemon/steps/workflow-step/state.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/workflow/team/__tests__/handoff-pure.test.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/workflow/team/__tests__/park-offer.test.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/workflow/team/__tests__/snapshot-upstream.test.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/workflow/team/gate.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/workflow/team/handoff.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
- `src/workflow/team/run-meta.ts` — **insrc-build** (2026-10-18T17:39:37.745Z)
