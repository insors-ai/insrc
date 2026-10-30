<!-- insrc:artifact PLAN-b220bb6174a2f5ed-s2 -->

# Plan: E20261030b220bb61:S002

## Summary

**Epic:** `run-claude-codex-ollama-models`
**LLD run:** `wf-1793336320642-dkgtj5`
**LLD effective hash:** `ca5bac7aee60...`

Building this Story teaches the existing claude command-line provider to run against Ollama: an optional Ollama target makes every claude process it starts carry three environment variables pointing at the local Ollama server, in a copy of the environment for that process only. A small checker confirms before each run that Ollama answers, that the model is there and, for a cloud model, that Ollama is signed in, and fails with a named cause otherwise. The one place that builds providers for a family then sets the target for ollama-claude and refuses a tier whose model was not declared. A live test confirms a real structured answer from an Ollama cloud model.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Ollama target option and per-run environment on CliProvider | M | — | unit: cli-ollama.test.ts: every claude entry point on an Ollama-targeted provider starts claude with --model <id> and the three Ollama variables, without CLAUDE_CODE_OAUTH_TOKEN, and leaves process.env unchanged; unit: cli-ollama.test.ts: the bounded path on an Ollama-targeted provider gets the allow-list plus the three Ollama variables; unit: cli-ollama.test.ts: providers without an Ollama target (claude, codex) start with today's arguments and no Ollama variables; unit: cli-ollama.test.ts: an Ollama target with kind codex or without a model is refused at construction; unit: cli-vibe.test.ts, bounded-input.test.ts, cli-subprocess.test.ts and cli-failure-message.test.ts stay green | [[c1]] [[c5]] [[c6]] [[c9]] |
| 2 | **`t2`** checkOllamaTarget pre-run check | M | — | unit: ollama-target.test.ts: a down or silent Ollama gives 'ollama-unreachable' within the limit; unit: ollama-target.test.ts: a model absent from /api/tags with /api/show 404 gives 'model-unavailable'; unit: ollama-target.test.ts: a cloud model with /api/me 401 gives 'not-signed-in' and /api/me 503 gives 'account-unavailable'; unit: ollama-target.test.ts: a local model skips /api/me, a listed model skips /api/show, and every request goes to target.host | [[c3]] [[c7]] [[c10]] |
| 3 | **`t3`** CliProvider runs the check before every Ollama-targeted call | S | `t1`, `t2` | unit: cli-ollama.test.ts: a failing pre-run check on each entry point throws OllamaTargetError, logs the cause and starts no claude process; unit: cli-ollama.test.ts: two awaited calls on one Ollama-targeted provider never overlap; unit: cli-ollama.test.ts: a provider without an Ollama target never runs the pre-run check | [[c2]] [[c3]] [[c7]] |
| 4 | **`t4`** familyProvider sets the target and refuses a refused tier | S | `t1` | unit: provider-from-registry.test.ts: familyProvider for ollama-claude builds a claude CliProvider with the model and an Ollama target from models.local.host; vendor families get none; unit: provider-from-registry.test.ts: an effort a host model does not list is not forwarded; unit: provider-from-registry.test.ts: a refused ollama-claude tier makes buildShaperProvider, the router and resolveValidateProvider throw ModelNotSupportedError | [[c4]] [[c8]] |
| 5 | **`t5`** Live structured answer through claude on an Ollama cloud model | S | `t3`, `t4` | live: cli-ollama.live.test.ts: completeStructured on glm-5.3:cloud returns a schema-valid answer, and a missing model fails with 'model-unavailable' | [[c8]] |

### 1.1 E20261030b220bb61:S002:T001 — Ollama target option and per-run environment on CliProvider

In src/agent/providers/cli-provider.ts: add OllamaTarget { host, hosting } and the optional ollama field on CliProviderOpts; the constructor rejects it for a kind other than 'claude' or without a model. With a target, build the child environment per run as a copy: runClaude passes { ...process.env, ANTHROPIC_BASE_URL: host, ANTHROPIC_AUTH_TOKEN: 'ollama', ANTHROPIC_API_KEY: '' } without CLAUDE_CODE_OAUTH_TOKEN to runSubprocess, and completeBoundedStructured merges the same into its boundedClaudeEnv() copy. Without a target nothing changes: runSubprocess gets no env and the bounded path keeps boundedClaudeEnv().

