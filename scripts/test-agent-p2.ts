#!/usr/bin/env tsx
/**
 * Phase 2 agent tests — classifier, router, escalation.
 * Run with: npx tsx scripts/test-agent-p2.ts
 *
 * Pure logic tests — no external services required.
 */

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const DIM   = '\x1b[2m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

function section(title: string) {
  console.log(`\n${CYAN}━━━ ${title} ━━━${RESET}`);
}
function ok(msg: string)   { passed++; console.log(`${GREEN}✓${RESET} ${msg}`); }
function fail(msg: string) { failed++; console.log(`${RED}✗${RESET} ${msg}`); }
function dim(msg: string)  { console.log(`${DIM}  ${msg}${RESET}`); }
function assert(cond: boolean, pass: string, failMsg: string) {
  if (cond) ok(pass); else fail(failMsg);
}

import type { Intent } from '../src/shared/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Keyword classifier
// ═══════════════════════════════════════════════════════════════════════════
section('1.1 Keywords — each intent has at least one trigger');

import { classifyKeywords } from '../src/agent/classifier/keywords.js';

{
  const cases: [string, Intent][] = [
    // graph
    ['who are the callers of processJob?', 'graph'],
    ['what depends on this module?', 'graph'],
    ['what uses the Entity type?', 'graph'],

    // implement
    ['implement the retry logic', 'implement'],
    ['write a function to parse CSV', 'implement'],
    ['create a class for payment handling', 'implement'],
    ['add support for WebSocket connections', 'implement'],

    // refactor
    ['refactor the payment module', 'refactor'],
    ['rename getUserById to findUser', 'refactor'],
    ['extract the validation logic into a helper', 'refactor'],

    // test
    ['write unit test for the parser', 'test'],
    ['add test coverage for the router', 'test'],
    ['mock the database connection', 'test'],

    // debug
    ['debug why the server crashes on startup', 'debug'],
    ['fix the broken import', 'debug'],
    ['the login is not working', 'debug'],
    ['there is an exception in the payment handler', 'debug'],

    // review
    ['review this pull request', 'review'],
    ['audit the security of the auth module', 'review'],
    ['is this correct?', 'review'],

    // document
    ['add a docstring to processPayment', 'document'],
    ['update the readme', 'document'],
    ['write a changelog entry', 'document'],

    // research
    ['explain how the session manager works', 'research'],
    ['how does the indexer pipeline work?', 'research'],
    ['where is the config loaded from?', 'research'],
    ['what is the Entity type?', 'research'],

    // design
    ['design the API for the new payment module', 'design'],
    ['consider the architecture for the auth service', 'design'],
    ['should i use a queue or direct calls?', 'design'],

    // plan
    ['plan the migration to multi-tenant', 'plan'],
    ['break down the migration into steps', 'plan'],
    ['what are the steps to add OAuth?', 'plan'],

    // requirements
    ['what are the requirements for the new feature?', 'requirements'],
    ['the user story for checkout flow', 'requirements'],
    ['define the acceptance criteria', 'requirements'],
  ];

  for (const [message, expectedIntent] of cases) {
    const result = classifyKeywords(message);
    assert(
      result.intent === expectedIntent,
      `"${message.slice(0, 50)}" → ${result.intent} (${Math.round(result.confidence * 100)}%)`,
      `Expected ${expectedIntent}, got ${result.intent} for "${message.slice(0, 50)}"`,
    );
  }
}

section('1.2 Keywords — confidence scoring');

