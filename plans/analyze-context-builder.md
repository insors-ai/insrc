# Implementation plan — Analyze Context Builder

Design: [`design/analyze-context-builder.md`](../design/analyze-context-builder.md)

## Scope

Build the **LLM-driven context shaper** that every analyze LLM call consumes. Three invocation modes (classification → run → task), five shapers (classification / generic / code / data / infra), one shared TS driver + one prompt per shaper.

Out of scope: the classifier itself, the planner, leaf templates. The shaper exposes a stable interface; everything downstream depends on it.

## Architecture summary

Each shaper is a **prompt file + a TS factory entry** pointing the shared driver at the right prompt + bundle schema. The shared driver:
1. Loads the prompt + bundle schema.
2. Prepares the inputs (scope ref, intent, upstream tasks, etc.) as the human turn.
3. Invokes the local Ollama provider with the read-only tool registry and the bundle schema as the structured-output target.
4. Ollama runs a tool-loop (graph traversal, DB describe, file read / glob, manifest parse) and emits the final `AnalyzeContextBundle` via `completeStructured`.
5. The driver caches the bundle to disk, assembles Markdown for downstream prompts in the fixed render order, and returns both.

No token budget, no `summarizeDown`, no PII redaction, no approval gate, no `--no-cache` flag. Shaper is hard-fail on local Ollama unavailability.

## Testing posture — real Ollama, real edge cases

The shaper's behavior is the LLM's behavior. **Mocking the LLM proves the TS plumbing works against a hypothesis of how the LLM behaves; only real-Ollama tests prove the system actually works.** Plumbing-only unit tests have value (tool-surface filter, schema validation, cache file I/O, bundle assembly), but every phase that touches LLM behavior — driver tool-loop, prompt iteration, failure modes that the LLM is supposed to surface, cache invalidation under live conditions — gets a `.live.test.ts` against the project's installed Ollama daemon.

Conventions:
- Live tests are gated behind `INSRC_LIVE_TESTS=1` (already established in the codebase — see `agent/providers/__tests__/cli-provider.live.test.ts`).
- Live tests assume the user has Ollama running locally with the shaper model pulled (`qwen3-coder:14b` by default — the test reads from config like production).
- Live tests get a real seeded workspace as their fixture: a tiny multi-language repo + a SQLite DB + a CSV file + a directory of k8s manifests. Fixture lives under `src/insrc/analyze/context/__tests__/fixtures/`.
- Live tests use the actual indexer (`db/repos.ts` + `indexer/`) to populate the graph for the fixture repo. They are **not** seeded against fake graph data — seeding the indexer is part of the test setup, because cache invalidation, empty-graph detection, and graph-derived tool calls all depend on real LMDB state.
- Live tests for failure modes simulate real failures (kill Ollama process, edit a prompt to force schema violation, point at an unindexed path, etc.) — not mock-injected error throws.

