/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ISSUE-36cbeeac485c0af7 — an LLD's quality must not depend on which model wrote it.
 *
 * Run: npx tsx --test --test-force-exit src/workflow/__tests__/lld-authoring-gates.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { clientAttribution, modelSummary } from '../attribution.js';
import { finalizeArtifact } from '../orchestrator.js';
import { checkNonPathCitationRefs, checkPathForms } from '../synthesizer.js';
import { markApprovedSync } from './lifecycle-fixtures.js';
import { isLldBody, renderLldMarkdown, type LldArtifact, type LldBody } from '../artifacts/lld.js';
import { defineArtifactPaths, hldArtifactPaths } from '../storage.js';
import type { ArtifactModelAttribution, Citation, WorkflowIntent } from '../types.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const EPIC_HASH = 'b4e1c7d2a9f03e65';
const CREATED = '2026-11-08T07:42:28.275Z';
const TITLE = 'The title of the story';

function body(): LldBody {
	return {
		hldContextSlice: {
			frameworkSummary: 'standalone', ownedContracts: [], consumedContracts: [],
			boundary: { storyId: 's1', owns: [], depends: [], internal: 'the boundary text' },
			adjacentBoundaries: [], rolloutPhase: 'standalone', nonFunctional: {},
		},
		contractDetails: { surfaceLevel: 'internal', api: [] },
		dataModelChanges: [],
		interactionWithShared: [],
		errorPaths: { errorCases: [], edgeCases: [], invariantsToPreserve: [] },
		testStrategy: { testLevels: [], acceptanceMapping: [], testFramework: 'node:test' },
		alternativesConsidered: [
			{ id: 'a1', name: 'first', oneLineSummary: 'one', approach: 'the first approach', pros: ['p'], cons: ['c'], costEstimate: 'S' },
			{ id: 'a2', name: 'second', oneLineSummary: 'two', approach: 'the second approach', pros: ['p'], cons: ['c'], costEstimate: 'M', reasonRejected: 'too big' },
		],
		chosenAlternative: 'a1',
		openQuestions: [],
	};
}

const CITATIONS = [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }];

function standaloneIntent(repo: string, storyTitle?: string): WorkflowIntent {
	return {
		workflow: 'design.story', focus: 'a story', repoPath: repo, repoIndexedAt: null,
		params: { standalone: true, epicHash: EPIC_HASH, storyId: 's1', sizeClass: 'feature', ...(storyTitle !== undefined ? { storyTitle } : {}) },
	} as unknown as WorkflowIntent;
}

function epicIntent(repo: string): WorkflowIntent {
	return {
		workflow: 'design.story', focus: 'a story', repoPath: repo, repoIndexedAt: null,
		params: { epicHash: EPIC_HASH, storyId: 's1' },
	} as unknown as WorkflowIntent;
}

function seedEpic(repo: string): void {
	const dp = defineArtifactPaths(repo, EPIC_HASH, CREATED, 'epic');
	mkdirSync(dirname(dp.json), { recursive: true });
	writeFileSync(dp.json, JSON.stringify({
		meta: { workflow: 'define', runId: 'def', schemaVersion: 1, epicHash: EPIC_HASH, epicSlug: 'gates', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			flavor: 'new-capability', problem: 'x', nonGoals: [], assumptions: [], constraints: [],
			stories: [{ id: 's1', title: TITLE, userValue: 'v', acceptanceCriteria: [], dependsOn: [] }],
			openQuestions: [],
		},
		citations: [],
	}, null, 2));
	markApprovedSync(dp.json);
	const hp = hldArtifactPaths(repo, EPIC_HASH, CREATED, 'epic');
	writeFileSync(hp.json, JSON.stringify({
		meta: { workflow: 'design.epic', runId: 'hld', schemaVersion: 1, epicHash: EPIC_HASH, epicSlug: 'gates', createdAt: CREATED, epicCreatedAt: CREATED },
		body: {
			frameworkSummary: 'x', architectureShape: 'x [[c1]]', sharedContracts: [],
			storyBoundaries: [{ storyId: 's1', owns: [], depends: [], internal: 'the boundary text' }],
			nonFunctional: {},
			rolloutOverview: { phases: [{ name: 'A', includesStories: ['s1'], rationale: 'x', backwardCompat: '', featureFlag: null }], orderingRationale: 'x', riskyBits: [] },
			alternativesConsidered: [{ id: 'a1', name: 'x', oneLineSummary: 'x', approach: 'x', pros: ['x'], cons: ['x'], costEstimate: 'S' }],
			chosenAlternative: 'a1', openQuestions: [],
		},
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'x' }],
	}, null, 2));
	markApprovedSync(hp.json);
}

