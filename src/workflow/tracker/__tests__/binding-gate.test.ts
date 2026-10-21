import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';

import { _setGateDepsForTests, teamContext } from '../../team/gate.js';
import type { PolicyReader, TeamPolicy } from '../../team/types.js';
import { lldArtifactId } from '../../storage.js';
import { bindArtifact } from '../binding.js';
import type { PortResult, TrackerPort } from '../port.js';
import { HASH, seed, story } from './unit-issue-kit.js';

afterEach(() => _setGateDepsForTests());

const policy: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: ['root'] } as unknown as TeamPolicy });

test("the team gate resolves a bound unit's issue synchronously from the binding with no tracker call", () => {
	const fx = seed();
	try {
		assert.ok(bindArtifact(fx.repo, lldArtifactId(HASH, 's1'), 'acme/demo#12').ok);
		const calls: string[] = [];
		const port = new Proxy({ kind: 'github', capabilities: new Set(['claim']), whoAmI: (): PortResult<string> => { calls.push('whoAmI'); return { ok: true, value: 'alice' }; } }, {
			get: (target, key: string) => (key in target ? (target as Record<string, unknown>)[key] : (): never => { calls.push(String(key)); throw new Error(`unexpected tracker call: ${String(key)}`); }),
		}) as unknown as TrackerPort;
		_setGateDepsForTests({ readPolicy: policy, loadTracker: () => ({ ok: true, value: port }) });

		// the real resolveUnitIssueLocal runs (no resolveIssue seam): the answer is the binding's, returned at once
		const ctx = teamContext(fx.repo, story(fx.repo));
		assert.equal(typeof (ctx as unknown as { then?: unknown }).then, 'undefined', 'a plain value, not a promise');
		assert.ok(ctx.ok && ctx.team);
		assert.equal(ctx.ok && ctx.team ? ctx.issue : null, 'acme/demo#12');
		assert.deepEqual(calls, ['whoAmI'], 'only the live identity was asked of the tracker: no lookup, no create');
	} finally { fx.cleanup(); }
});
