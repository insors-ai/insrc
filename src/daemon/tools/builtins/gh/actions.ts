/**
 * gh:run:* and gh:workflow:* -- GitHub Actions.
 *
 * Run ops cover recent runs + logs + rerun / cancel. Workflow ops
 * list definitions and manually dispatch runs.
 */

import type { Tool, ToolApprovalGate, ToolInput, ToolResult } from '../../types.js';
import { str, num, md, fail, shellFail, ghExec, parseJson } from './helpers.js';

interface RawRun {
  databaseId?: number;
  number?: number;
  name?: string;
  workflowName?: string;
  displayTitle?: string;
  conclusion?: string;
  status?: string;
  event?: string;
  headBranch?: string;
  headSha?: string;
  url?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface RawWorkflow {
  id?: number;
  name: string;
  path?: string;
  state?: string;
}

// ---------------------------------------------------------------------------
// gh:run:list
// ---------------------------------------------------------------------------

export const ghRunListTool: Tool = {
  id: 'gh_run_list',
  description: 'Recent workflow runs.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      limit: { type: 'number', minimum: 1, maximum: 200 },
      workflow: { type: 'string', description: 'Filter by workflow file / name.' },
      branch: { type: 'string' },
      user: { type: 'string' },
      event: { type: 'string', description: 'push / pull_request / schedule / workflow_dispatch / ...' },
      status: { type: 'string', description: 'completed / queued / in_progress / failure / success / cancelled / skipped.' },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = ['gh', 'run', 'list', '--json', 'databaseId,number,name,workflowName,displayTitle,conclusion,status,event,headBranch,headSha,url,createdAt,updatedAt'];
    const limit = num(input, 'limit') ?? 30;
    argv.push('-L', String(limit));
    if (str(input, 'repo'))     { argv.push('-R', str(input, 'repo')!); }
    if (str(input, 'workflow')) { argv.push('-w', str(input, 'workflow')!); }
    if (str(input, 'branch'))   { argv.push('-b', str(input, 'branch')!); }
    if (str(input, 'user'))     { argv.push('-u', str(input, 'user')!); }
    if (str(input, 'event'))    { argv.push('-e', str(input, 'event')!); }
    if (str(input, 'status'))   { argv.push('-s', str(input, 'status')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_run_list', r); }
    const runs = parseJson<RawRun[]>(r.stdout) ?? [];
    const lines: string[] = [`# ${runs.length} run${runs.length === 1 ? '' : 's'}`, ''];
    if (runs.length > 0) {
      lines.push('| ID | Workflow | Status | Conclusion | Branch | Event | Updated |');
      lines.push('|----|----------|--------|-----------|--------|-------|---------|');
      for (const run of runs) {
        lines.push(`| ${run.databaseId ?? '—'} | ${md(run.workflowName ?? run.name ?? '?')} | ${run.status ?? '—'} | ${run.conclusion ?? '—'} | \`${run.headBranch ?? '—'}\` | ${run.event ?? '—'} | ${(run.updatedAt ?? '').slice(0, 19)} |`);
      }
    }
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { count: runs.length, runs } };
  },
};

// ---------------------------------------------------------------------------
// gh:run:view
// ---------------------------------------------------------------------------

export const ghRunViewTool: Tool = {
  id: 'gh_run_view',
  description: 'View a workflow run: jobs + failed-step logs by default.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      runId: { type: 'number', minimum: 1, description: 'Run databaseId.' },
      logFailedOnly: { type: 'boolean', description: 'Default true: only failed-step logs.' },
      maxLogBytes: { type: 'number', minimum: 1024, maximum: 4 * 1024 * 1024 },
    },
    required: ['runId'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const id = num(input, 'runId');
    if (!id) { return fail('gh_run_view', 'missing runId'); }
    const repoFlag = str(input, 'repo') ? ['-R', str(input, 'repo')!] : [];
    const logFailedOnly = input['logFailedOnly'] !== false;
    const maxLogBytes = num(input, 'maxLogBytes') ?? 128 * 1024;

    const baseArgv = ['gh', 'run', 'view', String(id), '--json', 'jobs,conclusion,status,workflowName,displayTitle,headBranch,url'];
    baseArgv.push(...repoFlag);
    const base = await ghExec(baseArgv, { cwd: str(input, 'cwd') });
    if (base.code !== 0) { return shellFail('gh_run_view', base); }
    const payload = parseJson<{ jobs?: Array<{ name: string; status?: string; conclusion?: string; url?: string }>; conclusion?: string; status?: string; workflowName?: string; displayTitle?: string; headBranch?: string; url?: string }>(base.stdout);
    if (!payload) { return fail('gh_run_view', 'could not parse JSON'); }

    const logsArgv = ['gh', 'run', 'view', String(id)];
    if (logFailedOnly) { logsArgv.push('--log-failed'); }
    else               { logsArgv.push('--log'); }
    logsArgv.push(...repoFlag);
    const logs = await ghExec(logsArgv, { cwd: str(input, 'cwd'), maxBytes: maxLogBytes, timeoutMs: 60_000 });
    const logBody = logs.code === 0 ? logs.stdout : logs.stderr;
    const truncated = logBody.length >= maxLogBytes;

    const lines: string[] = [];
    lines.push(`# Run #${id} -- ${md(payload.workflowName ?? '?')}`);
    lines.push('');
    lines.push(`Status: **${payload.status ?? '?'}** / ${payload.conclusion ?? '?'} -- branch \`${payload.headBranch ?? '?'}\``);
    if (payload.url) { lines.push(`URL: ${payload.url}`); }
    lines.push('');
    lines.push(`## Jobs (${(payload.jobs ?? []).length})`);
    lines.push('');
    for (const j of payload.jobs ?? []) {
      lines.push(`- ${j.name} -- ${j.status ?? '?'} / ${j.conclusion ?? '?'}${j.url ? ` -- ${j.url}` : ''}`);
    }
    lines.push('');
    lines.push(`## Logs (${logFailedOnly ? 'failed steps only' : 'all'})${truncated ? `, truncated @ ${maxLogBytes} bytes` : ''}`);
    lines.push('');
    lines.push('```');
    lines.push((truncated ? logBody.slice(0, maxLogBytes) : logBody).replace(/\n+$/, ''));
    lines.push('```');
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { runId: id, jobs: payload.jobs ?? [] } };
  },
};

