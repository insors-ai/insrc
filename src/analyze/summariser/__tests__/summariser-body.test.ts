/**
 * The summariser is given a document whole (LLD-b9d5c5c40df5a574-s4, task t7).
 *
 * The document is a real file in a temporary repository, indexed through the
 * real artifact parser and stamped with the file hash as the indexer does, so
 * the stored body carries the indexer's own 8,192-character cut. The model is
 * a stand-in that records what it was shown.
 *
 * Run: npx tsx --test src/analyze/summariser/__tests__/summariser-body.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { getDb } from '../../../db/client.js';
import { upsertEntities } from '../../../db/entities.js';
import { closeGraphStore, setGraphStorePath } from '../../../db/graph/store.js';
import { useTemporaryLance } from '../../../db/lance/__tests__/helpers/temp-lance.js';
import { addRepo } from '../../../db/repos.js';
import { artifactParser } from '../../../indexer/parser/artifact.js';
import type { Entity, LLMMessage, LLMProvider } from '../../../shared/types.js';
import { INDEXER_CUT_MARKER, indexerFileHash } from '../../item-length.js';
import { summariseDoc } from '../driver.js';

useTemporaryLance();

const NOW = '2026-10-08T10:00:00.000Z';
const REPLY = {
	title: 'Design', family: 'design', kind: 'design', subjects: ['queue'], summary: 'Two lanes.',
	keyDecisions: [], keyConstraints: [], relatedEntities: [], status: 'current',
};

let dir: string;
let REPO: string;
let shown: string[] = [];

const model = {
	async completeStructured(messages: readonly LLMMessage[]) {
		shown.push(messages.map(m => String(m.content)).join('\n'));
		return REPLY;
	},
} as unknown as LLMProvider;

async function index(rel: string, source: string): Promise<Entity> {
	const file = join(REPO, rel);
	mkdirSync(dirname(file), { recursive: true });
	writeFileSync(file, source);
	const { entities } = artifactParser.parse(file, source, REPO, 1);
	const fileEntity = entities.find(e => e.kind === 'file' && e.file === file);
	assert.ok(fileEntity);
	fileEntity.hash = indexerFileHash(source);
	await upsertEntities(await getDb(), entities);
	const doc = entities.find(e => e.kind === 'section') ?? entities.find(e => e.kind === 'document');
	assert.ok(doc);
	return doc;
}

test.beforeEach(async () => {
	await closeGraphStore();
	shown = [];
	dir = realpathSync(mkdtempSync(join(tmpdir(), 'insrc-summariser-body-')));
	REPO = join(dir, 'repo');
	mkdirSync(REPO);
	setGraphStorePath(join(dir, 'graph.lmdb'));
	await addRepo(null, { path: REPO, name: '', addedAt: NOW, status: 'pending' });
});

test.afterEach(async () => {
	await closeGraphStore();
	rmSync(dir, { recursive: true, force: true });
});

test('a document over 8192 characters is summarised from its whole content', async () => {
	const source = `# Design\n\nThe queue has two lanes.\n${'More about the lanes. '.repeat(1_500)}\nEND-OF-DESIGN\n`;
	assert.ok(source.length > 8_192);
	const doc = await index('docs/design.md', source);
	assert.ok(doc.body.endsWith(INDEXER_CUT_MARKER), 'the indexer stored only the first 8,192 characters');
	assert.equal(doc.body.includes('END-OF-DESIGN'), false);

	const result = await summariseDoc({ db: await getDb(), entity: doc, provider: model });
	assert.equal(result.ok, true);
	assert.ok(shown.at(-1)!.includes('END-OF-DESIGN'), 'the model is shown the end of the document, past the stored body');
	assert.ok(shown.at(-1)!.includes(source.split('\n').slice(doc.startLine - 1, doc.endLine).join('\n')), 'the whole content is in the prompt');

	// A document whose file changed since it was indexed cannot be confirmed: the model is shown the stored body.
	const doc2 = await index('docs/other.md', source);
	writeFileSync(join(REPO, 'docs/other.md'), `${source}\nAPPENDED-LATER\n`);
	await summariseDoc({ db: await getDb(), entity: doc2, provider: model });
	assert.equal(shown.at(-1)!.includes('APPENDED-LATER'), false);
	assert.equal(shown.at(-1)!.includes('END-OF-DESIGN'), false, 'the stored body, not the file, was used');

	// The indexer's own limit and the stored body are unchanged.
	assert.match(readFileSync(join(process.cwd(), 'src/indexer/parser/artifact.ts'), 'utf8'), /const MAX_BODY = 8192;/);
});
