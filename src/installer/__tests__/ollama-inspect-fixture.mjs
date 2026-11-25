import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { dependencyPort, dependencyReadIo } from '../../../out/installer/dependencies.js';
import { parseServiceFrame } from '../../../out/installer/ollama-service-records.js';
const [framePath] = process.argv.slice(2), frame = parseServiceFrame(JSON.parse(readFileSync(framePath, 'utf8'))), root = dirname(frame.location.home);
const port = dependencyPort(frame.policy.target, frame.location, { runtimeDirectory: process.platform === 'win32' ? dirname(process.execPath) : dirname(dirname(process.execPath)),
  userHome: root, environment: { PATH: join(root, 'bin') }, policies: [frame.policy], io: { ...dependencyReadIo, async stat(file) {
    const path = relative(root, file); if (path === '..' || path.startsWith('../') || path.startsWith('..\\')) throw Object.assign(new Error('fixture absence'), { code: 'ENOENT' });
    return dependencyReadIo.stat(file);
  } } });
process.stdout.write(JSON.stringify(await port.inspect(frame.location)));
