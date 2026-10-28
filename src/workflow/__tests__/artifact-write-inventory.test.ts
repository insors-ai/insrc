/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The bypass test (sc3): no production file writes an artifact, or passes a
 * writer on, without an entry in ARTIFACT_WRITE_INVENTORY, and the entries say
 * what the design says. Controls prove the detector finds raw, aliased and
 * injected writers.
 *
 * Run: npx tsx --test src/workflow/__tests__/artifact-write-inventory.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { ARTIFACT_WRITE_INVENTORY, checkInventoryEntry, scanWriters, type InventoryEntry } from '../artifact-write-inventory.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

function productionFiles(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) {
			if (name === '__tests__' || name === 'node_modules') continue;
			productionFiles(p, out);
		} else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts')) {
			out.push(relative(ROOT, p));
		}
	}
	return out;
}

const byFile = new Map<string, InventoryEntry>();
for (const e of ARTIFACT_WRITE_INVENTORY) {
	assert.equal(byFile.has(e.file), false, `duplicate inventory entry for ${e.file}`);
	byFile.set(e.file, e);
}
const read = (file: string): string => readFileSync(join(ROOT, file), 'utf8');

test('every writer file is inventoried, annotated and classified as the design says', async () => {
	const files = productionFiles(join(ROOT, 'src'));
	const problems: string[] = [];
	for (const file of files) {
		for (const p of checkInventoryEntry(read(file), byFile.get(file), file)) problems.push(`${file}: ${p}`);
	}
	// an entry for a file that does not exist is also stale
	for (const e of ARTIFACT_WRITE_INVENTORY) if (!files.includes(e.file)) problems.push(`${e.file}: the entry names a file that does not exist`);
	assert.deepEqual(problems, []);

	// the classification is the one the design states
	const classOf = (f: string): string | undefined => byFile.get(f)?.class;
	for (const f of ['src/workflow/questions.ts', 'src/workflow/tracker/refs.ts', 'src/workflow/bugfix/stamp.ts', 'src/workflow/orchestrator.ts']) assert.equal(classOf(f), 'meta-only', f);
	// the review phases persist through persistReview and write no head of their own
	for (const f of ['src/daemon/steps/review-step/phases/findings.ts', 'src/daemon/steps/review-step/phases/verdicts.ts', 'src/workflow/review/run-artifact.ts']) assert.equal(byFile.has(f), false, `${f} needs no entry`);
	for (const f of [
		'src/daemon/steps/workflow-step/phases/synthesize.ts', 'src/daemon/workflow-rpc.ts', 'src/workflow/resolve-comment.ts',
		'src/workflow/runners/build/standalone-record.ts', 'src/workflow/code-review/runner.ts', 'src/workflow/runners/build/test-record.ts', 'src/daemon/steps/code-review-step/handler.ts',
	]) assert.equal(classOf(f), 'content', f);
	for (const f of ['src/workflow/gates.ts', 'src/workflow/review/resolve.ts']) assert.equal(classOf(f), 'mixed', f);
	// an amendment is a head written through the lifecycle service, so its store has no writer of its own
	assert.equal(byFile.has('src/workflow/amendments/store.ts'), false, 'the amendment store needs no entry');
	assert.equal(classOf('src/daemon/steps/workflow-step/resume.ts'), 'migration');
	// feedback is a sidecar line of the FeedbackService: no body writer is left to inventory
	assert.equal(byFile.has('src/workflow/artifacts/provenance/writer.ts'), false, 'the body writer is gone');

	// the code-review step handler injects the runner's revision-minting writer and holds no raw writer
	const handler = read('src/daemon/steps/code-review-step/handler.ts');
	assert.match(handler, /write:\s+writeRecordFile/);
	assert.equal(scanWriters(handler).rawCalls.length, 0, 'the handler has no raw writer of its own');
	assert.equal(classOf('src/daemon/steps/code-review-step/handler.ts'), 'content');
	assert.match(read('src/workflow/code-review/runner.ts'), /write:\s+writeRecordFile/);
});

