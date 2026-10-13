<!-- insrc:artifact ISSUE-2284d9b47fc9c35e -->

# Codex chat turns hang because the CLI's input is left open

## Reproduction

With codex-cli 0.162.1 installed, pick codex in the dev chat and send any message: no answer ever arrives. The same happens outside the panel: `INSRC_LIVE_TESTS=1 npx tsx --test src/chat/__tests__/live-cli.test.ts` times out on the codex test that runs a turn through the production launcher (300 s, 2026-10-12). Measured directly on 2026-10-12 with `codex exec --json -- "Reply with exactly: PONG"`: started with its input closed it answered PONG and exited 0 in 11.8 s; started with its input left open as a pipe it printed "Reading additional input from stdin..." on stderr, wrote nothing to stdout and was still running after 45 s. Expected: a codex turn answers as a claude turn does.

## Root cause

The plugin's launcher starts every chat CLI with its standard input as a pipe that is never closed, so that an approval decision can be written to the running process. codex-cli 0.162.1, run as `codex exec`, reads standard input as extra prompt text until it ends, so with the pipe open it waits forever before starting the turn. The claude CLI does not wait on its input, which is why only codex is affected. The cause was confirmed by the measurement above, not inferred from the code alone.

## Fix intent

A CLI that reads its input as prompt text is started with that input closed, so its turn begins at once; a CLI whose approval answers are written to its input keeps it open. Codex is the first kind and claude the second. For codex this means an approval answer can no longer be written to the process: the answer is reported as undeliverable, as it already is when a process has gone. The live codex tests must pass through the production launcher.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1169` — "stdio: fds !== undefined ? ['pipe', fds[0]!, fds[1]!] : ['pipe', 'pipe', 'pipe'],"
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:1156` — "// stdin is a pipe (not 'ignore') so the review-mode permission-decision relay can"
- **[[c3]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:827` — "proc = deps.spawn(BINARY[mapper.id], mapper.buildArgs(effectiveReq), { cwd: effectiveReq.cwd, ...(output !== undefined ? { output } : {}) })"
- **[[c4]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:976` — "log.warn(`[chat:${mapper.id}] permission decision for ${requestId} undeliverable (no live stdin)`);"
- **[[c5]]** `step-output` `measurement 2026-10-12, codex-cli 0.162.1: input closed -> PONG in 11.8 s; input open -> 'Reading additional input from stdin...' and no output in 45 s` — "Reading additional input from stdin..."
