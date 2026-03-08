#!/usr/bin/env tsx
/**
 * Phase 11 tests — CLI One-Shot Mode
 *
 * Tests cover:
 *   - CLI module exports: runOneShot, runPlanShorthand, OneShotResult, OneShotOpts
 *   - handlePipeline: forceEscalate parameter (no opts_claude_hack)
 *   - formatResult: text and JSON output modes
 *   - Exit code semantics: 0, 1, 2
 *   - Plan shorthand: delegates to runOneShot with intent='plan'
 *   - CLI entry point: ask and plan subcommands wired
 *   - File structure: all files exist
 *   - Source-level checks: no opts_claude_hack, permissionMode='auto-accept'
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => { passed++; console.log(`  ✓ ${name}`); },
    (err: unknown) => { failed++; console.log(`  ✗ ${name}`); console.log(`    ${err}`); },
  );
}

const ROOT = join(import.meta.dirname, '..');

// ===========================================================================
// 1. File structure
// ===========================================================================

console.log('\n── File Structure ──');

await test('src/agent/cli.ts exists', () => {
  assert.ok(existsSync(join(ROOT, 'src/agent/cli.ts')));
});

await test('src/cli/index.ts exists', () => {
  assert.ok(existsSync(join(ROOT, 'src/cli/index.ts')));
});

// ===========================================================================
// 2. CLI module exports
// ===========================================================================

console.log('\n── CLI Module Exports ──');

const cliSource = await readFile(join(ROOT, 'src/agent/cli.ts'), 'utf-8');

await test('exports runOneShot function', () => {
  assert.ok(cliSource.includes('export async function runOneShot'));
});

await test('exports runPlanShorthand function', () => {
  assert.ok(cliSource.includes('export async function runPlanShorthand'));
});

await test('exports OneShotResult interface', () => {
  assert.ok(cliSource.includes('export interface OneShotResult'));
});

await test('exports OneShotOpts interface', () => {
  assert.ok(cliSource.includes('export interface OneShotOpts'));
});

// ===========================================================================
// 3. OneShotResult shape
// ===========================================================================

console.log('\n── OneShotResult Shape ──');

await test('OneShotResult has exitCode field', () => {
  assert.ok(cliSource.includes('exitCode: number'));
});

await test('OneShotResult has output field', () => {
  assert.ok(cliSource.includes('output: string'));
});

await test('OneShotResult has intent field', () => {
  assert.ok(cliSource.includes('intent?: Intent'));
});

await test('OneShotResult has usedClaude field', () => {
  assert.ok(cliSource.includes('usedClaude?: boolean'));
});

// ===========================================================================
// 4. OneShotOpts shape
// ===========================================================================

console.log('\n── OneShotOpts Shape ──');

await test('OneShotOpts has intent option', () => {
  assert.ok(/intent\?.*string/.test(cliSource));
});

await test('OneShotOpts has claude option', () => {
  assert.ok(/claude\?.*boolean/.test(cliSource));
});

await test('OneShotOpts has json option', () => {
  assert.ok(/json\?.*boolean/.test(cliSource));
});

await test('OneShotOpts has cwd option', () => {
  assert.ok(/cwd\?.*string/.test(cliSource));
});

// ===========================================================================
// 5. No opts_claude_hack
// ===========================================================================

console.log('\n── No opts_claude_hack ──');

await test('opts_claude_hack variable does not exist', () => {
  assert.ok(!cliSource.includes('opts_claude_hack'));
});

await test('handlePipeline has forceEscalate parameter', () => {
  assert.ok(cliSource.includes('forceEscalate'));
});

await test('forceEscalate is in handlePipeline signature', () => {
  // Check it's a parameter — multiline signature
  const match = cliSource.match(/async function handlePipeline\([\s\S]*?forceEscalate[\s\S]*?\)/);
  assert.ok(match, 'forceEscalate should be in handlePipeline signature');
});

await test('forceEscalate is passed from caller', () => {
  // The callers should pass opts.claude
  assert.ok(cliSource.includes('!!opts.claude'));
});

// ===========================================================================
// 6. Exit code semantics
// ===========================================================================

console.log('\n── Exit Codes ──');

await test('exit code 0 returned on success (formatResult)', () => {
  assert.ok(cliSource.includes('exitCode: 0'));
});

await test('exit code 1 returned on error', () => {
  assert.ok(cliSource.includes('exitCode: 1'));
});

await test('exit code 2 for escalated but no key', () => {
  assert.ok(cliSource.includes('exitCode: 2'));
});

await test('exit code 2 checks hasClaudeKey', () => {
  assert.ok(cliSource.includes('session.hasClaudeKey'));
});

// ===========================================================================
// 7. JSON output mode
// ===========================================================================

console.log('\n── JSON Output Mode ──');

await test('formatResult handles json flag', () => {
  assert.ok(cliSource.includes('JSON.stringify'));
});

await test('JSON output includes success field', () => {
  assert.ok(cliSource.includes("success: true"));
  assert.ok(cliSource.includes("success: false"));
});

await test('JSON output includes intent field', () => {
  // In formatResult JSON output
  const jsonBlock = cliSource.match(/JSON\.stringify\(\{[^}]+intent/s);
  assert.ok(jsonBlock);
});

await test('JSON output includes response field', () => {
  const jsonBlock = cliSource.match(/JSON\.stringify\(\{[^}]+response/s);
  assert.ok(jsonBlock);
});

await test('JSON error output includes error field', () => {
  const errorJsonBlock = cliSource.match(/JSON\.stringify\(\{[^}]+error: errMsg/s);
  assert.ok(errorJsonBlock);
});

// ===========================================================================
// 8. Stderr for status, stdout for output
// ===========================================================================

console.log('\n── Output Routing ──');

await test('status messages go to stderr', () => {
  assert.ok(cliSource.includes('process.stderr.write'));
});

await test('text output goes to stdout', () => {
  assert.ok(cliSource.includes('process.stdout.write'));
});

await test('log helper writes to stderr', () => {
  const logFn = cliSource.match(/function log\(msg: string\)[\s\S]*?process\.stderr/);
  assert.ok(logFn);
});

// ===========================================================================
// 9. Permission mode
// ===========================================================================

console.log('\n── Permission Mode ──');

await test('permissionMode set to auto-accept', () => {
  assert.ok(cliSource.includes("permissionMode: 'auto-accept'"));
});

// ===========================================================================
// 10. Plan shorthand
// ===========================================================================

console.log('\n── Plan Shorthand ──');

await test('runPlanShorthand delegates to runOneShot', () => {
  const fn = cliSource.match(/async function runPlanShorthand[\s\S]*?return runOneShot/);
  assert.ok(fn);
});

await test('runPlanShorthand sets intent to plan', () => {
  assert.ok(cliSource.includes("intent: 'plan'"));
});

// ===========================================================================
// 11. Pipeline intents coverage
// ===========================================================================

console.log('\n── Pipeline Intents ──');

const PIPELINE_INTENTS = [
  'requirements', 'design', 'plan', 'implement', 'refactor',
  'test', 'debug', 'review', 'document', 'research',
];

for (const intent of PIPELINE_INTENTS) {
  await test(`handles ${intent} intent`, () => {
    const pattern = new RegExp(`intent === '${intent}'`);
    assert.ok(pattern.test(cliSource), `handlePipeline should handle '${intent}'`);
  });
}

// ===========================================================================
// 12. CLI entry point wiring
// ===========================================================================

console.log('\n── CLI Entry Point ──');

const cliEntrySource = await readFile(join(ROOT, 'src/cli/index.ts'), 'utf-8');

await test('ask subcommand defined', () => {
  assert.ok(cliEntrySource.includes(".command('ask')"));
});

await test('plan subcommand defined', () => {
  assert.ok(cliEntrySource.includes(".command('plan')"));
});

await test('ask imports runOneShot', () => {
  assert.ok(cliEntrySource.includes('runOneShot'));
});

await test('plan imports runPlanShorthand', () => {
  assert.ok(cliEntrySource.includes('runPlanShorthand'));
});

await test('ask has --intent option', () => {
  assert.ok(cliEntrySource.includes("--intent <name>"));
});

await test('ask has --claude option', () => {
  assert.ok(cliEntrySource.includes("--claude"));
});

await test('ask has --json option', () => {
  assert.ok(cliEntrySource.includes("--json"));
});

await test('ask has --cwd option', () => {
  assert.ok(cliEntrySource.includes("--cwd <path>"));
});

await test('ask calls process.exit with result.exitCode', () => {
  assert.ok(cliEntrySource.includes('process.exit(result.exitCode)'));
});

await test('ask passes message argument', () => {
  // ask subcommand takes <message> as required argument
  assert.ok(cliEntrySource.includes("<message>"));
});

await test('plan passes description argument', () => {
  assert.ok(cliEntrySource.includes("<description>"));
});

// ===========================================================================
// 13. Attachment handling in one-shot
// ===========================================================================

console.log('\n── Attachment Handling ──');

await test('extracts file paths from message', () => {
  assert.ok(cliSource.includes('extractFilePaths(message)'));
});

await test('resolves attachments', () => {
  assert.ok(cliSource.includes('resolveAttachment'));
});

await test('sets attachment context on ctx', () => {
  assert.ok(cliSource.includes('ctx.setAttachmentContext'));
});

await test('forced-Claude pipeline for implement/test', () => {
  assert.ok(cliSource.includes('runForcedClaudePipeline'));
});

// ===========================================================================
// 14. Auto-escalation
// ===========================================================================

console.log('\n── Auto-Escalation ──');

await test('shouldEscalate check exists', () => {
  assert.ok(cliSource.includes('shouldEscalate'));
});

await test('auto-escalation creates Claude provider', () => {
  assert.ok(cliSource.includes('auto-escalated'));
});

// ===========================================================================
// 15. Graph-only intent handling
// ===========================================================================

console.log('\n── Graph-Only Intent ──');

await test('handles graphOnly route', () => {
  assert.ok(cliSource.includes('route.graphOnly'));
});

await test('re-routes interpretive graph to research', () => {
  // When graph query isn't handled, falls back to research
  const reRoute = cliSource.match(/graphResult\.handled[\s\S]*?handlePipeline\('research'/);
  assert.ok(reRoute);
});

// ===========================================================================
// 16. Import validation
// ===========================================================================

console.log('\n── Imports ──');

await test('imports classify', () => {
  assert.ok(cliSource.includes("from './classifier/index.js'"));
});

await test('imports selectProvider', () => {
  assert.ok(cliSource.includes("from './router.js'"));
});

await test('imports shouldEscalate', () => {
  assert.ok(cliSource.includes("from './escalation.js'"));
});

await test('imports Session', () => {
  assert.ok(cliSource.includes("from './session.js'"));
});

await test('imports loadConfig', () => {
  assert.ok(cliSource.includes("from './config.js'"));
});

await test('imports runToolLoop', () => {
  assert.ok(cliSource.includes("from './tools/loop.js'"));
});

await test('imports all pipeline modules', () => {
  assert.ok(cliSource.includes("from './tasks/requirements.js'"));
  assert.ok(cliSource.includes("from './tasks/design.js'"));
  assert.ok(cliSource.includes("from './tasks/plan.js'"));
  assert.ok(cliSource.includes("from './tasks/implement.js'"));
  assert.ok(cliSource.includes("from './tasks/refactor.js'"));
  assert.ok(cliSource.includes("from './tasks/test.js'"));
  assert.ok(cliSource.includes("from './tasks/debug.js'"));
  assert.ok(cliSource.includes("from './tasks/research.js'"));
  assert.ok(cliSource.includes("from './tasks/review.js'"));
  assert.ok(cliSource.includes("from './tasks/document.js'"));
});

// ===========================================================================
// 17. Edge cases
// ===========================================================================

console.log('\n── Edge Cases ──');

await test('handles missing ollama gracefully', () => {
  // The source tries ensureAgentModel and catches
  assert.ok(cliSource.includes('ollamaOk = false') || cliSource.includes('ollamaOk'));
  assert.ok(cliSource.includes('Ollama not available'));
});

await test('brave key env injection', () => {
  assert.ok(cliSource.includes("BRAVE_API_KEY"));
});

await test('classifyMessage with intent override prepends /intent', () => {
  assert.ok(cliSource.includes('/intent ${opts.intent}') || cliSource.includes('`/intent ${opts.intent}'));
});

await test('classifyMessage with claude override prepends @claude', () => {
  assert.ok(cliSource.includes('@claude ${classifyInput}') || cliSource.includes('`@claude ${classifyInput}'));
});

await test('tool loop supports both streaming and tool-based providers', () => {
  assert.ok(cliSource.includes('supportsTools'));
  assert.ok(cliSource.includes('route.provider.stream'));
});

// ===========================================================================
// 18. CLI entry point guards
// ===========================================================================

console.log('\n── CLI Entry Guards ──');

await test('default action starts REPL', () => {
  assert.ok(cliEntrySource.includes('startRepl'));
});

await test('REPL is default when no subcommand', () => {
  // The default action uses [message] optional arg but always starts REPL
  assert.ok(cliEntrySource.includes("argument('[message]'"));
});

await test('commander error handler exists', () => {
  assert.ok(cliEntrySource.includes('process.exit(1)'));
});

// ===========================================================================
// Summary
// ===========================================================================

console.log(`\n── Summary: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
