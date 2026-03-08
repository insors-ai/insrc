#!/usr/bin/env tsx
/**
 * Phase 3 LIVE integration test — tool loop against real Ollama.
 * Run with: npx tsx scripts/test-agent-p3-live.ts
 *
 * Requires: ollama running with qwen3-coder:latest
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

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { getToolDefinitions } from '../src/agent/tools/registry.js';
import { runToolLoop } from '../src/agent/tools/loop.js';
import type { LLMMessage, ToolCall, ToolResult } from '../src/shared/types.js';
import type { ValidationResult } from '../src/agent/tools/validator.js';

// ---------------------------------------------------------------------------
// Pre-flight: check Ollama
// ---------------------------------------------------------------------------

const provider = new OllamaProvider('qwen3-coder:latest', 'http://localhost:11434');
const ollamaUp = await provider.ping();

if (!ollamaUp) {
  console.error(`${RED}Ollama is not running. Start it with: ollama serve${RESET}`);
  process.exit(1);
}

console.log(`${GREEN}Ollama connected${RESET} — running live tool loop tests`);

const testDir = join(tmpdir(), 'insrc-live-p3-' + Date.now());
mkdirSync(testDir, { recursive: true });

// Only use builtin tools (no daemon)
const tools = getToolDefinitions({ mcpAvailable: false });

// ═══════════════════════════════════════════════════════════════════════════
// Test 1: Ask the LLM to read a file — it should use the Read tool
// ═══════════════════════════════════════════════════════════════════════════
section('1. LLM reads a file via Read tool');

{
  const testFile = join(testDir, 'greeting.txt');
  writeFileSync(testFile, 'Hello from insrc live test!\n');

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'You are a coding assistant. You have tools available. When you need to read files, run commands, or perform actions, call the appropriate tool. Do NOT output tool calls as text — use the structured tool calling API. Be concise.',
    },
    {
      role: 'user',
      content: `What are the contents of the file ${testFile}?`,
    },
  ];

  const toolCalls: { call: ToolCall; validation: ValidationResult }[] = [];
  const toolResults: { call: ToolCall; result: ToolResult }[] = [];
  let textOutput = '';

  dim('sending to Ollama with tool definitions...');

  const result = await runToolLoop(messages, {
    provider,
    tools,
    intent: 'research',
    permissionMode: 'auto-accept',
    onTextDelta: (delta) => { textOutput += delta; },
    onToolCall: (call, validation) => {
      toolCalls.push({ call, validation });
      dim(`tool call: ${call.name}(${JSON.stringify(call.input).slice(0, 80)})`);
    },
    onToolResult: (call, res) => {
      toolResults.push({ call, result: res });
      dim(`result: ${res.content.slice(0, 80)}${res.content.length > 80 ? '...' : ''}`);
    },
  });

  dim(`iterations: ${result.iterations}, response length: ${result.response.length}`);
  dim(`response: ${result.response.slice(0, 200)}`);

  // Assertions
  assert(result.iterations >= 1, `LLM used tools (${result.iterations} iteration(s))`, 'LLM did not use any tools');

  const readCalls = toolCalls.filter(tc => tc.call.name === 'Read');
  assert(readCalls.length >= 1, `LLM called Read tool (${readCalls.length} time(s))`, 'Read tool not called');

  const readResults = toolResults.filter(tr => tr.call.name === 'Read');
  if (readResults.length > 0) {
    assert(!readResults[0]!.result.isError, 'Read tool succeeded', `Read failed: ${readResults[0]!.result.content}`);
    assert(readResults[0]!.result.content.includes('Hello from insrc'), 'Read returned file content', readResults[0]!.result.content);
  }

  assert(
    result.response.toLowerCase().includes('hello') || result.response.toLowerCase().includes('greeting'),
    'Final response references file content',
    `response: ${result.response.slice(0, 100)}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 2: Ask the LLM to run a bash command
// ═══════════════════════════════════════════════════════════════════════════
section('2. LLM runs a Bash command');

{
  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'You are a helpful assistant with access to tools. Use them when needed. Be concise.',
    },
    {
      role: 'user',
      content: 'Use the Bash tool to run: echo "insrc-live-test-marker". Then tell me the output.',
    },
  ];

  const toolCalls: { call: ToolCall; validation: ValidationResult }[] = [];
  let textOutput = '';

  dim('sending to Ollama...');

  const result = await runToolLoop(messages, {
    provider,
    tools,
    intent: 'research',
    permissionMode: 'auto-accept',
    onTextDelta: (delta) => { textOutput += delta; },
    onToolCall: (call, validation) => {
      toolCalls.push({ call, validation });
      dim(`tool call: ${call.name}(${JSON.stringify(call.input).slice(0, 80)})`);
    },
    onToolResult: (_call, res) => {
      dim(`result: ${res.content.slice(0, 80)}`);
    },
  });

  dim(`iterations: ${result.iterations}`);
  dim(`response: ${result.response.slice(0, 200)}`);

  assert(result.iterations >= 1, `LLM used tools (${result.iterations} iteration(s))`, 'LLM did not use any tools');

  const bashCalls = toolCalls.filter(tc => tc.call.name === 'Bash');
  assert(bashCalls.length >= 1, `LLM called Bash tool (${bashCalls.length} time(s))`, 'Bash tool not called');

  // Check that the Bash call was auto-executed (echo is read-only)
  if (bashCalls.length > 0) {
    assert(
      bashCalls[0]!.validation.action === 'auto-execute',
      'echo command auto-executed (read-only)',
      `validation: ${bashCalls[0]!.validation.action}`,
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Test 3: Ask the LLM to write a file — should trigger mutating validation
// ═══════════════════════════════════════════════════════════════════════════
section('3. LLM writes a file (mutating tool, auto-accept mode)');

{
  const outFile = join(testDir, 'output.txt');

  const messages: LLMMessage[] = [
    {
      role: 'system',
      content: 'You are a helpful assistant with access to tools. Use them when needed. Be concise.',
    },
    {
      role: 'user',
      content: `Use the Write tool to create a file at ${outFile} with the content "written by LLM". Then confirm it was written.`,
    },
  ];

  const toolCalls: { call: ToolCall; validation: ValidationResult }[] = [];

  dim('sending to Ollama...');

  const result = await runToolLoop(messages, {
    provider,
    tools,
    intent: 'implement',
    permissionMode: 'auto-accept',
    onToolCall: (call, validation) => {
      toolCalls.push({ call, validation });
      dim(`tool call: ${call.name} → ${validation.action}`);
    },
    onToolResult: (_call, res) => {
      dim(`result: ${res.content.slice(0, 80)}`);
    },
  });

  dim(`iterations: ${result.iterations}`);
  dim(`response: ${result.response.slice(0, 200)}`);

  assert(result.iterations >= 1, `LLM used tools (${result.iterations} iteration(s))`, 'LLM did not use any tools');

  const writeCalls = toolCalls.filter(tc => tc.call.name === 'Write');
  assert(writeCalls.length >= 1, `LLM called Write tool`, 'Write tool not called');

  // Write is mutating, but auto-accept mode should auto-execute it
  if (writeCalls.length > 0) {
    assert(
      writeCalls[0]!.validation.action === 'auto-execute',
      'Write auto-executed in auto-accept mode',
      `validation: ${writeCalls[0]!.validation.action}`,
    );
  }

  // Verify file was actually written
  try {
    const { readFileSync } = await import('node:fs');
    const content = readFileSync(outFile, 'utf-8');
    assert(content.includes('written by LLM'), 'File was actually written to disk', `content: ${content}`);
  } catch (err) {
    fail(`File not created: ${err instanceof Error ? err.message : err}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════

try {
  rmSync(testDir, { recursive: true, force: true });
} catch { /* ignore */ }

// ═══════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════

console.log(`\n${'═'.repeat(60)}`);
if (failed === 0) {
  console.log(`${GREEN}All ${passed} assertions passed${RESET}`);
} else {
  console.log(`${RED}${failed} failed${RESET}, ${GREEN}${passed} passed${RESET}`);
}
console.log(`${'═'.repeat(60)}\n`);

process.exit(failed > 0 ? 1 : 0);
