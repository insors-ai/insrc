/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Dedupe keys and the dependency table audit (LLD-b9d5c5c40df5a574-s3, task t5).
 * Pure: no model.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { ExecutedExploration, ExecutedPlan } from '../../explore/types.js';
import type { LLMMessage, LLMProvider } from '../../../shared/types.js';
import { DEDUPE_KEYS, DEPENDENCY, dedupeByKey, evidenceBlocks, missingDependencyKeys, selectSharedContext } from '../dependency.js';
import { assembleBundle } from '../handling-adapters.js';
import type { BundleLayers } from '../handling-adapters.js';
import { runDivided } from '../handling-parts.js';
import type { PartAdapter } from '../handling-parts.js';
import { renderSection } from '../sections.js';

test('dedupeByKey first ordinal wins and order kept; audit fails when a synthesize prompt key has no entry', () => {
	// Parts concatenated in ordinal order: part 1's entries, then part 2's.
	const entries = [
		{ file: 'docs/a.md', heading: 'A (part 1)' },
		{ file: 'docs/b.md', heading: 'B' },
		{ file: 'docs/a.md', heading: 'A (part 2)' },
		{ heading: 'no file' },
		{ file: 'docs/c.md', heading: 'C' },
		{ file: 'docs/b.md', heading: 'B again' },
	];
	assert.deepEqual(dedupeByKey(entries, 'file'), [entries[0], entries[1], entries[3], entries[4]]);
	assert.deepEqual(dedupeByKey([{ path: 'src/x' }, { path: 'src/y' }, { path: 'src/x' }], 'path'), [{ path: 'src/x' }, { path: 'src/y' }]);
	assert.deepEqual(dedupeByKey([], 'file'), []);

	// The audit: every registered synthesize prompt has an entry, each with its reason.
	const dir = fileURLToPath(new URL('../../../prompts/analyze/', import.meta.url));
	const keys = readdirSync(dir).map(f => /^synthesize\.(.+)\.system\.md$/.exec(f)?.[1]).filter((k): k is string => k !== undefined);
	assert.deepEqual([...keys].sort(), ['adherence', 'capability', 'code', 'data', 'docs', 'infra']);
	assert.deepEqual(missingDependencyKeys(keys), []);
	for (const key of keys) {
		const entry = DEPENDENCY[key as keyof typeof DEPENDENCY];
		assert.ok(entry.reason.length > 20, `${key} states its reason`);
		assert.deepEqual(DEDUPE_KEYS[key as keyof typeof DEDUPE_KEYS], entry.dedupe);
	}
	// A prompt added without an entry is reported.
	assert.deepEqual(missingDependencyKeys([...keys, 'security']), ['security']);
	// The stated references.
	assert.deepEqual(DEPENDENCY.adherence.referenceTypes, ['doc.constraint.enumerate', 'doc.decision.trace']);
	assert.deepEqual(DEPENDENCY.capability.referenceTypes, ['capability.reuse-check']);
	assert.equal(DEPENDENCY.code.anchorExtract, true);
	for (const none of ['docs', 'data', 'infra'] as const) {
		assert.deepEqual(DEPENDENCY[none].referenceTypes, []);
		assert.equal(DEPENDENCY[none].anchorExtract, false);
	}
});

// ---------------------------------------------------------------------------
// Capability and code regressions with forced partitions
// ---------------------------------------------------------------------------

const exec = (id: string, output: Record<string, unknown>): ExecutedExploration =>
	({ exploration: { id, type: output['type'], purpose: 'p', params: {} }, output, cached: false, elapsedMs: 1 }) as unknown as ExecutedExploration;
const plan = (...results: ExecutedExploration[]): ExecutedPlan => ({ plan: { explorations: [] }, results, totalMs: 1, totalCached: 0 }) as unknown as ExecutedPlan;
const FOUND = { results: [], report: { completeness: { complete: true, incomplete: [], failed: [] } } };
const target = { kind: 'cli', inputBudgetChars: 16_000 + 12_000 } as const;
type Reply = BundleLayers & { summary: string };

const layersAdapter: PartAdapter<Reply, { system: string; focus: string; summary: string }> = {
	partSchema: { kind: 'part' }, combineSchema: { kind: 'combine' },
	renderPart: (part, round) => [{ role: 'user', content: `PART ${part.id}\nREF:\n${round.rendered}\nEVIDENCE:\n${part.sections.map(renderSection).join('\n\n')}` }],
	renderCombine: (s, round) => [{ role: 'user', content: `COMBINE\nREF:\n${round.rendered}\n${s.map(x => x.summary).join('\n')}` }],
	summaryOf: r => r.summary, summaryOfCombine: c => c.summary,
};

