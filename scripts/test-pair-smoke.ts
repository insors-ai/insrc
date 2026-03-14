#!/usr/bin/env tsx
/**
 * Live smoke test for the Pair coding agent.
 *
 * Copies target files into a temp directory so the real codebase is never
 * modified, then runs the pair agent in implement mode with a simple prompt,
 * auto-approves the first proposal via TestChannel, and validates the
 * resulting state.
 *
 * Run with: source ~/.insors && npx tsx scripts/test-pair-smoke.ts
 */

const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';

function section(title: string) {
  console.log(`\n${CYAN}━━━ ${title} ━━━${RESET}`);
}

function ok(msg: string)   { console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { console.log(`${RED}✗${RESET} ${msg}`); }

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { ClaudeProvider } from '../src/agent/providers/claude.js';
import { loadConfig, ProviderResolver } from '../src/agent/config.js';
import { pairAgent } from '../src/agent/tasks/pair/agent.js';
import type { PairState } from '../src/agent/tasks/pair/agent-state.js';
import type { PairInput } from '../src/agent/tasks/pair/types.js';
import { runAgent } from '../src/agent/framework/runner.js';
import type { AgentDefinition } from '../src/agent/framework/types.js';
import { TestChannel, type ScriptedReply } from '../src/agent/framework/test-channel.js';
import type { AgentConfig } from '../src/shared/types.js';

// ---------------------------------------------------------------------------
// Temp sandbox — copy target files so the real codebase is untouched
// ---------------------------------------------------------------------------

const SANDBOX = mkdtempSync(join(tmpdir(), 'insrc-pair-smoke-'));

// Mirror the directory structure the agent expects
cpSync(
  join(process.cwd(), 'src/agent/session.ts'),
  join(SANDBOX, 'src/agent/session.ts'),
);
// Copy shared types so the agent can read imports if it follows them
cpSync(
  join(process.cwd(), 'src/shared'),
  join(SANDBOX, 'src/shared'),
  { recursive: true },
);

function cleanup() {
  try { rmSync(SANDBOX, { recursive: true, force: true }); } catch { /* ignore */ }
}
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(130); });

// ---------------------------------------------------------------------------
// Config override — route all pair steps to Claude Haiku
// ---------------------------------------------------------------------------

const baseConfig = loadConfig();

const config: AgentConfig = {
  ...baseConfig,
  models: {
    ...baseConfig.models,
    agents: {
      ...baseConfig.models.agents,
      pair: {
        'check-context': 'fast',
        'analyze':       'fast',
        'propose':       'fast',
        'review-gate':   'fast',
        'apply':         'fast',
        'validate':      'fast',
        'summarize':     'fast',
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

section('Setup');

const ollama = new OllamaProvider();

if (!(await ollama.ping())) {
  console.error(`${RED}Ollama not running. Start with: ollama serve${RESET}`);
  process.exit(1);
}
ok('Ollama reachable');

const anthropicKey = process.env['ANTHROPIC_API_KEY'] ?? config.keys.anthropic;
if (!anthropicKey) {
  console.error(`${RED}No ANTHROPIC_API_KEY — required for pair agent test${RESET}`);
  process.exit(1);
}

const claudeProvider = new ClaudeProvider({ apiKey: anthropicKey });
ok('Claude provider ready');

const resolver = new ProviderResolver(config, ollama, claudeProvider);
ok('ProviderResolver created — all pair steps → Claude Haiku');

console.log(`${DIM}Sandbox: ${SANDBOX}${RESET}`);

// ---------------------------------------------------------------------------
// Build pair input
// ---------------------------------------------------------------------------

const pairInput: PairInput = {
  message: 'Add a toString() method to the Session class that returns a summary string with the repo path and session status.',
  codeContext: `File: src/agent/session.ts
The Session class manages agent session state including repoPath, config, providers, and health monitoring.`,
  mode: 'implement',
  session: {
    repoPath: SANDBOX,
    closureRepos: [SANDBOX],
  },
};

// ---------------------------------------------------------------------------
// Run pair agent
// ---------------------------------------------------------------------------

section('Running pair agent (implement mode)');

// Script: approve first proposal, then done
const replies: ScriptedReply[] = [
  { action: 'approve' },   // review-gate: approve proposal
  { action: 'done' },      // review-gate: done after apply+validate
  // Extra in case of re-proposals
  { action: 'approve' },
  { action: 'done' },
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
let finalState: PairState | null = null;

try {
  const runResult = await runAgent({
    definition: pairAgent as unknown as AgentDefinition,
    channel,
    options: { input: pairInput, repo: SANDBOX },
    config,
    providers: {
      local: ollama,
      claude: claudeProvider,
      resolve: resolver.resolve.bind(resolver),
      resolveOrNull: resolver.resolveOrNull.bind(resolver),
    },
  });

  finalState = runResult.result as PairState;
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

let passed = 0;
let failed = 0;

function check(label: string, condition: boolean, detail?: string) {
  condition ? (passed++, ok(label)) : (failed++, fail(label));
  if (detail) console.log(`${DIM}  → ${detail}${RESET}`);
}

check('Final state present', !!finalState);
check('Mode is implement', finalState?.mode === 'implement');
check('Input preserved', !!finalState?.input?.message);
check('Files in scope populated', (finalState?.filesInScope?.length ?? 0) > 0,
  `${finalState?.filesInScope?.length ?? 0} files`);
check('Changes applied', (finalState?.changesApplied?.length ?? 0) > 0,
  `${finalState?.changesApplied?.length ?? 0} diffs applied`);
check('Conversation summary present', (finalState?.conversationSummary?.length ?? 0) > 0);
check('Investigation summary present', (finalState?.investigationSummary?.length ?? 0) > 0);
check('Iteration count > 0', (finalState?.iterationCount ?? 0) > 0,
  `${finalState?.iterationCount ?? 0} iterations`);

// Channel checks
check('Done message sent', !!channel.getDone());
check('No error messages', !channel.getError());
check('Gates were triggered', channel.getGates().length > 0,
  `${channel.getGates().length} gates`);
check('Checkpoints written', channel.getCheckpoints().length > 0,
  `${channel.getCheckpoints().length} checkpoints`);

// Verify no changes to real codebase
check('Real codebase untouched', !finalState?.changesApplied?.some(
  c => c.file.startsWith(process.cwd()),
), 'all changes in sandbox');

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------

if (finalState?.changesApplied && finalState.changesApplied.length > 0) {
  section('Changes Applied (in sandbox)');
  for (const change of finalState.changesApplied) {
    console.log(`  ${YELLOW}${change.file}${RESET}`);
  }
}

if (finalState?.conversationSummary) {
  section('Session Summary');
  console.log(`${DIM}${finalState.conversationSummary}${RESET}`);
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

section('Summary');
console.log(`${GREEN}Passed: ${passed}${RESET}  ${failed > 0 ? `${RED}Failed: ${failed}${RESET}` : `${DIM}Failed: 0${RESET}`}`);
console.log(`${DIM}Time: ${elapsed}s${RESET}`);
console.log(`${DIM}Sandbox cleaned up: ${SANDBOX}${RESET}\n`);

process.exit(failed > 0 ? 1 : 0);
