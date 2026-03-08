import type { ToolDefinition } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Tool backend types
// ---------------------------------------------------------------------------

export type ToolBackend = 'builtin' | 'mcp';

export interface RegisteredTool {
  definition: ToolDefinition;
  backend: ToolBackend;
}

// ---------------------------------------------------------------------------
// Tool definitions — schemas for all tools the LLM can call
// ---------------------------------------------------------------------------

const BUILTIN_TOOLS: ToolDefinition[] = [
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
    name: 'Write',
    description: 'Write content to a file, creating it if it does not exist.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to write' },
        content: { type: 'string', description: 'The content to write' },
      },
      required: ['file_path', 'content'],
    },
  },
  {
    name: 'Edit',
    description: 'Replace a string in a file. The old_string must match exactly.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Absolute path to the file to edit' },
        old_string: { type: 'string', description: 'The exact text to find and replace' },
        new_string: { type: 'string', description: 'The replacement text' },
        replace_all: { type: 'boolean', description: 'Replace all occurrences (default false)' },
      },
      required: ['file_path', 'old_string', 'new_string'],
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
    description: 'Execute a shell command and return its output.',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute' },
        timeout: { type: 'number', description: 'Timeout in milliseconds (default 120000)' },
      },
      required: ['command'],
    },
  },
  {
    name: 'WebSearch',
    description: 'Search the web and return results.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 5)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'WebFetch',
    description: 'Fetch the content of a URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
      },
      required: ['url'],
    },
  },
];

const MCP_TOOLS: ToolDefinition[] = [
  {
    name: 'graph_entity',
    description: 'Fetch a single entity by ID. Returns body, signature, file, line range, metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Entity ID (SHA256 hex)' },
      },
      required: ['id'],
    },
  },
  {
    name: 'graph_search',
    description: 'Vector similarity search over entity embeddings. Returns ranked entities with scores.',
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
        full_body: { type: 'boolean', description: 'Include full body text (default false — signatures only)' },
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
        full_body: { type: 'boolean', description: 'Include full body text (default false — signatures only)' },
      },
      required: ['entity'],
    },
  },
  {
    name: 'graph_query',
    description: 'Execute an arbitrary Cypher query against the knowledge graph.',
    inputSchema: {
      type: 'object',
      properties: {
        cypher: { type: 'string', description: 'Cypher query string' },
      },
      required: ['cypher'],
    },
  },
  {
    name: 'plan_get',
    description: 'Fetch the active plan and its steps with current state for a repo.',
    inputSchema: {
      type: 'object',
      properties: {
        repo: { type: 'string', description: 'Repo path (optional — uses session repo if omitted)' },
      },
      required: [],
    },
  },
  {
    name: 'plan_step_update',
    description: 'Transition a plan step state (pending → in_progress → done/failed/skipped).',
    inputSchema: {
      type: 'object',
      properties: {
        step_id: { type: 'string', description: 'Plan step ID' },
        status: { type: 'string', enum: ['pending', 'in_progress', 'done', 'failed', 'skipped'], description: 'New status' },
        note: { type: 'string', description: 'Optional note about the transition' },
      },
      required: ['step_id', 'status'],
    },
  },
  {
    name: 'plan_next_step',
    description: 'Get the next unblocked step for a plan (first pending step with all dependencies satisfied).',
    inputSchema: {
      type: 'object',
      properties: {
        planId: { type: 'string', description: 'Plan ID' },
      },
      required: ['planId'],
    },
  },
];

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const REGISTRY: RegisteredTool[] = [
  ...BUILTIN_TOOLS.map(d => ({ definition: d, backend: 'builtin' as const })),
  ...MCP_TOOLS.map(d => ({ definition: d, backend: 'mcp' as const })),
];

const REGISTRY_MAP = new Map<string, RegisteredTool>(
  REGISTRY.map(t => [t.definition.name, t]),
);

/**
 * Get all tool definitions for injection into LLM prompts.
 * Optionally filter to only tools whose backend is available.
 */
export function getToolDefinitions(opts?: { mcpAvailable?: boolean }): ToolDefinition[] {
  if (opts?.mcpAvailable === false) {
    return REGISTRY
      .filter(t => t.backend === 'builtin')
      .map(t => t.definition);
  }
  return REGISTRY.map(t => t.definition);
}

/**
 * Look up a registered tool by name.
 */
export function getTool(name: string): RegisteredTool | undefined {
  return REGISTRY_MAP.get(name);
}

/**
 * Get just the builtin tool definitions.
 */
export function getBuiltinTools(): ToolDefinition[] {
  return BUILTIN_TOOLS;
}

/**
 * Get just the MCP (daemon) tool definitions.
 */
export function getMcpTools(): ToolDefinition[] {
  return MCP_TOOLS;
}
