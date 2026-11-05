# Claude-on-Ollama chat routing

Approved defect: [ISSUE-ee9a582d9f5a6c00](../../route-vs-code-claude-chat-requests-E20261105ee9a582d/ISSUE.md).
Build: `45e743550d9596c3/S001`.

Selecting an Ollama-hosted model in VS Code chat previously passed its model name
to Claude without changing the endpoint. The chat adapter now resolves the model
against daemon definitions at every launch. An Ollama-hosted model receives the
configured `models.local.host` in the child environment, with Ollama authentication
placeholders and vendor OAuth/Bedrock/Vertex routing removed from that copy only.
Vendor/default calls retain inherited environment behavior. No daemon configuration
or parent environment is changed.

## Relationships and compatibility

- Extension activation owns one provider registry. Each Claude launch with an explicit
  model reads `models.definitions`; an Ollama target additionally reads `config.show`
  through the existing configuration gateway. No new IPC method or database access.
- Definitions associate each served model/alias with one family. Missing, rejected,
  ambiguous or incomplete targets fail without spawning a process. Hosted aliases
  use the model's canonical ID. The host is resolved from daemon configuration;
  the webview never supplies endpoint or authentication data.
- The same registry serves initial turns, native-session continuation, approval
  follow-ups and one-shot title generation. Targets are resolved at launch, so no
  session-store migration or webview protocol change is required.
- A pure shared environment helper is used by both the backend `CliProvider` and
  the extension adapter, preserving the existing backend routing behavior.
- Lifecycle and title cancellation predicates remain valid through asynchronous
  routing/configuration lookup. A stopped/detached turn or expired title cannot
  launch a child after that lookup eventually completes.

## Verification

Focused fake-spawn regressions cover local/cloud models, aliases, configured/default
hosts, vendor isolation, resolution failures, initial/resumed/follow-up/title calls,
and cancellation while lookup is pending. The affected chat suite and existing
backend Ollama provider tests are also run, with plugin and backend typechecks.
Raw results are saved under `evidence/` when validation completes.

The existing hosted-model menu layout is retained. No new provider, model list,
dependency or global environment setting is introduced. Live model inference and
rendered UI behavior are not claimed by the fake-process tests.
