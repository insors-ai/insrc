#!/usr/bin/env tsx
/**
 * Test the smart router's complexity assessment.
 *
 * Run with: source ~/.insors && npx tsx scripts/test-smart-router.ts
 */

const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';
const YELLOW = '\x1b[33m';
const RESET  = '\x1b[0m';

function section(title: string) { console.log(`\n${CYAN}━━━ ${title} ━━━${RESET}`); }
function ok(msg: string)   { console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { console.log(`${RED}✗${RESET} ${msg}`); }

import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { loadConfig } from '../src/agent/config.js';
import { SmartRouter, buildSignals, type ComplexitySignals } from '../src/agent/smart-router.js';

section('Setup');

const config = loadConfig();

// Always use Ollama for assessment — that's what the real smart router does
const ollama = new OllamaProvider(
  config.models.local,
  config.ollama.host,
  config.models.context.local,
);

if (!(await ollama.ping())) {
  console.error(`${RED}Ollama not running. Start with: ollama serve${RESET}`);
  process.exit(1);
}
ok(`Using Ollama for assessment (${config.models.local})`);

const router = new SmartRouter(ollama, config);

// ---------------------------------------------------------------------------
// Test cases
// ---------------------------------------------------------------------------

interface TestCase {
  name: string;
  message: string;
  signals: Omit<ComplexitySignals, 'intent' | 'messageLength' | 'hasAttachments' | 'taskCategory'>;
  intent: ComplexitySignals['intent'];
  expectProvider: 'local' | 'claude';
  expectMinScore?: number;
  expectMaxScore?: number;
}

const cases: TestCase[] = [
  {
    name: 'Tiny lookup → local (fast-path)',
    message: 'what is Entity?',
    signals: { contextTokens: 500, fileCount: 1, repoCount: 1 },
    intent: 'research',
    expectProvider: 'local',
    expectMaxScore: 2,
  },
  {
    name: 'Simple single-file edit → local (fast-path)',
    message: 'rename foo to bar',
    signals: { contextTokens: 1000, fileCount: 1, repoCount: 1 },
    intent: 'refactor',
    expectProvider: 'local',
    expectMaxScore: 2,
  },
  {
    name: 'Multi-repo task → claude (fast-path)',
    message: 'refactor the shared types across repos',
    signals: { contextTokens: 5000, fileCount: 8, repoCount: 3 },
    intent: 'refactor',
    expectProvider: 'claude',
    expectMinScore: 4,
  },
  {
    name: 'Large context → claude (fast-path)',
    message: 'analyze the full indexer module',
    signals: { contextTokens: 60000, fileCount: 15, repoCount: 1 },
    intent: 'research',
    expectProvider: 'claude',
    expectMinScore: 4,
  },
  {
    name: 'Medium complexity design → LLM assessment',
    message: 'Design a caching layer for the search module with TTL-based eviction and LRU fallback',
    signals: { contextTokens: 5000, fileCount: 4, repoCount: 1 },
    intent: 'design',
    expectProvider: 'claude',
    expectMinScore: 3,
  },
  {
    name: 'Complex debugging → LLM assessment',
    message: 'Debug why the watcher misses file events when multiple repos are indexed concurrently under high CPU load',
    signals: { contextTokens: 12000, fileCount: 6, repoCount: 1 },
    intent: 'debug',
    expectProvider: 'claude',
    expectMinScore: 3,
  },
  {
    name: 'Simple implement → LLM assessment',
    message: 'Add a toString method to the Entity class',
    signals: { contextTokens: 3000, fileCount: 2, repoCount: 1 },
    intent: 'implement',
    expectProvider: 'local',
    expectMaxScore: 3,
  },
];

section('Running assessments');

let passed = 0;
let failed = 0;

for (const tc of cases) {
  const signals = buildSignals(
    tc.intent, tc.message,
    tc.signals.contextTokens, tc.signals.fileCount, tc.signals.repoCount,
    false,
  );

  const assessment = await router.assess(signals, tc.message);

  const providerOk = assessment.provider === tc.expectProvider;
  const scoreOk = (tc.expectMinScore === undefined || assessment.score >= tc.expectMinScore)
    && (tc.expectMaxScore === undefined || assessment.score <= tc.expectMaxScore);

  const success = providerOk && scoreOk;
  if (success) {
    passed++;
    ok(`${tc.name}: score=${assessment.score} ${assessment.provider}/${assessment.tier} ${assessment.fromCache ? '(cached)' : ''}`);
  } else {
    failed++;
    fail(`${tc.name}: score=${assessment.score} ${assessment.provider}/${assessment.tier} (expected ${tc.expectProvider}, score ${tc.expectMinScore ?? '?'}-${tc.expectMaxScore ?? '?'})`);
  }
  console.log(`${DIM}  reasoning: ${assessment.reasoning}${RESET}`);
}

// Test caching
section('Cache test');
const cachedSignals = buildSignals('implement', 'Add a toString method', 3000, 2, 1, false);
const first = await router.assess(cachedSignals, 'Add a toString method');
const second = await router.assess(cachedSignals, 'Add a toString method');
if (second.fromCache) {
  passed++;
  ok('Second assessment served from cache');
} else {
  failed++;
  fail('Cache miss on identical request');
}

section('Summary');
console.log(`${GREEN}Passed: ${passed}${RESET}  ${failed > 0 ? `${RED}Failed: ${failed}${RESET}` : `${DIM}Failed: 0${RESET}`}\n`);
process.exit(failed > 0 ? 1 : 0);
