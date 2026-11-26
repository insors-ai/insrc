# S4/T3 prerequisite check

Task `TASK-c3d71313f34bce71-s4-t3` / insors-ai/insrc#298 received registered
implementation admission under approved PLAN2. No T3 source change has been
made while resolving the owner prerequisite below.

## Existing behavior

- `src/daemon/index.ts` eagerly imports shared paths, graph/storage and application
  modules before `main`/`declareLiveStoreOwner`. T3 must move application startup
  behind a dependency-minimal guard and dynamic import.
- `src/installer/runtime-policy.ts` constructs private runtime paths and pinned
  archive metadata; it does not resolve and verify an installed external runtime.
- `src/installer/manager-entry.ts` requires its release-local `tools/node`.
- `src/installer/installed-launcher.ts` selects that release-local Node for both
  launch and retry commands.
- `src/installer/bundle.ts` and `src/installer/safe-zip.ts` verify/require embedded
  `tools/node` inventory. `src/installer/dev-worker.ts` and
  `src/installer/dev-payload.ts` also require it.
- S002 LLD still expressly requires `tools/node` in the dev payload.

These are S1/S2 foundation responsibilities. HLD7 and S004 LLD6 instead require
one live-acquired verified external Node runtime shared by both delivery modes.
S4 must consume that real foundation, reject missing resolution and avoid a
second runtime installer, PATH fallback or fictitious production runtime peer.
The owner back-flow therefore precedes T3 production integration.

## Workflow status

T1 passed registered validation following PLAN2 approval. T2 is committed in
`6288fec05`; canonical Node22 targeted run
`0e62d2cf-1cad-4c0e-a189-1cb043e88f51` passed32/32 across five files with
confirmed actor cleanup. T2 registered checks/typecheck passed, but its verdict
withheld completion because it expects production consumers/import wiring
assigned to T3/T9. That failed verdict is retained; T2 has not been declared
complete or approved. Registered admission allowed moving to T3.

A T3 analyzer request containing a broad import-graph lookup did not return;
its local wait was terminated. Backend cancellation is unconfirmed. The source
findings above are direct reads/searches, supplemented by earlier completed S4
analyzer runs; no completed bundle is claimed for that stalled request.

A registered `design.story` start for S1 owner back-flow also failed to return
a state token. No new S1 design artifact has been produced or presented. Recent
daemon logs show thousands of `git_config` tool calls; causation has not been
established. The installed v2 daemon remains running on Node26.5.1 and has not
been stopped, restarted or modified by this work. Recovery requires overriding
the user's instruction to leave that daemon untouched.

No full test sweep, host daemon/Ollama change, workflow bypass, raw approval IPC
or untracked foundation implementation has been performed.
