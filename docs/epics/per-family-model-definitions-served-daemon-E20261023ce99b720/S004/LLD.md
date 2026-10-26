<!-- insrc:artifact LLD-ce99b72065d03b1b-s4 -->

# LLD: E20261026ce99b720:S004

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**HLD base run:** `wf-1792924917927-2y1e5h`
**HLD effective hash:** `c324f041e3e7...`

s4 adds three daemon requests that let a user adopt a Claude or Codex model the definitions do not list. models.check runs the family's check through its own CLI, one CLI call at a time daemon-wide, and returns each claimed effort level with the CLI's evidence; models.approve and models.reject record the user's decision for that check in the approved-model store, written atomically and acknowledged only once written. A decision takes effect at the next daemon restart, and approval is refused unless the model actually ran.

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

> See **HLD-ce99b72065d03b1b** § 2. Framework summary

**Rollout phase:** Phase C — unknown-model check and approval
**Owns:** `sc4` (Unknown-model check and approval requests)
**Consumes:** `sc1` (ModelDefinitionsFile (the curated catalog file, extended)), `sc2` (ModelRegistry and the approved-model store), `sc3` (models.definitions IPC request)

**Adjacent scope (owned by other stories — do NOT implement here):**
- `s1`: Extending the catalog file, its types (CloudModelCatalogFile, src/daemon/model-catalog.ts:48) and its validator in place; refreshing its contents with today's models, the aliases today's tier defaults use (opus, sonnet, haiku), the Ollama models insrc ships with and their context windows, and today's coreModel as the tool-loop default; the registry and its per-thread cache; moving the boot validation ahead of the settings reconcile and the worker threads; reading the approved-model store (a malformed store is logged and treated as empty); keeping the curated catalog's existing accessor answering providers.listModels from the new file shape until s2 replaces it. The validator refuses a missing or malformed file, an unknown, missing or repeated family, a CLI family without its CLI kind, tier defaults or summariser model, a model without an efforts list, a duplicate id or alias, a default that is not a model of its family, an Ollama model without a token input limit, and a tool-loop default that is not listed, naming the entry (ac3). Tests: one fixture per refusal reason (ac3); a model and alias added to a fixture are served after a restart with no code change (ac2); the file is validated before the settings reconcile, before any worker starts and before listen (ac1, k7); repeated requests in one thread return the same definitions even after the file changes on disk (ac1); a replacement worker started after the file, the store or config.json changed on disk uses the new values while a surviving thread keeps its own until the restart, and a thread whose first read comes after such a change likewise uses the new values; after a daemon restart every thread resolves the same definitions, approvals and tiers; providers.listModels still returns today's Claude and Codex models through the kept accessor; alias, effort and limit lookups; resolveTier distinguishes rejected-model from unlisted-model and falls back to the tier's family default, or the default family's for an Ollama tier. — owns `sc1`, `sc2`
- `s2`: The models.definitions handler and its method-class entry, the projection of the registry, each listed Ollama model's installed state from the existing bounded listing, and re-sourcing providers.listModels from the registry (for Ollama, listed models only), then removing the curated catalog accessor s1 kept. Tests: models.definitions returns every field of a fixture file (ac1); providers.listModels and models.definitions agree for every family, and an installed but unlisted Ollama model appears in neither (ac2); with Ollama not answering, installed is absent and the request still succeeds. — owns `sc3`
- `s3`: Moving every daemon consumer onto the registry: tier resolution, summariser selection, effort forwarding, CliProvider's input budget and CLI kind, OllamaProvider's num_ctx, the tool-loop model (an unlisted coreModel runs the tool-loop default with a warning) and the runner and model literals in routing, provider construction, attribution and workflow code; SUMMARISER_CLI_FALLBACK, CODEX_INPUT_BUDGET_CHARS and ollamaNumCtx go; DEFAULT_TIERS and TIER_EFFORTS stop being written in code and remain only as temporary exports drawn from the definitions for the TUI's model-tiers pane, which s5 migrates; no daemon code uses them. The settings catalog's tier and coreModel defaults and effort values are taken from the definitions; how the settings catalog reaches the file is decided in this Story's LLD and must work in every process that loads the settings catalog today (the daemon, the TUI, the updater, and the VS Code bundle until s6 drops its use). Reconcile removes per-repo tier overrides with a warning and prunes ollamaNumCtx; readRepoOverride and its callers go. config.write refuses a tier set to a rejected model and reports restartRequired. models.resolveRole and its method-class entry. Both installer copies take tier defaults and the tool-loop default from the file. Tests: an unset tier resolves to the file's default, and with a fixture whose defaults differ from today's, reconcile fills the fixture's values (ac1); an unsupported effort is dropped with a warning naming model and effort (ac2); a source scan fails on runner or model literals outside the family implementations, on any read of ollamaNumCtx, and on any daemon use of the temporary DEFAULT_TIERS or TIER_EFFORTS exports (ac3); the TUI still builds and its model-tiers pane shows the definitions' defaults; a repo's `tasks` choice applies with the global tier's model (ac4); reconcile removes per-repo tier overrides with a warning naming repo and tier and keeps `tasks` and coreFloor (ac5); an unlisted model falls back with the warning (decision A); a fixture Ollama model's input limit sets num_ctx; config.write refuses a rejected model and reports restartRequired; models.resolveRole matches the daemon's own resolution for a CLI tier and an Ollama tier; the settings catalog loader accepts the catalog and an unset JetBrains tier still shows the default family's values. — owns `sc5`
- `s5`: The TUI model-tiers pane and its effort choices from models.definitions, removing the temporary DEFAULT_TIERS and TIER_EFFORTS exports s3 kept; the unknown-model check and approval screen; the repo settings view limited to `tasks` and coreFloor; showing restartRequired and offering maintenance.restart; the review command using models.resolveRole and building its provider from the answer instead of reading config.json; Setup recommending the definitions' tool-loop default instead of DEFAULT_LOCAL_MODEL, and saying it cannot recommend when the daemon is not running. Tests: the pane offers exactly the options of a fake models.definitions answer and no source file still exports or imports DEFAULT_TIERS or TIER_EFFORTS (ac1); saving an unknown model starts the check and shows its results (ac2); the repo view edits only `tasks` and coreFloor (ac3); the review command runs the model a fake models.resolveRole returns for a CLI and an Ollama tier; Setup recommends the fake answer's tool-loop default.
- `s6`: The VS Code model-tier picker driven by models.definitions instead of its runner list and the bundled settings catalog's effort rows, removing the bundle's import of the settings catalog; the unknown-model check and approval prompt; the Repo Configuration panel without per-tier fields; showing restartRequired and offering insrc.daemon.restart. Tests: the picker offers exactly a fake answer's options and the bundle keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the repo panel shows only `tasks` and coreFloor (ac3).
- `s7`: The JetBrains model-tiers section driven by models.definitions instead of ModelTiersModel.PROVIDERS; the unknown-model check and approval dialog; the per-repo settings without per-tier fields; showing restartRequired. Tests: the section offers exactly a fake answer's options and the plugin keeps no runner or model list (ac1); an unknown model is saved only after approval (ac2); the per-repo settings show only `tasks` and coreFloor (ac3).

