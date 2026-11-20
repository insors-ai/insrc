/** Independent registration inventory for repository audit contract tests. No handlers execute. */
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildInsrcMcpServerWithRegistry } from '../../../mcp/server.js';
import { STEP_TOOL_NAMES } from '../../steps/host.js';
import { buildHandlerRuntime } from '../../handler-runtime.js';

export function registeredMethods(): string[] {
 const none = {} as never;
 const runtime = buildHandlerRuntime({ db: none, configStore: none, queue: none, indexer: none,
  startedAt: 0, shutdown: () => {}, attachedClients: () => [], understandingService: () => undefined });
 return [...new Set([...Object.keys(runtime.rpcHandlers), ...Object.keys(runtime.streamHandlers)])].sort();
}

export async function stepPhases(): Promise<string[]> {
 const {server, schemaRegistry} = buildInsrcMcpServerWithRegistry();
 try {
  const tools = {
   insrc_analyze_step: 'analyze-step', insrc_workflow_step: 'workflow-step',
   insrc_build_step: 'build-step', insrc_triage: 'triage-step',
   insrc_review_step: 'design-review-step', insrc_code_review_step: 'code-review-step',
  };
  assert.deepEqual(Object.keys(tools).sort(), STEP_TOOL_NAMES.filter(name => name !== 'insrc_analyze').sort(), 'every phase-driven host tool is inventoried');
  return Object.entries(tools).flatMap(([tool, prefix]) => {
   const phase = schemaRegistry.get(tool)?.rawShape['phase'];
   assert.ok(phase instanceof z.ZodEnum, `${tool} has a registered phase enum`);
   return phase.options.map((name: string) => `${prefix}.${name}`);
  }).sort();
 } finally { await server.close(); }
}
