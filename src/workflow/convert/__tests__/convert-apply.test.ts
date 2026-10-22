import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { History } from '../../artifact-core/history.js';
import type { Actor } from '../../artifact-core/types.js';
import { artifactJsonPath } from '../../storage.js';
import { readBinding } from '../../tracker/binding.js';
import { H, setKit, threeRows, taskId } from '../../tasks/__tests__/task-set-kit.js';
import { citations } from '../../tasks/__tests__/task-kit.js';
import { applyConversion, CONVERSION_RULES, PROGRESS_FILE } from '../apply.js';
import type { ApplyStep } from '../apply.js';
import { planConversion } from '../plan.js';
import { ConversionRefused } from '../types.js';
import type { ConversionDeps } from '../types.js';

const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
const AT = '2026-10-10T00:00:00.000Z';
const ref = (entityId: string) => ({ entityId, type: 'github:issue', relation: 'tracked-by' });

const STEPS: ApplyStep[] = ['rename', 'stamp', 'amendments', 'feedback', 'migrate', 'units', 'tasks', 'story-history'];

function legacyRepo(kit: ReturnType<typeof setKit>): { put(id: string, v: unknown): void; commit(): void; git(...a: string[]): string } {
	const repo = kit.k.repo;
	const git = (...a: string[]): string => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 'T');
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	return {
		put: (id, v) => writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify(v, null, 2) + '\n'),
		commit: () => { git('add', '-A'); git('commit', '-q', '-m', 'legacy'); },
		git,
	};
}

