# Model and effort qualification

The daemon build and the VS Code build and bundle passed on Node 22.23.2. The implementation uses the existing daemon model catalog and applies explicit Vibe selections through the locally installed app server. Neither build was deployed.

## Installed Vibe smoke

Vibe 3.0.4 opened an isolated session with a temporary config and a loopback-only provider. The fixture default was `insrc-probe-default` at `low`. The shipped session verifier requested `insrc-selected-model` at `high`. Vibe reported the effective alias `insrc-probe-selected` and effort `high` from the running session. No prompt was submitted during this check.

The [saved probe output](vibe-selection-smoke.json) records the effective model, alias, effort and both configuration hashes. Run the probe from the repository root.

```sh
node --import tsx src/shared/__tests__/fixtures/vibe-selection-smoke.mjs
```

The fixture configuration had the same SHA-256 before and after the session.

```text
d0247b4f7a195a6ecb2288ebec91202babf5746083f4a3e72a4d6afddda544a6
```

A separate run used a localhost OpenAI-compatible fixture. The installed Vibe client made two requests to that fixture, one for a new turn and one after a native resume. Both requests selected `insrc-selected-model`, both streamed `local answer`, and the second reused the first native session ID. The fixture returned token-usage metadata for both calls. The temporary Vibe configuration remained unchanged.

## Build commands

```sh
npm run build
(cd vscode-plugin && npm run build && npm run bundle)
```

The daemon output contains the shared Vibe session verifier. The VS Code CommonJS extension bundle contains the same model mutation and turn interruption paths. The packaging test loads the normal bundle using a VS Code test shim.

## Release and manual checks

1. Deploy the reviewed daemon build and install the matching VS Code extension through the normal release process. Confirm `vibe-app-server` is on the same path as the installed Vibe CLI.
2. In the VS Code chat picker, select a supported Vibe model and a non-default effort. Send a turn, switch away and reopen the chat, then send a follow-up in the same native session.
3. Switch an unstarted chat between providers and change between models with different effort choices. Confirm the picker resets incompatible effort to default.
4. With a chat open, make the daemon catalog temporarily unavailable. Open the picker, reconnect the daemon, and confirm the model list returns without losing the transcript or interrupting an active turn.

These checks remain manual in an installed VS Code instance. The installed-CLI qualification above used local fixtures.

## Test sweep

The task validations preceded the full suite runs.

- VS Code from the repository root with `npx tsx --test --test-concurrency=1 --test-force-exit 'vscode-plugin/src/**/__tests__/*.test.ts'` finished with 1,740 passed, nine skipped and zero failures. The first parallel pass exposed a source-wiring assertion, a temporary-file race and a path resolved from the wrong directory. The wiring order was corrected and the serial rerun passed. An unrelated, uncommitted timer edit appeared in the shared checkout during that rerun. The review pins the committed story source without that edit.
- Backend with `npx tsx --test --test-concurrency=6 --test-force-exit 'src/**/__tests__/*.test.ts'` finished with 8,071 passed, 509 failed, 145 skipped, three cancelled and three TODO results. Two workers in unchanged files with no registered test cases hung and were terminated individually. The parent runner reported both interruptions and completed the remaining files. Failures include native process-capability denials, missing or stale review test references, and search indexing fixtures. Two timing failures passed when repeated in isolation. The focused Vibe tests passed. The remaining backend failures have not all been attributed.

After the full sweep exited, both build commands passed again. The local artifacts had these SHA-256 fingerprints.

```text
664d9b8eaf9c910730e426d16bfbe438cfcbaa2fa545ca46b3219c92f553973a  out/daemon/index.js
3e9984072accdbf290759d33307a4eaa761551974b7934b16051360b6a9beb49  out/shared/vibe-session.js
8dce4ee10e4b5d34018fa1d4774127e4bb4ac355b7c5e3432b83db48f281fe4d  vscode-plugin/out/extension.js
```