## 2. Contract details

**Surface level:** internal-shared

### 2.1 `models.check`

```typescript
'models.check': (params: { family: 'cli-claude' | 'cli-codex'; modelId: string; claimedEfforts: EffortLevel[] }) => Promise<ModelCheckResult | { error: string; recoverable: false }>  // src/daemon/model-check.ts checkModel(params, deps?: ModelCheckDeps)
```

**Parameters:**
- `family: 'cli-claude' | 'cli-codex'` — The CLI family to check the model against (the family's cliKind picks the binary).
- `modelId: string` — The model id as the CLI names it; must not be a model or alias the family already serves.
- `claimedEfforts: EffortLevel[]` — The effort levels the user wants to use with the model; each gets a verdict.

**Returns:** `ModelCheckResult` — { checkId, family, modelId, runs, inputLimit?, efforts: [{ effort, verdict, evidence }], error? } (sc4). Codex: the CLI's model list (`codex debug models`) decides each claimed effort — 'accepted' when the model's supported_reasoning_levels lists it, else 'rejected' with the listed levels as evidence (and 'rejected' for every effort when the list does not contain the model) — and one `codex exec --json -m <id>` run decides runs; no inputLimit (the CLI's own refusal decides, sc1). Claude: one `claude --print --output-format json --model <id>` run decides runs and gives inputLimit { unit: 'tokens', max: modelUsage[<model>].contextWindow }; each claimed effort is 'recognised-unconfirmed' when `claude --help` lists it among the --effort values (evidence states that no Claude CLI output shows whether the model supports it, lc3), else 'rejected' with the recognised names. Each check also records the CLI's `--version`. The result is kept in a bounded in-memory table by checkId for approve/reject.

**Errors:**
- `{ error: 'invalid-params: ...', recoverable: false }` when family not a CLI family of the definitions, modelId empty or not a string, claimedEfforts not an array of non-empty strings, or modelId already a model or alias the family serves (registry.find).
- `ModelCheckResult with runs:false and error` when The CLI could not be reached — runInProcessGroup's result has spawnError (e.g. ENOENT) or timedOut — error begins 'the <kind> CLI could not be reached:' — or the CLI reached its service and refused the model (claude is_error / codex error or turn.failed event) — error begins 'the <kind> CLI refused the model:' with the CLI's message.

**Preconditions:**
- The daemon validated the definitions at boot.
- Only one CLI call of any check runs at a time daemon-wide (a module-level serial chain); concurrent checks queue.
- Every CLI call goes through runInProcessGroup (src/shared/process-group.ts:73), the exported process-group runner whose ProcessGroupResult carries spawnError and timedOut; cli-provider's private runSubprocess is not used or changed.

**Postconditions:**
- Nothing is written: the store and config.json are unchanged (ac2).
- Each CLI call and its verdict is logged.
- No provider web API is called; only the installed claude / codex binaries (lc1).

### 2.2 `models.approve`

```typescript
'models.approve': (params: { checkId: string; efforts: EffortLevel[] }) => Promise<DecisionResult>  // src/daemon/model-check.ts approveCheck(params, deps?)
```

**Parameters:**
- `checkId: string` — A check this daemon ran since it started.
- `efforts: EffortLevel[]` — The levels the user allows; each must be one the check did not reject.

**Returns:** `DecisionResult` — { ok: true, restartRequired: true } once the store holds an approved ApprovedProfile { family, modelId, status: 'approved', efforts (the requested levels), inputLimit (from the check), decidedAt, cliVersion }; the registry, config.write and models.definitions use it after the next restart (ac3, ac5). When the check's effort discovery was unreadable or rejected every claimed level, the model can still be approved with efforts [] (it ran); no effort can be approved from such a check.

**Errors:**
- `{ ok: false, reason: 'unknown-check' }` when No pending check with that id (never run, evicted, or the daemon restarted).
- `{ ok: false, reason: 'model-did-not-run' }` when The check's runs is false (unreachable CLI or refused model).
- `{ ok: false, reason: 'invalid-efforts' }` when An effort is not one of the check's claimed levels, or its verdict was 'rejected'; detail names it.
- `{ ok: false, reason: 'write-failed' }` when The existing store is not a { version: 1, profiles[] } document (unreadable, malformed JSON, not an object, version missing, not a number or not 1, or profiles not an array), or writing / renaming the temp file failed; the previous store is kept unchanged and no file is created or replaced.

**Preconditions:**
- checkId names a pending check.

**Postconditions:**
- The store is replaced atomically (write <store>.tmp, then rename) with every existing entry kept and the new profile appended; success is returned only after the rename.
- The pending check is consumed.

### 2.3 `models.reject`

```typescript
'models.reject': (params: { checkId: string }) => Promise<DecisionResult>  // src/daemon/model-check.ts rejectCheck(params, deps?)
```

**Parameters:**
- `checkId: string` — A check this daemon ran since it started (it need not have run the model).

**Returns:** `DecisionResult` — { ok: true, restartRequired: true } once the store holds a rejected ApprovedProfile { status: 'rejected', efforts: [] }; after a restart config.write refuses a tier set to the model (s3) and models.definitions lists it among the family's rejected ids (ac4, ac5).

**Errors:**
- `{ ok: false, reason: 'unknown-check' }` when No pending check with that id.
- `{ ok: false, reason: 'write-failed' }` when As for models.approve; the previous store is kept.

**Preconditions:**
- checkId names a pending check.

**Postconditions:**
- The store is replaced atomically with the rejected profile appended; the pending check is consumed.

## 3. Data model changes

### 3.1 `Approved-model store (PATHS.approvedModels, ~/.insrc/approved-models.json)` — invariant-change

The store s1 reads (ApprovedProfile entries, sc2) gains its only writer. The daemon appends one profile per decision; the latest decidedAt per (family, modelId) wins when the registry reads it (s1), so a later decision supersedes an earlier one without rewriting it. The document shape { version: 1, profiles: ApprovedProfile[] } is unchanged; existing entries, including ones the reader skips as invalid, are kept verbatim. Written atomically: <path>.tmp then rename, the directory created if missing. The writer accepts an existing document only when it is an object whose version is the number 1 and whose profiles is an array (the reader's root check plus the version this writer produces); a document with another version is left alone (write-failed) so a newer daemon's store is never rewritten. The new profile is validated with the reader's own profileProblem before writing.

```
+ writer: models.approve / models.reject append { family, modelId, status, efforts, inputLimit?, decidedAt, cliVersion }
```

**Call sites:**
- `src/daemon/model-registry.ts:49`
- `src/daemon/model-registry.ts:114`
- `src/daemon/model-registry.ts:159`
- `src/shared/paths.ts:12`

### 3.2 `Pending model checks (in-memory, src/daemon/model-check.ts)` — new

A Map<checkId, { result: ModelCheckResult; cliVersion: string }> on the thread serving session methods, holding at most 32 checks (the oldest evicted). Lost on restart: an approval must follow a check run by the current daemon.


### 3.3 `Method-class table and recorded RPC set` — field-add

Adds ['models.check', 'session', false], ['models.approve', 'session', false], ['models.reject', 'session', false] to src/daemon/threads/method-class.ts and the three names to RECORDED_RPC in src/daemon/__tests__/handler-runtime.test.ts; the handlers are registered in buildHandlerRuntime.

**Call sites:**
- `src/daemon/threads/method-class.ts:156`
- `src/daemon/__tests__/handler-runtime.test.ts:47`
- `src/daemon/handler-runtime.ts`

### 3.4 `model-registry.ts validation exports` — field-add

src/daemon/model-registry.ts exports its existing profileProblem(entry) (today module-private) unchanged, so the writer validates a new profile with exactly the rule the reader applies, and the contract tests call it directly. readStore and buildModelRegistry are not changed; reader behaviour is identical. Read-back tests go through getModelRegistry with the existing _setApprovedModelsPathForTests / _resetModelRegistryForTests seams, and through the exported buildModelRegistry.

```
+ export function profileProblem(e: unknown): string | undefined  (export only; body unchanged)
```

**Call sites:**
- `src/daemon/model-registry.ts:113`
- `src/daemon/model-registry.ts:119`
- `src/daemon/model-registry.ts:126`
- `src/daemon/model-registry.ts:201`

### 3.5 `Subprocess seam for checks` — field-add

model-check.ts runs every CLI call through the exported runInProcessGroup(command, args, opts) of src/shared/process-group.ts, mapping ProcessGroupResult: spawnError → 'could not be reached: <spawnError>', timedOut → 'could not be reached: timed out after <n> s', otherwise stdout/stderr/exitCode are parsed per call. No change to cli-provider.ts.

**Call sites:**
- `src/shared/process-group.ts:24`
- `src/shared/process-group.ts:73`

## 4. Diagrams

- [Sequence diagram](docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/S004/sequence-diagram.html)

## 5. Interaction with shared contracts

| Contract | Role | How |
| :--- | :--- | :--- |
| `sc4` | implements | Implements models.check / models.approve / models.reject with the sketched params, ModelCheckResult, EffortVerdict and DecisionResult shapes; error distinguishes an unreachable CLI from a refusing one in its text. |
| `sc2` | consumes | Writes ApprovedProfile entries in the store shape s1 defined and reads; uses getModelRegistry() to refuse checking a model the family already serves and to map a family to its cliKind. Does not change the reader or the registry. |
| `sc1` | consumes | Reads the family's cliKind from the definitions; the shipped file is never written. |
| `sc3` | consumes | No change to models.definitions: after a restart the registry it projects includes the approved model (source 'user-approved', only its approved efforts) and the rejected id (ac5). |

## 6. Error paths

**Error cases**

- **The family's CLI binary is not installed or not on PATH.** (recoverable)
  - Detection: runInProcessGroup's result for `<kind> --version` (the first call of every check) carries spawnError (e.g. ENOENT).
  - Response: The check stops without further calls and returns runs:false, efforts each 'rejected' with evidence 'not checked: the CLI could not be reached', and error 'the <kind> CLI could not be reached: <spawn message>'. Logged with family, model and the spawn error.
  - User impact: The user sees why the model cannot be checked; models.approve on this check is refused with model-did-not-run (ac4).
- **A CLI call hangs (no network, a login prompt, a stuck process).** (recoverable)
  - Detection: runInProcessGroup's result has timedOut true (the per-call timeoutMs from ModelCheckDeps, default 120 s, fired and the process group was killed).
  - Response: Same as an unreachable CLI: runs:false, error 'the <kind> CLI could not be reached: timed out after <n> s'. The serial chain moves on to the next queued call.
  - User impact: The check returns an explained failure instead of blocking later checks.
- **The CLI reaches its service and refuses the model (unknown model, no access).** (recoverable)
  - Detection: Claude: the JSON envelope has is_error true (e.g. api_error_status 404). Codex: the --json stream contains an event of type 'error' or 'turn.failed' (e.g. model_not_found).
  - Response: runs:false, error 'the <kind> CLI refused the model: <the CLI's message>'; efforts keep their own verdicts (Codex list / Claude recognised names) so the user sees all evidence. Logged.
  - User impact: The user learns the model id is wrong or unavailable to their account; approval is refused (model-did-not-run).
- **The CLI output cannot be parsed (no JSON envelope, `codex debug models` not JSON or without a models array, a changed CLI format).** (recoverable)
  - Detection: JSON.parse throws, or the parsed value lacks the expected fields (envelope without is_error/result; list without models[]).
  - Response: For the run: runs:false with error 'the <kind> CLI refused the model: unrecognised output: <first 200 chars>' is NOT used — instead error 'the <kind> CLI gave unreadable output: <first 500 chars>' and runs:false. For the Codex list: every effort 'rejected' with evidence 'the CLI's model list could not be read'. For Claude help: every effort 'rejected' with evidence 'the CLI's --effort values could not be read'. Never guesses support.
  - User impact: The user sees what the check could not decide. When the run itself was unreadable, runs is false and nothing can be approved; when only effort discovery was unreadable, every level is rejected, so no effort can be approved, though a model that ran can still be approved with efforts [].
- **The Claude run succeeds but modelUsage has no contextWindow for the model.** (recoverable)
  - Detection: modelUsage is absent, empty, or its entry has no positive integer contextWindow.
  - Response: runs stays true and inputLimit is omitted (the CLI's own refusal then decides, as sc1 allows for a CLI model without inputLimit); logged.
  - User impact: The model can still be approved; its prompts are not pre-trimmed by a stated limit.
- **The store file is unreadable or not a { version, profiles[] } document when a decision is written.** (recoverable)
  - Detection: readFileSync throws something other than ENOENT, JSON.parse throws, or the parsed value is not an object whose version is the number 1 and whose profiles is an array (a missing, non-numeric or other version, e.g. {"profiles":[]} or {"version":"broken","profiles":[]} or version 2, fails).
  - Response: models.approve / models.reject return { ok:false, reason:'write-failed', detail naming the problem } and write nothing, so a hand-edited or damaged store is never overwritten. The pending check is kept so the user can retry after fixing the file.
  - User impact: The decision is not recorded and the user is told why; the existing file is untouched.
- **Writing or renaming the temp store file fails (disk full, permissions, read-only home).** (recoverable)
  - Detection: mkdirSync / writeFileSync of <store>.tmp or renameSync throws.
  - Response: The temp file is removed (best effort), the function returns { ok:false, reason:'write-failed', detail: the error message }; the previous store is unchanged because only the rename replaces it. The pending check is kept.
  - User impact: No partial store; the user can retry.
- **models.approve / models.reject with a checkId that is not pending.** (recoverable)
  - Detection: The pending-check Map has no entry for the id (never issued, evicted after 32 newer checks, consumed by an earlier decision, or the daemon restarted).
  - Response: { ok:false, reason:'unknown-check', detail: 'no pending check <id>; run models.check again' }.
  - User impact: The user re-runs the check; no stale result can be approved.
- **models.approve on a check whose model did not run.** (recoverable)
  - Detection: The pending result has runs === false.
  - Response: { ok:false, reason:'model-did-not-run', detail: the check's error }; nothing written; the check stays pending so it can still be rejected.
  - User impact: Approval is impossible without a successful run (sc4); the reason is shown (ac4).
- **models.approve with an effort the check rejected or never claimed, or a non-array / empty-string effort.** (recoverable)
  - Detection: Each requested effort is looked up in the check's efforts; a missing entry or verdict 'rejected' fails, as does a non-string entry.
  - Response: { ok:false, reason:'invalid-efforts', detail naming each offending effort and its verdict }; nothing written.
  - User impact: Only checked, non-rejected levels can be approved (ac3, lc2, lc3).
- **Invalid models.check params.** (terminal)
  - Detection: family is not a family whose registry cliKind is defined, modelId is not a non-empty string, claimedEfforts is not an array of non-empty strings, or registry.find(family, modelId) is defined.
  - Response: { error: 'invalid-params: <what>', recoverable: false }; no CLI call made.
  - User impact: A shipped or already-approved model is not re-checked; Ollama models are refused (only listed Ollama models are selectable).

**Edge cases**

| Input | Expected |
| :--- | :--- |
| Two models.check calls arrive together (two clients, or a client retrying). | Both complete; their CLI calls run strictly one after another through the module-level chain (never two CLI children at once), each with its own checkId; a failure in one does not break the chain for the other. |
| claimedEfforts is [] . | The CLI calls still run (runs and inputLimit are decided) and efforts is []; models.approve with efforts [] stores a profile whose model runs with no effort passed, consistent with a ModelDefinition whose efforts is []. |
| claimedEfforts repeats a level (['high','high']). | Duplicates are collapsed, keeping the first order; one verdict per level. |
| A Codex model that `codex debug models` does not list but that runs. | runs:true, every claimed effort 'rejected' with evidence 'the CLI's model list does not include <id>'; the user may still approve it with efforts []. |
| A Codex model listed with supported levels low/medium/high and claimed ['high','ultra']. | 'high' accepted with evidence listing the supported levels; 'ultra' rejected with the same evidence, even though a run at ultra would succeed (lc2). |
| A Claude claimed effort 'xhigh' that `claude --help` lists. | Verdict 'recognised-unconfirmed', evidence quoting the recognised values and stating that no Claude CLI output shows whether this model supports it (lc3); approvable. |
| The model was previously rejected and is checked again. | Allowed (registry.find does not serve a rejected id); a later approve appends a newer profile and, after a restart, the latest decidedAt wins (s1), so the model becomes usable. |
| The store file does not exist yet (first decision). | The insrc home directory is created if missing and a new { version: 1, profiles: [profile] } is written atomically. |
| The store holds entries the reader would skip as invalid. | They are copied through verbatim; s4 never deletes or repairs entries. |
| A 33rd check is run while 32 are pending. | The oldest pending check is evicted; approving it later returns unknown-check. |
| approve then reject (or approve twice) on the same checkId. | The first decision consumes the check; the second returns unknown-check. |
| The user approves a model that a later daemon update ships in the definitions. | Nothing in s4 changes: the shipped definition wins in the registry (sc2 durability rule). |
| A store at version 2 (written by a newer daemon) when a decision is written. | write-failed naming the unsupported version; the file is not rewritten, so a newer format is never downgraded. |

**Invariants to preserve**

- A check reaches the model only through the installed claude or codex binary; no provider web API and no new network client is added (lc1). [[c4]]
- For Codex the CLI's own model list, never a successful run at a level, decides each effort verdict (lc2). [[c11]]
- For Claude no effort is ever reported 'accepted'; recognised names are 'recognised-unconfirmed' and the evidence says the CLI cannot confirm per-model support, so only the user's approval admits a level (lc3). [[c15]]
- The shipped definitions file and config.json are never written by s4; decisions live only in the approved-model store, in the ApprovedProfile shape s1 reads, and apply at the next restart through the per-thread registry (sc1, sc2). [[c5]]
- The store is replaced only by an atomic rename after a full successful write, existing entries are kept verbatim, and a decision is acknowledged only after the rename; a malformed existing store is never overwritten. [[c12]]
- LLM-reaching work is serial: at most one CLI child of any check runs at a time daemon-wide (CLAUDE.md: never Promise.all provider calls; HLD sc4 'one call at a time'). [[c11]]

## 7. Test strategy

**Test framework:** `node:test + node:assert/strict, run with tsx (npx tsx --test); fake claude/codex CLI binaries written to a temp dir as in src/agent/providers/__tests__/cli-subprocess.test.ts; real-daemon tests via src/mcp/__tests__/helpers/mcp-e2e.ts in a temp HOME`

**Test levels**

- **unit** — The check procedures, verdicts, serialisation, decision guards and atomic store write of src/daemon/model-check.ts, with fake CLIs and a temp store.
  - Subjects: `src/daemon/__tests__/model-check.test.ts: Codex check — `codex debug models` listing the model with low/medium/high: claimed ['high','ultra'] gives high accepted, ultra rejected with the listed levels as evidence even though the fake exec succeeds at ultra (lc2); a model absent from the list gives every effort rejected; the exec run decides runs; no inputLimit`, `model-check.test.ts: Claude check — the fake run's envelope gives runs:true and inputLimit { unit: 'tokens', max: contextWindow }; claimed names listed by the fake --help are recognised-unconfirmed with evidence saying the CLI cannot confirm per-model support, others rejected; no effort is ever 'accepted' (lc3); a missing contextWindow omits inputLimit`, `model-check.test.ts: unreachable vs refusing — a missing binary (ENOENT) and a fake that sleeps past a short injected timeout both give runs:false with 'could not be reached'; a Claude is_error envelope and a Codex turn.failed/model_not_found stream give 'refused the model' with the CLI's message; unreadable output gives runs:false; the unreachable cases are driven through runInProcessGroup's spawnError and timedOut`, `model-check.test.ts: one at a time — two concurrent checkModel calls against fakes that record start/end timestamps and a lock file: no two CLI children overlap; a failing first check does not stop the second`, `model-check.test.ts: invalid params — unknown/ollama family, empty modelId, non-array efforts, and a model or alias the family already serves are refused with invalid-params and no CLI call (the fake records none)`, `model-check.test.ts: decisions — unknown-check, model-did-not-run, invalid-efforts (rejected or unclaimed level) refused with nothing written; approve writes an approved profile with only the requested efforts, the check's inputLimit and cliVersion, and decidedAt; reject writes a rejected profile with efforts []; a consumed or evicted (33rd) check returns unknown-check`, `model-check.test.ts: store write — missing store and missing directory created; existing entries (including invalid ones) kept verbatim and the new one appended; a malformed store, a store without version, with a string version, with version 2, and a failing rename (store path's directory made read-only, or an injected fs) each return write-failed and leave the previous bytes unchanged (or no file created) with no leftover .tmp; every written store is read back through getModelRegistry (via _setApprovedModelsPathForTests / _resetModelRegistryForTests) and buildModelRegistry`, `model-check.test.ts: unreadable effort discovery — a fake `codex debug models` / `claude --help` printing garbage while the run succeeds gives runs:true with every effort rejected; approve with any effort returns invalid-efforts and approve with [] succeeds`
  - Fixtures: `Temp definitions dir from the shipped file via _setModelCatalogDirForTests, temp store via _setApprovedModelsPathForTests`, `Fake `claude` and `codex` scripts (node shebang) whose behaviour is chosen per test by env vars: --version text, `debug models` JSON, exec --json event stream, --print JSON envelope, --help text, sleep, and a call log`
- **integration** — The three requests through the real daemon, and the decision's effect after a restart on config.write, tier resolution and models.definitions.
  - Subjects: `src/daemon/__tests__/models-daemon-s4.test.ts: start the daemon in a temp HOME with fake CLIs first on PATH; models.check returns per-effort evidence and leaves approved-models.json and config.json unchanged; config.write of a tier to the checked model before approval is not admitted as listed (decision A / not-served)`, `models-daemon-s4.test.ts: models.approve with a subset of the passing levels → restartRequired:true and the store holds the profile; after maintenance restart (stop + start) models.definitions lists the model under its family with source 'user-approved' and only the approved efforts; config.write of a tier to it succeeds and models.resolveRole resolves it with an approved effort, while an unapproved effort is dropped with the warning`, `models-daemon-s4.test.ts: models.reject → after restart models.definitions lists the id among the family's rejectedModels and config.write of a tier to it is refused with the reason; a check against an absent CLI (PATH without the fake) returns 'could not be reached' and models.approve returns model-did-not-run`, `src/daemon/__tests__/handler-runtime.test.ts: RECORDED_RPC includes models.check, models.approve, models.reject; method-class.test classifies them as session`
  - Fixtures: `mcp-e2e startDaemon / childEnv with PATH prefixed by the fake-CLI dir`, `The shipped definitions (or a copy via INSRC_MODEL_CATALOG_DIR)`, `For the success paths: a definitions copy (INSRC_MODEL_CATALOG_DIR) that does not list the model id the fake CLIs answer for`
- **contract** — The result and decision shapes match sc4 and the written profile matches the sc2 entry shape s1 reads.
  - Subjects: `model-check.test.ts: every ModelCheckResult has exactly the sc4 fields (checkId, family, modelId, runs, efforts[{effort, verdict in accepted|rejected|recognised-unconfirmed, evidence}], optional inputLimit/error); DecisionResult is { ok:true, restartRequired:true } or { ok:false, reason in the four values, detail }`, `model-check.test.ts: each profile written passes model-registry's exported profileProblem (undefined) and appears through buildModelRegistry and getModelRegistry as a user-approved model or a rejected id`
- **live** — Confirm the parsers against the real installed CLIs (gated by INSRC_LIVE_TESTS=1, skipped otherwise).
  - Subjects: `src/daemon/__tests__/model-check.live.test.ts: uses an isolated definitions fixture (INSRC_MODEL_CATALOG_DIR / _setModelCatalogDirForTests) copied from the shipped file with the chosen real models and their aliases removed (claude-haiku-5-5 / haiku from cli-claude, gpt-6-luna from cli-codex), so the registry does not serve them and models.check reaches the CLI: an unknown codex model id gives runs:false 'refused the model'; gpt-6-luna runs and its verdicts match `codex debug models`; an unknown claude id gives 'refused the model'; haiku runs and reports an inputLimit`
  - Fixtures: `Isolated definitions dir: the shipped file minus the live-tested models and aliases`

**Acceptance mapping**

| Criterion | Proving tests |
| :--- | :--- |
| `ac1` | `model-check.test.ts: Codex check takes efforts from the CLI's model list and confirms the model runs`, `model-check.test.ts: Claude check confirms the run, reads inputLimit from the JSON output and checks names against --help`, `model-check.test.ts: one at a time — no two CLI children overlap`, `models-daemon-s4.test.ts: models.check through the daemon with fake CLIs` |
| `ac2` | `model-check.test.ts: each claimed level is listed with a verdict and evidence; Codex accepted/rejected, Claude rejected/recognised-unconfirmed and never accepted`, `models-daemon-s4.test.ts: models.check leaves the store and config.json unchanged and the model is not served before approval` |
| `ac3` | `model-check.test.ts: approve writes only the requested levels and refuses a rejected or unclaimed level (invalid-efforts)`, `models-daemon-s4.test.ts: after approve + restart config.write accepts a tier set to the model and resolution keeps an approved effort but drops an unapproved one` |
| `ac4` | `model-check.test.ts: unreachable CLI gives runs:false 'could not be reached' and approve returns model-did-not-run`, `models-daemon-s4.test.ts: after reject + restart config.write refuses a tier set to the model with the reason; an absent CLI's check cannot be approved` |
| `ac5` | `models-daemon-s4.test.ts: after approve + restart models.definitions lists the model under its family as user-approved with only its approved efforts, and after reject among rejectedModels`, `model-check.test.ts: each written profile is read back by buildModelRegistry as user-approved / rejected` |

## 8. Migration

**State before:** The registry already reads the approved-model store (src/daemon/model-registry.ts readStore / buildModelRegistry, PATHS.approvedModels at src/shared/paths.ts:12) and models.definitions / config.write already honour user-approved and rejected profiles (src/daemon/model-definitions.ts, src/daemon/config-write.ts), but nothing writes the store: a user cannot adopt a model the definitions do not list, and an unlisted tier falls back to the family default with a warning (decision A). The daemon spawns claude / codex only as providers (src/agent/providers/cli-provider.ts:868 runSubprocess).

**State after:** src/daemon/model-check.ts adds the check procedures (Codex: `--version`, `debug models`, one `exec --json` run; Claude: `--version`, `--help`, one `--print --output-format json` run), a daemon-wide serial chain for their CLI calls, a bounded pending-check table, and the only writer of the store (append + atomic rename). models.check / models.approve / models.reject are registered in buildHandlerRuntime, classified 'session' in method-class.ts and pinned in RECORDED_RPC. After a decision and a restart, the existing registry, models.definitions and config.write serve the approved model or refuse the rejected one with no change to them.

**Zero downtime:** yes — **Data rewrite:** no

**Steps**

1. Add src/daemon/model-check.ts with the CLI check procedures (every call through runInProcessGroup from src/shared/process-group.ts), output parsers, serial chain and pending-check table; no caller yet. — ↩ rollbackable
2. Export the existing profileProblem from src/daemon/model-registry.ts (no behaviour change), then add the store writer to model-check.ts: read the current document (missing = new), refuse one that is not { version: 1, profiles[] }, validate the new profile with profileProblem, append it, write <store>.tmp and rename. — ↩ rollbackable
3. Register models.check, models.approve and models.reject in buildHandlerRuntime, add their 'session' method-class entries and add them to RECORDED_RPC. — ↩ rollbackable
4. Add the unit, contract and real-daemon tests (fake CLIs on PATH, restart between decision and use) and the gated live test. — ↩ rollbackable

**Backward compat:** Additive only: three new IPC methods; no existing request, result shape or config key changes. The store keeps its { version: 1, profiles[] } shape and existing entries are copied through verbatim, so a store written by s4 is read by the s1 reader unchanged, and a daemon rolled back to before s4 still reads it (the reader already exists). Clients that never call the new methods behave exactly as before; the UIs adopt them in s5–s7. model-registry.ts only gains an export of an existing function.

## 9. Alternatives considered

### 9.1 a1: Three session RPCs over an in-memory pending-check table — **CHOSEN**

models.check runs the family's procedure under one daemon-wide serial lock and keeps the result in a bounded in-memory table by checkId; models.approve / models.reject read it and write the store atomically.

A new src/daemon/model-check.ts holds the check procedures (Codex: `codex debug models` for the model's supported_reasoning_levels, then one `codex exec --json -m <id>` run; Claude: one `claude --print --output-format json --model <id>` run whose modelUsage gives contextWindow, and the recognised --effort names from `claude --help`), a module-level promise chain so only one CLI call runs at a time daemon-wide, and a bounded Map<checkId, ModelCheckResult & { cliVersion }> on the main thread. models.check (params family/modelId/claimedEfforts) returns ModelCheckResult; models.approve(checkId, efforts) refuses unknown-check, model-did-not-run and efforts outside those the check admitted, then appends an ApprovedProfile and writes the store via write-tmp-then-rename, acknowledging only after the rename; models.reject(checkId) writes a rejected profile the same way. All three are 'session' method-class entries and in RECORDED_RPC. A decision applies at restart (restartRequired:true), as the registry is cached per thread.

### 9.2 a2: a1 plus a persisted pending-check file

Same requests, but checks are also written to ~/.insrc so a check can be approved after a restart.

As a1, with every ModelCheckResult also written atomically to a pending-checks file under the insrc home and read back on approve; entries expire after a fixed age.

**Rejected because:** Adds a second persistent file and expiry policy nobody asked for, and weakens the guarantee that approval follows a current check.

### 9.3 a3: models.check as a stream request with per-call progress

As a1, but models.check is a stream handler that emits a progress frame per CLI call before its done frame.

Same procedures, lock, table and approve/reject RPCs as a1; models.check registers as a stream handler emitting { phase: 'model-list' | 'run' | 'effort-names', verdict } progress frames and a done frame carrying ModelCheckResult.

**Rejected because:** Progress frames are a nicety for at most three CLI calls and depart from the owned contract's shape.

## 10. References

- **[[c1]]** `prior-artifact` `HLD-ce99b72065d03b1b` — "Approved HLD; s4 boundary and sc4 (Unknown-model check and approval requests)."
- **[[c2]]** `step-output` `s1` — "LldContext analyze bundles: approved-model store and registry, CLI spawning, CLI probe, RPC plug-in points, atomic writes, test patterns."
- **[[c3]]** `code` `src/daemon/model-registry.ts:49` — "export interface ApprovedProfile {"
- **[[c4]]** `doc` `CLAUDE.md` — "No direct cloud REST calls from our process. ... Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits."
- **[[c5]]** `code` `src/daemon/model-registry.ts:159` — "function readStore(path: string): ApprovedProfile[] {"
- **[[c6]]** `code` `src/agent/providers/cli-provider.ts:868` — "async function runSubprocess("
- **[[c7]]** `code` `src/workflow/storage.ts:85` — "const tmp = `${absPath}.tmp`;"
- **[[c8]]** `code` `src/daemon/threads/method-class.ts:156` — "['models.definitions', 'session', false],"
- **[[c9]]** `code` `src/shared/paths.ts:12` — "approvedModels: join(INSRC_DIR, 'approved-models.json'),"
- **[[c10]]** `step-output` `s3` — "winnerId a1: satisfies every criterion and contract with the fewest moving parts."
- **[[c11]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:20` — "codex does not reject a known level that a given model does not list (probe 4). For codex, a model's accepted levels must therefore come from `codex debug models` (probe 1), not from whether a test ru"
- **[[c12]]** `analyze-bundle` `s1 usage.example` — "Atomic writes follow write-to-`<path>.tmp` then renameSync (src/workflow/storage.ts:85 writeAtomic; src/config/reconcile-io.ts commit). No shared serial-queue helper exists; daemon code serialises LLM"
- **[[c15]]** `doc` `docs/epics/per-family-model-definitions-served-daemon-E20261023ce99b720/evidence/def-cli-probes.md:40` — "Every recognised level runs without a warning on every model tried (probes 8 to 10), and the output never states the effort used (probe 11). So no Claude CLI run shows whether a given model supports a"

## 11. Open questions

- Checklist ep3 (partial): the serial-CLI-call invariant rests on the s1 usage.example bundle (no shared serial-queue helper; daemon code serialises provider work with sequential awaits, c12) and CLAUDE.md (c4), not on the probe evidence its s5 source id names.
- Checklist alt2 (partial): s3 scored the alternatives against ac1-ac5 and sc1-sc4 but not lc1-lc3 explicitly; all three alternatives share the same CLI procedures, so lc1 (installed CLIs only), lc2 (the codex model list decides efforts) and lc3 (Claude levels recognised-unconfirmed) hold equally for each and do not change the ranking.
