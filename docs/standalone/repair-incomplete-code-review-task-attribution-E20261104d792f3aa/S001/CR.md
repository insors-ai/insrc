<!-- insrc:artifact CR-d792f3aa6f135f1c-s1 -->

# Code review: s1

Status: **passed** · task-based schema version 2

## attribution-repair-1793769161035 — attempt 1

Scope: whole story · reviewer: daemon · 2026-11-04T05:59:42.748Z

1 selected task assessment(s): passed.

### Submitted scope

- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/__tests__/coordinator.test.ts` — [{"after":[203,320]}]
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/assessment.ts` — [{"after":[19,19]}]
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/attribution-repair.ts` — [{"after":[1,17]}]
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/contracts.ts` — [{"after":[90,90]},{"after":[107,107]}]
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/controller.ts` — [{"after":[1,1]},{"after":[65,69]}]
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/coordinator.ts` — [{"after":[1,1]},{"after":[14,14]},{"after":[213,219]},{"after":[227,240]},{"after":[244,244]}]
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/packet.ts` — [{"after":[199,201]}]

### s1: passed

Verified commit 0490b4db61d46239f0aa311aeb946e2dedd07170 against ISSUE-d792f3aa6f135f1c's rootCause/fixIntent and the acceptance check. The fix: (1) attributionPrompt now explicitly requires unchanged/cross-engine regression evidence (assessment.ts:19); (2) deriveTaskAssignments reports precise omitted change/test indexes+paths instead of a generic error (packet.ts:199-201); (3) a new attribution-repair.ts introduces a shared MAX_ATTRIBUTION_SUBMISSIONS=3 budget and recordAttributionRejection, persisted in the checkpoint header (contracts.ts attributionRepair field, min 1/max 3), consumed identically by both the native coordinator loop (coordinator.ts) and the controller route (controller.ts), so the budget survives disconnect/resume and is never reset. I traced the coordinator's retry loop and the controller's scope() handler line-by-line against all 9 new tests and confirmed: only TaskReviewInputError (attribution-shape rejections, including the ReviewOutputFailureError-wrapped host-validation variant) triggers a retry — generic CLI/timeout failures are rethrown unchanged, preserving "no general retry" and existing failure-continuation tests. Replay of the same envelope/sequence is idempotent (no extra rejection); a persistence failure during recordAttributionRejection restores the prior header value and aborts dispatch without fabricating task failures. I ran all 7 builder-named test files individually (47 cases total) and they pass, and a full tsc --noEmit typecheck is clean.

Coverage: **verified** — The new coordinator.test.ts cases exercise both the success-after-correction path and the full-exhaustion path on the native route, the controller route's scope()/submit() exchange with replay protection and disconnect/resume survival, the real ReviewOutputFailureError host-validation wrapper, the packet.ts omission-diagnostic message shape directly, and a save-failure during recordAttributionRejection that must not fabricate task failures. I read each test body and traced it against the implementation (coordinator.ts's for(;;) retry loop, controller.ts's scope() handler, attribution-repair.ts's rejection bookkeeping, packet.ts's missingChanges/missingTests computation) line-by-line rather than relying on graph edges, and independently ran all 7 builder-named test files (47 cases) plus tsc --noEmit, all passing. Coverage is complete for the stated fixIntent: regression-evidence wording, precise omission diagnostics, the bounded 3-submission budget shared by both routes, budget persistence across disconnect/resume, and non-retry of unrelated CLI/assessment failures.


Optional verification and advice (nonblocking):

- Optional execution: ran the 7 builder-named test files individually (47 cases, all pass) and a repo-wide `tsc --noEmit` (clean); did not run the full unrelated test sweep.
- Minor, non-blocking: in controller.ts's scope() handler, once the budget is already exhausted (rejections===3) and a further new-sequence scope submission arrives, requireReview throws before reviewAssignments runs and recordAttributionRejection is still invoked; it overwrites the stored attributionRepair.feedback with the generic 'Attribution correction budget exhausted' message (replacing the more specific prior feedback) and performs a redundant persist. Harmless given Math.min caps rejections at 3 and no test exercises this exact post-exhaustion extra call, but worth a one-line short-circuit if it's ever noticed in practice.

Inspected references:

- `0490b4db61d46239f0aa311aeb946e2dedd07170:.insrc/artifacts/ISSUE-d792f3aa6f135f1c.json`
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/__tests__/coordinator.test.ts`
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/assessment.ts`
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/attribution-repair.ts`
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/contracts.ts`
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/controller.ts`
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/coordinator.ts`
- `0490b4db61d46239f0aa311aeb946e2dedd07170:src/workflow/code-review/task-review/packet.ts`

Test: `npx tsx --test-force-exit --test src/workflow/code-review/task-review/__tests__/coordinator.test.ts` — pass
17/17 pass, 530ms total.

Test: `npx tsx --test-force-exit --test src/workflow/code-review/task-review/__tests__/attribution-scope.test.ts` — pass
3/3 pass, 1.15s total.

Test: `npx tsx --test-force-exit --test src/workflow/code-review/task-review/__tests__/controller.test.ts` — pass
4/4 pass, 1.3s total.

Test: `npx tsx --test-force-exit --test src/workflow/code-review/task-review/__tests__/diagnostic-persistence.test.ts` — pass
6/6 pass, 0.93s total.

Test: `npx tsx --test-force-exit --test src/workflow/code-review/task-review/__tests__/recovery.test.ts` — pass
5/5 pass, 3.13s total.

Test: `npx tsx --test-force-exit --test src/workflow/code-review/task-review/__tests__/previous-round-feedback.test.ts` — pass
7/7 pass, 2.78s total.

Test: `npx tsx --test-force-exit --test src/workflow/code-review/task-review/__tests__/contracts.test.ts` — pass
5/5 pass, 0.71s total.