async function inRepo(prefix: string, run: (repo: string) => Promise<void>): Promise<void> {
	const repo = mkdtempSync(join(tmpdir(), prefix));
	try { await run(repo); } finally { rmSync(repo, { recursive: true, force: true }); }
}

function firstLine(md: string): string | undefined {
	return md.split('\n').find(l => l.startsWith('# '));
}

function stored(meta: Partial<LldArtifact['meta']>): LldArtifact {
	return {
		meta: {
			workflow: 'design.story', runId: 'r', repoPath: '/tmp/none', createdAt: CREATED, repoIndexedAt: null, elapsedMs: 1, schemaVersion: 1,
			epicHash: EPIC_HASH, epicSlug: 'gates', storyId: 's1', hldBaseRunId: 'h', hldEffectiveHash: 'e', hldAmendmentsApplied: [], ...meta,
		} as LldArtifact['meta'],
		body: body(),
		citations: [{ id: 'c1', kind: 'code', ref: 'src/x.ts' }],
	};
}

// ---------------------------------------------------------------------------
// t1 — the title
// ---------------------------------------------------------------------------

test('title: the H1 shows id and title', () => {
	assert.equal(firstLine(renderLldMarkdown(stored({ storyTitle: TITLE }))), `# LLD: STORY-${EPIC_HASH}-s1 — ${TITLE}`);
});

test('title: a title with a line break renders on one line', () => {
	assert.equal(firstLine(renderLldMarkdown(stored({ storyTitle: '  First\n  second\tthird ' }))), `# LLD: STORY-${EPIC_HASH}-s1 — First second third`);
});

test('title: the H1 shows id and title on both finalize paths', async () => {
	await inRepo('lld-title-standalone-', async repo => {
		const r = await finalizeArtifact(standaloneIntent(repo, TITLE), {}, 'wf', 5, { body: body(), citations: CITATIONS }, 'client');
		assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.failure));
		assert.equal(firstLine(r.finalized.renderedMd), `# LLD: STORY-${EPIC_HASH}-s1 — ${TITLE}`);
	});
	await inRepo('lld-title-standalone-fallback-', async repo => {
		const r = await finalizeArtifact(standaloneIntent(repo), {}, 'wf', 5, { body: body(), citations: CITATIONS }, 'client');
		assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.failure));
		assert.equal(firstLine(r.finalized.renderedMd), `# LLD: STORY-${EPIC_HASH}-s1 — the boundary text`);
	});
	await inRepo('lld-title-epic-', async repo => {
		seedEpic(repo);
		const r = await finalizeArtifact(epicIntent(repo), {}, 'wf', 5, { body: body(), citations: CITATIONS }, 'client');
		assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.failure));
		assert.equal(firstLine(r.finalized.renderedMd), `# LLD: STORY-${EPIC_HASH}-s1 — ${TITLE}`);
	});
});

test('stored: a stored LLD with no storyTitle renders byte-identically', () => {
	const dir = 'docs/standalone/show-provider-icons-chat-dropdowns-relabel-E20261107546198e1/S001/LLD.md';
	const artifact = JSON.parse(readFileSync(join(ROOT, '.insrc/artifacts/LLD-546198e11c24c1e3-s1.json'), 'utf8')) as LldArtifact;
	assert.equal(artifact.meta.storyTitle, undefined, 'the fixture is an LLD written before the title existed');
	assert.equal(renderLldMarkdown(artifact).trimEnd(), readFileSync(join(ROOT, dir), 'utf8').trimEnd());
});

