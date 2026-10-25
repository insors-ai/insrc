/** A small table of sample ops for the family tests: reads, a change, a delete, and two defective builders. */

import { csv, field, lit, val } from '../../gh/op-table.js';
import type { OpDef } from '../../gh/op-table.js';
import type { ToolDeps } from '../../../types.js';
import { batchAnswer, countAnswer, jsonAnswer } from '../answers.js';
import { changeShape, countShape, viewShape } from '../schemas.js';
import { defineJiraFamily } from '../family.js';

export const deps = (extra: Partial<ToolDeps> = {}): ToolDeps => ({ sessionId: 't', repoPath: '/tmp', send: () => {}, requestId: 0, approvalMode: 'auto', ...extra });

const view: OpDef = {
  name: 'view', command: ['workitem', 'view'], cls: 'none', limitS: 30, required: ['key'], fields: { key: field.str() }, args: [val('--key', 'key'), lit('--json')],
  out: { kind: 'custom', shape: viewShape, build: jsonAnswer('a work item', d => (typeof d === 'object' && d !== null && 'key' in d ? { item: d as Record<string, unknown> } : undefined)) },
};
const count: OpDef = {
  name: 'count', command: ['workitem', 'search'], cls: 'none', limitS: 60, oneOf: [['jql', 'filter']], fields: { jql: field.str(), filter: field.str() },
  args: [val('--jql', 'jql'), val('--filter', 'filter'), lit('--count')], out: { kind: 'custom', shape: countShape, build: countAnswer() },
};
const edit: OpDef = {
  name: 'edit', command: ['workitem', 'edit'], cls: 'common', limitS: 60, required: ['keys'], atLeastOne: [['summary']], fields: { keys: field.strs(), summary: field.str() },
  args: [csv('--key', 'keys'), val('--summary', 'summary'), lit('--yes', '--json')], out: { kind: 'custom', shape: changeShape, build: batchAnswer() },
};
const del: OpDef = {
  name: 'delete', command: ['workitem', 'delete'], cls: 'destructive', limitS: 60, required: ['keys'], fields: { keys: field.strs() },
  args: [csv('--key', 'keys'), lit('--yes', '--json')], out: { kind: 'custom', shape: changeShape, build: batchAnswer() },
};
/** A builder defect: data that does not fit the op's own shape. */
const wrongData: OpDef = {
  name: 'wrong-data', command: ['workitem', 'search'], cls: 'none', limitS: 30, fields: {}, args: [lit('--count')],
  out: { kind: 'custom', shape: countShape, build: async () => ({ count: 'many' }) },
};
/** A builder defect: a success with no data. */
const noData: OpDef = {
  name: 'no-data', command: ['workitem', 'search'], cls: 'none', limitS: 30, fields: {}, args: [lit('--count')],
  out: { kind: 'custom', shape: countShape, build: async () => ({ output: 'fine', format: 'text', success: true }) },
};

export const SAMPLE_OPS: readonly OpDef[] = [view, count, edit, del, wrongData, noData];
export const sampleFamily = (): ReturnType<typeof defineJiraFamily> => defineJiraFamily({ id: 'jira_sample', description: 'sample', ops: SAMPLE_OPS });
