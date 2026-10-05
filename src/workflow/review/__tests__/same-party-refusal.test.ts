/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * `reviewArtifactFile` is the daemon's review, so it refuses an artifact the
 * daemon authored, before any model call. The TUI review service calls it and
 * so refuses too.
 * (LLD-1716f77ba9ba017b-S001, test T15; plan task t4.)
 */

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

import { reviewArtifact } from '../../../cli/services/workflow.js';
import type { LLMProvider } from '../../../shared/types.js';
import { reviewArtifactFile, SamePartyReviewError } from '../index.js';
import { DEFAULT_DESIGN_REVIEW_SETTINGS, reviewTemplateFor } from '../template.js';

const SPEC = reviewTemplateFor('spec', DEFAULT_DESIGN_REVIEW_SETTINGS);

/** A provider that counts every call it receives, of either kind. */
function countingProvider() {
	const calls: string[] = [];
	const provider = {
		capabilities: { structuredOutput: true, toolCalling: false, vision: false, webSearch: false, streaming: false, embeddings: false },
		async complete() { calls.push('complete'); throw new Error('unused'); },
		async completeStructured() { calls.push('completeStructured'); return { claims: [] }; },
		async runReviewSession() {
			calls.push('runReviewSession');
			return { items: SPEC.items.map(it => ({ item: it.id, premises: [{ premise: `claim under ${it.id}`, outcome: 'holds', evidence: 'read it', action: '' }] })) };
		},
	} as unknown as LLMProvider;
	return { provider, calls };
}

type Kind = 'DEF' | 'LLD';
const WORKFLOW: Record<Kind, string> = { DEF: 'define', LLD: 'design.story' };

/** An artifact in the nested layout, so its md resolves to its json by marker. */
function fixture(kind: Kind, authorMeta: Record<string, unknown>) {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-same-party-'));
	const id = kind === 'DEF' ? 'DEF-abcd' : 'LLD-abcd-S001';
	const json = join(repo, '.insrc', 'artifacts', `${id}.json`);
	const md = join(repo, 'docs', 'epics', 'demo-E20261005abcd', kind === 'DEF' ? 'DEF.md' : join('S001', 'LLD.md'));
	mkdirSync(dirname(json), { recursive: true });
	mkdirSync(dirname(md), { recursive: true });
	writeFileSync(json, JSON.stringify({ meta: { workflow: WORKFLOW[kind], epicHash: 'abcd', storyId: 'S001', ...authorMeta }, body: { note: 'x' }, citations: [] }, null, 2) + '\n');
	writeFileSync(md, `<!-- insrc:artifact ${id} -->\n\n# ${kind}\n\nThe body.\n`);
	return { repo, md, json, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

const review = (f: ReturnType<typeof fixture>, provider: LLMProvider) =>
	reviewArtifactFile({ mdPath: f.md, jsonPath: f.json, repo: f.repo, provider, model: 'cli-claude:opus' });

for (const kind of ['DEF', 'LLD'] as const) {
	for (const [how, meta] of [
		['by its explicit field', { authoredBy: 'daemon' }],
		['by its attribution labels (an older artifact)', { attribution: { outputs: [{ role: 'synthesize', tier: 'core', runner: 'cli-claude', model: 'opus' }] } }],
	] as const) {
		test(`T15 a ${kind} authored by the daemon (${how}) is refused before any provider call, and nothing is written`, async () => {
			const f = fixture(kind, meta);
			try {
				const before = { json: readFileSync(f.json, 'utf8'), md: readFileSync(f.md, 'utf8') };
				const p = countingProvider();
				await assert.rejects(review(f, p.provider), (e: unknown) => {
					assert.ok(e instanceof SamePartyReviewError);
					assert.equal(e.party, 'daemon');
					assert.match(e.message, /Same-party review refused/);
					assert.match(e.message, /controller review \(insrc_review_step/);
					assert.match(e.message, /override reason at approval/);
					return true;
				});
				assert.deepEqual(p.calls, [], 'no review is spent');
				assert.equal(readFileSync(f.json, 'utf8'), before.json);
				assert.equal(readFileSync(f.md, 'utf8'), before.md);
			} finally { f.cleanup(); }
		});
	}

	for (const [who, meta] of [
		['the controller', { authoredBy: 'controller' }],
		['an unknown author', {}],
	] as const) {
		test(`T15 a ${kind} authored by ${who} is reviewed by the daemon`, async () => {
			const f = fixture(kind, meta);
			try {
				const p = countingProvider();
				const res = await review(f, p.provider);
				assert.ok(p.calls.length > 0, 'the review ran');
				assert.equal(res.report.reviewedBy, 'daemon');
				assert.equal(JSON.parse(readFileSync(f.json, 'utf8')).meta.review.reviewedBy, 'daemon');
			} finally { f.cleanup(); }
		});
	}
}

test('T15 the TUI review service surfaces the refusal, naming a controller review or an override', async () => {
	for (const kind of ['DEF', 'LLD'] as const) {
		const f = fixture(kind, { authoredBy: 'daemon' });
		try {
			const before = readFileSync(f.json, 'utf8');
			await assert.rejects(reviewArtifact(f.repo, f.md), (e: unknown) => {
				assert.ok(e instanceof SamePartyReviewError, `got ${String(e)}`);
				assert.match(e.message, /controller review \(insrc_review_step/);
				assert.match(e.message, /override reason at approval/);
				return true;
			});
			assert.equal(readFileSync(f.json, 'utf8'), before, 'nothing is stamped');
		} finally { f.cleanup(); }
	}
});
