/** Actual inherited fd 3 fixture: no bearer token is accepted from argv/environment/stdin. */
import assert from 'node:assert/strict';
import { createConnection } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { initializePrivateSessionPipe, privateSessionBootstrap } from '../session-bootstrap.js';
import { forwardStep } from '../forward-step.js';
initializePrivateSessionPipe();
for (let i = 0; i < 100; i++) { try { privateSessionBootstrap(); break; } catch { await delay(10); } }
if (process.argv[3] === 'all-phases') {
 for (const phase of ['start', 'plan', 'narrow', 'bundle', 'unknown']) { let progress = 0; const result = await forwardStep('insrc_analyze_step', { phase, state: 'DATA_SECRET_CANARY', focus: 'DATA_SECRET_CANARY', bundle: { summary: 'DATA_SECRET_CANARY' } }, { onProgress: () => { progress++; } }, { connect: () => createConnection(process.argv[2]!) }); assert.equal(result.isError, true); assert.match(result.content[0]!.text, /unsupported-temporary/); assert.equal(JSON.stringify(result).includes('DATA_SECRET_CANARY'), false); assert.equal(progress, 0); }
 let oneShotProgress = 0; const result = await forwardStep('insrc_analyze', { focus: 'DATA_SECRET_CANARY' }, { onProgress: () => { oneShotProgress++; } }, { connect: () => createConnection(process.argv[2]!) }); assert.equal(result.isError, true); assert.match(result.content[0]!.text, /unsupported-temporary/); assert.equal(JSON.stringify(result).includes('DATA_SECRET_CANARY'), false); assert.equal(oneShotProgress, 0); assert.equal(JSON.stringify(result).includes('CONFIG_SECRET_CANARY'), false); process.stdout.write('all-phases-refused\n'); process.exit(0);
}
const call = () => forwardStep('insrc_analyze_step', { phase: 'bundle', state: 'PRIVATE_STATE_CANARY' }, {}, { connect: () => createConnection(process.argv[2]!) });
for (let i = 0; i < 2; i++) assert.equal((await call()).isError, true);
process.stdout.write('attached-twice\n');
await new Promise<void>(resolve => { process.stdin.once('data', () => resolve()); });
await delay(30);
if (process.argv[3] === 'refresh') { assert.equal((await call()).isError, true); process.stdout.write('refreshed-once\n'); await new Promise<void>(resolve => process.stdin.once('data', () => resolve())); await delay(30); }
assert.equal((await call()).isError, true);
process.stdout.write('lost-pipe-refused\n');
process.exit(0);
