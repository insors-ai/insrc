<!-- insrc:artifact ISSUE-0764c4bcaa076f8e -->

# Resume frozen review publication after interruption

## Reproduction

Prepare a deterministic review run, claim its lease, and call RecoveryStore.requestCompletion. Reopen the same run with a replacement daemon process epoch, then claim a recovery lease. The current implementation refuses the claim while state remains completion-requested. Expected: a current exclusive owner can resume the same frozen publication and reconcile a lost canonical-write or receipt acknowledgment without repeating review work or publishing a second revision. No production engine activation is needed to reproduce this prerequisite gap. [c1,c2,c3]

## Root cause

RecoveryStore.claim delegates to foldRecoveryLifecycle, which rejects completion-requested alongside terminal states. The current recovery view also has no accepted immutable publication-intent binding, so a caller cannot recover the expected canonical revision/candidate identity safely across the two commit boundaries. S5 analyzer discovery located RecoveryStore; direct inspection of the reducer and deterministic reproduction confirm the gap. [c1,c2,c3]

## Fix intent

Deliver the sc4-owned publication-recovery capability already approved in AMD-c32aa60534232f36-1: preserve exactly one frozen intent/checkpoint, resume publication under the current owner, fence competing or late owners and refuse conflicting intent. Keep canonical coverage assessment and CR publication in S5, keep external rollout in S6, and prove crash/lost-ACK/concurrency behavior with deterministic tests. This record tracks the prerequisite to the approved S5 LLD, not a new review engine. [c3,c4]

## Citations

- **[[c1]]** `code` `src/workflow/code-review/investigation/recovery-store.ts`
- **[[c2]]** `code` `src/workflow/code-review/investigation/recovery-lifecycle.ts`
- **[[c3]]** `prior-artifact` `.insrc/artifacts/AMD-c32aa60534232f36-1.json`
- **[[c4]]** `prior-artifact` `docs/epics/review-planned-changes-through-agent-investigation-E20261028c32aa605/S005/LLD.md`
