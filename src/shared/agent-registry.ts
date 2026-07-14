/**
 * Canonical registry of agent families recognised by the daemon + IDE.
 *
 * Ownership in the todos framework (plans/todo-framework.md), transfer
 * validation, frontmatter validation, and any other surface that needs
 * to ask "is this a real agent id?" reads from this module. No other
 * file may hard-code an agent-family string list -- everything imports
 * `AGENT_REGISTRY` / `AgentFamily` from here so that the set of
 * families has one authoritative source.
 *
 * Families are coarse-grained. Variants (e.g. `pair` / `delegate` under
 * `implementation`; the five brainstorm sub-categories under
 * `brainstorm`) are runtime implementation details inside each family's
 * controller(s) and never appear as owner ids -- they are private to
 * the family, not part of the registry.
 *
 * Helper roles that aren't user-facing families (e.g. the `classifier`
 * used for step-provider routing) are intentionally excluded: they can
 * live in `agent-steps.ts` alongside the families but cannot own a
 * todo list or be a transfer target.
 */

export type AgentFamily =
  | 'chat'
  | 'implementation'
  | 'brainstorm'
  | 'designer'
  | 'planner'
  | 'tester'
  | 'research'
  | 'debugging'
  | 'deployment'
  | 'code-analyzer'
  | 'data-analyzer'
  | 'handoff'
  | 'meta-task'
  | 'system';

export type AgentFamilyCategory =
  | 'coding'   // writes / modifies source code
  | 'spec'     // produces specification artifacts (requirements, design, plan)
  | 'exec'     // runs executables / tests
  | 'infra'    // shell-driven infra / deploy / release operations
  | 'meta';    // framework-level or cross-cutting (chat, research, system)

export interface AgentFamilyMeta {
  readonly id: AgentFamily;
  readonly displayName: string;
  readonly category: AgentFamilyCategory;
  /** One-line description used in UI hints and transfer-history rows. */
  readonly description: string;
  /** Optional codicon name. Empty / omitted for text-only badges. */
  readonly icon?: string | undefined;
  /** When true, the todos pane suppresses the per-item "+ Add comment"
   *  affordance for lists owned by this family. Used by families that
   *  route user feedback through a dedicated surface (e.g. the Code
   *  Analyzer's Report Pane) instead of the framework's comment
   *  channel. Defaults to false. */
  readonly suppressTodoComments?: boolean | undefined;
}

export const AGENT_REGISTRY: Readonly<Record<AgentFamily, AgentFamilyMeta>> = {
  chat: {
    id: 'chat',
    displayName: 'Chat',
    category: 'meta',
    description: 'Default conversational controller; handles generic Q&A without a specialised pipeline.',
    icon: 'comment-discussion',
  },
  implementation: {
    id: 'implementation',
    displayName: 'Implementation',
    category: 'coding',
    description: 'Writes, refactors, and debugs code. Runs the pair variant for single-scope work, the delegate variant for batch-scope work.',
    icon: 'code',
  },
  brainstorm: {
    id: 'brainstorm',
    displayName: 'Brainstorm',
    category: 'spec',
    description: 'Iterative idea generation. Sub-categories (requirements / general / design / implementation / testing) are chosen at classification time and stay internal.',
    icon: 'lightbulb',
  },
  designer: {
    id: 'designer',
    displayName: 'Designer',
    category: 'spec',
    description: 'Turns requirements into a structured design doc through extract → enhance → sketch → review → detail steps.',
    icon: 'tools',
  },
  planner: {
    id: 'planner',
    displayName: 'Planner',
    category: 'spec',
    description: 'Produces an ordered implementation plan from a design or requirements input.',
    icon: 'list-ordered',
  },
  tester: {
    id: 'tester',
    displayName: 'Tester',
    category: 'exec',
    description: 'Scenario planning, test authoring, and run-and-fix loops. Hands implementation bugs back to the implementation family.',
    icon: 'beaker',
  },
  research: {
    id: 'research',
    displayName: 'Research',
    category: 'meta',
    description: 'Read-only exploration of code and docs; answers informational questions without mutating anything.',
    icon: 'search',
  },
  debugging: {
    id: 'debugging',
    displayName: 'Debugging',
    category: 'coding',
    description: 'Investigates a reported issue end-to-end; may hand off to the implementation family once the root cause is known.',
    icon: 'bug',
  },
  deployment: {
    id: 'deployment',
    displayName: 'Deployment',
    category: 'infra',
    description: 'Shell-driven deploy / release / infra operations; wraps the command-extraction pipeline.',
    icon: 'rocket',
  },
  'code-analyzer': {
    id: 'code-analyzer',
    displayName: 'Code Analyzer',
    category: 'meta',
    description: 'Read-only structural / semantic analysis of the active repo. Cloud-orchestrated decomposition, local per-task tool loop, local synthesis. Independent of the research family (which covers web / external info).',
    icon: 'graph',
    suppressTodoComments: true,
  },
  'data-analyzer': {
    id: 'data-analyzer',
    displayName: 'Data Analyzer',
    category: 'meta',
    description: 'Read-only analysis of registered DB connections: live schema introspection, sample-shape inference, lineage between code and tables, expected-vs-live drift, ER topology. Cloud-orchestrated decomposition, local per-task tool loop, local synthesis. Independent of the Code Analyzer.',
    icon: 'database',
    suppressTodoComments: true,
  },
  handoff: {
    id: 'handoff',
    displayName: 'Handoff',
    category: 'coding',
    description: 'External coding agent (Claude Code / Codex) handoff pipeline. Spec assembly, worktree spawn, audit, and diff review. Each handoff run owns a TodoList capturing stage progress + the final report.',
    icon: 'arrow-swap',
    suppressTodoComments: true,
  },
  'meta-task': {
    id: 'meta-task',
    displayName: 'Meta-task',
    category: 'meta',
    description: 'Structured multi-step task orchestrator above /handoff. Decomposes a high-level intent (design / plan / implement / migrate / review) into ordered steps; each step runs a two-phase context-then-task cycle with the cloud LLM declaring sufficiency and the local LLM building context on demand.',
    icon: 'list-tree',
    suppressTodoComments: true,
  },
  system: {
    id: 'system',
    displayName: 'System',
    category: 'meta',
    description: 'Framework-reserved owner for daemon-generated lists and maintenance jobs. No user-facing controller.',
    icon: 'gear',
  },
};

// Exhaustiveness check: confirms every AgentFamily has a registry row.
// Adding a new member to the union without a corresponding entry in
// AGENT_REGISTRY above fails here at build time.
const _exhaustivenessCheck: Record<AgentFamily, true> = {
  chat: true, implementation: true, brainstorm: true, designer: true,
  planner: true, tester: true, research: true, debugging: true,
  deployment: true, 'code-analyzer': true, 'data-analyzer': true,
  handoff: true, 'meta-task': true, system: true,
};
void _exhaustivenessCheck;

/** Every family id in declaration order. */
export const AGENT_FAMILIES: readonly AgentFamily[] =
  Object.keys(AGENT_REGISTRY) as AgentFamily[];

/** True if the given string is a registered agent family id. */
export function isAgentFamily(id: string): id is AgentFamily {
  return Object.prototype.hasOwnProperty.call(AGENT_REGISTRY, id);
}

/** Lookup metadata for a family. Returns `undefined` for unknown ids. */
export function findAgentFamily(id: string): AgentFamilyMeta | undefined {
  return isAgentFamily(id) ? AGENT_REGISTRY[id] : undefined;
}
