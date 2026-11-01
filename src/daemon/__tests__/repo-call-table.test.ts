/**
 * Story 64703b708590bd68/s1, task t2: the table of file-modifying calls is the audit, and nothing registered is outside both lists.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/repo-call-table.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RPC_AUDIT, STEP_PHASE_AUDIT } from '../repo-call-audit.js';
import { FILE_MODIFYING_METHODS } from '../repo-call-gate.js';

const DAEMON = join(dirname(fileURLToPath(import.meta.url)), '..');

const registeredMethods = (): string[] =>
	[...new Set([...readFileSync(join(DAEMON, 'handler-runtime.ts'), 'utf8').matchAll(/^\s*'([a-zA-Z]+(?:\.[a-zA-Z]+)+)':\s*(?:async|\()/gm)].map(m => m[1]!))].sort();

function stepPhases(): string[] {
	const out: string[] = [];
	const steps = join(DAEMON, 'steps');
	for (const step of readdirSync(steps, { withFileTypes: true })) {
		const dir = join(steps, step.name, 'phases');
		if (!step.isDirectory() || !existsSync(dir)) continue;
		for (const f of readdirSync(dir)) if (f.endsWith('.ts')) out.push(`${step.name}.${f.slice(0, -3).replace(/-/g, '_')}`);
	}
	return out;
}

/** The reviewed list of calls that do not modify files in a user repository: every audit entry that is not `modifying`. */
const REVIEWED_NOT_MODIFYING = new Set(Object.entries({ ...RPC_AUDIT, ...STEP_PHASE_AUDIT }).filter(([, e]) => e.kind !== 'modifying').map(([n]) => n));

/** The classification the registry-versus-table check applies to a set of names. */
export function unclassified(names: readonly string[], table: Readonly<Record<string, unknown>>, notModifying: ReadonlySet<string>): string[] {
	return names.filter(n => !Object.prototype.hasOwnProperty.call(table, n) && !notModifying.has(n));
}

test('repo-call-table.test.ts: every registered RPC method and step phase is a table row or on the reviewed read-only list, and every row names a registered method', () => {
	const methods = registeredMethods();
	const phases = stepPhases();
	assert.deepEqual(unclassified([...methods, ...phases], FILE_MODIFYING_METHODS, REVIEWED_NOT_MODIFYING), [], 'a registered method is in neither the table nor the reviewed list');
	// every row names a registered RPC method or a step phase
	const known = new Set([...methods, ...phases]);
	for (const row of Object.keys(FILE_MODIFYING_METHODS)) assert.ok(known.has(row), `${row} is a table row but is not registered`);
	// no name is in both lists
	for (const row of Object.keys(FILE_MODIFYING_METHODS)) assert.ok(!REVIEWED_NOT_MODIFYING.has(row), `${row} is in both lists`);
	// the check fails for a method that is in neither list
	assert.deepEqual(unclassified(['brand.newMethod'], FILE_MODIFYING_METHODS, REVIEWED_NOT_MODIFYING), ['brand.newMethod']);
	// the table has the call that was misrouted on 2026-11-01
	assert.deepEqual(FILE_MODIFYING_METHODS['workflow.approve'], { repoParam: 'repo', pathParams: ['artifactPath'] });
});
