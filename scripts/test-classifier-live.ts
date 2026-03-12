#!/usr/bin/env tsx
/**
 * Live classifier test — runs multi-intent prompts against local Ollama.
 * Run with: npx tsx scripts/test-classifier-live.ts
 */

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const DIM   = '\x1b[2m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function section(title: string) {
  console.log(`\n${CYAN}━━━ ${title} ━━━${RESET}`);
}
function ok(msg: string)   { passed++; console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { failed++; console.log(`${RED}✗${RESET} ${msg}`); }
function info(msg: string) { console.log(`${DIM}  ${msg}${RESET}`); }

import { classify } from '../src/agent/classifier/index.js';
import { OllamaProvider } from '../src/agent/providers/ollama.js';
import type { Intent } from '../src/shared/types.js';

// Use the 30b model for classification quality
const ollama = new OllamaProvider('qwen3-coder:30b');

// Check Ollama is reachable
const alive = await ollama.ping();
if (!alive) {
  console.error(`${RED}Ollama is not running. Start it with: ollama serve${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}Ollama reachable${RESET} — using qwen3-coder:30b\n`);

// ---------------------------------------------------------------------------
// Test cases: [message, expectedPrimary, expectedSecondary?]
// ---------------------------------------------------------------------------

interface TestCase {
  message: string;
  expectedPrimary: Intent;
  expectedSecondary?: Intent;
  description: string;
}

const singleIntentCases: TestCase[] = [
  // Clear single-intent messages
  {
    message: 'implement a retry mechanism for the HTTP client',
    expectedPrimary: 'implement',
    description: 'Clear implement intent',
  },
  {
    message: 'refactor the payment module to use the strategy pattern',
    expectedPrimary: 'refactor',
    description: 'Clear refactor intent',
  },
  {
    message: 'the login page crashes when I enter a long password',
    expectedPrimary: 'debug',
    description: 'Bug report without keyword "debug"',
  },
  {
    message: 'who calls the processPayment function?',
    expectedPrimary: 'graph',
    description: 'Structural graph query',
  },
  {
    message: 'write unit tests for the UserService class',
    expectedPrimary: 'test',
    description: 'Clear test intent',
  },
  {
    message: 'how does the session manager handle token refresh?',
    expectedPrimary: 'research',
    description: 'Explanation/research query',
  },
  {
    message: 'design the API for a new notification system',
    expectedPrimary: 'design',
    description: 'Clear design intent',
  },
  {
    message: 'break down the auth migration into implementation steps',
    expectedPrimary: 'plan',
    description: 'Clear plan intent',
  },
  {
    message: 'define the acceptance criteria for the checkout flow',
    expectedPrimary: 'requirements',
    description: 'Clear requirements intent',
  },
  {
    message: 'review the changes in the latest PR for security issues',
    expectedPrimary: 'review',
    description: 'Clear review intent',
  },
  {
    message: 'deploy the staging branch to the preview environment',
    expectedPrimary: 'deploy',
    description: 'Clear deploy intent',
  },
  {
    message: 'bump the version to 2.0.0 and cut a release',
    expectedPrimary: 'release',
    description: 'Clear release intent',
  },
  {
    message: 'check the pod status and memory usage in the production cluster',
    expectedPrimary: 'infra',
    description: 'Clear infra intent',
  },
];

const multiIntentCases: TestCase[] = [
  {
    message: 'implement the retry logic and then write tests for it',
    expectedPrimary: 'implement',
    expectedSecondary: 'test',
    description: 'Implement + test compound request',
  },
  {
    message: 'review this code and fix the bug in the error handler',
    expectedPrimary: 'review',
    expectedSecondary: 'debug',
    description: 'Review + debug compound request',
  },
  {
    message: 'design the new caching layer and plan the implementation steps',
    expectedPrimary: 'design',
    expectedSecondary: 'plan',
    description: 'Design + plan compound request',
  },
  {
    message: 'refactor the database module and add documentation for the public API',
    expectedPrimary: 'refactor',
    expectedSecondary: 'document',
    description: 'Refactor + document compound request',
  },
  {
    message: 'deploy to staging and check if the pods are healthy',
    expectedPrimary: 'deploy',
    expectedSecondary: 'infra',
    description: 'Deploy + infra compound request',
  },
];

const ambiguousCases: TestCase[] = [
  {
    message: 'the payment handler is returning 500s on retries',
    expectedPrimary: 'debug',
    description: 'Ambiguous: could be debug or implement — should be debug (bug report)',
  },
  {
    message: 'should we use a message queue or direct HTTP calls between services?',
    expectedPrimary: 'design',
    description: 'Ambiguous: could be design or research — should be design (tradeoff question)',
  },
  {
    message: 'what are the requirements for making the API backward compatible?',
    expectedPrimary: 'requirements',
    description: 'Ambiguous: "requirements" keyword + "what are" research pattern',
  },
  {
    message: 'fix the broken import and add a test to prevent regression',
    expectedPrimary: 'debug',
    expectedSecondary: 'test',
    description: 'Ambiguous primary (fix=debug) with clear secondary (test)',
  },
];

const sessionSignalCases: TestCase[] = [
  {
    message: 'what should we do about this?',
    expectedPrimary: 'debug',
    description: 'Vague message + recentTestFailure signal → should lean debug',
  },
  {
    message: 'handle this differently',
    expectedPrimary: 'implement',
    description: 'Vague message + activeFile signal → should lean implement',
  },
];

// ---------------------------------------------------------------------------
// Run tests
// ---------------------------------------------------------------------------

async function runTest(tc: TestCase, signals: Record<string, unknown> = {}): Promise<void> {
  const start = Date.now();
  const result = await classify(tc.message, {
    signals,
    llmProvider: ollama,
  });
  const elapsed = Date.now() - start;

  const primaryOk = result.intent === tc.expectedPrimary;
  const cls = result.classification;

  if (primaryOk) {
    ok(`${tc.description}`);
    info(`primary: ${result.intent} (${(result.confidence * 100).toFixed(0)}%) — "${cls.primary.snippet}"`);
    info(`reasoning: ${cls.primary.reasoning}`);
  } else {
    fail(`${tc.description}`);
    info(`expected primary: ${tc.expectedPrimary}, got: ${result.intent} (${(result.confidence * 100).toFixed(0)}%)`);
    info(`snippet: "${cls.primary.snippet}"`);
    info(`reasoning: ${cls.primary.reasoning}`);
  }

  // Check secondary if expected
  if (tc.expectedSecondary) {
    if (cls.secondary) {
      const secOk = cls.secondary.intent === tc.expectedSecondary;
      if (secOk) {
        ok(`  secondary: ${cls.secondary.intent} (${(cls.secondary.confidence * 100).toFixed(0)}%)`);
        info(`  snippet: "${cls.secondary.snippet}"`);
      } else {
        fail(`  expected secondary: ${tc.expectedSecondary}, got: ${cls.secondary.intent}`);
        info(`  snippet: "${cls.secondary.snippet}"`);
        info(`  reasoning: ${cls.secondary.reasoning}`);
      }
    } else {
      fail(`  expected secondary: ${tc.expectedSecondary}, got: none`);
    }
  } else if (cls.secondary) {
    info(`${YELLOW}  unexpected secondary: ${cls.secondary.intent} (${(cls.secondary.confidence * 100).toFixed(0)}%) — "${cls.secondary.snippet}"${RESET}`);
  }

  info(`${elapsed}ms | usedLLM: ${result.usedLLM}`);
}

// --- Single intent ---
section('1. Single-intent classification (14 intents)');
for (const tc of singleIntentCases) {
  await runTest(tc);
}

// --- Multi-intent ---
section('2. Multi-intent / compound requests');
for (const tc of multiIntentCases) {
  await runTest(tc);
}

// --- Ambiguous ---
section('3. Ambiguous messages (natural language, no keywords)');
for (const tc of ambiguousCases) {
  await runTest(tc);
}

// --- Session signals ---
section('4. Session signal influence');
await runTest(sessionSignalCases[0]!, { recentTestFailure: true });
await runTest(sessionSignalCases[1]!, { activeFile: 'src/handlers/payment.ts' });

// --- Prefix override (should bypass LLM) ---
section('5. Prefix overrides (LLM bypassed)');
{
  const r = await classify('/intent debug @claude why is this slow?', {
    signals: {},
    llmProvider: ollama,
  });
  if (r.intent === 'debug' && r.confidence === 1.0 && r.explicit === 'claude' && !r.usedLLM) {
    ok('/intent debug @claude → intent=debug, confidence=1.0, explicit=claude, usedLLM=false');
  } else {
    fail(`Expected debug/1.0/claude/noLLM, got ${r.intent}/${r.confidence}/${r.explicit}/${r.usedLLM}`);
  }
  info(`message: "${r.message}"`);
}

// --- Keyword fallback (no LLM) ---
section('6. Keyword fallback (no LLM provider)');
{
  const r = await classify('refactor the payment module', {
    signals: {},
    // no llmProvider — forces keyword fallback
  });
  if (r.intent === 'refactor' && !r.usedLLM && r.confidence <= 0.7) {
    ok(`Keyword fallback: ${r.intent} (${(r.confidence * 100).toFixed(0)}%) usedLLM=${r.usedLLM}`);
  } else {
    fail(`Expected refactor/≤0.7/noLLM, got ${r.intent}/${r.confidence}/${r.usedLLM}`);
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n${CYAN}━━━ Summary ━━━${RESET}`);
console.log(`${GREEN}Passed: ${passed}${RESET}`);
if (failed > 0) console.log(`${RED}Failed: ${failed}${RESET}`);
else console.log(`${DIM}Failed: 0${RESET}`);
console.log('');

process.exit(failed > 0 ? 1 : 0);