// ---------------------------------------------------------------------------
// gh:run:rerun / cancel
// ---------------------------------------------------------------------------

export const ghRunRerunTool: Tool = {
  id: 'gh_run_rerun',
  description: 'Re-run a workflow run (failed jobs only by default).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      runId: { type: 'number', minimum: 1 },
      allJobs: { type: 'boolean', description: 'Re-run every job, not just failed ones.' },
      debug: { type: 'boolean', description: 'Enable debug logging (--debug).' },
    },
    required: ['runId'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh_run_rerun',
      content: [
        `Re-run run **${num(input, 'runId')}** in **${str(input, 'repo') ?? '(current)'}**.`,
        input['allJobs'] === true ? 'Re-running ALL jobs.' : 'Re-running failed jobs only.',
        input['debug'] === true ? 'Debug logging enabled.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const id = num(input, 'runId');
    if (!id) { return fail('gh_run_rerun', 'missing runId'); }
    const argv = ['gh', 'run', 'rerun', String(id)];
    if (input['allJobs'] !== true) { argv.push('--failed'); }
    if (input['debug'] === true) { argv.push('--debug'); }
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_run_rerun', r); }
    return { output: `Re-queued run ${id}.`, format: 'markdown', success: true, data: { runId: id } };
  },
};

export const ghRunCancelTool: Tool = {
  id: 'gh_run_cancel',
  description: 'Cancel an in-progress workflow run.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      runId: { type: 'number', minimum: 1 },
    },
    required: ['runId'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    return {
      title: 'gh_run_cancel',
      content: `Cancel in-progress run **${num(input, 'runId')}** in **${str(input, 'repo') ?? '(current)'}**.`,
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const id = num(input, 'runId');
    if (!id) { return fail('gh_run_cancel', 'missing runId'); }
    const argv = ['gh', 'run', 'cancel', String(id)];
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_run_cancel', r); }
    return { output: `Cancelled run ${id}.`, format: 'markdown', success: true, data: { runId: id } };
  },
};

