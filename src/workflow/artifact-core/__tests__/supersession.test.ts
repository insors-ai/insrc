import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { LifecycleService } from '../lifecycle-service.js';
import { reconcileArtifactSupersessions } from '../supersession.js';
import { IllegalTransitionError } from '../types.js';
import type { Reference } from '../types.js';
import type { IssueArtifact } from '../../artifacts/issue.js';
import { admitBugfixAdvance } from '../../bugfix/admit.js';
import { alice, artifact, clock, kit } from './store-kit.js';
import type { Kit } from './store-kit.js';
import { stubEvidence } from './lifecycle-kit.js';

const SOURCE_ISSUE = 'ISSUE-0123456789abcdef';
const TARGET_ISSUE = 'ISSUE-fedcba9876543210';
const SOURCE_LLD = 'LLD-0123456789abcdef-s1';
const TARGET_LLD = 'LLD-fedcba9876543210-s1';
const PRIMARY_EVIDENCE = ['PLAN-fedcba9876543210-s1', 'BUILD-fedcba9876543210-s1', 'TESTS-fedcba9876543210-s1'] as const;
const ref = (entityId: string, type: 'ISSUE' | 'LLD'): Reference => ({ entityId, type, relation: 'supersedes' });

describe('artifact supersession reconciliation', () => {
	const kits: Kit[] = [];
	afterEach(() => { while (kits.length > 0) kits.pop()?.done(); });

	async function fixture(): Promise<{ k: Kit; service: LifecycleService; items: readonly [{ artifactId: string; supersededBy: Reference }, { artifactId: string; supersededBy: Reference }] }> {
		const k = kit(); kits.push(k);
		for (const id of [SOURCE_ISSUE, TARGET_ISSUE, SOURCE_LLD, TARGET_LLD, ...PRIMARY_EVIDENCE]) await k.store.write(artifact(id), alice);
		const service = new LifecycleService({ store: k.store, evidence: stubEvidence([]), now: clock() });
		return { k, service, items: [
			{ artifactId: SOURCE_ISSUE, supersededBy: ref(TARGET_ISSUE, 'ISSUE') },
			{ artifactId: SOURCE_LLD, supersededBy: ref(TARGET_LLD, 'LLD') },
		] };
	}

	it('records replacement provenance, excludes terminal artifacts, and retries a partial batch without rewriting standing history', async () => {
		const { k, service, items } = await fixture();
		const primaryBefore = await Promise.all(PRIMARY_EVIDENCE.map(id => k.store.readWithHistory(id)));
		k.faults.replace = true;
		await assert.rejects(() => reconcileArtifactSupersessions(service, items, alice), /injected replace failure/);

		const retry = await reconcileArtifactSupersessions(service, items, alice);
		assert.deepEqual(retry, { changed: [SOURCE_LLD], standing: [SOURCE_ISSUE] });
		for (const item of items) {
			const stored = await k.store.readWithHistory(item.artifactId);
			assert.equal(stored.lifecycle.status, 'superseded');
			assert.ok(stored.references.some(r => r.entityId === item.supersededBy.entityId && r.relation === 'supersedes'));
			assert.equal(stored.changeLog.filter(e => e.operation === 'supersede').length, 1);
			assert.deepEqual(stored.changeLog.find(e => e.operation === 'supersede')?.references, [item.supersededBy]);
		}
		const issue = await k.store.read(SOURCE_ISSUE);
		assert.equal(admitBugfixAdvance({ meta: { lifecycle: issue.lifecycle, parentRef: null } } as IssueArtifact).admitted, false);
		assert.deepEqual(await Promise.all(PRIMARY_EVIDENCE.map(id => k.store.readWithHistory(id))), primaryBefore);
	});

	it('preflights the whole batch and rejects missing replacements or conflicting provenance before another artifact changes', async () => {
		const { k, service, items } = await fixture();
		const missing = { ...items[1], supersededBy: ref('LLD-aaaaaaaaaaaaaaaa-s1', 'LLD') };
		await assert.rejects(() => reconcileArtifactSupersessions(service, [items[0], missing], alice));
		assert.equal((await k.store.read(SOURCE_ISSUE)).lifecycle.status, 'draft');

		await reconcileArtifactSupersessions(service, [items[0]], alice);
		await k.store.write(artifact('ISSUE-bbbbbbbbbbbbbbbb'), alice);
		await assert.rejects(
			() => reconcileArtifactSupersessions(service, [{ ...items[0], supersededBy: ref('ISSUE-bbbbbbbbbbbbbbbb', 'ISSUE') }], alice),
			(err: unknown) => err instanceof IllegalTransitionError && /requested replacement provenance/.test(err.message),
		);
	});
});
