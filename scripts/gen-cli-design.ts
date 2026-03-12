#!/usr/bin/env tsx
/**
 * Incrementally builds design/cli.html by running the insrc agent's design
 * pipeline section-by-section. Each section is a separate agent call with
 * focused requirements, and the results are assembled into the final HTML.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../src/agent/config.js';
import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { ClaudeProvider } from '../src/agent/providers/claude.js';
import type { LLMProvider, LLMMessage } from '../src/shared/types.js';

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

const config = loadConfig();
const local = new OllamaProvider(config.models.local, config.ollama.host);
const claude = config.keys.anthropic
  ? new ClaudeProvider({ model: config.models.tiers.standard, apiKey: config.keys.anthropic })
  : null;

// ---------------------------------------------------------------------------
// Reference material
// ---------------------------------------------------------------------------

const vscodeRef = readFileSync(resolve('design/vscode-plugin.html'), 'utf-8');
const rawDesign = readFileSync(resolve('/home/subho/work/temp/cli-design-raw.md'), 'utf-8');

// Extract just the CSS from the vscode reference (reuse verbatim)
const cssMatch = vscodeRef.match(/<style>([\s\S]*?)<\/style>/);
const css = cssMatch?.[1] ?? '';

// ---------------------------------------------------------------------------
// Section definitions — each becomes one agent call
// ---------------------------------------------------------------------------

interface Section {
  id: string;
  title: string;
  prompt: string;
}

const sections: Section[] = [
  {
    id: 'overview',
    title: 'Overview',
    prompt: `Write the Overview section for the insrc CLI design document.

The CLI is the primary terminal interface for the insrc agent. Two modes: interactive REPL and one-shot commands. Both connect to the same daemon backend. Thin UI layer — all intelligence lives in the agent core and daemon.

Include:
- A paragraph describing the CLI's purpose and design philosophy (fast startup, streaming, UNIX conventions, pipes, --json, shell completion)
- A callout box (class="callout info") explaining the architecture boundary: CLI owns input parsing, output formatting, user interaction. Agent core owns classification, routing, tool execution, context assembly.
- An ASCII architecture diagram in a <pre><code> block showing: Terminal → CLI (src/cli/) → Agent core (src/agent/) → Daemon (Unix socket JSON-RPC) → Kuzu + LanceDB`,
  },
  {
    id: 'commands',
    title: 'Command Structure',
    prompt: `Write the Command Structure section. Show the full command tree in a <pre><code> block:

insrc                                    # Interactive REPL (default)
insrc ask <message>                      # One-shot: classify, execute, exit
insrc plan <description>                 # One-shot: generate plan
insrc daemon <start|stop|status|logs>    # Daemon lifecycle
insrc repo <add|remove|list|status>      # Repository management
insrc session <list|show|resume|delete>  # Session management
insrc config <show|set|edit>             # Configuration management
insrc index <path>                       # Manual indexing
insrc graph <query>                      # Direct graph query (no LLM)
insrc health                             # System health check
insrc version                            # Version info
insrc completion <bash|zsh|fish>         # Shell completion

Add a paragraph explaining: bare insrc enters REPL, all others are non-interactive by default.`,
  },
  {
    id: 'repl',
    title: 'Interactive REPL',
    prompt: `Write the Interactive REPL section. Include:

1. <h3>Startup sequence</h3> with a <pre><code> block showing the startup banner:
   insrc v0.1.0, repo name + entity count, model name, claude status, permission mode, "Type a message to begin. /help for commands."

2. <h3>Pre-flight checks</h3> with a table (columns: Check, Pass, Fail) covering: Ollama reachable, Daemon running (auto-start), Repo indexed, Anthropic API key, Required models (auto-pull). Add a callout (class="callout ok") about auto-recovery.

3. <h3>REPL prompt</h3> — prompt is "❯ ". Table of states: Ready=white, Processing=dim, Auto-accept=yellow, Error=red.

4. <h3>Input features</h3> — list: readline history (~/.insrc/repl_history), multi-line (trailing \\, triple backtick, Ctrl+J), @file:path references with glob, @claude/@opus/@local provider prefixes, /intent prefix, pipe detection.

5. <h3>REPL commands</h3> — table with columns Command and Description for: /help, /status, /cost, /mode, /plan (show/skip/undo/abandon), /session (list/resume), /forget, /graph, /clear, /exit, /verbose`,
  },
  {
    id: 'streaming',
    title: 'Streaming Output',
    prompt: `Write the Streaming Output section. Include:

1. A paragraph: CLI streams token-by-token, lightweight Markdown renderer, rolling line buffer, never full-screen redraw.

2. A <pre><code> block showing a complete terminal output example for a debug turn:
   ❯ debug why payments are failing
   ┌ intent: debug (0.94) → local (qwen3-coder)
   │ ▸ Read src/payment/handler.ts (3 lines)
   │ ▸ Bash kubectl logs payment-svc --tail=50 (OOMKilled detected)
   │ Agent explanation text...
   │ ── fix ──
   │ coloured diff
   │ ✓ Fix applied (1 file written)
   └ 1.2s · 847 tokens · $0.00

3. <h3>Tool call rendering</h3> — table (Tool type, Display format) for: Read-only, Mutating-validated, Mutating-auto-accepted, Mutating-rejected.

4. <h3>Escalation notices</h3> — <pre><code> showing: ⇡ Escalating to claude-sonnet-4-6 (review) — ~1,200 tokens

5. <h3>Colour scheme</h3> — table (Element, Colour, ANSI) for: agent text, intent badge (cyan), tool names (dim), diff additions (green), diff deletions (red), warnings (yellow), errors (red bold), escalation (magenta), cost (dim).

6. Paragraph about TTY auto-detection, --color/--no-color, piped output strips ANSI.

7. A callout (class="callout warn") about --verbose/-v showing full tool inputs/outputs.`,
  },
  {
    id: 'oneshot',
    title: 'One-Shot Commands',
    prompt: `Write the One-Shot Commands section with two subsections:

<h3>insrc ask</h3>
- Paragraph: execute single turn and exit, auto-classified or --intent override.
- <pre><code> block with 5 usage examples.
- Flags table (Flag, Short, Description): --intent/-i, --claude/-c, --opus, --local/-l, --json/-j, --cwd, --auto-accept, --verbose/-v, --dry-run/-n, --file/-f (repeatable), --timeout.
- <h4>Exit codes</h4> table: 0=success, 1=error, 2=no API key, 3=daemon failed, 4=no LLM.
- <h4>JSON output format</h4> <pre><code> showing the JSON object with fields: intent, confidence, provider, model, message, diff, filesWritten, validated, escalated, tokens, cost, duration, error.

<h3>insrc plan</h3>
- Paragraph: generate plan, optionally execute. Shorthand for ask --intent plan.
- <pre><code> with 3 usage examples.
- Flags table: --execute, --claude, --json, --cwd.
- <h4>Plan execution flow</h4> — <pre><code> showing interactive step-by-step: plan generated, then "Execute step 1?" [Y/n/s/q] prompts between steps.`,
  },
  {
    id: 'graph',
    title: 'Graph CLI',
    prompt: `Write the Graph CLI section (insrc graph).

- Paragraph: run graph queries without LLM, fast, deterministic, free.
- <pre><code> block with usage examples: natural language queries, --cypher for raw Cypher, graph entity <name>.
- Flags table: --cypher, --depth (default 1, max 5), --json, --cwd.
- <h4>Output formats</h4> with two <pre><code> blocks:
  1. Tree format for caller/callee queries showing parseManifest with callers as indented tree
  2. Table format for Cypher queries showing Name, File columns
- Note that interpretive questions re-route to research with a notice.`,
  },
  {
    id: 'daemon',
    title: 'Daemon Management',
    prompt: `Write the Daemon Management section.

- <pre><code> showing subcommands: insrc daemon start|stop|status|logs
- <h4>Status output</h4> <pre><code> block showing: daemon running (pid, uptime), socket path, ollama health, graph stats, queue depth, memory.
- <h4>Auto-start behaviour</h4> paragraph: REPL and one-shot auto-start daemon as detached process, wait up to 5s for socket, exit code 3 on failure.
- Callout (class="callout info"): daemon is shared across CLI sessions and VS Code instances, persists after CLI exit, only insrc daemon stop terminates it.`,
  },
  {
    id: 'repo',
    title: 'Repository Management',
    prompt: `Write the Repository Management section.

- <pre><code> showing subcommands: insrc repo add|remove|list|status
- <h4>List output</h4> <pre><code> table showing repos with columns: Repo, Path, Entities, Status, Last indexed.
- <h4>Index progress</h4> <pre><code> showing: Registered repo, progress bar ████████░░ 67%, completion message with entity count and time.`,
  },
  {
    id: 'session',
    title: 'Session Management',
    prompt: `Write the Session Management section.

- Paragraph: sessions persist, each has unique ID, stores turns/summaries in daemon, can be resumed.
- <pre><code> showing subcommands: insrc session list|show|resume|delete
- <h4>List output</h4> <pre><code> table with columns: ID, Repo, Started, Turns, First message.
- <h3>Session resume</h3> <pre><code> showing resumed session with context restoration and the agent remembering previous conversation.
- Callout (class="callout warn"): cross-session seeding — new sessions seed L2 from prior summaries, resume provides full context restoration.`,
  },
  {
    id: 'config',
    title: 'Configuration',
    prompt: `Write the Configuration section.

- <pre><code> showing subcommands: insrc config show|set|edit with examples.
- <h4>Show output</h4> <pre><code> showing config with masked API keys.
- <h3>Configuration precedence</h3> table (Priority, Source, Scope): 1=CLI flags, 2=env vars, 3=config.json, 4=defaults.
- <h3>Environment variables</h3> table (Variable, Maps to): ANTHROPIC_API_KEY, OLLAMA_HOST, INSRC_MODEL, INSRC_PERMISSION_MODE, BRAVE_API_KEY.`,
  },
  {
    id: 'health',
    title: 'Health Check',
    prompt: `Write the Health Check section (insrc health).

- Paragraph: comprehensive system health check, useful for troubleshooting and CI pre-flight.
- <pre><code> showing normal output: table with Component, Status, Details columns for daemon, ollama, embedding model, anthropic API, brave search, graph, vector store, config. "✓ All systems operational" at end.
- <pre><code> showing --json output format.
- Paragraph: exit 0 if all healthy, 1 if any degraded/unavailable.`,
  },
  {
    id: 'permissions',
    title: 'Permission Model',
    prompt: `Write the Permission Model section.

<h3>Validate mode (default)</h3>
- All mutating tool calls validated by Claude/Haiku before execution.
- <pre><code> showing: ▸ Edit src/handler.ts → ⇡ Validating with claude-haiku-4-5... ✓ approved

<h3>Auto-accept mode</h3>
- Mutating calls execute immediately. Set per-session (/mode), per-invocation (--auto-accept), or globally (config set).

<h3>User confirmation prompts</h3>
- Table (Action, Prompt) for: @opus escalation, plan step execution, diff apply, destructive bash commands.`,
  },
  {
    id: 'pipes',
    title: 'Pipe and Script Integration',
    prompt: `Write the Pipe and Script Integration section.

<h3>Stdin pipe</h3>
- Paragraph: non-TTY stdin → one-shot mode, enables composing with other commands.
- <pre><code> with pipe examples: cat file | insrc ask "review", git diff | insrc ask "review" --intent review, git diff --cached | insrc ask "commit message" --json | jq, npm test 2>&1 | insrc ask "debug this".

<h3>Scripting patterns</h3>
- <pre><code> with patterns: CI quality check with jq, batch document with for loop, watch mode with fswatch.

Note: all log output goes to stderr, agent response to stdout, so piping works correctly.`,
  },
  {
    id: 'completion',
    title: 'Shell Completion',
    prompt: `Write the Shell Completion section (insrc completion bash|zsh|fish).

- <pre><code> showing install commands for bash (eval), zsh (> file), fish (| source).
- <h4>What gets completed</h4> table (Context, Completions) for: insrc <TAB>, insrc daemon <TAB>, insrc repo <TAB>, insrc ask --intent <TAB>, insrc session resume <TAB> (dynamic), insrc config set <TAB>.`,
  },
  {
    id: 'errors',
    title: 'Error Handling',
    prompt: `Write the Error Handling section.

<h3>Error display</h3>
- Paragraph: red prefix, concise message, actionable recovery hint.
- <pre><code> showing 5 error examples with → recovery hints: Ollama connection refused, model not found, daemon not running (auto-recovered), no API key, timeout.

<h3>Graceful degradation</h3>
- Table (Failure, Degraded behaviour) for: Ollama down → Claude fallback, no key → local-only, both down → exit 4, daemon down → auto-start, repo not indexed → no graph context.`,
  },
  {
    id: 'logging',
    title: 'Logging',
    prompt: `Write the Logging section.

<h3>Log levels</h3>
- Table (Level, Content, Destination) for: error (stderr always), warn (stderr always), info (stderr default), debug (stderr --verbose or DEBUG=insrc:*), trace (stderr DEBUG=insrc:trace).
- Paragraph: all to stderr so piping works.

<h3>Debug mode</h3>
- <pre><code> showing DEBUG namespace examples: DEBUG=insrc:* (all), DEBUG=insrc:tools, DEBUG=insrc:llm, DEBUG=insrc:context, DEBUG=insrc:trace (full).`,
  },
  {
    id: 'intents',
    title: 'Intent-Specific CLI Behaviour',
    prompt: `Write the Intent-Specific CLI Behaviour section.

Paragraph: each intent has distinct output formatting, core logic shared with VS Code extension, rendering differs.

Then for each intent, use <h3> and a <ul> list:
- implement/refactor: coloured diff, pipeline stage prefix, files written, --dry-run
- test: diff + test execution output + fix loop counter
- debug: tool timeline, stuck detection, fix diff, iteration summary
- review: structured sections (Security/Performance/Correctness/Style), severity badges [HIGH]/[MED]/[LOW], file:line refs
- research: streamed answer + source entities + web results
- plan: numbered step list + interactive execution prompts (Y/n/s/q)
- requirements/design: streamed markdown, two-stage progress, save prompt
- document: diff + apply prompt
- graph: instant tree/table, no LLM`,
  },
  {
    id: 'interfaces',
    title: 'Refined Interfaces',
    prompt: `Write the Refined Interfaces section with TypeScript interface definitions in <pre><code> blocks.

Include these interfaces (keep them concise):
1. CLIOptions — intent, provider, json, cwd, autoAccept, verbose, dryRun, files, timeout, execute, depth, cypher, color
2. ExitCodes — OK=0, ERROR=1, NO_API_KEY=2, DAEMON_FAILED=3, NO_LLM=4
3. ToolCall — id, name, args, result, status (validated/auto-accepted/rejected), isMutating
4. HealthReport — overall status + components map
5. GraphResult — type (tree/table), rows, root TreeNode, query, durationMs
6. Session — id, repo, started, turns, firstMessagePreview, l2Summary, permissionMode
7. StreamRendererOptions — color, maxWidth, json
8. InsrcConfig — ollama (host, model), anthropic (apiKey), brave, daemon (socketPath, autoStart), permissions (mode), repl (historyFile, maxHistory, prompt)`,
  },
  {
    id: 'risks',
    title: 'Risk Register',
    prompt: `Write the Risk Register section as a single table with columns: Risk, Severity, Likelihood, Mitigation.

Include these 10 risks:
1. Daemon socket not available within 5s — High/Medium — exponential backoff
2. Terminal resize breaks line buffer — Medium/Medium — handle SIGWINCH
3. @file: glob produces thousands of files — High/Low — cap at 50, warn
4. JSON-RPC frame corruption — Medium/Low — Content-Length framing
5. Readline history write race — Low/Low — append-only, fsync
6. --dry-run with streaming partial state — Medium/Medium — check flag early
7. Colour codes in --json output — High/Medium — gate on json flag
8. Y/n prompt in piped stdin — Medium/Medium — default to 'n', warn
9. Kuzu Cypher errors raw to user — Low/High — structured error wrapper
10. Large monorepo index blocks event loop — High/Medium — async via daemon`,
  },
  {
    id: 'filestructure',
    title: 'File Structure',
    prompt: `Write the File Structure section with a <pre><code> block showing the directory tree:

src/cli/
  index.ts            # Commander setup, command registration
  client.ts           # Unix socket JSON-RPC client
  commands/
    daemon.ts, repo.ts, session.ts, config.ts, ask.ts, plan.ts, graph.ts, health.ts, index-cmd.ts, completion.ts
  repl/
    index.ts          # REPL main loop
    readline.ts       # Readline setup: history, multi-line, key bindings
    commands.ts       # Slash command dispatch
    completer.ts      # Tab completion
  render/
    stream.ts         # Streaming Markdown renderer (5-state FSM)
    diff.ts           # Coloured unified diff formatter
    table.ts          # Table and tree formatters
    tool.ts           # Tool call summary renderer
    progress.ts       # Progress bars
    plan.ts           # Plan step list renderer
    color.ts          # ANSI helpers, TTY detection`,
  },
  {
    id: 'phases',
    title: 'Implementation Phases',
    prompt: `Write the Implementation Phases section using phase-grid (div class="phase-grid") with 4 phase-cards (div class="phase-card"):

Phase 1 — Core Scaffold: Commander program, daemon start/stop/status, repo add/remove/list, config show/set/edit, health, version, shell completion.

Phase 2 — One-Shot Mode: insrc ask with all flags, streaming output renderer, tool call display, diff formatting, JSON output, exit codes, stdin pipe detection.

Phase 3 — Interactive REPL: readline with history, multi-line input, all slash commands, tab completion, pre-flight checks + auto-recovery, session resume.

Phase 4 — Plan Execution + Graph CLI: insrc plan --execute interactive flow, plan step prompts, insrc graph tree/table output, Cypher support, session management commands, verbose mode, DEBUG namespaces.

Each card should have h4 with badge (span class="badge badge-phase") and a ul list of deliverables.`,
  },
  {
    id: 'comparison',
    title: 'CLI vs VS Code Extension',
    prompt: `Write the CLI vs VS Code Extension Comparison section.

A table with columns: Aspect, CLI, VS Code Extension. Rows:
- Input: readline + stdin pipe vs Webview input box + @file picker
- Output: Streaming ANSI text vs Webview HTML + native diff editor
- Diff review: Coloured text diff vs Native VS Code diff editor
- Plan tracking: Numbered list + step prompts vs Kanban board
- Graph results: ASCII tree / table vs Interactive tree view
- Annotations: Not supported (use @file: refs) vs CodeLens + inline comments
- Settings: insrc config + $EDITOR vs Webview settings form
- Session management: insrc session commands vs Navigation panel tree
- Daemon lifecycle: insrc daemon commands vs Auto-managed by extension
- Multi-repo: --cwd flag vs Repo selector in chat header
- Cost visibility: /cost command, turn footer vs Status bar + session panel
- Scriptable: Yes (exit codes, --json, pipes) vs No`,
  },
];

// ---------------------------------------------------------------------------
// Generate each section via the design pipeline (local sketch → Claude enhance)
// ---------------------------------------------------------------------------

const SYSTEM_SKETCH = `You are writing sections of an HTML design document. Output ONLY the HTML fragment for the requested section — no wrapping html/head/body tags, no CSS, no markdown. Use these HTML elements:
- <h2> for section title
- <h3>, <h4> for subsections
- <p> for paragraphs
- <pre><code> for code blocks and ASCII diagrams
- <table> with <thead>/<tbody> for tables
- <ul>/<li> for lists
- <div class="callout info|warn|ok"> for callout boxes
- <div class="phase-grid"> with <div class="phase-card"> for phase cards
- <span class="badge badge-phase|badge-ok|badge-warn|badge-err"> for badges
- <code> for inline code
- <strong> for bold
Output clean HTML only. No markdown. No explanation.`;

const SYSTEM_ENHANCE = `You are reviewing an HTML fragment for a design document section. Improve it:
1. Ensure all content from the requirements is present — nothing missing
2. Add concrete terminal output examples in <pre><code> blocks where appropriate
3. Ensure tables have proper <thead>/<tbody> structure
4. Ensure callout boxes use the correct class variants
5. Fix any HTML errors
Output ONLY the improved HTML fragment. No wrapping tags, no CSS, no explanation.`;

async function generateSection(section: Section, provider: LLMProvider, enhancer: LLMProvider | null): Promise<string> {
  // Stage 1: Local sketch
  const sketchMessages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_SKETCH },
    { role: 'user', content: section.prompt },
  ];

  const sketch = await provider.complete(sketchMessages, {
    maxTokens: 3000,
    temperature: 0.2,
  });

  if (!enhancer) return sketch.text;

  // Stage 2: Claude enhance
  const enhanceMessages: LLMMessage[] = [
    { role: 'system', content: SYSTEM_ENHANCE },
    {
      role: 'user',
      content: `Requirements:\n${section.prompt}\n\nHTML fragment to improve:\n${sketch.text}`,
    },
  ];

  const enhanced = await enhancer.complete(enhanceMessages, {
    maxTokens: 4000,
    temperature: 0.1,
  });

  return enhanced.text;
}

// ---------------------------------------------------------------------------
// Assemble final HTML
// ---------------------------------------------------------------------------

async function main() {
  console.log(`${CYAN}Generating CLI design document section by section...${RESET}`);
  console.log(`${DIM}  local: ${config.models.local}${RESET}`);
  console.log(`${DIM}  claude: ${claude ? config.models.tiers.standard : 'not available'}${RESET}`);
  console.log(`${DIM}  sections: ${sections.length}${RESET}\n`);

  const htmlParts: string[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i]!;
    process.stdout.write(`${DIM}  [${i + 1}/${sections.length}] ${section.title}...${RESET}`);
    const start = Date.now();

    try {
      const html = await generateSection(section, local, claude);
      htmlParts.push(`\n  <!-- ═══ ${section.title} ═══ -->\n  <section id="${section.id}">\n${html}\n  </section>\n`);
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      process.stdout.write(` ${GREEN}✓${RESET} ${DIM}(${elapsed}s)${RESET}\n`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      process.stdout.write(` \x1b[31m✗\x1b[0m ${msg}\n`);
      htmlParts.push(`\n  <!-- ═══ ${section.title} (FAILED) ═══ -->\n  <section id="${section.id}">\n  <h2>${section.title}</h2>\n  <p class="muted">Generation failed: ${msg}</p>\n  </section>\n`);
    }
  }

  // Assemble
  const finalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CLI Design Document</title>
  <style>
${css}
  </style>
</head>
<body>

  <h1>CLI Design Document</h1>
  <p class="meta">insrc command-line interface &mdash; v0.1 &mdash; March 2026</p>
${htmlParts.join('\n')}
</body>
</html>
`;

  const outPath = resolve('design/cli.html');
  writeFileSync(outPath, finalHtml, 'utf-8');
  console.log(`\n${GREEN}✓ Written to ${outPath}${RESET}`);
  console.log(`${DIM}  ${finalHtml.length} bytes, ${sections.length} sections${RESET}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
