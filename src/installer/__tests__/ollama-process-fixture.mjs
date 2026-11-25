import { createServer } from 'node:http';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const state = process.env.INSRC_TEST_SERVICE_STATE;
mkdirSync(state, { recursive: true });
writeFileSync(join(state, 'arguments.json'), JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), environment: Object.fromEntries(
  ['HOME', 'USERPROFILE', 'OLLAMA_HOST', 'OLLAMA_MODELS', 'PATH', 'TMPDIR'].map(key => [key, process.env[key]])),
  nodeOptions: process.env.NODE_OPTIONS !== undefined, credential: process.env.ANTHROPIC_API_KEY !== undefined }));
let server;
const timer = setInterval(() => {
  if (!existsSync(join(state, 'stop'))) return;
  clearInterval(timer);
  if (server?.listening) { server.closeAllConnections(); server.close(); }
}, 10);
if (process.env.INSRC_TEST_SERVICE_MODE !== 'slow') {
  const url = new URL(`http://${process.env.OLLAMA_HOST}`);
  server = createServer((request, response) => {
    writeFileSync(join(state, 'last-request'), `${request.method} ${request.url}`);
    response.end('{"version":"0.0.1-fixture"}');
  });
  server.on('error', () => { clearInterval(timer); process.stderr.write('fixture bind failed\n'); process.exitCode = 1; });
  server.listen(Number(url.port), url.hostname.replace(/^\[|\]$/g, ''), () => {
    writeFileSync(join(state, 'ready'), 'available');
    if (process.env.INSRC_TEST_SERVICE_MODE !== 'silent') {
      process.stdout.write(Buffer.alloc(3 * 1024 * 1024, 65));
      process.stderr.write(Buffer.alloc(128 * 1024, 66));
    } else process.stdout.write('fixture-ready\n');
  });
}
