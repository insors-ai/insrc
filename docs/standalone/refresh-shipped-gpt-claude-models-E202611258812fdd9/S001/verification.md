# Model catalog verification

On 2026-11-25, each installed CLI received the prompt “Reply with exactly OK” from /tmp. Each completed successfully with OK.

| CLI | Requested model | Observed model identity |
| --- | --- | --- |
| Codex 0.172.0 | gpt-6.2-astra | Codex run header reported gpt-6.2-astra at medium effort |
| Codex 0.172.0 | gpt-6.2-sol | Codex run header reported gpt-6.2-sol at medium effort |
| Claude Code 2.1.328 | claude-sonnet-5-5 | JSON result reported canonicalModel claude-sonnet-5-5 |
| Claude Code 2.1.328 | claude-fable-5-2 | JSON result reported canonicalModel claude-fable-5-2 |

The Codex probes used an ephemeral read-only session. Claude probes used print mode with tools and session persistence disabled.

The canonical installer's step 4b ran against the shipped catalog with a temporary home for each CLI. Codex wrote GPT-6.2 Astra, GPT-6.2 Sol, and GPT-6 Luna as core, mid, and cheap. Claude wrote opus, sonnet, and haiku. The packaged catalog matched its source byte-for-byte. The full installer test file failed at its pre-existing script-copy equality assertion. Both installer files matched their respective HEAD blobs before the model changes.

## Captured CLI output

Codex output filtered to model headers and response lines. Claude JSON filtered to success, result, and canonical model identity.

```text
model: gpt-6.2-astra
OK
OK
model: gpt-6.2-sol
OK
OK
{"is_error":false,"result":"OK","models":["claude-sonnet-5-5"]}
{"is_error":false,"result":"OK","models":["claude-fable-5-2"]}
```

## Captured installer dry-run output

Each line reports the CLI and the model IDs read back from the config written by step 4b. Both runs exited zero.

```text
codex ['gpt-6.2-astra', 'gpt-6.2-sol', 'gpt-6-luna']
claude ['opus', 'sonnet', 'haiku']
```
