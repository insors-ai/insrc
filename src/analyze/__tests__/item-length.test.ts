/**
 * measureItem: an item's full length comes from its file at the entity's
 * pointer, never from the stored body (LLD-b9d5c5c40df5a574-s1, task t2).
 *
 * The entities are produced by the REAL artifact parser from a real file in a
 * temporary directory, so the indexer's cut, its marker and its line ranges
 * are the ones production stores.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { artifactParser } from '../../indexer/parser/artifact.js';
import type { Entity } from '../../shared/types.js';
import { INDEXER_CUT_MARKER, indexerFileHash, measureItem, partlyReadEntry } from '../item-length.js';
import { SUMMARISER_BODY_CHARS, _buildMessagesForTest } from '../summariser/driver.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const BIG_SECTION = `## Big\n\n${'x'.repeat(100_000)}\n`;
const SMALL_SECTION = '## Small\n\nA short section.\nTwo lines of text.\n';
const DOC = `# Title\n\nIntro line one.\nIntro line two.\n\n${BIG_SECTION}\n${SMALL_SECTION}`;

interface Indexed { dir: string; file: string; hash: string; entities: Entity[] }

/** Write a document and index it through the real parser, as the indexer does. */
function indexDoc(source: string = DOC): Indexed {
	const dir  = mkdtempSync(join(tmpdir(), 'insrc-item-length-'));
	const file = join(dir, 'guide.md');
	writeFileSync(file, source);
	const { entities } = artifactParser.parse(file, source, dir, 1);
	return { dir, file, hash: indexerFileHash(source), entities };
}

function byName(ix: Indexed, kind: string, name?: string): Entity {
	const e = ix.entities.find(x => x.kind === kind && (name === undefined || x.name === name));
	assert.ok(e, `the parser produced a ${kind}${name !== undefined ? ` named ${name}` : ''}`);
	return e;
}

test('measureItem returns the file\'s length for a document and the length of its lines for a section, and says when the indexer cut the stored body', () => {
	const ix = indexDoc();
	try {
		// The fixture is what the design describes: the indexer cut the long section at 8,192 and marked it.
		const big = byName(ix, 'section', 'Big');
		assert.ok(big.body.endsWith(INDEXER_CUT_MARKER), 'the real parser appended the marker this module names');
		assert.equal(big.body.length, 8_192 + INDEXER_CUT_MARKER.length);

		const m = measureItem(big, { recordedFileHash: ix.hash });
		const lines = DOC.split('\n').slice(big.startLine - 1, big.endLine).join('\n');
		assert.ok(lines.startsWith('## Big') && lines.length > 100_000);
		assert.equal(m.totalChars, lines.length, 'the real length of the section, not the stored 8,192');
		assert.equal(m.storedChars, 8_192, 'the marker line is not counted as content');
		assert.equal(m.cutByIndexer, true);
		assert.equal(m.reason, undefined);

		// A section the indexer did not cut: its stored body IS its lines.
		const small = byName(ix, 'section', 'Small');
		assert.equal(small.body.endsWith(INDEXER_CUT_MARKER), false);
		const ms = measureItem(small, { recordedFileHash: ix.hash });
		assert.equal(ms.totalChars, small.body.length);
		assert.equal(ms.cutByIndexer, false);

		// A whole-file entity is measured as the file, whatever its line range says.
		const doc: Entity = { ...big, kind: 'document', startLine: 1, endLine: 2, body: DOC.slice(0, 8_192) + INDEXER_CUT_MARKER };
		const md = measureItem(doc, { recordedFileHash: ix.hash });
		assert.equal(md.totalChars, DOC.length);
		assert.equal(md.cutByIndexer, true);

		// The artifact parser's file entity stores no body: nothing stored is not a cut.
		const fileEntity = byName(ix, 'file');
		assert.equal(fileEntity.body, '');
		const mf = measureItem(fileEntity, { recordedFileHash: ix.hash });
		assert.equal(mf.totalChars, DOC.length);
		assert.equal(mf.cutByIndexer, false);

		// A stored body shorter than the item is a cut even without the marker.
		const unmarked: Entity = { ...big, body: big.body.slice(0, 500) };
		assert.equal(measureItem(unmarked, { recordedFileHash: ix.hash }).cutByIndexer, true);

		assert.deepEqual(partlyReadEntry('guide.md § Big', 2_000, m), {
			what: 'guide.md § Big', readChars: 2_000, totalChars: lines.length,
		});
	} finally {
		rmSync(ix.dir, { recursive: true, force: true });
	}
});

