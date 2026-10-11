# t2 evidence: the plugin's full suite and typechecks

Captured at commit `40e6c383`, the t2 commit. It adds stop and detach to vscode-plugin/src/chat/turn-lifecycle.ts and their tests; the panel is unchanged. This story changes only `vscode-plugin`. The validation gate typechecks the repo root, whose `tsconfig.json` excludes `vscode-plugin`, and runs only the task's named test files, so the plugin checks are recorded here.

[plugin-suite.txt](plugin-suite.txt), run in `vscode-plugin`:
- `npx tsc -p tsconfig.json --noEmit` exit 0 and `npx tsc -p tsconfig.delivery-contract.json --noEmit` exit 0.
- `npx tsx --test 'src/**/__tests__/*.test.ts'` runs 1028 tests: 1022 pass, 4 are skipped (live CLI) and 2 fail. Both failures are known baselines in the manifest catalog check, which compares package.json against the daemon's config catalog and which this story does not touch: "each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'" and "declared global insrc.* keys EXACTLY cover the global CONFIG_CATALOG paths (no missing, no extra)" (the upstream `insrc.analyzer.dataSourceListingTimeoutMs` key).