**Acceptance checks:**
- complete, completeStructured, runEditSession and runReviewSession on an Ollama-targeted provider start claude with --model <id> and the three Anthropic variables set, CLAUDE_CODE_OAUTH_TOKEN absent.
- The bounded path on an Ollama-targeted provider gets boundedClaudeEnv()'s allow-list plus the three variables, other flags unchanged.
- A provider without a target (claude, codex) starts with today's arguments and environment.
- process.env is unchanged after an Ollama-targeted run.
- new CliProvider with an Ollama target and kind 'codex', or without a model, throws.

### 1.2 E20261030b220bb61:S002:T002 — checkOllamaTarget pre-run check

New src/agent/providers/ollama-target.ts exporting OllamaTargetError (cause, host, model) and checkOllamaTarget(target, model, deps?). With plain fetch to target.host and a per-request limit (OLLAMA_LIST_TIMEOUT_MS, now exported from src/agent/providers/ollama.ts): GET /api/tags must answer (else 'ollama-unreachable'); the model must be among the tag names or POST /api/show must not answer 404 (else 'model-unavailable'); for hosting 'cloud', POST /api/me must answer 200 with a name (401 -> 'not-signed-in' with the signin_url; any other answer -> 'account-unavailable', per resolved question q93fd2759). Messages name the cause and the fix.

**Acceptance checks:**
- Against a fake Ollama server: a down or silent server gives 'ollama-unreachable' within the limit; a missing model gives 'model-unavailable'; a cloud model with /api/me 401 gives 'not-signed-in' naming `ollama signin`; /api/me 503 gives 'account-unavailable'.
- A local-hosting model skips /api/me; a model listed in /api/tags passes without /api/show.
- Every request goes to target.host (a non-default address in the test).
- OLLAMA_LIST_TIMEOUT_MS is exported with its value and listLocalModels' use unchanged.

### 1.3 E20261030b220bb61:S002:T003 — CliProvider runs the check before every Ollama-targeted call

An Ollama-targeted CliProvider awaits the pre-run check before each claude spawn (complete, completeStructured including the bounded path, runEditSession, runReviewSession); a failure throws OllamaTargetError, is logged at warn with model, host and cause, and starts no process. The check is reached through an injectable CliProviderOpts seam defaulting to checkOllamaTarget, and t1's tests pass a stub. Vendor providers never call the check. The existing time limit and process-group kill are untouched.

**Acceptance checks:**
- A failing check on each entry point throws OllamaTargetError, logs model, host and cause at warn, and the fake claude records no run.
- A passing check is followed by exactly one claude run per call; two awaited calls never overlap.
- A provider without a target never calls the check.

### 1.4 E20261030b220bb61:S002:T004 — familyProvider sets the target and refuses a refused tier

In src/analyze/context/shaper-provider.ts familyProvider: when registry.host(family) is 'ollama', throw ModelNotSupportedError if the model is undefined, else build the claude CliProvider with ollama: { host: loadLocalProviderConfig().host, hosting: model.hosting } and log family, model, hosting and host. Vendor and plain Ollama families are unchanged. This covers buildShaperProvider, the RoleRouter roles and resolveValidateProvider.

**Acceptance checks:**
- familyProvider for ollama-claude with a declared model returns a claude CliProvider with the model and an Ollama target whose host is models.local.host (a non-default value in the test) and whose hosting is the model's.
- A declared host model with an effort it does not list gets no --effort; the existing warning is logged.
- A tier on ollama-claude with an undeclared model makes buildShaperProvider, RoleRouter.resolveProviderForRole and resolveValidateProvider throw ModelNotSupportedError.
- Vendor families get no Ollama target.

### 1.5 E20261030b220bb61:S002:T005 — Live structured answer through claude on an Ollama cloud model

New src/agent/providers/__tests__/cli-ollama.live.test.ts, gated by INSRC_LIVE_TESTS=1: completeStructured on an Ollama-targeted provider with glm-5.3:cloud returns a schema-valid answer; a provider naming a model Ollama does not have fails with cause 'model-unavailable'.

