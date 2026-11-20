import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import fs, { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { prepareArtifactWrite, writeArtifact } from '../storage.js';
import { connectionExecutionErrorCode, runWithConnectionExecution, sessionConnectionExecution } from '../../shared/step-context.js';
import { RequestLifetime } from '../../daemon/request-context.js';

test('Temporary artifact preparation and writing refuse before payload or filesystem inspection', async () => {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-artifact-admission-'));
	const path = join(dir, 'saved.json');
	const saved = { meta: { workflow: 'fixture' }, body: { marker: 'saved positive control' } };
	writeArtifact(path, saved, 'content');
	const before = readFileSync(path, 'utf8');
	const lifetime = new RequestLifetime();
	const execution = sessionConnectionExecution(Object.freeze({ lookupRoot: dir, daemonEpoch: 'artifact-test', sessionHandle: 'owner' }), {
		bindingId: 'artifact-test', audience: 'workbench-ui', controlGeneration: 1, lifetime, assertActive() {},
	});
	let payloadReads = 0, fileAccess = 0;
	const poison = new Proxy({}, { get() { payloadReads++; throw new Error('PRIVATE_ARTIFACT_PAYLOAD'); }, getPrototypeOf() { payloadReads++; throw new Error('PRIVATE_ARTIFACT_PROTOTYPE'); }, ownKeys() { payloadReads++; throw new Error('PRIVATE_ARTIFACT_KEYS'); } });
	const revoked = Proxy.revocable({}, {}); revoked.revoke();
	const denyFileAccess = () => { fileAccess++; throw new Error('artifact filesystem inspected'); };
	const spies = [mock.method(fs, 'existsSync', denyFileAccess), mock.method(fs, 'readFileSync', denyFileAccess), mock.method(fs, 'writeFileSync', denyFileAccess), mock.method(fs, 'renameSync', denyFileAccess), mock.method(fs, 'mkdirSync', denyFileAccess)];
	syncBuiltinESMExports();
	try {
		await runWithConnectionExecution(execution, async () => {
			for (const kind of ['content', 'meta-only'] as const) for (const payload of [poison, revoked.proxy, { meta: {}, body: {} }]) {
				for (const prepare of [prepareArtifactWrite, writeArtifact]) {
					assert.throws(() => prepare(path, payload, kind, poison), error => connectionExecutionErrorCode(error) === 'unsupported-temporary');
				}
			}
		});
		assert.equal(payloadReads, 0); assert.equal(fileAccess, 0);
	} finally {
		for (const spy of spies) spy.mock.restore(); syncBuiltinESMExports();
		lifetime.abort(); lifetime.complete(); await lifetime.drained;
	}
	try {
		assert.equal(readFileSync(path, 'utf8'), before, 'temporary attempts left existing artifact untouched');
		assert.equal(writeArtifact(path, { ...saved, meta: { ...saved.meta, note: 'saved metadata' } }, 'meta-only'), 1);
		assert.equal(JSON.parse(readFileSync(path, 'utf8')).meta.note, 'saved metadata');
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
