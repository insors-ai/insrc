/** One valid call and one recorded-form answer for every one of the 32 Jira ops. */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GhFamilyTool } from '../../gh/op-table.js';
import { jiraAuthTool } from '../auth.js';
import { jiraCommentTool } from '../comment.js';
import { jiraLinkTool } from '../link.js';
import { jiraProjectTool } from '../project.js';
import { jiraWorkitemTool } from '../workitem.js';

export const fixture = (name: string): string => readFileSync(join(fileURLToPath(new URL('./fixtures/', import.meta.url)), name), 'utf8');
const batch = (message: string, id = 'IN-1'): string => JSON.stringify({ results: [{ status: 'SUCCESS', message, id }], totalCount: 1, successCount: 1 });
const mark = '✓ done\n';

export interface OpCase { readonly tool: GhFamilyTool; readonly input: Record<string, unknown>; readonly stdout: string }

export const ALL_OP_CASES: readonly OpCase[] = [
  { tool: jiraWorkitemTool, input: { op: 'view', key: 'IN-1' }, stdout: fixture('view.json') },
  { tool: jiraWorkitemTool, input: { op: 'search', jql: 'project = "IN"' }, stdout: fixture('search.json') },
  { tool: jiraWorkitemTool, input: { op: 'count', jql: 'project = "IN"' }, stdout: fixture('count.txt') },
  { tool: jiraWorkitemTool, input: { op: 'create', project: 'IN', type: 'Task', summary: 's' }, stdout: JSON.stringify({ key: 'IN-4', id: '10040' }) },
  { tool: jiraWorkitemTool, input: { op: 'edit', keys: ['IN-1'], summary: 's' }, stdout: fixture('batch-edit-success.json') },
  { tool: jiraWorkitemTool, input: { op: 'transition', keys: ['IN-1'], status: 'Done' }, stdout: batch('Work item IN-1 has been successfully transitioned to Done') },
  { tool: jiraWorkitemTool, input: { op: 'assign', keys: ['IN-1'], assignee: '@me' }, stdout: batch('Work item IN-1 has been successfully assigned to user@example.com') },
  { tool: jiraWorkitemTool, input: { op: 'clone', keys: ['IN-1'] }, stdout: fixture('batch-clone.json') },
  { tool: jiraWorkitemTool, input: { op: 'archive', keys: ['IN-1'] }, stdout: batch('Work item IN-1 has been successfully archived') },
  { tool: jiraWorkitemTool, input: { op: 'unarchive', keys: ['IN-1'] }, stdout: batch('Work item IN-1 has been successfully unarchived') },
  { tool: jiraWorkitemTool, input: { op: 'delete', keys: ['IN-1'] }, stdout: batch('Work item IN-1 has been successfully deleted') },
  { tool: jiraWorkitemTool, input: { op: 'attachment-list', key: 'IN-1' }, stdout: fixture('attachment-list.json') },
  { tool: jiraWorkitemTool, input: { op: 'attachment-delete', id: '10002' }, stdout: mark },
  { tool: jiraWorkitemTool, input: { op: 'watcher-list', key: 'IN-1' }, stdout: fixture('watcher-list.json') },
  { tool: jiraWorkitemTool, input: { op: 'watcher-remove', key: 'IN-1', user: '712020:abc' }, stdout: mark },
  { tool: jiraCommentTool, input: { op: 'list', key: 'IN-1' }, stdout: fixture('comment-list.json') },
  { tool: jiraCommentTool, input: { op: 'create', keys: ['IN-1'], body: 'b' }, stdout: fixture('batch-comment-create.json') },
  { tool: jiraCommentTool, input: { op: 'update', key: 'IN-1', id: '10001', body: 'b' }, stdout: fixture('comment-update.txt') },
  { tool: jiraCommentTool, input: { op: 'delete', key: 'IN-1', id: '10001' }, stdout: mark },
  { tool: jiraCommentTool, input: { op: 'visibility', group: true }, stdout: fixture('visibility-group.txt') },
  { tool: jiraLinkTool, input: { op: 'list', key: 'IN-1' }, stdout: fixture('link-list.json') },
  { tool: jiraLinkTool, input: { op: 'types' }, stdout: fixture('link-types.json') },
  { tool: jiraLinkTool, input: { op: 'create', out: 'IN-1', in: 'IN-2', type: 'Blocks' }, stdout: mark },
  { tool: jiraLinkTool, input: { op: 'delete', id: '10001' }, stdout: fixture('link-delete.txt') },
  { tool: jiraProjectTool, input: { op: 'list' }, stdout: fixture('project-list.json') },
  { tool: jiraProjectTool, input: { op: 'view', key: 'IN' }, stdout: fixture('project-view.json') },
  { tool: jiraProjectTool, input: { op: 'create', fromProject: 'IN', key: 'ZZPROBE', name: 'n' }, stdout: mark },
  { tool: jiraProjectTool, input: { op: 'update', projectKey: 'ZZPROBE', name: 'n' }, stdout: mark },
  { tool: jiraProjectTool, input: { op: 'archive', key: 'ZZPROBE' }, stdout: mark },
  { tool: jiraProjectTool, input: { op: 'restore', key: 'ZZPROBE' }, stdout: mark },
  { tool: jiraProjectTool, input: { op: 'delete', key: 'ZZPROBE' }, stdout: mark },
  { tool: jiraAuthTool, input: { op: 'status' }, stdout: fixture('auth-status.txt') },
];

export const ALL_TOOLS: readonly GhFamilyTool[] = [jiraWorkitemTool, jiraCommentTool, jiraLinkTool, jiraProjectTool, jiraAuthTool];
