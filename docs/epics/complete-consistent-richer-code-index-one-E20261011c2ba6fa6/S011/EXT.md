<!-- insrc:artifact EXT-c2ba6fa62a148ed1-s11 -->

# Extend: complete-consistent-richer-code-index-one — The step tools run inside the daemon, and the MCP server opens no store

> **Extends Epic `complete-consistent-richer-code-index-one`** — this builds on existing docs + code; no new Epic was created.

**Scope:** L   ·   **New Story:** `s11`

Extends Epic `complete-consistent-richer-code-index-one` (c2ba6fa62a148ed1), building on its definition and high-level design and on Story s4's design: the step tools that today run in the MCP server's process and read the live store directly are moved into the daemon, so that s4's rule that only the daemon opens the live store can be switched on.

## Added Story

### s11: The step tools run inside the daemon, and the MCP server opens no store

**User value:** An analysis, a workflow step, a review or a triage asked for from a client session is carried out by the daemon, so no client session's process ever holds the live store open, and a run in progress is not lost when the session's MCP server process restarts.

**Acceptance criteria:**
- **ac1:** Given a client session and a running daemon, when an analyze step, a workflow step, a build step, a review step, a code-review step or a triage step is called from the session, then the step's lookups and its reads and writes of the store happen in the daemon, the result returned to the session is the same as before, and the MCP server's process holds no descriptor on the live store.
- **ac2:** Given a multi-turn run that has received its first reply, when the session's MCP server process exits and a new one starts before the next turn, then the next turn is accepted with the state token from the first reply and the run continues.
- **ac3:** Given a client session and no running daemon, or a daemon that does not know the request, when a step tool is called, then the call returns a named error that says the daemon is not reachable or is too old, and nothing is read from the store by the MCP server's process.
- **ac4:** Given the source tree after this change, when the files under the MCP server's directory and everything they import outside the daemon's request client are scanned, then none of them opens the graph store or the vector store.
- **ac5:** Given a step that needs the client's own model to answer a prompt, when the daemon returns that prompt, then the prompt, the schema and the state token reach the client unchanged, and the reasoning still happens in the session, as it does today.

## Building on

- `code` src/mcp/server.ts:402 — async (rawArgs, _extra) => handleAnalyzeStep(rawArgs),
- `code` src/mcp/analyze-step/phases/narrow.ts:30 — import { putCachedExploration } from '../../../db/exploration-cache.js';
- `prior-artifact` docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/DEF.md — Only the daemon opens the stores; every new read or write is reached through the daemon.
- `prior-artifact` docs/epics/complete-consistent-richer-code-index-one-E20261011c2ba6fa6/S004/LLD.md — The live store opens only in a process that has declared itself its owner

## Next

Proposed HLD amendment `AMD-c2ba6fa62a148ed1-1` (pending approval — it adds the new Story's boundary).

Approve the HLD amendment (`AMD-c2ba6fa62a148ed1-1`) and the updated Epic, then run `design.story` for the new Story `s11` to produce its LLD.

```
insrc_workflow_step phase=start workflow=design.story params={"epicHash":"c2ba6fa62a148ed1","storyId":"s11"}
```