// ---------------------------------------------------------------------------
// t2 — alternatives come from the alternatives step
// ---------------------------------------------------------------------------

const S2_RECORDS = [
	{ id: 'a1', name: 'step first', oneLineSummary: 'step one', approach: 'the step approach one', pros: ['sp1'], cons: ['sc1'], costEstimate: 'S' },
	{ id: 'a2', name: 'step second', oneLineSummary: 'step two', approach: 'the step approach two', pros: ['sp2'], cons: ['sc2'], costEstimate: 'M' },
];

function emitWith(alternativesConsidered: unknown): Record<string, unknown> {
	return { body: { ...body(), alternativesConsidered }, citations: CITATIONS };
}

async function finalizeAlternatives(alternatives: unknown, stepOutputs: Record<string, unknown>) {
	const repo = mkdtempSync(join(tmpdir(), 'lld-alts-'));
	try {
		return await finalizeArtifact(standaloneIntent(repo, TITLE), stepOutputs, 'wf', 5, emitWith(alternatives), 'client');
	} finally { rmSync(repo, { recursive: true, force: true }); }
}

/** The refusal's retryability and message; a success fails the test. */
function refusal(r: Awaited<ReturnType<typeof finalizeArtifact>>): { retryable: boolean | undefined; message: string; kind: string } {
	assert.equal(r.ok, false, 'the submission must be refused');
	if (r.ok || r.failure.ok) throw new Error('unreachable');
	return { retryable: r.failure.retryable, message: r.failure.message, kind: r.failure.kind };
}

function storedAlternatives(r: Awaited<ReturnType<typeof finalizeArtifact>>): unknown {
	assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.failure));
	return (r.finalized.artifact as LldArtifact).body.alternativesConsidered;
}

test('overlay: a submission with only ids and reasonRejected stores every s2 field', async () => {
	const r = await finalizeAlternatives([{ id: 'a1' }, { id: 'a2', reasonRejected: 'lost' }], { s2: { alternatives: S2_RECORDS } });
	assert.deepEqual(storedAlternatives(r), [S2_RECORDS[0], { ...S2_RECORDS[1], reasonRejected: 'lost' }]);
});

test("overlay: a submission that alters s2's content stores s2's values", async () => {
	const altered = [
		{ id: 'a1', name: 'rewritten', oneLineSummary: 'rewritten', approach: 'rewritten', pros: [], cons: [], costEstimate: 'L', chosen: true },
		{ id: 'a2', name: 'rewritten', reasonRejected: 'lost' },
	];
	const r = await finalizeAlternatives(altered, { s2: { alternatives: S2_RECORDS } });
	assert.deepEqual(storedAlternatives(r), [S2_RECORDS[0], { ...S2_RECORDS[1], reasonRejected: 'lost' }], 'content is s2\'s and the extra field is gone');
});

test('finalize: duplicate submitted ids are refused as retryable', async () => {
	const f = refusal(await finalizeAlternatives([{ id: 'a1' }, { id: 'a1' }, { id: 'a2' }], { s2: { alternatives: S2_RECORDS } }));
	assert.notEqual(f.retryable, false);
	assert.match(f.message, /duplicated: a1/);
});

test('finalize: an id absent from s2 is refused as retryable', async () => {
	const f = refusal(await finalizeAlternatives([{ id: 'a1' }, { id: 'a2' }, { id: 'a9' }], { s2: { alternatives: S2_RECORDS } }));
	assert.notEqual(f.retryable, false);
	assert.match(f.message, /not in the alternatives step: a9/);
});

test('finalize: an s2 alternative missing from the submission is refused as retryable', async () => {
	const f = refusal(await finalizeAlternatives([{ id: 'a1' }], { s2: { alternatives: S2_RECORDS } }));
	assert.notEqual(f.retryable, false);
	assert.match(f.message, /missing: a2/);
});

