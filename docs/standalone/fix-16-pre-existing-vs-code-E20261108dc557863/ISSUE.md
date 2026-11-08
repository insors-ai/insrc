<!-- insrc:artifact ISSUE-dc557863fa52ecf5 -->

# Fix 16 pre-existing VS Code extension test failures

## Reproduction

Run the extension sweep from the repository root:

```sh
node --import tsx --test --test-force-exit --test-reporter=tap 'vscode-plugin/src/**/__tests__/*.test.ts'
```

To narrow the run, use the following nine test files as arguments in place of the glob:

- `vscode-plugin/src/__tests__/activation.test.ts`
- `vscode-plugin/src/chat/__tests__/approval-subscribe.test.ts`
- `vscode-plugin/src/chat/__tests__/docs-review-panel.test.ts`
- `vscode-plugin/src/chat/__tests__/exec-path-scan.test.ts`
- `vscode-plugin/src/panels/__tests__/detail-renderers.test.ts`
- `vscode-plugin/src/panels/__tests__/repo-config.test.ts`
- `vscode-plugin/src/panels/__tests__/repo-fields-contract.test.ts`
- `vscode-plugin/src/panels/__tests__/webview-host.test.ts`
- `vscode-plugin/src/workspace/__tests__/activation.test.ts`

On Node 26.5.1, all 16 targeted cases failed with the same errors on pre-story commit `610671dd6` and pushed `v2` commit `6b36de118`. The original full sweep had 19 failures. Three that passed on isolated reruns are outside this issue. These 16 failures block the green full-sweep requirement for concurrent-chat verification.

## Root cause

- **Repo Configuration (6).** Five renderer and message-routing tests expect a Tracker section, an editable `ghHost` field, or a `repoTrackerWrite` handler. The current panel renders model tiers, Core floor, and Providers. The sixth test also expects old imports and Tracker bindings during extension activation. The renderer is grounded in [c1].
- **Daemon approval prompts (4).** Three fixtures call `IpcServer` with its obsolete constructor shape and fail with `this.ownership.lease is not a function` before sending an approval frame. The fourth expects VS Code activation to instantiate the approval prompter. The prompter still exists and activation does not instantiate it. See [c2] and [c3].
- **UX fixtures (2).** Both renderer tests expect four ledger fixtures. Two lookups still use the old `-S001` suffix. The available records use `-s1`. The tests report two records found and stop at their count assertion.
- **Model-role counts (2).** Tests pin 14 critical and 21 peripheral roles. The current taxonomy has 14 critical and 23 peripheral roles, for 37 model-role rows plus the Core floor row. See [c4].
- **Settings activation (1).** A source assertion expects the former one-line settings pull. The pull still waits for activation and now runs in an async callback that also migrates legacy settings. See [c5].
- **Ollama registration (1).** A source assertion rejects any Ollama reference in the adapter. The registry still admits only Claude, Codex, and Vibe. Claude's supported Ollama routing adds the references. See [c6] and [c7].

## Fix intent

Confirm whether the VS Code Tracker controls and daemon approval prompter are still required. Restore their wiring and exercise the user-visible behavior if they are required. If they were intentionally removed or replaced, update the contract tests to cover the supported behavior. Update the approval IPC fixtures so they reach the approval exchange wherever that path remains supported.

Resolve the current UX artifact IDs and keep all four render and truncation checks. Assert rendered role groups against the current taxonomy. Verify that the settings pull occurs after activation and that legacy migration follows it. Verify registry membership separately from Claude-to-Ollama routing. Keep all 16 cases covered by repaired or replacement tests, then rerun the full extension sweep and record the result.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/panels/repo-config.ts`
- **[[c2]]** `code` `src/daemon/server.ts`
- **[[c3]]** `code` `vscode-plugin/src/chat/approval-subscribe.ts`
- **[[c4]]** `code` `src/config/role-taxonomy.ts`
- **[[c5]]** `code` `vscode-plugin/src/config/legacy-keys.ts`
- **[[c6]]** `code` `vscode-plugin/src/chat/cli-adapter.ts`
- **[[c7]]** `code` `vscode-plugin/src/chat/ollama-routing.ts`
- **[[c8]]** `prior-artifact` `docs/standalone/allow-independent-turns-concurrent-vs-code-E20261108d8b2fe8e/S001/VS-CODE-SMOKE.md`
