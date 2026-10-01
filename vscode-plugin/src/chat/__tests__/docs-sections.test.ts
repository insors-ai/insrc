/**
 * Epic build-vs-code-plugin-ui-integration, Story S001 / t3 — sc3 unit tests.
 *
 * deriveSectionIndex is pure, so these run headlessly with no DOM, no vscode and
 * no fixture. The load-bearing test is ONE IDENTITY: the slug the deriver emits
 * for a heading must be the very string the resolver returns for it, because
 * that is what keeps body navigation (s1) and companion placement (s3/s4) from
 * drifting apart.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/docs-sections.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { deriveSectionIndex, createSectionResolver } from '../docs-sections.js';

test('t3: deriveSectionIndex returns anchors in DOCUMENT ORDER with level set to the ATX depth', () => {
	const md = [
		'# Plan',
		'',
		'intro prose',
		'',
		'## 1. Tasks',
		'### 1.1 First task',
		'#### Deeper',
		'##### Deeper still',
		'###### Deepest',
		'## 2. Coverage',
	].join('\n');

	const { anchors } = deriveSectionIndex(md);
	assert.deepEqual(
		anchors.map((a) => [a.title, a.level]),
		[
			['Plan', 1],
			['1. Tasks', 2],
			['1.1 First task', 3],
			['Deeper', 4],
			['Deeper still', 5],
			['Deepest', 6],
			['2. Coverage', 2],
		],
		'document order preserved and level = ATX depth (so a chooser needs no sorting)',
	);
	// title is the heading text VERBATIM — the '#' and the separating space only.
	assert.equal(anchors[1]!.title, '1. Tasks');
});

test('t3: two identically-titled headings get DISTINCT slugs via an appended ordinal and NEITHER is dropped', () => {
	const md = ['## Notes', '## Notes', '## Notes'].join('\n');
	const { anchors } = deriveSectionIndex(md);

	assert.equal(anchors.length, 3, 'no entry is dropped — every heading stays reachable');
	assert.deepEqual(anchors.map((a) => a.slug), ['notes', 'notes-2', 'notes-3']);
	assert.equal(new Set(anchors.map((a) => a.slug)).size, 3, 'slugs are unique within the document');
	// the titles stay identical; only the slugs disambiguate.
	assert.deepEqual(anchors.map((a) => a.title), ['Notes', 'Notes', 'Notes']);
});

test('t3: a `#` line inside a FENCED CODE BLOCK is not a heading — the phantom-section guard', () => {
	const md = [
		'# Real heading',
		'',
		'```sh',
		'# this is a shell comment, not a heading',
		'## neither is this',
		'```',
		'',
		'~~~md',
		'# nor this one, in a tilde fence',
		'~~~',
		'',
		'## Second real heading',
	].join('\n');

	const { anchors } = deriveSectionIndex(md);
	assert.deepEqual(anchors.map((a) => a.title), ['Real heading', 'Second real heading']);
});

test('t3: a fence is not closed by a DIFFERENT delimiter or a shorter run', () => {
	// A ``` inside a ~~~ block must not end it, and a shorter run must not either —
	// otherwise the guard leaks and the lines after it become phantom sections.
	const md = [
		'~~~',
		'# hidden one',
		'```',
		'# hidden two',
		'~~~',
		'## visible',
	].join('\n');
	assert.deepEqual(deriveSectionIndex(md).anchors.map((a) => a.title), ['visible']);

	const md2 = ['````', '# hidden', '```', '# still hidden', '````', '## visible'].join('\n');
	assert.deepEqual(deriveSectionIndex(md2).anchors.map((a) => a.title), ['visible']);
});

test('t3: markdown with NO headings yields an empty anchors array', () => {
	const md = 'just prose\n\n- a list item\n\n> a quote\n';
	assert.deepEqual(deriveSectionIndex(md).anchors, [], 'empty, so t6 omits the chooser entirely');
});

test('t3: an EMPTY-STRING body yields an empty anchors array', () => {
	assert.deepEqual(deriveSectionIndex('').anchors, []);
});

test('t3: a PUNCTUATION-ONLY heading still yields a stable NON-EMPTY slug', () => {
	const md = ['# ???', '## !!!', '### ...'].join('\n');
	const { anchors } = deriveSectionIndex(md);

	assert.equal(anchors.length, 3);
	for (const a of anchors) {
		assert.ok(a.slug.length > 0, `a punctuation-only heading needs a usable anchor target, got '${a.slug}'`);
	}
	assert.equal(new Set(anchors.map((a) => a.slug)).size, 3, 'and they must not collide with each other');
	// stable across calls, not random — a stored ofSectionId must keep resolving.
	assert.deepEqual(deriveSectionIndex(md).anchors.map((a) => a.slug), anchors.map((a) => a.slug));
});

test('t3: deriveSectionIndex is DETERMINISTIC across repeated calls on the same markdown', () => {
	const md = [
		'# Doc',
		'## Notes',
		'## Notes',
		'### ***',
		'```',
		'# not a heading',
		'```',
		'## Done',
	].join('\n');

	const first = deriveSectionIndex(md);
	for (let i = 0; i < 5; i++) {
		assert.deepEqual(deriveSectionIndex(md), first, 'same input, identical slugs every time');
	}
});

test('t3: a SectionResolver resolves a known ofSectionId to that section\'s slug', () => {
	const index = deriveSectionIndex(['# Plan', '## Test-strategy coverage'].join('\n'));
	const resolve = createSectionResolver(index);

	assert.equal(resolve('test-strategy-coverage'), 'test-strategy-coverage');
	// and an ofSectionId authored as the heading TEXT resolves to the same slug,
	// never to a second parallel identity.
	assert.equal(resolve('Test-strategy coverage'), 'test-strategy-coverage');
	assert.equal(resolve('plan'), 'plan');
});

test('t3: a SectionResolver returns undefined rather than THROWING for an unknown ofSectionId', () => {
	const resolve = createSectionResolver(deriveSectionIndex('# Plan'));
	for (const bad of ['no-such-section', '', 'Plan!!!extra', undefined]) {
		// A stale companion reference must degrade to unanchored, not crash the render.
		assert.doesNotThrow(() => resolve(bad));
	}
	assert.equal(resolve('no-such-section'), undefined);
	assert.equal(resolve(undefined), undefined);
	assert.equal(resolve(''), undefined);
	// an empty index resolves nothing and still does not throw.
	const none = createSectionResolver(deriveSectionIndex(''));
	assert.equal(none('anything'), undefined);
});

test('t3: ONE IDENTITY — the slug deriveSectionIndex emits EQUALS the string the resolver returns for the same section', () => {
	const md = [
		'# Low-level design',
		'## Contract details',
		'## Contract details',          // duplicate: the ordinal must survive the round-trip
		'### ???',                       // punctuation-only: the fallback must round-trip too
		'## Migration',
	].join('\n');

	const index = deriveSectionIndex(md);
	const resolve = createSectionResolver(index);

	assert.ok(index.anchors.length > 0);
	for (const a of index.anchors) {
		// This is the invariant the whole contract rests on: the body stamps `a.slug`
		// and a companion's ofSectionId resolves to that SAME string, so navigation
		// and companion placement can never point at different things.
		assert.equal(resolve(a.slug), a.slug, `resolver must return the emitted slug for '${a.title}'`);
	}
});

test('t3: module purity — the sc3 module is vscode-free and imports no DOM type', () => {
	const here = dirname(fileURLToPath(import.meta.url));
	const src = readFileSync(join(here, '..', 'docs-sections.ts'), 'utf8');
	// Scan CODE, not prose: the doc comments legitimately discuss "the rendered
	// document" and HTMLElement, so asserting over the raw file would fail on its
	// own commentary while proving nothing about what the module actually does.
	const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

	assert.doesNotMatch(code, /from ['"]vscode['"]/, 'imports nothing from vscode');
	assert.doesNotMatch(code, /require\(['"]vscode['"]\)/, 'has no vscode require');
	// Pure by construction: no DOM type, no DOM global, no IO.
	assert.doesNotMatch(code, /\bHTMLElement\b|\bHTMLDocument\b|\bElement\b/, 'names no DOM type');
	assert.doesNotMatch(code, /\bdocument\s*\.|\bwindow\s*\./, 'touches no DOM global');
	assert.doesNotMatch(code, /from ['"]node:/, 'imports no node builtin — performs no IO');
	// and it imports NOTHING at all, which is the strongest form of the claim.
	assert.doesNotMatch(code, /^\s*import\s/m, 'the sc3 module has no imports whatsoever');
});
