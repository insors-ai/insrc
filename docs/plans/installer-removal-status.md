# Installer and daemon control removal

Branch `installer` removes the existing installer, updater and daemon start/stop/restart controls under approved story `7dcc640fef47d9e6/s1`. No replacement is supplied in this change. Earlier installation instructions and historical workflow records describe the retired implementation.

The CLI and IDE clients retain status, backup/compact, model/configuration, project registration and MCP host integration. They require an already available daemon. Development entry points use Node from PATH; development requires Node 22.22.1 or newer within Node 22. The normal build retains test coordination, TypeScript checks, model validation and prompt/resource packaging. IDE packaging retains steering resources and no longer ships an installer or runtime policy.

Application resource disposal, generic IPC, worker supervision, database/keystore ownership and test-process cleanup remain. Removing lifecycle controls does not authorize deleting user data or changing an installed daemon on this machine.

The frozen manifest and per-entry outcomes are in the story evidence directory. Validation results are recorded there separately from implementation; deletion does not imply a passing test suite.
