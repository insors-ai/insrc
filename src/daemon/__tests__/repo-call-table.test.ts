/**
 * Story 64703b708590bd68/s1, task t2: the table of file-modifying calls is the audit, and nothing registered is outside both lists.
 * Run: npm test -- src/daemon/__tests__/repo-call-table.test.ts
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
import { FILE_MODIFYING_METHODS } from '../repo-call-gate.js';

/** The reviewed list of calls that do not modify files in a user repository: every audit entry that is not `modifying`. */
const REVIEWED_NOT_MODIFYING = new Set(Object.entries({ ...RPC_AUDIT, ...STEP_PHASE_AUDIT }).filter(([, e]) => e.kind !== 'modifying').map(([n]) => n));

/** The classification the registry-versus-table check applies to a set of names. */
export function unclassified(names: readonly string[], table: Readonly<Record<string, unknown>>, notModifying: ReadonlySet<string>): string[] {
	return names.filter(n => !Object.prototype.hasOwnProperty.call(table, n) && !notModifying.has(n));
}

test('repo-call-table.test.ts: every registered RPC method and step phase is a table row or on the reviewed read-only list, and every row names a registered method', async () => {
	const methods = registeredMethods();
	const phases = await stepPhases();
	assert.deepEqual(unclassified([...methods, ...phases], FILE_MODIFYING_METHODS, REVIEWED_NOT_MODIFYING), [], 'a registered method is in neither the table nor the reviewed list');
	// every row names a registered RPC method or a step phase
	const known = new Set([...methods, ...phases]);
	for (const row of Object.keys(FILE_MODIFYING_METHODS)) assert.ok(known.has(row), `${row} is a table row but is not registered`);
	// Nonmodifying rows must also name real callable entries.
	for (const row of REVIEWED_NOT_MODIFYING) assert.ok(known.has(row), `${row} is a stale nonmodifying row`);
	assert.deepEqual([...new Set([...Object.keys(FILE_MODIFYING_METHODS), ...REVIEWED_NOT_MODIFYING])].sort(), [...known].sort());
	// no name is in both lists
	for (const row of Object.keys(FILE_MODIFYING_METHODS)) assert.ok(!REVIEWED_NOT_MODIFYING.has(row), `${row} is in both lists`);
	// the check fails for a method that is in neither list
	assert.deepEqual(unclassified(['brand.newMethod'], FILE_MODIFYING_METHODS, REVIEWED_NOT_MODIFYING), ['brand.newMethod']);
	// the table has the call that was misrouted on 2026-11-01
	assert.deepEqual(FILE_MODIFYING_METHODS['workflow.approve'], { repoParam: 'repo', pathParams: ['artifactPath'] });
});
