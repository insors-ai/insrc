/**
 * A partly read item is named with how much of it was read
 * (LLD-b9d5c5c40df5a574-s1, task t6).
 *
 * The documents are real files in a temporary repository, indexed through
 * the REAL artifact parser and stamped with the file hash as the indexer
 * does, then stored in a temporary graph. So the stored bodies carry the
 * indexer's own 8,192-character cut and its marker, and the lengths the
 * lookups report are measured from the files.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { getDb } from '../../../db/client.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { addRepo } from '../../../db/repos.js';
import { artifactParser } from '../../../indexer/parser/artifact.js';
import { makeEntityId } from '../../../indexer/parser/base.js';
import type { Entity } from '../../../shared/types.js';
import type { Completeness, PartlyReadItem } from '../../completeness.js';
import { permissiveIgnoreFilter } from '../../context/repo-ignore-filter.js';
import { INDEXER_CUT_MARKER, indexerFileHash } from '../../item-length.js';

import { DOC_INDEX_RULE } from '../completeness-facts.js';
import { finalizeDocConstraintEnumerate, prepareDocConstraintEnumerate } from '../doc-constraint-enumerate.js';
import { finalizeDocDecisionTrace, prepareDocDecisionTrace } from '../doc-decision-trace.js';
import { runDocMention } from '../doc-mention.js';
import { createItemMeasurer } from '../item-measure.js';
import { runManifestsLocate } from '../manifests-locate.js';
import { runModuleProfile } from '../module-profile.js';
import type { Exploration, ExplorationRunnerContext, ExplorationType } from '../types.js';

const NOW = '2026-10-08T10:00:00.000Z';

const BIG_BODY = `Refunds MUST be issued within 30 days. We decided to refund in full.\n${'refund detail. '.repeat(7_000)}`;
const GUIDE = `# Guide\n\nIntro.\n\n## Refund rules\n\n${BIG_BODY}\n\n## Refund short\n\nA refund SHALL be logged.\nWe decided to log every refund.\n`;

let dir: string;
let REPO: string;
let ctx: ExplorationRunnerContext;
let stored: Entity[] = [];

function exp(type: ExplorationType, params: Record<string, unknown>): Exploration {
	return { id: `e-${type}`, type, purpose: 'test', params };
}

/** Write a file and index it as the indexer does: parse, then stamp the hash on its file entity. */
async function index(rel: string, source: string): Promise<Entity[]> {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source);
	const { entities } = artifactParser.parse(file, source, REPO, 1);
	const fileEntity = entities.find(e => e.kind === 'file' && e.file === file);
	assert.ok(fileEntity, `${rel}: the parser produced a file entity`);
	fileEntity.hash = indexerFileHash(source);
	await upsertEntities(await getDb(), entities);
	stored.push(...entities);
	return entities;
}

function section(name: string): Entity {
	const e = stored.find(x => x.kind === 'section' && x.name === name);
	assert.ok(e, `a section named ${name}`);
	return e;
}

function lines(source: string, e: Entity): string {
	return source.split('\n').slice(e.startLine - 1, e.endLine).join('\n');
}