Mocked tests are appropriate for:
- The read-only tool-surface filter (no LLM involved; it's a set operation over the tool registry).
- The bundle assembler (`assembleMarkdown` is a pure function).
- Cache file I/O (read/write/invalidation logic; the cached bundle bodies can be hand-built JSON).
- The Ajv schema validator (pure functional test).
- The structural stubs in `shared/analyze-types.ts`.

Mocked tests are **not** appropriate for:
- The driver's end-to-end behavior (Phase 3).
- Per-shaper bundle quality (Phase 5).
- Failure-mode triggers that depend on LLM behavior — tool-loop exhaustion (LLM keeps calling tools), schema unrecoverable (LLM emits malformed output that even the retry loop can't fix), or empty-closure detection with reindex (real indexer, real Ollama re-attempts).

The `Edge-case matrix` section below enumerates the cases each live test must cover. Phase acceptance is gated on the matrix passing, not on the matrix existing.

## Module layout (greenfield)

```
src/insrc/analyze/
  index.ts                       barrel
  contract.ts                    framework-level contract reminder footer
                                 (single-sourced; planner imports from here too)
  context/
    index.ts                     shaperFor(mode, target?) factory
    types.ts                     AnalyzeContextBundle, ShapeOpts, *Input
    schema.ts                    Ajv JSON schema for AnalyzeContextBundle
    driver.ts                    shared LLM-driven shaper: load prompt, prep
                                 inputs, invoke Ollama+tools+schema, cache
    tool-surface.ts              read-only filter over the built-in tool registry
    bundle.ts                    assembleMarkdown(bundle): render order + footer
    cache.ts                     run + task bundle caches (no per-layer cache)
    invariants.ts                empty-graph detector + auto-reindex trigger
    __tests__/
      tool-surface.test.ts       pure set operation; mocked
      bundle.test.ts             pure rendering; mocked
      cache.test.ts              file I/O; mocked bundle bodies
      schema.test.ts             Ajv pure; mocked
      driver.live.test.ts        LLM-driven; real Ollama
      classification-shaper.live.test.ts
      generic-shaper.live.test.ts
      code-shaper.live.test.ts
      data-shaper.live.test.ts
      infra-shaper.live.test.ts
      failure-modes.live.test.ts real failures, not mock-injected
      cache-invalidation.live.test.ts indexer-driven invalidation
      fixtures/
        tiny-multi-lang-repo/    seeded indexer fixture
        seeded.sqlite
        seeded.csv
        seeded-manifests/        k8s + tf + GHA

prompts/analyze/
  classification.system.md       target-agnostic, kind-counts only
  generic.system.md              cross-cutting; target=generic
  code.system.md                 run + task
  data.system.md                 run + task
  infra.system.md                run + task

shared/
  analyze-types.ts               ClassifiedIntent / PlannedTask /
                                 AnalyzeTaskTemplate -- structural stubs until
                                 the classifier + planner + template registry
                                 land

config/
  local.ts                       add models.analyze.shaperModel +
                                 models.analyze.shaper.{maxToolTurns,
                                 structuredOutputRetries, ollamaNumCtx}

daemon/
  analyze-rpc.ts                 analyze.context.{buildClassification,
                                 buildRun, buildTask} IPC handlers (Phase 6)
```

## Phasing

### Phase 0 — Skeleton + types + stubs

- Create the `src/insrc/analyze/` tree above; barrels + empty file stubs.
- Land `AnalyzeContextBundle`, `ShapeOpts`, `ClassificationShapeInput`, `RunShapeInput`, `TaskShapeInput`, `Shaper`, `Mode`, `Target` in `context/types.ts` verbatim from the design doc.
- Land the framework-level `contract.ts` with the contract-reminder footer constant. Planner will later import from here too.
- `shared/analyze-types.ts` with structural-only stubs for `ClassifiedIntent` / `PlannedTask` / `AnalyzeTaskTemplate`. Header points at the framework doc.
- `context/index.ts` exports a `shaperFor(mode, target?)` factory. The five prompts return a no-op `Shaper` that throws `"P0 stub"` on call.

Acceptance: `tsc` is green from a fresh checkout; factory dispatch works structurally; the contract footer string round-trips through `assembleMarkdown` (Phase 1's task).

### Phase 1 — Bundle assembler + contract footer

- Implement `context/bundle.ts`:
  - `assembleMarkdown(bundle: AnalyzeContextBundle): string` renders Markdown in the fixed order `system → focus → summary → structure → surface → artefacts → upstream` and appends the contract footer from `analyze/contract.ts`.
  - Empty layers (LLM declared blank, listed in `bundle.meta.emptyLayers`) are omitted from the rendered Markdown.
  - Helper `omitEmpty(label, body)` so empty layers don't leave dangling headers.
- Implement `context/schema.ts`:
  - Ajv JSON schema for `AnalyzeContextBundle`. Critical arrays / fields get `minLength` / `minItems` where applicable. Versioned (`schemaVersion: 1`); the version goes into cache keys.
- Unit tests: layer order, empty-layer omission, contract footer appended exactly once, Ajv schema accepts a hand-built bundle.

Acceptance: rendering a hand-built bundle produces expected Markdown; schema validation works both ways.

### Phase 2 — Read-only tool surface

- Implement `context/tool-surface.ts`:
  - Reads the built-in tool registry (`src/insrc/daemon/tools/builtins/`).
  - Filters to read-only families: `graph.*`, `db.list_*` + `db.describe` + `db.sample`, `db_file_*` read-only family, `file.read*` + `file.glob` + `file.list_dir` + `file.stat`, `code.list_manifests` + `code.parse_manifest`, `repo.list` + `repo.get_closure`.
  - Explicitly excludes: `file.write`, `file.delete`, `shell.*`, network mutation tools, `db_sql_execute` (mutating), `repo.add` / `repo.remove` / `repo.reindex`, k8s mutation tools, pkg install tools, ssh.
  - Exposes `getReadOnlyTools(): ToolDefinition[]` for the driver to pass into `OllamaProvider.complete`.
- Unit tests: assert known-mutating tool ids are excluded; assert known-read-only tools are present; a snapshot test pins the read-only tool list (so accidentally exposing a mutation tool breaks CI).

Acceptance: unit tests pass; snapshot test reviewed manually for the initial baseline.

### Phase 3 — Shared driver (the heart of the shaper)

- Implement `context/driver.ts`:
  ```ts
  async function runShaper(args: {
    promptPath:       string;                  // resolved per shaper
    bundleSchema:     JSONSchema;
    inputs:           ClassificationShapeInput
                     | RunShapeInput
                     | TaskShapeInput;
    invocationMode:   'classification' | 'run' | 'task';
    shaperId:         'classification' | 'generic' | 'code' | 'data' | 'infra';
    opts:             ShapeOpts;
  }): Promise<AnalyzeContextBundle>
  ```
- Steps:
  1. Resolve cache key = `sha256(promptHash + schemaVersion + inputsHash)`. Check disk cache (run-id-scoped for run/task, run-id-scoped for classification — classification is per-run, not cross-run).
  2. Cache miss → load prompt file. If missing, throw `ShaperPromptMissingError` (boot-time validator catches this too, see Phase 5).
  3. Build the message list:
     - system message = loaded prompt content + contract reminder footer (so the LLM sees the contract while building the bundle, in addition to the user-facing footer in the assembled Markdown).
     - user message = serialized inputs (scope ref, intent, upstream tasks if task-mode) as JSON inside a fenced block.
  4. `OllamaProvider.complete(messages, { tools: getReadOnlyTools(), toolLoop: true, maxToolTurns: config.maxToolTurns })` → drives the tool-loop until the model decides it has enough.
  5. Final `completeStructured(finalMessages, AnalyzeContextBundle schema, { retries: config.structuredOutputRetries })` → forces structured output.
  6. Stamp `bundle.meta` with `{ mode, shaper, toolCalls, modelId, emptyLayers }`.
  7. Persist to disk + return.
- Caps:
  - `maxToolTurns` from config (default 40). Overshoot → throw `ShaperToolLoopExhausted`.
  - Structured-output retries from config (default 3). Exhaustion → throw `ShaperSchemaUnrecoverable`.
  - Local Ollama connection error at any step → throw `ShaperLlmUnavailableError`. No fallback path.

Acceptance (live, against the project's installed Ollama):
- `driver.live.test.ts` with a minimal stand-in prompt (something like "emit a bundle with system='hello', summary='world', all other layers empty") asserts the driver produces a schema-valid `AnalyzeContextBundle`.
- A second call with identical inputs hits the run-bundle cache (no Ollama call). Verified by counting tool-surface invocations + asserting cache file presence.
- A real tool-loop test: prompt instructs the LLM to call at least one graph tool against a seeded fixture repo, assert at least one tool call recorded in `meta.toolCalls > 0` and the bundle reflects what the tool returned.
- Forced empty bundle (LLM emits `{system:'',...all empty}`) → schema validation passes, `meta.emptyLayers` populated correctly.
- Each named error class fires under real conditions: Ollama process killed mid-call → `ShaperLlmUnavailableError`; prompt-induced infinite tool-loop hits `maxToolTurns=3` override → `ShaperToolLoopExhausted`; prompt instructed to emit deliberately malformed structured output 4 times → `ShaperSchemaUnrecoverable` after the configured 3 retries.

### Phase 4 — Caching

- Implement `context/cache.ts`:
  - `~/.insrc/analyze/<run-id>/context/run-bundle.json` — single per-run.
  - `~/.insrc/analyze/<run-id>/context/<task-id>.bundle.json` — one per task.
  - `~/.insrc/analyze/<run-id>/context/classification.json` — single per-run.
  - **No** per-layer cross-run cache. (Was killed when summarize-down was dropped.)
- Invalidation:
  - Cache key includes prompt content hash + schema version + invocation inputs hash, so prompt edits / schema bumps / input changes auto-invalidate.
  - Additionally, the cached bundle records `repoLastIndexedAt` from `db/repos.ts`. On read, if the registry's current `lastIndexedAt` exceeds the cached value, the entry is stale and discarded.
- No `--no-cache` flag. `opts.bypassCache: boolean` exists on the driver API for tests only; not exposed via CLI.

Acceptance:
- Pure-file-I/O cache tests (mocked bundle bodies) in `cache.test.ts`: write → read → invalidate → re-read happy paths.
- Live test in `cache-invalidation.live.test.ts` against a seeded fixture repo:
  1. Run the code-shaper against the fixture, verify cache write.
  2. Re-run; assert cache hit (no Ollama call, verified via `meta.toolCalls === undefined` on the cached read).
  3. Touch a file in the fixture repo, force a real `repo.reindex`, wait for the registry's `lastIndexedAt` to advance.
  4. Re-run; assert cache miss + real rebuild (Ollama called, new `meta.toolCalls > 0`).
  5. Edit the prompt file (programmatic prompt-file rewrite), re-run; assert cache miss + rebuild.
  6. Bump `schemaVersion` (programmatic schema swap), re-run; assert cache miss + rebuild.
- The `opts.bypassCache: true` flag forces a rebuild even with all-identical inputs (verified by tool-call count).

### Phase 5 — Prompt files + boot-time validator

- Write the five system prompt files under `prompts/analyze/`:
  - `classification.system.md` — target-agnostic, kind-counts only, no source-body reads. Tool-use restricted to repo list + kind-count + connection list + IaC dir glob.
  - `generic.system.md` — cross-cutting; instructs the LLM to inventory all detected target surfaces and produce a high-level bundle.
  - `code.system.md` — run + task modes via prompt branching on the input's `mode` field. Lossless-within-closure instruction. Mandatory citation references in `artefacts`.
  - `data.system.md` — run + task modes; enumerate every connection / object / column; sample rows allowed un-redacted.
  - `infra.system.md` — run + task modes; detect every IaC family; emit per-family resource listings + topology + one representative excerpt.
- Each prompt closes with the loaded contract reminder content (the prompt file itself does not duplicate the contract reminder — the driver injects it from `contract.ts` at message-build time).
- Boot-time validator in `daemon/index.ts` (Phase 5.a):
  - On daemon start, assert each of the five prompt files exists + is non-empty. Missing → daemon refuses to start with a clear log line pointing at the missing path.
- Initial model choice in `config/local.ts`: `models.analyze.shaperModel = "qwen3-coder:14b"`. Open question for live-test phase: does qwen3-coder tool-loop well at this size, or do we need a different model? Tunable via config.

Acceptance:
- File-existence test + daemon-boot smoke test catches a deleted prompt (mocked file system).
- Per-shaper live tests in `<shaper>-shaper.live.test.ts` against real seeded fixtures (see the Edge-case matrix below for the concrete fixture set + edge cases per shaper).
- For each shaper, the live test enumerates **at least the matrix's required cases** and asserts:
  - Bundle is schema-valid.
  - Each layer the shaper claims to produce is non-empty for the happy-path case.
  - For fixtures designed to surface edge cases (empty workspace, single-file scope, monorepo, etc.), the bundle behaves as the matrix specifies (empty `surface`, full `surface`, lossless enumeration, etc.).
  - The tool-loop converges within `maxToolTurns`. If a shaper habitually approaches the cap, the prompt needs another round of tuning; this is a Phase 5 outcome to surface, not a deferred problem.

### Phase 6 — Failure modes

Implement and test the failure-mode set from the design doc:

| Mode | Implementation |
|---|---|
| `ShaperLlmUnavailableError` | Catch Ollama connection errors anywhere in the driver; rethrow as this typed error; the run-orchestrator aborts on it. |
| `ShaperToolLoopExhausted` | Tool-loop turn counter; threshold from config; throw on overshoot. |
| `ShaperSchemaUnrecoverable` | `completeStructured` retry budget exhausted; rethrow as this typed error. |
| Missing upstream output | Task-mode driver detects `upstreamTasks.get(id) === null`; renders `[unavailable: <taskId>]` placeholder into the user message; instructs the LLM to surface in `upstream` layer. |
| Empty closure → auto-reindex | `context/invariants.ts` runs before the LLM call when `mode='run'`. If `repo.get_closure()` returns empty for any target repo in `intent.scopeRef`, the wrapper invokes `repo.reindex` IPC directly. After reindex, retry the closure check. Still empty → throw `ScopeNotIndexedError`. |
| Prompt file missing | Boot-time validator (Phase 5.a) catches this before any run starts. |

Acceptance — every failure mode tested under real conditions in `failure-modes.live.test.ts`:
- `ShaperLlmUnavailableError`: kill the local Ollama process (or point the provider at a deliberately-wrong host) mid-test; invoke the driver; assert the typed error is thrown.
- `ShaperToolLoopExhausted`: prompt instructed to keep calling tools indefinitely; `maxToolTurns` config overridden to a small value (e.g., 3); assert the typed error is thrown and the partial tool-call count is logged.
- `ShaperSchemaUnrecoverable`: prompt instructed to emit free-text instead of structured output; `structuredOutputRetries: 3`; assert all 3 retries happen and the typed error is thrown after.
- Missing upstream: real task-mode call with `upstreamTasks.set('t02', null)`; assert the `upstream` layer of the emitted bundle contains the `[unavailable: t02]` marker.
- Empty-closure auto-reindex: point at a fresh-but-unindexed real repo (created in the test as a temp directory + git init + a couple of source files); assert the wrapper invokes `repo.reindex` IPC and the second closure check returns a non-empty result. Hard-empty (point at a deliberately empty directory) → assert `ScopeNotIndexedError`.
- Missing prompt file: programmatically delete one of the five prompt files; assert daemon-boot smoke test fails with the missing-path log line.

### Phase 7 — Daemon IPC

- Implement `daemon/analyze-rpc.ts`:
  - `analyze.context.buildClassification(runId, scopeRef, userPrompt)` → returns the bundle.
  - `analyze.context.buildRun(runId, intent)` → returns the bundle.
  - `analyze.context.buildTask(runId, intent, task, template, upstream)` → returns the bundle.
- Register handlers in `daemon/index.ts`. Each handler is a thin transport wrapper around the driver.
- No IDE / CLI surface yet — the framework's outer-loop RPC (in a separate plan) is the eventual caller.

Acceptance:
- End-to-end live test in `analyze-rpc.live.test.ts` (under `daemon/__tests__/`) invokes each RPC over the real daemon socket against a real seeded fixture; verifies bundle round-trip + cache hit on the second call + on-disk artifacts under `~/.insrc/analyze/<run-id>/context/`.
- RPC error-shape tests: each typed error from Phase 6 surfaces as the expected JSON-RPC error shape (negotiate the exact codes with the framework outer-loop plan when it lands; for now, structured `{code, message, data?}` over the wire).

## Edge-case matrix

Live tests (Phase 5 + Phase 6) must cover these cases. The matrix is the *minimum* set; live tests can add more. Each row's last column names which `.live.test.ts` file owns the case.

### Fixture setup (shared)

The fixture set is built once and reused across live test files. Setup steps run in test-`before` hooks under `src/insrc/analyze/context/__tests__/fixtures/setup.ts`:

1. **`tiny-multi-lang-repo/`** — TS file with one exported function + one CLI command + one HTTP route registration; Python file with one function imported by another; Go file with a single exported type. Three top-level files, ~80 LOC total. Used to test "small but multi-surface" cases.
2. **`monorepo-fixture/`** (alias `src/insrc` itself) — the project's own source. Used for "large real repo with full dep closure" cases. No setup needed (already indexed in the dev environment).
3. **`seeded.sqlite`** — 3 tables: `users(id, email, name)`, `orders(id, user_id, total)`, `order_items(order_id, product, qty)`. Includes a FK. Used for "real RDBMS, multiple tables, FK relationships."
4. **`seeded-csv-dir/`** — 5 CSV files with consistent schema + 1 with a divergent schema, organized as a hive-partitioned tree `region=us/date=*/*.csv` + `region=eu/date=*/*.csv`. Used for "directory-as-table + hive partition + schema divergence."
5. **`seeded-manifests/`** — `k8s/` with 3 Deployments + 2 Services + 1 ConfigMap; `tf/` with a single `main.tf` + `variables.tf`; `.github/workflows/` with one workflow. Used for "multi-IaC-family detection."
6. **`empty-repo/`** — git-init'd dir with one README. No source code. Used for "empty closure / nothing to analyze" cases.
7. **`unindexed-repo/`** — git-init'd dir with real source but **not** registered via `repo.add`. Used for "scope-ref points at unindexed repo" → auto-reindex case.

Indexer setup: tests register each repo via `repo.add` IPC + wait for the indexer to finish (`status: 'idle'` on the queue). The setup is idempotent — re-running tests does not double-index.

### code-shaper edge cases

| # | Case | Fixture | What we assert |
|---|---|---|---|
| C1 | Small multi-language repo, run-mode | tiny-multi-lang-repo | All three languages appear in `summary`; all three surfaces (export / CLI / HTTP) appear in `surface`; structure lists all 3 modules |
| C2 | Large real repo, run-mode | monorepo-fixture | `summary` mentions TypeScript + ESM; `surface` enumerates daemon RPC handlers + CLI commands; `structure` reflects the `src/insrc/<subsystem>` layout; `artefacts` cites actual high-in-degree modules |
| C3 | Single-file scope, run-mode | tiny-multi-lang-repo / TS file | `surface` is narrowed to the single file's exports; `structure` is the file's symbol tree, not the repo tree |
| C4 | Task-mode with one upstream | tiny-multi-lang-repo + synthetic upstream JSON | `upstream` layer carries a rendered version of the upstream JSON; `surface` is dropped to a one-line pointer per the prompt |
| C5 | Empty closure, real unindexed repo | unindexed-repo | Wrapper triggers `repo.reindex`; second attempt produces a bundle with real content |
| C6 | Cache hit on identical re-run | tiny-multi-lang-repo | `meta.toolCalls === undefined` (or distinguishable cache marker); on-disk artifact present |

### data-shaper edge cases

| # | Case | Fixture | What we assert |
|---|---|---|---|
| D1 | SQLite, multi-table + FK, run-mode | seeded.sqlite | `summary` reports 3 tables; `surface` lists all columns per table; `structure` includes the FK; `artefacts` includes DDL + sample rows (un-redacted) |
| D2 | CSV directory-as-table, run-mode | seeded-csv-dir | `summary` reports the directory as one logical object; `surface` lists the shared column set; the divergent-schema file surfaces as a separate schema group |
| D3 | Hive partitions detected, run-mode | seeded-csv-dir | `summary` or `structure` notes hive partitioning with `region` + `date` keys |
| D4 | Empty connection (no tables), run-mode | brand-new empty SQLite | `summary` reports zero tables; `surface` is empty; `meta.emptyLayers` includes `surface`, `structure`, `artefacts`; bundle still schema-valid |
| D5 | Task-mode targeting one specific table | seeded.sqlite | `surface` narrowed to that one table; other tables omitted from artefacts |
| D6 | Unavailable connection (driver fails to connect) | malformed connection config | LLM surfaces the connection error in `summary` + emits an empty bundle (it does not invent table names) |

### infra-shaper edge cases

| # | Case | Fixture | What we assert |
|---|---|---|---|
| I1 | k8s + tf + GHA, run-mode | seeded-manifests | All three families appear in `summary`; `surface` lists k8s resource kinds + TF resource types + GHA workflow name; `structure` shows the deployment topology |
| I2 | k8s only, run-mode | seeded-manifests/k8s only | Only k8s appears in `summary`; no false-positive TF or GHA detection |
| I3 | Empty manifest dir, run-mode | empty-repo | `summary` reports no IaC families detected; bundle schema-valid with empty `surface` / `artefacts` |
| I4 | One representative excerpt per family | seeded-manifests | `artefacts` contains exactly one excerpt per detected family (k8s + tf + GHA = 3), each with citations |

### generic-shaper edge cases

| # | Case | Fixture | What we assert |
|---|---|---|---|
| G1 | Code-only workspace, run-mode | tiny-multi-lang-repo (no data, no infra) | `summary` mentions code; data + infra sections in `summary` declare "not detected"; `surface` covers code-only surfaces |
| G2 | Mixed workspace, run-mode | tiny-multi-lang-repo + seeded.sqlite + seeded-manifests | All three surfaces appear in `summary` + `surface`; cross-cutting structural map |
| G3 | Empty workspace | empty-repo with no data, no infra | Bundle schema-valid; every layer reflects the absence accurately; `meta.emptyLayers` covers everything except `system` + `focus` + `summary` |

### classification-shaper edge cases

| # | Case | Fixture | What we assert |
|---|---|---|---|
| CL1 | Code-dominant workspace | tiny-multi-lang-repo only | Bundle's workspace summary reports the code repo; data + infra sections list "none" |
| CL2 | Data-dominant workspace | seeded.sqlite registered as a connection, no code repo registered | Bundle reports the connection; code section "none" |
| CL3 | Mixed workspace | All three fixtures registered | Bundle reports all three; classifier-downstream will be able to pick `generic` target from this signal |
| CL4 | Bundle size budget | Any fixture | Classification bundle stays small — verified by an empirical byte/token count assertion (e.g., < 4 KB serialized JSON). Not a hard cap, but a regression detector |

### Failure-mode edge cases (Phase 6)

| # | Case | Trigger | What we assert |
|---|---|---|---|
| F1 | Ollama unavailable | Kill Ollama process before the call | `ShaperLlmUnavailableError` thrown |
| F2 | Tool-loop exhaustion | Prompt instructed to keep calling tools; `maxToolTurns=3` override | `ShaperToolLoopExhausted` after exactly 3 tool calls |
| F3 | Schema unrecoverable | Prompt instructed to emit free text; `structuredOutputRetries=3` | `ShaperSchemaUnrecoverable` after exactly 3 retry attempts |
| F4 | Missing upstream | Task-mode call with `upstreamTasks.set('t02', null)` | `upstream` layer contains `[unavailable: t02]` marker; run continues |
| F5 | Auto-reindex on empty closure | Point at unindexed-repo | `repo.reindex` IPC fires, second attempt succeeds |
| F6 | Hard-empty closure | Point at empty-repo | `ScopeNotIndexedError` after reindex still returns empty |
| F7 | Missing prompt file at boot | Programmatically delete one prompt file | Daemon-boot smoke test fails with the missing-path log line |

### Performance + size sanity (informational)

These are not pass/fail tests but recorded measurements during Phase 5 + 6 live runs, surfaced in the test output for review:

- Tool-loop turn count distribution per shaper × per case.
- Bundle JSON size distribution per shaper × per case.
- Wall-clock time per invocation.
- Cache hit ratio across the test run.

Hard thresholds are deliberately not set — these are baselines for tracking drift across prompt revisions in Phase 5+ tuning rounds.

## Risk register

- **qwen3-coder tool-loop reliability.** The default shaper model is qwen3-coder. Tool-loop behavior at the target scale (40+ turns over a real repo's graph) is unverified. Mitigation: live tests during Phase 5 against the insrc-ide repo itself; if reliability is poor, swap to a different Ollama model via config. The `maxToolTurns` cap protects the runtime regardless.
- **Cache invalidation lag.** The shaper trusts the indexer's `lastIndexedAt`. If a user edits a file and runs analyze before the indexer's file-watcher fires, the cache returns stale content. Acceptable for v1; the file-watcher is fast in practice. Mitigation if it bites: targeted stat on cited files (hybrid approach from earlier discussion, now deferred).
- **Bundle size for XL scope.** No truncation → bundles can balloon. Specific worry: a generic-target run on a giant monorepo. Mitigation: the L/XL warning at run-start is the user's signal to expect this; framework-level monitoring of bundle sizes during testing will tell us whether any model truly can't accept the largest realistic bundle.
- **LLM emitting un-cited claims in `artefacts`.** The schema enforces a `citations[]` array per claim. Mitigation: schema with `minItems: 1` on the citations field where it's required; the structured-output corrective retry catches the LLM emitting zero-citation claims.

## Out of scope

- Bundle streaming (Phase 2 of the design doc).
- Cross-run dedup beyond identity-keyed cache.
- Adaptive shaper model selection (XL → bigger model auto-route).
- The classifier itself — we accept a `ClassifiedIntent` and stub the type until the classifier ships.
- The framework outer-loop's `analyze.run.start` IPC + the L/XL warning surface — design doc lives in `analyze-framework.md`, implementation lands with the framework outer-loop plan.

## Dependencies

- Indexer + repo registry: stable, in tree.
- `OllamaProvider` + `completeStructured`: stable, in tree.
- Built-in tool registry (`daemon/tools/builtins/`): stable, in tree.
- `db/search.ts` + LMDB graph layer: stable, in tree. (Consumed indirectly through the read-only tool surface.)
- DB drivers (`daemon/db/`, `daemon/tools/builtins/db/`, `daemon/tools/builtins/data/`): stable, in tree.
- `ClassifiedIntent` / `PlannedTask` / `AnalyzeTaskTemplate`: **not yet built**, stubbed structurally; tightened when the classifier + planner + template registry land.

## Out-of-band open items to revisit during Phase 5

These are intentionally not blocking the implementation:

1. **Tool-loop model choice.** Confirm qwen3-coder:14b vs an alternative once live tests are running.
2. **`numCtx` sizing for XL runs.** Default `models.analyze.shaper.ollamaNumCtx = 32768`. May need to grow for XL bundles; revisit when bundle sizes are measurable.
3. **Per-shaper prompt iteration.** First-cut prompts are scaffolding; expect 2-3 rounds of tuning against live runs in Phase 5 + 6.
