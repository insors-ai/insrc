/**
 * gh:run:* and gh:workflow:* -- GitHub Actions.
 *
 * Run ops cover recent runs + logs + rerun / cancel. Workflow ops
 * list definitions and manually dispatch runs.
 */

import { Type } from '@sinclair/typebox';
import type { ToolApprovalGate, ToolDeps, ToolInput, ToolResult } from '../../types.js';
import { str, num, md, fail, ghApprovalClass, ghExec, parseJson, withGhFailureNet } from './helpers.js';
import { ghConvert } from './convert.js';
import { ghFailResult } from './legacy.js';
import {
  GhRunListDataSchema, GhLogStepsSchema, GhRunViewDataSchema, GhRunIdDataSchema, GhWorkflowListDataSchema, GhWorkflowRunDataSchema,
} from './schemas.js';

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

export const ghRunListTool = withGhFailureNet({
  id: 'gh_run_list',
  description: 'Recent workflow runs.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    limit: Type.Optional(Type.Number({ minimum: 1, maximum: 200 })),
    workflow: Type.Optional(Type.String({ description: 'Filter by workflow file / name.' })),
    branch: Type.Optional(Type.String()),
    user: Type.Optional(Type.String()),
    event: Type.Optional(Type.String({ description: 'push / pull_request / schedule / workflow_dispatch / ...' })),
    status: Type.Optional(Type.String({ description: 'completed / queued / in_progress / failure / success / cancelled / skipped.' })),
  }, { additionalProperties: false }),
  outputSchema: GhRunListDataSchema,

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
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_run_list' } });
    const bad = ghFailResult('gh_run_list', r, false); if (bad) { return bad; }
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
});

// ---------------------------------------------------------------------------
// gh:run:view
// ---------------------------------------------------------------------------

export const ghRunViewTool = withGhFailureNet({
  id: 'gh_run_view',
  description: 'View a workflow run: jobs + failed-step logs by default.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    runId: Type.Number({ minimum: 1, description: 'Run databaseId.' }),
    logFailedOnly: Type.Optional(Type.Boolean({ description: 'Default true: only failed-step logs.' })),
    maxLogBytes: Type.Optional(Type.Number({ minimum: 1024, maximum: 4194304 })),
  }, { additionalProperties: false }),
  outputSchema: GhRunViewDataSchema,

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const id = num(input, 'runId');
    if (!id) { return fail('gh_run_view', 'missing runId'); }
    const repoFlag = str(input, 'repo') ? ['-R', str(input, 'repo')!] : [];
    const logFailedOnly = input['logFailedOnly'] !== false;
    const maxLogBytes = num(input, 'maxLogBytes') ?? 128 * 1024;

    const baseArgv = ['gh', 'run', 'view', String(id), '--json', 'jobs,conclusion,status,workflowName,displayTitle,headBranch,url'];
    baseArgv.push(...repoFlag);
    const base = await ghExec(baseArgv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_run_view' } });
    const baseBad = ghFailResult('gh_run_view', base, false); if (baseBad) { return baseBad; }
    const payload = parseJson<{ jobs?: Array<{ name: string; status?: string | null; conclusion?: string | null; url?: string | null }>; conclusion?: string; status?: string; workflowName?: string; displayTitle?: string; headBranch?: string; url?: string }>(base.stdout);
    if (!payload) { return fail('gh_run_view', 'could not parse JSON'); }

    const logsArgv = ['gh', 'run', 'view', String(id)];
    if (logFailedOnly) { logsArgv.push('--log-failed'); }
    else               { logsArgv.push('--log'); }
    logsArgv.push(...repoFlag);
    // a cut at the display cap is the answer, not a failure; a failed log command fails the call with its stderr
    const logs = await ghExec(logsArgv, { cwd: str(input, 'cwd'), maxBytes: maxLogBytes, cutIsAnswer: true, key: { toolId: 'gh_run_view' } });
    const logsBad = ghFailResult('gh_run_view', logs, false); if (logsBad) { return logsBad; }
    const truncated = logs.stdoutTruncated;
    const logBody = logs.stdout;

    const conv = await ghConvert('gh_run_view', logBody, GhLogStepsSchema, v => v.steps.flatMap(s => [s.job, s.step]), deps);
    if (!conv.ok) { return conv.failure; }

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
    if (conv.value !== undefined && conv.value.steps.length > 0) {
      lines.push('');
      lines.push(`## Steps in the log (${conv.value.steps.length})`);
      lines.push('');
      for (const s of conv.value.steps) { lines.push(`- ${md(s.job)} / ${md(s.step)}`); }
    }
    lines.push('');
    lines.push(`## Logs (${logFailedOnly ? 'failed steps only' : 'all'})${truncated ? `, truncated @ ${maxLogBytes} bytes` : ''}`);
    lines.push('');
    lines.push('```');
    lines.push(logBody.replace(/\n+$/, ''));
    lines.push('```');
    return { output: lines.join('\n'), format: 'markdown', success: true, data: { runId: id, jobs: payload.jobs ?? [], truncated } };
  },
});

