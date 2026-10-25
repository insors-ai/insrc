# t8 rollout and smoke test (2026-10-24)

## Rollout

- main pushed to origin (18 commits, up to fe21858a).
- `maintenance.update` on `~/.insrc/daemon`: sync, install, build, config reconcile (no changes), steering refresh. Installed HEAD: fe21858a.
- `maintenance.restart`: drained stop, start, ready.

## Smoke: one-shot insrc_analyze on the codex tier

Config: roles `analyze.decompose` and `analyze.plan` are on tier `mid` = `cli-codex` `gpt-6.1-sol`.

Call: `insrc_analyze({ focus: "how does runPlanner decode the planner's wire-form reply back to template params", target: "code", scope: "S" })`, run id `mcp-1792854654039-jybhub`.

Daemon log (`/tmp/.insrc/daemon.log`, 15:10:54-15:12:00):

```
[15:10:54] analyze:context:shaper-provider  routing through CliProvider  kind: "codex"  model: "gpt-6.1-sol"
[15:11:18] cli-provider  codex completed  exitCode: 0  hasAgentMessage: true
[15:11:18] analyze:context:decomposer  decomposer: plan emitted  answerType: "how-does-it-work"  explorationCount: 6
[15:12:00] analyze:context:synthesizer  synthesizer: bundle emitted
```

The bundle header reports `model=gpt-6.1-sol toolCalls=6`. Codex accepted the
decomposer schema and returned a plan; the explorations ran and no
freeform.probe fallback was taken. Before the fix, every such call was refused
(113 of 113, evidence/open-object-probe.md beside ISSUE-8d39ef09).

One exploration (e6, usage.example) came back with neither symbolName nor
entityId and failed at its runner with invalid-params; the other explorations
ran. This is the documented empty-params behaviour (LLD: "empty params still
fail only that exploration at its runner").

Result: pass.
