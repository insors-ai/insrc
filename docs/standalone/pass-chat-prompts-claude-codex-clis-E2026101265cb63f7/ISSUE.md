<!-- insrc:artifact ISSUE-65cb63f7186f84fa -->

# Pass chat prompts to the claude and codex CLIs after an end-of-options marker

## Reproduction

1. In the VS Code insrc chat (claude backend), send a message whose first characters are '-', for example a pasted review list starting "- MED: openWithContent duplicates openAndGetContent.".
2. Observed: the turn fails immediately with "claude exited with code 1: error: unknown option '- MED: openWithContent duplicates ...'"; the prompt never reaches the model.
3. The same applies to the codex backend (new and resumed turns), whose prompt is also a bare positional argument.
Expected: every prompt sent from the chat reaches the CLI verbatim as the prompt text, whatever its first characters, on both backends, for new and resumed turns.

## Root cause

The chat's argv builders put the user's raw prompt where each CLI's option parser reads it. The claude builder returns ['-p', req.prompt, '--output-format=stream-json', '--verbose', ...]; the claude CLI's parser treats a following argument that begins with '-' as an option, not as the prompt, and rejects it as unknown. The codex builder returns ['exec', '--json', ...auto, req.prompt] (and ['exec', 'resume', id, '--json', ...auto, req.prompt] when resuming), so a leading '-' is likewise parsed as a flag. Nothing marks the end of options before the prompt, so the prompt's content decides how it is parsed.

## Fix intent

Make both argv builders hand the prompt to the CLI in a way its option parser can never read as an option, for claude and codex, new and resumed turns, so any prompt text (including one starting with '-' or '--') arrives verbatim. Every other argument (output format, resume id, permission flags, allowed tools) keeps its current meaning.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:483-484 claude buildArgs (['-p', req.prompt, '--output-format=stream-json', '--verbose'])`
- **[[c2]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:652-659 codex buildArgs (['exec', '--json', ...auto, req.prompt]; resume variant)`
- **[[c3]]** `code` `vscode-plugin/src/chat/cli-adapter.ts:807 spawn(BINARY[mapper.id], mapper.buildArgs(effectiveReq), ...)`
- **[[c4]]** `code` `vscode-plugin/src/chat/__tests__/cli-adapter.test.ts:629 argv assertion (['-p', 'hi', '--output-format=stream-json', '--verbose'])`
- **[[c5]]** `stakeholder` `User report 2026-10-12: "claude exited with code 1: error: unknown option '- MED: openWithContent duplicates openAndGetContent. ...'" and "Prompts sent from the chat should always be quoted."`
