/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The park offer (sc4 amendment AMD-315d510cb28100e2-13): a refusal for a stage someone else holds carries
 * offerPark when the registered provider says the actor has unparked work, and says so in its text.
 *
 * Run: npx tsx --test src/workflow/team/__tests__/park-offer.test.ts
 */

import { afterEach, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
import assert from 'node:assert/strict';

import { _setGateDepsForTests, claim, describeOutcome, registerParkOfferProvider, teamGate, type GateOutcome } from '../gate.js';
import { handleWorkflowStep } from '../../../daemon/steps/workflow-step/handler.js';
import { stepToolTable } from '../../../daemon/steps/host.js';
import { runCommand, type CommandCtx } from '../../../cli/command.js';
import { makeServices } from '../../../cli/services/index.js';
import { _clearWorkflowStateStoreForTests, saveState } from '../../../daemon/steps/workflow-step/state-store.js';
import { STATE_VERSION, type WorkflowStepStatePayload } from '../../../daemon/steps/workflow-step/state.js';
import { artifactJsonPath, lldArtifactId } from '../../storage.js';
import type { PortResult, TrackerPort } from '../../tracker/port.js';
import type { UnitRef } from '../../tracker/refs.js';
import type { PolicyReader, TeamPolicy } from '../types.js';
import '../../__tests__/helpers/converted-repos.js';

const UNIT: UnitRef = { unit: 'story', repoPath: '/repo', epicHash: 'a3f4b8c9d1e2f3a4', storyId: 's1' };
const team: PolicyReader = () => ({ ok: true, value: { teamMode: true, claimsEnforced: true, administrators: [] } as unknown as TeamPolicy });
const none: PolicyReader = () => ({ ok: true, value: 'none' });

interface Seen { loads: number }

function inject(holder: string | null, readPolicy: PolicyReader = team): Seen {
	const seen: Seen = { loads: 0 };
	const port = {
		whoAmI: (): PortResult<string> => ({ ok: true, value: 'alice' }),
		readAssignee: (): PortResult<string | null> => ({ ok: true, value: holder }),
		addAssignee: (): PortResult<string[]> => ({ ok: true, value: ['alice'] }),
	} as unknown as TrackerPort;
	_setGateDepsForTests({
		readPolicy,
		loadTracker: () => { seen.loads += 1; return { ok: true, value: port }; },
		resolveIssue: () => 'acme/demo#7',
		ensureIssue: () => ({ ok: false, kind: 'unreachable', reason: 'gh timed out' }),
		artifactExists: () => true,
	});
	return seen;
}

afterEach(() => { _setGateDepsForTests(); registerParkOfferProvider(undefined); _clearWorkflowStateStoreForTests(); });

const offer = (o: GateOutcome): boolean | undefined => (o.kind === 'held-by-other' ? o.offerPark : undefined);

test('teamGate sets offerPark only on held-by-other and only through a registered provider, a throwing provider counts as false, a repo with no policy makes no provider call, and describeOutcome appends the park command only then', async () => {
	// no provider registered: never an offer
	inject('bob');
	assert.equal(offer(await teamGate('/repo', UNIT, 'author')), false);

	// the provider is asked with (repo, unit, actor) and its answer decides
	const asked: Array<[string, string | undefined, string]> = [];
	registerParkOfferProvider((repo, unit, actor) => { asked.push([repo, unit.storyId, actor]); return true; });
	const held = await teamGate('/repo', UNIT, 'author');
	assert.equal(offer(held), true);
	assert.deepEqual(asked, [['/repo', 's1', 'alice']]);
	// the explicit claim path offers too
	assert.equal(offer(await claim('/repo', UNIT)), true);
	registerParkOfferProvider(() => false);
	assert.equal(offer(await teamGate('/repo', UNIT, 'build')), false);

	// a throwing provider counts as false
	registerParkOfferProvider(() => { throw new Error('boom'); });
	assert.equal(offer(await teamGate('/repo', UNIT, 'author')), false);

	// outcomes other than held-by-other never carry an offer and never ask the provider
	let calls = 0;
	registerParkOfferProvider(() => { calls += 1; return true; });
	inject('alice');
	assert.equal((await teamGate('/repo', UNIT, 'author')).kind, 'allowed');
	inject(null);
	assert.equal((await teamGate('/repo', UNIT, 'author')).kind, 'allowed');
	assert.equal(calls, 0, 'the provider is only asked for a held-by-other outcome');

	// no policy: no tracker call and no provider call
	const free = inject('bob', none);
	assert.equal((await teamGate('/repo', UNIT, 'author')).kind, 'allowed');
	assert.equal(free.loads, 0);
	assert.equal(calls, 0);

	// the text: the park command only when an offer exists
	assert.match(describeOutcome({ kind: 'held-by-other', holder: 'bob', offerPark: true }), /^held by bob; .*team park <epicHash> \[storyId\]/);
	assert.equal(describeOutcome({ kind: 'held-by-other', holder: 'bob', offerPark: false }), 'held by bob');
	assert.doesNotMatch(describeOutcome({ kind: 'refused', reason: 'nope' }), /park/);
});

const HASH = UNIT.epicHash;

function runPayload(repo: string, stage: WorkflowStepStatePayload['stage'], over: { workflow?: string; storyId?: string } = {}): WorkflowStepStatePayload {
	return {
		version: STATE_VERSION, runId: `wf-${stage}`, epicKey: HASH, startedAtMs: Date.now(), stage,
		intent: { workflow: over.workflow ?? 'plan', focus: 'f', repoPath: repo, repoIndexedAt: null, params: { epicHash: HASH, storyId: over.storyId ?? 's1' } },
	};
}

test('a held-by-other refusal carries offerPark when the actor owns a live run in any stage or has an uncommitted draft for the unit, never for an unowned run, and the workflow-step refusal text names the park command', async () => {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-park-offer-'));
	try {
		const git = (...a: string[]): void => { execFileSync('git', a, { cwd: repo, stdio: 'ignore' }); };
		git('init', '-q'); git('config', 'user.email', 't@t'); git('config', 'user.name', 't'); git('config', 'commit.gpgsign', 'false');
		writeFileSync(join(repo, 'README.md'), 'x'); git('add', '-A'); git('commit', '-qm', 'init');
		inject('bob');
		stepToolTable();   // the daemon builds its step tools at startup, and that registers the park-offer provider with the gate
		const unit: UnitRef = { ...UNIT, repoPath: repo };
		const offered = async (): Promise<boolean | undefined> => offer(await teamGate(repo, unit, 'author'));

		// nothing yet: held by bob, no work of ours to park
		assert.equal(await offered(), false);

		// a run the actor owns, in each stage a refused run can be in
		for (const stage of ['awaiting_plan', 'awaiting_llm_step', 'awaiting_synthesize'] as const) {
			_clearWorkflowStateStoreForTests();
			saveState(runPayload(repo, stage), { owner: 'alice' });
			assert.equal(await offered(), true, stage);
		}
		// the login compares case-insensitively
		_clearWorkflowStateStoreForTests();
		saveState(runPayload(repo, 'awaiting_plan'), { owner: 'ALICE' });
		assert.equal(await offered(), true);

		// never for a run with no owner, another owner's run, a run for another unit, or a run in another repo
		for (const [label, meta, payload] of [
			['no meta', undefined, runPayload(repo, 'awaiting_plan')],
			['meta without owner', {}, runPayload(repo, 'awaiting_plan')],
			['another owner', { owner: 'carol' }, runPayload(repo, 'awaiting_plan')],
			['another story', { owner: 'alice' }, runPayload(repo, 'awaiting_plan', { storyId: 's2' })],
			['another repo', { owner: 'alice' }, runPayload('/somewhere/else', 'awaiting_plan')],
			['a workflow that is not a claim unit', { owner: 'alice' }, runPayload(repo, 'awaiting_plan', { workflow: 'stub' })],
		] as const) {
			_clearWorkflowStateStoreForTests();
			saveState(payload, meta);
			assert.equal(await offered(), false, label);
		}
		_clearWorkflowStateStoreForTests();

		// an uncommitted draft of the unit: untracked, then committed (no offer), then modified (offer), a Story folder markdown too
		const json = artifactJsonPath(repo, lldArtifactId(HASH, 's1'));
		mkdirSync(dirname(json), { recursive: true });
		writeFileSync(json, '{"a":1}');
		assert.equal(await offered(), true, 'an untracked draft');
		git('add', '-A'); git('commit', '-qm', 'lld');
		assert.equal(await offered(), false, 'a committed artifact is not unparked work');
		writeFileSync(json, '{"a":2}');
		assert.equal(await offered(), true, 'a modified draft');
		git('checkout', '--', '.');
		const md = join(repo, `docs/epics/tag-filtering-E20260718${HASH.slice(0, 8)}/S001/PLAN.md`);
		mkdirSync(dirname(md), { recursive: true });
		writeFileSync(md, '# plan');
		assert.equal(await offered(), true, 'an untracked markdown draft in the Story folder');
		git('add', '-A'); git('commit', '-qm', 'plan md');
		assert.equal(await offered(), false);
		// a changed file that is not the unit's own is not its draft
		writeFileSync(join(repo, 'docs', 'notes.md'), 'n');
		assert.equal(await offered(), false);

		// the terminal runs the gate in its own process (no run store): its refusals offer to park an uncommitted draft
		registerParkOfferProvider(undefined);
		// the claim runs at the daemon: its handler stands in for it here, with the provider this process registers
		const base = makeServices();   // registers a provider for this process
		const { handleTeamClaim } = await import('../../../daemon/team-review-handlers.js');
		const services = { ...base, team: { ...base.team, teamClaim: (repoPath: string, unit: never) => handleTeamClaim({ repoPath, unit }) } };
		const term = { repoPath: repo, onLog: () => undefined, services } as unknown as CommandCtx;
		const draft = join(repo, `docs/epics/tag-filtering-E20260718${HASH.slice(0, 8)}/S001/LLD.md`);
		assert.deepEqual(await runCommand(`team claim ${HASH} s1`, term), ['✗ not claimed — held by bob'], 'no draft: no offer');
		writeFileSync(draft, '# lld');
		const claimed = await runCommand(`team claim ${HASH} s1`, term);
		assert.match(claimed[0] ?? '', /^✗ not claimed — held by bob; .*team park <epicHash> \[storyId\]/, 'an uncommitted draft: the terminal names the park command');
		rmSync(draft);
		stepToolTable();   // back to the daemon's provider for the rest

		// the workflow-step refusal text names the park command when an offer exists, and not otherwise
		saveState(runPayload(repo, 'awaiting_plan'), { owner: 'alice' });
		const refused = JSON.parse((await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'f', repo, params: { epicHash: HASH, storyId: 's1' } })).content[0]!.text) as { error?: { code: string; message: string } };
		assert.equal(refused.error?.code, 'team-gate-refused');
		assert.match(refused.error?.message ?? '', /held by bob; .*team park <epicHash> \[storyId\]/);
		_clearWorkflowStateStoreForTests();
		const plain = JSON.parse((await handleWorkflowStep({ phase: 'start', workflow: 'plan', focus: 'f', repo, params: { epicHash: HASH, storyId: 's1' } })).content[0]!.text) as { error?: { message: string } };
		assert.equal(plain.error?.message, 'held by bob');
	} finally { rmSync(repo, { recursive: true, force: true }); }
});

test('the daemon registers the park-offer provider at startup, not only when its step tools are first used', async () => {
	const main = readFileSync(join(__dirname, '..', '..', '..', 'daemon', 'index.ts'), 'utf8');
	assert.match(main, /installStepDaemonClient\(createInDaemonClient\([\s\S]*?\)\);\s*\n\s*\/\/[^\n]*\n\s*registerParkOffer\(\);/, 'main() calls registerParkOffer() when the daemon starts');
	assert.match(main, /import \{ registerParkOffer \} from '\.\/steps\/workflow-step\/park-offer\.js'/);
});
