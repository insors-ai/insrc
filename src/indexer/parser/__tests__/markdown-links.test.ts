/**
 * Epic c2ba6fa6, Story s10, t2 -- the markdown link reader. ArtifactParser
 * reads the links and file references a document writes into REFERENCES
 * relations with evidence 'extracted', attributed to the section, document or
 * file entity holding them, without touching the file system or a model.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/markdown-links.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { join } from 'node:path';

import '../typescript.js';   // registers the TypeScript reader, so `.ts` names are handled
import { artifactParser } from '../artifact.js';
import { makeEntityId } from '../base.js';
import type { Relation } from '../../../shared/types.js';

const REPO = '/repo';
const at = (rel: string): string => join(REPO, rel);
const fileId = (rel: string): string => makeEntityId(REPO, at(rel), 'file', at(rel));
const parse = (rel: string, text: string) => artifactParser.parse(at(rel), text, REPO, 1);
const refs = (rel: string, text: string): Relation[] => parse(rel, text).relations.filter(r => r.kind === 'REFERENCES');
const pathTargets = (rs: Relation[]): string[] => rs.filter(r => r.meta?.['nameRef'] === undefined).map(r => r.meta?.['linkTarget'] as string).sort();

test("s10 t2: link destinations resolve against the document's directory and mentions against the repository root", () => {
	const text = [
		'# Guide',
		'',
		'See [b](b.md), [nested](docs/b.md#part), [root](/docs/b.md) and [up](../../src/x.ts#L10).',
		'[ref]: c.md',
		'Also `docs/b.md`, `./b.md`, src/y.ts:42 and ../../src/z.ts.',
	].join('\n');
	assert.deepEqual(pathTargets(refs('docs/guide/a.md', text)), [
		at('docs/b.md'),          // '/docs/b.md' link and the `docs/b.md` mention
		at('docs/guide/b.md'),    // 'b.md' link and the `./b.md` mention
		at('docs/guide/c.md'),    // reference-style definition
		at('docs/guide/docs/b.md'),
		at('src/x.ts'),
		at('src/y.ts'),           // mention with a :line suffix
		at('src/z.ts'),           // ../ mention against the directory
	]);
	const byTarget = new Map(refs('docs/guide/a.md', text).map(r => [r.meta?.['linkTarget'], r]));
	assert.equal(byTarget.get(at('docs/b.md'))!.to, fileId('docs/b.md'), "the target is the cited file's file-entity id");
	assert.equal(byTarget.get(at('docs/b.md'))!.resolved, false);
	assert.equal(byTarget.get(at('docs/b.md'))!.meta?.['awaitsId'], true);
	assert.equal(byTarget.get(at('docs/b.md'))!.meta?.['targetFile'], undefined, 'no targetFile, so the file-target classifier leaves it');
	// Outside the repository, and names no parser reads, are not read.
	assert.deepEqual(refs('docs/a.md', 'See [out](../../etc/passwd.md), [img](pic.png) and `notes/todo`.\n'), []);
});

test('s10 t2: preamble and skipped-section links attribute to the file entity; fenced code, URLs and mailto are not read', () => {
	const text = [
		'Intro links [p](p.md).',        // preamble: before the first heading
		'',
		'# Kept',
		'Body with [k](k.md).',
		'',
		'## Tiny',                        // a heading with no content: skipped
		'# Next',
		'Text [n](n.md).',
		'```',
		'[fenced](f.md) `src/fenced.ts`',
		'```',
		'',
		'    [indented](i.md)',
		'',
		'Visit [web](https://example.com/w.md), [mail](mailto:a@b.md), [anchor](#kept), <https://x.io/y.md>.',
	].join('\n');
	const result = parse('docs/a.md', text);
	const file = result.entities.find(e => e.kind === 'file')!;
	const kept = result.entities.find(e => e.kind === 'section' && e.name === 'Kept')!;
	const next = result.entities.find(e => e.kind === 'section' && e.name === 'Next')!;
	const from = new Map(result.relations.filter(r => r.kind === 'REFERENCES').map(r => [r.meta?.['linkTarget'], r.from]));
	assert.deepEqual([...from.keys()].sort(), [at('docs/k.md'), at('docs/n.md'), at('docs/p.md')], 'fenced, indented, URL, mailto and anchor links are not read');
	assert.equal(from.get(at('docs/p.md')), file.id, 'the preamble link is attributed to the file entity');
	assert.equal(from.get(at('docs/k.md')), kept.id);
	assert.equal(from.get(at('docs/n.md')), next.id);

	// A link in a skipped tiny section (a heading line with no content of its own) goes to the file entity.
	const tiny = parse('docs/t.md', '# Real\nText.\n\n## Tiny [t](t2.md)\n# Other\nMore.\n');
	const tinyFile = tiny.entities.find(e => e.kind === 'file')!;
	assert.equal(tiny.relations.find(r => r.meta?.['linkTarget'] === at('docs/t2.md'))!.from, tinyFile.id);

	// A fence closes only on a line holding nothing but the fence: an info-string line inside does not close it.
	const fenced = refs('docs/f.md', '# F\nText.\n```markdown\n```not-a-close\n[hidden](hidden.md)\n```\n[after](after.md)\n');
	assert.deepEqual(pathTargets(fenced), [at('docs/after.md')], 'the link inside the still-open fence is not read');
	const tildes = refs('docs/g.md', '# G\nText.\n~~~~\n~~~\n[hidden](hidden.md)\n~~~~\n[after](after.md)\n');
	assert.deepEqual(pathTargets(tildes), [at('docs/after.md')], 'a shorter fence does not close a longer one');

	// A document with no headings attributes to its whole-file document entity.
	const flat = parse('docs/flat.md', 'Just [x](x.md).\n');
	const flatDoc = flat.entities.find(e => e.kind === 'document')!;
	assert.equal(flat.relations.find(r => r.kind === 'REFERENCES')!.from, flatDoc.id);
});

test("s10 t2: one REFERENCES per (source, target) with evidence 'extracted'; no self links", () => {
	const text = '# One\n[b](b.md) and again [b](b.md) and `docs/b.md` and [me](a.md).\n# Two\nAlso [b](b.md).\n';
	const rs = refs('docs/a.md', text);
	assert.equal(rs.length, 2, 'one per section for docs/b.md; the self link is not written');
	assert.ok(rs.every(r => r.evidence === 'extracted' && r.to === fileId('docs/b.md')));
	assert.equal(new Set(rs.map(r => r.from)).size, 2);
});

test('s10 t2: a bare file name yields a pending name reference', () => {
	const rs = refs('docs/a.md', '# A\nRead README.md first, then `queue.ts`; ignore e.g. and v1.2 and photo.png.\n');
	const names = rs.map(r => ({ to: r.to, resolved: r.resolved, nameRef: r.meta?.['nameRef'], awaitsId: r.meta?.['awaitsId'], evidence: r.evidence }));
	assert.deepEqual(names.sort((a, b) => String(a.to).localeCompare(String(b.to))), [
		{ to: 'queue.ts', resolved: false, nameRef: 'queue.ts', awaitsId: undefined, evidence: 'extracted' },
		{ to: 'README.md', resolved: false, nameRef: 'README.md', awaitsId: undefined, evidence: 'extracted' },
	]);

	// The reader reads only the text: no file system call is made.
	const calls: string[] = [];
	const originals = { existsSync: fs.existsSync, statSync: fs.statSync, readFileSync: fs.readFileSync };
	fs.existsSync = ((p: string) => { calls.push(String(p)); return false; }) as typeof fs.existsSync;
	fs.statSync = ((p: string) => { calls.push(String(p)); throw new Error('no fs'); }) as typeof fs.statSync;
	fs.readFileSync = ((p: string) => { calls.push(String(p)); throw new Error('no fs'); }) as typeof fs.readFileSync;
	try {
		assert.equal(refs('docs/a.md', '# A\n[b](b.md) `src/x.ts` README.md\n').length, 3);
	} finally {
		Object.assign(fs, originals);
	}
	assert.deepEqual(calls, []);
});
