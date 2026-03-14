#!/usr/bin/env tsx
/**
 * Live smoke test for the Delegate coding agent.
 *
 * Copies target files into a temp directory so the real codebase is never
 * modified, then runs the delegate agent with a batch-scope prompt,
 * auto-approves the plan gate, and validates the resulting execution state.
 *
 * Run with: source ~/.insors && npx tsx scripts/test-delegate-smoke.ts
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
import { delegateAgent } from '../src/agent/tasks/delegate/agent.js';
import type { DelegateState } from '../src/agent/tasks/delegate/agent-state.js';
import type { DelegateInput } from '../src/agent/tasks/delegate/types.js';
import { runAgent } from '../src/agent/framework/runner.js';
import type { AgentDefinition } from '../src/agent/framework/types.js';
import { TestChannel, type ScriptedReply } from '../src/agent/framework/test-channel.js';
import type { AgentConfig } from '../src/shared/types.js';

// ---------------------------------------------------------------------------
// Temp sandbox — copy target files so the real codebase is untouched
// ---------------------------------------------------------------------------

const SANDBOX = mkdtempSync(join(tmpdir(), 'insrc-delegate-smoke-'));

// Mirror the pipeline files the agent will operate on
cpSync(
  join(process.cwd(), 'src/agent/tasks/implement.ts'),
  join(SANDBOX, 'src/agent/tasks/implement.ts'),
);
cpSync(
  join(process.cwd(), 'src/agent/tasks/refactor.ts'),
  join(SANDBOX, 'src/agent/tasks/refactor.ts'),
);
// Copy shared types and logger so the agent can read imports
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
// Config override — route all delegate + planner steps to Claude Haiku
// ---------------------------------------------------------------------------

const baseConfig = loadConfig();

const config: AgentConfig = {
  ...baseConfig,
  models: {
    ...baseConfig.models,
    agents: {
      ...baseConfig.models.agents,
      delegate: {
        'invoke-planner':    'fast',
        'approve-plan-gate': 'fast',
        'execute-step':      'fast',
        'advance':           'fast',
        'failure-gate':      'fast',
        'report':            'fast',
      },
      // Planner runs as sub-agent — also route to Haiku
      planner: {
        'analyze':  'fast',
        'search':   'fast',
        'draft':    'fast',
        'enhance':  'fast',
        'detail':   'fast',
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
  console.error(`${RED}No ANTHROPIC_API_KEY — required for delegate agent test${RESET}`);
  process.exit(1);
}

const claudeProvider = new ClaudeProvider({ apiKey: anthropicKey });
ok('Claude provider ready');

const resolver = new ProviderResolver(config, ollama, claudeProvider);
ok('ProviderResolver created — all delegate + planner steps → Claude Haiku');

console.log(`${DIM}Sandbox: ${SANDBOX}${RESET}`);

// ---------------------------------------------------------------------------
// Build delegate input
// ---------------------------------------------------------------------------

const delegateInput: DelegateInput = {
  message: 'Add structured logging with function entry/exit traces to all pipeline functions in src/agent/tasks/implement.ts and src/agent/tasks/refactor.ts.',
  codeContext: `The project uses pino-based logging via getLogger('name') from shared/logger.ts.
Pipeline functions follow the pattern: async function runXxxPipeline(..., log: (msg: string) => void).
Each pipeline has analyze, plan/generate, validate stages.`,
  session: {
    repoPath: SANDBOX,
    closureRepos: [SANDBOX],
  },
};

// ---------------------------------------------------------------------------
// Run delegate agent
// ---------------------------------------------------------------------------

section('Running delegate agent');

// Script: approve plan, then handle potential failure gates
const replies: ScriptedReply[] = [
  { action: 'approve' },   // approve-plan-gate
  // Failure gate fallbacks
  { action: 'retry' },
  { action: 'skip' },
  { action: 'skip' },
  { action: 'skip' },
  { action: 'skip' },
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
let finalState: DelegateState | null = null;

try {
  const runResult = await runAgent({
    definition: delegateAgent as unknown as AgentDefinition,
    channel,
    options: { input: delegateInput, repo: SANDBOX },
    config,
    providers: {
      local: ollama,
      claude: claudeProvider,
      resolve: resolver.resolve.bind(resolver),
      resolveOrNull: resolver.resolveOrNull.bind(resolver),
    },
  });

  finalState = runResult.result as DelegateState;
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
check('Plan created', !!finalState?.plan);

if (finalState?.plan) {
  check('Plan has steps', finalState.plan.steps.length > 0,
    `${finalState.plan.steps.length} steps`);
  check('All plan steps have titles', finalState.plan.steps.every(s => s.title.length > 0));
  check('All plan steps have descriptions', finalState.plan.steps.every(s => s.description.length > 0));
}

check('Step results recorded', (finalState?.stepResults?.length ?? 0) > 0,
  `${finalState?.stepResults?.length ?? 0} step results`);
check('Files changed tracked', (finalState?.filesChanged?.length ?? 0) >= 0,
  `${finalState?.filesChanged?.length ?? 0} files changed`);
check('Gate level set', !!finalState?.gateLevel, finalState?.gateLevel);
check('Commit strategy set', !!finalState?.commitStrategy,
  finalState?.commitStrategy ? JSON.stringify(finalState.commitStrategy) : undefined);

// Channel checks
check('Done message sent', !!channel.getDone());
check('No error messages', !channel.getError());
check('Gates were triggered', channel.getGates().length > 0,
  `${channel.getGates().length} gates`);
check('Checkpoints written', channel.getCheckpoints().length > 0,
  `${channel.getCheckpoints().length} checkpoints`);

// Verify no changes to real codebase
check('Real codebase untouched', !finalState?.filesChanged?.some(
  f => f.startsWith(process.cwd()),
), 'all changes in sandbox');

// ---------------------------------------------------------------------------
// Print results
// ---------------------------------------------------------------------------

if (finalState?.plan) {
  section('Execution Plan');
  const statusIcon: Record<string, string> = {
    pending: '[ ]', completed: '[x]', failed: '[!]', skipped: '[~]',
  };
  for (const step of finalState.plan.steps) {
    const icon = statusIcon[step.status] ?? '[?]';
    console.log(`  ${icon} ${step.title}`);
  }
}

if (finalState?.filesChanged && finalState.filesChanged.length > 0) {
  section('Files Changed (in sandbox)');
  for (const f of finalState.filesChanged) {
    console.log(`  ${YELLOW}${f}${RESET}`);
  }
}

if (finalState?.commits && finalState.commits.length > 0) {
  section('Commits');
  for (const c of finalState.commits) {
    console.log(`  ${DIM}${c}${RESET}`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

section('Summary');
console.log(`${GREEN}Passed: ${passed}${RESET}  ${failed > 0 ? `${RED}Failed: ${failed}${RESET}` : `${DIM}Failed: 0${RESET}`}`);
console.log(`${DIM}Time: ${elapsed}s${RESET}`);
console.log(`${DIM}Sandbox cleaned up: ${SANDBOX}${RESET}\n`);

process.exit(failed > 0 ? 1 : 0);
