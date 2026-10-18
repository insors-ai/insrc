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

test('every writer file is inventoried, annotated and classified as the design says', () => {
	const files = productionFiles(join(ROOT, 'src'));
	const problems: string[] = [];
	for (const file of files) {
		for (const p of checkInventoryEntry(read(file), byFile.get(file))) problems.push(`${file}: ${p}`);
	}
	// an entry for a file that does not exist is also stale
	for (const e of ARTIFACT_WRITE_INVENTORY) if (!files.includes(e.file)) problems.push(`${e.file}: the entry names a file that does not exist`);
	assert.deepEqual(problems, []);

	// the classification is the one the design states
	const classOf = (f: string): string | undefined => byFile.get(f)?.class;
	for (const f of ['src/workflow/questions.ts', 'src/daemon/steps/review-step/phases/findings.ts', 'src/workflow/tracker/refs.ts', 'src/workflow/bugfix/stamp.ts', 'src/workflow/orchestrator.ts']) assert.equal(classOf(f), 'meta-only', f);
	for (const f of [
		'src/daemon/steps/workflow-step/phases/synthesize.ts', 'src/daemon/workflow-rpc.ts', 'src/workflow/resolve-comment.ts',
		'src/workflow/runners/build/standalone-record.ts', 'src/workflow/code-review/runner.ts', 'src/workflow/runners/build/test-record.ts', 'src/daemon/steps/code-review-step/handler.ts',
	]) assert.equal(classOf(f), 'content', f);
	for (const f of ['src/workflow/gates.ts', 'src/workflow/review/resolve.ts', 'src/workflow/review/run-artifact.ts', 'src/daemon/steps/review-step/phases/verdicts.ts']) assert.equal(classOf(f), 'mixed', f);
	assert.equal(classOf('src/workflow/amendments/store.ts'), 'record');
	assert.equal(classOf('src/workflow/migrate-docs-tree.ts'), 'migration');
	// feedback is human provenance: appending it never mints a revision
	assert.equal(classOf('src/workflow/artifacts/provenance/writer.ts'), 'meta-only');

	// the code-review step handler injects the runner's revision-minting writer and holds no raw writer
	const handler = read('src/daemon/steps/code-review-step/handler.ts');
	assert.match(handler, /write:\s+writeRecordFile/);
	assert.equal(scanWriters(handler).rawCalls.length, 0, 'the handler has no raw writer of its own');
	assert.equal(classOf('src/daemon/steps/code-review-step/handler.ts'), 'content');
	assert.match(read('src/workflow/code-review/runner.ts'), /write:\s+writeRecordFile/);
});

test('the detector flags raw, aliased and injected writers and accepts the positive controls', () => {
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
