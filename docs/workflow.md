# insrc workflow framework

A citation-grounded, human-in-the-loop authoring pipeline that
takes an ask from natural language through Epic + Stories, HLD +
LLDs, HLD amendments, and (optionally) a GitHub tracker push.
Every artifact is grounded in analyze bundles and cited to the
step outputs that produced it.

This doc covers the concepts, install, and a walkthrough. For the
implementation plan see
[`plans/workflow-implementation.md`](../plans/workflow-implementation.md);
for the architecture see
[`plans/meta-workflow-framework.md`](../plans/meta-workflow-framework.md).

## Concepts

The framework models software authoring as **Epic → Story →
(later) Task**, mirroring how issue trackers and design docs are
already organised:

- **Epic** — one user-value ask ("Users can filter todos by tag").
  Produced by `define`. Contains problem statement, non-goals,
  assumptions, constraints, and 1–10 Stories.
- **Story** — one deliverable slice within an Epic ("As a user I
  can pick a tag"). Every Story has acceptance criteria in
  Given/When/Then form.
- **HLD** — the framework-level design for the whole Epic. One per
  Epic. Contains chosen framework, shared contracts, Story
  boundaries, non-functional targets, rollout phases, and
  alternatives considered.
- **LLD** — the Story-level design. One per Story. Contains the
  detailed contract (APIs + data model), error paths, test
  strategy, and (for enhancement flavor Epics) a migration plan.
- **Amendment** — a typed, cited delta to an existing HLD, emitted
  by downstream steps when they discover a small localised HLD
  change is needed. Reviewed and approved by a human; applied
  deterministically to produce the effective HLD.

Two flavors are detected at define time:

- `enhancement` — extending an existing capability. Stories
  reference existing analyze bundles; LLDs include migration.
- `new-capability` — brand new work. Stories describe pure-new
  behaviour; LLDs skip migration.

### Six workflows

| Workflow | Purpose | Output |
| :--- | :--- | :--- |
| `define`         | Frame Epic + Stories                       | `docs/defines/DEF-<h16>.md` |
| `design.epic`    | HLD: framework + contracts + rollout       | `docs/designs/HLD-<h16>.md` |
| `design.story`   | LLD: Story contract + tests + migration    | `docs/designs/LLD-<h16>-<storyId>.md` |
| `tracker.push`   | Push Epic + Stories to GitHub Issues       | `~/.insrc/workflow-runs/<h16>/tracker.push-<runId>.jsonl` + Epic meta patch |
| `tracker.sync`   | Pull GitHub Issue status back into meta    | Epic meta patch |
| `tracker.post`   | Attach HLD/LLD/amendment summary as comment | GitHub comment |

Every workflow follows the same shape: `context.assemble` (may be
deterministic or a coarse-handoff LLM call to `insrc_analyze_step`)
→ N LLM steps → `checklist.verify` → synthesize. Human approval
gates run between phases.

### Design principles

- **Accuracy first, cost last.** Never skip a step to save turns.
- **No parallel LLM calls.** Every step runs sequentially.
- **Structural reference goes trailing.** Every prompt puts
  schemas + prior outputs at the tail so recency-weighted models
  read them last.
- **Citation grounding.** Every claim in every artifact cites a
  step output or analyze bundle. Ungrounded citations refuse
  synthesize.
- **Scope-boundary HARD RULE.** Each workflow enforces its own
  boundary — `define` never proposes solutions, HLD never enters
  implementation, LLD never contradicts the HLD, tracker never
  edits issues it didn't create.

## Install

The workflow framework ships with the insrc daemon. To use it you
need:

1. The insrc daemon installed + running (see
   [`docs/daemon.md`](daemon.md)).
2. The `insrc` CLI on your PATH.
3. An MCP client — either Claude Code (`claude mcp add`) or Codex
   CLI (`codex config`) with the insrc MCP server registered.
4. For `tracker.*` workflows only: the [`gh`
   CLI](https://cli.github.com/) installed and authenticated (`gh
   auth login`). We do not store any GitHub tokens.

### Register the MCP server

If you already have `insrc_analyze` / `insrc_analyze_step`
registered (see [`docs/daemon.md`](daemon.md)), the workflow tool
`insrc_workflow_step` is already available on the same server. No
extra registration needed.

### Add the steering block

Paste the workflow section from
[`src/insrc/mcp/steering-template.md`](../src/insrc/mcp/steering-template.md)
into your project's `CLAUDE.md` (Claude Code) or `AGENTS.md`
(Codex CLI). This tells your client when to reach for the workflow
tool.

## Walkthrough

Assume you want to add tag filtering to a hypothetical `todos`
codebase. Every LLM turn happens inside your MCP client (Claude
Code / Codex CLI); the CLI is only for approval and inspection.

### 1. Define the Epic

Ask your client:

> Use `insrc_workflow_step` to define an Epic for "Add tag
> filtering to todos".

Your client runs the multi-turn loop: `phase=start` (returns the
decomposer prompt) → emits the 4-step plan → runs
`context.assemble` (which uses `insrc_analyze_step` to detect
flavor + gather analyze bundles) → `epic.frame` → `stories.compose`
→ `checklist.verify` → synthesize.

Output lands at `docs/defines/DEF-<h16>.md` (with the canonical
JSON at `.insrc/artifacts/DEF-<h16>.json`). The `<h16>` is the
16-char Epic hash minted by the Define workflow; every downstream
artifact for this Epic will reuse it.

### 2. Approve the Epic

```
insrc workflow approve docs/defines/DEF-<h16>.md
```

Downstream workflows refuse to run until this happens.

> **Auto tracker.** Approving an HLD or LLD automatically pushes the
> corresponding GitHub issue (Epic for HLD, Story for LLD) via `gh`
> and patches the artifact's meta with the resulting ref. Repeat
> approves are idempotent — a second run detects the existing ref
> and skips. Use `--no-tracker` on the approve command to opt out
> for one call; you can push manually later via the batch
> `tracker.push` workflow.

### 3. Design the HLD

> Use `insrc_workflow_step` to run design.epic for
> add-tag-filtering-todos.

Params required: `{ epicHash: "<h16>" }` — the 16-char hash the
Define workflow minted.

Six steps: context (Epic-scoped analyze bundles) →
alternatives.enumerate (2–4 shapes) → alternatives.judge (score
against constraints) → framework.write (the big one — chosen
framework + shared contracts + Story boundaries) → rollout.overview
(phases + risky bits) → checklist.verify.

Output: `docs/designs/HLD-<h16>.md`. Approve with `insrc workflow
approve`.

### 4. Design LLDs (one per Story)

For each Story:

```
insrc_workflow_step phase=start workflow=design.story \
  focus="LLD for s1" params={"epicHash":"<h16>","storyId":"s1"}
```

Eight steps (seven always + one conditional): context (Story
scope) → alternatives × 2 → contract.detail → error.paths →
test.strategy → migration.write (only for `enhancement` flavor;
skips for `new-capability`) → checklist.verify.

Output: `docs/designs/LLD-<h16>-s1.md`. Approve.

### 5. Push to GitHub (optional)

**The tracker is opt-in.** When `~/.insrc/github.json` is absent or
no entry matches, `resolveGithubConfig` returns `{ type: 'none' }` —
the approve-time auto-push short-circuits with
`skipped (tracker disabled ...)`, and the manual `tracker.push` /
`tracker.sync` / `tracker.post` MCP workflows refuse with a clear
message. Even a repo whose git origin points at github is not
auto-enabled; you must explicitly opt in via config.

To enable the GitHub adapter:

```
mkdir -p ~/.insrc
cat > ~/.insrc/github.json <<'JSON'
{
  "default": { "type": "github", "owner": "myorg", "repo": "myrepo", "useMilestones": false }
}
JSON

# Inspect the resolved config
insrc workflow gh-config

# Push Epic + Stories via the MCP tool
```

The `type` field selects the tracker adapter:

- `"type": "github"` — push to GitHub Issues via `gh`.
- `"type": "none"` — explicit opt-out. Same effect as omitting the
  entry entirely; the explicit form is useful when you want to
  override an inherited `default` on a specific repo.

Per-repo overrides win over the `default` entry:

```
{
  "default": { "type": "github", "owner": "myorg", "repo": "shared" },
  "repos": {
    "/path/to/local-only-repo": { "type": "none" }
  }
}
```

For a `default: { type: "github" }` entry without owner/repo, the
resolver auto-detects the target from `git remote get-url origin`.
This shortcut requires the `type: "github"` opt-in — the resolver
never auto-detects when the entry is missing or empty.

Then from your client:

> Use `insrc_workflow_step` to run tracker.push for
> add-tag-filtering-todos.

Params: `{ epicHash: "<h16>" }`. The LLM runs
`gh` directly, creates labels + issues + task list + back-refs,
and the framework patches the Epic's `meta.tracker` with the refs.

Later, to sync issue status back:

```
Use `insrc_workflow_step` to run tracker.sync for
add-tag-filtering-todos.
```

To attach a design summary as a comment on the target issue:

```
Use `insrc_workflow_step` to run tracker.post for
add-tag-filtering-todos with target={ kind: "hld" }.
```

### 6. HLD amendments

During LLD authoring, the LLM may discover the HLD needs a small
change — a shared contract needs one more field, a Story needs
reassigned ownership. The `contract.detail` and `error.paths`
steps can emit an amendment proposal alongside their output. The
framework validates the proposal against the applier and persists
it as pending under `.insrc/artifacts/AMD-<h16>-<n>.json`.

Review pending amendments:

```
insrc workflow amend <h16> --list
insrc workflow amend <h16> --show AMD-<h16>-1
```

Approve or reject:

```
insrc workflow amend <h16> --approve AMD-<h16>-1

insrc workflow amend <h16> --reject AMD-<h16>-2 \
  --notes "not needed; existing contract is fine"
```

Approved amendments are folded into the **effective HLD** —
what every downstream LLD reads. Existing LLDs anchored to the
pre-approval hash are marked stale.

### 7. Chain status any time

```
insrc workflow chain <h16>
```

Prints the current state of Define / HLD / LLDs / amendments /
tracker and the exact next command to run.

## Storage layout

Every artifact carries a 16-char Epic hash (`<h16>`, the same
value across every artifact for the Epic). Human-facing markdown
lives under `docs/`; canonical JSON lives under `.insrc/artifacts/`
so `docs/` stays clean.

```
<repo>/
├── docs/                                # human-facing markdown only
│   ├── defines/
│   │   └── DEF-<h16>.md                 # Epic
│   └── designs/
│       ├── HLD-<h16>.md                 # HLD
│       ├── LLD-<h16>-s1.md              # LLD per Story
│       └── LLD-<h16>-s2.md
│
└── .insrc/artifacts/                    # canonical JSON, hidden, git-tracked
    ├── DEF-<h16>.json
    ├── HLD-<h16>.json
    ├── LLD-<h16>-s1.json
    ├── LLD-<h16>-s2.json
    ├── AMD-<h16>-1.json                 # amendments, one file each
    └── AMD-<h16>-2.json

~/.insrc/
├── github.json                          # GitHub tracker config
└── workflow-runs/
    └── <h16>/                           # jsonl trace logs (outside repo)
        ├── define-<runId>.jsonl
        ├── design.epic-<runId>.jsonl
        ├── design.story-<runId>.jsonl
        └── tracker.push-<runId>.jsonl
```

The 16-char hash is `sha256(defineRunId).slice(0, 16)` — minted
by the Define workflow, reused by every downstream artifact for
the Epic. The human-readable slug derived from the focus lives
only in `meta.epicSlug` for display.

## CLI reference

### Inspection

```
insrc workflow list                    # enumerate registered workflows
insrc workflow chain <h16>             # end-to-end status + next action
insrc workflow status <h16>            # pending amendments + LLD staleness
insrc workflow gh-config               # resolved GitHub config
insrc workflow runs [--epic <h16>]     # workflow-run log files
insrc workflow derive-slug <focus>     # preview the display slug for a focus
```

### Approvals

```
insrc workflow approve <path>          # sets meta.approvedAt (.md or .json)
insrc workflow reject <path> --reason <text>
insrc workflow ack-stale <lld-path> --reason <text>
```

### Amendments

```
insrc workflow amend <h16> --list
insrc workflow amend <h16> --show <amendmentId>
insrc workflow amend <h16> --approve <amendmentId>
insrc workflow amend <h16> --reject <amendmentId> --notes <text>
```

### GitHub tracker

```
insrc workflow unlink <h16>            # clear tracker meta locally (does NOT touch GitHub)
```

Push/sync/post themselves run via the MCP tool — those need LLM
work.

## FAQ

### Why so many gates?

Every workflow phase produces a review-worthy artifact, and every
downstream phase depends on the shape of the previous one being
locked. Without gates you'd get feedback loops where a downstream
Story reveals a bad Epic framing, and the whole chain drifts.
Approval doesn't have to be slow — for solo use, `insrc workflow
approve` is one command.

### What if the LLM invents facts?

Every synthesizer runs three checks before writing:
1. JSON shape (ajv validates against a per-artifact schema).
2. Citation grounding (every `[[cN]]` in the body must resolve to
   a real citation; every citation must be used).
3. Scope-boundary (per-workflow banned patterns catch code fences
   in defines, task lists in HLDs, invented paths, etc.).

Failures at any check refuse the write with a corrective note so
the LLM can retry.

### Why is `context.assemble` a coarse handoff to the LLM instead
of a deterministic analyze call?

The LLM already has the `insrc_analyze_step` tool and knows how
to use it. Baking the analyze invocations into the framework
would either (a) duplicate the analyze framework's routing logic
or (b) force analyze work through the daemon's Ollama path even
when the outer client is Claude / Codex. Delegating to the outer
LLM keeps all reasoning in-session and works uniformly across
clients.

### What if GitHub push fails partway?

The `checklist.verify` step of tracker.push re-checks every ref
against the conventions. If any Story issue is missing a label or
the Epic body doesn't have the task list, the checklist fails and
finalize refuses. The Epic's `meta.tracker` is only patched on
success.

The LLM handles rate limits + auth failures the same way it
handles them in any other workflow — by returning an error the
user sees. We do not own the GitHub connection.

### Can I re-run a workflow after approval?

Yes. For `define`, use `insrc_workflow_step ... focus=... params={ "reopen": "<slug>" }`
(future work — currently: reject the artifact and re-run). For
HLD, a back-flow-vs-amendment decision applies — see
[`plans/workflow-design.md`](../plans/workflow-design.md) §10.3.

## Non-negotiables (project rules)

- **Accuracy is primary; cost is least priority.** Cost
  optimizations that reduce accuracy are not accepted.
- **No direct cloud REST calls from our process.** Cloud LLM
  access happens through the locally-installed `claude` /
  `codex` CLI binaries. `gh` for tracker calls is the same
  principle — we invoke it, we don't wrap it.
- **Every workflow's artifacts are on-disk + version-controlled.**
  The repo is the source of truth; the daemon just serves it.

See [`CLAUDE.md`](../CLAUDE.md) for the full set of project
principles.
