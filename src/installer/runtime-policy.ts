import { posix, win32 } from 'node:path';
import policy from './runtime-policy.json' with { type: 'json' };
import { InstallerError, PRIVATE_NODE_VERSION } from './contracts.js';
import type { Target } from './contracts.js';
export { policy as runtimePolicy };
export function runtimeArchive(target: Pick<Target, 'os' | 'arch'>): { url: string; sha256: string; root: string } {
  const key = `${target.os}-${target.arch}` as keyof typeof policy.archives;
  const sha256 = policy.archives[key];
  if (!sha256 || policy.nodeVersion !== PRIVATE_NODE_VERSION || policy.headersVersion !== PRIVATE_NODE_VERSION) throw new InstallerError('runtime-invalid', 'Unsupported or inconsistent runtime policy');
  const root = `node-v${policy.nodeVersion}-${target.os === 'win32' ? 'win' : target.os}-${target.arch}`;
  return { url: `https://nodejs.org/download/release/v${policy.nodeVersion}/${root}.${target.os === 'win32' ? 'zip' : 'tar.gz'}`, sha256, root };
}
export function privateRuntimePaths(home: string, target: Pick<Target, 'os' | 'arch'>): { directory: string; node: string; npmCli: string } {
  const path = target.os === 'win32' ? win32 : posix;
  if (!path.isAbsolute(home)) throw new InstallerError('home-invalid', 'Private runtime home must be absolute');
  runtimeArchive(target);
  const directory = path.join(home, 'runtimes', PRIVATE_NODE_VERSION, `${target.os}-${target.arch}`);
  return { directory, node: path.join(directory, target.os === 'win32' ? 'node.exe' : 'bin/node'), npmCli: path.join(directory, target.os === 'win32' ? 'node_modules/npm/bin/npm-cli.js' : 'lib/node_modules/npm/bin/npm-cli.js') };
}
/** All child launches use absolute private executables; no PATH lookup. */
export function privateRuntimeEnvironment(input: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env = { ...input }; delete env['NODE_OPTIONS']; delete env['NODE_PATH'];
  if (env['ONNXRUNTIME_NODE_INSTALL_CUDA'] === undefined) env['ONNXRUNTIME_NODE_INSTALL_CUDA'] = 'skip';
  return env;
}
