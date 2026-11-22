/* Copyright (c) Procix Software India. Licensed under the MIT License. */
// Real application qualification only: no fake daemon, npm, runtime-owner or DB adapter.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createConnection } from 'node:net';
import { open, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const historicalCommit = 'a30aa7f91a50409e129b0af25ff3d897be1b45b6';

/** Each command keeps its absolute executable, arguments, status and full bounded-time log. */
export async function recordedCommand(root, name, executable, args, options = {}) {
 const log = await open(join(root, name + '.log'), 'w', 0o600);
 const started = new Date().toISOString();
 const child = spawn(executable, args, { ...options, stdio: ['ignore', log.fd, log.fd],
  signal: AbortSignal.timeout(options.timeout ?? 600_000), killSignal: 'SIGKILL' });
 let error;
 child.on('error', value => { error = value; });
 const [code, signal] = await new Promise(resolve => child.once('close', (...result) => resolve(result)));
 await log.close();
 const receipt = { started, ended: new Date().toISOString(), executable, args, cwd: options.cwd, pid: child.pid, code, signal, error: error?.message };
 await writeFile(join(root, name + '.json'), JSON.stringify(receipt, null, 2) + '\n');
 assert.ok((options.expectedCodes ?? [0]).includes(code), JSON.stringify(receipt) + '\n' + (await readFile(join(root, name + '.log'), 'utf8')).slice(-12000));
 return receipt;
}

/** IPC only; never opens the daemon's LMDB or Lance files. */
export function qualificationRpc(home, method, params = {}) {
 return new Promise((resolve, reject) => {
  const socket = createConnection(join(home, '.insrc/daemon.sock'));
  let bytes = '';
  socket.setTimeout(15_000, () => socket.destroy(new Error('qualification IPC timeout: ' + method)));
  socket.on('error', reject);
  socket.on('connect', () => socket.write(JSON.stringify({ id: 1, method, params }) + '\n'));
  socket.on('data', chunk => {
   bytes += chunk;
   if (bytes.length > 4 * 1024 * 1024) return socket.destroy(new Error('qualification IPC exceeded limit'));
   const end = bytes.indexOf('\n');
   if (end < 0) return;
   socket.end();
   try {
    const value = JSON.parse(bytes.slice(0, end));
    if (value.error !== undefined) reject(new Error(JSON.stringify(value.error))); else resolve(value.result);
   } catch (error) { reject(error); }
  });
 });
}

/** Same local Ollama protocol fixture as seeded-daemon.ts, with all stores seeded over IPC. */
export async function qualificationEmbedder() {
 const vector = Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0);
 const server = createServer((request, response) => {
  let bytes = '';
  request.on('data', chunk => { bytes += chunk; });
  request.on('end', () => {
   response.setHeader('content-type', 'application/json');
   if (request.url === '/api/tags') {
    response.end(JSON.stringify({ models: [{ name: 'qualification:latest', model: 'qualification:latest', details: {} }] }));
   } else if (request.url === '/api/embed') {
    const input = JSON.parse(bytes || '{}').input;
    response.end(JSON.stringify({ model: 'qualification:latest', embeddings: (Array.isArray(input) ? input : [input]).map(() => vector) }));
   } else { response.statusCode = 404; response.end('{}'); }
  });
 });
 server.listen(0, '127.0.0.1');
 await once(server, 'listening');
 return { host: 'http://127.0.0.1:' + server.address().port, vector,
  close: () => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }) };
}

/** Native ONNX CPU execution, separate from model quality or downloaded embedding weights. */
export const nativeOnnxProbe = `
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/package.json');
const ort = require('onnxruntime-node');
// Protobuf for one standard ONNX Identity(float[1]) graph; no model download.
const varint = n => { const b=[]; do { b.push((n & 127) | (n > 127 ? 128 : 0)); n >>>= 7; } while(n); return Buffer.from(b); };
const integer = (field,n) => Buffer.concat([varint(field*8),varint(n)]);
const message = (field,bytes) => { const b=typeof bytes==='string'?Buffer.from(bytes):bytes; return Buffer.concat([varint(field*8+2),varint(b.length),b]); };
const value = name => Buffer.concat([message(1,name),message(2,message(1,Buffer.concat([integer(1,1),message(2,message(1,integer(1,1)))])))]);
const node = Buffer.concat([message(1,'x'),message(2,'y'),message(4,'Identity')]);
const graph = Buffer.concat([message(1,node),message(2,'qualification'),message(11,value('x')),message(12,value('y'))]);
const model = Buffer.concat([integer(1,8),message(7,graph),message(8,integer(2,13))]);
const session = await ort.InferenceSession.create(model,{executionProviders:['cpu'],intraOpNumThreads:1,interOpNumThreads:1});
try { const result=await session.run({x:new ort.Tensor('float32',Float32Array.of(42),[1])}); assert.deepEqual(Array.from(result.y.data),[42]); }
finally { await session.release(); }
process.stdout.write(JSON.stringify({node:process.versions.node,executable:process.execPath,abi:process.versions.modules,onnx:'cpu Identity(float32[1]) => 42'})+'\\n');
`;