test('measureItem does not establish a length for a changed or a missing file (mutation: skip the hash comparison)', () => {
	const ix = indexDoc();
	try {
		const big = byName(ix, 'section', 'Big');

		// The file is edited after indexing: the entity's lines now hold other text.
		writeFileSync(ix.file, `# Title\n\nA new paragraph pushed everything down.\n\n${DOC}`);
		const changed = measureItem(big, { recordedFileHash: ix.hash });
		assert.equal(changed.totalChars, null, 'a length measured on shifted lines would be wrong, so none is given');
		assert.equal(changed.reason, 'the file changed since it was indexed');
		assert.equal(changed.storedChars, 8_192);
		assert.equal(changed.cutByIndexer, true, 'the marker still shows the stored body was cut');
		assert.deepEqual(partlyReadEntry('guide.md § Big', 2_000, changed), {
			what: 'guide.md § Big', readChars: 2_000, totalChars: null, totalNote: 'the file changed since it was indexed',
		});

		// No hash was recorded at indexing: the file cannot be shown to be the indexed one.
		writeFileSync(ix.file, DOC);
		assert.equal(measureItem(big, { recordedFileHash: ix.hash }).reason, undefined, 'restored content is established again');
		const noHash = measureItem(big, { recordedFileHash: undefined });
		assert.equal(noHash.totalChars, null);
		assert.equal(noHash.reason, 'no hash was recorded for the file when it was indexed');

		// The file is removed.
		rmSync(ix.file);
		const gone = measureItem(big, { recordedFileHash: ix.hash });
		assert.equal(gone.totalChars, null);
		assert.equal(gone.reason, 'the file no longer exists');

		// Any other read failure is reported with its cause, not thrown.
		const denied = measureItem(big, {
			recordedFileHash: ix.hash,
			readFile: () => { throw Object.assign(new Error('permission denied'), { code: 'EACCES' }); },
		});
		assert.equal(denied.totalChars, null);
		assert.equal(denied.reason, 'the file could not be read (EACCES)');
	} finally {
		rmSync(ix.dir, { recursive: true, force: true });
	}
});

test('indexerFileHash is the hash the indexer records on a file entity', () => {
	// The indexer's function is private; this module repeats it. If the indexer's
	// changes, every measure would read "changed since it was indexed".
	const src = readFileSync(join(REPO_ROOT, 'src/indexer/index.ts'), 'utf8');
	assert.match(
		src,
		/function contentHash\(source: string\): string \{\s*return createHash\('sha256'\)\.update\(source\)\.digest\('hex'\)\.slice\(0, 16\);\s*\}/,
	);
	assert.match(src, /if \(fileEntity\) fileEntity\.hash = hash;/);
	assert.equal(indexerFileHash('abc'), 'ba7816bf8f01cfea');
});

test('the summariser reads its cut from the exported constant and no file under src/indexer or src/db changes', () => {
	assert.equal(SUMMARISER_BODY_CHARS, 8_192);

	// Behaviour unchanged: the model is given exactly the first 8,192 characters of the stored body.
	const body = 'a'.repeat(8_192) + 'ZZZ-past-the-cut' + 'b'.repeat(10_000);
	const entity = { kind: 'document', file: '/r/docs/a.md', body } as unknown as Entity;
	const messages = _buildMessagesForTest({ promptContent: 'SYSTEM', entity, family: 'docs', identifierHints: [] });
	const user = messages.find(m => m.role === 'user')?.content;
	assert.equal(typeof user, 'string');
	assert.ok((user as string).includes('a'.repeat(8_192) + '\n```'), 'the first 8,192 characters, then the closing fence');
	assert.equal((user as string).includes('ZZZ-past-the-cut'), false);

	// Measuring stores nothing: the module can only read a file. It imports no
	// store and no indexer code, and nothing that writes.
	const src = readFileSync(join(REPO_ROOT, 'src/analyze/item-length.ts'), 'utf8');
	const imports = [...src.matchAll(/^import (?:type )?\{([^}]*)\} from '([^']+)';$/gm)].map(m => `${m[2]}:${m[1]!.trim()}`);
	assert.deepEqual(imports, [
		'node:crypto:createHash',
		'node:fs:readFileSync',
		'../shared/types.js:Entity',
		'./completeness.js:PartlyReadItem',
	]);
	assert.equal(/^import /gm.exec(src) !== null && src.match(/^import /gm)!.length, 4, 'no other import form');
});
