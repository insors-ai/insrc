# S001/t8 live CLI effort checks

`INSRC_LIVE_TESTS=1 npx tsx --test src/agent/providers/__tests__/cli-effort.live.test.ts`, 2026-10-23, codex-cli 0.164.0 and the installed claude CLI: **2 of 2 pass**.

```
ok 1 - a codex CliProvider with model gpt-6.1-sol and effort high runs and codex reports reasoning effort high
ok 2 - a claude CliProvider with effort low runs, and claude given an unknown --effort value warns and runs at its default
# tests 2
# pass 2
# fail 0
```