test('the detector flags raw, aliased and injected writers and accepts the positive controls', async () => {
	const entry = (cls: InventoryEntry['class'], extra: Partial<InventoryEntry> = {}): InventoryEntry => ({ file: 'x.ts', class: cls, via: 'both', note: 'control', ...extra });

	// negative controls: no entry
	const rawJson = "import { writeFileSync } from 'node:fs';\nexport function save(p: string, a: object) { writeFileSync(p, JSON.stringify(a)); }\n";
	assert.match(checkInventoryEntry(rawJson, undefined).join(), /no inventory entry/, 'raw writeFileSync');
	const injected = "import { writeAtomic } from './storage.js';\nexport const DEFAULT_DEPS = {\n\twrite: writeAtomic,\n};\n";
	assert.match(checkInventoryEntry(injected, undefined).join(), /no inventory entry/, "the injected default 'write: writeAtomic'");
	const aliased = "import { writeAtomic } from './storage.js';\nconst w = writeAtomic;\nexport function save(p: string) { w(p, ''); }\n";
	assert.match(checkInventoryEntry(aliased, undefined).join(), /no inventory entry/, "the alias 'const w = writeAtomic'");
	// a raw write through an alias, a renamed import and a namespace import in an already inventoried content file is flagged
	const aliasEntry = { file: 'x.ts', class: 'content', via: 'both' } as InventoryEntry;
	const throughAlias = "import { writeArtifact, writeAtomic } from './storage.js';\nconst w = writeAtomic;\nexport function a(p: string) { writeArtifact(p, {meta:{}}, 'content'); w(p, 'x'); }\n";
	assert.match(checkInventoryEntry(throughAlias, aliasEntry).join(), /raw writeAtomic without a 'raw-write/, 'a call through an alias');
	const renamed = "import { writeArtifact } from './storage.js';\nimport { writeFileSync as save } from 'node:fs';\nexport function a(p: string) { writeArtifact(p, {meta:{}}, 'content'); save(p, 'x'); }\n";
	assert.match(checkInventoryEntry(renamed, aliasEntry).join(), /raw writeFileSync without a 'raw-write/, 'a renamed import');
	const namespaced = "import * as fs from 'node:fs';\nimport { writeArtifact } from './storage.js';\nexport function a(p: string) { writeArtifact(p, {meta:{}}, 'content'); fs.writeFileSync(p, 'x'); }\n";
	assert.match(checkInventoryEntry(namespaced, aliasEntry).join(), /raw writeFileSync without a 'raw-write/, 'a namespace call');
	const annotatedRename = "import { writeArtifact } from './storage.js';\nimport { writeFileSync as save } from 'node:fs';\nexport function a(p: string) { writeArtifact(p, {meta:{}}, 'content');\n// raw-write: markdown\nsave(p, 'x'); }\n";
	assert.deepEqual(checkInventoryEntry(annotatedRename, aliasEntry), [], 'an annotated renamed write is accepted');
	const passed = "import { writeFileSync } from 'node:fs';\nrun(writeFileSync);\n";
	assert.match(checkInventoryEntry(passed, undefined).join(), /no inventory entry/, 'a writer passed as an argument');
	// comments and strings alone do not count
	assert.deepEqual(checkInventoryEntry("// writeAtomic(p, c)\nconst s = 'writeFileSync(x)';\n", undefined), []);

	// an unannotated raw write in a content file is flagged; the annotation fixes it
	const unannotated = "import { writeArtifact, writeAtomic } from './storage.js';\nexport function f(p: string, a: object, md: string) {\n\twriteArtifact(p, a, 'content');\n\twriteAtomic(p + '.md', md);\n}\n";
	assert.match(checkInventoryEntry(unannotated, entry('content')).join(), /without a 'raw-write: <why>' comment/);
	const annotated = unannotated.replace("\twriteAtomic(", "\t// raw-write: markdown render.\n\twriteAtomic(");
	assert.deepEqual(checkInventoryEntry(annotated, entry('content')), []);

	// positive controls: a file that only calls writeArtifact; a markdown-only file with an entry
	const onlyArtifact = "import { writeArtifact } from './storage.js';\nexport function f(p: string, a: object) { writeArtifact(p, a, 'meta-only'); }\n";
	assert.deepEqual(checkInventoryEntry(onlyArtifact, entry('meta-only', { via: 'writeArtifact' })), []);
	const mdOnly = "import { writeAtomic } from './storage.js';\nexport function f(p: string, md: string) { writeAtomic(p, md); }\n";
	assert.deepEqual(checkInventoryEntry(mdOnly, entry('render', { via: 'raw' })), []);
	assert.deepEqual(checkInventoryEntry(injected, entry('record', { via: 'injected' })), [], 'the injected-writer file once it has an entry');

	// a content file that does not call writeArtifact is flagged
	assert.match(checkInventoryEntry(mdOnly, entry('content')).join(), /must call writeArtifact/);
	// an entry that has none of the three is flagged (a stale entry)
	assert.match(checkInventoryEntry("export const x = 1;\n", entry('non-artifact', { via: 'raw' })).join(), /uses none of/);

	// a mixed entry whose site uses the wrong kind is flagged
	const mixedSrc = "import { writeArtifact } from './storage.js';\nexport function approve(p: string, a: object) {\n\twriteArtifact(p, a, 'content');\n}\n";
	const mixed = entry('mixed', { via: 'writeArtifact', sites: [{ fn: 'approve', kind: 'meta-only' }] });
	assert.match(checkInventoryEntry(mixedSrc, mixed).join(), /expected a writeArtifact with kind 'meta-only'/);
	assert.match(checkInventoryEntry(mixedSrc, mixed).join(), /writes with kind 'content', the entry says 'meta-only'/);
	assert.deepEqual(checkInventoryEntry(mixedSrc, entry('mixed', { via: 'writeArtifact', sites: [{ fn: 'approve', kind: 'content' }] })), []);
	assert.match(checkInventoryEntry(mixedSrc, entry('mixed', { via: 'writeArtifact' })).join(), /must name its write sites/);
});

test('the detector reports appendFileSync in every form, an unlisted appendSidecarLine and a store write, and every newly flagged file has an entry', async () => {
	const none = undefined;
	// appendFileSync: raw, aliased, renamed, namespace, injected
	const raw = "import { appendFileSync } from 'node:fs';\nexport function f(p: string) { appendFileSync(p, 'x'); }\n";
	assert.match(checkInventoryEntry(raw, none).join(), /no inventory entry/, 'raw appendFileSync');
	const aliased = "import { appendFileSync } from 'node:fs';\nconst a = appendFileSync;\nexport function f(p: string) { a(p, 'x'); }\n";
	assert.match(checkInventoryEntry(aliased, none).join(), /no inventory entry/, 'aliased appendFileSync');
	const renamed = "import { appendFileSync as add } from 'node:fs';\nexport function f(p: string) { add(p, 'x'); }\n";
	assert.match(checkInventoryEntry(renamed, none).join(), /no inventory entry/, 'renamed appendFileSync');
	const namespaced = "import * as fs from 'node:fs';\nexport function f(p: string) { fs.appendFileSync(p, 'x'); }\n";
	assert.match(checkInventoryEntry(namespaced, none).join(), /no inventory entry/, 'namespace appendFileSync');
	const injected = "import { appendFileSync } from 'node:fs';\nexport const DEPS = { append: appendFileSync };\n";
	assert.match(checkInventoryEntry(injected, none).join(), /no inventory entry/, 'injected appendFileSync');

	// appendSidecarLine without an entry
	const sidecar = "import { appendSidecarLine } from './artifact-core/sidecar.js';\nexport function f(p: string) { appendSidecarLine(p, { artifactId: 'a', entry: 1 }); }\n";
	assert.match(checkInventoryEntry(sidecar, none).join(), /no inventory entry/, 'unlisted appendSidecarLine');

	// a store write in a file with no entry, and the same write once it has one
	const store = "import { ArtifactStore } from './artifact-core/store.js';\nexport async function f(s: ArtifactStore, a: object, by: object) { await s.write(a, by); }\n";
	assert.match(checkInventoryEntry(store, none).join(), /no inventory entry/, 'store write');
	const storeEntry = { file: 'x.ts', class: 'content', via: 'both', note: 'control' } as InventoryEntry;
	assert.deepEqual(checkInventoryEntry(store, storeEntry), [], 'the store mints the revision, so a content file may use it instead of writeArtifact');
	// a .write on a value in a file that does not import the store is not a store write
	assert.deepEqual(checkInventoryEntry("export function f(w: { write(s: string): void }) { w.write('x'); }\n", none), []);

	// an annotated append in a content file is accepted, an unannotated one is flagged
	const content = { file: 'x.ts', class: 'content', via: 'both', note: 'control' } as InventoryEntry;
	const mixedAppend = "import { writeArtifact } from './storage.js';\nimport { appendFileSync } from 'node:fs';\nexport function f(p: string) { writeArtifact(p, {meta:{}}, 'content');\n// raw-write: log\nappendFileSync(p, 'x'); }\n";
	assert.deepEqual(checkInventoryEntry(mixedAppend, content), []);
	assert.match(checkInventoryEntry(mixedAppend.replace('// raw-write: log\n', ''), content).join(), /raw appendFileSync without a 'raw-write/);

	// a store entry must go through prepareArtifactWrite
	const storeEntry2 = { file: 'x.ts', class: 'store', via: 'injected', note: 'control' } as InventoryEntry;
	const goodStore = "import { prepareArtifactWrite, writeAtomic } from './storage.js';\nexport const w = (p: string) => { prepareArtifactWrite(p, {meta:{}}, 'content'); return writeAtomic; };\n";
	assert.deepEqual(checkInventoryEntry(goodStore, storeEntry2), []);
	assert.match(checkInventoryEntry("import { writeAtomic } from './storage.js';\nexport const w = writeAtomic;\n", storeEntry2).join(), /prepareArtifactWrite/);

	// the five existing writers are found exactly as before
	for (const w of ['writeArtifact', 'writeRecordFile', 'writeAtomic', 'writeFileSync', 'renameSync']) {
		const src = `import { ${w} } from './w.js';\nexport function f(p: string) { ${w}(p, 'x'); }\n`;
		assert.deepEqual(scanWriters(src).calls.map(c => c.name), [w], w);
	}

	// every file that now holds an appendFileSync has an entry
	for (const f of [
		'src/daemon/fatal.ts', 'src/daemon/shutdown.ts', 'src/daemon/steps/analyze-step/handler.ts', 'src/daemon/steps/build-step/handler.ts',
		'src/daemon/steps/workflow-step/handler.ts', 'src/daemon/steps/review-step/handler.ts', 'src/config/feedback.ts', 'src/workflow/storage.ts',
	]) {
		assert.ok(byFile.has(f), `${f} has an inventory entry`);
		assert.ok(scanWriters(read(f)).calls.some(c => c.name === 'appendFileSync'), `${f} calls appendFileSync`);
	}
});

test('the lifecycle service file has an entry and a caller of ArtifactStore.update is recognised', async () => {
	const none = undefined;
	// the store's update is a store write too, and inside artifact-core the store is './store.js'
	const update = "import type { ArtifactStore } from './store.js';\nexport async function f(s: ArtifactStore, by: object) { await s.update('x', by, () => undefined); }\n";
	assert.match(checkInventoryEntry(update, none, 'src/workflow/artifact-core/x.ts').join(), /no inventory entry/, 'store update');
	assert.deepEqual(checkInventoryEntry(update, none, 'src/workflow/other/x.ts'), [], "a './store.js' outside artifact-core is another store");
	const metaOnlyEntry = { file: 'src/workflow/artifact-core/x.ts', class: 'meta-only', via: 'injected', note: 'control' } as InventoryEntry;
	assert.deepEqual(checkInventoryEntry(update, metaOnlyEntry), [], 'the store mints the revision, so a meta-only file may use update');
	// the lifecycle service has its entry and really calls update
	assert.equal(byFile.get('src/workflow/artifact-core/lifecycle-service.ts')?.class, 'meta-only');
	assert.ok(scanWriters(read('src/workflow/artifact-core/lifecycle-service.ts'), 'src/workflow/artifact-core/lifecycle-service.ts').storeWrites.length > 0, 'the service calls update');
});

test('the sidecar files, the journal folder and the changed round writers are classified and appendSidecarLine remains the one raw append for history', async () => {
	const classOf = (f: string): string | undefined => byFile.get(f)?.class;
	// the durable history and journal writers are not artifact heads
	for (const f of ['src/workflow/artifact-core/sidecar.ts', 'src/workflow/artifact-core/sidecar-store.ts', 'src/workflow/artifact-core/journal.ts']) assert.equal(classOf(f), 'non-artifact', f);
	// the round writers that now store through the service are still content writers (the raw refresh of their json is content)
	for (const f of ['src/workflow/runners/build/standalone-record.ts', 'src/workflow/runners/build/test-record.ts', 'src/workflow/code-review/runner.ts']) assert.equal(classOf(f), 'content', f);
	// appendSidecarLine is the one function that appends a history record: the store goes through it and appends only repository configuration itself
	const sidecar = scanWriters(read('src/workflow/artifact-core/sidecar.ts'), 'src/workflow/artifact-core/sidecar.ts');
	assert.equal(sidecar.rawCalls.filter(c => c.name === 'appendFileSync').length, 1, 'one raw append in sidecar.ts');
	const store = read('src/workflow/artifact-core/sidecar-store.ts');
	assert.match(store, /appendSidecarLine\(join\(this\.repoPath/);
	assert.doesNotMatch(store.replace(/function ensureLines[\s\S]*?\n}\n/, ''), /appendFileSync\(/, 'outside the ensure step the store appends no raw line');
	// no other production file appends a history record
	const others = productionFiles(join(ROOT, 'src')).filter(f => f !== 'src/workflow/artifact-core/sidecar.ts' && /appendSidecarLine\(/.test(read(f)));
	assert.deepEqual(others, ['src/workflow/artifact-core/sidecar-store.ts']);
});

test('the identity file writer is classified and appendSidecarLine remains the one raw append for history', async () => {
	// the identity file is a per-user declaration, not an artifact head: its one writer is listed as non-artifact
	const entry = byFile.get('src/workflow/identity/identity-service.ts');
	assert.equal(entry?.class, 'non-artifact');
	assert.deepEqual(checkInventoryEntry(read('src/workflow/identity/identity-service.ts'), entry, 'src/workflow/identity/identity-service.ts'), []);
	const identity = scanWriters(read('src/workflow/identity/identity-service.ts'), 'src/workflow/identity/identity-service.ts');
	assert.deepEqual(identity.rawCalls.map(c => c.name), ['writeAtomic'], 'one write, the atomic replace of the file');
	assert.equal(identity.rawCalls.filter(c => c.name === 'appendFileSync').length, 0, 'the identity module appends nothing');

	// the feedback service writes through History, never a file of its own, so it is not a writer at all
	for (const f of ['src/workflow/feedback/feedback-service.ts', 'src/workflow/feedback/threads.ts', 'src/workflow/feedback/legacy-anchor.ts', 'src/workflow/feedback/legacy-request.ts', 'src/daemon/feedback-handlers.ts']) {
		assert.equal(byFile.has(f), false, `${f} needs no entry`);
		assert.deepEqual(checkInventoryEntry(read(f), undefined, f), [], `${f} writes no file`);
	}

	// appendSidecarLine stays the one function that appends a history record
	const others = productionFiles(join(ROOT, 'src')).filter(f => /appendSidecarLine\(/.test(read(f)));
	assert.deepEqual(others.sort(), ['src/workflow/artifact-core/sidecar-store.ts', 'src/workflow/artifact-core/sidecar.ts']);
	assert.equal(scanWriters(read('src/workflow/artifact-core/sidecar.ts'), 'src/workflow/artifact-core/sidecar.ts').rawCalls.filter(c => c.name === 'appendFileSync').length, 1);
});

test('the binding writer is listed as a meta-only writer of meta.envelope and every production writer file still has an entry', async () => {
	const entry = byFile.get('src/workflow/tracker/binding.ts');
	assert.equal(entry?.class, 'meta-only');
	assert.match(entry?.note ?? '', /meta\.envelope\.binding/);
	assert.deepEqual(checkInventoryEntry(read('src/workflow/tracker/binding.ts'), entry, 'src/workflow/tracker/binding.ts'), []);
	assert.deepEqual(scanWriters(read('src/workflow/tracker/binding.ts'), 'src/workflow/tracker/binding.ts').rawCalls, [], 'it writes only through writeArtifact');
	// the binding is written by this module alone: no other production file patches meta.envelope.binding
	const others = productionFiles(join(ROOT, 'src')).filter(f => f !== 'src/workflow/tracker/binding.ts' && /envelope:\s*\{[^}]*binding:/.test(read(f)) && !/artifact-core\//.test(f));
	assert.deepEqual(others, []);
});

test('the write inventory lists the binding and attach writers as meta-only writers of meta.envelope and every production writer file still has an entry', async () => {
	// the binding module writes meta.envelope.binding, the attach module meta.envelope.attachments; both are meta-only patches
	for (const [file, field] of [['src/workflow/tracker/binding.ts', /meta\.envelope\.binding/], ['src/workflow/tracker/attach.ts', /meta\.envelope\.attachments/]] as const) {
		const entry = byFile.get(file);
		assert.equal(entry?.class, 'meta-only', file);
		assert.equal(entry?.via, 'writeArtifact', file);
		assert.match(entry?.note ?? '', field, file);
		assert.deepEqual(checkInventoryEntry(read(file), entry, file), [], file);
		assert.deepEqual(scanWriters(read(file), file).rawCalls, [], `${file} writes only through writeArtifact`);
	}
	assert.match(read('src/workflow/tracker/attach.ts'), /export function recordAttachment\(/);
	// no other production file writes the two fields
	// connection-session-rpc.ts has a session pipe's delivery `envelope` and a connection `binding`: not meta.envelope.
	const others = productionFiles(join(ROOT, 'src')).filter(f => !/tracker\/(binding|attach|unit-head)\.ts$|artifact-core\/|workflow\/storage\.ts$|daemon\/connection-session-rpc\.ts$/.test(f) && /envelope['"\]]*\s*[:=][^;\n]*\b(binding|attachments)\b/.test(read(f)));
	assert.deepEqual(others, []);
});
