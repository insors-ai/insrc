#!/usr/bin/env tsx
/**
 * Minimal test: can Ollama (qwen3-coder) use the Bash tool to run kubectl?
 *
 * Run: npx tsx scripts/test-ollama-bash.ts
 */

import { OllamaProvider } from '../src/agent/providers/ollama.js';
import { runToolLoop } from '../src/agent/tools/loop.js';
import type { ToolDefinition, LLMMessage } from '../src/shared/types.js';

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const RED   = '\x1b[31m';
const DIM   = '\x1b[2m';
const RESET = '\x1b[0m';

// ---------------------------------------------------------------------------
// Single Bash tool definition
// ---------------------------------------------------------------------------

const bashTool: ToolDefinition = {
  name: 'Bash',
  description: 'Execute a shell command and return its stdout/stderr.',
  inputSchema: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
      timeout: { type: 'number', description: 'Timeout in ms (default 30000)' },
    },
    required: ['command'],
  },
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const ollama = new OllamaProvider('qwen3-coder:30b');
if (!(await ollama.ping())) {
  console.error(`${RED}Ollama not running.${RESET}`);
  process.exit(1);
}
console.log(`${GREEN}✓${RESET} Ollama reachable\n`);

const messages: LLMMessage[] = [
  {
    role: 'system',
    content: `You are a DevOps assistant. Use the Bash tool to run shell commands. Always use the tool — never guess output.`,
  },
  {
    role: 'user',
    content: 'Run "kubectl get namespaces" and show me the output.',
  },
];

console.log(`${CYAN}Prompt:${RESET} Run "kubectl get namespaces" via Bash tool\n`);

const result = await runToolLoop(messages, {
  provider: ollama,
  tools: [bashTool],
  intent: 'kubectl',
  permissionMode: 'auto-accept',
  maxTokens: 2048,
  onToolCall: (call, _v) => {
    console.log(`${DIM}→ tool call: ${call.name}(${JSON.stringify(call.input)})${RESET}`);
  },
  onToolResult: (call, res) => {
    const preview = res.content.slice(0, 300);
    console.log(`${DIM}← result (${res.isError ? 'ERROR' : 'ok'}): ${preview}${RESET}\n`);
  },
});

console.log(`${CYAN}━━━ Response ━━━${RESET}`);
console.log(result.response);
console.log(`\n${DIM}Tool iterations: ${result.iterations}, hit limit: ${result.hitLimit}${RESET}`);

process.exit(0);
