<!-- insrc:artifact SPEC-1aa3094047d2617b -->

# Spec: Introduce daemon-owned built-in definitions for Claude CLI, Codex CLI, and Ollama, exposed through IPC to the TUI, VS Code plugin, and JetBrains plugin, with migration delivered in stages.

**Category:** design

## Intent

Introduce daemon-owned built-in definitions for Claude CLI, Codex CLI, and Ollama, exposed through IPC to the TUI, VS Code plugin, and JetBrains plugin, with migration delivered in stages. Consolidate runner identity, CLI kind, tier defaults, summariser fallback, reasoning-effort transport and accepted levels, input-size limits, structured-output quirks, and model-id rules. Support model-specific tier and effort mappings, user-selected models, and capability overrides. The model-level facts (model ids, tier defaults, summariser model, per-model effort levels and input limits) live in a data file shipped in the repo, not in code and not in the user's config.json, so a model or version update needs no code change [c2].

## Scope boundary

Covers the three built-in families only; the families and their transport and structured-output handling stay in code, while models are configured through the repo-shipped data file [c2]. The daemon is the single authority: the TUI and both IDE plugins read definitions over IPC and keep no copy. Every hardcoded runner/model string is migrated, in stages. Require an explicit capability profile for any selected model absent from the built-in definitions: insrc probes the model through its CLI for each claimed effort level (plus `codex debug models` for codex), shows the results, and the user approves or rejects the model [c3].

## Non-goals

- User-defined model families or runner implementations.
- Daemon and TUI only
- All consumers in one coordinated release
- Code-owned definitions
- User-defined families and models
- Model selection only
- All model-level facts
- Shared versioned definition package
- Mirrored definitions in each consumer
- Use conservative family defaults plus overrides
- Inherit the family's default model profile

## Decisions

- **All consumers, delivered in stages** — The idea identifies duplicated facts across four consumers, but does not yet establish whether the plugins are part of this effort or how their migrations should be coordinated.
  - Ruled out: _Daemon and TUI only_, _All consumers in one coordinated release_
- **Built-in families, configurable models** — All consumers are already in scope for staged migration. Settling extensibility determines whether their shared contract is a consolidated catalog or a configurable provider system.
  - Ruled out: _Code-owned definitions_, _User-defined families and models_
- **Model selection and capability overrides** — Built-in families with configurable models is settled. This decision defines what configuring a model permits without reopening family extensibility or migration scope.
  - Ruled out: _Model selection only_, _All model-level facts_
- **Daemon-owned definitions exposed through IPC** — All four consumers are in scope, and configurable models with capability overrides are settled. Choosing the authority now determines how staged migrations keep capability displays and actual execution consistent.
  - Ruled out: _Shared versioned definition package_, _Mirrored definitions in each consumer_
- **Require an explicit capability profile** — Daemon-owned definitions and configurable models are settled. Model-specific differences mean that selecting an unfamiliar model still needs a defined capability policy.
  - Ruled out: _Use conservative family defaults plus overrides_, _Inherit the family's default model profile_

## Citations

- **[[c1]]** `step-output` `s1`
- **[[c2]]** `stakeholder` `user 2026-10-23` — "models especially their version get updated quite frequently, requiring a code change would be very cumbersome. separate config file in the repo, not user's config.json that stores the model structure"
- **[[c3]]** `stakeholder` `user 2026-10-23` — "test and approve or reject the unknown model"
