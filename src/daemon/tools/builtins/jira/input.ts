/**
 * The Jira input layer over the op builder of the gh families (which is not edited): the bounds the builder lacks
 * (a maximum on a limit, maxItems on a key list), a pattern on every identifier field, the removal of repeated keys, and
 * the check of every flag-valued identifier that the builder's own leading-dash check (positionals only) does not cover.
 */

import type { TSchema } from '@sinclair/typebox';
import type { OpDef } from '../gh/op-table.js';
import type { ToolFailure, ToolInput } from '../../types.js';
import { JIRA_LIMITS, JIRA_PATTERNS } from './limits.js';
import type { JiraPatternName } from './limits.js';

/** The pattern of each identifier field. `key` depends on the tool (a work item key, or a project key for the project commands). */
const IDENTIFIER_FIELDS: Readonly<Record<string, JiraPatternName>> = {
  keys: 'workItemKey',
  parent: 'workItemKey',
  out: 'workItemKey',
  in: 'workItemKey',
  project: 'projectKey',
  toProject: 'projectKey',
  projectKey: 'projectKey',
  fromProject: 'projectKey',
  id: 'numericId',
  user: 'assignee',
  assignee: 'assignee',
  status: 'statusName',
  type: 'linkTypeName',
};

/** The identifier fields as one op sees them: `key` is a project key for the project commands. */
function patternOf(def: Pick<OpDef, 'command'>, field: string): JiraPatternName | undefined {
  if (field === 'key') { return def.command[0] === 'project' ? 'projectKey' : 'workItemKey'; }
  return IDENTIFIER_FIELDS[field];
}

/** The largest limit an op may ask for. */
function limitMaximum(def: Pick<OpDef, 'name'>): number | undefined {
  if (def.name === 'search') { return JIRA_LIMITS.searchMax; }
  if (def.name === 'list') { return JIRA_LIMITS.commentMax; } // comment list and project list share the bound (200)
  return undefined;
}

type Prop = Record<string, unknown> & { type?: string; items?: Record<string, unknown> };

/**
 * The base schema (from buildInputSchema) with a maximum on the limit field, maxItems on the key lists and a pattern on
 * every identifier field. Pure: the base is not modified.
 */
export function jiraInputSchema(base: TSchema, ops: readonly OpDef[]): TSchema {
  const props = (base as unknown as { properties?: Record<string, Prop> }).properties;
  if (props === undefined) { throw new Error('jiraInputSchema: the base schema has no properties'); }
  const out: Record<string, Prop> = {};
  const keyPatterns = new Set(ops.filter(o => (o.fields ?? {})['key'] !== undefined).map(o => patternOf(o, 'key')));
  if (keyPatterns.size > 1) { throw new Error('jiraInputSchema: the ops mix work item keys and project keys in the field key'); }
  const maxima = new Set(ops.filter(o => (o.fields ?? {})['limit'] !== undefined).map(limitMaximum).filter((m): m is number => m !== undefined));
  if (maxima.size > 1) { throw new Error('jiraInputSchema: the ops disagree on the maximum of the field limit'); }
  for (const [name, prop] of Object.entries(props)) {
    let next: Prop = prop;
    const pattern = name === 'key' ? [...keyPatterns][0] : IDENTIFIER_FIELDS[name];
    if (pattern !== undefined) {
      const source = JIRA_PATTERNS[pattern].source;
      next = prop.type === 'array' && prop.items !== undefined
        ? { ...next, items: { ...prop.items, pattern: source } }
        : { ...next, pattern: source };
    }
    if (name === 'keys' && next.type === 'array') { next = { ...next, maxItems: JIRA_LIMITS.keysMax }; }
    if (name === 'limit' && maxima.size === 1) { next = { ...next, maximum: [...maxima][0] }; }
    out[name] = next;
  }
  return { ...(base as object), properties: out } as unknown as TSchema;
}

/** The keys in first-seen order, each once. */
export function normalizeKeys(keys: readonly string[]): string[] {
  return [...new Set(keys)];
}

/** A rejected failure naming the first identifier that does not match its pattern, or undefined when all do. */
export function checkJiraValues(def: OpDef, input: ToolInput): ToolFailure | undefined {
  for (const [field, value] of Object.entries(input)) {
    const pattern = patternOf(def, field);
    if (pattern === undefined || value === undefined || value === null) { continue; }
    for (const v of Array.isArray(value) ? value : [value]) {
      if (typeof v !== 'string') { continue; }
      if (v.startsWith('-') || !JIRA_PATTERNS[pattern].test(v)) {
        return { kind: 'rejected', message: `op ${def.name}: ${field} '${v}' is not a valid ${pattern.replace(/([A-Z])/g, ' $1').toLowerCase()}${v.startsWith('-') ? " (it must not start with '-')" : ''}` };
      }
    }
  }
  return undefined;
}
