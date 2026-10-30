<!-- insrc:artifact LLD-b220bb6174a2f5ed-s2 -->

# LLD: E20261030b220bb61:S002

## Summary

**Epic:** `run-claude-codex-ollama-models`
**HLD base run:** `wf-1793292978249-2ujf5k`
**HLD effective hash:** `ca5bac7aee60...`

This Story makes a tier on the ollama-claude family actually run on Ollama. The daemon starts the same claude command-line tool it uses today, but for this family it points that one process at the local Ollama server through three environment variables, with the chosen Ollama model and effort. Before each run it checks that Ollama answers, that the model is available, and for a cloud model that Ollama is signed in, and fails with a message naming the cause. A tier whose model the definitions refused is never run on anything else.

## Contents

1. [HLD context](#1-hld-context)
2. [Contract details](#2-contract-details)
3. [Data model changes](#3-data-model-changes)
4. [Diagrams](#4-diagrams)
5. [Interaction with shared contracts](#5-interaction-with-shared-contracts)
6. [Error paths](#6-error-paths)
7. [Test strategy](#7-test-strategy)
8. [Migration](#8-migration)
9. [Alternatives considered](#9-alternatives-considered)
10. [References](#10-references)
11. [Open questions](#11-open-questions)

## 1. HLD context

> See **HLD-b220bb6174a2f5ed** § 2. Framework summary

**Rollout phase:** Phase B — run on Ollama and expose in settings
**Consumes:** `sc1` (Ollama-hosted CLI families in the definitions answer), `sc2` (Tier resolution on an Ollama-hosted family)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: The shipped definitions entry for the new family and its models (which cloud and local models are supported), the catalog validator's four-member check and the 'hosting required on host families' rule, the registry's mapping from a CLI client to its direct family only, and the refusal of the unknown-model check and the approved-model store for host families stay inside s1. — owns `sc1`, `sc2`
- `s3`: The terminal UI's runner list, model list with cloud/local labels, effort step and the withheld 'enter another id' path for host families, and its display of the resolved tier, stay inside s3.
- `s4`: The VS Code tier picker's family and model steps, the settings write validation that refuses an undeclared model for a host family, the cloud/local labels and the withheld 'enter another id' item stay inside s4.
- `s5`: The JetBrains Settings page's family and model selectors, the cloud/local labels, the filter that keeps host families out of the model-check flow, and its display of the resolved tier stay inside s5.

## 2. Contract details

**Surface level:** internal

### 2.1 `CliProvider`

```typescript
new CliProvider(opts: CliProviderOpts): CliProvider  // CliProviderOpts gains: readonly ollama?: OllamaTarget | undefined
```

**Parameters:**
- `opts.ollama: OllamaTarget | undefined` _(optional)_ — When present, every claude subprocess this provider starts runs against the given Ollama server; absent, the provider behaves exactly as today.

**Returns:** `CliProvider` — A provider whose claude runs (complete, completeStructured including the bounded tool-free path, runEditSession, runReviewSession) carry ANTHROPIC_BASE_URL=<host>, ANTHROPIC_AUTH_TOKEN=ollama and an empty ANTHROPIC_API_KEY in a per-run copy of the environment, with CLAUDE_CODE_OAUTH_TOKEN removed from that copy.

**Errors:**
- `Error` when opts.ollama is given with a kind other than 'claude' or without a model.

**Preconditions:**
- opts.ollama.host is an http(s) URL (models.local.host).

**Postconditions:**
- process.env of the daemon is never modified; the variables exist only in the child's environment.
- Without opts.ollama, runSubprocess receives no env and the bounded path receives boundedClaudeEnv() unchanged.

### 2.2 `CliProvider.completeStructured`

```typescript
completeStructured<T>(messages: LLMMessage[], schema: StructuredSchema, opts?: StructuredCompletionOpts): Promise<T>
```

**Parameters:**
- `messages: LLMMessage[]` — The conversation, as today.
- `schema: StructuredSchema` — The requested structure, passed to claude --json-schema as today.
- `opts: StructuredCompletionOpts` _(optional)_ — cwd, timeout, signal, as today.

**Returns:** `Promise<T>` — The schema-checked structured answer, as today; for an Ollama-targeted provider it comes from the Ollama model.

**Errors:**
- `OllamaTargetError` when Ollama-targeted provider only: before the claude process starts, the pre-run check finds Ollama not answering at the host (cause 'ollama-unreachable'), the model not available in Ollama (cause 'model-unavailable'), or, for a cloud model, Ollama not signed in to ollama.com (cause 'not-signed-in'); each check is bounded by OLLAMA_LIST_TIMEOUT_MS.
- `ReviewSessionTimeoutError | CLI exit error` when The claude run exceeds the provider's existing time limit or exits non-zero, exactly as today.

**Postconditions:**
- The same pre-run check runs before complete, runEditSession and runReviewSession on an Ollama-targeted provider.
- A failed check starts no claude process.

### 2.3 `checkOllamaTarget`

```typescript
function checkOllamaTarget(target: OllamaTarget, model: string, deps?: { readonly fetch?: typeof fetch; readonly timeoutMs?: number }): Promise<void>
```

**Parameters:**
- `target: OllamaTarget` — The Ollama server address and the model's hosting; hosting 'cloud' adds the sign-in check.
- `model: string` — The Ollama model id the run will pass to claude --model.
- `deps: { readonly fetch?: typeof fetch; readonly timeoutMs?: number }` _(optional)_ — Test seams: the HTTP function (undici fetch by default) and the per-request limit (OLLAMA_LIST_TIMEOUT_MS by default).

**Returns:** `Promise<void>` — Resolves when Ollama answers, the model is available and, for a cloud model, Ollama is signed in.

**Errors:**
- `OllamaTargetError` when cause 'ollama-unreachable': GET <host>/api/tags fails to connect, answers non-2xx or does not answer within the limit.
- `OllamaTargetError` when cause 'model-unavailable': the model id is not among /api/tags names and POST <host>/api/show { model } answers 404.
- `OllamaTargetError` when cause 'not-signed-in': hosting is 'cloud' and POST <host>/api/me (JSON body {}) does not answer 200 with an account id.

**Preconditions:**
- target.host is an http(s) URL.

**Postconditions:**
- At most three local HTTP requests, each bounded by the limit; the check never waits longer than three limits in total.
- Exported from a new module src/agent/providers/ollama-target.ts. It calls the three endpoints with plain fetch (the ollama npm client offers list and show but no /api/me, so one HTTP path is used for all three); OLLAMA_LIST_TIMEOUT_MS (4000 ms, src/agent/providers/ollama.ts:43) becomes an exported constant and is reused as the default limit.
- CliProvider calls it before every claude spawn of an Ollama-targeted provider; vendor providers never call it.

### 2.4 `familyProvider`

```typescript
function familyProvider(registry: ModelRegistry, family: FamilyId, model: ResolvedModel | undefined, opts?: { readonly effort?: EffortLevel | undefined; readonly cliTimeoutMs?: number | undefined }, execution?: ConnectionExecutionContext): LLMProvider
```

**Parameters:**
- `family: FamilyId` — The tier's family; registry.host(family) decides whether an Ollama target is set.
- `model: ResolvedModel | undefined` — The declared model; for a host family it must be present and its hosting is passed in the target.

**Returns:** `LLMProvider` — For a host family: a CliProvider of the family's CLI kind with the model, accepted effort and ollama: { host: loadLocalProviderConfig().host, hosting: model.hosting }. For every other family: exactly today's provider.

**Errors:**
- `ModelNotSupportedError` when registry.host(family) is 'ollama' and model is undefined (a 'model-not-supported' tier reached the run layer); no provider is built.

**Postconditions:**
- A host family never yields a CliProvider without an Ollama target or without a model.
- The daemon logs family, model, hosting and Ollama host when it builds a host-family provider.

### 2.5 `boundedClaudeEnv`

```typescript
function boundedClaudeEnv(): NodeJS.ProcessEnv
```

**Returns:** `NodeJS.ProcessEnv` — Unchanged allow-list copy; the Ollama-targeted provider merges the three Anthropic variables into this copy (and drops CLAUDE_CODE_OAUTH_TOKEN) for the bounded tool-free path.

**Postconditions:**
- The function itself and its output for vendor runs are unchanged.

## 3. Data model changes

### 3.1 `OllamaTarget (new)` — new

{ readonly host: string; readonly hosting: ModelHosting } — where an Ollama-targeted claude run goes and whether its model is a cloud model (decides the sign-in check). Lives with CliProviderOpts in src/agent/providers/cli-provider.ts; ModelHosting is imported from s1's model catalog types.

```
+ export interface OllamaTarget { readonly host: string; readonly hosting: ModelHosting }
```

**Call sites:**
- `src/agent/providers/cli-provider.ts:153-172`

### 3.2 `CliProviderOpts` — field-add

Adds ollama?: OllamaTarget. Absent for every existing caller, so vendor runs keep today's arguments and environment.

```
+ readonly ollama?: OllamaTarget | undefined;
```

**Call sites:**
- `src/agent/providers/cli-provider.ts:153-172`
- `src/analyze/context/shaper-provider.ts:220-246`

### 3.3 `OllamaTargetError (new)` — new

Error thrown by the pre-run check: name 'OllamaTargetError', cause 'ollama-unreachable' | 'model-unavailable' | 'not-signed-in', host and model fields, and a message naming the cause and its fix (start Ollama / pull the model / run `ollama signin`).

```
+ export class OllamaTargetError extends Error { readonly cause: 'ollama-unreachable' | 'model-unavailable' | 'not-signed-in'; readonly host: string; readonly model: string }
```

**Call sites:**
- `src/agent/providers/cli-provider.ts:248-254`
- `src/agent/providers/cli-provider.ts:356-400`
- `src/agent/providers/cli-provider.ts:484-490`
- `src/agent/providers/cli-provider.ts:588-589`

### 3.4 `OLLAMA_LIST_TIMEOUT_MS` — field-modify

The module-private 4000 ms limit for an Ollama list call becomes exported so checkOllamaTarget reuses it as its per-request default; its value and its use in listLocalModels are unchanged.

```
- const OLLAMA_LIST_TIMEOUT_MS = 4_000;
+ export const OLLAMA_LIST_TIMEOUT_MS = 4_000;
```

**Call sites:**
- `src/agent/providers/ollama.ts:43`
- `src/agent/providers/ollama.ts:357`

## 4. Diagrams

- [Sequence diagram](docs/epics/run-claude-codex-ollama-models-E20261029b220bb61/S002/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc1` | consumes | familyProvider reads registry.host(family) (s1) to decide whether to set an Ollama target, and the resolved model's hosting ('cloud' \| 'local') to decide whether the pre-run check includes the ollama.com sign-in check. The five-family union (including cli-vibe) is consumed as shipped; vendor and plain Ollama families never get a target. |
| `sc2` | consumes | A tier resolved with model undefined and fallback 'model-not-supported' (s1) reaches familyProvider through shaperSelection with no model for a host family; familyProvider throws s1's ModelNotSupportedError instead of building a provider, so neither the vendor CLI default nor any other model runs. This covers the shaper, the RoleRouter roles and the build-step validate path, which all build through familyProvider; the summariser path already refuses (s1). |

## 6. Error paths

**Error cases**

- **Ollama is not running, or not reachable at models.local.host, when work is routed to an ollama-claude tier.** (recoverable)
  - Detection: checkOllamaTarget's GET <host>/api/tags (plain fetch, bounded by OLLAMA_LIST_TIMEOUT_MS) fails to connect, answers non-2xx or times out.
  - Response: Throw OllamaTargetError with cause 'ollama-unreachable', naming the host and saying to start Ollama; no claude process is started. The daemon logs family, model, host and the failed check.
  - User impact: The step fails within a few seconds with 'Ollama is not running at <host>' instead of a long claude timeout or an Anthropic error.
- **The tier's model is declared in the definitions but not available in the local Ollama (never pulled, or removed).** (recoverable)
  - Detection: The model id is absent from the /api/tags names and checkOllamaTarget's POST <host>/api/show for it answers 404 ('model ... not found').
  - Response: Throw OllamaTargetError with cause 'model-unavailable', naming the model and the fix (`ollama pull <id>`); no claude process is started.
  - User impact: The step fails with a message naming the missing model.
- **A cloud model is chosen and Ollama is not signed in to ollama.com.** (recoverable)
  - Detection: For hosting 'cloud' only: checkOllamaTarget's POST <host>/api/me (JSON body {}) does not answer 200 with an account id.
  - Response: Throw OllamaTargetError with cause 'not-signed-in', saying to run `ollama signin`; no claude process is started.
  - User impact: The step fails with a message naming the sign-in as the cause.
- **A tier on ollama-claude names a model the definitions do not declare (s1 resolved it as 'model-not-supported') and work is routed to it.** (recoverable)
  - Detection: familyProvider receives a host family (registry.host(family) === 'ollama') with model undefined from shaperSelection.
  - Response: Throw s1's ModelNotSupportedError naming the family and requested model; no provider is built, so neither the vendor CLI default nor another model runs.
  - User impact: The step fails with 'model <id> is not supported by ollama-claude (model-not-supported)'.
- **The claude process on Ollama hangs, runs too long, or the Ollama model answers too slowly.** (recoverable)
  - Detection: The existing per-invocation time limit (CliProvider timeoutMs, default 600000 ms, or the caller's timeout) in runSubprocess / runInProcessGroup expires.
  - Response: The process group is killed and the existing timeout error is raised, exactly as for vendor runs.
  - User impact: The run never waits beyond the existing CLI limit.
- **The claude process on Ollama exits non-zero or returns an error envelope (for example Ollama answers 401/500 mid-run, or the model fails to call the structured-output tool).** (recoverable)
  - Detection: runClaude sees a non-zero exit code or envelope.is_error / missing structured_output, as today.
  - Response: The existing cliExitError / structured-output errors are raised with the CLI's own words; the structured path keeps its existing retry.
  - User impact: Same failure reporting as vendor runs, with the Ollama model named in the log.

**Edge cases**

| Input | Expected |
| :--- | :--- |
| A local-hosting model (hosting 'local') on ollama-claude. | The pre-run check skips the ollama.com sign-in check; Ollama reachability and model availability are still checked. |
| A declared host model with an effort it does not list. | familyProvider drops the effort with its existing warning; claude runs with --model and no --effort. |
| models.local.host set to a non-default address (for example a remote Ollama). | ANTHROPIC_BASE_URL and the pre-run check both use that address. |
| The daemon's own environment already contains ANTHROPIC_BASE_URL, ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN. | An Ollama-targeted run overrides the three Anthropic variables and drops CLAUDE_CODE_OAUTH_TOKEN in the child's copy only; vendor runs still inherit the daemon's environment unchanged. |
| The bounded tool-free structured path on an Ollama-targeted provider. | The child gets boundedClaudeEnv()'s allow-list plus the three Anthropic variables (minus CLAUDE_CODE_OAUTH_TOKEN); every other bounded flag is unchanged. |
| A cloud model listed in /api/tags under its '<name>:cloud' tag. | Counts as available without an /api/show call. |

**Invariants to preserve**

- A vendor claude, codex or vibe run starts with exactly today's arguments and environment: runClaude passes no env to runSubprocess, vibe keeps envForModel, and the bounded path keeps boundedClaudeEnv() unchanged. [[c1]]
- The daemon's process.env and the user's CLI configuration files are never modified; per-run environment is always a copy, as the vibe precedent does. [[c1]]
- The per-invocation time limit and process-group kill apply to every claude run, including Ollama-targeted ones. [[c1]]
- Every role, the shaper and the build-step validate path build providers through familyProvider, so one change there covers all of them; the summariser's existing refusal (s1) is unchanged. [[c2]]
- Provider calls stay serial per caller (no Promise.all over provider calls); this Story adds no concurrency. [[c4]]

## 7. Test strategy

**Test framework:** `node:test with node:assert/strict, run through tsx (src/**/__tests__/*.test.ts); live suites gated behind INSRC_LIVE_TESTS=1 and named *.live.test.ts`

**Test levels**

- **unit** — The Ollama target on CliProvider: per-run environment and arguments for every claude entry point, vendor runs unchanged, and the pre-run check's named causes, using a fake claude binary and a fake Ollama HTTP server.
  - Subjects: `src/agent/providers/__tests__/cli-ollama.test.ts: complete, completeStructured, runEditSession and runReviewSession on an Ollama-targeted provider start claude with --model <id> (and --effort when accepted) and an environment carrying ANTHROPIC_BASE_URL=<host>, ANTHROPIC_AUTH_TOKEN=ollama and ANTHROPIC_API_KEY='' with CLAUDE_CODE_OAUTH_TOKEN removed; the daemon's process.env is unchanged after the run.`, `src/agent/providers/__tests__/cli-ollama.test.ts: the bounded tool-free structured path on an Ollama-targeted provider gets boundedClaudeEnv()'s allow-list plus the three Anthropic variables and its other flags unchanged.`, `src/agent/providers/__tests__/cli-ollama.test.ts: a provider without an Ollama target (claude and codex) passes the same arguments and no Ollama variables as before; the fake binary records the daemon's environment untouched.`, `src/agent/providers/__tests__/cli-ollama.test.ts: the pre-run check against a fake Ollama server throws OllamaTargetError with cause 'ollama-unreachable' (server down or not answering within the check's limit), 'model-unavailable' (model absent from /api/tags and /api/show 404), and 'not-signed-in' (cloud model, /api/me not 200), naming the host, model and fix; no claude process is started; a local-hosting model skips the sign-in check; a listed '<name>:cloud' model passes without /api/show.`, `src/agent/providers/__tests__/cli-ollama.test.ts: constructing a CliProvider with an Ollama target and kind 'codex' or no model throws.`
  - Fixtures: `A fake claude script (as cli-vibe.test.ts does for vibe) that records argv, stdin and the ANTHROPIC_* and CLAUDE_CODE_OAUTH_TOKEN variables, and prints a valid claude JSON envelope with structured_output.`, `A fake Ollama HTTP server on an ephemeral port answering /api/tags, /api/show and /api/me, configurable per test (down, slow, model missing, signed out).`
- **unit** — Provider construction for the host family and refusal of a refused tier.
  - Subjects: `src/analyze/context/__tests__/provider-from-registry.test.ts: familyProvider for ollama-claude with a declared model builds a claude CliProvider with the model and an Ollama target whose host is models.local.host and whose hosting is the model's; vendor families get no target.`, `src/analyze/context/__tests__/provider-from-registry.test.ts: a tier on ollama-claude with an undeclared model makes buildShaperProvider, RoleRouter.resolveProviderForRole and resolveValidateProvider throw ModelNotSupportedError; no CliProvider is built.`
- **unit** — Existing CLI behaviour stays as it was.
  - Subjects: `src/agent/providers/__tests__/cli-vibe.test.ts, src/agent/providers/__tests__/bounded-input.test.ts, src/agent/providers/__tests__/cli-subprocess.test.ts and src/agent/providers/__tests__/cli-failure-message.test.ts stay green unchanged.`
- **live** — A real structured answer from an Ollama cloud model through the claude CLI.
  - Subjects: `src/agent/providers/__tests__/cli-ollama.live.test.ts (INSRC_LIVE_TESTS=1, needs Ollama running and signed in): completeStructured on an Ollama-targeted provider with glm-5.3:cloud returns an answer that passes the requested schema; a provider with a missing model fails with cause 'model-unavailable'.`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `cli-ollama.test.ts: every claude entry point on an Ollama-targeted provider starts claude with --model <id> and the three Ollama variables`, `provider-from-registry.test.ts: familyProvider for ollama-claude builds a claude CliProvider with the model and an Ollama target`, `cli-ollama.live.test.ts: completeStructured on glm-5.3:cloud returns a schema-valid answer` |
| `ac2` | `cli-ollama.test.ts: the pre-run check names 'ollama-unreachable', 'model-unavailable' and 'not-signed-in' and starts no claude process`, `cli-ollama.test.ts: an unresponsive Ollama fails within the check's limit`, `provider-from-registry.test.ts: a refused ollama-claude tier throws ModelNotSupportedError and builds no provider`, `cli-subprocess.test.ts stays green (the existing time limit and process-group kill)` |
| `ac3` | `cli-ollama.test.ts: two awaited calls on one Ollama-targeted provider never overlap (the fake claude records start and end times). Scope (user decision 2026-10-30): ac3 is met as serial per caller, as for today's runners; separate daemon sessions may each run an Ollama-targeted claude at the same time, and no cross-session gate is built.` |
| `ac4` | `cli-ollama.test.ts: providers without an Ollama target (claude, codex) start with today's arguments and no Ollama variables`, `provider-from-registry.test.ts: vendor families get no Ollama target`, `cli-vibe.test.ts and bounded-input.test.ts stay green unchanged` |

## 8. Migration

**State before:** CliProviderOpts has no server target and every claude run inherits the daemon's environment (runClaude passes no env to runSubprocess, src/agent/providers/cli-provider.ts:696-712; the bounded path uses boundedClaudeEnv(), src/agent/providers/bounded-input.ts:31-37). familyProvider (src/analyze/context/shaper-provider.ts:220-246) builds a plain claude CliProvider for any family with a CLI kind, so an ollama-claude tier would run on Anthropic's service with an Ollama model id, and a refused host-family tier would run the vendor CLI's default model (shaperSelection leaves the model undefined, :264-281). There is no pre-run check of Ollama for CLI runs.

**State after:** CliProviderOpts accepts an optional Ollama target. With it, every claude run (complete, structured including bounded, edit and review sessions) first passes a bounded pre-run check of the Ollama server, model and (for cloud models) sign-in, then starts with ANTHROPIC_BASE_URL/AUTH_TOKEN/API_KEY pointed at Ollama in a per-run environment copy. familyProvider sets the target for a host family from models.local.host and the model's hosting, and refuses a host family without a model with ModelNotSupportedError. Vendor runs are byte-for-byte unchanged.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add the OllamaTarget type, the optional ollama field on CliProviderOpts and the OllamaTargetError class; reject the option for a non-claude kind or a missing model at construction. — ↩ rollbackable
2. Build the per-run environment for an Ollama-targeted provider (a copy of the daemon's environment, or of the bounded allow-list, with the three Anthropic variables set and CLAUDE_CODE_OAUTH_TOKEN removed) and pass it at the two claude spawn sites; leave the no-target path passing nothing extra. — ↩ rollbackable
3. Add the bounded pre-run check (Ollama answers, model available, signed in for a cloud model) before every claude call of an Ollama-targeted provider. — ↩ rollbackable
4. Make familyProvider set the Ollama target for a host family and refuse a host family without a model; log family, model, hosting and host. — ↩ rollbackable

**Backward compat:** CliProviderOpts gains an optional field only; every existing caller (familyProvider for vendor and plain Ollama families, src/mcp/controller-review.ts:46, src/cli/services/workflow.ts:276) omits it and keeps today's arguments and environment. Stored tier settings are untouched. Before this Story an ollama-claude tier could not run correctly at all, so no working behaviour changes.

## 9. Alternatives considered

### 9.1 a1: Ollama target option on CliProvider, set by familyProvider — **CHOSEN**

CliProviderOpts gains an optional Ollama target; when present, every claude spawn gets the three Anthropic variables pointed at Ollama in a per-run environment copy, a bounded pre-run check runs before each call, and familyProvider sets the target only for a host family and refuses a host family without a declared model.

CliProviderOpts gains `ollama?: { host: string; hosting: ModelHosting }` (accepted only with kind 'claude' and a model). When it is present, the provider builds the child's environment per run as a copy, never touching process.env: runClaude passes `{ ...process.env, ANTHROPIC_BASE_URL: host, ANTHROPIC_AUTH_TOKEN: 'ollama', ANTHROPIC_API_KEY: '' }` (and drops CLAUDE_CODE_OAUTH_TOKEN so the vendor login is not used) to runSubprocess, and the bounded tool-free path merges the same three variables into its boundedClaudeEnv() allow-list copy. Without the option every argument and environment is exactly as today (runSubprocess still gets no env).

Before each call the provider runs one bounded pre-run check against the target (a small checker in src/agent/providers, using the Ollama HTTP API through the existing ollama client): /api/tags answers (else 'Ollama is not running at <host>'), the model is listed or /api/show finds it (else 'model <id> is not available in Ollama; pull it'), and for a cloud model POST /api/me answers with an account (else 'Ollama is not signed in to ollama.com; run ollama signin'). Each failure throws a named OllamaTargetError with a cause field; the check has its own short time limit and the run keeps the existing CLI time limit, so nothing waits forever. familyProvider (src/analyze/context/shaper-provider.ts:220-246) sets the option from loadLocalProviderConfig().host and the model's hosting when registry.host(family) is 'ollama', and throws s1's ModelNotSupportedError when a host family reaches it without a model, so a refused tier never runs the vendor default. Calls stay serial by the existing caller convention; the provider adds no concurrency.

### 9.2 a2: a1 plus a process-wide one-at-a-time gate for host-family runs

As a1, with a gate that admits one Ollama-hosted CLI run at a time across the daemon, so concurrent sessions queue instead of running in parallel.

Same option, environment, pre-run check and familyProvider change as a1. In addition, every host-family CLI call waits on a gate before it spawns and releases it when the child exits (or is killed). Because the daemon runs sessions on worker threads with separate module state, an in-module promise chain would only serialise one thread; a process-wide gate needs a shared primitive (an Atomics-based lock on a SharedArrayBuffer handed to every worker, or routing host-family calls through the main thread), registered in the module-state inventory.

The gate's wait counts against the run's time limit so a queued call still cannot wait forever.

**Rejected because:** Fully satisfies ac3, but at the cost of new cross-thread shared-memory or main-thread routing infrastructure and new module state, a partial on ac2 from the gate wait, and serialising cloud runs that do not need it; larger than the Story warrants unless the user wants cross-session serialisation.

### 9.3 a3: Start the CLI through `ollama launch claude`

For a host family, CliProvider runs `ollama launch claude --model <id> --yes -- <claude args>` and lets Ollama's launcher set up the environment.

CliProviderOpts gains a launcher mode: instead of spawning `claude` with the Anthropic variables, the provider spawns the `ollama` binary with `launch claude --model <id> --yes --` followed by the usual claude arguments, so Ollama configures the CLI itself. The pre-run check, error naming and familyProvider change are as in a1.

The bounded tool-free path would have to verify the launcher passes its allow-listed environment and flags through unchanged.

**Rejected because:** `ollama launch` writes a CLI profile, which violates lc1 (never change the user's tool configuration), and leaves ac1 and ac2 partial through the extra process layer.

## 10. References

- **[[c1]]** `analyze-bundle` `s1 bundle: How CliProvider starts the claude CLI subprocess and where its environment is set` — "Every claude invocation except the tool-free bounded path goes through the private runClaude (:696-712), which calls runSubprocess (:1078-1094) with NO env argument"
- **[[c2]]** `analyze-bundle` `s1 bundle: How a tier on a family becomes a provider, and what happens today for an ollama-claude tier` — "familyProvider builds CliProvider({ kind: registry.cliKind(family), model, effort, inputBudgetChars, timeoutMs }) for any family with a CLI kind"
- **[[c3]]** `analyze-bundle` `s1 bundle: Ollama host configuration and the calls available for a pre-run check` — "POST /api/me with a JSON body answers 200 with the signed-in ollama.com account"
- **[[c4]]** `analyze-bundle` `s1 bundle: One-at-a-time model calls and the existing test patterns for CliProvider subprocesses` — "No process-wide gate serialises CLI or Ollama calls in src/agent/providers or src/analyze/context; serial calls are a caller convention"

## 11. Open questions

- Item alt2: alternatives were scored against ac1-ac4, sc1 and sc2; Epic constraints k1-k6 are reflected in the notes but not as separate score entries (partial), as in the s1 LLD where k1-k6 were treated as a pre-filter gate.
- Resolved 2026-10-30 (user decision): ac3 means serial per caller, as for today's runners; separate daemon sessions may run Ollama-targeted claude at the same time. Alternative a2's process-wide gate is not built.
- The signed-out answer of POST /api/me was not probed (Ollama was signed in); checkOllamaTarget treats any non-200 answer, or a 200 without an account id, as not signed in. /api/me is reached with plain fetch because the ollama npm client has no call for it (it offers list and show).

## Resolved questions

- `q2800c4c8` — Item alt2: alternatives were scored against ac1-ac4, sc1 and sc2; Epic constraints k1-k6 are reflected in the notes but not as separate score entries (partial), as in the s1 LLD where k1-k6 were treated as a pre-filter gate.
  - **resolved**: Pre-filter gate (mirror s1 LLD) — Same decision as the s1 LLD: k1-k6 are must-meet constraints applied before scoring; a1 meets them. _(2026-10-30T05:26:50.086Z)_

## Citations

- **[[c1]]** `analyze-bundle` `s1 bundle: How CliProvider starts the claude CLI subprocess and where its environment is set` — "Every claude invocation except the tool-free bounded path goes through the private runClaude (:696-712), which calls runSubprocess (:1078-1094) with NO env argument"
- **[[c2]]** `analyze-bundle` `s1 bundle: How a tier on a family becomes a provider, and what happens today for an ollama-claude tier` — "familyProvider builds CliProvider({ kind: registry.cliKind(family), model, effort, inputBudgetChars, timeoutMs }) for any family with a CLI kind"
- **[[c3]]** `analyze-bundle` `s1 bundle: Ollama host configuration and the calls available for a pre-run check` — "POST /api/me with a JSON body answers 200 with the signed-in ollama.com account"
- **[[c4]]** `analyze-bundle` `s1 bundle: One-at-a-time model calls and the existing test patterns for CliProvider subprocesses` — "No process-wide gate serialises CLI or Ollama calls in src/agent/providers or src/analyze/context; serial calls are a caller convention"
