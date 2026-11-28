import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInProcessGroup } from '../../../../../src/shared/process-group.js';

/** Real wall time, real packaged Blob worker. Virtual-time DOM dumps can race
 * worker completion and are deliberately not used for async codec evidence. */
export async function runScratchBrowser(chrome: string, dir: string, resultId = 'scratch-result', nonce = ''): Promise<string> {
  const { bundleScratchEditor } = await import('../../../../esbuild.mjs');
  await bundleScratchEditor(dir);
  let html = readFileSync(resolve(dir, 'index.html'), 'utf8');
  if (!html.includes('id="scratch-validator-source"')) html = html.replace(/<!doctype[^>]*>/i, doctype => `${doctype}<script type="application/json" id="scratch-validator-source"${nonce ? ` nonce="${nonce}"` : ''}>${JSON.stringify(readFileSync(resolve(dir, 'validator.js'), 'utf8')).replaceAll('<', '\\u003c')}</script>`);
  // Poll only evidence nodes, never serialize note/worker bytes into the result URL.
  html += `<script${nonce ? ` nonce="${nonce}"` : ''}>setInterval(()=>{const p=document.getElementById(${JSON.stringify(resultId)})||document.getElementById('scratch-error');if(p)location.href='/__insrc_result?html='+encodeURIComponent(p.outerHTML)},20)</script>`;
  const abort = new AbortController();
  let done!: (value: string) => void;
  const evidence = new Promise<string>(resolveResult => { done = resolveResult; });
  const server = createServer({ maxHeaderSize: 8 * 1024 * 1024 }, (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname === '/__insrc_result') { done(url.searchParams.get('html') ?? ''); res.end('Evidence received'); return; }
    if (url.pathname === '/' || url.pathname === '/index.html') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    const file = resolve(dir, '.' + url.pathname);
    if (!file.startsWith(resolve(dir) + sep)) { res.writeHead(403).end(); return; }
    try { const bytes = readFileSync(file); res.setHeader('Content-Type', extname(file) === '.js' ? 'text/javascript' : extname(file) === '.css' ? 'text/css' : 'application/octet-stream'); res.end(bytes); }
    catch { res.writeHead(404).end(); }
  });
  await new Promise<void>(resolveServer => server.listen(0, '127.0.0.1', resolveServer));
  const address = server.address(); assert.ok(address && typeof address === 'object');
  const origin = `http://127.0.0.1:${address.port}`;
  html = html.replaceAll(pathToFileURL(dir).href, origin).replaceAll('vscode-webview://fixture', origin);
  writeFileSync(resolve(dir, 'served.html'), html);
  const processRun = runInProcessGroup(chrome, ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-background-networking', '--no-first-run', `--user-data-dir=${resolve(dir, 'profile')}`, origin], { timeoutMs: 90_000, signal: abort.signal });
  try {
    const result = await Promise.race([evidence, processRun.then(result => { throw new Error(`Browser ended before evidence: ${JSON.stringify(result).slice(-3500)}`); })]);
    abort.abort(); const closed = await processRun;
    assert.equal(closed.aborted, true); assert.equal(closed.timedOut, false);
    assert.ok(!result.includes('id="scratch-error"'), result);
    return result;
  } finally { abort.abort(); await processRun; server.closeAllConnections(); await new Promise<void>(resolveClose => server.close(() => resolveClose())); }
}