test('finalize: duplicate s2 ids are refused as non-retryable', async () => {
	const f = refusal(await finalizeAlternatives([{ id: 'a1' }], { s2: { alternatives: [S2_RECORDS[0], S2_RECORDS[0]] } }));
	assert.equal(f.retryable, false);
	assert.match(f.message, /Restart design\.story/);
});

test('fallback: a run with no s2 output accepts complete submitted alternatives', async () => {
	const r = await finalizeAlternatives(body().alternativesConsidered, {});
	assert.deepEqual(storedAlternatives(r), body().alternativesConsidered);
});

test('fallback: a run with no s2 output refuses an id-only submission', async () => {
	const f = refusal(await finalizeAlternatives([{ id: 'a1' }, { id: 'a2' }], {}));
	assert.notEqual(f.retryable, false);
	assert.match(f.message, /a1, a2 are incomplete/);
});

test('finalize: both the Epic and the standalone path apply the overlay', async () => {
	const steps = { s2: { alternatives: S2_RECORDS } };
	const emit = emitWith([{ id: 'a1' }, { id: 'a2', reasonRejected: 'lost' }]);
	const expected = [S2_RECORDS[0], { ...S2_RECORDS[1], reasonRejected: 'lost' }];
	await inRepo('lld-overlay-standalone-', async repo => {
		assert.deepEqual(storedAlternatives(await finalizeArtifact(standaloneIntent(repo, TITLE), steps, 'wf', 5, emit, 'client')), expected);
	});
	await inRepo('lld-overlay-epic-', async repo => {
		seedEpic(repo);
		assert.deepEqual(storedAlternatives(await finalizeArtifact(epicIntent(repo), steps, 'wf', 5, emit, 'client')), expected);
	});
});

test('finalize: an incomplete s2 record is refused as non-retryable, naming a restart, and writes nothing', async () => {
	await inRepo('lld-malformed-s2-', async repo => {
		const { approach: _dropped, ...incomplete } = S2_RECORDS[0]!;
		const emit = { body: { ...body(), alternativesConsidered: [{ id: 'a1' }], sequenceDefinition: { participants: [{ id: 'A' }, { id: 'B' }], messages: [{ from: 'A', to: 'B', label: 'x' }] } }, citations: CITATIONS };
		const f = refusal(await finalizeArtifact(standaloneIntent(repo, TITLE), { s2: { alternatives: [incomplete] } }, 'wf', 5, emit, 'client'));
		assert.equal(f.retryable, false);
		assert.match(f.message, /Restart design\.story/);
		assert.deepEqual(readdirSync(repo), [], 'no companion or other file was written');
		const empty = refusal(await finalizeArtifact(standaloneIntent(repo, TITLE), { s2: {} }, 'wf', 5, { body: body(), citations: CITATIONS }, 'client'));
		assert.equal(empty.retryable, false, 'an s2 output with no alternatives is malformed, not absent');
		assert.match(empty.message, /Restart design\.story/);
		const nulled = refusal(await finalizeArtifact(standaloneIntent(repo, TITLE), { s2: null }, 'wf', 5, { body: body(), citations: CITATIONS }, 'client'));
		assert.equal(nulled.retryable, false, 'a null s2 output is malformed, not absent');
		assert.match(nulled.message, /Restart design\.story/);
	});
});

test('stored: isLldBody still accepts a stored LLD with partial alternatives', () => {
	const artifact = JSON.parse(readFileSync(join(ROOT, '.insrc/artifacts/LLD-546198e11c24c1e3-s1.json'), 'utf8')) as LldArtifact;
	assert.equal((artifact.body.alternativesConsidered[0] as { approach?: unknown }).approach, undefined, 'the fixture really is partial');
	assert.equal(isLldBody(artifact.body), true);
});

// ---------------------------------------------------------------------------
// t3 — the file-reference rule on non-path citations
// ---------------------------------------------------------------------------

