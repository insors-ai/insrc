/**
 * Package manager tools -- install / add / remove / outdated / audit.
 *
 * Each tool auto-detects the package manager from lockfile presence
 * (package-lock.json, pnpm-lock.yaml, yarn.lock, poetry.lock,
 * Pipfile.lock, go.sum, Cargo.lock) and shells out to the matching
 * CLI. Callers can force a specific manager via the `manager` arg.
 */

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { runShell } from '../../shell-helper.js';
import { registerTool } from '../../registry.js';
import type {
  Tool, ToolApprovalGate, ToolInput, ToolResult,
} from '../../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function str(input: ToolInput, key: string): string | undefined {
  const v = input[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function bool(input: ToolInput, key: string): boolean | undefined {
  const v = input[key];
  return typeof v === 'boolean' ? v : undefined;
}

function fail(id: string, msg: string): ToolResult {
  return { output: `[${id}] ${msg}`, format: 'text', success: false, error: msg };
}

function tryParseJson(stdout: string): unknown {
  try { return JSON.parse(stdout); } catch { return null; }
}

export type Manager =
  | 'npm' | 'pnpm' | 'yarn'
  | 'pip' | 'pipenv' | 'poetry'
  | 'go' | 'cargo';

const MANAGERS: readonly Manager[] = ['npm', 'pnpm', 'yarn', 'pip', 'pipenv', 'poetry', 'go', 'cargo'];

function parseManager(input: ToolInput): Manager | undefined {
  const raw = str(input, 'manager');
  return raw && (MANAGERS as readonly string[]).includes(raw) ? (raw as Manager) : undefined;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/** Walk lockfile precedence to guess which manager runs this project. */
async function detectManager(cwd: string): Promise<Manager | undefined> {
  const pairs: Array<[string, Manager]> = [
    ['pnpm-lock.yaml', 'pnpm'],
    ['yarn.lock', 'yarn'],
    ['package-lock.json', 'npm'],
    ['poetry.lock', 'poetry'],
    ['Pipfile.lock', 'pipenv'],
    ['go.sum', 'go'],
    ['Cargo.lock', 'cargo'],
  ];
  for (const [file, mgr] of pairs) {
    if (await fileExists(join(cwd, file))) { return mgr; }
  }
  // package.json without a lockfile -> default to npm.
  if (await fileExists(join(cwd, 'package.json'))) { return 'npm'; }
  // Bare requirements.txt or pyproject.toml -> pip.
  if (await fileExists(join(cwd, 'requirements.txt')) || await fileExists(join(cwd, 'pyproject.toml'))) { return 'pip'; }
  // go.mod without go.sum -> go.
  if (await fileExists(join(cwd, 'go.mod'))) { return 'go'; }
  // Cargo.toml without lock -> cargo.
  if (await fileExists(join(cwd, 'Cargo.toml'))) { return 'cargo'; }
  return undefined;
}

async function resolveManager(input: ToolInput, cwd: string, id: string): Promise<Manager | ToolResult> {
  const explicit = parseManager(input);
  if (explicit) { return explicit; }
  const detected = await detectManager(cwd);
  if (detected) { return detected; }
  return fail(id, `could not detect package manager in ${cwd}; pass \`manager\``);
}

interface PkgRunOpts {
  cwd: string;
  timeoutMs: number;
}

function packageNamesFromInput(input: ToolInput): string[] {
  const raw = input['packages'];
  if (Array.isArray(raw)) { return (raw as unknown[]).map(String).filter(s => s.length > 0); }
  const single = str(input, 'package');
  return single ? [single] : [];
}

function isDev(input: ToolInput): boolean {
  return bool(input, 'dev') === true;
}

// ---------------------------------------------------------------------------
// Argv builders per manager
// ---------------------------------------------------------------------------

function installArgv(manager: Manager): string[] {
  switch (manager) {
    case 'npm':    return ['npm', 'install'];
    case 'pnpm':   return ['pnpm', 'install'];
    case 'yarn':   return ['yarn', 'install'];
    case 'pip':    return ['pip', 'install', '-r', 'requirements.txt'];
    case 'pipenv': return ['pipenv', 'install'];
    case 'poetry': return ['poetry', 'install'];
    case 'go':     return ['go', 'mod', 'download'];
    case 'cargo':  return ['cargo', 'fetch'];
  }
}

function addArgv(manager: Manager, packages: string[], dev: boolean): string[] {
  switch (manager) {
    case 'npm':    return ['npm', dev ? 'install' : 'install', ...(dev ? ['--save-dev'] : []), ...packages];
    case 'pnpm':   return ['pnpm', 'add', ...(dev ? ['-D'] : []), ...packages];
    case 'yarn':   return ['yarn', 'add', ...(dev ? ['--dev'] : []), ...packages];
    case 'pip':    return ['pip', 'install', ...packages];
    case 'pipenv': return ['pipenv', 'install', ...(dev ? ['--dev'] : []), ...packages];
    case 'poetry': return ['poetry', 'add', ...(dev ? ['--group', 'dev'] : []), ...packages];
    case 'go':     return ['go', 'get', ...packages];
    case 'cargo':  return ['cargo', 'add', ...(dev ? ['--dev'] : []), ...packages];
  }
}

function removeArgv(manager: Manager, packages: string[]): string[] {
  switch (manager) {
    case 'npm':    return ['npm', 'uninstall', ...packages];
    case 'pnpm':   return ['pnpm', 'remove', ...packages];
    case 'yarn':   return ['yarn', 'remove', ...packages];
    case 'pip':    return ['pip', 'uninstall', '-y', ...packages];
    case 'pipenv': return ['pipenv', 'uninstall', ...packages];
    case 'poetry': return ['poetry', 'remove', ...packages];
    // `go mod tidy` after manually editing go.mod is the idiomatic path; we
    // approximate "remove" by running tidy and asking the caller to delete
    // the import. Surface a non-fatal notice in the output.
    case 'go':     return ['go', 'mod', 'tidy'];
    case 'cargo':  return ['cargo', 'remove', ...packages];
  }
}

function outdatedArgv(manager: Manager): { argv: string[]; expectsJson: boolean; nonZeroOk: boolean } {
  switch (manager) {
    case 'npm':    return { argv: ['npm', 'outdated', '--json', '--long'],            expectsJson: true,  nonZeroOk: true };
    case 'pnpm':   return { argv: ['pnpm', 'outdated', '--format', 'json'],           expectsJson: true,  nonZeroOk: true };
    case 'yarn':   return { argv: ['yarn', 'outdated', '--json'],                     expectsJson: true,  nonZeroOk: true };
    case 'pip':    return { argv: ['pip', 'list', '--outdated', '--format', 'json'],  expectsJson: true,  nonZeroOk: false };
    case 'pipenv': return { argv: ['pipenv', 'update', '--outdated'],                 expectsJson: false, nonZeroOk: false };
    case 'poetry': return { argv: ['poetry', 'show', '--outdated'],                   expectsJson: false, nonZeroOk: false };
    case 'go':     return { argv: ['go', 'list', '-u', '-m', 'all'],                  expectsJson: false, nonZeroOk: false };
    case 'cargo':  return { argv: ['cargo', 'outdated', '--format', 'json'],          expectsJson: true,  nonZeroOk: false };
  }
}

function auditArgv(manager: Manager): { argv: string[]; expectsJson: boolean; nonZeroOk: boolean } {
  switch (manager) {
    case 'npm':    return { argv: ['npm', 'audit', '--json'],    expectsJson: true,  nonZeroOk: true };
    case 'pnpm':   return { argv: ['pnpm', 'audit', '--json'],   expectsJson: true,  nonZeroOk: true };
    case 'yarn':   return { argv: ['yarn', 'audit', '--json'],   expectsJson: false, nonZeroOk: true }; // NDJSON, not a single doc
    case 'pip':    return { argv: ['pip-audit', '-f', 'json'],   expectsJson: true,  nonZeroOk: true };
    case 'pipenv': return { argv: ['pipenv', 'check', '--output', 'json'], expectsJson: true, nonZeroOk: true };
    case 'poetry': return { argv: ['poetry', 'audit'],           expectsJson: false, nonZeroOk: true };
    case 'go':     return { argv: ['govulncheck', './...'],      expectsJson: false, nonZeroOk: true };
    case 'cargo':  return { argv: ['cargo', 'audit', '--json'],  expectsJson: true,  nonZeroOk: true };
  }
}

// ---------------------------------------------------------------------------
// pkg:install
// ---------------------------------------------------------------------------

interface PkgInstallData {
  manager: Manager;
  cwd: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const pkgInstallTool: Tool = {
  id: 'pkg_install',
  description: 'Install all declared dependencies. Manager auto-detects from lockfile unless `manager` is passed.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      manager: { type: 'string', enum: [...MANAGERS] },
      frozen: { type: 'boolean', description: 'Use frozen / --frozen-lockfile / --locked flags when supported.' },
      production: { type: 'boolean', description: 'Only production deps (npm/pnpm/yarn).' },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const mgr = parseManager(input) ?? await detectManager(cwd) ?? 'unknown';
    return {
      title: 'pkg_install',
      content: [
        `Manager: **${mgr}**`,
        `Cwd: \`${cwd}\``,
        bool(input, 'frozen')     === true ? 'Frozen lockfile.' : '',
        bool(input, 'production') === true ? 'Production only.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const mgr = await resolveManager(input, cwd, 'pkg_install');
    if (typeof mgr !== 'string') { return mgr; }

    const argv = installArgv(mgr);
    if (bool(input, 'frozen') === true) {
      if (mgr === 'npm')  { argv.splice(1, 1, 'ci'); }
      if (mgr === 'pnpm') { argv.push('--frozen-lockfile'); }
      if (mgr === 'yarn') { argv.push('--frozen-lockfile'); }
      if (mgr === 'cargo'){ argv.push('--locked'); }
    }
    if (bool(input, 'production') === true) {
      if (mgr === 'npm')  { argv.push('--omit=dev'); }
      if (mgr === 'pnpm') { argv.push('--prod'); }
      if (mgr === 'yarn') { argv.push('--production'); }
    }

    const opts: PkgRunOpts = { cwd, timeoutMs: 20 * 60_000 };
    const r = await runShell(argv, opts);
    if (r.spawnError) { return fail('pkg_install', `${mgr} not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: PkgInstallData = { manager: mgr, cwd, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Installed dependencies via **${mgr}**.` : `**Install failed (exit ${r.code})** via ${mgr}.`,
        r.stdout ? '\n**stdout**\n```\n' + r.stdout.slice(-3000).replace(/\n+$/, '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.slice(-2000).replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// pkg:add
// ---------------------------------------------------------------------------

interface PkgAddData {
  manager: Manager;
  packages: readonly string[];
  dev: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export const pkgAddTool: Tool = {
  id: 'pkg_add',
  description: 'Add one or more dependencies. `dev:true` adds to dev deps where supported.',
  inputSchema: {
    type: 'object',
    properties: {
      packages: { type: 'array', items: { type: 'string' }, minItems: 1 },
      package:  { type: 'string', description: 'Shorthand for packages:[single].' },
      dev: { type: 'boolean' },
      cwd: { type: 'string' },
      manager: { type: 'string', enum: [...MANAGERS] },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const mgr = parseManager(input) ?? await detectManager(cwd) ?? 'unknown';
    const packages = packageNamesFromInput(input);
    return {
      title: 'pkg_add',
      content: [
        `Manager: **${mgr}** (cwd: \`${cwd}\`)`,
        `Packages: ${packages.map(p => '`' + p + '`').join(', ')}`,
        isDev(input) ? 'Target: **dev** dependencies.' : 'Target: runtime dependencies.',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const packages = packageNamesFromInput(input);
    if (packages.length === 0) { return fail('pkg_add', 'packages or package required'); }
    const mgr = await resolveManager(input, cwd, 'pkg_add');
    if (typeof mgr !== 'string') { return mgr; }
    const dev = isDev(input);
    const argv = addArgv(mgr, packages, dev);

    const r = await runShell(argv, { cwd, timeoutMs: 15 * 60_000 });
    if (r.spawnError) { return fail('pkg_add', `${mgr} not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const data: PkgAddData = { manager: mgr, packages, dev, exitCode: r.code, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        ok ? `Added \`${packages.join(', ')}\` via **${mgr}**${dev ? ' (dev)' : ''}.` : `**Add failed (exit ${r.code})** via ${mgr}.`,
        r.stdout ? '\n**stdout**\n```\n' + r.stdout.slice(-3000).replace(/\n+$/, '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.slice(-2000).replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// pkg:remove
// ---------------------------------------------------------------------------

interface PkgRemoveData {
  manager: Manager;
  packages: readonly string[];
  exitCode: number | null;
  stdout: string;
  stderr: string;
  note: string | undefined;
}

export const pkgRemoveTool: Tool = {
  id: 'pkg_remove',
  description: 'Remove one or more dependencies. For Go, runs `go mod tidy` (caller must delete the import first).',
  inputSchema: {
    type: 'object',
    properties: {
      packages: { type: 'array', items: { type: 'string' }, minItems: 1 },
      package:  { type: 'string' },
      cwd: { type: 'string' },
      manager: { type: 'string', enum: [...MANAGERS] },
    },
    additionalProperties: false,
  },
  requiresApproval: true,

  async buildApprovalGate(input: ToolInput): Promise<ToolApprovalGate> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const mgr = parseManager(input) ?? await detectManager(cwd) ?? 'unknown';
    const packages = packageNamesFromInput(input);
    return {
      title: 'pkg_remove',
      content: [
        `Manager: **${mgr}** (cwd: \`${cwd}\`)`,
        `Remove: ${packages.map(p => '`' + p + '`').join(', ') || '_none_'}`,
        mgr === 'go' ? '**Note**: go removes via `go mod tidy`; caller must have already deleted the import.' : '',
      ].filter(Boolean).join('\n'),
      actions: [
        { name: 'approve', label: 'Approve' },
        { name: 'skip', label: 'Skip' },
      ],
    };
  },

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const packages = packageNamesFromInput(input);
    const mgr = await resolveManager(input, cwd, 'pkg_remove');
    if (typeof mgr !== 'string') { return mgr; }
    if (mgr !== 'go' && packages.length === 0) {
      return fail('pkg_remove', 'packages or package required');
    }

    const argv = removeArgv(mgr, packages);
    const r = await runShell(argv, { cwd, timeoutMs: 10 * 60_000 });
    if (r.spawnError) { return fail('pkg_remove', `${mgr} not found: ${r.stderr.trim()}`); }
    const ok = r.code === 0;
    const note = mgr === 'go' ? 'Ran `go mod tidy`. Edit the import out of Go sources and re-run to finalize removal.' : undefined;
    const data: PkgRemoveData = { manager: mgr, packages, exitCode: r.code, stdout: r.stdout, stderr: r.stderr, note };
    return {
      output: [
        ok ? `Removed ${packages.length > 0 ? '\`' + packages.join(', ') + '\` ' : ''}via **${mgr}**.` : `**Remove failed (exit ${r.code})**.`,
        note ? `_${note}_` : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.slice(-2000).replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: ok,
      ...(ok ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// pkg:outdated
// ---------------------------------------------------------------------------

interface PkgOutdatedData {
  manager: Manager;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
}

export const pkgOutdatedTool: Tool = {
  id: 'pkg_outdated',
  description: 'List outdated packages. Returns parsed JSON where supported, raw text otherwise.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      manager: { type: 'string', enum: [...MANAGERS] },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const mgr = await resolveManager(input, cwd, 'pkg_outdated');
    if (typeof mgr !== 'string') { return mgr; }

    const { argv, expectsJson, nonZeroOk } = outdatedArgv(mgr);
    const r = await runShell(argv, { cwd, timeoutMs: 5 * 60_000 });
    if (r.spawnError) { return fail('pkg_outdated', `${mgr} not found: ${r.stderr.trim()}`); }
    const reportingOk = r.code === 0 || nonZeroOk;
    const parsed = expectsJson ? tryParseJson(r.stdout) : null;
    const data: PkgOutdatedData = { manager: mgr, exitCode: r.code, parsed, stdout: r.stdout };
    return {
      output: [
        reportingOk ? `Outdated check via **${mgr}**.` : `**Failed (exit ${r.code})** via ${mgr}.`,
        r.stdout ? '\n```' + (expectsJson ? 'json' : '') + '\n' + r.stdout.slice(0, 8000).replace(/\n+$/, '') + (r.stdout.length > 8000 ? '\n... (truncated)' : '') + '\n```' : '_(no output)_',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.slice(-2000).replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: reportingOk,
      ...(reportingOk ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// pkg:audit
// ---------------------------------------------------------------------------

interface PkgAuditData {
  manager: Manager;
  exitCode: number | null;
  parsed: unknown;
  stdout: string;
  stderr: string;
}

export const pkgAuditTool: Tool = {
  id: 'pkg_audit',
  description: 'Run a security audit. npm/pnpm/yarn/pip/poetry/go/cargo via their native audit tooling.',
  inputSchema: {
    type: 'object',
    properties: {
      cwd: { type: 'string' },
      manager: { type: 'string', enum: [...MANAGERS] },
    },
    additionalProperties: false,
  },
  requiresApproval: false,

  async execute(input: ToolInput): Promise<ToolResult> {
    const cwd = str(input, 'cwd') ?? process.cwd();
    const mgr = await resolveManager(input, cwd, 'pkg_audit');
    if (typeof mgr !== 'string') { return mgr; }

    const { argv, expectsJson, nonZeroOk } = auditArgv(mgr);
    const r = await runShell(argv, { cwd, timeoutMs: 10 * 60_000 });
    if (r.spawnError) {
      return fail('pkg_audit', `${argv[0]} not found: ${r.stderr.trim()}. For pip use pip-audit, for go use govulncheck, for cargo use cargo-audit.`);
    }
    const reportingOk = r.code === 0 || nonZeroOk;
    const parsed = expectsJson ? tryParseJson(r.stdout) : null;
    const data: PkgAuditData = { manager: mgr, exitCode: r.code, parsed, stdout: r.stdout, stderr: r.stderr };
    return {
      output: [
        reportingOk
          ? (r.code === 0 ? `No findings via **${mgr}**.` : `**Findings reported** via ${mgr} (exit ${r.code}).`)
          : `**Audit failed (exit ${r.code})** via ${mgr}.`,
        r.stdout ? '\n```' + (expectsJson ? 'json' : '') + '\n' + r.stdout.slice(0, 12_000).replace(/\n+$/, '') + (r.stdout.length > 12_000 ? '\n... (truncated)' : '') + '\n```' : '',
        r.stderr ? '\n**stderr**\n```\n' + r.stderr.slice(-2000).replace(/\n+$/, '') + '\n```' : '',
      ].filter(Boolean).join('\n'),
      format: 'markdown',
      success: reportingOk,
      ...(reportingOk ? {} : { error: `exit ${r.code}` }),
      data,
    };
  },
};

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerPkgTools(): void {
  registerTool(pkgInstallTool);
  registerTool(pkgAddTool);
  registerTool(pkgRemoveTool);
  registerTool(pkgOutdatedTool);
  registerTool(pkgAuditTool);
}