// ---------------------------------------------------------------------------
// gh:workflow:list
// ---------------------------------------------------------------------------

export const ghWorkflowListTool: Tool = {
  id: 'gh_workflow_list',
  description: 'List workflow definitions.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      all: { type: 'boolean', description: 'Include disabled workflows.' },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = ['gh', 'workflow', 'list'];
    if (input['all'] === true) { argv.push('-a'); }
    if (str(input, 'repo'))    { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd') });
    if (r.code !== 0) { return shellFail('gh_workflow_list', r); }
    // gh workflow list doesn't support --json, so parse the plain output.
    const workflows: RawWorkflow[] = [];
    for (const line of r.stdout.split('\n')) {
      if (!line.trim()) { continue; }
      // Format: "<name>  <state>  <id>"
      const parts = line.split(/\s{2,}/);
      if (parts.length >= 3) {
        const id = Number(parts[2] ?? '');
        const wf: RawWorkflow = { name: (parts[0] ?? '').trim(), state: (parts[1] ?? '').trim() };
        if (Number.isFinite(id) && id !== 0) { wf.id = id; }
        workflows.push(wf);
      }
    }
    const lines: string[] = [`# ${workflows.length} workflow${workflows.length === 1 ? '' : 's'}`, ''];
    if (workflows.length > 0) {
      lines.push('| Name | State | ID |');
      lines.push('|------|-------|----|');
      for (const w of workflows) {
        lines.push(`| ${md(w.name)} | ${w.state ?? '?'} | ${w.id ?? '?'} |`);
      }
    }
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { count: workflows.length, workflows } };
  },
};

// ---------------------------------------------------------------------------
// gh:workflow:run (workflow_dispatch)
// ---------------------------------------------------------------------------

export const ghWorkflowRunTool: Tool = {
  id: 'gh_workflow_run',
  description: 'Manually dispatch a workflow (workflow_dispatch event).',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      repo: { type: 'string' },
      workflow: { type: 'string', description: 'Workflow file (e.g. ci.yml) or name.' },
      ref: { type: 'string', description: 'Branch / tag to run on. Default: repo default.' },
      inputs: {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Workflow inputs as key-value pairs.',
      },
    },
    required: ['workflow'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const inputs = input['inputs'] && typeof input['inputs'] === 'object' ? input['inputs'] as Record<string, string> : {};
    const kvs = Object.entries(inputs).map(([k, v]) => `  ${k} = ${JSON.stringify(v)}`).join('\n');
    return {
      title: 'gh_workflow_run',
      content: [
        `Dispatch workflow \`${str(input, 'workflow')}\` in **${str(input, 'repo') ?? '(current)'}**.`,
        str(input, 'ref') ? `Ref: \`${str(input, 'ref')}\`` : '',
        Object.keys(inputs).length > 0 ? '\nInputs:\n' + kvs : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const wf = str(input, 'workflow');
    if (!wf) { return fail('gh_workflow_run', 'missing workflow'); }
    const argv = ['gh', 'workflow', 'run', wf];
    if (str(input, 'ref')) { argv.push('-r', str(input, 'ref')!); }
    const inputs = input['inputs'] && typeof input['inputs'] === 'object' ? input['inputs'] as Record<string, string> : {};
    for (const [k, v] of Object.entries(inputs)) {
      argv.push('-f', `${k}=${v}`);
    }
    if (str(input, 'repo')) { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), timeoutMs: 60_000 });
    if (r.code !== 0) { return shellFail('gh_workflow_run', r); }
    return { output: `Dispatched \`${wf}\`.`, format: 'markdown', success: true, data: { workflow: wf } };
  },
};
