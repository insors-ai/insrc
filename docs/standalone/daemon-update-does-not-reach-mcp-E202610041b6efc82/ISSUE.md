<!-- insrc:artifact ISSUE-1b6efc825063871b -->

# Updating the daemon does not update the MCP tools, and nothing says so

## Reproduction

Fix a defect in any code path an insrc_* MCP tool reaches, ship it, update the daemon, then call that tool.

Steps:
1. Commit and push a fix to a module the MCP tools use.
2. Run `scripts/daemon-ctl.sh restart`. It reports the fast-forward, the rebuild, and a new daemon pid.
3. Confirm the fix really is in the installed build — e.g. grep the compiled output under `~/.insrc/daemon/out/`.
4. Call the MCP tool whose behaviour the fix changes.

EXPECTED: the tool runs the code that was just installed.

OBSERVED: it runs the code from before the update. Verified live on 2026-10-04: a fix was committed and pushed (bc157a5), `daemon-ctl.sh restart` fast-forwarded c58a8718 -> bc157a51, rebuilt, and respawned; the fix was confirmed present in `~/.insrc/daemon/out/mcp/build-step/phases/validate.js`; and three successive `insrc_build_step` validate calls still produced the pre-fix result. The same input run through the fixed code directly produced the correct result, so the only difference was which process executed it.

Step 3 is a verification an ordinary reporter would not think to perform, so this reproduction is slightly privileged. It is written that way deliberately, because without it the report collapses into "my fix did not work" — which is the ambiguity this issue is about.

The secondary and more damaging half: nothing reports the mismatch. `daemon-ctl.sh status` prints the daemon's `installedCommit`, but no tool response carries the build the MCP process is actually running, so there is no value to compare it against. The operator sees a fix that was shipped, verified on disk, and still does not apply — with no signal distinguishing "the fix is wrong" from "the fix has not been loaded". That ambiguity is what makes it expensive: the natural response is to doubt the fix and keep editing code that was already correct.

## Root cause

The MCP tools do not talk to the daemon at all — they run in the MCP server's own process. `src/bin/insrc-mcp.ts` dynamically imports `../mcp/server.js`, and `src/mcp/server.ts` registers each tool against a handler it imported directly: the build-step tool's callback is `async (rawArgs, _extra) => handleBuildStep(rawArgs)`, where `handleBuildStep` comes from `./build-step/handler.js`. So the tool executes whatever module graph the MCP process resolved when it started, and holds it for the life of that process.

That makes a daemon restart structurally incapable of affecting it. `scripts/daemon-ctl.sh restart` stops the daemon, syncs the repo, rebuilds `out/`, and spawns a new daemon — all of which is correct and all of which is irrelevant to a separate, still-running MCP process. The script never signals that process, and does not mention MCP anywhere; a grep for `mcp` in it returns nothing. The MCP server is started by its client (an editor, or a CLI session) and outlives any number of daemon restarts.

The two halves are independent, and both are real:
  - the STALENESS: an already-running MCP process cannot pick up a new build, which is a property of how Node resolves modules and not something a signal can undo mid-process.
  - the SILENCE: nothing anywhere reports which build the MCP process is running. This is the half that turns a known operational step into a debugging session, and it is the half that is cheap to correct.

Note this is NOT the same defect as the plugin-side reload nudge: that work made the editor plugins prompt a user to reload after a daemon self-update. It does not cover a CLI-driven `daemon-ctl.sh` update, and a prompt is not a staleness signal — it fires on the update, not when a stale tool is actually used.

Two claims above rest on an ABSENCE rather than a citable line, and are flagged as such: that `daemon-ctl.sh` never mentions MCP, and that no tool response reports the running MCP build. Both were established by grep and both are re-checkable in a single command.

## Fix intent

Make the mismatch visible, so a shipped fix can never silently fail to apply.

The correction is a SIGNAL, deliberately not a reload. An already-running MCP process cannot reload its own module graph, so "make the update reach it" is not available without restarting the process, and the process is owned by its client rather than by us. What IS available is letting anyone — operator or tool caller — see that the running MCP build is older than the installed one, and the daemon already reports `installedCommit`, so one side of that comparison exists.

Two things should follow from it: the `daemon-ctl.sh` update and restart paths should say plainly that a running MCP client will keep serving the old build until it is reconnected, since the script is currently silent on the one step the operator still has to take; and the comparison should be observable from the MCP side rather than inferred, so the ambiguity between "the fix is wrong" and "the fix is not loaded" is resolvable without reading compiled output.

DELIBERATELY NOT DECIDED HERE — these belong to the fix stage:
  - WHERE the signal surfaces. A field on every tool response, a dedicated diagnostic tool, or a one-time warning on first use after a detected mismatch are materially different in noise and in blast radius, and the choice should be made deliberately rather than by whichever is easiest to add.
  - WHETHER a stale tool should refuse. Refusing is safer and would have saved the live debugging session above, but it can also block a caller who knowingly accepts the older build, so it is a policy question rather than a defect.
  - Whether the plugin-side nudge should be extended to the CLI update path, or left alone as a separate surface.

## Citations

- **[[c1]]** `code` `src/mcp/server.ts:589` — "async (rawArgs, _extra) => handleBuildStep(rawArgs),"
- **[[c2]]** `code` `src/mcp/server.ts:48` — "import { handleBuildStep } from './build-step/handler.js';"
- **[[c3]]** `code` `src/bin/insrc-mcp.ts:44` — "const { runInsrcMcpStdio } = await import('../mcp/server.js');"
- **[[c4]]** `code` `scripts/daemon-ctl.sh:19` — "scripts/daemon-ctl.sh restart    # stop then start"
- **[[c5]]** `code` `scripts/daemon-ctl.sh:16` — "Usage: ... start # sync origin, install if lock changed, build, start"
- **[[c6]]** `prior-artifact` `ISSUE-43d72766d3b9a2c1 / 93081bff91ae5108 S001 — the live reproduction` — "the fix was confirmed present in ~/.insrc/daemon/out/mcp/build-step/phases/validate.js, and three successive insrc_build_step validate calls still produced the pre-fix behaviour"
