/**
 * The approval and review gates refuse a head whose stored content hash no longer matches its content, before they stamp or
 * rewrite anything. A head with no stored hash behaves as it always has.
 *
 * Run: npx tsx --test src/workflow/__tests__/gates-lifecycle-guard.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { approveArtifactByJsonPath, approveWorkflowTarget } from '../gates.js';
import { LifecycleConflictError } from '../artifact-core/types.js';
import { contentHash } from '../artifact-core/lifecycle.js';
import { reviewArtifactFile } from '../review/run-artifact.js';
import { artifactJsonPath, buildArtifactId, codeReviewArtifactId } from '../storage.js';
import type { LLMProvider } from '../../shared/types.js';

const HASH = 'abc123def4567890';
const actor = { id: 'insrc:system', kind: 'system', properties: {} };

async function withRepo(fn: (repo: string, dir: string) => void | Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-gates-lifecycle-guard-'));
	const dir = join(repo, '.insrc', 'artifacts');
	mkdirSync(dir, { recursive: true });
	try { await fn(repo, dir); } finally { rmSync(repo, { recursive: true, force: true }); }
}

/** A head carrying meta.lifecycle. `stored` is the content hash it claims; the body is what it really holds. */
function head(workflow: string, stored: 'matching' | 'mismatched' | 'empty', extra: Record<string, unknown> = {}): string {
	const body = workflow === 'build' ? { tasks: [] } : { text: 'one' };
	const hash = stored === 'matching' ? contentHash('d', { body, citations: [] }) : stored === 'empty' ? '' : 'f'.repeat(64);
	return JSON.stringify({
		meta: {
			workflow, epicHash: HASH, storyId: 's1', createdAt: '2026-10-20T00:00:00.000Z',
			envelope: { description: 'd', references: [], attachments: [] },
			lifecycle: { status: 'draft', revision: { number: 1, contentHash: hash, at: 't', by: actor }, signoffs: [] },
			...extra,
		},
		body, citations: [],
	}, null, 2) + '\n';
}
const read = (p: string): string => readFileSync(p, 'utf8');
const isApproved = (p: string): boolean => (JSON.parse(read(p)) as { meta?: { approvedAt?: string | undefined } | undefined }).meta?.approvedAt !== undefined;

test('approveWorkflowTarget refuses a conflicted BUILD target in both branches before ensureBuildRecordOnCompletion rewrites it', async () => {
	await withRepo(async (repo, dir) => {
		const build = artifactJsonPath(repo, buildArtifactId(HASH, 's1'));
		writeFileSync(build, head('build', 'mismatched'));
		writeFileSync(artifactJsonPath(repo, codeReviewArtifactId(HASH, 's1')), JSON.stringify({ meta: { reviewedBy: 'daemon' }, body: { verdict: 'pass', counts: { high: 0, med: 0, low: 0 } } }));
		const before = read(build);

		// the single-target branch
		const single = await approveWorkflowTarget({ repoPath: repo, artifactPath: build }, { enforce: false });
		assert.deepEqual(single.approved, []);
		assert.equal(single.skipped.length, 1);
		assert.equal(single.skipped[0]?.path, build);
		assert.match(single.skipped[0]?.reason ?? '', /hash-mismatch/);
		assert.equal(read(build), before, 'the record bytes are unchanged by the completion hook');

		// the epic sweep branch
		const sweep = await approveWorkflowTarget({ repoPath: repo, epicHash: HASH }, { enforce: false });
		assert.deepEqual(sweep.approved, []);
		assert.equal(sweep.skipped.length, 1);
		assert.match(sweep.skipped[0]?.reason ?? '', /hash-mismatch/);
		assert.equal(read(build), before, 'the sweep leaves the record bytes unchanged too');

		// control: the same record with a matching hash goes through the hook and the approval, not the conflict refusal
		writeFileSync(build, head('build', 'matching'));
		const ok = await approveWorkflowTarget({ repoPath: repo, artifactPath: build }, { enforce: false });
		assert.ok(ok.skipped.every(s => !/hash-mismatch|in conflict/.test(s.reason)), JSON.stringify(ok.skipped));
		assert.notEqual(read(build), head('build', 'matching'), 'the hook ran on the consistent record');
		void dir;
	});
});

test('approveArtifactByJsonPath and reviewArtifactFile refuse a conflicted head before any stamp and an unhashed head is unchanged', async () => {
	await withRepo(async (repo) => {
		const plan = artifactJsonPath(repo, `PLAN-${HASH}-s1`);
		writeFileSync(plan, head('plan', 'mismatched'));
		const before = read(plan);

		// approve: LifecycleConflictError before the stamp, synchronously
		assert.throws(() => approveArtifactByJsonPath(plan), (e: unknown) => e instanceof LifecycleConflictError && e.reason === 'hash-mismatch');
		assert.equal(read(plan), before, 'nothing was stamped');
		// on the workflow path the same head comes back in skipped[]
		const viaWorkflow = await approveWorkflowTarget({ repoPath: repo, artifactPath: plan }, { enforce: false });
		assert.deepEqual(viaWorkflow.approved, []);
		assert.match(viaWorkflow.skipped[0]?.reason ?? '', /hash-mismatch/);
		assert.equal(read(plan), before);

		// review: refused before any model is called and before the md or json is touched
		const md = join(repo, 'plan.md');
		writeFileSync(md, '# plan\n');
		const provider = new Proxy({}, { get: () => { throw new Error('the provider must not be reached'); } }) as unknown as LLMProvider;
		await assert.rejects(
			reviewArtifactFile({ mdPath: md, jsonPath: plan, repo, provider, model: 'm' }),
			(e: unknown) => e instanceof LifecycleConflictError && e.reason === 'hash-mismatch',
		);
		assert.equal(read(plan), before);
		assert.equal(read(md), '# plan\n');

		// a head with no stored hash is approved as before, and a head with a matching hash too
		for (const stored of ['empty', 'matching'] as const) {
			const p = artifactJsonPath(repo, `PLAN-${HASH}-s${stored === 'empty' ? 2 : 3}`);
			writeFileSync(p, head('plan', stored));
			const result = approveArtifactByJsonPath(p);
			assert.equal(result.path, p);
			assert.ok(isApproved(p), `${stored}: stamped`);
		}
	});
});
