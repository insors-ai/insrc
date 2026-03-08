#!/usr/bin/env tsx
/**
 * Phase 1 agent tests — config, providers, session.
 * Run with: npx tsx scripts/test-agent-p1.ts
 *
 * No external services required (Ollama, Claude) — all provider tests use
 * structural checks. Live integration tests are marked and skippable.
 */

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const YELL  = '\x1b[33m';
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

// ═══════════════════════════════════════════════════════════════════════════
// 1. Config loader
// ═══════════════════════════════════════════════════════════════════════════
section('1.1 Config — loadConfig defaults');

import { loadConfig, resolveModel } from '../src/agent/config.js';

{
  const cfg = loadConfig();

  assert(cfg.ollama.host === 'http://localhost:11434',
    'Default Ollama host correct',
    `Expected default Ollama host, got ${cfg.ollama.host}`);

  assert(cfg.models.local === 'qwen3-coder:latest',
    'Default local model correct',
    `Expected qwen3-coder:latest, got ${cfg.models.local}`);

  assert(cfg.models.tiers.fast.includes('haiku'),
    'Fast tier contains haiku',
    `Expected haiku in fast tier, got ${cfg.models.tiers.fast}`);

  assert(cfg.models.tiers.standard.includes('sonnet'),
    'Standard tier contains sonnet',
    `Expected sonnet in standard tier, got ${cfg.models.tiers.standard}`);

  assert(cfg.models.tiers.powerful.includes('opus'),
    'Powerful tier contains opus',
    `Expected opus in powerful tier, got ${cfg.models.tiers.powerful}`);

  assert(cfg.permissions.mode === 'validate',
    'Default permission mode is validate',
    `Expected validate, got ${cfg.permissions.mode}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 1.2 resolveModel — role → tier → model ID
// ═══════════════════════════════════════════════════════════════════════════
section('1.2 Config — resolveModel');

{
  const cfg = loadConfig();

  // Default tier mapping — validate/escalation roles → fast
  const validateModel = resolveModel(cfg, 'tool.validate');
  assert(validateModel === cfg.models.tiers.fast,
    `validate role → fast tier (${validateModel})`,
    `Expected fast tier for validate role, got ${validateModel}`);

  const escalationModel = resolveModel(cfg, 'escalation.stuck');
  assert(escalationModel === cfg.models.tiers.fast,
    `escalation role → fast tier (${escalationModel})`,
    `Expected fast tier for escalation role, got ${escalationModel}`);

  // document.review → fast
  const docReviewModel = resolveModel(cfg, 'document.review');
  assert(docReviewModel === cfg.models.tiers.fast,
    `document.review → fast tier (${docReviewModel})`,
    `Expected fast tier for document.review, got ${docReviewModel}`);

  // Unmapped role → standard tier
  const unknownModel = resolveModel(cfg, 'some.unknown.role');
  assert(unknownModel === cfg.models.tiers.standard,
    `Unknown role → standard tier (${unknownModel})`,
    `Expected standard tier for unknown role, got ${unknownModel}`);

  // Role override in config (simulate)
  const cfgWithOverride = { ...cfg, models: { ...cfg.models, roles: { 'custom.role': 'fast' } } };
  const overrideModel = resolveModel(cfgWithOverride, 'custom.role');
  assert(overrideModel === cfg.models.tiers.fast,
    `Custom role 'fast' → fast tier model (${overrideModel})`,
    `Expected fast tier for custom.role=fast, got ${overrideModel}`);

  // Direct model ID in role
  const cfgDirect = { ...cfg, models: { ...cfg.models, roles: { 'direct.role': 'claude-sonnet-4-6' } } };
  const directModel = resolveModel(cfgDirect, 'direct.role');
  assert(directModel === 'claude-sonnet-4-6',
    'Direct model ID in role → used as-is',
    `Expected claude-sonnet-4-6, got ${directModel}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. OllamaProvider — structural tests (no live Ollama needed)
// ═══════════════════════════════════════════════════════════════════════════
section('2.1 OllamaProvider — construction');

import { OllamaProvider } from '../src/agent/providers/ollama.js';

{
  const provider = new OllamaProvider('qwen3-coder:latest', 'http://localhost:11434');
  assert(provider.supportsTools === true,
    'supportsTools is true',
    'Expected supportsTools to be true');

  // Verify it implements LLMProvider interface
  assert(typeof provider.complete === 'function',
    'Has complete() method',
    'Missing complete() method');
  assert(typeof provider.stream === 'function',
    'Has stream() method',
    'Missing stream() method');
  assert(typeof provider.ping === 'function',
    'Has ping() method',
    'Missing ping() method');
}

section('2.2 OllamaProvider — ping with bad host');

{
  const badProvider = new OllamaProvider('qwen3-coder:latest', 'http://localhost:1');
  const result = await badProvider.ping();
  assert(result === false,
    'ping() returns false for unreachable host',
    `Expected false, got ${result}`);
}

section('2.3 OllamaProvider — complete with bad host throws');

{
  const badProvider = new OllamaProvider('qwen3-coder:latest', 'http://localhost:1');
  try {
    await badProvider.complete([{ role: 'user', content: 'hello' }]);
    fail('Expected complete() to throw for unreachable host');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(
      msg.includes('not running') || msg.includes('ECONNREFUSED') || msg.includes('fetch failed'),
      `complete() throws connection error: ${msg.slice(0, 60)}`,
      `Unexpected error message: ${msg}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. ClaudeProvider — structural tests (no live API key needed)
// ═══════════════════════════════════════════════════════════════════════════
section('3.1 ClaudeProvider — construction');

import { ClaudeProvider } from '../src/agent/providers/claude.js';

{
  const provider = new ClaudeProvider({ model: 'claude-sonnet-4-6', apiKey: 'test-key-not-real' });
  assert(provider.supportsTools === true,
    'supportsTools is true',
    'Expected supportsTools to be true');
  assert(typeof provider.complete === 'function',
    'Has complete() method',
    'Missing complete() method');
  assert(typeof provider.stream === 'function',
    'Has stream() method',
    'Missing stream() method');
}

section('3.2 ClaudeProvider — default model');

{
  const provider = new ClaudeProvider();
  // Can't inspect the private model field, but construction should not throw
  ok('Default construction (no config) succeeds');
}

section('3.3 ClaudeProvider — complete with bad key throws auth error');

{
  const provider = new ClaudeProvider({ model: 'claude-sonnet-4-6', apiKey: 'sk-ant-fake-key' });
  try {
    await provider.complete([{ role: 'user', content: 'hello' }]);
    fail('Expected complete() to throw with invalid API key');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    assert(
      msg.includes('authentication') || msg.includes('API') || msg.includes('401') || msg.includes('invalid'),
      `complete() throws auth/API error: ${msg.slice(0, 80)}`,
      `Unexpected error: ${msg}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Session — construction and system prompt
// ═══════════════════════════════════════════════════════════════════════════
section('4.1 Session — construction');

import { Session } from '../src/agent/session.js';

{
  const cfg = loadConfig();
  const session = new Session({ repoPath: '/tmp/test-repo', config: cfg });

  assert(typeof session.id === 'string' && session.id.length > 0,
    `Session ID generated: ${session.id.slice(0, 8)}...`,
    'Expected non-empty session ID');

  assert(session.repoPath === '/tmp/test-repo',
    'repoPath set correctly',
    `Expected /tmp/test-repo, got ${session.repoPath}`);

  assert(session.turnIndex === 0,
    'turnIndex starts at 0',
    `Expected 0, got ${session.turnIndex}`);

  assert(Array.isArray(session.closureRepos) && session.closureRepos.length === 0,
    'closureRepos starts empty',
    `Expected empty array, got ${JSON.stringify(session.closureRepos)}`);
}

section('4.2 Session — provider exposure');

{
  const cfg = loadConfig();
  const session = new Session({ repoPath: '/tmp/test-repo', config: cfg });

  assert(session.ollamaProvider instanceof OllamaProvider,
    'ollamaProvider is OllamaProvider instance',
    'Expected OllamaProvider');

  // Without API key, claudeProvider should be null
  const cfgNoKey = { ...cfg, keys: {} };
  const sessionNoKey = new Session({ repoPath: '/tmp/test-repo', config: cfgNoKey });
  assert(sessionNoKey.claudeProvider === null,
    'claudeProvider is null when no API key',
    'Expected null claudeProvider without API key');
  assert(sessionNoKey.hasClaudeKey === false,
    'hasClaudeKey is false when no API key',
    `Expected false, got ${sessionNoKey.hasClaudeKey}`);

  // With API key, claudeProvider should be set
  const cfgWithKey = { ...cfg, keys: { anthropic: 'sk-ant-fake' } };
  const sessionWithKey = new Session({ repoPath: '/tmp/test-repo', config: cfgWithKey });
  assert(sessionWithKey.claudeProvider instanceof ClaudeProvider,
    'claudeProvider is ClaudeProvider instance when key provided',
    'Expected ClaudeProvider');
  assert(sessionWithKey.hasClaudeKey === true,
    'hasClaudeKey is true when key provided',
    `Expected true, got ${sessionWithKey.hasClaudeKey}`);
}

section('4.3 Session — system context (via context/system.ts)');

{
  const { buildSystemContext } = await import('../src/agent/context/system.js');

  const prompt = buildSystemContext({ repoPath: '/tmp/test-repo', closureRepos: ['/tmp/test-repo'] });

  assert(prompt.includes('insrc'),
    'System prompt mentions insrc',
    'Expected insrc in system prompt');

  assert(prompt.includes('/tmp/test-repo'),
    'System prompt includes repo path',
    'Expected repo path in system prompt');

  // Multi-repo case
  const multiPrompt = buildSystemContext({
    repoPath: '/tmp/repo-a',
    closureRepos: ['/tmp/repo-a', '/tmp/repo-b'],
  });
  assert(multiPrompt.includes('Repos in scope'),
    'Multi-repo prompt uses "Repos in scope"',
    'Expected "Repos in scope" for multi-repo');
  assert(multiPrompt.includes('/tmp/repo-a') && multiPrompt.includes('/tmp/repo-b'),
    'Multi-repo prompt lists all repos',
    'Expected both repos in prompt');
}

section('4.4 Session — unique IDs');

{
  const cfg = loadConfig();
  const s1 = new Session({ repoPath: '/tmp/test-repo', config: cfg });
  const s2 = new Session({ repoPath: '/tmp/test-repo', config: cfg });
  assert(s1.id !== s2.id,
    `Two sessions have different IDs (${s1.id.slice(0, 8)} vs ${s2.id.slice(0, 8)})`,
    'Expected unique session IDs');
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Lifecycle — ensureAgentModel (structural test only)
// ═══════════════════════════════════════════════════════════════════════════
section('5.1 Lifecycle — ensureAgentModel with bad host');

import { ensureAgentModel } from '../src/agent/lifecycle.js';

{
  try {
    await ensureAgentModel('http://localhost:1');
    fail('Expected ensureAgentModel to throw for unreachable host');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    ok(`ensureAgentModel throws for bad host: ${msg.slice(0, 60)}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Context — initSession (graceful degradation)
// ═══════════════════════════════════════════════════════════════════════════
section('6.1 Context — initSession without daemon');

import { initSession } from '../src/agent/context.js';

{
  // Without the daemon running, initSession should fall back to just the root repo
  const repos = await initSession('/tmp/test-repo');
  assert(repos.length === 1 && repos[0] === '/tmp/test-repo',
    'initSession returns [repoPath] when daemon unavailable',
    `Expected ['/tmp/test-repo'], got ${JSON.stringify(repos)}`);
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