export const ghRunRerunTool = withGhFailureNet({
  id: 'gh_run_rerun',
  description: 'Re-run a workflow run (failed jobs only by default).',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    runId: Type.Number({ minimum: 1 }),
    allJobs: Type.Optional(Type.Boolean({ description: 'Re-run every job, not just failed ones.' })),
    debug: Type.Optional(Type.Boolean({ description: 'Enable debug logging (--debug).' })),
  }, { additionalProperties: false }),
  outputSchema: GhRunIdDataSchema,
  approval: ghApprovalClass('gh_run_rerun', {}),

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
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_run_rerun' } });
    const bad = ghFailResult('gh_run_rerun', r, true); if (bad) { return bad; }
    return { output: `Re-queued run ${id}.`, format: 'markdown', success: true, data: { runId: id } };
  },
});

export const ghRunCancelTool = withGhFailureNet({
  id: 'gh_run_cancel',
  description: 'Cancel an in-progress workflow run.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    runId: Type.Number({ minimum: 1 }),
  }, { additionalProperties: false }),
  outputSchema: GhRunIdDataSchema,
  approval: ghApprovalClass('gh_run_cancel', {}),

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
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_run_cancel' } });
    const bad = ghFailResult('gh_run_cancel', r, true); if (bad) { return bad; }
    return { output: `Cancelled run ${id}.`, format: 'markdown', success: true, data: { runId: id } };
  },
});

// ---------------------------------------------------------------------------
// gh:workflow:list
// ---------------------------------------------------------------------------

export const ghWorkflowListTool = withGhFailureNet({
  id: 'gh_workflow_list',
  description: 'List workflow definitions.',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    all: Type.Optional(Type.Boolean({ description: 'Include disabled workflows.' })),
  }, { additionalProperties: false }),
  outputSchema: GhWorkflowListDataSchema,

  async execute(input: ToolInput): Promise<ToolResult> {
    const argv = ['gh', 'workflow', 'list'];
    if (input['all'] === true) { argv.push('-a'); }
    if (str(input, 'repo'))    { argv.push('-R', str(input, 'repo')!); }
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_workflow_list' } });
    const bad = ghFailResult('gh_workflow_list', r, false); if (bad) { return bad; }
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
});

// ---------------------------------------------------------------------------
// gh:workflow:run (workflow_dispatch)
// ---------------------------------------------------------------------------

export const ghWorkflowRunTool = withGhFailureNet({
  id: 'gh_workflow_run',
  description: 'Manually dispatch a workflow (workflow_dispatch event).',
  inputSchema: Type.Object({
    cwd: Type.Optional(Type.String()),
    repo: Type.Optional(Type.String()),
    workflow: Type.String({ description: 'Workflow file (e.g. ci.yml) or name.' }),
    ref: Type.Optional(Type.String({ description: 'Branch / tag to run on. Default: repo default.' })),
    inputs: Type.Optional(Type.Record(Type.String(), Type.String(), { description: 'Workflow inputs as key-value pairs.' })),
  }, { additionalProperties: false }),
  outputSchema: GhWorkflowRunDataSchema,
  approval: ghApprovalClass('gh_workflow_run', {}),

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
    const r = await ghExec(argv, { cwd: str(input, 'cwd'), key: { toolId: 'gh_workflow_run' } });
    const bad = ghFailResult('gh_workflow_run', r, true); if (bad) { return bad; }
    return { output: `Dispatched \`${wf}\`.`, format: 'markdown', success: true, data: { workflow: wf } };
  },
});
