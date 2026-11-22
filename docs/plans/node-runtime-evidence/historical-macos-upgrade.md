# Real historical macOS source upgrade qualification

Story `a03e99e17a364550/s1`, task t9. Canonical live qualification and affected regressions passed. Registered task validation is pending; story BUILD approval remains deferred until all tasks are built and tested.

## What is real

The fixture checks out unmodified historical commit `a30aa7f91a50409e129b0af25ff3d897be1b45b6`, installs its actual lockfile dependencies and builds its actual output. The current independent installer provisions and verifies the official Node 22.22.1 archive and npm 10.9.4. No npm observer, fake daemon, replacement runtime-owner lookup or database adapter substitutes for the application.

The canonical run starts the historical daemon using external development Node 22.23.2. Migration must select the distinct owned Node 22.22.1 executable. Subsequent updates preserve that owned runtime. Candidate source is the current implementation plus fixture-only signed compatibility metadata; the readiness-failure variant additionally exits during probation startup. All private signing material stays in the isolated temporary fixture; it is not production release authority.

Data is seeded and compared through daemon IPC: registered repository/function entities, a conversation turn, its Lance vector search result, session summary, repository settings and a retained custom configuration field. Clients never open the stores. A loopback Ollama protocol fixture supplies deterministic vectors; this does not qualify an embedding model's quality. A separate real ONNX CPU session executes a tiny Identity graph and checks its output. The native smoke loads tree-sitter, LMDB, fs-ext, LanceDB and DuckDB from the actual release dependencies.

## Preliminary observations

- `/private/tmp/insrc-historical-mac-YhRfmb4f`: actual historical npm/build, five native loads and CPU ONNX passed. First cutover was refused before mutation because the test launched the historical entrypoint relatively; admission correctly required its installed absolute launch recipe. The owned historical process closed after IPC shutdown.
- `/private/tmp/insrc-historical-mac-3TsdwkGQ`: corrected absolute recipe upgraded historical source to current and then updated again, with identical IPC snapshots. An actual fs-ext compiler failure retained the same live prior PID, selector and data. A signed application startup fault produced `rolled-back: candidate exited before probation readiness`; a clean retry and selected shell restart passed. This preliminary run used the same owned Node for predecessor and candidate, so it does not establish the distinct external-runtime transition.
- That preliminary run's MCP check exposed a production gap: the generated macOS migration dispatcher executed its pinned interpreter before clearing `NODE_OPTIONS`/`NODE_PATH`. Hostile injection therefore failed before MCP initialization. No MCP success is claimed for this attempt. Its daemon and idle supervisor were subsequently closed through their existing lifecycle owners.

Commit `c494e343d` corrects the dispatcher producer. New launchers clear both variables before Node. Recovery still recognizes the exact older producer format for already published transaction fences; no journal version or authority changes. Canonical run `790e8d95-7a29-4e3d-8bf0-70760129a7dd` passed all four legacy-cutover tests without skips, including execution of all four generated launchers under hostile injection and older-fence recovery. Cleanup recorded `confirmedClosed: true` with no cancellation/evidence errors.

## Canonical live run

Run `5ec26117-36cd-4cba-bf58-1f8436543ca8` uses the supported Node22 coordinator, explicit `INSRC_LIVE_TESTS=1`, serial file admission, a 60-minute file ceiling and a 120-minute run ceiling. Its real fixture is `/private/tmp/insrc-historical-mac-dM4Z0T`; per-file TAP and controller records are under `.insrc/tmp/test-harness/runs/5ec26117-36cd-4cba-bf58-1f8436543ca8/`.

Both live cases passed without skips. The real upgrade/fault/MCP case took 1,339 seconds. The historical external-22.23.2 to owned-22.22.1 transition committed at `2026-11-22T11:49:53.890Z`; the subsequent update committed at `2026-11-22T11:54:06.469Z`. Every IPC comparison passed. The native compiler failure preserved the prior's full PID/start-time/executable incarnation. The startup-failure candidate rolled back at `2026-11-22T12:00:56.255Z`; the clean retry and selected shell restart passed.

MCP initialized through the generated migrated-root launcher under hostile Node injection and no ambient Node. Its real child executable was the owned distribution, and native process inspection confirmed its arguments named selected release `2930232b003e1cea013547e84d8201b2ff46c7f7`'s `out/bin/insrc-mcp.js`. The real MCP schema endpoint replied. The client, daemon and supervisor then closed through their existing owners.

The same run passed four legacy-cutover cases and two authenticated managed-development proof cases. Its old macOS routing test failed because it still expected IDE updates to fast-forward and build the incumbent without source authority. That obsolete fixture was corrected to check the independently delivered installer, managed/unmanaged routing, issuer denial propagation and incumbent preservation. Focused run `dac378b8-8e0d-4aa2-b42b-89c31049632f` passed both updated routing cases and the JetBrains native bootstrap integration, with no skips. Production runtime code was unchanged after the successful live run.

Both coordinators recorded `confirmedClosed: true`, `interrupted: false` and empty cancellation/evidence errors. An additional final process and same-user open-file census found **zero** processes or open paths under the live fixture. Its `qualification-summary.json` inventories four actual staged source commit/tree identities and SHA256 digests of the command, native, IPC and MCP evidence. The summary digest is `fe388f9d59eaffc85488e417cf3e859152ba1b1a803bc78eecde8615db6e0e45`. These are fixture qualification receipts, not production promotion receipts. No source/runtime verification, actor ownership, journal schema or managed trust policy was replaced.

`tsc --noEmit` and `git diff --check` passed after the fixture correction. The complete backend sweep remains the final story regression.

## Limits

The user daemon/store is outside every fixture HOME and is not upgraded or stopped by qualification. Fixture trees and heavy native builds are outside the indexed repository. The installed watcher/V8 crash described in `ide-consumers.md` remains a separate unresolved finding. This work adds no Mac PID/IPC shutdown fallback, unsupported platform or production signing key. Linux historical qualification remains tasks t10–t11; final backend regression and release documentation remain task t12. Production promotion still requires the operator's signed exact-head artifacts and valid qualification/consumer evidence.
