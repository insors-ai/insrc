# Understanding service consumer contract (version 1)

The daemon owns records, identity, storage and lifecycle. The VS Code editor pane is the next consumer; no editor UI is delivered by this foundation story.

`consumer-fixtures-v1.json` contains synthetic examples for strict client decoders. Shared runtime schemas live in `src/shared/understanding.ts`. Treat unknown versions and disconnected streams as unavailable and refresh; never retain cached commit readiness across reconnects.

## Requests and observations

The registered routes are `understanding.prepare`, `resume`, `list`, `history`, `cancel`, `delete`, `requestOverride`, and streaming `watch`. Nonstream responses sit inside the normal JSON-RPC result and use `{protocolVersion,ok,value,appliedRevision?}` or `{protocolVersion,ok:false,error,current?}`. A revision conflict includes the current projection only for its owner.

Mutation envelopes require a request UUID, assessment ID, expected revision and exact historical scope. An exact retry is checked against the stored request hash and applied revision and returns current state without another write. A changed payload conflicts. Preparation generates a daemon assessment ID; after deletion, repeating preparation can create a new empty assessment, but callbacks for the deleted ID cannot resurrect it.

Watch requests set `stream:true`. Domain events are `progress` frame data, never new stream kinds. Every snapshot contains the complete public projection. Ignore older/equal revisions, and reconnect with a fresh projection even when supplying `afterRevision`. Deletion and deliberate shutdown produce a final domain event followed by exactly one `done`; failures produce one terminal `error`. Disconnect aborts observation, not the assessment. Current identity is checked on refresh, including a 30-second periodic refresh while idle.

List pagination uses assessment UUIDs within the current OS principal, learner and repository. History pages use immutable answer sequence numbers; page sizes are 1–100. Client data cannot supply learner identity, scores or eligibility.

## Privacy and startup

Service construction checks the actual active LMDB data/lock path and socket ownership and permissions, independent assessment schema, and required role descriptors. It recovers interrupted jobs before publication. History remains local until deletion, without sharing or retention expiry. Shutdown attempts final-frame delivery for at most 1000ms; forced exit and broken sockets cannot guarantee delivery.

The identity adapter evidence is in `identity-sources.md`: GitHub stable IDs use existing authenticated CLI metadata; GitLab/Jira integrations are explicitly missing. Multiple or unavailable identities fall back to repository Git email, then OS identity. Case is preserved and identities are never automatically merged.

## Sibling integration seams

- s2/s6 install trusted policy/evidence and Git scope capture through the RPC factory's optional capture dependency. Production preparation currently returns `unavailable` until these exist.
- s3/s4 register validated internal transitions and answer payload schemas. Current storage keeps original and assisted attempts separate; client input never chooses privileged transitions.
- s6 owns receipts and final Git enforcement; s7 owns explicit overrides and commit-message recording. This foundation issues no receipt and never grants a pass. Override requests remain unavailable.
- s5 consumes the shared result/event schemas and supplied fixtures in an editor pane.

No direct cloud REST, model calls, workflow status updates or tracker writes are introduced here. Existing service tests cover atomic retries, conflicts, rollback, recovery and deletion; the acceptance test kills a separate writer process after acknowledgment and verifies recovery and unchanged canonical DEF/PLAN/BUILD bytes and delivery-handler state.
