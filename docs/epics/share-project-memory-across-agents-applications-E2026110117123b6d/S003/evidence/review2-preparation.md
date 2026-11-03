# S3 design review round two preparation

This records author corrections, not an independent review verdict. The original
daemon review is preserved in [review-round1.json](review-round1.json).

| Round-one blocker | Correction in the revised LLD |
| --- | --- |
| coverage-of-intent.1 | PersistedPayloadV1 defines strict per-kind payloads, immutable lineage, mutation reasons, source events, processing versions and generated affected-revision receipts. LifecycleTransitionV1 specifies statuses and allowed transitions. |
| change-sites.1 | OwnedStoreWorkAndStartupRollback specifies the existing OwnedWork adapter, pending/native/read ownership, queue-before-store shutdown, proof availability and partial-startup cleanup. Existing host-node.ts and runtime.ts are explicit change/verification sites. |
| change-sites.2 | StandalonePackagingChangeInventory names package.json, package-lock.json and existing packed.test.ts dependency/output assertions and native-absence tests. |
| data-compatibility.2 | ER source now draws each parent-to-Evidence relationship once; each Evidence has required revisionId/sourceId foreign keys. Both parents permit multiple Evidence rows. |
| tests.2 | Test strategy includes real isolated index reset/rebuild, memory-cleanup preservation, pending-event oracles and overlap refusal. S7/S9-dependent operations remain explicit AC29 completion gates; S3 gains no public reset API. |

Validation performed: workflow schema acceptance, generated-source inspection,
and git diff --check. The revised ER and sequence were rendered with local
headless Chrome and both screenshots inspected. See [ER](review2-er.png) and
[sequence](review2-sequence.png); the latter uses a wide viewport to show all
six participants and all eighteen messages. This validates diagram rendering,
not store implementation, crash durability or platform parity.

Rendering exposed an existing shared renderer defect: raw @font-face CSS was
emitted outside a style element. The artifact-only, idempotent
[prepare-companions.mjs](prepare-companions.mjs) wraps that generated CSS in
these two documents. It does not change their definitions, relationships or
messages. Re-run it after regeneration until the renderer is repaired in its
own tracked change. No production framework source or configuration changed.

The native Lance macOS/Linux durability gates and S7/S9 integration gates
remain outstanding build evidence, as described in the LLD.
