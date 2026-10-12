<!-- insrc:artifact ISSUE-96f66552d63b2c6e -->

# Make the cli-adapter process-group test portable to macOS

## Reproduction

1. On macOS, on main (a66eae5a), run the VS Code plugin suite: `cd vscode-plugin && npx tsx --test 'src/**/__tests__/*.test.ts'` (Node 22).
2. Observed: 'cancel() stops the process group and resolves only after the exit; the real spawner starts the CLI detached in its own group' in vscode-plugin/src/chat/__tests__/cli-adapter.test.ts fails with ENOENT: no such file or directory, open '/proc/<pid>/stat'.

Expected: the test passes on macOS as well as Linux, and the shell it spawns is always stopped before the test ends.

## Root cause

The second half of the test exercises the real spawner. It starts `sh -c 'sleep 30 & wait'` through nodeSpawner and then checks that the child leads its own process group by reading `/proc/${pid}/stat` and parsing the group id from it. /proc/<pid>/stat exists only on Linux. The test's only platform guard returns early on win32, so on macOS the read throws ENOENT. Because the throw happens before `proc.kill('SIGTERM')`, the test never stops the spawned shell (read from the code order; no leftover process was observed); it is left to exit when its `sleep 30` ends. The test was added on 2026-10-12 in 38001c26. The product code it checks (the detached, own-group spawn in vscode-plugin/src/chat/cli-adapter.ts) is not implicated.

## Fix intent

The group-leader check must work on every POSIX platform the team develops on, or be skipped explicitly with a diagnostic where it cannot be checked, rather than failing. Whatever happens in the test, the process it spawns must be stopped before the test ends.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts:300-309` — "if (process.platform === 'win32') return t.diagnostic('process groups are POSIX-only'); const proc = nodeSpawner('sh', ['-c', 'sleep 30 & wait'], ...); ... const stat = readFileSync(`/proc/${pid}/stat"
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1148-1160` — "Off Windows the CLI leads its own process group (detached) ... detached: ownGroup,"
- **[[c3]]** `step-output` `plugin suite run on a66eae5a (macOS), 2026-10-12` — "not ok 180 - cancel() stops the process group and resolves only after the exit; the real spawner starts the CLI detached in its own group ... error: "ENOENT: no such file or directory, open '/proc/144"
- **[[c4]]** `step-output` `git log -1 -- vscode-plugin/src/chat/__tests__/cli-adapter.test.ts` — "38001c26 2026-10-12 11:30:08 feat(build): S001/t2 mark each approval request with where it is answered"
