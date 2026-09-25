# CLAUDE.md — insrc backend

Standalone backend for the insrc code-knowledge system. Split from
[`insors-ai/insrc-ide`](https://github.com/insors-ai/insrc-ide) on
2026-07-14. The IDE fork clones this repo into `~/.insrc/daemon/`
and spawns the compiled entry — the IPC contract is the only surface
the IDE consumes.

## Project principles

- **Accuracy is primary; cost is the least priority.** When choosing between an accurate-but-expensive path (more LLM calls, bigger context, slower pipeline) and a cheap-but-lossy one, choose accuracy. The system's value is correctness, not throughput. Cost optimizations are valid only when they preserve accuracy; otherwise the cheap path is the wrong path. **Where this is enforced:** the per-role model tiering (see [`docs/daemon.md#model-tiering`](docs/daemon.md)) applies this principle concretely — accuracy governs the **critical** roles (design, review, build, validate), which the `coreFloor` guarantees are never served below the high tier, while **peripheral** roles (classification, narrow probes, tracker rendering, summaries) may trade capability for cost and speed on cheaper local models. Cost is traded only on roles where a weaker model does not erode correctness.
- **No direct cloud REST calls from our process.** Cloud LLM access happens through the locally-installed `claude` and `codex` CLI binaries (via `CliProvider`). Auth + quota stay with the user's CLI OAuth sessions. Direct REST providers to Anthropic / OpenAI / Gemini / Mistral must not be reintroduced.

## What lives here

- Indexer (tree-sitter parsing, manifest resolution, embedding generation)
- Daemon core (IPC, repo registry, queue, lifecycle, file-watcher)
- Storage (LMDB graph + Lance vectors, DuckDB query engine for data drivers)
- Built-in tools (~110 capability wrappers: file/git/shell/http/web/gh/k8s/pkg/ssh/test/notify/search/graph/db/data/code/cloud)
- `CliProvider` (`claude` + `codex` CLI subprocess wrapper, structured-output aware)
- `OllamaProvider` (local LLM + embeddings)
- Analyze framework (`insrc_analyze` + `insrc_analyze_step` MCP tools; 20 exploration recipes; context builder)
- Workflow framework (`define` → `design.epic` → `design.story` → `tracker` chain; `insrc_workflow_step` MCP tool)
- `insrc` interactive CLI — a full-screen ink (React) TUI with Daemon /
  Repos / Workflows / Setup panes (replaced the old commander subcommands)

The IDE fork owns: the VSCode workbench + `src/vs/workbench/contrib/insrc/`
IDE contributions (sidebar panes, service impls, RPC clients) +
`src/vs/platform/insrc/electron-main/insrcDaemonInstaller.ts` which
clones + builds this repo into `~/.insrc/daemon/`. IPC method names,
socket path (`~/.insrc/daemon.sock`), and payload shapes stay in
lock-step across the two repos via mirrored types.

## Tech stack

- **Language**: TypeScript (strict mode, ESM-only via `"type": "module"`)
- **Runtime**: Node.js 20+, executed with `tsx` during development. Native modules are built against Node 22.22.1 headers (see `.npmrc`), and the daemon spawns under Node 22 at install time.
- **Module system**: NodeNext (`"module": "nodenext"` in tsconfig)
- **Databases**: LMDB via `lmdb-js` (embedded KV; substrate for the custom graph layer in `db/graph/`), LanceDB (embedded vector DB; entity embeddings + ANN search), DuckDB via `@duckdb/node-api` (in-memory query engine *only* — backs the data-driver `db_file_*` tools; **not** used for persistent storage)
- **Parsing**: tree-sitter (TypeScript, Python, Go, Java, Scala)
- **LLM providers**: Ollama (local — `qwen3.6:35b-a3b` analyzer/shaper core + `qwen3-embedding:0.6b` embeddings) + `CliProvider`. Cloud auth is delegated to the CLI's OAuth session — no API keys stored on our side.
- **Logging**: pino + pino-pretty (CLI) + pino-roll (file rotation)
- **CLI**: ink + react — the `insrc` CLI is a full-screen interactive TUI (no commander/subcommands)
- **HTTP**: undici

## Project structure

```
src/
  shared/          Core types, paths, logger
    types.ts       Entity / Relation / LLMProvider / Tool / etc.
    paths.ts       ~/.insrc/ directory layout
    logger.ts      pino-based logging
  indexer/         Tree-sitter parsing + graph construction
  db/              Storage (LMDB graph + Lance vectors + DuckDB pool)
    graph/         Custom LMDB-backed graph layer (store, keys, codec, edges, traversal)
    lance/         LanceDB tables (entity-vec, session-vec, turn-vec, artifact-vec, config-vec, ...)
  daemon/          Background daemon process
    index.ts       Entry point + IPC handler registry
    server.ts      Unix-socket JSON-RPC server
    tools/         Tool registry + executor + ~110 built-in capability wrappers
  config/          On-disk config store + templates + feedback
  agent/
    providers/
      ollama.ts            Local provider (LLM + embeddings)
      cli-provider.ts      Subprocess wrapper for claude + codex CLI binaries
      structured-output.ts ajv + retry helpers
  analyze/         Analyze framework (20 exploration recipes, decomposer, synthesizer, context builder)
  workflow/        Workflow framework (define, design.epic, design.story, tracker, amendments, gates)
  mcp/             MCP servers (insrc_analyze_step, insrc_workflow_step)
  cli/             `insrc` interactive TUI (ink): panes/ services/ hooks/ ui/
  bin/             Executable entrypoints
  prompts/         Shaper / analyze / workflow prompt templates
  assets/          Non-TS runtime resources (shipped by copy-assets.mjs)
```

The daemon binary the IDE spawns is `out/daemon/index.js`. The MCP
binary registered with Claude Code / Codex is `out/bin/insrc-mcp.js`.

## Build and run

```bash
npm install                           # installs runtime + dev deps
npm run build                         # tsc + copy-assets.mjs
npx tsx --test 'src/**/__tests__/*.test.ts'   # full test sweep
```

Fast subsets for iteration:

```bash
npx tsx --test 'src/workflow/**/*.test.ts' 'src/mcp/**/*.test.ts'   # ~5 s
npx tsx --test 'src/db/**/*.test.ts'                                # LMDB / Lance / graph
npx tsx --test 'src/analyze/**/*.test.ts'                           # analyze framework
```

Live-service tests gate behind env vars (`INSRC_LIVE_TESTS=1` for Ollama /
CliProvider suites) and skip cleanly when unset.

## Code conventions

### Imports

- Always use `.js` extension in import paths (NodeNext resolution requires it even for `.ts` files)
- Use `import type` for type-only imports (`verbatimModuleSyntax` is enabled)
- Shared types come from `../shared/types.js` — never import SDK types directly into application logic

### TypeScript strictness

- `strict: true` with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- Optional properties use `| undefined` explicitly (e.g., `tools?: ToolDefinition[] | undefined`)
- Index access results are `T | undefined` — always handle the undefined case

### Logging

- Use `getLogger('module-name')` from `../shared/logger.js` — never use `console.log`
- Log levels: `INSRC_LOG_LEVEL` env var (default: `info`)

### LLM provider abstraction

- All LLM interaction goes through the `LLMProvider` interface in `shared/types.ts`
- Two implementations: `OllamaProvider` (local) and `CliProvider` (subprocess wrapper for claude + codex)
- Never `Promise.all` anything that reaches an LLM provider (cloud or local Ollama embed / complete); always serial `for...of` with sequential awaits.

### Entity IDs

- Deterministic: `SHA256(repo + file + kind + name)`, hex-32

### IPC

- Daemon communicates via JSON-RPC over Unix socket at `~/.insrc/daemon.sock`
- CLI / MCP / workbench never opens LMDB or LanceDB directly — always goes through daemon IPC

## Key architectural rules

1. **Daemon owns all DB access** — CLI, MCP, and the IDE workbench communicate via IPC only.
2. **Local-first** — Ollama is always available (embeddings are local-only). Cloud LLM access goes through `CliProvider` (claude + codex CLI subprocesses); no direct REST.
3. **Dependency-closure scoping** — graph searches span only the transitive `DEPENDS_ON` closure of the active repo.
4. **Graph + vector** — structural queries use the LMDB graph layer's typed JS API (`findCallers / findCallees / outNeighbors / inNeighbors / transitiveClosure / unreachable`); semantic queries use LanceDB ANN. No Cypher / GQL / SQL exposed for graph traversal.
5. **No raw file dumps** — context is always structured entity summaries + relations from the graph.
6. **Repo registry is the contract** — workspace registry membership is established exclusively via the `repo.add` IPC. The storage layer never auto-allocates registry rows; an `Entity` whose `repo` path isn't registered fails the upsert with `UnregisteredRepoError`. See [`plans/repo-registry-strict-contract.md`](plans/repo-registry-strict-contract.md).
7. **Prompt structure: structural reference goes trailing.** Schemas / catalogs / manifests belong at the tail of the prompt, not the middle — recency-weighted attention (especially on the local `qwen3.6:35b-a3b` shaper) hallucinates against mid-prompt structural info.

## Design documents

- [`design/indexer.html`](design/indexer.html) — indexer architecture
- [`design/analyze-framework.md`](design/analyze-framework.md) — analyze framework overall
- [`design/analyze-context-builder.md`](design/analyze-context-builder.md) — context builder
- [`design/analyze-plan-builder.md`](design/analyze-plan-builder.md) — plan builder
- [`plans/storage-migration-lmdb-lance.md`](plans/storage-migration-lmdb-lance.md) — storage substrate
- [`plans/graph-storage-lmdb.md`](plans/graph-storage-lmdb.md) — graph layer
- [`plans/repo-registry-strict-contract.md`](plans/repo-registry-strict-contract.md) — repo registry contract
- [`plans/tools.md`](plans/tools.md) — tool registry + ~110 built-ins
- [`plans/meta-workflow-framework.md`](plans/meta-workflow-framework.md) — workflow framework
- [`docs/workflow.md`](docs/workflow.md) — workflow user guide
- [`docs/daemon.md`](docs/daemon.md) — daemon usage guide

<!-- insrc:steering:start -->
## insrc — front door (insrc MCP server)

This is the SKELETON. It names every insrc surface and routes an intent to the
right one; it does NOT inline each workflow's full procedure. Two on-demand
lookups carry the detail so this block can stay small:

- **`insrc_schema`** — the exact INPUT SHAPE of any insrc_* tool (and, for a
  multi-turn tool, its accepted `phase` set). Call it before you emit a call
  whose argument shape you are unsure of, instead of guessing.
- **`insrc_guide`** — a workflow's full STEP-BY-STEP PROCEDURE. Call
  `insrc_guide({ workflow })` before running a workflow you don't have fresh in
  context, with one of: `define`, `design.epic`, `design.story`, `plan`,
  `build`, `review`, `code-review`, `brainstorm`, `tracker`, `triage`. Omit
  `workflow` to get the list of keys back.

**Schema-first rule:** call `insrc_schema` before emitting any insrc_* call whose
shape (fields, or the `phase` you're in) you are not certain of. Don't hand-shape
a call from memory when the contract is one lookup away.

### Front-door decision tree (intent → surface)

- **Question about the codebase** (structure, conventions, capabilities,
  adherence, design decisions) → `insrc_analyze_step` (multi-turn, in-session,
  preferred) or `insrc_analyze` (one-shot, Ollama). Do this BEFORE manual
  `Read`/`Grep`/`Glob`.
- **Draw / diagram / document / map the code** (a self-contained HTML doc from
  the graph) → `insrc_docgen`.
- **Build / add / implement a feature** → do NOT hand-pick a stage and do NOT
  just start editing. Route it: `brainstorm` (if the idea is rough) →
  `insrc_triage` (sizes + routes) → the routed workflow → review → approve →
  build → code-review → complete. Every feature, big or small, is tracked. See
  `insrc_guide({ workflow: 'triage' })` for the routing table.
- **Produce a design artifact / decision / tracker push** (Epic, HLD, LLD,
  GitHub) → the workflow chain via `insrc_workflow_step` /
  `insrc_workflow_run`. See the matching `insrc_guide` key.
- **The exact shape of a call** → `insrc_schema`.
- **A workflow's full procedure** → `insrc_guide({ workflow })`.

### Tool catalog (all registered insrc_* MCP tools)

Call `insrc_schema({ tool })` for any tool's exact input shape (add `phase` for
a multi-turn tool). Call `insrc_guide({ workflow })` for a workflow's procedure.

| Tool | Purpose |
|------|---------|
| `insrc_analyze` | One-shot 7-layer context bundle for a codebase question (Ollama pipeline). |
| `insrc_analyze_step` | Multi-turn context bundle — same queries, reasoning stays in-session (preferred). |
| `insrc_docgen` | Generate a self-contained offline HTML doc/diagram from the code graph. |
| `insrc_triage` | Size a feature request and return a pre-filled `nextCall` routing it to a start stage. |
| `insrc_workflow_step` | Drive one tracked workflow turn (define / design.epic / design.story / plan / brainstorm / tracker). |
| `insrc_workflow_run` | Run a workflow daemon-side (async START → POLL); relay each progress batch. |
| `insrc_build_step` | Drive the build stage (`implement` → `validate`) that turns an approved LLD/plan into code. |
| `insrc_review_step` | Independent controller review of a design artifact (DEF/HLD/LLD) before approval. |
| `insrc_code_review_step` | Post-build code review over the changed code (adherence / conventions / coverage / quality). |
| `insrc_workflow_approve` | Approve a pending artifact by `artifactPath` (or `epicHash` to batch) — only on the user's explicit yes. |
| `insrc_schema` | Return any insrc_* tool's registered input shape + accepted phases. |
| `insrc_guide` | Return one workflow's full step-by-step procedure from the canonical steering source. |

`insrc_analyze` / `insrc_analyze_step` / `insrc_docgen`: **repo** falls back to
`$INSRC_REPO`; the repo must be registered with the daemon and finished
indexing. The multi-turn tools (`*_step`, `insrc_triage`) hand you a `next` /
`guidance` / `prompt` / `schema` each turn — follow `next` verbatim and preserve
the opaque `state` token between calls. Do NOT use analyze to edit files, run
tests/builds, or answer non-context questions; when a returned bundle is empty
or off-topic, fall back to `Read` / `Grep` / `Glob`.

`insrc_docgen` `docType` values (each single-sources from the code graph — no
hallucinated paths): `type-structure` (classes/interfaces + inheritance in a
scope, `path?`), `component-dependency` (module dependency topology, `path?`),
`call-sequence` (call flow from an entry point — needs `symbol`, `maxDepth?`),
`narrative` (a base diagram + a graph-grounded walkthrough — needs `base` +
`question`).

### Approval discipline (applies to every workflow artifact)

Never auto-approve and never send the user to the TUI. When a `done` response
carries a `pendingApproval` block, PRESENT a concise summary and ASK the user;
only on their explicit in-chat yes call
`insrc_workflow_approve({ artifactPath })` (or `{ epicHash }` to batch). Review
before you approve — see `insrc_guide({ workflow: 'review' })`.

<!-- insrc:guide:triage:start -->
## triage — size a feature request and route it (`insrc_triage`)

When the user asks you to **build / add / implement a feature** (not a question
— that's analyze), do NOT hand-pick `define` / `design.story` / `build`, and do
NOT just start editing. The framework's guarantee is that **every feature, big
or small, is tracked**. `insrc_triage` sizes the request (grounded on your own
`insrc_analyze_step` passes) and routes it to the right start stage:

- **epic** → `define` (full chain — new subsystem / many stories)
- **feature** → standalone `design.story` (LLD) → `plan` → `build`
- **small** → standalone `design.story` (LLD) → `build`
- **trivial** → `build` (no LLD; a standalone BUILD record is its ledger entry)

It returns a **pre-filled `nextCall`** — make exactly that call next. Two-turn
loop: `phase:'start'` with `{ focus, repo? }` → ground + emit the `TriageResult`
→ `phase:'classify'` with `{ result, state }` → `{ nextCall }`.

Skip triage only for a genuine one-liner the user explicitly scoped, or when
they name a specific stage. Everything else goes through the front door so it
lands on the ledger. If the idea is still rough, run `brainstorm` first.
<!-- insrc:guide:triage:end -->

<!-- insrc:guide:brainstorm:start -->
## brainstorm — converge a rough idea into a spec (`workflow: 'brainstorm'`)

Run this BEFORE triage when the request is a vague or ambiguous idea rather than
a crisp spec. It is a SINGLE paused `elicit` turn — YOU conduct the whole
clarify → fold → show → confirm convergence in chat:

- fold each answer into a running problem statement,
- show it back every turn,
- re-ask only the still-open gaps,
- at a fork, present the options and record the choice's `ruledOut`
  alternatives in `nonGoals`.

Then resume ONCE with `confirmed: true` and no open items. Review + approve the
resulting **SpecArtifact** (same present-ask-approve discipline), then seed
`insrc_triage` / `define` / `design.story` from the approved spec. Skip
brainstorm when the request is already a clear, scoped spec — go straight to
triage.
<!-- insrc:guide:brainstorm:end -->

<!-- insrc:guide:define:start -->
## define — frame an Epic + Stories (`workflow: 'define'`)

Runs when triage sizes the request as an **epic** (new subsystem / many
stories). Produces a persistent, citation-grounded **Define** (Epic + Stories +
constraints). Its FIRST step (`scope.assess`) is the scope classifier: it runs
`insrc_analyze_step` over the existing docs + code and decides **new** vs
**extend**:

- **new** — no existing Epic fits; it frames a fresh Epic (Stories etc.) as
  usual.
- **extend** — the ask builds on an existing Epic/design. The framework then
  SKIPS `epic.frame` / `stories.compose`, appends the new Story to that Epic's
  Define, files a pending `storyBoundary.addStory` HLD amendment, and writes an
  **ExtendArtifact** (`EXT-…`). Do NOT force a new Epic. Relay its `notify` line
  (what it builds on) to the user, then follow its `nextAction`: approve the
  amendment + updated Epic, then run `design.story` for the new Story.

Standard loop (mirrors analyze-step): `phase:'start'` → `emit_plan` →
`phase:'plan'` → `emit_step` (loop) → `emit_synthesize` → `phase:'synthesize'` →
`done` with the written artifact. Review the Define (`insrc_review_step`), then
present-ask-approve. Next stage: `design.epic` (HLD).
<!-- insrc:guide:define:end -->

<!-- insrc:guide:design.epic:start -->
## design.epic — author the HLD (`workflow: 'design.epic'`)

Produces the Epic's **HLD** (high-level design: story boundaries, cross-cutting
contracts, the winning architecture option). Requires an approved **Define**.
Cross-cutting contracts are guided to the nearest-common-ancestor owner so a
Story's LLD validates without amending the Epic.

Loop: `phase:'start'` with `{ workflow:'design.epic', focus, params }` →
`emit_plan` → `phase:'plan'` → `emit_step` (loop) → `emit_synthesize` →
`phase:'synthesize'` → `done`. Review the HLD with `insrc_review_step` before
approving (a `block` verdict from unresolved HIGH/MED findings gates approval);
resolve, then present-ask-approve. Next stage: `design.story` per Story.
<!-- insrc:guide:design.epic:end -->

<!-- insrc:guide:design.story:start -->
## design.story — author a Story's LLD (`workflow: 'design.story'`)

Produces one Story's **LLD** (low-level design: interfaces, files, tasks,
citations). Requires an approved **HLD** for an epic Story; a **standalone**
`design.story` (from triage `feature` / `small`) skips the HLD/epic reads and
runs on its own. Pass the LOWERCASE story id (e.g. `s1`) — an uppercase `S001`
crashes with "Story not found".

