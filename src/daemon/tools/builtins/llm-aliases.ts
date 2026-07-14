/**
 * Legacy LLM-tool name aliases + input-shape translators.
 *
 * The LLM was trained against tool names like `Read`, `Grep`,
 * `graph_search`, etc. Those names resolve to canonical unified
 * ids (`file_read`, `search_grep`, `graph_search`) via the
 * registry's alias table. A few of the legacy schemas also use
 * different argument names from the canonical schemas
 * (`file_path` vs `path`, `entity` vs `entityId`, etc.); we ship
 * a small per-alias input translator so the LLM can keep calling
 * with the names it learned.
 *
 * Called once from `registerBuiltinTools()` after the tools
 * themselves land in the registry.
 */

import { registerToolAlias } from '../registry.js';
import type { ToolInput } from '../types.js';

// ---------------------------------------------------------------------------
// Alias list
// ---------------------------------------------------------------------------

const LEGACY_LLM_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'file_read':        ['Read'],
  'file_write':       ['Write'],
  'file_edit':        ['Edit'],
  'file_stat':        ['FileInfo'],
  'search_glob':      ['Glob'],
  'search_grep':      ['Grep'],
  'search_list-dir':  ['ListDirectory'],
  'shell_exec':       ['Bash'],
  'diff_compute':     ['Diff'],
  'git_log':          ['GitLog'],
  'git_blame':        ['GitBlame'],
  'web_search':       ['WebSearch'],
  'web_fetch':        ['WebFetch'],
  // The plan_step-update / plan_next-step tools carry hyphens in their
  // canonical ids (Anthropic's regex permits them); the LLM was trained
  // against underscore-only forms, so keep the underscore-only aliases.
  'plan_step-update': ['plan_step_update'],
  'plan_next-step':   ['plan_next_step'],
};

export function registerLlmAliases(): void {
  for (const [canonical, aliases] of Object.entries(LEGACY_LLM_ALIASES)) {
    for (const alias of aliases) {
      registerToolAlias(canonical, alias);
    }
  }
}

// ---------------------------------------------------------------------------
// Input translation
// ---------------------------------------------------------------------------

type Transformer = (input: ToolInput) => ToolInput;

function renameKey(src: string, dst: string): Transformer {
  return input => {
    if (!(src in input)) { return input; }
    const out = { ...input };
    out[dst] = out[src];
    delete out[src];
    return out;
  };
}

function renameKeys(mapping: Record<string, string>): Transformer {
  return input => {
    let out = input;
    let cloned = false;
    for (const [src, dst] of Object.entries(mapping)) {
      if (src in out) {
        if (!cloned) { out = { ...out }; cloned = true; }
        out[dst] = out[src];
        delete out[src];
      }
    }
    return out;
  };
}

function compose(...transforms: Transformer[]): Transformer {
  return input => transforms.reduce((acc, fn) => fn(acc), input);
}

/**
 * Translators are keyed by the legacy alias. Each maps a call made
 * against the legacy name into the canonical unified tool's input.
 */
const ALIAS_INPUT_TRANSFORMS: Readonly<Record<string, Transformer>> = {
  Read:             renameKey('file_path', 'path'),
  Write:            renameKey('file_path', 'path'),
  Edit:             renameKeys({ file_path: 'path', old_string: 'oldString', new_string: 'newString', replace_all: 'replaceAll' }),
  FileInfo:         renameKey('file_path', 'path'),
  ListDirectory:    input => {
    // Legacy: { path, depth }. Canonical search_list-dir uses `path` too; depth is optional.
    return input;
  },
  Bash:             renameKeys({ timeout: 'timeoutMs' }),
  Grep:             renameKey('include_context', 'context'),
  Diff:             input => {
    // Legacy Diff: { file_a, file_b? }. Canonical diff:compute: { a: {path}, b: {path} }.
    const out: ToolInput = { ...input };
    if (typeof out['file_a'] === 'string') { out['a'] = { path: out['file_a'] }; delete out['file_a']; }
    if (typeof out['file_b'] === 'string') { out['b'] = { path: out['file_b'] }; delete out['file_b']; }
    return out;
  },
  GitLog:           input => {
    // Legacy GitLog: { path, limit }. Canonical git:log: { path?, maxCount?, ... }.
    const out = { ...input };
    if ('limit' in out) { out['maxCount'] = out['limit']; delete out['limit']; }
    return out;
  },
  GitBlame:         renameKeys({ file_path: 'path', start_line: 'startLine', end_line: 'endLine' }),
  graph_callers:    compose(
    renameKey('entity', 'entityId'),
    renameKey('full_body', 'fullBody'),
  ),
  graph_callees:    compose(
    renameKey('entity', 'entityId'),
    renameKey('full_body', 'fullBody'),
  ),
  plan_step_update: renameKeys({ step_id: 'stepId' }),
};

/** Apply any legacy->canonical input translation registered for this alias. */
export function translateAliasInput(aliasOrId: string, input: ToolInput): ToolInput {
  const fn = ALIAS_INPUT_TRANSFORMS[aliasOrId];
  return fn ? fn(input) : input;
}

/** Exposed for tests / introspection. */
export function aliasHasInputTransform(alias: string): boolean {
  return Object.prototype.hasOwnProperty.call(ALIAS_INPUT_TRANSFORMS, alias);
}
