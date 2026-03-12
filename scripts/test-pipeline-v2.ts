#!/usr/bin/env tsx
/**
 * Test the pipeline V2 framework by generating the CLI design document.
 *
 * Uses the same requirements as gen-cli-design.ts but routes them through
 * the 4-stage pipeline: Analyze → Plan → Execute → Assemble.
 *
 * The pipeline should:
 *   1. Analyze the requirements and determine scope/format
 *   2. Plan execution steps (should roughly match our 22 sections)
 *   3. Execute each step (local sketch + Claude enhance)
 *   4. Assemble into final HTML
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadConfig } from '../src/agent/config.js';
import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { ClaudeProvider } from '../src/agent/providers/claude.js';
import { runPipeline, shimLogger } from '../src/agent/pipeline/index.js';
import { createDaemonContextProvider } from '../src/agent/pipeline/context-provider.js';
import type { PipelineConfig, PipelineRunOpts } from '../src/agent/pipeline/types.js';

const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const config = loadConfig();
const local = new OllamaProvider(config.models.local, config.ollama.host, config.models.context.local);
const claude = config.keys.anthropic
  ? new ClaudeProvider({ model: config.models.tiers.standard, apiKey: config.keys.anthropic })
  : null;

const contextProvider = createDaemonContextProvider();
const quick = process.argv.includes('--quick');

// ---------------------------------------------------------------------------
// Reference material — same as gen-cli-design.ts
// ---------------------------------------------------------------------------

const vscodeRef = readFileSync(resolve('design/vscode-plugin.html'), 'utf-8');

// Extract CSS from the vscode reference (reuse verbatim)
const cssMatch = vscodeRef.match(/<style>([\s\S]*?)<\/style>/);
const css = cssMatch?.[1] ?? '';

// ---------------------------------------------------------------------------
// Pipeline config — design pipeline producing HTML sections
// ---------------------------------------------------------------------------

const designPipelineConfig: PipelineConfig = {
  type: 'design',

  analyzePrompt: `You are an input analyzer for a design document generator. Given a user request to create a design document, extract structured information.

Output a JSON object with these fields:
- "requirements": array of specific sections/topics to cover (numbered, actionable)
- "referencedEntities": array of file paths, function names, class names, or CLI commands mentioned
- "outputFormat": "html"
- "scope": "large" (design documents are always large)
- "summary": a condensed 2-3 paragraph summary of what the design document should cover

Output ONLY the JSON object, no other text.`,

  planPrompt: `You are planning the sections of an HTML design document. Given the analysis of what needs to be documented, produce a list of independent sections.

Each section should:
- Be self-contained — produce one complete HTML section
- Have a clear, focused scope (one topic area)
- Include a specific prompt describing exactly what HTML content to produce

Output a JSON array of steps:
[
  {
    "title": "Section Title",
    "prompt": "detailed prompt for what this section should contain",
    "requirementIndices": [0, 1],
    "needsEnhance": true
  }
]

Rules:
- One step per major section of the design document
- Each step produces an HTML fragment (h2 + content, no html/head/body wrapping)
- Steps should be independent — no cross-section references needed
- Set needsEnhance=true for all sections (Claude improves HTML quality)
- Order sections logically (overview first, implementation phases last)

Output ONLY the JSON array, no other text.`,

  sketchPrompt: `You are writing sections of an HTML design document. Output ONLY the HTML fragment for the requested section — no wrapping html/head/body tags, no CSS, no markdown. Use these HTML elements:
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
Output clean HTML only. No markdown. No explanation.`,

  enhancePrompt: `You are reviewing an HTML fragment for a design document section. Improve it:
1. Ensure all content from the requirements is present — nothing missing
2. Add concrete terminal output examples in <pre><code> blocks where appropriate
3. Ensure tables have proper <thead>/<tbody> structure
4. Ensure callout boxes use the correct class variants
5. Fix any HTML errors
Output ONLY the improved HTML fragment. No wrapping tags, no CSS, no explanation.`,

  assemblyStrategy: 'concatenate',

  buildTemplate: () => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>CLI Design Document (Pipeline V2)</title>
  <style>
${css}
  </style>
</head>
<body>

  <h1>CLI Design Document</h1>
  <p class="meta">insrc command-line interface &mdash; v0.1 &mdash; generated by pipeline V2 &mdash; March 2026</p>

{{content}}

</body>
</html>`,
};

// ---------------------------------------------------------------------------
// User prompt — short, natural, with attachment
//
// This simulates what a real user would type. The analyze stage is responsible
// for reading the attached reference document, understanding its structure,
// and generating the element decomposition.
// ---------------------------------------------------------------------------

const userMessage = `Create a design document for the insrc CLI — the terminal interface for the insrc AI coding agent. Use the attached VS Code plugin design as a reference for structure, depth, and visual style. The CLI has two modes: interactive REPL and one-shot commands, both connecting to the same daemon backend.`;

// The reference document is passed as priorContext (simulating an attachment)
const referenceDoc = vscodeRef;

// ---------------------------------------------------------------------------
// Run the pipeline
// ---------------------------------------------------------------------------

async function main() {
  console.log(`${CYAN}Testing Pipeline V2 — CLI Design Document${RESET}`);
  console.log(`${DIM}  local: ${config.models.local}${RESET}`);
  console.log(`${DIM}  claude: ${claude ? config.models.tiers.standard : 'not available'}${RESET}`);
  console.log(`${DIM}  context: ${config.models.context.local} tokens local, ${config.models.context.claude} tokens claude${RESET}\n`);

  const logger = shimLogger((msg) => console.log(msg));

  const opts: PipelineRunOpts = {
    userMessage,
    codeContext: '', // pipeline will fetch from graph via contextProvider
    priorContext: referenceDoc, // attached reference document
    repoPath: resolve('.'),
    localProvider: local,
    claudeProvider: claude,
    contextConfig: config.models.context,
    contextProvider,
    onEvent: logger,
  };

  const start = Date.now();
  const result = await runPipeline(designPipelineConfig, opts);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  // Write output
  const outPath = resolve('design/cli-v2.html');
  writeFileSync(outPath, result.output, 'utf-8');

  console.log(`\n${GREEN}✓ Pipeline V2 complete${RESET}`);
  console.log(`${DIM}  output: ${outPath}${RESET}`);
  console.log(`${DIM}  size: ${(result.output.length / 1024).toFixed(0)}KB${RESET}`);
  console.log(`${DIM}  steps: ${result.steps.length} (${result.steps.filter(s => s.enhanced).length} enhanced)${RESET}`);
  console.log(`${DIM}  duration: ${elapsed}s${RESET}`);
  console.log(`${DIM}  format: ${result.format}${RESET}`);

  if (result.warnings.length > 0) {
    console.log(`\n\x1b[33mWarnings:${RESET}`);
    for (const w of result.warnings) {
      console.log(`  ${w}`);
    }
  }

  // Step summary
  console.log(`\n${DIM}Step summary:${RESET}`);
  for (const step of result.steps) {
    const status = step.error ? `\x1b[31m✗ ${step.error}\x1b[0m` : `${GREEN}✓${RESET}`;
    const enhanced = step.enhanced ? ' [enhanced]' : '';
    console.log(`  ${step.index + 1}. ${step.title} — ${status}${enhanced} (${(step.durationMs / 1000).toFixed(1)}s)`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
