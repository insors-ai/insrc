/** Developer/release build only. Consumers load the published Node-API v8 binary. */
import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { participantContext } from './test-harness/context.mjs';
import { processScope } from './test-harness/process.mjs';
const context = participantContext();
if (!['preparing', 'mutating'].includes(context.phase)) throw new Error('Native build requires coordinator writer ownership');
const run = { ...context, record: context, environment: () => ({ ...process.env }), assertOwner: () => {
  if (participantContext().phase !== context.phase) throw new Error('Native build ownership changed');
} };
const scope = processScope(run, { includeForeignActors: false });
const headers = process.env.INSRC_NODE_HEADERS ?? join(homedir(), process.platform === 'win32' ? 'AppData/Local/node-gyp/Cache' : process.platform === 'darwin' ? 'Library/Caches/node-gyp' : '.cache/node-gyp', '22.22.1', 'include/node');
if (!existsSync(join(headers, 'node_api.h'))) throw new Error('Release Node 22.22.1 headers required; set INSRC_NODE_HEADERS to verified headers');
const output = join(context.root, 'out/installer/native/control.node');
mkdirSync(join(context.root, 'out/installer/native'), { recursive: true });
const source = join(context.root, 'src/installer/native/control.c');
const windows = process.platform === 'win32';
const compiler = process.env.INSRC_NATIVE_CC ?? (windows ? 'cl.exe' : 'cc');
const args = windows
  ? ['/nologo', '/LD', '/W4', '/DNAPI_VERSION=8', `/I${headers}`, source, '/link', `/OUT:${output}`, process.env.INSRC_NODE_LIB ?? join(headers, '../../', process.arch, 'node.lib'), 'advapi32.lib']
  : ['-std=c11', '-Wall', '-Wextra', '-Werror', '-shared', '-fPIC', ...(process.platform === 'darwin' ? ['-undefined', 'dynamic_lookup'] : ['-D_GNU_SOURCE']), '-I', headers, source, '-o', output];
try {
  const result = await scope.start(compiler, args, { budgetMs: context.budgets.buildMs, stdout: 'inherit', stderr: 'inherit' });
  if (result.code !== 0 || result.timedOut || result.launchError) throw new Error(`Installer native build failed: ${JSON.stringify(result)}`);
} finally {
  if (!await scope.drain()) throw new Error('Native compiler disposal unconfirmed');
}
