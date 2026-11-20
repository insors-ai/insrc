/**
 * Story 64703b708590bd68/s1, task t1: the audit lists every registered RPC method and every step phase.
 * Run: npm test -- src/daemon/__tests__/repo-call-audit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { after } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const testHome = mkdtempSync(join(tmpdir(), 'insrc-call-inventory-'));
process.env['HOME'] = testHome;
after(() => rmSync(testHome, { recursive: true, force: true }));
const { registeredMethods, stepPhases } = await import('./helpers/call-inventory.js');
import { RPC_AUDIT, STEP_PHASE_AUDIT } from '../repo-call-audit.js';

test('repo-call-audit.test.ts: every method of the handler registry and every step phase has an audit entry marked modifying, read-only or daemon-store', async () => {
	assert.deepEqual(Object.keys(RPC_AUDIT).sort(), registeredMethods(), 'the audit lists exactly the registered RPC methods');
	assert.deepEqual(Object.keys(STEP_PHASE_AUDIT).sort(), await stepPhases(), 'the audit lists exactly the step phases');
	for (const [name, e] of [...Object.entries(RPC_AUDIT), ...Object.entries(STEP_PHASE_AUDIT)]) {
		assert.ok(['modifying', 'read-only', 'daemon-store'].includes(e.kind), `${name}: kind`);
		assert.ok(e.evidence.length > 20, `${name}: evidence`);
		if (e.kind === 'modifying') {
			assert.ok(typeof e.repoParam === 'string' && e.repoParam.length > 0, `${name}: a modifying entry names its repo param`);
			assert.ok(Array.isArray(e.pathParams), `${name}: a modifying entry names its path params`);
		} else {
			assert.equal(e.repoParam, undefined, `${name}: only a modifying entry has a repo param`);
		}
	}
	// the call that was misrouted on 2026-11-01 is a modifying entry with a path param
	assert.deepEqual(RPC_AUDIT['workflow.approve'], { ...RPC_AUDIT['workflow.approve']!, kind: 'modifying', repoParam: 'repo', pathParams: ['artifactPath'] });
});


test('audit coverage detects missing and stale registrations independently', () => {
 const registered = registeredMethods();
 const audited = Object.keys(RPC_AUDIT);
 const missing = registered.filter(name => !audited.filter(n => n !== 'repo.list').includes(name));
 assert.deepEqual(missing, ['repo.list']);
 assert.deepEqual([...audited, 'brand.newMethod'].filter(name => !registered.includes(name)), ['brand.newMethod']);
 assert.ok(registered.includes('daemon.update') && registered.includes('progress.subscribe'), 'spread unary and stream registrations are covered');
});
