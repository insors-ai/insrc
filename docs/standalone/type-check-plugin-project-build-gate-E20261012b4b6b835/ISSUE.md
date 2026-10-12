<!-- insrc:artifact ISSUE-b4b6b835f29fab99 -->

# Type-check the plugin project in the build gate

## Reproduction

Run a build task whose files are all under vscode-plugin/ (for example the chat paging story, tasks t1 to t8) and introduce a type error in one of them, such as passing a number where a string is expected in vscode-plugin/src/chat/chat-panel.ts. Validate the task with insrc_build_step. Observed: the gate runs `npx tsc --noEmit` once from the repository root, it exits 0, and the verdict reports `typecheckClean: true`. Expected: the gate type-checks the plugin project too and reports the error. Running `npx tsc --noEmit -p .` inside vscode-plugin/ by hand does report it. The same holds for a type error in a daemon test file: the root project excludes test files, so the gate does not type-check them either.

## Root cause

The gate's typecheck is one fixed command, `npx tsc --noEmit`, run once in the repository root (c1, c2, c3). That command uses the root tsconfig.json, which includes only the root src/ tree and excludes test files (c4). The VS Code plugin is a separate TypeScript project with its own tsconfig.json under vscode-plugin/ (c5), so no file in it is ever type-checked by the gate, whatever the task changed. The gate has no notion of which TypeScript project owns the files a task touched.

## Fix intent

Make the gate's typecheck cover the code the task changed: in addition to the root project, type-check every TypeScript project that owns a file the task touched (found from the nearest tsconfig.json above each file), and report the typecheck as clean only when all of them are clean, with each project's command and output in the evidence. A task that touches only root src/ files behaves as it does today. Whether test files excluded by the root project should also be type-checked is recorded here as a related gap and decided at build time, not silently left out.

## Citations

- **[[c1]]** `code` `src/mcp/build-step/validation-checks.ts:31` — "export const TYPECHECK_ARGV: readonly string[] = ['npx', 'tsc', '--noEmit'];"
- **[[c2]]** `code` `src/mcp/build-step/validation-checks.ts:196` — "return { typecheck: TYPECHECK_ARGV, testCommand: TEST_RUNNER_ARGV, typecheckTimeoutMs: TYPECHECK_TIMEOUT_MS, testTimeoutMs: TEST_TIMEOUT_MS };"
- **[[c3]]** `code` `src/mcp/build-step/validation-checks.ts:459` — "const typecheck = await runOne(repoPath, plan.typecheck, plan.typecheckTimeoutMs, deps);"
- **[[c4]]** `code` `tsconfig.json:23` — ""include": [
    "src/**/*.ts",
    "src/**/*.tsx"
  ],
  "exclude": [
    "**/__tests__/**",
    "**/*.test.ts"
  ]"
- **[[c5]]** `code` `vscode-plugin/tsconfig.json:17` — ""include": [
    "src/**/*.ts"
  ],"