Stay inside the Story's own scope — the LLD carries `adjacentBoundaries` and an
anti-overreach rule so authoring does not spill onto sibling Stories. Loop:
`phase:'start'` → `emit_plan` → `phase:'plan'` → `emit_step` (loop) →
`emit_synthesize` → `phase:'synthesize'` → `done`. Review (`insrc_review_step`),
present-ask-approve, then run `plan`.
<!-- insrc:guide:design.story:end -->

<!-- insrc:guide:plan:start -->
## plan — decompose an approved LLD into build tasks (`workflow: 'plan'`)

Turns an approved LLD into an ordered, citation-grounded **PLAN** (the task
breakdown the build follows). `readPlanUpstream` is scope-aware: a standalone
LLD's plan skips the HLD/epic reads, so `plan` runs without an HLD. Loop mirrors
the other workflows (`start` → `plan` → `step` loop → `synthesize` → `done`).
Present-ask-approve the PLAN, then run `build`.
<!-- insrc:guide:plan:end -->

<!-- insrc:guide:build:start -->
## build — implement an approved plan (`insrc_build_step`)

Turns an approved LLD/PLAN into code. Multi-turn: `phase:'implement'` →
`phase:'validate'`. A **trivial** triage result goes straight here with no LLD
(a standalone BUILD record is its ledger entry). Call
`insrc_schema({ tool:'insrc_build_step', phase })` for the exact shape of each
phase.

