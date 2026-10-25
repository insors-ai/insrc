/**
 * defineJiraFamily: one Jira tool from its ops. It reuses the exported pieces of the gh op builder (OpDef, the schema
 * builders, refuseInput, rejectInput, GhFamilyTool, withGhFailureNet) and adds Jira's own input layer, argv, executor,
 * failure mapping, approval and preview. Like the gh families it returns a GhFamilyTool: its schemas are plain TSchema, so
 * callTool's static types are not concrete per family; the input check before execute and the output check after it
 * (schema-mismatch, done by executeTool) enforce the shapes at run time.
 */

import type { ApprovalClass, ToolApprovalGate, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { buildInputSchema, buildOutputSchema, refuseInput, rejectInput } from '../gh/op-table.js';
import type { GhFamilyTool, OpDef } from '../gh/op-table.js';
import { withGhFailureNet } from '../gh/helpers.js';
import { acliExec, jiraArgv, jiraFailureOf } from './exec.js';
import { checkJiraValues, jiraInputSchema } from './input.js';

function previewValue(v: unknown): string {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > 300 ? `${s.slice(0, 300)}...[truncated]` : s;
}

function gateOf(id: string, input: ToolInput): ToolApprovalGate {
  const lines = [`Op: **${String(input['op'])}**`];
  for (const [k, v] of Object.entries(input)) {
    if (k === 'op' || k === 'cwd' || v === undefined || v === null) { continue; }
    lines.push(`${k}: ${previewValue(v)}`);
  }
  return { title: `${id} ${String(input['op'])}`, content: lines.join('\n'), actions: [{ name: 'approve', label: 'Approve' }, { name: 'skip', label: 'Skip' }] };
}

export function defineJiraFamily(spec: { id: string; description: string; ops: readonly OpDef[] }): GhFamilyTool {
  const { id, ops } = spec;
  const byName = new Map(ops.map(o => [o.name, o] as const));
  const tool = {
    id,
    description: spec.description,
    inputSchema: jiraInputSchema(buildInputSchema(ops), ops),
    outputSchema: buildOutputSchema(ops),
    /** The class of the op; an op the table does not know is destructive. */
    approval: (input: ToolInput): ApprovalClass => byName.get(String(input['op']))?.cls ?? 'destructive',
    ops,

    buildApprovalGate(input: ToolInput): ToolApprovalGate {
      return gateOf(id, input);
    },

    async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
      const def = byName.get(String(input['op']));
      if (def === undefined) { return rejectInput(id, `unknown op ${JSON.stringify(input['op'])}; the ops are ${ops.map(o => o.name).join(', ')}`); }
      const refusal = refuseInput(def, input, { dashSafe: true });
      if (refusal !== undefined) { return rejectInput(id, refusal); }
      const invalid = checkJiraValues(def, input);
      if (invalid !== undefined) { return rejectInput(id, invalid.message); }
      const mutating = def.cls !== 'none';
      const o = await acliExec(jiraArgv(def, input), {
        cwd: typeof input['cwd'] === 'string' ? input['cwd'] : undefined,
        limitMs: def.limitS * 1000,
        signal: deps.signal,
        ...(def.maxBytes !== undefined ? { maxBytes: def.maxBytes } : {}),
      });
      const failure = jiraFailureOf(o, { mutating });
      if (failure !== undefined) {
        return { output: `[${id} ${def.name}] ${failure.message}`, format: 'text', success: false, error: failure.message, failure };
      }
      if (def.out.kind !== 'custom') { return rejectInput(id, `op ${def.name} must use the custom output`); }
      const built = await def.out.build({ stdout: o.stdout, stderr: o.stderr, input, deps, truncated: o.stdoutTruncated });
      if ('success' in built && 'output' in built && typeof built['success'] === 'boolean') { return built as ToolResult; }
      return { output: JSON.stringify({ op: def.name, ...built }, null, 2), format: 'json', success: true, data: { op: def.name, ...built } };
    },
  };
  return withGhFailureNet(tool as unknown as GhFamilyTool);
}
