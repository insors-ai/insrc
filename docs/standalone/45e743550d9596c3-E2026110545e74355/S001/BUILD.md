<!-- insrc:artifact BUILD-45e743550d9596c3-S001 -->

# Build (standalone trivial) — Story S001

**Size class:** trivial  ·  **Standalone:** yes  ·  **Created:** 2026-11-05T10:08:40.649Z

**Commit:** f4ca47c02

## Scope

Route VS Code Claude chat requests to the selected Ollama host

In VS Code insrc chat, select Claude and deepseek-v4-pro:cloud, then send a message. Claude reports: "There's an issue with the selected model (deepseek-v4-pro:cloud). It may not exist or you may not have access to it." The same model works from the user's CLI. The recorded chat stderr contains [claude-code:unrecognized_model], while the initialization event reports the insrc MCP server connected. A no-model-call diagnostic using createProviderRegistry confirms the launch passes the selected model but no explicit ANTHROPIC_BASE_URL or Ollama auth override. Expected: selecting a model served by the ollama-claude family runs Claude against the configured Ollama server, including subsequent turns and continuations; selecting a vendor model retains vendor routing. [c4][c5]

The VS Code chat path is separate from the backend CliProvider. runCatalogView merges models from families sharing cliKind into one provider view and retains only id/name/alias/efforts, so Ollama family/host/hosting information is lost. createProviderRegistry builds the chat StreamAdapter; its Claude launch passes --model but has no Ollama environment routing. By contrast, the backend CliProvider already accepts an Ollama target and applies child-only ANTHROPIC_BASE_URL/AUTH_TOKEN/API_KEY overrides while removing vendor OAuth and Bedrock/Vertex overrides. The VS Code extension constructs the unconfigured chat registry and therefore relies on its inherited environment rather than the selected model's served target. [c1][c2][c3][c4]

Resolve the selected Claude model's trusted served family and hosting against the daemon's model definitions and configured Ollama host at launch. Run Ollama-hosted chat turns with isolated child environment overrides equivalent to the existing backend path; preserve ordinary vendor behavior and avoid changing process.env or daemon/model configuration. Apply the same routing to initial, subsequent/resumed, approval follow-up and title-generation calls. Refuse unresolved hosted targets instead of silently falling back to a vendor endpoint. Add focused fake-spawn regressions covering local/cloud hosting, configured host, vendor environment isolation and continuation/title behavior. [c1][c2][c3]
