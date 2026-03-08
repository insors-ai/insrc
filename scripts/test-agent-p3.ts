#!/usr/bin/env tsx
/**
 * Phase 3 agent tests — tool registry, validator, executor, loop.
 * Run with: npx tsx scripts/test-agent-p3.ts
 *
 * Pure logic tests — no external services required (MCP/daemon tests are mocked).
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

import type { ToolCall } from '../src/shared/types.js';

// ═══════════════════════════════════════════════════════════════════════════
// 1. Tool Registry
// ═══════════════════════════════════════════════════════════════════════════
section('1.1 Registry — getToolDefinitions returns all tools');

import { getToolDefinitions, getTool, getBuiltinTools, getMcpTools } from '../src/agent/tools/registry.js';

{
  const all = getToolDefinitions();
  assert(all.length >= 15, `all tools count = ${all.length} (≥15)`, `expected ≥15, got ${all.length}`);

  const builtinOnly = getToolDefinitions({ mcpAvailable: false });
  assert(builtinOnly.length < all.length, 'mcpAvailable=false filters MCP tools', 'MCP tools not filtered');

  const builtins = getBuiltinTools();
  const mcp = getMcpTools();
  assert(builtins.length + mcp.length === all.length, `builtin(${builtins.length}) + mcp(${mcp.length}) = all(${all.length})`, 'counts mismatch');
}

section('1.2 Registry — getTool lookup');

{
  const read = getTool('Read');
  assert(read !== undefined, 'getTool("Read") found', 'Read not found');
  assert(read!.backend === 'builtin', 'Read is builtin', `Read backend: ${read!.backend}`);

  const graphSearch = getTool('graph_search');
  assert(graphSearch !== undefined, 'getTool("graph_search") found', 'graph_search not found');
  assert(graphSearch!.backend === 'mcp', 'graph_search is mcp', `graph_search backend: ${graphSearch!.backend}`);

  const unknown = getTool('nonexistent_tool');
  assert(unknown === undefined, 'getTool("nonexistent_tool") returns undefined', 'should be undefined');
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Tool Validator — classification
// ═══════════════════════════════════════════════════════════════════════════
section('2.1 Validator — read-only tool classification');

import { classifyToolCall, classifyBashCommand } from '../src/agent/tools/validator.js';

{
  const readOnlyTools = ['Read', 'Glob', 'Grep', 'WebSearch', 'WebFetch', 'graph_entity', 'graph_search', 'graph_callers', 'graph_callees', 'graph_query', 'plan_get'];

  for (const name of readOnlyTools) {
    const call: ToolCall = { id: '1', name, input: {} };
    const result = classifyToolCall(call);
    assert(result === 'read-only', `${name} → read-only`, `${name} → ${result}`);
  }
}

section('2.2 Validator — mutating tool classification');

{
  const mutatingTools = ['Write', 'Edit', 'plan_step_update'];

  for (const name of mutatingTools) {
    const call: ToolCall = { id: '1', name, input: {} };
    const result = classifyToolCall(call);
    assert(result === 'mutating', `${name} → mutating`, `${name} → ${result}`);
  }
}

section('2.3 Validator — Bash command classification');

{
  const readOnlyCmds: [string, string][] = [
    ['git status', 'git status'],
    ['git log --oneline -10', 'git log'],
    ['git diff HEAD~1', 'git diff'],
    ['kubectl get pods', 'kubectl get'],
    ['kubectl logs my-pod', 'kubectl logs'],
    ['npm test', 'npm test'],
    ['npx vitest', 'npx vitest'],
    ['npm run lint', 'npm run lint'],
    ['npm run build', 'npm run build'],
    ['ls -la', 'ls'],
    ['cat README.md', 'cat'],
    ['pwd', 'pwd'],
    ['ps aux', 'ps'],
  ];

  for (const [cmd, label] of readOnlyCmds) {
    const result = classifyBashCommand(cmd);
    assert(result === 'read-only', `bash "${label}" → read-only`, `"${label}" → ${result}`);
  }

  const mutatingCmds: [string, string][] = [
    ['rm -rf /tmp/test', 'rm -rf'],
    ['kubectl apply -f deploy.yaml', 'kubectl apply'],
    ['git push origin main', 'git push'],
    ['curl -X POST http://example.com', 'curl POST'],
    ['npm install lodash', 'npm install'],
    ['docker run alpine', 'docker run'],
  ];

  for (const [cmd, label] of mutatingCmds) {
    const result = classifyBashCommand(cmd);
    assert(result === 'mutating', `bash "${label}" → mutating`, `"${label}" → ${result}`);
  }
}

section('2.4 Validator — Bash via classifyToolCall');

{
  const readCall: ToolCall = { id: '1', name: 'Bash', input: { command: 'git status' } };
  assert(classifyToolCall(readCall) === 'read-only', 'Bash("git status") → read-only', 'wrong');

  const mutCall: ToolCall = { id: '2', name: 'Bash', input: { command: 'rm -rf /tmp' } };
  assert(classifyToolCall(mutCall) === 'mutating', 'Bash("rm -rf /tmp") → mutating', 'wrong');

  const noCmd: ToolCall = { id: '3', name: 'Bash', input: {} };
  assert(classifyToolCall(noCmd) === 'mutating', 'Bash(no command) → mutating', 'wrong');
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Tool Validator — validateToolCall pipeline
// ═══════════════════════════════════════════════════════════════════════════
section('3.1 Validator — validateToolCall auto-execute for read-only');

import { validateToolCall } from '../src/agent/tools/validator.js';

{
  const call: ToolCall = { id: '1', name: 'Read', input: { file_path: '/tmp/test.txt' } };
  const result = await validateToolCall(call, { intent: 'research', mode: 'validate' });
  assert(result.action === 'auto-execute', 'Read auto-executes in validate mode', `got ${result.action}`);
}

section('3.2 Validator — validateToolCall auto-accept mode skips validation');

{
  const call: ToolCall = { id: '1', name: 'Write', input: { file_path: '/tmp/test.txt', content: 'hello' } };
  const result = await validateToolCall(call, { intent: 'implement', mode: 'auto-accept' });
  assert(result.action === 'auto-execute', 'Write auto-executes in auto-accept mode', `got ${result.action}`);
}

section('3.3 Validator — validateToolCall validate mode without validator');

{
  const call: ToolCall = { id: '1', name: 'Edit', input: { file_path: '/tmp/test.txt', old_string: 'a', new_string: 'b' } };
  const result = await validateToolCall(call, { intent: 'refactor', mode: 'validate' });
  // No validator provided → auto-execute with warning
  assert(result.action === 'auto-execute', 'Edit auto-executes when no validator available', `got ${result.action}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Tool Executor — builtin tools
// ═══════════════════════════════════════════════════════════════════════════
section('4.1 Executor — Read tool');

import { executeTool } from '../src/agent/tools/executor.js';
import { writeFileSync, mkdirSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testDir = join(tmpdir(), 'insrc-test-p3-' + Date.now());
mkdirSync(testDir, { recursive: true });

{
  const testFile = join(testDir, 'read-test.txt');
  writeFileSync(testFile, 'line1\nline2\nline3\n');

  const result = await executeTool({ id: 'r1', name: 'Read', input: { file_path: testFile } });
  assert(!result.isError, 'Read succeeds', `error: ${result.content}`);
  assert(result.content.includes('line1'), 'Read returns file content', 'content missing');
  assert(result.content.includes('line2'), 'Read returns multiple lines', 'line2 missing');
}

section('4.2 Executor — Read with offset/limit');

{
  const testFile = join(testDir, 'read-test.txt');
  const result = await executeTool({ id: 'r2', name: 'Read', input: { file_path: testFile, offset: 1, limit: 1 } });
  assert(!result.isError, 'Read with offset succeeds', `error: ${result.content}`);
  assert(result.content.includes('line2'), 'Read offset=1 returns line2', result.content);
  assert(!result.content.includes('line1'), 'Read offset=1 skips line1', 'line1 still present');
}

section('4.3 Executor — Read nonexistent file');

{
  const result = await executeTool({ id: 'r3', name: 'Read', input: { file_path: '/nonexistent/file.txt' } });
  assert(result.isError === true, 'Read nonexistent → isError', 'should be error');
}

section('4.4 Executor — Write tool');

{
  const testFile = join(testDir, 'write-test.txt');
  const result = await executeTool({ id: 'w1', name: 'Write', input: { file_path: testFile, content: 'hello world\n' } });
  assert(!result.isError, 'Write succeeds', `error: ${result.content}`);
  assert(result.content.includes('Wrote'), 'Write returns confirmation', result.content);

  // Verify file was written
  const readResult = await executeTool({ id: 'w2', name: 'Read', input: { file_path: testFile } });
  assert(readResult.content.includes('hello world'), 'Written content readable', readResult.content);
}

section('4.5 Executor — Edit tool');

{
  const testFile = join(testDir, 'edit-test.txt');
  writeFileSync(testFile, 'foo bar baz\n');

  const result = await executeTool({
    id: 'e1', name: 'Edit',
    input: { file_path: testFile, old_string: 'bar', new_string: 'qux' },
  });
  assert(!result.isError, 'Edit succeeds', `error: ${result.content}`);

  const readResult = await executeTool({ id: 'e2', name: 'Read', input: { file_path: testFile } });
  assert(readResult.content.includes('qux'), 'Edit replaced content', readResult.content);
  assert(!readResult.content.includes('bar'), 'Edit removed old content', readResult.content);
}

section('4.6 Executor — Edit old_string not found');

{
  const testFile = join(testDir, 'edit-test.txt');
  const result = await executeTool({
    id: 'e3', name: 'Edit',
    input: { file_path: testFile, old_string: 'nonexistent string', new_string: 'replacement' },
  });
  assert(result.isError === true, 'Edit with missing old_string → isError', 'should be error');
}

section('4.7 Executor — Glob tool');

{
  writeFileSync(join(testDir, 'a.ts'), '');
  writeFileSync(join(testDir, 'b.ts'), '');
  writeFileSync(join(testDir, 'c.js'), '');

  const result = await executeTool({
    id: 'g1', name: 'Glob',
    input: { pattern: '*.ts', path: testDir },
  });
  assert(!result.isError, 'Glob succeeds', `error: ${result.content}`);
  assert(result.content.includes('a.ts'), 'Glob finds a.ts', result.content);
  assert(result.content.includes('b.ts'), 'Glob finds b.ts', result.content);
  assert(!result.content.includes('c.js'), 'Glob excludes c.js', result.content);
}

section('4.8 Executor — Bash tool');

{
  const result = await executeTool({
    id: 'b1', name: 'Bash',
    input: { command: 'echo "hello from bash"' },
  });
  assert(!result.isError, 'Bash succeeds', `error: ${result.content}`);
  assert(result.content.includes('hello from bash'), 'Bash returns stdout', result.content);
}

section('4.9 Executor — Bash failing command');

{
  const result = await executeTool({
    id: 'b2', name: 'Bash',
    input: { command: 'exit 1' },
  });
  // exit 1 with no output should error
  assert(result.isError === true, 'Bash exit 1 → isError', `isError=${result.isError}`);
}

section('4.10 Executor — unknown tool');

{
  const result = await executeTool({ id: 'u1', name: 'UnknownTool', input: {} });
  assert(result.isError === true, 'Unknown tool → isError', 'should be error');
  assert(result.content.includes('Unknown tool'), 'Error message mentions unknown tool', result.content);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Tool Loop Runner
// ═══════════════════════════════════════════════════════════════════════════
section('5.1 Loop — simple text response (no tool use)');

import { runToolLoop } from '../src/agent/tools/loop.js';
import type { LLMMessage, LLMResponse, CompletionOpts, LLMProvider } from '../src/shared/types.js';

function mockProvider(responses: LLMResponse[]): LLMProvider {
  let callIdx = 0;
  return {
    supportsTools: true,
    async complete(_msgs: LLMMessage[], _opts?: CompletionOpts): Promise<LLMResponse> {
      return responses[callIdx++]!;
    },
    async embed(): Promise<number[]> { return []; },
    async *stream(_msgs: LLMMessage[], _opts?: CompletionOpts): AsyncIterable<string> {
      yield responses[callIdx++]!.text;
    },
  };
}

{
  const provider = mockProvider([
    { text: 'Hello, I can help with that.', stopReason: 'end_turn' },
  ]);

  const result = await runToolLoop(
    [{ role: 'user', content: 'hi' }],
    {
      provider,
      tools: [],
      intent: 'research',
      permissionMode: 'auto-accept',
    },
  );

  assert(result.response === 'Hello, I can help with that.', 'Simple response returned', result.response);
  assert(result.iterations === 0, 'No iterations for simple response', `iterations=${result.iterations}`);
  assert(!result.hitLimit, 'Did not hit limit', 'hitLimit should be false');
}

section('5.2 Loop — one tool call then final response');

{
  const testFile = join(testDir, 'loop-read.txt');
  writeFileSync(testFile, 'loop content here\n');

  const provider = mockProvider([
    // First response: tool call
    {
      text: 'Let me read that file.',
      toolCalls: [{ id: 'tc1', name: 'Read', input: { file_path: testFile } }],
      stopReason: 'tool_use',
    },
    // Second response: final answer
    {
      text: 'The file contains "loop content here".',
      stopReason: 'end_turn',
    },
  ]);

  let toolCallSeen = false;
  let toolResultSeen = false;

  const result = await runToolLoop(
    [{ role: 'user', content: 'read the file' }],
    {
      provider,
      tools: getToolDefinitions({ mcpAvailable: false }),
      intent: 'research',
      permissionMode: 'auto-accept',
      onToolCall: () => { toolCallSeen = true; },
      onToolResult: () => { toolResultSeen = true; },
    },
  );

  assert(result.iterations === 1, 'One tool iteration', `iterations=${result.iterations}`);
  assert(toolCallSeen, 'onToolCall callback fired', 'callback not called');
  assert(toolResultSeen, 'onToolResult callback fired', 'callback not called');
  assert(result.response.includes('loop content here'), 'Final response references file content', result.response);
}

section('5.3 Loop — rejected tool call');

{
  const provider = mockProvider([
    {
      text: '',
      toolCalls: [{ id: 'tc1', name: 'Bash', input: { command: 'rm -rf /' } }],
      stopReason: 'tool_use',
    },
    { text: 'I cannot execute that command.', stopReason: 'end_turn' },
  ]);

  // Mock validator that always rejects
  const mockValidator: LLMProvider = {
    supportsTools: false,
    async complete(): Promise<LLMResponse> {
      return { text: 'REJECTED: dangerous command', stopReason: 'end_turn' };
    },
    async embed(): Promise<number[]> { return []; },
    async *stream(): AsyncIterable<string> { yield ''; },
  };

  let rejectedCall = false;

  const result = await runToolLoop(
    [{ role: 'user', content: 'delete everything' }],
    {
      provider,
      tools: getToolDefinitions({ mcpAvailable: false }),
      intent: 'implement',
      permissionMode: 'validate',
      validator: mockValidator,
      onToolCall: (_call, validation) => {
        if (validation.action === 'rejected') rejectedCall = true;
      },
    },
  );

  assert(rejectedCall, 'Rejected tool call detected', 'rejection not detected');
  assert(result.iterations === 1, 'Still counts as an iteration', `iterations=${result.iterations}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. MCP Client — ping/availability (no daemon needed)
// ═══════════════════════════════════════════════════════════════════════════
section('6.1 MCP Client — isAvailable starts as null');

import { isAvailable, resetAvailability } from '../src/agent/tools/mcp-client.js';

{
  resetAvailability();
  const avail = isAvailable();
  assert(avail === null, 'isAvailable() starts as null', `got ${avail}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════

try {
  const { rmSync } = await import('node:fs');
  rmSync(testDir, { recursive: true, force: true });
} catch { /* ignore cleanup errors */ }

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
