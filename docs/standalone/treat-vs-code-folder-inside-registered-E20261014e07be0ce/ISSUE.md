<!-- insrc:artifact ISSUE-e07be0ce71346f66 -->

# Treat a VS Code folder inside a registered repo as that repo

## Reproduction

1. Register a repository with the insrc daemon, e.g. /home/subho/work/dev/insors/insrc.
2. Open a VS Code window on a folder inside it, e.g. `code -n /home/subho/work/dev/insors/insrc/vscode-plugin`.

Observed: the insrc plugin offers to register the subfolder as a new repository; accepting would enrol a second, nested repository in the daemon's registry. In that window the delivery board asks the daemon about the subfolder rather than the registered repository, and the review pane and the artifact reads look under the subfolder (e.g. vscode-plugin/.insrc/artifacts), so they find nothing.

Expected: a window on any folder inside a registered repository is treated as that repository — no registration offer, and the board, the review pane and the artifact reads all use the enclosing registered repository's root.

## Root cause

The plugin never asks which registered repository contains its folder; it treats the window's first folder as the repository root.

- The registration check (createWorkspaceRegistrar.state, vscode-plugin/src/workspace/registrar.ts:42) reads the daemon's repo.list and compares each row's path EXACTLY with the folder (`resolve(row.path) === target`). A folder inside a registered repository matches no row, so it reads as unregistered and runRegisterFlow (vscode-plugin/src/workspace/commands.ts) offers repo.add for the subfolder.
- extension.ts activate passes `vscode.workspace.workspaceFolders[0]` as the repository to every other repository consumer: the daemon-data gateway's artifactsRoot (:279), the docs-review client's repo (:577), the review pane's document watcher (:730) and companion reader (:746), and the delivery board's repo (:766).

The containment lookup the plugin needs already exists daemon-side: the `repo.resolveForCwd` IPC (src/daemon/index.ts:626) returns the registered repository whose path contains a given directory (most specific on nesting), and the MCP server resolves its session's repository through it (src/mcp/resolve-repo.ts, src/shared/resolve-repo-core.ts). The plugin does not use it.

## Fix intent

The plugin will work out, once per window and again when that can change (after a registration, or when the workspace folders change), which registered repository contains its folder, using the daemon's existing containment lookup rather than a second implementation in the plugin. A folder inside a registered repository will then count as registered, so no registration is offered, and the board, the review pane and the artifact reads will use that repository's root. A folder that is not inside any registered repository keeps today's behaviour: the registration offer, and the folder itself as the root. Registering still enrols exactly the folder the user accepts.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/workspace/registrar.ts` — "const registered = rows.some((row) => isRepoRow(row) && resolve(row.path) === target);"
- **[[c2]]** `code` `vscode-plugin/src/workspace/commands.ts` — "const current = await deps.registrar.state(root);"
- **[[c3]]** `code` `vscode-plugin/src/extension.ts` — "const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      return root === undefined ? undefined : join(root, '.insrc', 'artifacts');"
- **[[c4]]** `code` `vscode-plugin/src/extension.ts` — "repo: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null,"
- **[[c5]]** `code` `src/daemon/index.ts` — "'repo.resolveForCwd': async (params) => {"
- **[[c6]]** `code` `src/mcp/resolve-repo.ts`
- **[[c7]]** `analyze-bundle` `insrc_analyze_step capability-discovery: resolving a VS Code folder to its enclosing registered repo (no plugin-side resolver; repo.resolveForCwd partial-match)`
