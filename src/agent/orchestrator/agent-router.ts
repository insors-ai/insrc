import type { Intent, PersonaName } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Intent → Agent Persona routing
//
// From design/agent.html:
//   The orchestrator selects the appropriate persona based on the classified
//   intent. Personas are stateless across turns — they receive a fully
//   assembled context package and return a structured result.
//
// Some intents are handled directly by the orchestrator (no persona):
//   - graph: direct MCP query, no LLM needed
// ---------------------------------------------------------------------------

/**
 * Route result — which persona handles this intent (if any).
 */
export interface AgentRouteResult {
  /** The persona that handles this intent, or null if orchestrator-handled */
  persona: PersonaName | null;
  /** The intent being routed */
  intent: Intent;
}

/**
 * Map an intent to the agent persona that handles it.
 *
 * From design/agent.html intent taxonomy:
 *   Designer:  requirements, design, review
 *   Planner:   plan
 *   Developer: implement, refactor, debug, research, document
 *   Tester:    test
 *   Deployer:  deploy, release, infra
 *   Orchestrator (null): graph
 */
export function selectAgent(intent: Intent): AgentRouteResult {
  switch (intent) {
    // Designer persona — creative & architectural intents
    case 'requirements':
    case 'design':
    case 'review':
    case 'brainstorm':
      return { persona: 'designer', intent };

    // Planner persona — plan generation & management
    case 'plan':
      return { persona: 'planner', intent };

    // Developer persona — code production & exploration intents
    case 'implement':
    case 'refactor':
    case 'debug':
    case 'research':
    case 'document':
      return { persona: 'developer', intent };

    // Tester persona — test generation, execution, fix loop
    case 'test':
      return { persona: 'tester', intent };

    // Deployer persona — deployment, release, infrastructure
    case 'deploy':
    case 'release':
    case 'infra':
      return { persona: 'deployer', intent };

    // Orchestrator handles directly — no persona needed
    case 'graph':
      return { persona: null, intent };
  }
}

/**
 * Intents owned by each persona. Useful for building persona-specific
 * tool schemas and system prompts.
 */
export const PERSONA_INTENTS: Record<PersonaName, readonly Intent[]> = {
  designer:  ['requirements', 'design', 'review'],
  planner:   ['plan'],
  developer: ['implement', 'refactor', 'debug', 'research', 'document'],
  tester:    ['test'],
  deployer:  ['deploy', 'release', 'infra'],
} as const;

/**
 * Intents handled directly by the orchestrator (no persona).
 */
export const ORCHESTRATOR_INTENTS: readonly Intent[] = ['graph'] as const;
