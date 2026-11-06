<!-- insrc:artifact ISSUE-910fce32967bc4ea -->

# Pass Vibe chat prompts correctly in programmatic mode

## Reproduction

In VS Code chat, select Vibe with a Mistral model and send a nonempty message. Observed: vibe exits code 1 with 'Error: No prompt provided for programmatic mode'. Local reproduction against installed vibe 3.0.4: invoke vibe -p --output streaming -- 'insrc prompt transport diagnostic' with empty stdin. It exits 1 with the identical error and no stdout. Expected: Vibe receives the complete user prompt and starts a turn.

## Root cause

The Vibe mapper in vscode-plugin/src/chat/cli-adapter.ts builds a bare -p plus --output streaming and appends the prompt as a positional argument after --. The shared run path sets closeInput:true for this mapper, so stdin is empty. Installed Vibe 3.0.4 does not use that positional text as the programmatic prompt when bare -p is set; the exact invocation reproduces its missing-prompt guard. By comparison, the backend Vibe path in src/agent/providers/cli-provider.ts supplies the prompt through stdin. The failure occurs before a model response, so model access is not established as its cause.

## Fix intent

Make Vibe chat receive the complete prompt through its supported programmatic input contract. Cover new and resumed turns, title generation, multiline prompts, and prompts beginning with option-like text; retain streaming output, resume handles, attachments, permission modes, and model selection. Add regression coverage that checks the real CLI prompt contract rather than merely pinning the existing incorrect argv. Verify backend Vibe prompt transport remains compatible without unrelated changes.

## Citations

- **[[c1]]** `code` `vscode-plugin/src/chat/cli-adapter.ts`
- **[[c2]]** `code` `src/agent/providers/cli-provider.ts`
- **[[c3]]** `stakeholder` `User report in this chat: Vibe with Mistral exits with no prompt provided for programmatic mode.`
- **[[c4]]** `step-output` `Local Vibe 3.0.4 reproduction in this session: bare -p, positional prompt and empty stdin exits 1 with the reported message.`
