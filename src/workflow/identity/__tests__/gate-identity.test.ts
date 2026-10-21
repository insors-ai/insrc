import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { _setGateDepsForTests, teamGate } from '../../team/gate.js';
import type { GateOutcome, GuardedAction } from '../../team/gate.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { PolicyReader, TeamPolicy } from '../../team/types.js';
import { IdentityService } from '../identity-service.js';

afterEach(() => _setGateDepsForTests());

const UNIT: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1' };
const policy: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: ['root'] } as unknown as TeamPolicy });

/** A tracker where `me` is signed in and `holder` holds the stage. */
function inject(me: string, holder: string): void {
	const port = {
		kind: 'github', capabilities: new Set(['claim']),
		whoAmI: (): PortResult<string> => ({ ok: true, value: me }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: holder }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: [holder] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({ readPolicy: policy, loadTracker: () => ({ ok: true, value: port }), resolveIssue: () => 'acme/demo#7', now: () => '2026-10-21T00:00:00.000Z' });
}

const ACTIONS: GuardedAction[] = ['author', 'build', 'approve-local', 'revise', 'release'];
const decide = (me: string, holder: string): GateOutcome[] => { inject(me, holder); return ACTIONS.map(a => teamGate('/repo', UNIT, a)); };

test("the team gate decides on the tracker's whoAmI only: declaring the claimant's login as an alias of another person does not change the gate's outcome, and nothing under src/workflow/team imports the identity module", async () => {
	const home = mkdtempSync(join(tmpdir(), 'gate-identity-'));
	const savedHome = process.env['HOME'];
	process.env['HOME'] = home;
	try {
		// before any declaration: alice is signed in, bob holds the stage (she is refused); alice holds it (she is allowed)
		const refusedBefore = decide('alice', 'bob');
		const allowedBefore = decide('alice', 'alice');
		assert.ok(refusedBefore.some(o => o.kind !== 'allowed'), 'the claimant is refused on bob\'s stage');
		assert.ok(allowedBefore.some(o => o.kind === 'allowed'), 'the holder is allowed');

		// declare alice's login as an alias of bob, through the service's default file in the user's home
		const declared = await new IdentityService().declare({ primary: 'github:bob', aliases: ['github:alice'] });
		assert.deepEqual(declared, { primary: 'github:bob', aliases: ['github:alice'] });
		assert.ok(existsSync(join(home, '.insrc', 'identity.json')), 'the declaration is in the file the service uses');

		// and the other way round: bob declares himself an alias of alice
		for (const decl of [{ primary: 'github:bob', aliases: ['github:alice'] }, { primary: 'github:alice', aliases: ['github:bob'] }]) {
			await new IdentityService().declare(decl);
			assert.deepEqual(decide('alice', 'bob'), refusedBefore, `refused as before with ${JSON.stringify(decl)}`);
			assert.deepEqual(decide('alice', 'alice'), allowedBefore, `allowed as before with ${JSON.stringify(decl)}`);
		}
	} finally {
		if (savedHome === undefined) delete process.env['HOME']; else process.env['HOME'] = savedHome;
		rmSync(home, { recursive: true, force: true });
	}

	// nothing under src/workflow/team imports the identity module or reads the identity file
	const teamDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'team');
	const sources: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); }
			else if (/\.tsx?$/.test(name)) sources.push(p);
		}
	};
	walk(teamDir);
	assert.ok(sources.length > 5, 'the team folder was found');
	for (const file of sources) {
		const text = readFileSync(file, 'utf8');
		assert.doesNotMatch(text, /identity-service|workflow\/identity|from '\.\.\/identity\/|identity\.json|IdentityService/, file);
	}
});