const bundle = (ref: string): Citation => ({ id: 'c1', kind: 'analyze-bundle', ref });

function refused(ref: string): string[] {
	const r = checkNonPathCitationRefs([bundle(ref)], '/repo');
	assert.equal(r.ok, false, `'${ref}' must be refused`);
	return r.ok ? [] : [...(r.details ?? [])];
}

function passes(ref: string): void {
	assert.deepEqual(checkNonPathCitationRefs([bundle(ref)], '/repo'), { ok: true }, `'${ref}' must pass`);
}

test("citations: the DeepSeek LLD's actual refs are refused", () => {
	const artifact = JSON.parse(readFileSync(join(ROOT, '.insrc/artifacts/LLD-546198e11c24c1e3-s1.json'), 'utf8')) as LldArtifact;
	assert.equal(artifact.citations.length, 6);
	const r = checkNonPathCitationRefs(artifact.citations, artifact.meta.repoPath);
	assert.equal(r.ok, false);
	if (!r.ok) assert.equal(r.details?.length, 6, 'every one of the six is refused');
});

test('citations: a badly formed path-only ref under analyze-bundle is refused, as under code', () => {
	for (const ref of ['./src/workflow/synthesizer.ts', 'src/../src/workflow/synthesizer.ts', 'src/workflow/synthesizer.ts:finalize', '/repo/src/x.ts']) {
		refused(ref);
		assert.equal(checkPathForms([{ id: 'c1', kind: 'code', ref }], [], '/repo').ok, false, `the same ref under code is refused: ${ref}`);
	}
});

test('citations: a root-level file name alongside prose is refused', () => {
	assert.equal(checkNonPathCitationRefs([{ id: 'c1', kind: 'analyze-bundle', ref: 'read:manifest:package.json controls dependencies' }]).ok, false, 'a file name attached to a colon label');
	assert.match(refused('read:manifest: package.json controls dependencies')[0]!, /beside other text/);
});

test('citations: a URL alongside prose is refused', () => {
	assert.match(refused('read:source: https://example.com/source.ts explains the implementation')[0]!, /beside other text/);
});

test('citations: a text-only label, a well-formed path and a standalone URL all pass', () => {
	for (const ref of ['s1 analyze: the session lease and follow after reload', 'paintOpt/paintSel paint the options', 's1.analyzeBundles[0]', 'version 1.2 of the contract', 'src/workflow/synthesizer.ts:280', 'package.json', 'https://example.com/source.ts']) passes(ref);
	for (const ref of ['https://example.com/source.ts?lines=1,2', 'https://example.com/source.ts;version=2']) {
		assert.deepEqual(checkNonPathCitationRefs([{ id: 'c1', kind: 'analyze-bundle', ref }]), { ok: true }, ref);
	}
	assert.deepEqual(checkNonPathCitationRefs([{ id: 'c1', kind: 'code', ref: 'prose under a code kind is checkPathForms\' job' }]), { ok: true });
});

test('citations: a refused citation names its id, writes nothing and succeeds when corrected', async () => {
	await inRepo('lld-citations-', async repo => {
		const bad = [{ id: 'c7', kind: 'analyze-bundle', ref: 'read:thing: the store (src/store.ts:12)' }];
		const emit = { body: { ...body(), sequenceDefinition: { participants: [{ id: 'A' }, { id: 'B' }], messages: [{ from: 'A', to: 'B', label: 'x' }] } } };
		const r = await finalizeArtifact(standaloneIntent(repo, TITLE), {}, 'wf', 5, { ...emit, citations: bad }, 'client');
		assert.equal(r.ok, false);
		if (r.ok || r.failure.ok) return;
		assert.equal(r.failure.kind, 'paths');
		assert.notEqual(r.failure.retryable, false);
		assert.match((r.failure.details ?? []).join(' '), /citation c7/);
		assert.deepEqual(readdirSync(repo), [], 'nothing was written');
		const good = [{ id: 'c7', kind: 'code', ref: 'src/store.ts:12', quotedText: 'the store' }];
		const fixed = await finalizeArtifact(standaloneIntent(repo, TITLE), {}, 'wf', 5, { ...emit, citations: good }, 'client');
		assert.ok(fixed.ok, fixed.ok ? '' : JSON.stringify(fixed.failure));
	});
});

