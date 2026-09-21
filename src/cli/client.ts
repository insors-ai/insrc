// The daemon socket client now lives in the shared boundary
// (src/shared/ipc-client.ts) so the CLI/TUI and the VS Code extension import ONE
// client (Story E20260921ad0d45c9:S001, sc1). This file re-exports `rpc` so its
// existing importers (src/cli/services/{debug,repo,config,daemon}.ts) are
// unchanged.
export { rpc } from '../shared/ipc-client.js';