After the build has produced its changes, run `code-review` over the changed
code, PRESENT the verdict, then COMPLETE the Story by approving its **BUILD**
artifact with `insrc_workflow_approve` on the BUILD md/path. BUILD approval is
the code-review-gated completion act: under `codeReview.enforce` (config, off /
advisory by default) a `block` — or no review having run — withholds completion
into `skipped[]` unless you pass an explicit `overrideReview`.
<!-- insrc:guide:build:end -->

<!-- insrc:guide:review:start -->
## review — independent design-artifact review (`insrc_review_step`)

Run this on a written artifact (DEF / HLD / LLD) BEFORE approving it — two sets
of eyes. A daemon self-review runs the SAME model that authored the artifact
(no independent perspective); `insrc_review_step` moves the review's reasoning
into YOU, the controller, and the reviewer must be a DIFFERENT actor than the
author. It extracts the artifact's load-bearing premises, the server re-runs
deterministic probes against real source, and you judge the verdicts against
that evidence.

Loop: `phase:'start'` → `claims` → `verdicts`. It stamps `meta.review`; a
`block` verdict (unresolved HIGH/MED findings) then gates approval. Resolve the
blocking findings (apply / accept-with-note / override), THEN present-ask-approve
with `insrc_workflow_approve({ artifactPath })`. A review-blocked artifact comes
back from approve in `skipped[]` with a reason (relay it); pass `overrideReview`
only with the user's explicit override reason.
<!-- insrc:guide:review:end -->

