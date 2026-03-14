#!/usr/bin/env tsx
/**
 * Smoke test for the brainstorm agent pipeline — a minimal end-to-end run
 * with scripted gate approvals.
 *
 * Uses a focused prompt that should produce a few ideas, cluster them,
 * promote to requirements, and assemble an HTML output.
 *
 * Run with: source ~/.insors && npx tsx scripts/test-brainstorm-smoke.ts
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
import { brainstormAgent } from '../src/agent/tasks/brainstorm/agent.js';
import type { BrainstormState } from '../src/agent/tasks/brainstorm/agent-state.js';
import type { BrainstormResult } from '../src/agent/tasks/brainstorm/types.js';
import { assembleDocument } from '../src/agent/tasks/brainstorm/assembly.js';
import { runAgent } from '../src/agent/framework/runner.js';
import type { AgentDefinition } from '../src/agent/framework/types.js';
import { TestChannel, type ScriptedReply } from '../src/agent/framework/test-channel.js';
import { writeFileSync } from 'node:fs';

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

section('Setup');

const config = loadConfig();
const ollama = new OllamaProvider();

const anthropicKey = process.env.ANTHROPIC_API_KEY ?? config.keys.anthropic;
if (!anthropicKey) {
  console.error(`${RED}No Anthropic key. Set ANTHROPIC_API_KEY.${RESET}`);
  process.exit(1);
}

// Use Haiku for all steps (fast)
const haikuModel = config.models.tiers.fast; // claude-haiku-4-5
const haiku = new ClaudeProvider({ model: haikuModel, apiKey: anthropicKey });
ok(`Haiku provider ready (${haikuModel})`);

// Resolver that returns Haiku for everything
const resolver = new ProviderResolver(config, ollama, haiku);
// Override resolve to always return Haiku
const alwaysHaiku = (_agent: string, _step: string) => haiku;
ok(`All steps will use Haiku`);

// ---------------------------------------------------------------------------
// Brainstorm prompt
// ---------------------------------------------------------------------------

const BRAINSTORM_PROMPT = `Brainstorm ideas for improving error handling in the indexer. The current approach catches errors silently and loses context.`;

section('Running brainstorm (smoke)');

// Scripted replies: approve all gates for a single-round run
// Flow: seed → validate-seed(approve) → diverge → react(converge) →
//       converge → validate-convergence(approve) → update-spec →
//       review-spec(approve/finalize) → finalize
const replies: ScriptedReply[] = [
  { action: 'approve' },     // validate-seed: approve all seed ideas
  { action: 'converge' },    // react: go straight to converge
  { action: 'approve' },     // validate-convergence: approve promotions
  { action: 'approve' },     // review-spec: finalize
  // Extra approvals in case of additional gates
  ...Array.from({ length: 10 }, () => ({ action: 'approve' })),
];
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
let finalState: BrainstormState | null = null;

try {
  const runResult = await runAgent({
    definition: brainstormAgent as unknown as AgentDefinition,
    channel,
    options: {
      input: {
        message: BRAINSTORM_PROMPT,
        codeContext: '',
        session: { repoPath: process.cwd(), closureRepos: [process.cwd()] },
      },
      repo: process.cwd(),
    },
    config,
    providers: {
      local: haiku,
      claude: haiku,
      resolve: alwaysHaiku,
      resolveOrNull: alwaysHaiku,
    },
  });

  finalState = runResult.result as BrainstormState;
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

const result: BrainstormResult = assembleDocument(finalState);

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  condition ? (passed++, ok(label)) : (failed++, fail(label));
  if (detail) console.log(`${DIM}  → ${detail}${RESET}`);
}

check('Final state present', !!finalState);
check('Result kind is "brainstorm-spec"', result.kind === 'brainstorm-spec');
check('Output is non-empty', result.output.length > 100, `${result.output.length} chars`);
check('Ideas array has items', result.ideas.length > 0, `count: ${result.ideas.length}`);
check('At least one theme', result.themes.length > 0, `count: ${result.themes.length}`);
check('At least one requirement', result.requirements.length > 0, `count: ${result.requirements.length}`);
check('Stats.rounds >= 1', result.stats.rounds >= 1, `rounds: ${result.stats.rounds}`);
check('Summary present', result.summary.length > 0);
check('HTML output valid', /<!doctype html>|<html/i.test(result.output));
check('Done message sent', !!channel.getDone());
check('Checkpoints written', channel.getCheckpoints().length > 0);

// Write output
const outPath = new URL('../design/brainstorm-smoke.html', import.meta.url).pathname;
writeFileSync(outPath, result.output, 'utf-8');
ok(`Output written to ${outPath}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

section('Summary');
console.log(`${GREEN}Passed: ${passed}${RESET}  ${failed > 0 ? `${RED}Failed: ${failed}${RESET}` : `${DIM}Failed: 0${RESET}`}`);
console.log(`${DIM}Time: ${elapsed}s${RESET}\n`);

process.exit(failed > 0 ? 1 : 0);
