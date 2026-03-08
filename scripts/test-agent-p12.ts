#!/usr/bin/env tsx
/**
 * Phase 12 tests — Fault Tolerance
 *
 * Tests cover:
 *   - File structure: all fault files exist
 *   - HealthMonitor: state machine, transitions, periodic check, snapshot
 *   - Ollama fault handler: classification, formatting, isOllamaDown
 *   - Daemon fault handler: classification, formatting, restart, stale graph
 *   - Barrel export: all re-exports present
 *   - Session integration: health property, healthSnapshot, close stops monitor
 *   - REPL integration: fault imports, health change logging, /status health
 *   - CLI integration: fault imports, error classification
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

const FAULT_FILES = [
  'src/agent/faults/health.ts',
  'src/agent/faults/ollama.ts',
  'src/agent/faults/daemon.ts',
  'src/agent/faults/index.ts',
];

for (const f of FAULT_FILES) {
  await test(`${f} exists`, () => {
    assert.ok(existsSync(join(ROOT, f)));
  });
}

// ===========================================================================
// 2. HealthMonitor — state machine
// ===========================================================================

console.log('\n── HealthMonitor State Machine ──');

const healthSource = await readFile(join(ROOT, 'src/agent/faults/health.ts'), 'utf-8');

await test('exports HealthMonitor class', () => {
  assert.ok(healthSource.includes('export class HealthMonitor'));
});

await test('exports ComponentState type', () => {
  assert.ok(healthSource.includes("export type ComponentState = 'healthy' | 'degraded' | 'unavailable'"));
});

await test('exports ComponentHealth interface', () => {
  assert.ok(healthSource.includes('export interface ComponentHealth'));
});

await test('exports HealthSnapshot interface', () => {
  assert.ok(healthSource.includes('export interface HealthSnapshot'));
});

await test('exports HealthChangeCallback type', () => {
  assert.ok(healthSource.includes('export type HealthChangeCallback'));
});

await test('exports DEFAULT_CHECK_INTERVAL_MS = 30_000', () => {
  assert.ok(healthSource.includes('DEFAULT_CHECK_INTERVAL_MS = 30_000'));
});

await test('has start() method', () => {
  assert.ok(healthSource.includes('start(intervalMs'));
});

await test('has stop() method', () => {
  assert.ok(healthSource.includes('stop(): void'));
});

await test('has check() method', () => {
  assert.ok(healthSource.includes('async check(): Promise<HealthSnapshot>'));
});

await test('has recordOllamaResult()', () => {
  assert.ok(healthSource.includes('recordOllamaResult(ok: boolean)'));
});

await test('has recordDaemonResult()', () => {
  assert.ok(healthSource.includes('recordDaemonResult(ok: boolean)'));
});

await test('has snapshot() method', () => {
  assert.ok(healthSource.includes('snapshot(): HealthSnapshot'));
});

await test('has ollamaState getter', () => {
  assert.ok(healthSource.includes('get ollamaState(): ComponentState'));
});

await test('has daemonState getter', () => {
  assert.ok(healthSource.includes('get daemonState(): ComponentState'));
});

await test('has ollamaUsable getter', () => {
  assert.ok(healthSource.includes('get ollamaUsable(): boolean'));
});

await test('has daemonUsable getter', () => {
  assert.ok(healthSource.includes('get daemonUsable(): boolean'));
});

await test('has setOnChange()', () => {
  assert.ok(healthSource.includes('setOnChange(cb'));
});

await test('timer is unref()d', () => {
  assert.ok(healthSource.includes('.unref()'));
});

// State transition logic
await test('healthy → degraded on first failure', () => {
  assert.ok(healthSource.includes("case 'healthy': return 'degraded'"));
});

await test('degraded → unavailable on second failure', () => {
  assert.ok(healthSource.includes("case 'degraded': return 'unavailable'"));
});

await test('unavailable → degraded on first success', () => {
  // The transition function handles this
  const match = healthSource.match(/case 'unavailable':\s*return consecutiveCount >= 2 \? 'healthy' : 'degraded'/);
  assert.ok(match);
});

await test('degraded → healthy on success', () => {
  assert.ok(healthSource.includes("case 'degraded': return 'healthy'"));
});

await test('constructor takes pingOllama and pingDaemon', () => {
  assert.ok(healthSource.includes('pingOllama: () => Promise<boolean>'));
  assert.ok(healthSource.includes('pingDaemon: () => Promise<boolean>'));
});

await test('onChange callback fires on state change', () => {
  assert.ok(healthSource.includes('if (prev !== health.state && this.onChange)'));
});

// ===========================================================================
// 3. Ollama fault handler
// ===========================================================================

console.log('\n── Ollama Fault Handler ──');

const ollamaFaultSource = await readFile(join(ROOT, 'src/agent/faults/ollama.ts'), 'utf-8');

await test('exports OllamaFaultKind type', () => {
  assert.ok(ollamaFaultSource.includes("export type OllamaFaultKind"));
});

await test('OllamaFaultKind includes not_running', () => {
  assert.ok(ollamaFaultSource.includes("'not_running'"));
});

await test('OllamaFaultKind includes model_missing', () => {
  assert.ok(ollamaFaultSource.includes("'model_missing'"));
});

await test('OllamaFaultKind includes timeout', () => {
  assert.ok(ollamaFaultSource.includes("'timeout'"));
});

await test('exports OllamaFault interface', () => {
  assert.ok(ollamaFaultSource.includes('export interface OllamaFault'));
});

await test('OllamaFault has suggestClaude', () => {
  assert.ok(ollamaFaultSource.includes('suggestClaude: boolean'));
});

await test('exports classifyOllamaError', () => {
  assert.ok(ollamaFaultSource.includes('export function classifyOllamaError'));
});

await test('exports formatOllamaFault', () => {
  assert.ok(ollamaFaultSource.includes('export function formatOllamaFault'));
});

await test('exports isOllamaDown', () => {
  assert.ok(ollamaFaultSource.includes('export function isOllamaDown'));
});

await test('classifies ECONNREFUSED as not_running', () => {
  assert.ok(ollamaFaultSource.includes("msg.includes('ECONNREFUSED')"));
});

await test('classifies fetch failed as not_running', () => {
  assert.ok(ollamaFaultSource.includes("msg.includes('fetch failed')"));
});

await test('classifies 404 as model_missing', () => {
  assert.ok(ollamaFaultSource.includes("msg.includes('404')"));
});

await test('classifies ETIMEDOUT as timeout', () => {
  assert.ok(ollamaFaultSource.includes("msg.includes('ETIMEDOUT')"));
});

await test('formatOllamaFault mentions Claude fallback', () => {
  assert.ok(ollamaFaultSource.includes('Falling back to Claude'));
});

await test('isOllamaDown returns true for not_running and timeout', () => {
  assert.ok(ollamaFaultSource.includes("fault.kind === 'not_running' || fault.kind === 'timeout'"));
});

// ===========================================================================
// 4. Daemon fault handler
// ===========================================================================

console.log('\n── Daemon Fault Handler ──');

const daemonFaultSource = await readFile(join(ROOT, 'src/agent/faults/daemon.ts'), 'utf-8');

await test('exports DaemonFaultKind type', () => {
  assert.ok(daemonFaultSource.includes("export type DaemonFaultKind"));
});

await test('DaemonFaultKind includes not_running', () => {
  assert.ok(daemonFaultSource.includes("'not_running'"));
});

await test('DaemonFaultKind includes crashed', () => {
  assert.ok(daemonFaultSource.includes("'crashed'"));
});

await test('DaemonFaultKind includes stale_graph', () => {
  assert.ok(daemonFaultSource.includes("'stale_graph'"));
});

await test('DaemonFaultKind includes kuzu_corrupt', () => {
  assert.ok(daemonFaultSource.includes("'kuzu_corrupt'"));
});

await test('exports DaemonFault interface', () => {
  assert.ok(daemonFaultSource.includes('export interface DaemonFault'));
});

await test('DaemonFault has disableTools', () => {
  assert.ok(daemonFaultSource.includes('disableTools: boolean'));
});

await test('exports classifyDaemonError', () => {
  assert.ok(daemonFaultSource.includes('export function classifyDaemonError'));
});

await test('exports formatDaemonFault', () => {
  assert.ok(daemonFaultSource.includes('export function formatDaemonFault'));
});

await test('exports attemptRestart', () => {
  assert.ok(daemonFaultSource.includes('export async function attemptRestart'));
});

await test('exports tryReconnect', () => {
  assert.ok(daemonFaultSource.includes('export async function tryReconnect'));
});

await test('exports annotateStale', () => {
  assert.ok(daemonFaultSource.includes('export function annotateStale'));
});

await test('exports isGraphPotentiallyStale', () => {
  assert.ok(daemonFaultSource.includes('export function isGraphPotentiallyStale'));
});

await test('RESTART_TIMEOUT_MS = 10_000', () => {
  assert.ok(daemonFaultSource.includes('RESTART_TIMEOUT_MS = 10_000'));
});

await test('classifies ENOENT as not_running', () => {
  assert.ok(daemonFaultSource.includes("msg.includes('ENOENT')"));
});

await test('classifies kuzu as kuzu_corrupt', () => {
  assert.ok(daemonFaultSource.includes("msg.includes('kuzu')"));
});

await test('attemptRestart uses execFile', () => {
  assert.ok(daemonFaultSource.includes("execFile('insrc', ['daemon', 'start']"));
});

await test('attemptRestart polls with ping', () => {
  assert.ok(daemonFaultSource.includes('const ok = await ping()'));
});

await test('annotateStale prepends [stale] prefix', () => {
  assert.ok(daemonFaultSource.includes('[stale]'));
});

await test('isGraphPotentiallyStale checks index.lock', () => {
  assert.ok(daemonFaultSource.includes('index.lock'));
});

await test('formatDaemonFault mentions tool disable', () => {
  assert.ok(daemonFaultSource.includes('Graph and plan tools are disabled'));
});

// ===========================================================================
// 5. Barrel export
// ===========================================================================

console.log('\n── Barrel Export ──');

const barrelSource = await readFile(join(ROOT, 'src/agent/faults/index.ts'), 'utf-8');

await test('re-exports HealthMonitor', () => {
  assert.ok(barrelSource.includes('HealthMonitor'));
});

await test('re-exports classifyOllamaError', () => {
  assert.ok(barrelSource.includes('classifyOllamaError'));
});

await test('re-exports classifyDaemonError', () => {
  assert.ok(barrelSource.includes('classifyDaemonError'));
});

await test('re-exports formatOllamaFault', () => {
  assert.ok(barrelSource.includes('formatOllamaFault'));
});

await test('re-exports formatDaemonFault', () => {
  assert.ok(barrelSource.includes('formatDaemonFault'));
});

await test('re-exports attemptRestart', () => {
  assert.ok(barrelSource.includes('attemptRestart'));
});

await test('re-exports annotateStale', () => {
  assert.ok(barrelSource.includes('annotateStale'));
});

await test('re-exports isOllamaDown', () => {
  assert.ok(barrelSource.includes('isOllamaDown'));
});

await test('re-exports isGraphPotentiallyStale', () => {
  assert.ok(barrelSource.includes('isGraphPotentiallyStale'));
});

await test('re-exports ComponentState type', () => {
  assert.ok(barrelSource.includes('ComponentState'));
});

// ===========================================================================
// 6. Session integration
// ===========================================================================

console.log('\n── Session Integration ──');

const sessionSource = await readFile(join(ROOT, 'src/agent/session.ts'), 'utf-8');

await test('imports HealthMonitor', () => {
  assert.ok(sessionSource.includes("import { HealthMonitor"));
});

await test('imports from faults/index.js', () => {
  assert.ok(sessionSource.includes("from './faults/index.js'"));
});

await test('has health property on Session', () => {
  assert.ok(sessionSource.includes('readonly health: HealthMonitor'));
});

await test('constructs HealthMonitor with ping functions', () => {
  assert.ok(sessionSource.includes('new HealthMonitor({'));
  assert.ok(sessionSource.includes('pingOllama:'));
  assert.ok(sessionSource.includes('pingDaemon:'));
});

await test('starts health monitor in init()', () => {
  assert.ok(sessionSource.includes('this.health.start()'));
});

await test('stops health monitor in close()', () => {
  assert.ok(sessionSource.includes('this.health.stop()'));
});

await test('has healthSnapshot() method', () => {
  assert.ok(sessionSource.includes('healthSnapshot(): HealthSnapshot'));
});

await test('ollamaAvailable uses health state when available', () => {
  assert.ok(sessionSource.includes('this.health.ollamaUsable'));
});

// ===========================================================================
// 7. REPL integration
// ===========================================================================

console.log('\n── REPL Integration ──');

const replSource = await readFile(join(ROOT, 'src/agent/index.ts'), 'utf-8');

await test('imports fault modules', () => {
  assert.ok(replSource.includes("from './faults/index.js'"));
});

await test('imports classifyOllamaError', () => {
  assert.ok(replSource.includes('classifyOllamaError'));
});

await test('imports formatOllamaFault', () => {
  assert.ok(replSource.includes('formatOllamaFault'));
});

await test('imports isOllamaDown', () => {
  assert.ok(replSource.includes('isOllamaDown'));
});

await test('imports classifyDaemonError', () => {
  assert.ok(replSource.includes('classifyDaemonError'));
});

await test('imports formatDaemonFault', () => {
  assert.ok(replSource.includes('formatDaemonFault'));
});

await test('imports attemptRestart', () => {
  assert.ok(replSource.includes('attemptRestart'));
});

await test('imports isGraphPotentiallyStale', () => {
  assert.ok(replSource.includes('isGraphPotentiallyStale'));
});

await test('sets health change callback', () => {
  assert.ok(replSource.includes('session.health.setOnChange'));
});

await test('health change logs unavailable state', () => {
  assert.ok(replSource.includes("next === 'unavailable'"));
});

await test('health change logs recovery', () => {
  assert.ok(replSource.includes("next === 'healthy'"));
});

await test('records initial Ollama health result', () => {
  assert.ok(replSource.includes('session.health.recordOllamaResult(ollamaOk)'));
});

await test('records initial daemon health result', () => {
  assert.ok(replSource.includes('session.health.recordDaemonResult(daemonInitOk)'));
});

await test('/status uses healthSnapshot', () => {
  assert.ok(replSource.includes('session.healthSnapshot()'));
});

await test('/status shows graph staleness', () => {
  assert.ok(replSource.includes('isGraphPotentiallyStale()'));
});

await test('/status uses formatHealthLine', () => {
  assert.ok(replSource.includes('formatHealthLine('));
});

await test('formatHealthLine helper exists', () => {
  const match = replSource.match(/function formatHealthLine\(state: ComponentState/);
  assert.ok(match);
});

await test('daemon per-turn check records health', () => {
  assert.ok(replSource.includes('session.health.recordDaemonResult(mcpAvailable)'));
});

await test('daemon auto-restart on unavailable', () => {
  assert.ok(replSource.includes("session.health.daemonState === 'unavailable'"));
  assert.ok(replSource.includes('attemptRestart('));
});

await test('daemon fault classification on error', () => {
  assert.ok(replSource.includes('classifyDaemonError(err)'));
  assert.ok(replSource.includes('formatDaemonFault(fault)'));
});

await test('Ollama error catch classifies fault', () => {
  assert.ok(replSource.includes('isOllamaDown(err)'));
  assert.ok(replSource.includes('classifyOllamaError(err)'));
  assert.ok(replSource.includes('formatOllamaFault(fault)'));
});

await test('Ollama fault suggests Claude retry', () => {
  assert.ok(replSource.includes('Retry with @claude prefix'));
});

// ===========================================================================
// 8. CLI integration
// ===========================================================================

console.log('\n── CLI Integration ──');

const cliSource = await readFile(join(ROOT, 'src/agent/cli.ts'), 'utf-8');

await test('CLI imports fault modules', () => {
  assert.ok(cliSource.includes("from './faults/index.js'"));
});

await test('CLI imports classifyOllamaError', () => {
  assert.ok(cliSource.includes('classifyOllamaError'));
});

await test('CLI imports isOllamaDown', () => {
  assert.ok(cliSource.includes('isOllamaDown'));
});

await test('CLI imports classifyDaemonError', () => {
  assert.ok(cliSource.includes('classifyDaemonError'));
});

await test('CLI imports formatDaemonFault', () => {
  assert.ok(cliSource.includes('formatDaemonFault'));
});

await test('CLI classifies Ollama startup error', () => {
  assert.ok(cliSource.includes('classifyOllamaError(err)'));
});

await test('CLI stops health monitor for one-shot', () => {
  assert.ok(cliSource.includes('session.health.stop()'));
});

await test('CLI records initial Ollama health', () => {
  assert.ok(cliSource.includes('session.health.recordOllamaResult(ollamaOk)'));
});

await test('CLI records daemon health', () => {
  assert.ok(cliSource.includes('session.health.recordDaemonResult('));
});

await test('CLI catches Ollama errors with fault classification', () => {
  assert.ok(cliSource.includes('isOllamaDown(err)'));
});

await test('CLI daemon check records health result', () => {
  const match = cliSource.match(/session\.health\.recordDaemonResult\((mcpAvailable|true|false)\)/);
  assert.ok(match);
});

// ===========================================================================
// 9. Runtime unit tests (import and run)
// ===========================================================================

console.log('\n── Runtime Unit Tests ──');

// Import the actual modules and test them
const { HealthMonitor } = await import(join(ROOT, 'src/agent/faults/health.js'));
const { classifyOllamaError, formatOllamaFault, isOllamaDown: isOllamaDownFn } = await import(join(ROOT, 'src/agent/faults/ollama.js'));
const { classifyDaemonError, formatDaemonFault, annotateStale } = await import(join(ROOT, 'src/agent/faults/daemon.js'));

await test('HealthMonitor transitions: healthy → degraded on failure', async () => {
  const monitor = new HealthMonitor({
    pingOllama: async () => false,
    pingDaemon: async () => true,
  });
  monitor.recordOllamaResult(false);
  assert.equal(monitor.ollamaState, 'degraded');
});

await test('HealthMonitor transitions: degraded → unavailable on second failure', async () => {
  const monitor = new HealthMonitor({
    pingOllama: async () => false,
    pingDaemon: async () => true,
  });
  monitor.recordOllamaResult(false); // healthy → degraded
  monitor.recordOllamaResult(false); // degraded → unavailable
  assert.equal(monitor.ollamaState, 'unavailable');
});

await test('HealthMonitor transitions: degraded → healthy on success', async () => {
  const monitor = new HealthMonitor({
    pingOllama: async () => false,
    pingDaemon: async () => true,
  });
  monitor.recordOllamaResult(false); // healthy → degraded
  monitor.recordOllamaResult(true);  // degraded → healthy
  assert.equal(monitor.ollamaState, 'healthy');
});

await test('HealthMonitor transitions: unavailable → degraded on first success', async () => {
  const monitor = new HealthMonitor({
    pingOllama: async () => false,
    pingDaemon: async () => true,
  });
  monitor.recordOllamaResult(false); // healthy → degraded
  monitor.recordOllamaResult(false); // degraded → unavailable
  monitor.recordOllamaResult(true);  // unavailable → degraded
  assert.equal(monitor.ollamaState, 'degraded');
});

await test('HealthMonitor transitions: unavailable → healthy on 2 successes', async () => {
  const monitor = new HealthMonitor({
    pingOllama: async () => false,
    pingDaemon: async () => true,
  });
  monitor.recordOllamaResult(false); // healthy → degraded
  monitor.recordOllamaResult(false); // degraded → unavailable
  monitor.recordOllamaResult(true);  // unavailable → degraded
  monitor.recordOllamaResult(true);  // degraded → healthy
  assert.equal(monitor.ollamaState, 'healthy');
});

await test('HealthMonitor ollamaUsable is false when unavailable', async () => {
  const monitor = new HealthMonitor({
    pingOllama: async () => false,
    pingDaemon: async () => true,
  });
  monitor.recordOllamaResult(false);
  monitor.recordOllamaResult(false);
  assert.equal(monitor.ollamaUsable, false);
});

await test('HealthMonitor daemonUsable tracks daemon', async () => {
  const monitor = new HealthMonitor({
    pingOllama: async () => true,
    pingDaemon: async () => false,
  });
  monitor.recordDaemonResult(false);
  monitor.recordDaemonResult(false);
  assert.equal(monitor.daemonUsable, false);
  assert.equal(monitor.daemonState, 'unavailable');
});

await test('HealthMonitor check() pings both', async () => {
  let ollamaPinged = false;
  let daemonPinged = false;
  const monitor = new HealthMonitor({
    pingOllama: async () => { ollamaPinged = true; return true; },
    pingDaemon: async () => { daemonPinged = true; return true; },
  });
  await monitor.check();
  assert.ok(ollamaPinged);
  assert.ok(daemonPinged);
});

await test('HealthMonitor snapshot() returns copies', async () => {
  const monitor = new HealthMonitor({
    pingOllama: async () => true,
    pingDaemon: async () => true,
  });
  await monitor.check();
  const snap = monitor.snapshot();
  assert.equal(snap.ollama.state, 'healthy');
  assert.equal(snap.daemon.state, 'healthy');
  assert.ok(snap.ollama.lastOk > 0);
});

await test('HealthMonitor onChange callback fires', async () => {
  const changes: string[] = [];
  const monitor = new HealthMonitor({
    pingOllama: async () => false,
    pingDaemon: async () => true,
    onChange: (comp: string, prev: string, next: string) => changes.push(`${comp}:${prev}→${next}`),
  });
  monitor.recordOllamaResult(false);
  assert.deepEqual(changes, ['ollama:healthy→degraded']);
});

await test('classifyOllamaError: ECONNREFUSED → not_running', () => {
  const fault = classifyOllamaError(new Error('ECONNREFUSED'));
  assert.equal(fault.kind, 'not_running');
  assert.ok(fault.suggestClaude);
});

await test('classifyOllamaError: fetch failed → not_running', () => {
  const fault = classifyOllamaError(new Error('fetch failed'));
  assert.equal(fault.kind, 'not_running');
});

await test('classifyOllamaError: 404 → model_missing', () => {
  const fault = classifyOllamaError(new Error('404 not found'));
  assert.equal(fault.kind, 'model_missing');
});

await test('classifyOllamaError: ETIMEDOUT → timeout', () => {
  const fault = classifyOllamaError(new Error('ETIMEDOUT'));
  assert.equal(fault.kind, 'timeout');
});

await test('classifyOllamaError: other → unknown', () => {
  const fault = classifyOllamaError(new Error('something else'));
  assert.equal(fault.kind, 'unknown');
  assert.equal(fault.suggestClaude, false);
});

await test('formatOllamaFault includes message and recovery', () => {
  const fault = classifyOllamaError(new Error('ECONNREFUSED'));
  const text = formatOllamaFault(fault);
  assert.ok(text.includes('[ollama]'));
  assert.ok(text.includes('ollama serve'));
});

await test('isOllamaDown: true for not_running', () => {
  assert.ok(isOllamaDownFn(new Error('ECONNREFUSED')));
});

await test('isOllamaDown: true for timeout', () => {
  assert.ok(isOllamaDownFn(new Error('ETIMEDOUT')));
});

await test('isOllamaDown: false for model_missing', () => {
  assert.ok(!isOllamaDownFn(new Error('404 not found')));
});

await test('classifyDaemonError: ENOENT → not_running', () => {
  const fault = classifyDaemonError(new Error('ENOENT'));
  assert.equal(fault.kind, 'not_running');
  assert.ok(fault.disableTools);
});

await test('classifyDaemonError: ECONNREFUSED → not_running', () => {
  const fault = classifyDaemonError(new Error('ECONNREFUSED'));
  assert.equal(fault.kind, 'not_running');
});

await test('classifyDaemonError: kuzu → kuzu_corrupt', () => {
  const fault = classifyDaemonError(new Error('kuzu database error'));
  assert.equal(fault.kind, 'kuzu_corrupt');
  assert.ok(fault.disableTools);
});

await test('classifyDaemonError: timed out → crashed', () => {
  const fault = classifyDaemonError(new Error('request timed out'));
  assert.equal(fault.kind, 'crashed');
});

await test('classifyDaemonError: other → unknown', () => {
  const fault = classifyDaemonError(new Error('weird'));
  assert.equal(fault.kind, 'unknown');
  assert.equal(fault.disableTools, false);
});

await test('formatDaemonFault includes recovery instruction', () => {
  const fault = classifyDaemonError(new Error('ENOENT'));
  const text = formatDaemonFault(fault);
  assert.ok(text.includes('[daemon]'));
  assert.ok(text.includes('insrc daemon start'));
});

await test('annotateStale prepends [stale]', () => {
  const result = annotateStale('some graph data');
  assert.ok(result.startsWith('[stale]'));
  assert.ok(result.includes('insrc repo reindex'));
});

await test('annotateStale returns empty for empty input', () => {
  assert.equal(annotateStale(''), '');
});

// ===========================================================================
// Summary
// ===========================================================================

console.log(`\n── Summary: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