test.beforeEach(async () => {
	await closeGraphStore();
	stored = [];
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-partly-read-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
	ctx = {
		runId: 'test', repoPath: REPO, closureRepos: [REPO],
		readDep: () => undefined, ignoreFilter: permissiveIgnoreFilter(REPO),
	} as ExplorationRunnerContext;
	await index('docs/guide.md', GUIDE);
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// The document lookups' 2,000-character cut
// ---------------------------------------------------------------------------

test('a document lookup that cuts a 100,000-character section to 2,000 reports it against the section\'s real length (mutation: measure the stored body)', async () => {
	const big = section('Refund rules');
	const real = lines(GUIDE, big).length;
	// The fixture is the case the design names: the section is over 100,000 characters
	// and the indexer stored its first 8,192 with the marker.
	assert.ok(real > 100_000, `the section is ${real} characters`);
	assert.equal(big.body.length, 8_192 + INDEXER_CUT_MARKER.length);

	const prep = await prepareDocConstraintEnumerate({ subject: 'refund', repoPath: REPO, db: await getDb() });
	if (prep.kind !== 'narrow-llm') throw new Error('the fixture has sections that mention refund');
	const facts = prep.prepared.completenessFacts;
	assert.ok(facts !== undefined, 'prepare carries its facts');
	const guide = join(REPO, 'docs/guide.md');
	const entry = (facts.partlyRead ?? []).find(p => p.what === `${guide} § Refund rules`);
	assert.deepEqual(entry, { what: `${guide} § Refund rules`, readChars: 2_000, totalChars: real },
		'2,000 of the section\'s real length, not of the 8,192 the index stores');
	// The cut keeps its value: the model is still given exactly 2,000 characters of it.
	assert.ok(prep.userTurn.includes(big.body.slice(0, 2_000)));
	assert.equal(prep.userTurn.includes(big.body.slice(0, 2_001)), false);

	// A section shorter than the cut is not reported.
	assert.equal((facts.partlyRead ?? []).some(p => p.what.endsWith('§ Refund short')), false);

	// finalize builds the record from what prepare carried.
	const out = finalizeDocConstraintEnumerate(prep.prepared, {
		subject: 'refund', notFoundNote: '',
		constraints: [{ constraint: 'Refunds MUST be issued within 30 days.', kind: 'must', sourceEntityId: big.id, file: guide, heading: 'Refund rules', rationale: '' }],
	});
	assert.deepEqual(out.completeness.partlyRead, facts.partlyRead);
	assert.equal(out.completeness.complete, false);
	assert.equal(out.completeness.basisNote, DOC_INDEX_RULE);

	// The decision lookup makes the same cut and the same report.
	const dprep = await prepareDocDecisionTrace({ topic: 'refund', repoPath: REPO, db: await getDb() });
	if (dprep.kind !== 'narrow-llm') throw new Error('the fixture has sections that mention refund');
	const dentry = (dprep.prepared.completenessFacts?.partlyRead ?? []).find(p => p.what === `${guide} § Refund rules`);
	assert.deepEqual(dentry, { what: `${guide} § Refund rules`, readChars: 2_000, totalChars: real });
	const dout = finalizeDocDecisionTrace(dprep.prepared, { topic: 'refund', notFoundNote: '', decisions: [] } as Parameters<typeof finalizeDocDecisionTrace>[1]);
	assert.deepEqual(dout.completeness.partlyRead, dprep.prepared.completenessFacts?.partlyRead);
});

test('a section whose file changed since it was indexed is reported as partly read with no length claimed', async () => {
	const guide = join(REPO, 'docs/guide.md');
	writeFileSync(guide, `# Guide\n\nA new first paragraph.\n\n${GUIDE}`);

	const prep = await prepareDocConstraintEnumerate({ subject: 'refund', repoPath: REPO, db: await getDb() });
	if (prep.kind !== 'narrow-llm') throw new Error('the fixture has sections that mention refund');
	const entry = (prep.prepared.completenessFacts?.partlyRead ?? []).find(p => p.what === `${guide} § Refund rules`);
	// It is still known to be partly read: 2,000 of a stored body that is itself cut.
	assert.deepEqual(entry, {
		what: `${guide} § Refund rules`, readChars: 2_000, totalChars: null,
		totalNote: 'the file changed since it was indexed',
	});
	// A short section of the changed file: nothing shows it is longer than what was read, so it is not reported.
	assert.equal((prep.prepared.completenessFacts?.partlyRead ?? []).some(p => p.what.endsWith('§ Refund short')), false);
});

// ---------------------------------------------------------------------------
// Lookups that pass on a stored body the indexer cut
// ---------------------------------------------------------------------------

test('a lookup that passes on a stored body uncut reports the item as partly read when the indexer cut it', async () => {
	const big = section('Refund rules');
	const real = lines(GUIDE, big).length;
	const guide = join(REPO, 'docs/guide.md');

	// doc.mention ranks and previews from the stored body: 8,192 of the section's real length.
	const men = await runDocMention(exp('doc.mention', { subject: 'refund' }), ctx);
	assert.ok(men.hits.some(h => h.heading === 'Refund rules'), 'the long section is a hit');
	assert.deepEqual(men.completeness.partlyRead, [{ what: `${guide} § Refund rules`, readChars: 8_192, totalChars: real }]);
	assert.equal(men.completeness.complete, false);
	assert.equal(men.completeness.basisNote, DOC_INDEX_RULE);

	// manifests.locate reads a manifest's kind from its stored body.
	const manifest = `apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: big\ndata:\n${Array.from({ length: 900 }, (_, i) => `  key${i}: "value-${i}"`).join('\n')}\n`;
	assert.ok(manifest.length > 8_192);
	await index('k8s/big-config.yaml', manifest);
	await index('k8s/small.yaml', 'apiVersion: v1\nkind: Service\nmetadata:\n  name: small\n');
	const man = await runManifestsLocate(exp('manifests.locate', {}), ctx);
	assert.equal(man.hits.length, 2);
	assert.deepEqual(man.completeness.partlyRead, [{ what: join(REPO, 'k8s/big-config.yaml'), readChars: 8_192, totalChars: manifest.length }]);
});

// ---------------------------------------------------------------------------
// module.profile's 4,096-character scan
// ---------------------------------------------------------------------------

test('module.profile reports each file it cut with the kept and full lengths', async () => {
	// A file whose content the index stores (as some file entities do), longer
	// than the scan, with no entry-point marker in the part that is scanned.
	const write = async (rel: string, source: string, storedBody: string): Promise<void> => {
		const file = join(REPO, rel);
		mkdirSync(dirname(file), { recursive: true });
		writeFileSync(file, source);
		const e: Entity = {
			id: makeEntityId(REPO, file, 'file', file), kind: 'file', name: rel, language: 'python', repoId: 1, repo: REPO, file,
			startLine: 1, endLine: source.split('\n').length, body: storedBody, embedding: [], indexedAt: NOW,
			hash: indexerFileHash(source),
		};
		await upsertEntities(await getDb(), [e]);
	};
	const long = `${'# padding line\n'.repeat(400)}if __name__ == "__main__":\n    run()\n`;
	assert.ok(long.length > 4_096);
	await write('svc/late_main.py', long, long);                       // the marker lies past the scan
	const early = `if __name__ == "__main__":\n    run()\n${'# padding line\n'.repeat(400)}`;
	await write('svc/early_main.py', early, early);                    // the marker is found: the cut did not matter
	await write('svc/short.py', 'x = 1\n', 'x = 1\n');                 // shorter than the scan
	await write('svc/unstored.py', long, '');                          // the index stores no content, as for a source file

	const out = await runModuleProfile(exp('module.profile', { path: join(REPO, 'svc') }), ctx);
	assert.deepEqual(out.profile.entrypoints, [join(REPO, 'svc/early_main.py')], 'the scan still reads 4,096 characters and no more');
	assert.deepEqual(out.completeness.partlyRead, [{ what: join(REPO, 'svc/late_main.py'), readChars: 4_096, totalChars: long.length }]);
	assert.equal(out.completeness.complete, false);
	assert.equal(out.completeness.basis, 'filesystem');
	// What the list rests on is stated: a file with no stored content is recognised by name only.
	assert.match(out.completeness.basisNote ?? '', /the index stores no content for a source file itself/);

	// The single-file form makes the same report.
	const one = await runModuleProfile(exp('module.profile', { path: join(REPO, 'svc/late_main.py') }), ctx);
	assert.deepEqual(one.completeness.partlyRead, [{ what: join(REPO, 'svc/late_main.py'), readChars: 4_096, totalChars: long.length }]);
	const found = await runModuleProfile(exp('module.profile', { path: join(REPO, 'svc/early_main.py') }), ctx);
	assert.equal(found.completeness.partlyRead, undefined);
	assert.equal(found.completeness.complete, true);
});

// ---------------------------------------------------------------------------
// prepare -> finalize
// ---------------------------------------------------------------------------

test('each of the three lookups that pause for a model call builds its record in finalize from the facts prepare carried, and a prepared value without them is not established', async () => {
	const db = await getDb();
	const notCarried = (c: Completeness): void => {
		assert.equal(c.complete, false);
		assert.match(c.basisNote ?? '', /was not carried from its first step, so its completeness is not established/);
		assert.equal(c.partlyRead, undefined);
	};

	// doc.constraint.enumerate
	const cprep = await prepareDocConstraintEnumerate({ subject: 'refund', repoPath: REPO, db });
	if (cprep.kind !== 'narrow-llm') throw new Error('unreachable');
	const craw = { subject: 'refund', notFoundNote: '', constraints: [] };
	const carried: readonly PartlyReadItem[] = cprep.prepared.completenessFacts!.partlyRead!;
	assert.equal(carried.length, 1);
	assert.deepEqual(finalizeDocConstraintEnumerate(cprep.prepared, craw).completeness.partlyRead, carried);
	// A value minted before the field existed, as an in-flight step state would hold.
	const { completenessFacts: _c, ...oldC } = cprep.prepared;
	void _c;
	notCarried(finalizeDocConstraintEnumerate(oldC, craw).completeness);

	// doc.decision.trace
	const dprep = await prepareDocDecisionTrace({ topic: 'refund', repoPath: REPO, db });
	if (dprep.kind !== 'narrow-llm') throw new Error('unreachable');
	const draw = { topic: 'refund', notFoundNote: '', decisions: [] } as Parameters<typeof finalizeDocDecisionTrace>[1];
	assert.deepEqual(finalizeDocDecisionTrace(dprep.prepared, draw).completeness.partlyRead, dprep.prepared.completenessFacts!.partlyRead);
	const { completenessFacts: _d, ...oldD } = dprep.prepared;
	void _d;
	notCarried(finalizeDocDecisionTrace(oldD, draw).completeness);

	// capability.reuse-check carries the same field (its record is asserted in the table test):
	// a value without it is not established either.
	const { finalizeCapabilityReuseCheck } = await import('../capability-reuse-check.js');
	const old = { capability: 'pay', profiles: [], conceptHits: 0 };
	notCarried(finalizeCapabilityReuseCheck(old, { verdicts: [] } as Parameters<typeof finalizeCapabilityReuseCheck>[1], undefined).completeness);
	const withFacts = finalizeCapabilityReuseCheck(
		{ ...old, completenessFacts: { partlyRead: [{ what: 'm', readChars: 1, totalChars: 9 }] } },
		{ verdicts: [] } as Parameters<typeof finalizeCapabilityReuseCheck>[1], undefined,
	).completeness;
	assert.deepEqual(withFacts.partlyRead, [{ what: 'm', readChars: 1, totalChars: 9 }]);
});

// ---------------------------------------------------------------------------
// The measurer the lookups share
// ---------------------------------------------------------------------------

test('the measurer finds the file\'s recorded hash in the graph, and reports an item only when something shows it is longer', async () => {
	const m = createItemMeasurer(await getDb());
	const big = section('Refund rules');
	const short = section('Refund short');

	// The hash comes from the file entity the indexer stamped; without it no length would be established.
	assert.equal((await m.measure(big)).totalChars, lines(GUIDE, big).length);
	assert.equal((await m.measure(short)).totalChars, short.body.length);

	assert.equal(await m.partlyRead('short', short, short.body.length), undefined, 'the whole item was read');
	assert.deepEqual(await m.partlyRead('short', short, 10), { what: 'short', readChars: 10, totalChars: short.body.length });
	assert.equal((await m.partlyRead('big', big, 8_192))?.totalChars, lines(GUIDE, big).length);

	// An entity of a file the graph has no file entity for: no hash, so no length.
	const orphan: Entity = { ...short, file: join(REPO, 'docs/unknown.md') };
	writeFileSync(orphan.file, 'x');
	assert.equal((await m.measure(orphan)).reason, 'no hash was recorded for the file when it was indexed');
	assert.equal(await m.partlyRead('orphan', orphan, short.body.length), undefined, 'read in full as far as anything shows');
});