test('citations: other artifact kinds are unaffected', async () => {
	const intent = { workflow: 'stub', focus: 'demo', repoPath: '/tmp/insrc-lld-gates', repoIndexedAt: null, params: {} } as unknown as WorkflowIntent;
	const emit = {
		body: { title: 'Demo', summary: 'A summary [[c1]].', bulletList: ['point [[c1]]'] },
		citations: [{ id: 'c1', kind: 'analyze-bundle', ref: 'read:thing: the store (src/store.ts:12)' }],
	};
	const r = await finalizeArtifact(intent, { s1: { echoed: 'alpha' } }, 'wf', 5, emit, 'client');
	assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.failure));
});

test('stored: checkPathForms behaviour for other artifact kinds is unchanged', () => {
	assert.deepEqual(checkPathForms([bundle('read:thing: the store (src/store.ts:12)')], [], '/repo'), { ok: true }, 'a non-path kind is still not examined');
	assert.equal(checkPathForms([{ id: 'c1', kind: 'code', ref: './src/x.ts' }], [], '/repo').ok, false, 'a code citation still is');
});

// ---------------------------------------------------------------------------
// t4 — the real client and reported model on client-authored artifacts
// ---------------------------------------------------------------------------

test('attribution: absent, blank and multiline authorModel stamp unknown', () => {
	for (const authorModel of [undefined, '', '   \t', 'first\nsecond', 'first\r\nsecond']) {
		assert.equal(clientAttribution('cli-claude', authorModel).outputs[0]!.model, 'unknown', JSON.stringify(authorModel));
	}
	assert.equal(clientAttribution('cli-claude', '  deepseek-v4\n').outputs[0]!.model, 'deepseek-v4', 'a single line is trimmed and kept');
});

test('attribution: a client with no family stamps runner unknown', () => {
	assert.deepEqual(clientAttribution(undefined, 'deepseek-v4'), {
		outputs: [{ role: '(client)', tier: 'core', runner: 'unknown', model: 'deepseek-v4' }],
	});
});

test('attribution: modelSummary prints an unknown stamp', () => {
	assert.equal(modelSummary(stored({ attribution: clientAttribution(undefined, undefined) }).meta), 'unknown:unknown');
	assert.equal(modelSummary(stored({ attribution: clientAttribution(undefined, 'deepseek-v4') }).meta), 'unknown:deepseek-v4');
	assert.equal(modelSummary(stored({ attribution: clientAttribution('cli-codex', undefined) }).meta), 'cli-codex:unknown');
});

test('attribution: a supplied multi-output attribution stays unchanged on both finalize paths', async () => {
	const supplied: ArtifactModelAttribution = {
		outputs: [
			{ role: 'synthesize', tier: 'core', runner: 'cli-claude', model: 'model-a' },
			{ role: 'design.contract.detail', tier: 'mid', runner: 'cli-codex', model: 'model-b' },
		],
	};
	const written = (r: Awaited<ReturnType<typeof finalizeArtifact>>): unknown => {
		assert.ok(r.ok, r.ok ? '' : JSON.stringify(r.failure));
		return (r.finalized.artifact as LldArtifact).meta.attribution;
	};
	const emit = emitWith(body().alternativesConsidered);
	await inRepo('lld-attribution-standalone-', async repo => {
		assert.deepEqual(written(await finalizeArtifact(standaloneIntent(repo, TITLE), {}, 'wf', 5, emit, 'client', supplied)), supplied);
	});
	await inRepo('lld-attribution-epic-', async repo => {
		seedEpic(repo);
		assert.deepEqual(written(await finalizeArtifact(epicIntent(repo), {}, 'wf', 5, emit, 'client', supplied)), supplied);
	});
});
