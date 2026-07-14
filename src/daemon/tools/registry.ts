/**
 * Unified tool registry.
 *
 * One place to register, look up, and list tools. The LLM tool-call
 * path (agent/tools/executor.ts) and the controller task path (kind:
 * 'tool') both read from this registry.
 */

import { getLogger } from '../../shared/logger.js';
import type { Tool } from './types.js';

const log = getLogger('tools-registry');

const byId = new Map<string, Tool>();
/** Reverse lookup from alias -> canonical id. */
const aliasToId = new Map<string, string>();

export function registerTool(tool: Tool): void {
  if (byId.has(tool.id)) {
    log.warn({ id: tool.id }, 'overwriting tool registration');
  }
  byId.set(tool.id, tool);

  if (tool.aliases) {
    for (const alias of tool.aliases) {
      if (byId.has(alias)) {
        log.warn({ alias, canonical: tool.id }, 'alias collides with an existing tool id');
        continue;
      }
      const existingAlias = aliasToId.get(alias);
      if (existingAlias && existingAlias !== tool.id) {
        log.warn({ alias, from: existingAlias, to: tool.id }, 'alias reassigned');
      }
      aliasToId.set(alias, tool.id);
    }
  }

  log.info({ id: tool.id, aliases: tool.aliases ?? [] }, 'tool registered');
}

/** Resolve a name to a canonical Tool. Honors aliases. */
export function getTool(name: string): Tool | undefined {
  const direct = byId.get(name);
  return direct ?? (aliasToId.get(name) ? byId.get(aliasToId.get(name)!) : undefined);
}

/**
 * Register an alias for an already-registered tool. Used by the
 * llm-aliases module to map legacy LLM tool names (Read, Grep, ...)
 * onto canonical unified ids (file:read, search:grep) without
 * touching the individual tool definitions.
 */
export function registerToolAlias(canonicalId: string, alias: string): void {
  if (!byId.has(canonicalId)) {
    log.warn({ canonicalId, alias }, 'registerToolAlias: canonical id not found');
    return;
  }
  if (byId.has(alias)) {
    log.warn({ alias, canonical: canonicalId }, 'alias collides with an existing tool id');
    return;
  }
  const existing = aliasToId.get(alias);
  if (existing && existing !== canonicalId) {
    log.warn({ alias, from: existing, to: canonicalId }, 'alias reassigned');
  }
  aliasToId.set(alias, canonicalId);
}

/** Snapshot of alias -> canonical id bindings for introspection. */
export function getAliases(): ReadonlyMap<string, string> {
  return aliasToId;
}

export function listTools(): Tool[] {
  return Array.from(byId.values());
}

/**
 * Reset for tests. Do not call from production code -- registrations
 * happen once at daemon startup.
 */
export function _resetRegistryForTests(): void {
  byId.clear();
  aliasToId.clear();
}
