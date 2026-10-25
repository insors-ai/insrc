/** jira_auth: whether acli is signed in. Login, logout and switch handle credentials or change the session and are not offered. */

import type { GhFamilyTool, OpDef } from '../gh/op-table.js';
import { defineJiraFamily } from './family.js';
import { parseAuthStatus } from './readers.js';
import { authStatusShape } from './schemas.js';

const status: OpDef = {
  name: 'status', command: ['auth', 'status'], cls: 'none', limitS: 30, fields: {}, args: [],
  out: { kind: 'custom', shape: authStatusShape, build: async ctx => ({ ...parseAuthStatus(ctx.stdout) }) },
};

export const AUTH_OPS: readonly OpDef[] = [status];

export const jiraAuthTool: GhFamilyTool = defineJiraFamily({
  id: 'jira_auth',
  description: 'Say whether acli is signed in to Jira (site, email and authentication type). It never asks for or stores a credential.',
  ops: AUTH_OPS,
});
