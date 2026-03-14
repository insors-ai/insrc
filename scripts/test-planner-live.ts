#!/usr/bin/env tsx
/**
 * Live test for the planner agent — generates an implementation plan
 * for the parseDate utility from design/parsedate-smoke.html.
 *
 * Uses Claude Haiku for all LLM steps via ProviderResolver config.
 *
 * Run with: source ~/.insors && npx tsx scripts/test-planner-live.ts
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
function warn(msg: string) { console.log(`${YELLOW}⚠${RESET} ${msg}`); }

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { ClaudeProvider } from '../src/agent/providers/claude.js';
import { loadConfig, ProviderResolver } from '../src/agent/config.js';
import { plannerAgent } from '../src/agent/planner/agent.js';
import type { PlannerState, PlannerInput } from '../src/agent/planner/agent-state.js';
import type { ImplementationPlan } from '../src/agent/planner/types.js';
import { toMarkdown } from '../src/agent/planner/index.js';
import { runAgent } from '../src/agent/framework/runner.js';
import type { AgentDefinition } from '../src/agent/framework/types.js';
import { TestChannel, type ScriptedReply } from '../src/agent/framework/test-channel.js';
import type { AgentConfig } from '../src/shared/types.js';

// ---------------------------------------------------------------------------
// Config override — route all planner steps to Claude Haiku
// ---------------------------------------------------------------------------

const baseConfig = loadConfig();

const config: AgentConfig = {
  ...baseConfig,
  models: {
    ...baseConfig.models,
    agents: {
      ...baseConfig.models.agents,
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
  console.error(`${RED}No ANTHROPIC_API_KEY — required for Claude Haiku test${RESET}`);
  process.exit(1);
}

const claudeProvider = new ClaudeProvider({ apiKey: anthropicKey });
ok('Claude provider ready');

const resolver = new ProviderResolver(config, ollama, claudeProvider);
ok('ProviderResolver created — all planner steps → Claude Haiku');

// ---------------------------------------------------------------------------
// Read design doc for context
// ---------------------------------------------------------------------------

const designPath = resolve(import.meta.dirname ?? '.', '../design/parsedate-smoke.html');
let designContent: string;
try {
  const rawHtml = readFileSync(designPath, 'utf-8');
  // Strip HTML tags and collapse whitespace for a text summary
  designContent = rawHtml
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000); // Cap at ~4K chars to stay within context budget
  ok(`Design doc loaded (${designContent.length} chars text)`);
} catch {
  warn('Could not read design/parsedate-smoke.html — running without design context');
  designContent = '';
}

// ---------------------------------------------------------------------------
// Build planner input
// ---------------------------------------------------------------------------

const PLAN_PROMPT = `Create an implementation plan for the parseDate utility function based on the design document.

The function should:
- Parse ISO 8601 date strings and return a Date object
- Throw on invalid input
- Support common variants (date-only, datetime, with/without timezone)
- Be exported from a utility module
- Include comprehensive tests

Design context:
${designContent}`;

const plannerInput: PlannerInput = {
  message: PLAN_PROMPT,
  codeContext: '',
  planType: 'implementation',
  session: {
    repoPath: process.cwd(),
    closureRepos: [process.cwd()],
  },
};

// ---------------------------------------------------------------------------
// Run planner agent
// ---------------------------------------------------------------------------

section('Running planner agent');

// Auto-approve all gates
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
let finalState: PlannerState | null = null;

try {
  const runResult = await runAgent({
    definition: plannerAgent as unknown as AgentDefinition,
    channel,
    options: { input: plannerInput, repo: process.cwd() },
    config,
    providers: {
      local: ollama,
      claude: claudeProvider,
      resolve: resolver.resolve.bind(resolver),
      resolveOrNull: resolver.resolveOrNull.bind(resolver),
    },
  });

  finalState = runResult.result as PlannerState;
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

const plan = finalState?.plan as ImplementationPlan | null;

if (plan) {
  check('Plan has title', !!plan.title, plan.title);
  check('Plan has steps', plan.steps.length > 0, `${plan.steps.length} steps`);
  check('All steps have titles', plan.steps.every(s => s.title.length > 0));
  check('All steps have descriptions', plan.steps.every(s => s.description.length > 0));
  check('Steps have IDs', plan.steps.every(s => s.id.length > 0));
  check('Plan status is active', plan.status === 'active');

  // Check dependencies are valid (reference existing step IDs)
  const stepIds = new Set(plan.steps.map(s => s.id));
  const allDepsValid = plan.steps.every(s =>
    s.dependencies.every(d => stepIds.has(d)),
  );
  check('Dependencies reference valid step IDs', allDepsValid);

  // Check no cycles (the planner should have resolved them)
  const { detectCycles } = await import('../src/agent/planner/index.js');
  const cycles = detectCycles(plan);
  check('No dependency cycles', cycles === null, cycles ? `cycle: ${cycles.join(' → ')}` : 'clean');

  // Markdown serialization
  const md = toMarkdown(plan);
  check('Markdown output non-empty', md.length > 100, `${md.length} chars`);
  check('Markdown has frontmatter', md.includes('---'));
  check('Markdown has checkboxes', md.includes('[ ]'));
}

check('Serialized output present', !!finalState?.serializedOutput, `${finalState?.serializedOutput?.length ?? 0} chars`);
check('Summary present', !!finalState?.summary);
check('Done message sent', !!channel.getDone());
check('Checkpoints written', channel.getCheckpoints().length > 0, `${channel.getCheckpoints().length} checkpoints`);
check('Inferred plan type is implementation', finalState?.inferredPlanType === 'implementation', finalState?.inferredPlanType);

// ---------------------------------------------------------------------------
// Print plan
// ---------------------------------------------------------------------------

if (plan) {
  section('Generated Plan');
  console.log(`${YELLOW}${plan.title}${RESET}`);
  console.log(`${DIM}${plan.steps.length} steps, type: ${finalState?.inferredPlanType}${RESET}\n`);

  const statusIcon: Record<string, string> = {
    pending: '[ ]', in_progress: '[>]', done: '[x]', failed: '[!]', blocked: '[-]', skipped: '[~]',
  };
  for (const step of plan.steps) {
    const icon = statusIcon[step.status] ?? '[?]';
    const deps = step.dependencies.length > 0
      ? ` ${DIM}(deps: ${step.dependencies.map(d => plan.steps.findIndex(s => s.id === d) + 1).join(', ')})${RESET}`
      : '';
    console.log(`  ${icon} ${step.title}${deps}`);
    if (step.data && 'filePaths' in step.data) {
      const fp = (step.data as { filePaths?: string[] }).filePaths;
      if (fp && fp.length > 0) {
        console.log(`${DIM}      files: ${fp.join(', ')}${RESET}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

section('Summary');
console.log(`${GREEN}Passed: ${passed}${RESET}  ${failed > 0 ? `${RED}Failed: ${failed}${RESET}` : `${DIM}Failed: 0${RESET}`}`);
console.log(`${DIM}Time: ${elapsed}s${RESET}\n`);

process.exit(failed > 0 ? 1 : 0);
