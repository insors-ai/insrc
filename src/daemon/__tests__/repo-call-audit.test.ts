/**
 * Story 64703b708590bd68/s1, task t1: the audit lists every registered RPC method and every step phase.
 * Run: npx tsx --test-force-exit src/daemon/__tests__/repo-call-audit.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { RPC_AUDIT, STEP_PHASE_AUDIT } from '../repo-call-audit.js';

const DAEMON = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The RPC method names the handler registry declares, read from its source (a quoted dotted key at the start of an entry). */
function registeredMethods(): string[] {
	const text = readFileSync(join(DAEMON, 'handler-runtime.ts'), 'utf8');
	return [...new Set([...text.matchAll(/^\s*'([a-zA-Z]+(?:\.[a-zA-Z]+)+)':\s*(?:async|\()/gm)].map(m => m[1]!))].sort();
}

/** The step phases, from the phase files of each step folder (a file name with a hyphen becomes the phase name with an underscore). */
function stepPhases(): string[] {
	const out: string[] = [];
	const steps = join(DAEMON, 'steps');
	for (const step of readdirSync(steps, { withFileTypes: true })) {
		const dir = join(steps, step.name, 'phases');
		if (!step.isDirectory() || !existsSync(dir)) continue;
		for (const f of readdirSync(dir)) if (f.endsWith('.ts')) out.push(`${step.name}.${f.slice(0, -3).replace(/-/g, '_')}`);
	}
	return out.sort();
}

test('repo-call-audit.test.ts: every method of the handler registry and every step phase has an audit entry marked modifying, read-only or daemon-store', () => {
	assert.deepEqual(Object.keys(RPC_AUDIT).sort(), registeredMethods(), 'the audit lists exactly the registered RPC methods');
	assert.deepEqual(Object.keys(STEP_PHASE_AUDIT).sort(), stepPhases().filter(p => !p.startsWith('review-step.') && !p.startsWith('code-review-step.')), 'the audit lists exactly the step phases');
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