{
  // 3-word phrase → 0.95
  const threeWord = classifyKeywords('add support for WebSocket');
  assert(threeWord.confidence === 0.95,
    `3-word phrase "add support for" → confidence 0.95`,
    `Expected 0.95, got ${threeWord.confidence}`);

  // 2-word phrase → 0.85
  const twoWord = classifyKeywords('unit test the parser');
  assert(twoWord.confidence === 0.85,
    `2-word phrase "unit test" → confidence 0.85`,
    `Expected 0.85, got ${twoWord.confidence}`);

  // 1-word phrase → 0.7
  const oneWord = classifyKeywords('refactor');
  assert(oneWord.confidence === 0.7,
    `1-word phrase "refactor" → confidence 0.7`,
    `Expected 0.7, got ${oneWord.confidence}`);

  // No match → research fallback with 0.3
  const noMatch = classifyKeywords('hello world');
  assert(noMatch.intent === 'research' && noMatch.confidence === 0.3,
    `No keywords → research fallback (${noMatch.confidence})`,
    `Expected research/0.3, got ${noMatch.intent}/${noMatch.confidence}`);
}

section('1.3 Keywords — "spec" disambiguation');

{
  // "spec" alone → requirements
  const specAlone = classifyKeywords('update the spec for the API');
  assert(specAlone.intent === 'requirements',
    '"update the spec" → requirements',
    `Expected requirements, got ${specAlone.intent}`);

  // "write spec" → should not go to requirements (test qualifier)
  // Note: "write test" would match test, and "spec" under requirements
  // is suppressed when preceded by test qualifiers
  const writeSpec = classifyKeywords('write spec for the parser');
  dim(`"write spec" → ${writeSpec.intent} (${writeSpec.confidence})`);
  // "write" triggers implement, which at 0.7 may compete. The key test is
  // that it does NOT classify as requirements when a test qualifier is present.

  // "unit spec" → test qualifier suppresses requirements
  const unitSpec = classifyKeywords('run unit spec');
  assert(unitSpec.intent !== 'requirements',
    `"run unit spec" → NOT requirements (got ${unitSpec.intent})`,
    `Expected NOT requirements for "run unit spec", got ${unitSpec.intent}`);
}

section('1.4 Keywords — case insensitive');

{
  const upper = classifyKeywords('REFACTOR the payment module');
  assert(upper.intent === 'refactor',
    'Uppercase "REFACTOR" matched',
    `Expected refactor, got ${upper.intent}`);

  const mixed = classifyKeywords('Write A Function to parse JSON');
  assert(mixed.intent === 'implement',
    'Mixed case "Write A Function" matched',
    `Expected implement, got ${mixed.intent}`);
}

section('1.5 Keywords — highest score wins when multiple match');

{
  // "implement" (1 word, 0.7) vs "add support for" (3 words, 0.95) both present
  const multi = classifyKeywords('implement and add support for retry');
  assert(multi.confidence === 0.95,
    `Multi-match picks highest score (0.95 for "add support for")`,
    `Expected 0.95, got ${multi.confidence}`);
}

section('1.6 Keywords — allMatches tracks all matched intents');

{
  // Single intent match → allMatches has one entry
  const single = classifyKeywords('refactor the payment module');
  assert(single.allMatches.length >= 1,
    `Single keyword → allMatches has entries (got ${single.allMatches.length})`,
    `Expected >= 1, got ${single.allMatches.length}`);
  assert(single.allMatches[0]!.intent === 'refactor',
    'Top match is refactor',
    `Expected refactor, got ${single.allMatches[0]!.intent}`);

  // Multi-intent message → allMatches has multiple entries
  const multi = classifyKeywords('review the design document');
  assert(multi.allMatches.length >= 2,
    `Multi-keyword → allMatches has ${multi.allMatches.length} entries`,
    `Expected >= 2, got ${multi.allMatches.length}`);
  const matchedIntents = multi.allMatches.map(m => m.intent);
  assert(matchedIntents.includes('review') && matchedIntents.includes('design'),
    `"review the design document" matches review + design`,
    `Got intents: ${matchedIntents.join(', ')}`);
}

section('1.7 Keywords — isAmbiguous detection');

import { isAmbiguous } from '../src/agent/classifier/llm-fallback.js';