/** A provider that writes a part's layers from its prompt, as the capability and code prompts say to. */
function layersProvider(): { provider: LLMProvider; prompts: string[] } {
	const prompts: string[] = [];
	const provider = {
		completeStructured: async (messages: LLMMessage[], schema: unknown) => {
			const prompt = String(messages[0]?.content);
			prompts.push(prompt);
			if ((schema as { kind: string }).kind === 'combine') return { system: 'S', focus: 'F', summary: 'combined' };
			const candidates = new Set([...prompt.matchAll(/candidates[^\n]*?"path":"([^"]+)"/g)].map(m => m[1] as string));
			const refText = prompt.slice(prompt.indexOf('REF:'), prompt.indexOf('EVIDENCE:'));
			for (const m of refText.matchAll(/"path":"([^"]+)"/g)) candidates.add(m[1] as string);
			const hits = [...prompt.slice(prompt.indexOf('EVIDENCE:')).matchAll(/"path":"(src\/[^"]+)"/g)].map(m => m[1] as string);
			const anchored = /"anchor":\{"path":"src\/anchor"/.test(refText);
			return {
				system: anchored ? 'code-shaper: structural map anchored on src/anchor.' : 'not anchored', focus: 'f', summary: 'part',
				structure: `## Related modules (concept.resolve)\n${[...new Set(hits)].filter(h => !candidates.has(h)).join('\n')}`,
				surface: `docs/shared.md :: Shared\nsrc/${prompt.length % 7}.ts`, artefacts: '', upstream: '',
			};
		},
	} as unknown as LLMProvider;
	return { provider, prompts };
}

test('capability and code regressions with forced partitions and deduped Related modules, Related docs and surface', async () => {
	const hit = (path: string, filler: number) => ({ kind: 'module', path, name: path, score: 0.9, diagnostics: 'd'.repeat(filler) });
	// The hit src/a is also a reuse-check candidate; the hits and the candidates end up in different parts.
	const resolve = exec('e1', { type: 'concept.resolve', query: 'q', hits: [hit('src/a', 4_200), hit('src/b', 4_200), hit('src/c', 4_200), hit('src/b', 4_200)], anchor: { path: 'src/anchor', kind: 'module', source: 'named-scope' } });
	const reuse = exec('e2', { type: 'capability.reuse-check', capability: 'c', candidates: [{ path: 'src/a', moduleName: 'a', verdict: 'reuse', rationale: 'r', evidenceEntities: [], conceptScore: 0.9 }], notFoundNote: '' });
	const executed = plan(resolve, reuse);

	const run = async (kind: 'capability' | 'code') => {
		const { provider, prompts } = layersProvider();
		const result = await runDivided({
			provider, target, adapter: layersAdapter, blocks: evidenceBlocks(kind, executed), reference: selectSharedContext(kind, executed),
			found: FOUND, maxAttempts: 2,
		});
		return { result, prompts, layers: assembleBundle(kind, result.covered, result.combine) };
	};

	// Capability: every part and combine call carries the candidates; src/a is never a related module; src/b, seen in two parts, once.
	const cap = await run('capability');
	assert.ok(cap.result.covered.length >= 2, 'the hits are in several parts');
	for (const p of cap.prompts) assert.ok(p.includes('"path":"src/a"') && p.includes('capability.reuse-check'), 'the candidates are in every call');
	assert.ok(!cap.layers.structure.split('\n').includes('src/a'), 'a candidate is not a related module');
	assert.equal(cap.layers.structure.split('\n').filter(l => l === 'src/b').length, 1);
	assert.ok(cap.layers.structure.split('\n').includes('src/c'));

	// Code: the anchor record is in every part and combine call; the bundle is centred on it; shared files are listed once.
	const code = await run('code');
	assert.ok(code.result.covered.length >= 2);
	for (const p of code.prompts) assert.ok(p.includes('"anchor":{"path":"src/anchor"'), 'the anchor is in every call');
	assert.ok(code.result.covered.every(c => c.reply.system.includes('anchored on src/anchor')));
	assert.equal(code.layers.surface.split('docs/shared.md').length - 1, 1, 'a file in the surface of two parts is listed once');
});

