<!-- insrc:artifact ISSUE-30962d0f44df1e76 -->

# Support activity-supervised reviews through Mistral Vibe CLI

## Reproduction

Configure a critical/review role to cli-vibe (for example mistral-large-4 with high effort), then invoke the normal native code-review or design-review path. CliProvider advertises reviewActivity:true, so requireReviewActivity admits the provider; runReviewSession(mode:'activity') then throws 'review activity is not supported for the vibe CLI' before spawning Vibe. Existing bounded Vibe review support does not satisfy the new activity protocol. [[c1]] [[c2]] [[c3]]

## Root cause

The new activity runner and ReviewActivityStream only implement Claude/Codex launch arguments, native event/finality parsing and candidate submission. Vibe support merged into the provider's other execution paths without an activity adapter or truthful capability gating. Commit 8aff4e53e4 added the guard on 2026-11-03 during post-merge compilation fixes; removing it alone would route Vibe through the Codex branch. No evidence establishes a fundamental Vibe limitation: the installed CLI advertises streaming output, but its native activity/finality mapping has not been qualified. [[c1]] [[c2]] [[c4]]

## Fix intent

Implement native Vibe activity-supervised reviews for both existing review consumers. Accurately report capability and reject unsupported cases before task admission/retry reservations. Adapt real Vibe model-output/tool-start/tool-end activity, session/sequence identity, completion/failure/cancellation and bounded diagnostics; accept final JSON only after schema and host validation and confirmed successful finality. Preserve the existing thirty-minute inactivity policy, separately tracked long-running tools, checkpoint/retry ownership, read-only review grants and native CLI authentication/no direct cloud REST. Honor explicit Mistral Large 4 and high thinking configuration. Qualify deterministic native-stream fixtures (partial frames, duplicate/stale events, malformed/failed output, cancellation, tool lifetimes and nonrenewing heartbeats), both review paths, and a small useful CLI smoke. This is future work: record only; no implementation, workflow auto-approval, or paused-review resume is requested. [[c1]] [[c2]] [[c3]] [[c5]]

## Citations

- **[[c1]]** `code` `src/agent/providers/cli-provider.ts:549`
- **[[c2]]** `code` `src/agent/providers/review-activity-stream.ts:27`
- **[[c3]]** `code` `src/shared/review-activity.ts:39`
- **[[c4]]** `doc` `docs/plans/main-sync-conflicts.md:512`
- **[[c5]]** `stakeholder` `User request in this session: log an issue for Vibe activity-review support to be implemented; core/mid use Mistral Large 4 high effort.`