{
  // Two intents at same score → ambiguous
  const ambig = classifyKeywords('review the design document');
  assert(isAmbiguous(ambig.allMatches),
    '"review the design document" → ambiguous (multiple tied)',
    `Expected ambiguous, allMatches: ${JSON.stringify(ambig.allMatches)}`);

  // Single clear intent → not ambiguous
  const clear = classifyKeywords('write unit test for the parser');
  assert(!isAmbiguous(clear.allMatches),
    '"write unit test..." → not ambiguous (clear winner)',
    `Expected not ambiguous, allMatches: ${JSON.stringify(clear.allMatches)}`);

  // No matches → not ambiguous
  const noMatch = classifyKeywords('hello world');
  assert(!isAmbiguous(noMatch.allMatches),
    'No matches → not ambiguous',
    `Expected not ambiguous`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Prefix parser
// ═══════════════════════════════════════════════════════════════════════════
section('2.1 Prefix — @provider parsing');

import { parsePrefix } from '../src/agent/classifier/prefix.js';

{
  const r1 = parsePrefix('@claude explain this function');
  assert(r1.explicit === 'claude' && r1.message === 'explain this function',
    '@claude parsed correctly',
    `Expected claude + message, got ${r1.explicit} + "${r1.message}"`);

  const r2 = parsePrefix('@opus review the architecture');
  assert(r2.explicit === 'opus' && r2.message === 'review the architecture',
    '@opus parsed correctly',
    `Expected opus + message, got ${r2.explicit} + "${r2.message}"`);

  const r3 = parsePrefix('@local fix the bug');
  assert(r3.explicit === 'local' && r3.message === 'fix the bug',
    '@local parsed correctly',
    `Expected local + message, got ${r3.explicit} + "${r3.message}"`);

  const r4 = parsePrefix('just a normal message');
  assert(r4.explicit === undefined && r4.message === 'just a normal message',
    'No prefix → explicit undefined',
    `Expected undefined, got ${r4.explicit}`);
}

section('2.2 Prefix — /intent parsing');

{
  const r1 = parsePrefix('/intent debug why is this slow?');
  assert(r1.intentOverride === 'debug' && r1.message === 'why is this slow?',
    '/intent debug parsed correctly',
    `Expected debug + message, got ${r1.intentOverride} + "${r1.message}"`);

  const r2 = parsePrefix('/intent plan build the payment system');
  assert(r2.intentOverride === 'plan' && r2.message === 'build the payment system',
    '/intent plan parsed correctly',
    `Expected plan + message, got ${r2.intentOverride} + "${r2.message}"`);

  // All 11 intents should be valid
  const intents: Intent[] = [
    'implement', 'refactor', 'test', 'debug', 'review',
    'document', 'research', 'graph', 'plan', 'requirements', 'design',
  ];
  for (const intent of intents) {
    const r = parsePrefix(`/intent ${intent} do something`);
    assert(r.intentOverride === intent,
      `/intent ${intent} → valid`,
      `Expected ${intent}, got ${r.intentOverride}`);
  }
}

section('2.3 Prefix — /intent + @provider combined');

{
  const r1 = parsePrefix('/intent debug @claude why is this slow?');
  assert(
    r1.intentOverride === 'debug' && r1.explicit === 'claude' && r1.message === 'why is this slow?',
    '/intent debug @claude → intent=debug, explicit=claude, message stripped',
    `Got intent=${r1.intentOverride}, explicit=${r1.explicit}, message="${r1.message}"`,
  );

  const r2 = parsePrefix('/intent review @opus check security');
  assert(
    r2.intentOverride === 'review' && r2.explicit === 'opus' && r2.message === 'check security',
    '/intent review @opus → both parsed',
    `Got intent=${r2.intentOverride}, explicit=${r2.explicit}`,
  );
}

section('2.4 Prefix — invalid /intent name ignored');

{
  const r = parsePrefix('/intent foobar do something');
  assert(r.intentOverride === undefined,
    'Invalid intent name "foobar" → intentOverride undefined',
    `Expected undefined, got ${r.intentOverride}`);
  // The raw "/intent foobar" stays in the message since it wasn't consumed
  assert(r.message === '/intent foobar do something',
    'Invalid intent leaves message unchanged',
    `Expected original message, got "${r.message}"`);
}

section('2.5 Prefix — whitespace handling');

{
  const r1 = parsePrefix('  @claude   explain this  ');
  assert(r1.explicit === 'claude' && r1.message === 'explain this',
    'Leading/trailing whitespace trimmed',
    `Got explicit=${r1.explicit}, message="${r1.message}"`);

  const r2 = parsePrefix('/intent   debug    @local   fix it');
  assert(r2.intentOverride === 'debug' && r2.explicit === 'local' && r2.message === 'fix it',
    'Extra whitespace between tokens handled',
    `Got intent=${r2.intentOverride}, explicit=${r2.explicit}, message="${r2.message}"`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Graph signal tie-breaker
// ═══════════════════════════════════════════════════════════════════════════
section('3.1 Signals — activeFile boosts implement/refactor/debug');

import { applyGraphSignals, type SignalContext } from '../src/agent/classifier/signals.js';

{
  const base = { intent: 'implement' as Intent, confidence: 0.5 };
  const ctx: SignalContext = { activeFile: 'src/foo.ts' };
  const result = applyGraphSignals(base, ctx);
  assert(result.confidence === 0.6,
    `activeFile boosts implement 0.5 → ${result.confidence}`,
    `Expected 0.6, got ${result.confidence}`);

  const refactorBase = { intent: 'refactor' as Intent, confidence: 0.5 };
  const refactorResult = applyGraphSignals(refactorBase, ctx);
  assert(refactorResult.confidence === 0.6,
    `activeFile boosts refactor 0.5 → ${refactorResult.confidence}`,
    `Expected 0.6, got ${refactorResult.confidence}`);
}

section('3.2 Signals — selectedEntity boosts research/graph');

{
  const base = { intent: 'research' as Intent, confidence: 0.5 };
  const ctx: SignalContext = { selectedEntity: 'processJob' };
  const result = applyGraphSignals(base, ctx);
  assert(result.confidence === 0.65,
    `selectedEntity boosts research 0.5 → ${result.confidence}`,
    `Expected 0.65, got ${result.confidence}`);
}

section('3.3 Signals — high entity count boosts design/plan, suppresses implement');

{
  const designBase = { intent: 'design' as Intent, confidence: 0.5 };
  const ctx: SignalContext = { entityCount: 5 };
  const designResult = applyGraphSignals(designBase, ctx);
  assert(designResult.confidence === 0.6,
    `entityCount>3 boosts design 0.5 → ${designResult.confidence}`,
    `Expected 0.6, got ${designResult.confidence}`);

  const implBase = { intent: 'implement' as Intent, confidence: 0.5 };
  const implResult = applyGraphSignals(implBase, ctx);
  assert(implResult.confidence === 0.4,
    `entityCount>3 suppresses implement 0.5 → ${implResult.confidence}`,
    `Expected 0.4, got ${implResult.confidence}`);
}

section('3.4 Signals — activePlanStep boosts implement');

{
  const base = { intent: 'implement' as Intent, confidence: 0.5 };
  const ctx: SignalContext = { activePlanStep: true };
  const result = applyGraphSignals(base, ctx);
  assert(result.confidence === 0.65,
    `activePlanStep boosts implement 0.5 → ${result.confidence}`,
    `Expected 0.65, got ${result.confidence}`);
}

section('3.5 Signals — recentTestFailure boosts debug/test');

{
  const debugBase = { intent: 'debug' as Intent, confidence: 0.5 };
  const ctx: SignalContext = { recentTestFailure: true };
  const debugResult = applyGraphSignals(debugBase, ctx);
  assert(debugResult.confidence === 0.65,
    `recentTestFailure boosts debug 0.5 → ${debugResult.confidence}`,
    `Expected 0.65, got ${debugResult.confidence}`);

  const testBase = { intent: 'test' as Intent, confidence: 0.5 };
  const testResult = applyGraphSignals(testBase, ctx);
  assert(testResult.confidence === 0.6,
    `recentTestFailure boosts test 0.5 → ${testResult.confidence}`,
    `Expected 0.6, got ${testResult.confidence}`);
}

section('3.6 Signals — confidence capped at 1.0');

{
  const base = { intent: 'implement' as Intent, confidence: 0.95 };
  const ctx: SignalContext = { activeFile: 'src/foo.ts', activePlanStep: true };
  const result = applyGraphSignals(base, ctx);
  assert(result.confidence === 1.0,
    `Confidence capped at 1.0 (would be 1.2)`,
    `Expected 1.0, got ${result.confidence}`);
}

section('3.7 Signals — no signals → no change');

{
  const base = { intent: 'research' as Intent, confidence: 0.5 };
  const result = applyGraphSignals(base, {});
  assert(result.confidence === 0.5,
    'Empty context → confidence unchanged',
    `Expected 0.5, got ${result.confidence}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Classification pipeline
// ═══════════════════════════════════════════════════════════════════════════
section('4.1 Pipeline — full classify() integration');

import { classify } from '../src/agent/classifier/index.js';

{
  // Basic keyword classification
  const r1 = await classify('refactor the payment module');
  assert(r1.intent === 'refactor' && r1.explicit === undefined,
    `classify("refactor...") → intent=refactor, no explicit`,
    `Got intent=${r1.intent}, explicit=${r1.explicit}`);

  // Explicit provider prefix
  const r2 = await classify('@claude explain this function');
  assert(r2.intent === 'research' && r2.explicit === 'claude',
    `classify("@claude explain...") → intent=research, explicit=claude`,
    `Got intent=${r2.intent}, explicit=${r2.explicit}`);

  // /intent override bypasses keyword classification
  const r3 = await classify('/intent debug explain why this crashes');
  assert(r3.intent === 'debug' && r3.confidence === 1.0,
    '/intent override → confidence=1.0, intent=debug',
    `Got intent=${r3.intent}, confidence=${r3.confidence}`);

  // /intent + @provider
  const r4 = await classify('/intent review @opus check this');
  assert(r4.intent === 'review' && r4.explicit === 'opus' && r4.message === 'check this',
    '/intent review @opus → both set, message stripped',
    `Got intent=${r4.intent}, explicit=${r4.explicit}, message="${r4.message}"`);

  // No keywords → research fallback
  const r5 = await classify('hello world');
  assert(r5.intent === 'research' && r5.confidence === 0.3,
    'No keywords → research fallback with 0.3',
    `Got ${r5.intent}/${r5.confidence}`);
}

section('4.2 Pipeline — signals applied only when confidence < 0.7');

{
  // High confidence (0.85 for 2-word phrase) → signals NOT applied
  const r1 = await classify('unit test the parser');
  // "unit test" is 2 words → 0.85 confidence → signals skipped
  assert(r1.confidence === 0.85,
    'High confidence (0.85) → signals not applied',
    `Expected 0.85, got ${r1.confidence}`);

  // Low confidence (0.3 fallback) → signals applied
  const r2 = await classify('hello world', { ctx: { activeFile: 'src/foo.ts' } });
  // research with 0.3, no boost for research from activeFile → stays 0.3
  assert(r2.confidence === 0.3,
    'Low confidence + activeFile → signals applied (research not boosted by activeFile)',
    `Got ${r2.confidence}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Router
// ═══════════════════════════════════════════════════════════════════════════
section('5.1 Router — local-default intents');

import { selectProvider, type RouterDeps } from '../src/agent/router.js';
import { OllamaProvider as OllamaProviderClass } from '../src/agent/providers/ollama.js';
import { ClaudeProvider as ClaudeProviderClass } from '../src/agent/providers/claude.js';
import { loadConfig as loadCfg } from '../src/agent/config.js';

function makeDeps(withClaude: boolean): RouterDeps {
  const cfg = loadCfg();
  return {
    ollamaProvider: new OllamaProviderClass(),
    claudeProvider: withClaude
      ? new ClaudeProviderClass({ model: 'claude-sonnet-4-6', apiKey: 'fake-key' })
      : null,
    config: cfg,
  };
}

{
  const deps = makeDeps(true);
  const localIntents: Intent[] = ['implement', 'refactor', 'test', 'debug', 'document', 'research'];

  for (const intent of localIntents) {
    const route = selectProvider(intent, undefined, deps);
    assert(route.label === 'Local' && !route.graphOnly,
      `${intent} → Local`,
      `Expected Local for ${intent}, got ${route.label}`);
  }
}

section('5.2 Router — Claude-default intents');

{
  const deps = makeDeps(true);
  const claudeIntents: Intent[] = ['requirements', 'design', 'plan', 'review'];

  for (const intent of claudeIntents) {
    const route = selectProvider(intent, undefined, deps);
    assert(route.label.includes('Claude') && route.tier === 'standard',
      `${intent} → Claude Sonnet (standard tier)`,
      `Expected Claude Sonnet for ${intent}, got ${route.label} / tier=${route.tier}`);
  }
}

section('5.3 Router — graph intent → graphOnly');

{
  const deps = makeDeps(true);
  const route = selectProvider('graph', undefined, deps);
  assert(route.graphOnly === true,
    'graph → graphOnly=true',
    `Expected graphOnly=true, got ${route.graphOnly}`);
}

section('5.4 Router — explicit @local overrides Claude-default');

{
  const deps = makeDeps(true);
  const route = selectProvider('requirements', 'local', deps);
  assert(route.label === 'Local' && !route.graphOnly,
    '@local overrides requirements → Local',
    `Expected Local, got ${route.label}`);
}

section('5.5 Router — explicit @claude on local-default intent');

{
  const deps = makeDeps(true);
  const route = selectProvider('implement', 'claude', deps);
  assert(route.label.includes('Claude') && route.tier === 'fast',
    '@claude + implement → Claude Haiku (fast tier)',
    `Expected Claude Haiku, got ${route.label} / tier=${route.tier}`);
}

section('5.6 Router — explicit @opus');

{
  const deps = makeDeps(true);
  const route = selectProvider('review', 'opus', deps);
  assert(route.label === 'Claude Opus' && route.tier === 'powerful',
    '@opus → Claude Opus (powerful tier)',
    `Expected Claude Opus, got ${route.label} / tier=${route.tier}`);
}

section('5.7 Router — Claude unavailable fallback');

{
  const deps = makeDeps(false); // no Claude

  // Claude-default intent without Claude → falls back to local
  const r1 = selectProvider('requirements', undefined, deps);
  assert(r1.label.includes('Local'),
    'requirements without Claude → Local fallback',
    `Expected Local fallback, got ${r1.label}`);

  // Explicit @claude without Claude → falls back to local
  const r2 = selectProvider('implement', 'claude', deps);
  assert(r2.label.includes('Local'),
    '@claude without Claude → Local fallback',
    `Expected Local fallback, got ${r2.label}`);

  // Explicit @opus without Claude → falls back to local
  const r3 = selectProvider('review', 'opus', deps);
  assert(r3.label.includes('Local'),
    '@opus without Claude → Local fallback',
    `Expected Local fallback, got ${r3.label}`);
}

section('5.8 Router — @claude uses intent-specific tier');

{
  const deps = makeDeps(true);

  // implement intent → fast tier (Haiku)
  const r1 = selectProvider('implement', 'claude', deps);
  assert(r1.tier === 'fast',
    '@claude + implement → fast tier',
    `Expected fast, got ${r1.tier}`);

  // research intent → standard tier (Sonnet)
  const r2 = selectProvider('research', 'claude', deps);
  assert(r2.tier === 'standard',
    '@claude + research → standard tier',
    `Expected standard, got ${r2.tier}`);

  // debug intent → fast tier (Haiku)
  const r3 = selectProvider('debug', 'claude', deps);
  assert(r3.tier === 'fast',
    '@claude + debug → fast tier',
    `Expected fast, got ${r3.tier}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. End-to-end: classify → route
// ═══════════════════════════════════════════════════════════════════════════
section('6.1 End-to-end — classify + route integration');

{
  const deps = makeDeps(true);

  // Normal local message
  const c1 = await classify('fix the broken import');
  const r1 = selectProvider(c1.intent, c1.explicit, deps);
  assert(c1.intent === 'debug' && r1.label === 'Local',
    '"fix the broken import" → debug → Local',
    `Got ${c1.intent} → ${r1.label}`);

  // @claude explicit
  const c2 = await classify('@claude review this code');
  const r2 = selectProvider(c2.intent, c2.explicit, deps);
  assert(c2.intent === 'review' && r2.label.includes('Claude'),
    '"@claude review this code" → review → Claude',
    `Got ${c2.intent} → ${r2.label}`);

  // /intent override + @opus
  const c3 = await classify('/intent design @opus how should we structure auth?');
  const r3 = selectProvider(c3.intent, c3.explicit, deps);
  assert(c3.intent === 'design' && r3.label === 'Claude Opus',
    '/intent design @opus → design → Claude Opus',
    `Got ${c3.intent} → ${r3.label}`);

  // Graph query
  const c4 = await classify('who are the callers of processJob?');
  const r4 = selectProvider(c4.intent, c4.explicit, deps);
  assert(c4.intent === 'graph' && r4.graphOnly === true,
    '"callers of..." → graph → graphOnly',
    `Got ${c4.intent} → graphOnly=${r4.graphOnly}`);

  // Claude-default without explicit
  const c5 = await classify('plan the migration to multi-tenant');
  const r5 = selectProvider(c5.intent, c5.explicit, deps);
  assert(c5.intent === 'plan' && r5.label.includes('Claude'),
    '"plan..." → plan → Claude (auto-escalated)',
    `Got ${c5.intent} → ${r5.label}`);

  // @local overrides auto-escalation
  const c6 = await classify('@local plan the migration offline');
  const r6 = selectProvider(c6.intent, c6.explicit, deps);
  assert(c6.intent === 'plan' && r6.label === 'Local',
    '"@local plan..." → plan → Local (override)',
    `Got ${c6.intent} → ${r6.label}`);
}

section('6.2 End-to-end — message body preserved correctly');

{
  const c1 = await classify('@claude explain how session works');
  assert(c1.message === 'explain how session works',
    '@claude stripped from message body',
    `Got "${c1.message}"`);

  const c2 = await classify('/intent debug @local fix the crash');
  assert(c2.message === 'fix the crash',
    '/intent + @local stripped from message body',
    `Got "${c2.message}"`);

  const c3 = await classify('just a normal message');
  assert(c3.message === 'just a normal message',
    'No prefix → message unchanged',
    `Got "${c3.message}"`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════
console.log(`\n${CYAN}━━━ Summary ━━━${RESET}`);
console.log(`${GREEN}Passed: ${passed}${RESET}`);
if (failed > 0) console.log(`${RED}Failed: ${failed}${RESET}`);
else console.log(`${DIM}Failed: 0${RESET}`);
console.log('');

process.exit(failed > 0 ? 1 : 0);
