/** Dev build tooling under the bootstrap's verified distribution and existing owner. */
import { lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { InstallerError, PRIVATE_NODE_VERSION } from './contracts.js';
import type { Target } from './contracts.js';
import { privateRuntimeEnvironment, runtimeArchive, runtimePolicy } from './runtime-policy.js';

export interface DevToolchain { readonly directory: string; readonly node: string; readonly npmCli: string; readonly npxCli: string; readonly nodeGyp: string; readonly headers: string; readonly target: Target }
export interface DevBuildOwner {
  root: string; active: string; workspace: string; runId: string; runtime: { executable: string };
  record: { phase: string }; budgets: { fileMs: number }; assertOwner(): void;
}
export interface DevCommandScope {
  start(command: string, args: string[], options?: { cwd?: string; env?: NodeJS.ProcessEnv; budgetMs?: number }):
    Promise<{ code: number | null; timedOut?: boolean; interrupted?: boolean; launchError?: string; log: string }>;
  drain(): Promise<boolean>;
}
const verified = new WeakSet<DevToolchain>();
function regular(root: string, name: string): string {
  const file = join(root, name);
  try {
    let path = file;
    while (path !== root) {
      if (lstatSync(path).isSymbolicLink()) throw new Error('linked');
      path = dirname(path);
    }
    if (!lstatSync(file).isFile()) throw new Error('not regular');
  } catch (cause) { throw new InstallerError('source-prerequisite-missing', `Missing regular private toolchain file: ${name}`, { cause }); }
  return file;
}
/** The root is trusted only from S1 verified bootstrap/receipt loading, never wire input.
 * Require this worker to be executing that exact distribution before using npm. */
export function verifyDevToolchain(directory: string, target: Target): DevToolchain {
  runtimeArchive(target);
  if (!isAbsolute(directory)) throw new InstallerError('runtime-invalid', 'Private runtime root must be absolute');
  const root = realpathSync(directory), node = regular(root, target.os === 'win32' ? 'node.exe' : 'bin/node');
  if (process.version !== `v${PRIVATE_NODE_VERSION}` || process.platform !== target.os || process.arch !== target.arch
    || realpathSync(process.execPath) !== node) throw new InstallerError('runtime-invalid', 'Dev preparation must execute its exact verified private Node');
  const npmRoot = target.os === 'win32' ? 'node_modules/npm' : 'lib/node_modules/npm';
  const npmCli = regular(root, `${npmRoot}/bin/npm-cli.js`), npxCli = regular(root, `${npmRoot}/bin/npx-cli.js`);
  const nodeGyp = regular(root, `${npmRoot}/node_modules/node-gyp/bin/node-gyp.js`);
  let pkg: { version?: unknown };
  try { pkg = JSON.parse(readFileSync(regular(root, `${npmRoot}/package.json`), 'utf8')) as typeof pkg; }
  catch (cause) { throw new InstallerError('runtime-invalid', 'Private npm metadata is invalid', { cause }); }
  if (pkg.version !== runtimePolicy.npmVersion) throw new InstallerError('runtime-invalid', 'Private npm version differs from release policy');
  const header = readFileSync(regular(root, 'include/node/node_version.h'), 'utf8');
  const version = ['MAJOR', 'MINOR', 'PATCH'].map(key => new RegExp(`^#define NODE_${key}_VERSION\\s+(\\d+)`, 'm').exec(header)?.[1]).join('.');
  if (version !== runtimePolicy.headersVersion) throw new InstallerError('runtime-invalid', 'Private native headers differ from release policy');
  regular(root, 'include/node/common.gypi'); regular(root, 'include/node/config.gypi');
  const value = Object.freeze({ directory: root, node, npmCli, npxCli, nodeGyp, headers: root, target: Object.freeze({ ...target }) });
  verified.add(value); return value;
}
function assertToolchain(toolchain: DevToolchain): void {
  if (!verified.has(toolchain)) throw new InstallerError('runtime-invalid', 'Toolchain must be verified in this worker');
}
/** Clear foreign coordinator identity before admitting the source worker. */
export function devBuildEnvironment(toolchain: DevToolchain, inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  assertToolchain(toolchain);
  const env = privateRuntimeEnvironment(inherited);
  const controlled = new Set(['node_options', 'node_path', 'node_test_context', 'insrc_test_run_id', 'insrc_test_root',
    'npm_config_target', 'npm_config_runtime', 'npm_config_arch', 'npm_config_platform', 'npm_config_nodedir', 'npm_config_disturl',
    'npm_config_node_options', 'npm_config_node_gyp', 'npm_config_node_version', 'npm_config_ignore_scripts', 'npm_config_omit',
    'npm_config_optional', 'npm_config_include', 'npm_config_global', 'npm_config_prefix', 'npm_config_script_shell',
    'npm_config_force_process_config', 'npm_config_build_from_source', 'npm_execpath', 'npm_node_execpath']);
  for (const key of Object.keys(env)) if (controlled.has(key.toLowerCase())) delete env[key];
  // Environment values override ambient project/user npm runtime settings; registry
  // authentication and Git/SSH delegation remain untouched and are never logged.
  Object.assign(env, { npm_config_target: PRIVATE_NODE_VERSION, npm_config_runtime: 'node', npm_config_arch: toolchain.target.arch,
    npm_config_platform: toolchain.target.os, npm_config_nodedir: toolchain.headers, npm_config_disturl: 'https://nodejs.org/dist',
    npm_config_node_options: '', npm_config_node_gyp: toolchain.nodeGyp, npm_config_ignore_scripts: 'false', npm_config_omit: '', npm_config_include: 'optional',
    npm_config_global: 'false', npm_node_execpath: toolchain.node, npm_execpath: toolchain.npmCli });
  env['PATH'] = [dirname(toolchain.node), env['PATH'] ?? ''].join(delimiter);
  return env;
}

/** Private per-run aliases protect package scripts that invoke npm/npx by name.
 * No verified distribution or global PATH/config is modified. */
export function ownedDevBuildEnvironment(owner: DevBuildOwner, toolchain: DevToolchain, inherited: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  owner.assertOwner(); assertToolchain(toolchain);
  if (!['preparing', 'mutating'].includes(owner.record.phase) || realpathSync(owner.runtime.executable) !== toolchain.node
    || !isAbsolute(owner.workspace) || relative(owner.root, owner.workspace).startsWith('..')) throw new InstallerError('runtime-invalid', 'Private tools require the accepted checkout writer');
  const bin = join(owner.workspace, 'private-bin');
  try { mkdirSync(bin, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  if (!lstatSync(bin).isDirectory() || lstatSync(bin).isSymbolicLink()) throw new InstallerError('path-invalid', 'Private aliases must be an owned real directory');
  const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
  const batchQuote = (value: string) => '"' + value.replaceAll('%', '%%') + '"';
  for (const [name, cli] of [['npm', toolchain.npmCli], ['npx', toolchain.npxCli]] as const) {
    const file = join(bin, toolchain.target.os === 'win32' ? `${name}.cmd` : name);
    const content = toolchain.target.os === 'win32'
      ? `@echo off\r\nsetlocal DisableDelayedExpansion\r\n${batchQuote(toolchain.node)} ${batchQuote(cli)} %*\r\nexit /b %errorlevel%\r\n`
      : `#!/bin/sh\nexec ${quote(toolchain.node)} ${quote(cli)} "$@"\n`;
    try { writeFileSync(file, content, { flag: 'wx', mode: 0o700 }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || !lstatSync(file).isFile() || lstatSync(file).isSymbolicLink()
        || readFileSync(file, 'utf8') !== content) throw new InstallerError('candidate-conflict', 'Private npm alias changed');
    }
  }
  owner.assertOwner();
  const env = devBuildEnvironment(toolchain, inherited);
  env['PATH'] = [dirname(toolchain.node), bin, inherited['PATH'] ?? ''].join(delimiter);
  env['INSRC_TEST_RUN_ID'] = owner.runId; env['INSRC_TEST_ROOT'] = owner.root;
  return env;
}

export async function checkDevPrerequisites(owner: DevBuildOwner, scope: DevCommandScope, toolchain: DevToolchain, env: NodeJS.ProcessEnv): Promise<void> {
  owner.assertOwner(); assertToolchain(toolchain);
  const probes = toolchain.target.os === 'win32'
    ? [['git', '--version'], ['cl.exe', '/?'], ['powershell.exe', '-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()']]
    : [['git', '--version'], ['cc', '--version'], ['tar', '--version']];
  for (const [command, ...args] of probes) {
    const result = await scope.start(command!, args, { cwd: owner.root, env, budgetMs: owner.budgets.fileMs });
    if (result.code !== 0 || result.timedOut || result.interrupted || result.launchError) throw new InstallerError('source-prerequisite-missing', `Required source build tool is unavailable: ${command}`);
    owner.assertOwner();
  }
}
export async function installDevDependencies(owner: DevBuildOwner, scope: DevCommandScope, toolchain: DevToolchain, env: NodeJS.ProcessEnv): Promise<void> {
  owner.assertOwner(); assertToolchain(toolchain);
  const helpers = await loadDevBuildHelpers(owner);
  await helpers.withWriter(owner, scope, async () => {
    const result = await scope.start(toolchain.node, [toolchain.npmCli, 'ci', '--include=dev', '--include=optional', '--ignore-scripts=false', '--no-audit', '--no-fund'],
      { cwd: owner.root, env, budgetMs: owner.budgets.fileMs });
    if (result.code !== 0 || result.timedOut || result.interrupted || result.launchError) throw new InstallerError('source-build-failed', 'Private npm ci failed');
    owner.assertOwner();
  });
}
export async function loadDevBuildHelpers(owner: DevBuildOwner): Promise<{
  buildStages: (run: unknown, options: { npmCli: string }) => string[][];
  prepareBuild: (...args: unknown[]) => Promise<unknown>;
  withWriter: <T>(run: DevBuildOwner, scope: DevCommandScope, work: () => Promise<T>) => Promise<T>;
}> {
  owner.assertOwner();
  const helper = regular(realpathSync(owner.root), 'scripts/test-harness/build.mjs');
  return import(pathToFileURL(resolve(helper)).href);
}