describe('convert-apply', () => {
	it('convert-apply.test.ts: apply converts every artifact in the stated order and refuses while the delivery reader reads legacy stamps', async () => {
		const kit = setKit();
		try {
			const r = legacyRepo(kit);
			const meta = (extra: Record<string, unknown>) => ({ epicHash: H, createdAt: AT, epicCreatedAt: AT, revision: 2, ...extra });
			r.put(`DEF-${H}`, { meta: meta({ workflow: 'define', approvedAt: AT, envelope: { description: '', references: [], binding: { reference: ref('o/r#1'), createdAtRevision: 1, posted: [] } } }), body: { stories: [{ id: 'S001', title: 'First' }] }, citations: [] });
			r.put(`LLD-${H}-S001`, { meta: meta({ workflow: 'design.story', storyId: 'S001', approvedAt: AT, envelope: { description: '', references: [], binding: { reference: ref('o/r#2'), createdAtRevision: 1, posted: [] } } }),
				body: { goal: 'g', feedback: [{ id: 'f1', author: 'Alice', timestamp: AT, comment: 'tighten', target: { file: 'x.md' } }] }, citations: [] });
			r.put(`PLAN-${H}-S001`, { meta: meta({ workflow: 'plan', storyId: 'S001', approvedAt: AT }), body: { tasks: threeRows() }, citations });
			r.put(`BUILD-${H}-S001`, { meta: meta({ workflow: 'build', storyId: 'S001' }), body: { tasks: [{ id: 't1', passed: true }, { id: 't2', passed: true }, { id: 't3', passed: false }] }, citations: [] });
			r.put(`AMD-${H}-1`, { id: `AMD-${H}-1`, epicHash: H, hldBaseRunId: 'wf-1', amendment: { type: 'sharedContract.fieldAdd', contractId: 'sc1', field: { name: 'x', type: 'string', optional: false, purpose: 'p' }, breaking: false },
				rationale: 'because', citations: [], proposedBy: { workflow: 'design.story', storyId: 'S001' }, proposedAt: AT, status: 'approved', approvedAt: AT, approvedBy: 'subho' });
			r.commit();

			const history = new History(kit.k.sidecar);
			const deps = { store: kit.k.store, history, taskSets: kit.sets, now: () => new Date('2026-10-22T00:00:00.000Z'), actor: MIGRATION } as unknown as ConversionDeps;
			const plan = await planConversion(kit.k.repo, { rules: CONVERSION_RULES });
			assert.deepEqual(plan.problems, []);

			// refused while the delivery reader reads the legacy stamps: nothing is written
			await assert.rejects(applyConversion(kit.k.repo, plan, deps, { deliveryReadsLifecycle: () => false }), (e: unknown) => e instanceof ConversionRefused && /legacy approval and review stamps/.test(e.message));
			assert.equal(r.git('status', '--porcelain').trim(), '', 'the refusal changed no file');
			assert.equal(existsSync(join(kit.k.repo, PROGRESS_FILE)), false);

			// refused when the tree changed since the preview
			writeFileSync(join(kit.k.repo, '.insrc/artifacts', `PLAN-${H}-S001.json`), readFileSync(join(kit.k.repo, '.insrc/artifacts', `PLAN-${H}-S001.json`), 'utf8').replace('"revision": 2', '"revision": 3'));
			await assert.rejects(applyConversion(kit.k.repo, plan, deps, { deliveryReadsLifecycle: () => true }), (e: unknown) => e instanceof ConversionRefused && /uncommitted|changed since/.test(e.message));
			r.git('checkout', '-q', '--', '.');

			// apply, with the steps in the stated order
			const seen: ApplyStep[] = [];
			const result = await applyConversion(kit.k.repo, plan, deps, { deliveryReadsLifecycle: () => true, seams: { afterStep: s => { seen.push(s); } } });
			assert.deepEqual(seen, STEPS);
			assert.equal(result.markerWritten, false, 'the marker is the sweep\'s');
			assert.deepEqual(result.written.map(c => c.rule).filter((x, i, a) => a.indexOf(x) === i), ['rename-id', 'convert-amendment', 'convert-feedback', 'migrate-head', 'create-epic', 'create-story', 'create-tasks', 'move-binding', 'move-story-history'].filter(x => result.written.some(c => c.rule === x)));

			// every artifact is converted: ids lower-case, lifecycle on each head, revision, status and approval kept
			assert.equal(existsSync(artifactJsonPath(kit.k.repo, `LLD-${H}-S001`)), false);
			for (const id of [`DEF-${H}`, `LLD-${H}-s1`, `PLAN-${H}-s1`, `BUILD-${H}-s1`, `AMD-${H}-1`]) {
				const head = await kit.k.store.read(id);
				assert.ok(head.lifecycle.revision.contentHash.length > 0, `${id} has a content hash`);
				assert.equal(head.lifecycle.status, id.startsWith('BUILD') ? 'draft' : 'approved', id);
			}
			assert.equal((await kit.k.store.read(`LLD-${H}-s1`)).lifecycle.revision.number, 2);
			const lld = JSON.parse(readFileSync(artifactJsonPath(kit.k.repo, `LLD-${H}-s1`), 'utf8')) as { body: Record<string, unknown> };
			assert.equal(lld.body['feedback'], undefined, 'body.feedback is stripped');
			assert.deepEqual((await history.feedback(`LLD-${H}-s1`)).map(f => f.id), ['f1']);

			// EPIC, STORY and Task heads exist with the bindings moved; the rounds are back-filled
			assert.equal(readBinding(kit.k.repo, `EPIC-${H}`)?.reference.entityId, 'o/r#1');
			assert.equal(readBinding(kit.k.repo, `STORY-${H}-s1`)?.reference.entityId, 'o/r#2');
			assert.equal(readBinding(kit.k.repo, `DEF-${H}`), undefined);
			assert.equal((await kit.k.store.read(`STORY-${H}-s1`)).parent?.entityId, `EPIC-${H}`);
			assert.deepEqual((await kit.k.store.childrenOf(`STORY-${H}-s1`)).filter(id => id.startsWith('TASK-')), [taskId(1), taskId(2), taskId(3)]);
			const rounds = async (n: number) => (await history.log(taskId(n))).filter(e => (e.outcome?.data as { kind?: string } | undefined)?.kind === 'build-round').length;
			assert.deepEqual([await rounds(1), await rounds(2), await rounds(3)], [1, 1, 0]);

			// a second apply from the converted tree changes no head
			const before = r.git('status', '--porcelain');
			const again = await applyConversion(kit.k.repo, await planConversion(kit.k.repo, { rules: CONVERSION_RULES, resume: true }), deps, { deliveryReadsLifecycle: () => true });
			assert.deepEqual(again.written, []);
			assert.equal(r.git('status', '--porcelain'), before);
		} finally { kit.done(); }
	});
});
