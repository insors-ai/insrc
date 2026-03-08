import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { exec } from 'node:child_process';
import { dirname, join, relative } from 'node:path';
import type { ToolCall, ToolResult } from '../../shared/types.js';
import { getTool } from './registry.js';
import { mcpCall } from './mcp-client.js';

// ---------------------------------------------------------------------------
// Tool Executor — dispatches tool calls to builtin or MCP backends
//
// Builtin tools: Read, Write, Edit, Glob, Grep, Bash, WebSearch, WebFetch
// MCP tools: graph_*, plan_* → forwarded to daemon via mcpCall()
// ---------------------------------------------------------------------------

const DEFAULT_BASH_TIMEOUT = 120_000;

/**
 * Execute a single tool call and return the result.
 * Never throws — errors are returned as `{ isError: true }` results.
 */
export async function executeTool(call: ToolCall): Promise<ToolResult> {
  const tool = getTool(call.name);
  if (!tool) {
    return {
      toolCallId: call.id,
      content: `Unknown tool: ${call.name}`,
      isError: true,
    };
  }

  try {
    if (tool.backend === 'mcp') {
      const result = await mcpCall(call.name, call.input);
      return {
        toolCallId: call.id,
        content: result.content,
        isError: result.isError,
      };
    }

    // Builtin tools
    const content = await executeBuiltin(call);
    return { toolCallId: call.id, content };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      toolCallId: call.id,
      content: `[error] ${call.name}: ${msg}`,
      isError: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Builtin tool implementations
// ---------------------------------------------------------------------------

async function executeBuiltin(call: ToolCall): Promise<string> {
  switch (call.name) {
    case 'Read':   return builtinRead(call.input);
    case 'Write':  return builtinWrite(call.input);
    case 'Edit':   return builtinEdit(call.input);
    case 'Glob':   return builtinGlob(call.input);
    case 'Grep':   return builtinGrep(call.input);
    case 'Bash':   return builtinBash(call.input);
    case 'WebSearch': return builtinWebSearch(call.input);
    case 'WebFetch':  return builtinWebFetch(call.input);
    default:
      throw new Error(`No builtin handler for: ${call.name}`);
  }
}

// --- Read ---

async function builtinRead(input: Record<string, unknown>): Promise<string> {
  const filePath = input['file_path'] as string;
  if (!filePath) throw new Error('file_path is required');

  const content = await readFile(filePath, 'utf-8');
  const lines = content.split('\n');

  const offset = typeof input['offset'] === 'number' ? input['offset'] : 0;
  const limit = typeof input['limit'] === 'number' ? input['limit'] : lines.length;

  const slice = lines.slice(offset, offset + limit);
  return slice.map((line, i) => `${String(offset + i + 1).padStart(6)}→${line}`).join('\n');
}

// --- Write ---

async function builtinWrite(input: Record<string, unknown>): Promise<string> {
  const filePath = input['file_path'] as string;
  const content = input['content'] as string;
  if (!filePath) throw new Error('file_path is required');
  if (typeof content !== 'string') throw new Error('content is required');

  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, content, 'utf-8');
  return `Wrote ${content.split('\n').length} lines to ${filePath}`;
}

// --- Edit ---

async function builtinEdit(input: Record<string, unknown>): Promise<string> {
  const filePath = input['file_path'] as string;
  const oldString = input['old_string'] as string;
  const newString = input['new_string'] as string;
  const replaceAll = input['replace_all'] === true;

  if (!filePath) throw new Error('file_path is required');
  if (typeof oldString !== 'string') throw new Error('old_string is required');
  if (typeof newString !== 'string') throw new Error('new_string is required');

  const content = await readFile(filePath, 'utf-8');

  if (!content.includes(oldString)) {
    throw new Error('old_string not found in file');
  }

  const updated = replaceAll
    ? content.replaceAll(oldString, newString)
    : content.replace(oldString, newString);

  await writeFile(filePath, updated, 'utf-8');

  const oldLines = oldString.split('\n').length;
  const newLines = newString.split('\n').length;
  return `Edited ${filePath}: replaced ${oldLines} lines with ${newLines} lines`;
}

// --- Glob ---

async function builtinGlob(input: Record<string, unknown>): Promise<string> {
  const pattern = input['pattern'] as string;
  if (!pattern) throw new Error('pattern is required');

  const cwd = typeof input['path'] === 'string' ? input['path'] : process.cwd();

  // Use find + shell glob matching via bash
  // Escaping handled by single-quoting the pattern
  const safePattern = pattern.replace(/'/g, "'\\''");
  const safeCwd = cwd.replace(/'/g, "'\\''");
  const output = await runShell(`find '${safeCwd}' -type f -path '*/${safePattern}' 2>/dev/null | head -500 || true`, 10_000)
    .catch(() => '');

  // If find glob doesn't work well, fall back to recursive readdir + filter
  if (!output.trim()) {
    // Simple fallback: list files recursively and filter by extension/name
    const files = await listFilesRecursive(cwd, pattern);
    if (files.length === 0) return 'No files found.';
    return files.join('\n');
  }

  const matches = output.trim().split('\n').filter(Boolean);
  matches.sort();
  if (matches.length === 0) return 'No files found.';
  return matches.map(f => relative(cwd, f) || f).join('\n');
}

async function listFilesRecursive(dir: string, pattern: string): Promise<string[]> {
  // Convert simple glob to regex: *.ts → /\.ts$/, **/*.ts → /\.ts$/
  const ext = pattern.replace(/\*\*?\/?/g, '');
  const regex = ext ? new RegExp(ext.replace(/\./g, '\\.') + '$') : null;

  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const fullPath = join(entry.parentPath ?? dir, entry.name);
    const relPath = relative(dir, fullPath);
    if (!regex || regex.test(relPath)) {
      results.push(relPath);
    }
  }
  results.sort();
  return results;
}

// --- Grep ---

async function builtinGrep(input: Record<string, unknown>): Promise<string> {
  const pattern = input['pattern'] as string;
  if (!pattern) throw new Error('pattern is required');

  const args = ['rg', '--no-heading', '--line-number'];

  if (typeof input['glob'] === 'string') {
    args.push('--glob', input['glob'] as string);
  }

  if (typeof input['include_context'] === 'number') {
    args.push('-C', String(input['include_context']));
  }

  args.push('--', pattern);

  const searchPath = typeof input['path'] === 'string' ? input['path'] : '.';
  args.push(searchPath);

  return runShell(args.join(' '), 30_000);
}

// --- Bash ---

async function builtinBash(input: Record<string, unknown>): Promise<string> {
  const command = input['command'] as string;
  if (!command) throw new Error('command is required');

  const timeout = typeof input['timeout'] === 'number' ? input['timeout'] : DEFAULT_BASH_TIMEOUT;
  return runShell(command, timeout);
}

// --- WebSearch ---

async function builtinWebSearch(input: Record<string, unknown>): Promise<string> {
  const query = input['query'] as string;
  if (!query) throw new Error('query is required');

  // Uses Brave Search API if key is available
  const braveKey = process.env['BRAVE_API_KEY'];
  if (!braveKey) {
    return '[WebSearch] No BRAVE_API_KEY configured. Set it in env or ~/.insrc/config.json.';
  }

  const limit = typeof input['limit'] === 'number' ? input['limit'] : 5;
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${limit}`;

  const res = await fetch(url, {
    headers: { 'X-Subscription-Token': braveKey, 'Accept': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Brave Search returned ${res.status}: ${res.statusText}`);
  }

  const data = await res.json() as { web?: { results?: Array<{ title: string; url: string; description: string }> } };
  const results = data.web?.results ?? [];

  if (results.length === 0) return 'No results found.';

  return results
    .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.description}`)
    .join('\n\n');
}

// --- WebFetch ---

async function builtinWebFetch(input: Record<string, unknown>): Promise<string> {
  const url = input['url'] as string;
  if (!url) throw new Error('url is required');

  const res = await fetch(url, {
    headers: { 'User-Agent': 'insrc-agent/1.0' },
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }

  const contentType = res.headers.get('content-type') ?? '';
  const text = await res.text();

  // Truncate very large responses
  const MAX_LENGTH = 50_000;
  if (text.length > MAX_LENGTH) {
    return `[${contentType}] (truncated to ${MAX_LENGTH} chars)\n\n${text.slice(0, MAX_LENGTH)}`;
  }

  return text;
}

// ---------------------------------------------------------------------------
// Shell helper
// ---------------------------------------------------------------------------

function runShell(command: string, timeout: number): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(command, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err && !stdout && !stderr) {
        reject(new Error(err.message));
        return;
      }
      // Include both stdout and stderr, plus exit code on error
      let output = stdout;
      if (stderr) output += (output ? '\n' : '') + stderr;
      if (err && 'code' in err) {
        output += `\n[exit code: ${(err as NodeJS.ErrnoException & { code: number }).code}]`;
      }
      resolve(output || '(no output)');
    });
  });
}
