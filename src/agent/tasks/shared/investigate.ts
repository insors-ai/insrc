/**
 * Reusable investigation helper — tool-calling loop for code understanding.
 *
 * Wraps `runToolLoop` with a constrained read-only tool set so agents can
 * autonomously explore the codebase without mutating anything.
 *
 * Used by both Pair (analyze step) and Delegate (execute-step investigation).
 */

import type { LLMProvider, LLMMessage, ToolDefinition } from '../../../shared/types.js';
import type { StepContext } from '../../framework/types.js';
import { runToolLoop, type ToolLoopResult } from '../../tools/loop.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InvestigationResult {
  /** LLM's final summary of what it found */
  summary: string;
  /** Number of tool calls executed */
  toolCallCount: number;
  /** Whether the tool loop hit its iteration limit */
  hitLimit: boolean;
  /** Raw messages produced during investigation (for context injection) */
  messages: LLMMessage[];
  /** Files examined during investigation (from Read/Glob tool calls) */
  filesExamined: string[];
  /** Entity queries made via graph_search calls */
  entitiesFound: string[];
}

export interface InvestigateOpts {
  /** Max tool call iterations (default 10) */
  maxToolCalls?: number | undefined;
  /** Additional tool definitions to include beyond the defaults */
  extraTools?: ToolDefinition[] | undefined;
  /** Override provider (default: use ctx.providers.local) */
  provider?: LLMProvider | undefined;
  /** Additional system prompt context */
  systemSuffix?: string | undefined;
  /** Callback for streaming progress */
  onProgress?: ((msg: string) => void) | undefined;
}

// ---------------------------------------------------------------------------
// Read-only tool subset for investigation
// ---------------------------------------------------------------------------

const INVESTIGATE_TOOLS: ToolDefinition[] = [
  {
    name: 'Read',
    description: 'Read a file from disk. Returns the file contents.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to read' },
        offset: { type: 'number', description: 'Line number to start reading from (optional)' },
        limit: { type: 'number', description: 'Number of lines to read (optional)' },
      },
      required: ['file_path'],
    },
  },
  {
    name: 'Glob',
    description: 'Search for files by glob pattern. Returns matching file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob pattern (e.g. "src/**/*.ts")' },
        path: { type: 'string', description: 'Base directory to search in (optional)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'Grep',
    description: 'Search file contents by regex pattern. Returns matching lines or file paths.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Regex pattern to search for' },
        path: { type: 'string', description: 'File or directory to search in (optional)' },
        glob: { type: 'string', description: 'Glob to filter files (e.g. "*.ts") (optional)' },
        include_context: { type: 'number', description: 'Lines of context around matches (optional)' },
      },
      required: ['pattern'],
    },
  },
  {
    name: 'Bash',
    description: 'Execute a read-only shell command (e.g. git log, git diff, ls). Do NOT use for mutations.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'graph_search',
    description: 'Vector similarity search over entity embeddings in the code knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Natural language search query' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        kind: { type: 'string', description: 'Filter by entity kind (optional)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'graph_callers',
    description: 'Return entities that call a given entity, up to N hops.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Entity name or ID' },
        hops: { type: 'number', description: 'Max hop depth (default 1)' },
        full_body: { type: 'boolean', description: 'Include full body text (default false)' },
      },
      required: ['entity'],
    },
  },
  {
    name: 'graph_callees',
    description: 'Return entities called by a given entity, up to N hops.',
    inputSchema: {
      type: 'object',
      properties: {
        entity: { type: 'string', description: 'Entity name or ID' },
        hops: { type: 'number', description: 'Max hop depth (default 1)' },
        full_body: { type: 'boolean', description: 'Include full body text (default false)' },
      },
      required: ['entity'],
    },
  },
];

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const INVESTIGATE_SYSTEM = `You are a code investigation assistant. Your goal is to understand the codebase by reading files, searching code, and querying the knowledge graph.

Rules:
- Use the available tools to explore and understand the code
- Focus on the specific question or area you've been asked about
- Be thorough but efficient — don't read entire files when a grep or graph search suffices
- Do NOT modify any files — this is a read-only investigation
- When done, provide a clear summary of what you found

At the end, summarise your findings concisely — list key files, entities, patterns, and any concerns.`;

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Run an investigation using the tool loop.
 *
 * Gives the LLM read-only tools (Read, Grep, Glob, graph_search, etc.)
 * and lets it autonomously explore the codebase to answer a query.
 */
export async function investigate(
  query: string,
  ctx: StepContext,
  opts?: InvestigateOpts,
): Promise<InvestigationResult> {
  const provider = opts?.provider ?? ctx.providers.local;
  const maxIterations = opts?.maxToolCalls ?? 10;

  const tools = [...INVESTIGATE_TOOLS];
  if (opts?.extraTools) {
    tools.push(...opts.extraTools);
  }

  const systemPrompt = opts?.systemSuffix
    ? `${INVESTIGATE_SYSTEM}\n\n${opts.systemSuffix}`
    : INVESTIGATE_SYSTEM;

  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: query },
  ];

  const filesExamined: string[] = [];
  const entitiesFound: string[] = [];

  const trackToolCall = (call: { name: string; input: Record<string, unknown> }): void => {
    if (call.name === 'Read' && typeof call.input['file_path'] === 'string') {
      filesExamined.push(call.input['file_path']);
    } else if (call.name === 'Glob' && typeof call.input['pattern'] === 'string') {
      filesExamined.push(`glob:${call.input['pattern']}`);
    }
    if (call.name === 'graph_search' && typeof call.input['query'] === 'string') {
      entitiesFound.push(call.input['query']);
    }
  };

  const loopOpts: Parameters<typeof runToolLoop>[1] = {
    provider,
    tools,
    intent: 'investigate',
    permissionMode: 'auto-accept',
    maxTokens: 4000,
  };
  loopOpts.onToolCall = (call) => {
    trackToolCall(call);
    opts?.onProgress?.(`  [investigate] ${call.name}(${summariseInput(call.input)})`);
  };

  const result: ToolLoopResult = await runToolLoop(messages, loopOpts);

  return {
    summary: result.response,
    toolCallCount: result.iterations,
    hitLimit: result.hitLimit,
    messages: result.messages,
    filesExamined,
    entitiesFound,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Produce a short summary of tool input for progress display. */
function summariseInput(input: Record<string, unknown>): string {
  const first = Object.values(input)[0];
  if (typeof first === 'string') {
    return first.length > 60 ? first.slice(0, 57) + '...' : first;
  }
  return JSON.stringify(input).slice(0, 60);
}
