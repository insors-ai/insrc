# insrc-analyze steering block

Paste the block below verbatim into your project's `CLAUDE.md` (for
Claude Code) or `AGENTS.md` (for Codex CLI) at the repo root. Both
clients honour the same instructions — just copy the block into the
file each client reads.

---

## Code exploration via `insrc_analyze` / `insrc_analyze_step` (insrc MCP server)

For ANY question about this codebase's structure, conventions,
existing capabilities, adherence to documented rules, or design
decisions, CALL one of the two insrc analyze tools FIRST before
doing any manual file exploration (`Read`, `Grep`, `Glob`, `Bash`
grep, etc.).

Both tools run the same deterministic graph queries + citation-
grounded synthesis and return the same verified 7-layer context
bundle. They are MORE accurate than manual grep + read for context
questions because:

- Every claim is grounded in a real exploration output (module
  profile, symbol locate, class hierarchy, doc constraint, etc.).
- File paths are drawn from the indexed graph — no hallucinated
  paths.
- Contradictions in the docs are preserved verbatim, not
  auto-resolved.

### Which tool to use

| Intent                                                    | Tool                    |
|-----------------------------------------------------------|-------------------------|
| Map a module / explore its tree / count entities          | `insrc_analyze`         |
| List conventions / naming / test layout                   | `insrc_analyze`         |
| List indexed data sources or infra manifests              | `insrc_analyze`         |
| Adherence check ("does the code follow rule X from doc?") | `insrc_analyze_step`    |
| Capability discovery ("does the codebase already do Y?") | `insrc_analyze_step`    |
| Prose retrieval / decision trace from docs                | `insrc_analyze_step`    |

- **`insrc_analyze`** is one-shot: single tool call, server runs the
  whole pipeline. Any inner narrow-LLM calls route to the daemon's
  configured `shaperProvider` (Ollama by default).
- **`insrc_analyze_step`** is multi-turn: the server hands you the
  decomposer / synthesizer / narrow-LLM prompts + schemas via tool
  responses, and YOUR model emits the JSON as its next reasoning
  step. Better accuracy for adherence-check + capability-discovery +
  prose-retrieval because the narrow reasoning happens in-session
  with the model that's already looking at the user's question.

### `insrc_analyze` (one-shot)

Call it once, render the returned markdown bundle to the user.

```
insrc_analyze({ focus: "map the payable extraction module" })
  -> returns the 7-layer bundle as markdown
```

### `insrc_analyze_step` (multi-turn)

Follow the `next` field in each response verbatim. The `guidance`
field explains the next call in one sentence; `prompt` + `schema`
are the authoritative instructions for the JSON your model emits.
Preserve `state` verbatim between calls — it's an opaque token
tied to a server-side run.

Loop shape:

```
1. insrc_analyze_step({ phase: 'start', focus: '...' })
   -> { next: 'emit_plan', prompt, schema, state }
2. [emit JSON matching the plan schema]
   insrc_analyze_step({ phase: 'plan', plan: <JSON>, state })
   -> either { next: 'emit_narrow', ..., explorationId, state } (loop)
   -> or     { next: 'emit_bundle', ..., state }
3. [only if emit_narrow] emit JSON matching the narrow schema
   insrc_analyze_step({ phase: 'narrow', explorationId, narrow: <JSON>, state })
   -> loop until emit_bundle
4. [emit JSON matching the bundle schema]
   insrc_analyze_step({ phase: 'bundle', bundle: <JSON>, state })
   -> { next: 'done', markdown } — render this to the user
```

### When NOT to use either

- Editing files (both tools are read-only).
- Running tests / builds.
- Answering non-context questions (unrelated math, general
  knowledge, etc.).
- When the returned bundle is empty or clearly off-topic — fall
  back to `Read` / `Grep` / `Glob` at that point.

### Follow-up pattern

The first call returns a coarse 7-layer bundle. If you need to
drill down, call again with a narrower `focus`. Example flow:

```
1. insrc_analyze({ focus: "map the payable extraction module" })
   -> returns the module tree + naming schema

2. insrc_analyze({
     focus:  "how does the payable header extractor work",
     target: "code",
     scope:  "S"
   })
   -> narrower how-does-it-work bundle with usage examples
```

### `repo` argument

If not passed, the tool uses `$INSRC_REPO` from the MCP server's
environment. Explicit `repo` overrides it. The repo must be
registered with the insrc daemon (`insrc repo add /path/to/repo`)
and finished indexing.

## Workflow authoring via `insrc_workflow_step` (insrc MCP server)

Beyond code exploration, the insrc MCP server exposes a workflow
runner that produces persistent, cited artifacts (Epic + Stories,
HLD, LLD, GitHub tracker integration). Reach for
`insrc_workflow_step` when the user asks you to:

- **Define** what to build ("frame an Epic for X", "define stories
  for Y", "add feature Z") — runs `workflow=define`. Its FIRST step
  (`scope.assess`) is the scope classifier: it runs `insrc_analyze_step`
  over the existing docs + code and decides **new** vs **extend**:
    - **new** — no existing Epic fits; it frames a fresh Epic (Stories
      etc.) as usual.
    - **extend** — the ask builds on an existing Epic/design. The
      framework then SKIPS `epic.frame`/`stories.compose`, appends the
      new Story to that Epic's Define, files a pending
      `storyBoundary.addStory` HLD amendment, and writes an
      **ExtendArtifact** (`EXT-…`). Do NOT force a new Epic. Relay its
      `notify` line (what it builds on) to the user, then follow its
      `nextAction`: approve the amendment + updated Epic, then run
      `workflow=design.story` for the new Story to produce the LLD.
- **Design HLD** ("HLD for tag filtering") — runs
  `workflow=design.epic`. Requires an approved Define.
- **Design LLD** ("LLD for Story s1") — runs
  `workflow=design.story`. Requires an approved HLD.
- **Push to GitHub** ("push Epic to GitHub", "sync tracker
  status") — runs `workflow=tracker.push` / `tracker.sync` /
  `tracker.post`. You invoke `gh` directly; the framework supplies
  labels + task-list conventions.

Every workflow produces a citation-grounded artifact that survives
the session and downstream workflows read it as the authoritative
source. Human approval gates run between phases via `insrc workflow
approve <path>`.

### Loop shape (mirrors analyze-step)

```
1. insrc_workflow_step({ phase: 'start', workflow: '...', focus: '...', params: {...} })
   -> { next: 'emit_plan', prompt, schema, state }
2. [emit the plan JSON matching schema]
   insrc_workflow_step({ phase: 'plan', plan: <JSON>, state })
   -> { next: 'emit_step', stepId, prompt, schema, state }
3. [emit the step JSON matching schema]
   insrc_workflow_step({ phase: 'step', stepId, response: <JSON>, state })
   -> loop emit_step until you receive emit_synthesize
4. [emit the artifact JSON matching schema]
   insrc_workflow_step({ phase: 'synthesize', artifact: <JSON>, state })
   -> { next: 'done', path, markdown, artifact } — the artifact is
      written to disk; render `markdown` to the user
```

### Analyze vs workflow — decision heuristic

- User asks a **question about the codebase** → analyze.
- User asks you to **produce a document / decision / push** →
  workflow.
- User asks "does X exist?" during workflow → use analyze from
  inside the workflow step's LLM turn (context.assemble prompts
  explicitly call for `insrc_analyze_step` invocations).

### `insrc workflow chain <slug>`

If you're unsure what step comes next for an Epic, the CLI can
answer:

```
insrc workflow chain <epic-slug>
```

Prints the current status of Define / HLD / LLDs / amendments /
tracker + the exact next command to run.

