/** A repository in the legacy shape, committed, with the dependencies the conversion needs; for the tests that run the whole command. */

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { History } from '../../artifact-core/history.js';
import type { Actor } from '../../artifact-core/types.js';
import { citations } from '../../tasks/__tests__/task-kit.js';
import { H, setKit, threeRows } from '../../tasks/__tests__/task-set-kit.js';
import type { SetKit } from '../../tasks/__tests__/task-set-kit.js';
import type { ConversionDeps } from '../types.js';

export const MIGRATION: Actor = { id: 'insrc:migration', kind: 'system', properties: {} };
export const NOW = '2026-10-22T00:00:00.000Z';
const AT = '2026-10-10T00:00:00.000Z';
const REVIEWED = '2026-10-11T00:00:00.000Z';
const ref = (entityId: string) => ({ entityId, type: 'github:issue', relation: 'tracked-by' });
const review = (verdict: string) => ({ artifact: 'LLD', stage: 'design.story', verdict, findings: [{ claimId: 'q1', severity: 'MED', claim: 'c', evidence: 'e' }], counts: { high: 0, med: 1, low: 0 }, reviewedAt: REVIEWED, model: 'cli-claude:opus', reviewedBy: 'daemon' });

export interface LegacyRepo {
	readonly kit:  SetKit;
	readonly repo: string;
	readonly deps: ConversionDeps;
	git(...a: string[]): string;
	done(): void;
}

/** A Define with an uppercase-id Story that has an approved LLD (bound, with feedback and a review), PLAN and BUILD, a blocked LLD, a rejected one and a flat amendment. */
export function legacyRepo(): LegacyRepo {
	const kit = setKit();
	const repo = kit.k.repo;
	const git = (...a: string[]): string => execFileSync('git', ['-C', repo, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
	git('init', '-q', '-b', 'main'); git('config', 'user.email', 't@e.com'); git('config', 'user.name', 'T');
	mkdirSync(join(repo, '.insrc', 'artifacts'), { recursive: true });
	const put = (id: string, v: unknown): void => writeFileSync(join(repo, '.insrc', 'artifacts', `${id}.json`), JSON.stringify(v, null, 2) + '\n');
	const meta = (extra: Record<string, unknown>) => ({ epicHash: H, createdAt: AT, epicCreatedAt: AT, revision: 2, ...extra });
	put(`DEF-${H}`, { meta: meta({ workflow: 'define', approvedAt: AT, envelope: { description: '', references: [], binding: { reference: ref('o/r#1'), createdAtRevision: 1, posted: [] } } }),
		body: { stories: [{ id: 'S001', title: 'A' }, { id: 's2', title: 'B' }, { id: 's3', title: 'C' }] }, citations: [] });
	put(`LLD-${H}-S001`, { meta: meta({ workflow: 'design.story', storyId: 'S001', approvedAt: AT, review: review('pass'), envelope: { description: '', references: [], binding: { reference: ref('o/r#2'), createdAtRevision: 1, posted: [] } } }),
		body: { goal: 'g', feedback: [{ id: 'f1', author: 'Alice', timestamp: AT, comment: 'tighten', target: { file: 'x.md' } }] }, citations: [] });
	put(`PLAN-${H}-S001`, { meta: meta({ workflow: 'plan', storyId: 'S001', approvedAt: AT }), body: { tasks: threeRows() }, citations });
	put(`BUILD-${H}-S001`, { meta: meta({ workflow: 'build', storyId: 'S001' }), body: { tasks: [{ id: 't1', passed: true }, { id: 't2', passed: true }, { id: 't3', passed: false }] }, citations: [] });
	put(`LLD-${H}-s2`, { meta: meta({ workflow: 'design.story', storyId: 's2', review: review('block') }), body: { goal: 'g' }, citations: [] });
	put(`LLD-${H}-s3`, { meta: meta({ workflow: 'design.story', storyId: 's3', rejectedAt: AT }), body: { goal: 'g' }, citations: [] });
	put(`AMD-${H}-1`, { id: `AMD-${H}-1`, epicHash: H, hldBaseRunId: 'wf-1', amendment: { type: 'sharedContract.fieldAdd', contractId: 'sc1', field: { name: 'x', type: 'string', optional: false, purpose: 'p' }, breaking: false },
		rationale: 'because', citations: [], proposedBy: { workflow: 'design.story', storyId: 'S001' }, proposedAt: AT, status: 'approved', approvedAt: AT, approvedBy: 'subho' });
	git('add', '-A'); git('commit', '-q', '-m', 'legacy');
	const deps = { store: kit.k.store, history: new History(kit.k.sidecar), taskSets: kit.sets, now: () => new Date(NOW), actor: MIGRATION } as unknown as ConversionDeps;
	return { kit, repo, deps, git, done: () => kit.done() };
}
