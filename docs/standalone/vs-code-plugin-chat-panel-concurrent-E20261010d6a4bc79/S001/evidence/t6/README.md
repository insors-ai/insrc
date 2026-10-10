# t6 evidence: the plugin's full suite and typechecks

Captured at commit `1347c85a`, the t6 commit. This story changes only `vscode-plugin`, so these are the checks it affects. The validation gate runs the typecheck at the repo root, whose `tsconfig.json` does not include `vscode-plugin`, and runs only the task's named test file.

[plugin-suite.txt](plugin-suite.txt), run in `vscode-plugin`:
- `npx tsc -p tsconfig.json --noEmit` exits 0.
- `npx tsc -p tsconfig.delivery-contract.json --noEmit` exits 0.
- `npx tsx --test 'src/**/__tests__/*.test.ts'` runs 984 tests: 979 pass, 4 are skipped (the live-CLI tests) and 1 fails. The failure is the known manifest-catalog baseline: "each declared key's type/enum/default matches its ConfigOption, and scope is 'machine'". It failed the same way before this story (962 tests, 1 failure, in the ISSUE-7405471c t7 evidence).

The new setting `insrc.chat.turnLockTimeoutMs` does not affect that test: it checks only the keys in the daemon's config catalog, and the coverage test beside it skips `insrc.chat.*` keys, which are plugin-local.
