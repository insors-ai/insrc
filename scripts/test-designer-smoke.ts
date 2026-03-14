#!/usr/bin/env tsx
/**
 * Smoke test for the designer agent pipeline — a minimal end-to-end run
 * that works on CPU without long timeouts.
 *
 * Uses a deliberately small, focused prompt that should produce 2-3
 * requirements so the full loop (extract → parse → sketch → detail →
 * assemble) completes in a reasonable time.
 *
 * Run with: npx tsx scripts/test-designer-smoke.ts
 */

const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';
const YELLOW = '\x1b[33m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

function section(title: string) {
  console.log(`\n${CYAN}━━━ ${title} ━━━${RESET}`);
}

function ok(msg: string)   { console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { console.log(`${RED}✗${RESET} ${msg}`); }
function warn(msg: string) { console.log(`${YELLOW}⚠${RESET} ${msg}`); }

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { ClaudeProvider } from '../src/agent/providers/claude.js';
import { loadConfig, ProviderResolver } from '../src/agent/config.js';
import { resolveTemplate } from '../src/agent/tasks/designer/index.js';
import { designerAgent } from '../src/agent/tasks/designer/agent.js';
import type { DesignerState } from '../src/agent/tasks/designer/agent-state.js';
import type { DesignerResult } from '../src/agent/tasks/designer/types.js';
import { runAgent } from '../src/agent/framework/runner.js';
import type { AgentDefinition } from '../src/agent/framework/types.js';
import { TestChannel, type ScriptedReply } from '../src/agent/framework/test-channel.js';
import { assembleDocument } from '../src/agent/tasks/designer/assembly.js';
import { writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

section('Setup');

const config = loadConfig();
const ollama = new OllamaProvider();

if (!(await ollama.ping())) {
  console.error(`${RED}Ollama not running. Start with: ollama serve${RESET}`);
  process.exit(1);
}
ok('Ollama reachable');

let claudeProvider: InstanceType<typeof ClaudeProvider> | OllamaProvider;
const anthropicKey = process.env.ANTHROPIC_API_KEY ?? config.keys.anthropic;

if (anthropicKey) {
  claudeProvider = new ClaudeProvider({ apiKey: anthropicKey });
  ok('Claude provider ready');
} else {
  warn('No Anthropic key — using Ollama for Claude role too');
  claudeProvider = new OllamaProvider();
}

const resolver = new ProviderResolver(config, ollama, anthropicKey ? claudeProvider as ClaudeProvider : null);
ok(`ProviderResolver created (agents config: ${config.models.agents ? 'present' : 'none'})`);

// ---------------------------------------------------------------------------
// Small design prompt — should yield 2-3 requirements
// ---------------------------------------------------------------------------

const DESIGN_PROMPT = `Design a parseDate utility function.

It should parse a date string in ISO 8601 format and return a Date object, or throw if the string is invalid.`;

const template = resolveTemplate({ format: 'html' });

section('Running designer (smoke)');

const replies: ScriptedReply[] = Array.from({ length: 20 }, () => ({ action: 'approve' }));
const channel = new TestChannel(replies);

// Log progress
const origSend = channel.send.bind(channel);
channel.send = (msg) => {
  origSend(msg);
  if (msg.kind === 'progress') {
    console.log(`${DIM}${(msg.payload as { message: string }).message}${RESET}`);
  } else if (msg.kind === 'checkpoint') {
    console.log(`${DIM}  checkpoint: ${(msg.payload as { label: string }).label}${RESET}`);
  }
};

const startTime = Date.now();
let finalState: DesignerState | null = null;

try {
  const runResult = await runAgent({
    definition: designerAgent as unknown as AgentDefinition,
    channel,
    options: {
      input: {
        message: DESIGN_PROMPT,
        codeContext: '',
        template,
        intent: 'design' as const,
        session: { repoPath: process.cwd(), closureRepos: [process.cwd()] },
      },
      repo: process.cwd(),
    },
    config,
    providers: {
      local: ollama,
      claude: claudeProvider,
      resolve: resolver.resolve.bind(resolver),
      resolveOrNull: resolver.resolveOrNull.bind(resolver),
    },
  });

  finalState = runResult.result as DesignerState;
  ok(`Agent completed in ${runResult.steps} steps (runId: ${runResult.runId})`);
} catch (err) {
  console.error(`\n${RED}Agent error:${RESET}`, err);
  process.exit(1);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

// ---------------------------------------------------------------------------
// Validate
// ---------------------------------------------------------------------------

section('Validation');

const result: DesignerResult = assembleDocument(template, 'parseDate Utility Design', finalState.todos);

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  condition ? (passed++, ok(label)) : (failed++, fail(label));
  if (detail) console.log(`${DIM}  → ${detail}${RESET}`);
}

check('Final state present', !!finalState);
check('Result kind is "document"', result.kind === 'document');
check('Output is non-empty', result.output.length > 100, `${result.output.length} chars`);
check('Requirements parsed', result.requirements.length > 0, `count: ${result.requirements.length}`);
check('At least one completed', result.requirements.filter(r => r.state === 'done').length > 0);
check('Sketches produced', result.sketches.length > 0, `count: ${result.sketches.length}`);
check('Has new entities', result.structured.newEntities.length > 0, `count: ${result.structured.newEntities.length}`);
check('Summary present', result.summary.length > 0);
check('HTML output valid', /<!doctype html>|<html/i.test(result.output));
check('Done message sent', !!channel.getDone());
check('Checkpoints written', channel.getCheckpoints().length > 0);

// Write output
const outPath = new URL('../design/parsedate-smoke.html', import.meta.url).pathname;
writeFileSync(outPath, result.output, 'utf-8');
ok(`Output written to ${outPath}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

section('Summary');
console.log(`${GREEN}Passed: ${passed}${RESET}  ${failed > 0 ? `${RED}Failed: ${failed}${RESET}` : `${DIM}Failed: 0${RESET}`}`);
console.log(`${DIM}Time: ${elapsed}s${RESET}\n`);

process.exit(failed > 0 ? 1 : 0);
