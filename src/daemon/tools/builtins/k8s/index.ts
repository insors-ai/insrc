/**
 * Kubernetes tools -- get / apply / delete / logs / exec / port-forward.
 *
 * All shell out to the system `kubectl`; the caller's kubeconfig,
 * kube context, and RBAC apply transparently. Every tool accepts the
 * standard cluster-selection triple (context / namespace / kubeconfig)
 * so scripted callers can hop between clusters without env vars.
 */

import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runShell } from '../../shell-helper.js';
import { registerTool } from '../../registry.js';
import type {
  Tool, ToolApprovalGate, ToolDeps, ToolInput, ToolResult,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function num(input: ToolInput, key: string): number | undefined {
  const v = input[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function bool(input: ToolInput, key: string): boolean | undefined {
  const v = input[key];
  return typeof v === 'boolean' ? v : undefined;
}

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

/** Common cluster-selection flags. */
interface ClusterFlags {
  context?: string;
  namespace?: string;
  kubeconfig?: string;
}

function clusterFlags(input: ToolInput): ClusterFlags {
  const out: ClusterFlags = {};
  const ctx = str(input, 'context');
  const ns  = str(input, 'namespace');
  const kc  = str(input, 'kubeconfig');
  if (ctx) { out.context = ctx; }
  if (ns)  { out.namespace = ns; }
  if (kc)  { out.kubeconfig = kc; }
  return out;
}

function clusterArgv(flags: ClusterFlags): string[] {
  const args: string[] = [];
  if (flags.context)    { args.push('--context', flags.context); }
  if (flags.namespace)  { args.push('-n', flags.namespace); }
  if (flags.kubeconfig) { args.push('--kubeconfig', flags.kubeconfig); }
  return args;
}

function clusterDescription(flags: ClusterFlags): string {
  const parts: string[] = [];
  if (flags.context)   { parts.push(`context=${flags.context}`); }
  if (flags.namespace) { parts.push(`namespace=${flags.namespace}`); }
  if (flags.kubeconfig){ parts.push(`kubeconfig=${flags.kubeconfig}`); }
  return parts.length > 0 ? parts.join(', ') : 'current context';
}

const CLUSTER_SCHEMA = {
  context:    { type: 'string' },
  namespace:  { type: 'string' },
  kubeconfig: { type: 'string' },
} as const;

// ---------------------------------------------------------------------------
// k8s:get
// ---------------------------------------------------------------------------

interface K8sGetData {
  resource: string;
  name: string | undefined;
  cluster: ClusterFlags;
  format: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const k8sGetTool: Tool = {
  id: 'k8s_get',
  description: 'Read k8s resources (pods, deployments, svc, ...). Supports selectors; no write side effects.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: { type: 'string', description: 'Resource type: pods, pod/<name>, deployment, svc, ...' },
      name: { type: 'string', description: 'Optional resource name.' },
      labelSelector: { type: 'string', description: '-l key=value[,key=value].' },
      fieldSelector: { type: 'string', description: '--field-selector.' },
      allNamespaces: { type: 'boolean' },
      describe: { type: 'boolean', description: 'Use `describe` instead of `get`.' },
      output: { type: 'string', description: 'kubectl -o format. Default yaml; ignored for describe.' },
      ...CLUSTER_SCHEMA,
    },
    required: ['resource'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const resource = str(input, 'resource');
    if (!resource) { return fail('k8s_get', 'resource required'); }
    const cluster = clusterFlags(input);
    const describe = bool(input, 'describe') ?? false;
    const format = str(input, 'output') ?? 'yaml';
    const name = str(input, 'name');

    const argv = ['kubectl', describe ? 'describe' : 'get', resource];
    if (name) { argv.push(name); }
    const label = str(input, 'labelSelector');
    if (label) { argv.push('-l', label); }
    const field = str(input, 'fieldSelector');
    if (field) { argv.push('--field-selector', field); }
    if (bool(input, 'allNamespaces') === true) { argv.push('-A'); }
    if (!describe) { argv.push('-o', format); }
    argv.push(...clusterArgv(cluster));

    const r = await runShell(argv, { timeoutMs: 60_000 });
    if (r.spawnError) { return fail('k8s_get', `kubectl not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: K8sGetData = {
      resource, name, cluster, format: describe ? 'describe' : format,
      exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
    };
    const body = [
      ok
        ? `\`kubectl ${describe ? 'describe' : 'get'} ${resource}${name ? ' ' + name : ''}\` on ${clusterDescription(cluster)}`
        : `**Failed (exit ${r.code})** on ${clusterDescription(cluster)}`,
      r.stdout ? '\n```' + (format === 'json' ? 'json' : format === 'yaml' ? 'yaml' : '') + '\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
      r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
    ].filter(Boolean).join('\n');
    return {
      output: body,
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// k8s:apply -- gated with a dry-run diff preview
// ---------------------------------------------------------------------------

interface K8sApplyData {
  source: 'inline' | 'file';
  path: string | undefined;
  cluster: ClusterFlags;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

async function writeManifestToTemp(yaml: string): Promise<string> {
  const path = join(tmpdir(), `insrc-k8s-apply-${process.pid}-${Date.now()}.yaml`);
  await fs.writeFile(path, yaml, 'utf8');
  return path;
}

export const k8sApplyTool: Tool = {
  id: 'k8s_apply',
  description: 'Apply a k8s manifest. Shows server-side diff before applying.',
  inputSchema: {
    type: 'object',
    properties: {
      manifestPath: { type: 'string', description: 'Path to a YAML/JSON manifest.' },
      manifest: { type: 'string', description: 'Inline YAML manifest (alternative to manifestPath).' },
      serverSide: { type: 'boolean', description: 'kubectl apply --server-side.' },
      force: { type: 'boolean', description: '--force (last-applied conflict resolution).' },
      ...CLUSTER_SCHEMA,
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cluster = clusterFlags(input);
    const path = str(input, 'manifestPath');
    const inline = str(input, 'manifest');
    let body = '';
    let source = '';

    if (path) {
      source = `File: \`${path}\``;
      try { body = await fs.readFile(path, 'utf8'); }
      catch { body = `_(unable to read ${path}; apply will fail)_`; }
    } else if (inline) {
      source = 'Inline manifest';
      body = inline;
    } else {
      source = '_no manifest provided_';
    }
    const manifestPreview = body.length > 2000 ? body.slice(0, 2000) + '\n... (truncated)' : body;

    // Try a best-effort server-side diff so the user sees what will change.
    let diff = '';
    if (path || inline) {
      const diffArgv = ['kubectl', 'diff'];
      if (path) { diffArgv.push('-f', path); }
      else if (inline) {
        const tmp = await writeManifestToTemp(inline);
        diffArgv.push('-f', tmp);
      }
      diffArgv.push(...clusterArgv(cluster));
      const diffResult = await runShell(diffArgv, { timeoutMs: 30_000 });
      // kubectl diff exits 0 (no diff) or 1 (diff) or >1 on error.
      if (diffResult.code === 0) { diff = '_(no changes)_'; }
      else if (diffResult.code === 1) { diff = diffResult.stdout; }
      else { diff = `_(diff failed: ${diffResult.stderr.trim().slice(0, 300) || 'exit ' + diffResult.code})_`; }
    }
    const diffPreview = diff.length > 3000 ? diff.slice(0, 3000) + '\n... (diff truncated)' : diff;

    return {
      title: 'k8s_apply',
      content: [
        `Cluster: **${clusterDescription(cluster)}**`,
        source,
        '',
        '**Manifest**',
        '```yaml',
        manifestPreview,
        '```',
        diff ? '\n**Server diff**\n```diff\n' + diffPreview + '\n```' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cluster = clusterFlags(input);
    const path = str(input, 'manifestPath');
    const inline = str(input, 'manifest');
    if (!path && !inline) { return fail('k8s_apply', 'manifestPath or manifest required'); }

    let source: 'inline' | 'file';
    let manifestPath: string;
    let cleanup: (() => Promise<void>) | undefined;

    if (path) {
      source = 'file';
      manifestPath = path;
    } else {
      source = 'inline';
      manifestPath = await writeManifestToTemp(inline!);
      cleanup = async () => { try { await fs.unlink(manifestPath); } catch { /* ignore */ } };
    }

    const argv = ['kubectl', 'apply', '-f', manifestPath];
    if (bool(input, 'serverSide') === true) { argv.push('--server-side'); }
    if (bool(input, 'force') === true)      { argv.push('--force'); }
    argv.push(...clusterArgv(cluster));

    try {
      const r = await runShell(argv, { timeoutMs: 180_000 });
      if (r.spawnError) { return fail('k8s_apply', `kubectl not found: ${r.stderr.trim()}`); }
      const ok = r.code === 0;
      const data: K8sApplyData = {
        source,
        path: source === 'file' ? manifestPath : undefined,
        cluster, exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
      };
      return {
        output: [
          ok ? `Applied on ${clusterDescription(cluster)}.` : `**Apply failed (exit ${r.code})** on ${clusterDescription(cluster)}.`,
          r.stdout ? '\n```\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
          r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: `exit ${r.code}` }),
        data,
      };
    } finally {
      if (cleanup) { await cleanup(); }
    }
  },
};

// ---------------------------------------------------------------------------
// k8s:delete -- always gated; refuses wholesale namespace / --all wipes
// ---------------------------------------------------------------------------

interface K8sDeleteData {
  resource: string;
  target: string;
  cluster: ClusterFlags;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

function deleteTarget(input: ToolInput): string {
  const name = str(input, 'name');
  const label = str(input, 'labelSelector');
  if (name) { return `name=${name}`; }
  if (label) { return `selector=${label}`; }
  if (bool(input, 'all') === true) { return '--all'; }
  return '(none)';
}

export const k8sDeleteTool: Tool = {
  id: 'k8s_delete',
  description: 'Delete k8s resources. Always gated. Refuses wholesale wipes without confirmNamespace.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: { type: 'string', description: 'Resource type or type/name.' },
      name: { type: 'string' },
      labelSelector: { type: 'string', description: '-l key=value. Alternative to name.' },
      all: { type: 'boolean', description: 'Delete all of this resource type in the namespace.' },
      confirmNamespace: { type: 'string', description: 'Required when `all:true` -- must match --namespace.' },
      force: { type: 'boolean', description: '--force --grace-period=0 (dangerous).' },
      ...CLUSTER_SCHEMA,
    },
    required: ['resource'],
    additionalProperties: false,
  },
  requiresApproval: true,
  destructive: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cluster = clusterFlags(input);
    return {
      title: 'k8s_delete',
      content: [
        `Cluster: **${clusterDescription(cluster)}**`,
        `Resource: \`${str(input, 'resource')}\``,
        `Target: ${deleteTarget(input)}`,
        bool(input, 'force') === true ? '**--force --grace-period=0** (bypass graceful termination).' : '',
        bool(input, 'all') === true ? '**--all** -- wholesale delete.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const resource = str(input, 'resource');
    if (!resource) { return fail('k8s_delete', 'resource required'); }
    const cluster = clusterFlags(input);
    const all = bool(input, 'all') === true;
    const name = str(input, 'name');
    const label = str(input, 'labelSelector');

    if (all) {
      const ns = cluster.namespace;
      const confirm = str(input, 'confirmNamespace');
      if (!ns) {
        return fail('k8s_delete', 'all:true requires an explicit namespace');
      }
      if (confirm !== ns) {
        return fail('k8s_delete', `all:true requires confirmNamespace to match namespace (${ns})`);
      }
    } else if (!name && !label) {
      return fail('k8s_delete', 'name or labelSelector required (or all:true)');
    }

    const argv = ['kubectl', 'delete', resource];
    if (name)  { argv.push(name); }
    if (label) { argv.push('-l', label); }
    if (all)   { argv.push('--all'); }
    if (bool(input, 'force') === true) { argv.push('--force', '--grace-period=0'); }
    argv.push(...clusterArgv(cluster));

    const r = await runShell(argv, { timeoutMs: 120_000 });
    if (r.spawnError) { return fail('k8s_delete', `kubectl not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: K8sDeleteData = {
      resource, target: deleteTarget(input), cluster,
      exitCode: r.code, stdout: r.stdout, stderr: r.stderr,
    };
    return {
      output: [
        ok ? `Deleted on ${clusterDescription(cluster)}.` : `**Delete failed (exit ${r.code})** on ${clusterDescription(cluster)}.`,
        r.stdout ? '\n```\n' + r.stdout.replace(/\n+$/, '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// k8s:logs -- follow mode streams; one-shot returns captured output
// ---------------------------------------------------------------------------

interface K8sLogsData {
  pod: string;
  container: string | undefined;
  cluster: ClusterFlags;
  follow: boolean;
  exitCode: number | null;
  bytes: number;
  durationMs: number;
  timedOut: boolean;
  stdout: string;
}

const DEFAULT_FOLLOW_RUNTIME = 10 * 60_000;
const MAX_FOLLOW_RUNTIME = 30 * 60_000;

export const k8sLogsTool: Tool = {
  id: 'k8s_logs',
  description: 'Fetch pod logs. Follow mode streams; otherwise returns a one-shot snapshot.',
  inputSchema: {
    type: 'object',
    properties: {
      pod: { type: 'string' },
      container: { type: 'string' },
      follow: { type: 'boolean' },
      tail: { type: 'number', description: 'Last N lines. Applied after any since filter.' },
      sinceSeconds: { type: 'number' },
      previous: { type: 'boolean', description: '--previous (container crashloop logs).' },
      maxRuntimeMs: { type: 'number', minimum: 1000, maximum: MAX_FOLLOW_RUNTIME, description: 'Follow-mode cap.' },
      ...CLUSTER_SCHEMA,
    },
    required: ['pod'],
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const pod = str(input, 'pod');
    if (!pod) { return fail('k8s_logs', 'pod required'); }
    const cluster = clusterFlags(input);
    const container = str(input, 'container');
    const follow = bool(input, 'follow') ?? false;

    const argv = ['kubectl', 'logs', pod];
    if (container) { argv.push('-c', container); }
    if (follow) { argv.push('-f'); }
    const tail = num(input, 'tail');
    if (typeof tail === 'number' && tail > 0) { argv.push(`--tail=${tail}`); }
    const since = num(input, 'sinceSeconds');
    if (typeof since === 'number' && since > 0) { argv.push(`--since=${since}s`); }
    if (bool(input, 'previous') === true) { argv.push('--previous'); }
    argv.push(...clusterArgv(cluster));

    if (!follow) {
      const r = await runShell(argv, { timeoutMs: 60_000 });
      if (r.spawnError) { return fail('k8s_logs', `kubectl not found: ${r.stderr.trim()}`); }
      const ok = r.code === 0;
      const data: K8sLogsData = {
        pod, container, cluster, follow: false,
        exitCode: r.code, bytes: Buffer.byteLength(r.stdout),
        durationMs: 0, timedOut: r.timedOut, stdout: r.stdout,
      };
      return {
        output: [
          ok ? `Logs from \`${pod}\`${container ? ` [${container}]` : ''} on ${clusterDescription(cluster)}.` : `**Failed (exit ${r.code})**.`,
          '',
          '```',
          r.stdout.replace(/\n+$/, ''),
          '```',
          r.stderr ? '\n**stderr**\n```\n' + r.stderr.replace(/\n+$/, '') + '\n```' : '',
        ].filter(Boolean).join('\n'),
        format: 'markdown',
        success: ok,
        ...(ok ? {} : { error: `exit ${r.code}` }),
        data,
      };
    }

    // Follow mode: stream lines back via deps.send, cap runtime.
    const maxRuntimeMs = Math.min(num(input, 'maxRuntimeMs') ?? DEFAULT_FOLLOW_RUNTIME, MAX_FOLLOW_RUNTIME);
    const [cmd, ...args] = argv;
    const started = Date.now();
    let buf = '';
    let bytes = 0;

    return new Promise<ToolResult>(resolve => {
      const child = spawn(cmd!, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill('SIGTERM');
      }, maxRuntimeMs);
      const onAbort = () => child.kill('SIGTERM');
      deps.signal?.addEventListener('abort', onAbort, { once: true });

      const flush = () => {
        if (buf) {
          deps.send({ id: deps.requestId, stream: 'progress', data: { message: buf } });
          buf = '';
        }
      };

      child.stdout?.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        buf += chunk.toString('utf8');
        if (buf.length >= 512 || buf.includes('\n')) { flush(); }
      });
      let stderrCapture = '';
      child.stderr?.on('data', (chunk: Buffer) => {
        stderrCapture += chunk.toString('utf8');
        deps.send({ id: deps.requestId, stream: 'progress', data: { message: '[stderr] ' + chunk.toString('utf8') } });
      });

      child.on('error', err => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        flush();
        resolve(fail('k8s_logs', `spawn failed: ${err.message}`));
      });

      child.on('close', code => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        flush();
        const durationMs = Date.now() - started;
        const ok = code === 0 || (timedOut && code === null);
        const data: K8sLogsData = {
          pod, container, cluster, follow: true,
          exitCode: code, bytes, durationMs, timedOut, stdout: '',
        };
        resolve({
          output: [
            `Log follow ended${timedOut ? ' (runtime cap hit)' : ''} after ${durationMs} ms.`,
            `Streamed ${bytes} B from \`${pod}\`${container ? ` [${container}]` : ''}.`,
            stderrCapture ? '\n**stderr tail**\n```\n' + stderrCapture.replace(/\n+$/, '').slice(-1000) + '\n```' : '',
          ].filter(Boolean).join('\n'),
          format: 'markdown',
          success: ok,
          ...(ok ? {} : { error: `exit ${code}` }),
          data,
        });
      });
    });
  },
};

// ---------------------------------------------------------------------------
// k8s:exec
// ---------------------------------------------------------------------------

interface K8sExecData {
  pod: string;
  container: string | undefined;
  cluster: ClusterFlags;
  command: readonly string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

const DEFAULT_EXEC_TIMEOUT = 120_000;
const MAX_EXEC_TIMEOUT = 10 * 60_000;

export const k8sExecTool: Tool = {
  id: 'k8s_exec',
  description: 'Exec a one-shot command in a pod container. Always gated.',
  inputSchema: {
    type: 'object',
    properties: {
      pod: { type: 'string' },
      container: { type: 'string' },
      command: { type: 'array', items: { type: 'string' }, description: 'argv to exec inside the container.' },
      stdin: { type: 'string', description: 'Optional string piped to stdin; enables -i.' },
      timeoutMs: { type: 'number', minimum: 1000, maximum: MAX_EXEC_TIMEOUT },
      ...CLUSTER_SCHEMA,
    },
    required: ['pod', 'command'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cluster = clusterFlags(input);
    const cmd = Array.isArray(input['command'])
      ? (input['command'] as unknown[]).map(String)
      : [];
    const pod = str(input, 'pod');
    const container = str(input, 'container');
    return {
      title: 'k8s_exec',
      content: [
        `Cluster: **${clusterDescription(cluster)}**`,
        `Pod: \`${pod}\`${container ? ` / container \`${container}\`` : ''}`,
        '',
        '**Command**',
        '```bash',
        cmd.join(' '),
        '```',
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const pod = str(input, 'pod');
    if (!pod) { return fail('k8s_exec', 'pod required'); }
    const cmd = Array.isArray(input['command'])
      ? (input['command'] as unknown[]).map(String)
      : [];
    if (cmd.length === 0) { return fail('k8s_exec', 'command required (non-empty argv)'); }
    const cluster = clusterFlags(input);
    const container = str(input, 'container');
    const stdin = str(input, 'stdin');
    const timeoutMs = Math.min(num(input, 'timeoutMs') ?? DEFAULT_EXEC_TIMEOUT, MAX_EXEC_TIMEOUT);

    const argv = ['kubectl', 'exec'];
    if (stdin !== undefined) { argv.push('-i'); }
    argv.push(pod);
    if (container) { argv.push('-c', container); }
    argv.push(...clusterArgv(cluster));
    argv.push('--', ...cmd);

    // Need custom spawn to write stdin if provided.
    const [command, ...args] = argv;
    const started = Date.now();
    return new Promise<ToolResult>(resolve => {
      const child = spawn(command!, args, {
        stdio: [stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
        shell: false,
      });
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
      const onAbort = () => child.kill('SIGKILL');
      deps.signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout?.on('data', (c: Buffer) => { stdout += c.toString('utf8'); });
      child.stderr?.on('data', (c: Buffer) => { stderr += c.toString('utf8'); });

      child.on('error', err => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        resolve(fail('k8s_exec', `spawn failed: ${err.message}`));
      });
      child.on('close', code => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        const durationMs = Date.now() - started;
        const ok = code === 0 && !timedOut;
        const data: K8sExecData = {
          pod, container, cluster, command: cmd,
          exitCode: code, stdout, stderr, timedOut, durationMs,
        };
        resolve({
          output: [
            ok
              ? `Exec ok in ${durationMs} ms on \`${pod}\`${container ? ` [${container}]` : ''}.`
              : `**Exec failed** (exit ${code}${timedOut ? ', timed out' : ''}) on \`${pod}\`.`,
            stdout ? '\n**stdout**\n```\n' + stdout.replace(/\n+$/, '') + '\n```' : '',
            stderr ? '\n**stderr**\n```\n' + stderr.replace(/\n+$/, '') + '\n```' : '',
          ].filter(Boolean).join('\n'),
          format: 'markdown',
          success: ok,
          ...(ok ? {} : { error: `exit ${code}` }),
          data,
        });
      });

      if (stdin !== undefined && child.stdin) {
        child.stdin.end(stdin);
      }
    });
  },
};

// ---------------------------------------------------------------------------
// k8s:port-forward -- bounded-runtime tunnel, streams kubectl's output
// ---------------------------------------------------------------------------

interface K8sPortForwardData {
  resource: string;
  cluster: ClusterFlags;
  mappings: readonly string[];
  exitCode: number | null;
  durationMs: number;
  timedOut: boolean;
}

const DEFAULT_PF_RUNTIME = 30 * 60_000;
const MAX_PF_RUNTIME = 3 * 60 * 60_000;

export const k8sPortForwardTool: Tool = {
  id: 'k8s:port-forward',
  description: 'kubectl port-forward. Bounded runtime; streams kubectl output.',
  inputSchema: {
    type: 'object',
    properties: {
      resource: { type: 'string', description: 'e.g. pod/foo, svc/bar, deploy/baz.' },
      mappings: {
        type: 'array', items: { type: 'string' },
        description: 'Port mappings in local:remote form (e.g. "8080:80").',
      },
      address: { type: 'string', description: '--address. Default 127.0.0.1.' },
      maxRuntimeMs: { type: 'number', minimum: 1000, maximum: MAX_PF_RUNTIME },
      ...CLUSTER_SCHEMA,
    },
    required: ['resource', 'mappings'],
    additionalProperties: false,
  },
  requiresApproval: true,

  buildApprovalGate(input: ToolInput): ToolApprovalGate {
    const cluster = clusterFlags(input);
    const mappings = Array.isArray(input['mappings'])
      ? (input['mappings'] as unknown[]).map(String)
      : [];
    const maxRuntime = Math.min(num(input, 'maxRuntimeMs') ?? DEFAULT_PF_RUNTIME, MAX_PF_RUNTIME);
    return {
      title: 'k8s:port-forward',
      content: [
        `Cluster: **${clusterDescription(cluster)}**`,
        `Resource: \`${str(input, 'resource')}\``,
        `Mappings: ${mappings.map(m => '`' + m + '`').join(', ')}`,
        `Address: ${str(input, 'address') ?? '127.0.0.1'}`,
        `Max runtime: ${Math.round(maxRuntime / 1000)}s.`,
      ].join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput, deps: ToolDeps): Promise<ToolResult> {
    const resource = str(input, 'resource');
    if (!resource) { return fail('k8s:port-forward', 'resource required'); }
    const mappings = Array.isArray(input['mappings'])
      ? (input['mappings'] as unknown[]).map(String).filter(s => s.length > 0)
      : [];
    if (mappings.length === 0) { return fail('k8s:port-forward', 'mappings required'); }
    const cluster = clusterFlags(input);
    const address = str(input, 'address');
    const maxRuntimeMs = Math.min(num(input, 'maxRuntimeMs') ?? DEFAULT_PF_RUNTIME, MAX_PF_RUNTIME);

    const argv = ['kubectl', 'port-forward'];
    if (address) { argv.push('--address', address); }
    argv.push(resource);
    argv.push(...mappings);
    argv.push(...clusterArgv(cluster));

    const [command, ...args] = argv;
    const started = Date.now();
    return new Promise<ToolResult>(resolve => {
      const child = spawn(command!, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, maxRuntimeMs);
      const onAbort = () => child.kill('SIGTERM');
      deps.signal?.addEventListener('abort', onAbort, { once: true });

      child.stdout?.on('data', (c: Buffer) => {
        deps.send({ id: deps.requestId, stream: 'progress', data: { message: c.toString('utf8') } });
      });
      child.stderr?.on('data', (c: Buffer) => {
        deps.send({ id: deps.requestId, stream: 'progress', data: { message: '[stderr] ' + c.toString('utf8') } });
      });

      child.on('error', err => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        resolve(fail('k8s:port-forward', `spawn failed: ${err.message}`));
      });

      child.on('close', code => {
        clearTimeout(timer);
        deps.signal?.removeEventListener('abort', onAbort);
        const durationMs = Date.now() - started;
        const data: K8sPortForwardData = {
          resource, cluster, mappings,
          exitCode: code, durationMs, timedOut,
        };
        const ok = code === 0 || (timedOut && code === null);
        resolve({
          output: [
            `Port-forward ended${timedOut ? ' (runtime cap)' : ''} after ${durationMs} ms.`,
            `Resource: \`${resource}\`; mappings: ${mappings.join(', ')}.`,
          ].join('\n'),
          format: 'markdown',
          success: ok,
          ...(ok ? {} : { error: `exit ${code}` }),
          data,
        });
      });
    });
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerK8sTools(): void {
  registerTool(k8sGetTool);
  registerTool(k8sApplyTool);
  registerTool(k8sDeleteTool);
  registerTool(k8sLogsTool);
  registerTool(k8sExecTool);
  registerTool(k8sPortForwardTool);
}
