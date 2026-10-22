import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { History } from '../../artifact-core/history.js';
import type { Actor } from '../../artifact-core/types.js';
import { artifactJsonPath } from '../../storage.js';
import { H, setKit } from '../../tasks/__tests__/task-set-kit.js';
import { applyConversion, CONVERSION_RULES } from '../apply.js';
import { planConversion } from '../plan.js';
import type { ConversionDeps, UnitView } from '../types.js';
import { verifyConversion } from '../verify.js';

const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
const AT = '2026-10-10T00:00:00.000Z';
const REVIEWED = '2026-10-11T00:00:00.000Z';
const review = (verdict: string) => ({ artifact: 'LLD', stage: 'design.story', verdict, findings: [{ claimId: 'q1', severity: 'MED', claim: 'c', evidence: 'e' }], counts: { high: 0, med: 1, low: 0 }, reviewedAt: REVIEWED, model: 'cli-claude:opus', reviewedBy: 'daemon' });

const treeOf = (repo: string): Record<string, string> => {
	const out: Record<string, string> = {};
	const walk = (dir: string): void => {
		for (const n of readdirSync(dir, { withFileTypes: true })) {
			if (n.name === '.git') continue;
			const p = join(dir, n.name);
			if (n.isDirectory()) walk(p); else out[p] = readFileSync(p, 'utf8');
		}
	};
	walk(repo);
	return out;
};

describe('convert-verify', () => {
	it('convert-verify.test.ts: an approved legacy head verifies with no difference and a planted difference is reported', async () => {
		const kit = setKit();
		try {
			const repo = kit.k.repo;
			const git = (...a: string[]): void => { execFileSync('git', ['-C', repo, ...a], { stdio: 'ignore' }); };
			git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 'T');
			mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
			const put = (id: string, v: unknown): void => writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify(v, null, 2) + '\n');
			const meta = (extra: Record<string, unknown>) => ({ epicHash: H, createdAt: AT, epicCreatedAt: AT, revision: 2, ...extra });
			put(`DEF-${H}`, { meta: meta({ workflow: 'define', approvedAt: AT }), body: { stories: [{ id: 's1', title: 'A' }, { id: 's2', title: 'B' }, { id: 's3', title: 'C' }] }, citations: [] });
			put(`LLD-${H}-s1`, { meta: meta({ workflow: 'design.story', storyId: 's1', approvedAt: AT, review: review('pass') }), body: { goal: 'g', feedback: [{ id: 'f1', author: 'Alice', timestamp: AT, comment: 'tighten', target: { file: 'x.md' } }] }, citations: [] });
			put(`LLD-${H}-s2`, { meta: meta({ workflow: 'design.story', storyId: 's2', review: review('block') }), body: { goal: 'g' }, citations: [] });
			put(`LLD-${H}-s3`, { meta: meta({ workflow: 'design.story', storyId: 's3', rejectedAt: AT }), body: { goal: 'g' }, citations: [] });
			git('add', '-A'); git('commit', '-q', '-m', 'legacy');

			const deps = { store: kit.k.store, history: new History(kit.k.sidecar), taskSets: kit.sets, now: () => new Date('2026-10-22T00:00:00.000Z'), actor: MIGRATION } as unknown as ConversionDeps;
			const plan = await planConversion(repo, { rules: CONVERSION_RULES });
			const before = plan.snapshot;
			assert.ok(before.some(u => u.artifactId === `LLD-${H}-s1` && u.approval === 'approved' && u.openFeedback === 1 && u.review?.blocking === false));
			assert.ok(before.some(u => u.artifactId === `LLD-${H}-s2` && u.review?.blocking === true), 'the unapproved block blocks');

			// the apply verifies: an approved head, a blocked one, a rejected one and a head with feedback read as they did
			const result = await applyConversion(repo, plan, deps, { deliveryReadsLifecycle: () => true });
			assert.equal(result.markerWritten, true);
			assert.deepEqual(result.verification?.differences, []);
			assert.deepEqual(verifyConversion(repo, before).differences, []);

			// verification writes nothing
			const tree = treeOf(repo);
			verifyConversion(repo, before);
			assert.deepEqual(treeOf(repo), tree);

			// a planted difference is reported with the unit and the reason, and nothing is corrected
			const planted: UnitView[] = before.map(u => u.artifactId === `LLD-${H}-s1` ? { ...u, approval: 'pending', openFeedback: 3 } : u.artifactId === `LLD-${H}-s2` ? { ...u, revision: 9 } : u);
			planted.push({ artifactId: `LLD-${H}-s9`, kind: 'LLD', approval: 'approved', revision: 1, review: null, openFeedback: 0 });
			const report = verifyConversion(repo, planted);
			assert.deepEqual(report.differences.map(d => [d.artifactId, d.field]).sort(), [
				[`LLD-${H}-s1`, 'approval'], [`LLD-${H}-s1`, 'openFeedback'], [`LLD-${H}-s2`, 'revision'], [`LLD-${H}-s9`, 'missing'],
			]);
			const approval = report.differences.find(d => d.field === 'approval');
			assert.deepEqual([approval?.before, approval?.after], ['pending', 'approved']);
			assert.match(approval?.reason ?? '', /legacy stamps.*lifecycle/);
			assert.deepEqual(treeOf(repo), tree, 'a difference is reported and nothing is written');

			// a head the conversion left in another state is found by the real reader
			const path = artifactJsonPath(repo, `LLD-${H}-s1`);
			const head = JSON.parse(readFileSync(path, 'utf8')) as { meta: { lifecycle: { status: string } } };
			head.meta.lifecycle.status = 'draft';
			writeFileSync(path, JSON.stringify(head, null, 2) + '\n');
			// and what follows from it: the same review now blocks, because the head is no longer approved
			assert.deepEqual(verifyConversion(repo, before).differences.map(d => [d.artifactId, d.field]), [[`LLD-${H}-s1`, 'approval'], [`LLD-${H}-s1`, 'review']]);
		} finally { kit.done(); }
	});
});
