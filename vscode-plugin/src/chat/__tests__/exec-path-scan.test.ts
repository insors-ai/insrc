/**
 * Story E20260925edb76e2e:S002 / t4 — exec-path source-scan (k1/k2 guards).
 *
 * Mirrors extension-wiring.test.ts's regex-over-source idiom: proves the chat
 * execution path spawns the CLI DIRECTLY (node:child_process) and never reaches
 * the daemon IPC or any cloud REST client — the load-bearing k1 (extension-
 * managed, bypasses daemon) and k2 (own-CLI-OAuth only, no direct REST)
 * constraints — without needing a runtime.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/exec-path-scan.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ADAPTER_TS = join(HERE, '..', 'cli-adapter.ts');
const STREAM_TS = join(HERE, '..', 'stream-events.ts');

const adapterSrc = () => readFileSync(ADAPTER_TS, 'utf8');

test('the adapter spawns the CLI directly via node:child_process (k1)', () => {
  const src = adapterSrc();
  assert.match(src, /from 'node:child_process'/, 'imports node:child_process');
  assert.match(src, /nodeChildSpawn\(/, 'the production spawner calls child_process spawn');
});

test('the exec path never reaches the daemon IPC (k1: extension-managed, bypasses daemon)', () => {
  const src = adapterSrc();
  assert.doesNotMatch(src, /daemon\.sock/, 'no daemon socket');
  assert.doesNotMatch(src, /IpcClient|ipcClient|client\.(call|request)\(/, 'no daemon IPC client call');
  assert.doesNotMatch(src, /workflow_run|workflow_step|analyze_step/, 'no daemon workflow/analyze IPC (grounding is via the CLI\'s own MCP)');
});

test('the exec path makes no direct cloud REST call (k2: own-CLI-OAuth only)', () => {
  const src = adapterSrc();
  assert.doesNotMatch(src, /undici|node-fetch/, 'no HTTP client library');
  assert.doesNotMatch(src, /\bfetch\(/, 'no fetch()');
  assert.doesNotMatch(src, /https?:\/\/api\.(anthropic|openai)\.com/, 'no cloud REST endpoint');
  assert.doesNotMatch(src, /apiKey|api_key|Authorization:/i, 'no api key / auth header handling');
});

test('the adapter is vscode-free (import-scan)', () => {
  const src = adapterSrc();
  assert.doesNotMatch(src, /from 'vscode'/, 'no vscode import in the adapter');
  assert.doesNotMatch(readFileSync(STREAM_TS, 'utf8'), /from 'vscode'/, 'no vscode import in the schema');
});

test('Ollama is never a registrable provider (k4)', () => {
  const src = adapterSrc();
  // The ProviderId union is exactly the two agentic CLIs, and the registry loop
  // iterates exactly them — 'ollama' is not a value anywhere in the code (prose
  // comments documenting its EXCLUSION are allowed and expected).
  assert.match(src, /type ProviderId = 'claude' \| 'codex'/, 'ProviderId is exactly claude|codex');
  assert.match(src, /for \(const id of \['claude', 'codex'\] as const\)/, 'the registry iterates exactly the two agentic CLIs');
  const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(codeOnly, /ollama/i, "'ollama' never appears in code (only in exclusion comments)");
});
