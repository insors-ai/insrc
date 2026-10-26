<!-- insrc:artifact PLAN-ce99b72065d03b1b-s4 -->

# Plan: E20261026ce99b720:S004

## Summary

**Epic:** `per-family-model-definitions-served-daemon`
**LLD run:** `wf-1792998197831-tvf84y`
**LLD effective hash:** `c324f041e3e7...`

Building s4 adds one daemon module, src/daemon/model-check.ts, that checks an unknown Claude or Codex model through its own CLI one call at a time and records the user's decision in the approved-model store with an atomic write. The work is built inward-out: a one-line export of the registry's profile validator, the shared check machinery with the Codex procedure, the Claude procedure, the approve/reject decisions and store writer, then registering the three requests, and finally real-daemon tests that prove each decision takes effect after a restart, plus a gated live test against the installed CLIs.

## Contents

1. [Tasks](#1-tasks)
2. [Test-strategy coverage](#2-test-strategy-coverage)
3. [References](#3-references)

## 1. Tasks

| # | Task | Size | Depends on | Tests | Derived from |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | **`t1`** Export profileProblem from the registry | S | — | unit: model-registry.test.ts: the exported profileProblem returns undefined for a valid profile and a reason for each invalid shape the reader skips | [[c7]] [[c11]] |
| 2 | **`t2`** model-check.ts: shared machinery and the Codex check | M | — | unit: model-check.test.ts: Codex check — efforts from `debug models`, ultra rejected despite a successful run, unlisted model rejects every effort, no inputLimit; unit: model-check.test.ts: unreachable vs refusing (Codex) — ENOENT and timeout give 'could not be reached', turn.failed gives 'refused the model'; unit: model-check.test.ts: run protocol (Codex) — probe prompt on stdin, temp cwd; no turn.completed or nonzero exit without refusal give 'gave unreadable output'; unit: model-check.test.ts: one at a time — concurrent checks never overlap CLI children; a failing first check does not stop the second; unit: model-check.test.ts: invalid params refused with no CLI call; unit: model-check.test.ts: unreadable `codex debug models` with a successful run gives runs:true and every effort rejected; unit: model-check.test.ts: ModelCheckResult carries exactly the sc4 fields | [[c1]] [[c5]] [[c8]] [[c9]] |
| 3 | **`t3`** model-check.ts: the Claude check | M | `t2` | unit: model-check.test.ts: Claude check — recognised-unconfirmed / rejected, never accepted; inputLimit from modelUsage including the alias-vs-canonical key and ambiguous cases; unit: model-check.test.ts: run protocol (Claude) — is_error with exit 1 refuses; subtype error_max_turns and exit 1 with a success envelope give 'gave unreadable output'; unit: model-check.test.ts: unreadable `claude --help` with a successful run gives runs:true and every effort rejected | [[c1]] [[c9]] |
| 4 | **`t4`** Decisions: approveCheck / rejectCheck and the atomic store writer | M | `t1`, `t2`, `t3` | unit: model-check.test.ts: decisions — guards, approved/rejected profiles, consumed and evicted checks; unit: model-check.test.ts: store write — created, appended verbatim, write-failed for malformed / versionless / string / version-2 stores and a failing rename; unit: model-check.test.ts: after unreadable effort discovery approve with an effort is invalid-efforts and approve with [] succeeds; unit: model-check.test.ts: DecisionResult shapes; each written profile passes profileProblem and reads back through buildModelRegistry and getModelRegistry | [[c2]] [[c3]] [[c4]] [[c9]] |
| 5 | **`t5`** Register models.check / models.approve / models.reject | S | `t4` | integration: handler-runtime.test.ts: RECORDED_RPC includes models.check, models.approve, models.reject; method-class classifies them as session | [[c6]] |
| 6 | **`t6`** Real-daemon and live tests | M | `t5` | integration: models-daemon-s4.test.ts: models.check leaves the store and config.json unchanged and the model is not served before approval; integration: models-daemon-s4.test.ts: approve → restart → user-approved in models.definitions and config.write accepts → second restart → resolveRole keeps the approved effort and drops the unapproved one; integration: models-daemon-s4.test.ts: reject → restart → rejectedModels and config.write refuses; an absent CLI's check cannot be approved; live: model-check.live.test.ts: isolated fixture validated and unserved; real codex and claude checks | [[c10]] [[c11]] |

### 1.1 E20261026ce99b720:S004:T001 — Export profileProblem from the registry

Export the existing module-private profileProblem(e: unknown) from src/daemon/model-registry.ts with its body unchanged, so the store writer and the contract tests validate a profile by exactly the reader's rule. readStore, buildModelRegistry and getModelRegistry are untouched.

**Acceptance checks:**
- profileProblem is importable from src/daemon/model-registry.ts and returns undefined for a valid ApprovedProfile and a reason string for each invalid shape the reader skips
- The existing model-registry tests pass unchanged (reader behaviour identical)
- session-source-inventory.test.ts passes, refreshing only this task's own entry for src/daemon/model-registry.ts

### 1.2 E20261026ce99b720:S004:T002 — model-check.ts: shared machinery and the Codex check

Add src/daemon/model-check.ts with the sc4 types (EffortVerdict, ModelCheckResult, DecisionResult), ModelCheckDeps (runInProcessGroup seam, bin names, per-call timeoutMs default 120 s, cwd = OS temp dir, registry), and checkModel(params, deps?): param validation against the registry (family with a cliKind, non-empty modelId, claimedEfforts an array of non-empty strings collapsed to unique, refuse a model or alias registry.find serves); a module-level promise chain so one CLI child runs daemon-wide; run classification (spawnError / timedOut → 'could not be reached'; refusal → 'refused the model'; anything else not positively complete → 'gave unreadable output'); the Codex procedure (--version, `debug models` efforts per supported_reasoning_levels, one `exec --json --skip-git-repo-check --sandbox read-only -C <tmp> -m <id>` run with the fixed stdin probe prompt, positive completion = exit 0 + turn.completed and no error / turn.failed); the bounded pending table (32, oldest evicted) holding the result and cliVersion; every call and verdict logged. Family ids and cli kinds come from the registry, never literals. The Claude kind returns invalid-params until t3 adds it.

**Acceptance checks:**
- With a fake codex: efforts come from `debug models` (ultra rejected for a model listing low/medium/high even though the fake exec succeeds at ultra); a model absent from the list rejects every effort; the exec run decides runs; no inputLimit
- ENOENT and a timeout give runs:false 'could not be reached'; a turn.failed / error event gives 'refused the model'; nonzero exit without refusal and a stream without turn.completed give 'gave unreadable output'; the fake receives the probe prompt on stdin and runs in the temp dir
- Two concurrent checks never run two CLI children at once and a failing first check does not stop the second
- Invalid params (ollama family, empty modelId, non-array efforts, a served model or alias) are refused with invalid-params and no CLI call
- model-literal-scan.test.ts passes; checkModel writes no file
- session-source-inventory.test.ts passes, adding a classified entry for src/daemon/model-check.ts if the inventory picks it up and touching no other task's entries

### 1.3 E20261026ce99b720:S004:T003 — model-check.ts: the Claude check

Add the Claude procedure to checkModel: --version; --help parsed for the recognised --effort values, each claimed effort 'recognised-unconfirmed' (evidence quoting the values and stating the CLI cannot confirm per-model support) or 'rejected', never 'accepted', unreadable help rejecting every effort; one `--print --output-format json --model <id>` run with the stdin probe prompt, positive completion = exit 0 + is_error false + subtype 'success' + non-empty result, an is_error envelope → 'refused the model' whatever the exit code; inputLimit { unit: 'tokens', max } from the single modelUsage entry whatever its key, or the entry keyed by modelId when several, else omitted and the keys logged.

**Acceptance checks:**
- With a fake claude: listed names are recognised-unconfirmed with the evidence wording, others rejected, none accepted; garbage --help rejects every effort while the run still decides runs
- --model haiku answered with one modelUsage entry keyed 'claude-haiku-5-5' keeps that contextWindow; two entries neither keyed by the requested id omit inputLimit; a missing contextWindow omits it
- An is_error envelope with exit 1 gives 'refused the model'; exit 0 with subtype 'error_max_turns' and exit 1 with a valid success envelope give 'gave unreadable output'
- model-literal-scan.test.ts and session-source-inventory.test.ts pass, touching only this task's entries

### 1.4 E20261026ce99b720:S004:T004 — Decisions: approveCheck / rejectCheck and the atomic store writer

Add approveCheck(params, deps?) and rejectCheck(params, deps?) to model-check.ts. approve refuses unknown-check, model-did-not-run and invalid-efforts (an effort not claimed or whose verdict was rejected, or a non-string entry); reject needs only a pending check. The writer reads the store at PATHS.approvedModels (missing = new document), accepts an existing document only when it is an object with version === 1 and an array profiles, validates the new ApprovedProfile { family, modelId, status, efforts, inputLimit?, decidedAt, cliVersion } with profileProblem, appends it keeping existing entries verbatim, creates the directory, writes <store>.tmp and renames; any failure returns write-failed with the previous file unchanged and no .tmp left, and keeps the check pending. Success returns { ok: true, restartRequired: true } only after the rename and consumes the check.

**Acceptance checks:**
- approve writes an approved profile with only the requested efforts, the check's inputLimit and cliVersion; reject writes a rejected profile with efforts []; each passes profileProblem and is read back by getModelRegistry (test seams) as user-approved / rejected
- unknown-check, model-did-not-run and invalid-efforts write nothing; a consumed or evicted check returns unknown-check; approve with [] after unreadable effort discovery succeeds
- A malformed store, one without version, with a string version, with version 2, and a failing rename each return write-failed, leave the previous bytes (or no file) and no .tmp, and keep the check pending
- Existing entries, including ones the reader skips, are kept verbatim; a missing store and directory are created

### 1.5 E20261026ce99b720:S004:T005 — Register models.check / models.approve / models.reject

Register the three requests in buildHandlerRuntime (src/daemon/handler-runtime.ts) beside models.definitions / models.resolveRole, add ['models.check','session',false], ['models.approve','session',false], ['models.reject','session',false] to src/daemon/threads/method-class.ts, and add the three names to RECORDED_RPC in src/daemon/__tests__/handler-runtime.test.ts.

**Acceptance checks:**
- handler-runtime.test.ts passes with the three names recorded
- The method-class tests classify the three as session methods
- session-source-inventory.test.ts passes, refreshing only this task's own entries (src/daemon/handler-runtime.ts and src/daemon/threads/method-class.ts if pinned)

### 1.6 E20261026ce99b720:S004:T006 — Real-daemon and live tests

Add src/daemon/__tests__/models-daemon-s4.test.ts: daemon in a temp HOME with fake CLIs first on PATH and a definitions copy that does not list the faked model; check leaves the store and config.json unchanged; approve → restart → models.definitions lists the model as user-approved with only its approved efforts and config.write accepts tiers set to it → second restart → models.resolveRole keeps the approved effort and drops the unapproved one; reject → restart → rejectedModels lists it and config.write refuses it; an absent CLI cannot be approved. Add the INSRC_LIVE_TESTS-gated src/daemon/__tests__/model-check.live.test.ts with the isolated fixture (haiku / gpt-6-luna removed, cheap tier and summariser retargeted to sonnet / gpt-5.6-luna).

**Acceptance checks:**
- models-daemon-s4.test.ts proves ac1-ac5 through the real daemon, including both restarts
- The live test asserts validateModelCatalog accepts the isolated fixture and registry.find returns undefined for claude-haiku-5-5, haiku and gpt-6-luna before any check
- model-check.live.test.ts skips cleanly without INSRC_LIVE_TESTS and passes against the installed CLIs with it
- No test leaves a daemon process or temp HOME behind

## 2. Test-strategy coverage

| LLD strategy item | Covered by |
| :--- | :--- |
| src/daemon/__tests__/model-check.test.ts: Codex check — `codex debug models` listing the model with low/medium/high: claimed ['high','ultra'] gives high accepted, ultra rejected with the listed levels as evidence even though the fake exec succeeds at ultra (lc2); a model absent from the list gives every effort rejected; the exec run decides runs; no inputLimit | `t2` |
| model-check.test.ts: Claude check — the fake run's envelope gives runs:true and inputLimit { unit: 'tokens', max: contextWindow }; claimed names listed by the fake --help are recognised-unconfirmed with evidence saying the CLI cannot confirm per-model support, others rejected; no effort is ever 'accepted' (lc3); a missing contextWindow omits inputLimit; a fake answering --model haiku with modelUsage keyed 'claude-haiku-5-5' (one entry) keeps that contextWindow; two entries neither keyed by the requested id omit inputLimit | `t3` |
| model-check.test.ts: unreachable vs refusing — a missing binary (ENOENT) and a fake that sleeps past a short injected timeout both give runs:false with 'could not be reached'; a Claude is_error envelope and a Codex turn.failed/model_not_found stream give 'refused the model' with the CLI's message; unreadable output gives runs:false; the unreachable cases are driven through runInProcessGroup's spawnError and timedOut | `t2`, `t3` |
| model-check.test.ts: one at a time — two concurrent checkModel calls against fakes that record start/end timestamps and a lock file: no two CLI children overlap; a failing first check does not stop the second | `t2` |
| model-check.test.ts: invalid params — unknown/ollama family, empty modelId, non-array efforts, and a model or alias the family already serves are refused with invalid-params and no CLI call (the fake records none) | `t2` |
| model-check.test.ts: decisions — unknown-check, model-did-not-run, invalid-efforts (rejected or unclaimed level) refused with nothing written; approve writes an approved profile with only the requested efforts, the check's inputLimit and cliVersion, and decidedAt; reject writes a rejected profile with efforts []; a consumed or evicted (33rd) check returns unknown-check | `t4` |
| model-check.test.ts: store write — missing store and missing directory created; existing entries (including invalid ones) kept verbatim and the new one appended; a malformed store, a store without version, with a string version, with version 2, and a failing rename (store path's directory made read-only, or an injected fs) each return write-failed and leave the previous bytes unchanged (or no file created) with no leftover .tmp; every written store is read back through getModelRegistry (via _setApprovedModelsPathForTests / _resetModelRegistryForTests) and buildModelRegistry | `t1`, `t4` |
| model-check.test.ts: unreadable effort discovery — a fake `codex debug models` / `claude --help` printing garbage while the run succeeds gives runs:true with every effort rejected; approve with any effort returns invalid-efforts and approve with [] succeeds | `t2`, `t3`, `t4` |
| model-check.test.ts: run protocol — the fakes record the stdin they receive (the fixed probe prompt) and their cwd; a Codex fake exiting 0 with a stream lacking turn.completed, a Codex fake exiting 1 with no error event, a Claude fake exiting 0 with subtype 'error_max_turns', and a Claude fake exiting 1 with a valid success envelope each give runs:false 'gave unreadable output'; an is_error envelope with exit 1 still gives 'refused the model' | `t2`, `t3` |
| src/daemon/__tests__/models-daemon-s4.test.ts: start the daemon in a temp HOME with fake CLIs first on PATH; models.check returns per-effort evidence and leaves approved-models.json and config.json unchanged; config.write of a tier to the checked model before approval is not admitted as listed (decision A / not-served) | `t6` |
| models-daemon-s4.test.ts: models.approve with a subset of the passing levels → restartRequired:true and the store holds the profile; after a restart models.definitions lists the model under its family with source 'user-approved' and only the approved efforts, and config.write of a tier to it (with an approved effort on one tier and an unapproved effort on another) succeeds; after a second restart (config.write's restartRequired contract, since the analyze config is cached) models.resolveRole resolves the first tier with its approved effort and the second with the unapproved effort dropped and the warning logged | `t6` |
| models-daemon-s4.test.ts: models.reject → after a restart models.definitions lists the id among the family's rejectedModels and config.write of a tier to it is refused with the reason (config.write checks the registry loaded at that start); a check against an absent CLI (PATH without the fake) returns 'could not be reached' and models.approve returns model-did-not-run | `t6` |
| src/daemon/__tests__/handler-runtime.test.ts: RECORDED_RPC includes models.check, models.approve, models.reject; method-class.test classifies them as session | `t5` |
| model-check.test.ts: every ModelCheckResult has exactly the sc4 fields (checkId, family, modelId, runs, efforts[{effort, verdict in accepted\|rejected\|recognised-unconfirmed, evidence}], optional inputLimit/error); DecisionResult is { ok:true, restartRequired:true } or { ok:false, reason in the four values, detail } | `t2`, `t4` |
| model-check.test.ts: each profile written passes model-registry's exported profileProblem (undefined) and appears through buildModelRegistry and getModelRegistry as a user-approved model or a rejected id | `t1`, `t4` |
| src/daemon/__tests__/model-check.live.test.ts: uses an isolated definitions fixture (INSRC_MODEL_CATALOG_DIR / _setModelCatalogDirForTests) copied from the shipped file with the chosen real models and their aliases removed (claude-haiku-5-5 / haiku from cli-claude, gpt-6-luna from cli-codex) and every default that named them retargeted to a retained model of the same family (cli-claude tierDefaults.cheap and summariserModel → 'sonnet'; cli-codex tierDefaults.cheap and summariserModel → 'gpt-5.6-luna'). Before any check the test asserts that validateModelCatalog accepts the fixture and that registry.find returns undefined for claude-haiku-5-5, haiku and gpt-6-luna. Then: an unknown codex model id gives runs:false 'refused the model'; gpt-6-luna runs and its verdicts match `codex debug models`; an unknown claude id gives 'refused the model'; haiku runs and reports an inputLimit | `t6` |

## 3. References

- **[[c1]]** `prior-artifact` `LLD s4 contractDetails.api models.check` — "models.check(family, modelId, claimedEfforts) → ModelCheckResult; Codex list + run, Claude run + inputLimit + recognised effort names; one CLI call at a time."
- **[[c2]]** `prior-artifact` `LLD s4 contractDetails.api models.approve` — "models.approve(checkId, efforts) → DecisionResult; unknown-check / model-did-not-run / invalid-efforts / write-failed."
- **[[c3]]** `prior-artifact` `LLD s4 contractDetails.api models.reject` — "models.reject(checkId) → DecisionResult; writes a rejected profile."
- **[[c4]]** `prior-artifact` `LLD s4 dataModelChanges approved-model store` — "The store gains its only writer: append, version-1 root check, atomic tmp + rename."
- **[[c5]]** `prior-artifact` `LLD s4 dataModelChanges pending model checks` — "A Map<checkId, { result; cliVersion }> holding at most 32 checks, lost on restart."
- **[[c6]]** `prior-artifact` `LLD s4 dataModelChanges method-class table and recorded RPC set` — "Three 'session' method-class entries and RECORDED_RPC names; handlers registered in buildHandlerRuntime."
- **[[c7]]** `prior-artifact` `LLD s4 dataModelChanges model-registry.ts validation exports` — "export function profileProblem(e: unknown): string | undefined (export only; body unchanged)"
- **[[c8]]** `prior-artifact` `LLD s4 dataModelChanges subprocess seam for checks` — "Every CLI call through runInProcessGroup (src/shared/process-group.ts:73), mapping spawnError / timedOut."
- **[[c9]]** `prior-artifact` `LLD s4 errorPaths` — "Unreachable vs refusing vs unreadable output; store write failures; decision guards; edge cases and invariants lc1-lc3."
- **[[c10]]** `prior-artifact` `LLD s4 testStrategy` — "Unit, integration (real daemon with restarts), contract and gated live tests; acceptance mapping ac1-ac5."
- **[[c11]]** `prior-artifact` `LLD s4 migration` — "Four rollbackable steps; additive only; model-registry.ts only gains an export of an existing function."