<!-- insrc:guide:code-review:start -->
## code-review — post-build code review (`insrc_code_review_step`)

Run this over the changed code AFTER the build produces its changes. DISTINCT
from `insrc_review_step` (which reviews the design artifact). Multi-turn:
`phase:'start'` with `{ epicHash, storyId, repo? }` → `emit_judgements` hands you
the four dimension prompts + grounding → emit the `{ judgements }` JSON →
`done`. It writes a code-review record across four dimensions — **adherence /
conventions / coverage / quality** → block / warn / pass.

If the graph grounding comes back hollow on just-created files (no symbol/test
edges), judge coverage by RUNNING the suite and flag the caveat honestly —
never fabricate a HIGH from empty grounding. PRESENT the verdict, then COMPLETE
the Story by approving its **BUILD** artifact (see the `build` guide — BUILD
approval is the code-review-gated completion act).
<!-- insrc:guide:code-review:end -->

<!-- insrc:guide:tracker:start -->
## tracker — sync the Epic to GitHub (`workflow: 'tracker.push' / '.sync' / '.post'`)

Push an Epic to GitHub, sync tracker status, or post an update. YOU invoke `gh`
directly; the framework supplies the labels + task-list conventions. The repo's
GitHub tracker target comes only from per-repo config or its own git remote,
never a global default. Loop mirrors the other workflows. Present-ask-approve
any artifact it writes.
<!-- insrc:guide:tracker:end -->
<!-- insrc:steering:end -->