**Acceptance checks:**
- With Ollama running and signed in, the live test passes; without INSRC_LIVE_TESTS it is skipped.

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/agent/providers/__tests__/cli-ollama.test.ts: complete, completeStructured, runEditSession and runReviewSession on an Ollama-targeted provider start claude with --model <id> (and --effort when accepted) and an environment carrying ANTHROPIC_BASE_URL=<host>, ANTHROPIC_AUTH_TOKEN=ollama and ANTHROPIC_API_KEY='' with CLAUDE_CODE_OAUTH_TOKEN removed; the daemon's process.env is unchanged after the run. | `t1` |
| src/agent/providers/__tests__/cli-ollama.test.ts: the bounded tool-free structured path on an Ollama-targeted provider gets boundedClaudeEnv()'s allow-list plus the three Anthropic variables and its other flags unchanged. | `t1` |
| src/agent/providers/__tests__/cli-ollama.test.ts: a provider without an Ollama target (claude and codex) passes the same arguments and no Ollama variables as before; the fake binary records the daemon's environment untouched. | `t1`, `t3` |
| src/agent/providers/__tests__/cli-ollama.test.ts: the pre-run check against a fake Ollama server throws OllamaTargetError with cause 'ollama-unreachable' (server down or not answering within the check's limit), 'model-unavailable' (model absent from /api/tags and /api/show 404), and 'not-signed-in' (cloud model, /api/me not 200), naming the host, model and fix; no claude process is started; a local-hosting model skips the sign-in check; a listed '<name>:cloud' model passes without /api/show. | `t2`, `t3` |
| src/agent/providers/__tests__/cli-ollama.test.ts: constructing a CliProvider with an Ollama target and kind 'codex' or no model throws. | `t1` |
| src/analyze/context/__tests__/provider-from-registry.test.ts: familyProvider for ollama-claude with a declared model builds a claude CliProvider with the model and an Ollama target whose host is models.local.host and whose hosting is the model's; vendor families get no target. | `t4` |
| src/analyze/context/__tests__/provider-from-registry.test.ts: a tier on ollama-claude with an undeclared model makes buildShaperProvider, RoleRouter.resolveProviderForRole and resolveValidateProvider throw ModelNotSupportedError; no CliProvider is built. | `t4` |
| src/agent/providers/__tests__/cli-vibe.test.ts, src/agent/providers/__tests__/bounded-input.test.ts, src/agent/providers/__tests__/cli-subprocess.test.ts and src/agent/providers/__tests__/cli-failure-message.test.ts stay green unchanged. | `t1` |
| src/agent/providers/__tests__/cli-ollama.live.test.ts (INSRC_LIVE_TESTS=1, needs Ollama running and signed in): completeStructured on an Ollama-targeted provider with glm-5.3:cloud returns an answer that passes the requested schema; a provider with a missing model fails with cause 'model-unavailable'. | `t5` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s2 contractDetails CliProvider (ollama option, per-run environment)` — "Without opts.ollama, runSubprocess receives no env and the bounded path receives boundedClaudeEnv() unchanged."
- **[[c2]]** `prior-artifact` `LLD s2 contractDetails CliProvider.completeStructured (pre-run check before every call)` — "A failed check starts no claude process."
- **[[c3]]** `prior-artifact` `LLD s2 contractDetails checkOllamaTarget` — "Exported from a new module src/agent/providers/ollama-target.ts."
- **[[c4]]** `prior-artifact` `LLD s2 contractDetails familyProvider` — "A host family never yields a CliProvider without an Ollama target or without a model."
- **[[c5]]** `prior-artifact` `LLD s2 contractDetails boundedClaudeEnv` — "The function itself and its output for vendor runs are unchanged."
- **[[c6]]** `prior-artifact` `LLD s2 dataModelChanges (OllamaTarget, CliProviderOpts, OllamaTargetError, OLLAMA_LIST_TIMEOUT_MS)` — "+ readonly ollama?: OllamaTarget | undefined;"
- **[[c7]]** `prior-artifact` `LLD s2 errorPaths` — "Throw OllamaTargetError with cause 'ollama-unreachable', naming the host and saying to start Ollama; no claude process is started."
- **[[c8]]** `prior-artifact` `LLD s2 testStrategy` — "completeStructured on an Ollama-targeted provider with glm-5.3:cloud returns an answer that passes the requested schema"
- **[[c9]]** `prior-artifact` `LLD s2 migration` — "CliProviderOpts gains an optional field only; every existing caller omits it and keeps today's arguments and environment."
- **[[c10]]** `stakeholder` `Resolved question q93fd2759 (2026-10-30): /api/me mapping from Ollama's server/routes.go WhoamiHandler` — "401 = not signed in; 200 with a name = signed in; any other answer = account check unavailable."
