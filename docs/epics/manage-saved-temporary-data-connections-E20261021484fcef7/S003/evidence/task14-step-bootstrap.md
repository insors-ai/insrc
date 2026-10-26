# S003 task 14 — trusted step authority and private MCP bootstrap

The existing stream handler now receives execution authority only through TrustedRpcContext. The owner mints one frozen, nonserializable tuple per request; the step host normalizes cwd/envRepo from its authenticated root and passes that exact tuple as the fourth runner argument. Caller context fields cannot supply or replace it. Request completion, disconnect and generation loss revoke use. Saved unattached step behavior remains unchanged. Provider mode is unsupported at this intermediate boundary; later tasks own admitted analysis execution and verified local provider evidence.

| Source | Target | Ownership / lifetime |
| --- | --- | --- |
| Current daemon owner | Request execution tuple | One tuple per admitted UI step, exact root/epoch/generation and live request. A WeakSet admits only minted object identity; copies/JSON cannot redeem it. |
| Step host | Runner fourth argument | Same immutable object, with an ALS denial guard against loss/replacement. Workbench-ui only; unverified reasoning refuses before runner dispatch. |
| Owner overlay | Step request drain | The existing use set retains actual request drainage; end waits for admitted work after synchronous cancellation. |
| Parent private pipe | MCP bootstrap snapshot | One current root-bound data token per child. Refresh aborts old snapshots; malformed/closed pipe keeps attachment required. No token in args/env/settings/state. |
| Each MCP forward call | Fresh daemon socket | Attach completes before step.call; epoch/root and mcp-unverified audience must match. UI/control tokens refuse before step forwarding. |

The fixed nonsecret --connection-session-pipe flag selects required inherited fd 3 bootstrap; it does not confer authority. Without the flag, ordinary saved MCP stays unattached. Missing/lost required bootstrap never falls back. The pipe is unreferenced so it does not alone extend process lifetime, and retains an error listener for late failures. Parent/workbench launching remains S005; this task provides the backend protocol, entry flag and forwarder.

Three new cases use real private Unix sockets and actual inherited pipe children. They verify the active fourth argument, immutable/serialized-copy refusal, completed-request refusal, ignored caller JSON authority, saved unattached control, attachment on every fresh socket, wrong epoch/root/audience/control-token refusal, pipe loss with no additional socket, and data-only refresh on the same pipe after control resume. Unverified calls never reach the fake runner. Source/step-host/forwarding/context regressions pass (23 cases), with six transport/bootstrap cases passing after the final unary-path guard. Both session inventory cases pass. Full build output is recorded alongside this evidence. Required sc5 hash closure now includes host, forwarder, bootstrap and MCP entry. Release remains ready:false/scopes:[]; no full sweep or real daemon restart.
