<!-- insrc:artifact CR-45e743550d9596c3-S001 -->

# Code review: 45e743550d9596c3:S001

⚠️ **WARN** — HIGH 0 · MED 18 · LOW 0 · model `codex:gpt-6.1-sol`

**Changed files:** 8

## adherence — 0 finding(s)

_No findings._

## conventions — 0 finding(s)

_No findings._

## coverage — 18 finding(s)

| Severity | Location | Message |
| --- | --- | --- |
| MED | src/agent/providers/cli-provider.ts:1 | claudeReviewSessionArgs coverage is present but failing/unverified: cli-review-session.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | src/agent/providers/cli-provider.ts:1 | codexReviewSessionArgs coverage is present but failing/unverified: cli-review-session.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | src/agent/providers/cli-provider.ts:1 | complete coverage is present but failing/unverified: none of its reaching test files appears in the test record. Passing coverage cannot be confirmed. |
| MED | src/agent/providers/cli-provider.ts:1 | completeStructured coverage is present but failing/unverified: none of its reaching test files appears in the test record. Passing coverage cannot be confirmed. |
| MED | src/agent/providers/cli-provider.ts:1 | runEditSession coverage is present but failing/unverified: none of its reaching test files appears in the test record. Passing coverage cannot be confirmed. |
| MED | src/agent/providers/cli-provider.ts:1 | runReviewSession coverage is present but failing/unverified: none of its reaching test files appears in the test record. Passing coverage cannot be confirmed. |
| MED | src/agent/providers/cli-provider.ts:1 | embed coverage is present but failing/unverified: cli-provider.live.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | src/agent/providers/cli-provider.ts:1 | vibeLastAssistantText coverage is present but failing/unverified: cli-vibe.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | src/agent/providers/cli-provider.ts:1 | isTransientCliError coverage is present but failing/unverified: none of its reaching test files appears in the test record. Passing coverage cannot be confirmed. |
| MED | src/agent/providers/cli-provider.ts:1 | classifyInputTooLarge coverage is present but failing/unverified: input-too-large.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | src/agent/providers/cli-provider.ts:1 | transienceText coverage is present but failing/unverified: cli-failure-message.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | src/agent/providers/cli-provider.ts:1 | cliExitError coverage is present but failing/unverified: neither reaching test file appears in the test record. Passing coverage cannot be confirmed. |
| MED | src/agent/providers/cli-provider.ts:1 | cliFailureMessage coverage is present but failing/unverified: cli-failure-message.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | vscode-plugin/src/chat/cli-adapter.ts:1 | classifyPermissionDenial coverage is present but failing/unverified: cli-adapter.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | vscode-plugin/src/chat/cli-adapter.ts:1 | writeReachedStdin coverage is present but failing/unverified: cli-adapter.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | vscode-plugin/src/chat/cli-adapter.ts:1 | nodeSpawner coverage is present but failing/unverified: cli-adapter.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | vscode-plugin/src/chat/cli-adapter.ts:1 | defaultBinaryProbe coverage is present but failing/unverified: live-cli.test.ts is absent from the test record, so its pass-state is unverified. |
| MED | vscode-plugin/src/chat/turn-lifecycle.ts:1 | trySaveSession coverage is present but failing/unverified: turn-lifecycle.test.ts is absent from the test record, so its pass-state is unverified. |

## quality — 0 finding(s)

_No findings._

