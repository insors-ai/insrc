<!-- insrc:artifact ISSUE-97adabf6bd47b036 -->

# Apply catalog model and effort choices in daemon and VS Code

## Reproduction

In a daemon tier or a VS Code chat, select a Vibe catalog model with a listed non-default effort and run a turn. Both adapters accept the effort in their inputs but omit it when starting Vibe. Separately, open a chat while the daemon catalog request fails and reconnect the daemon. That panel can remain at provider-only choices because it fetched definitions once. Switching from a model with a selected effort to a model with a different effort list can also retain the prior value. A read-only check of the running daemon returned the model and effort catalog and resolved this repository's build and review roles to GPT-6.1 Sol at medium effort.

## Root cause

The registry and models.definitions projection already publish the catalog. The daemon CliProvider and the VS Code Vibe adapter launch with a model selector but omit the effort. The VS Code chat host handles catalog load failure by logging it and retaining empty model lists, with no retry. Its run configuration mutation independently stores model and effort, so the selected model's catalog limits are not enforced together.

## Fix intent

Make the supported catalog choices observable and effective in both daemon and VS Code. Verify the installed CLI's model and effort mechanisms and apply supported selections consistently, with an explicit unsupported result if a choice cannot be applied. Retry chat catalog loading after a transient failure and reconcile effort when the selected model changes. Cover transport and picker regressions without editing the existing daemon configuration.

## Citations

- **[[c1]]** `code` `src/assets/models/cloud-model-catalog.json`
- **[[c2]]** `code` `src/daemon/model-definitions.ts:147`
- **[[c3]]** `code` `src/agent/providers/cli-provider.ts:715`
- **[[c4]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1023`
- **[[c5]]** `code` `vscode-plugin/src/chat/chat-panel.ts:326-336`
- **[[c6]]** `code` `vscode-plugin/src/chat/chat-panel.ts:3221-3234`
