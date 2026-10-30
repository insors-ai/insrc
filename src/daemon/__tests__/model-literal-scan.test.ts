/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Source scan over src (Epic ce99b72065d03b1b, Story s3 · t10; since s5 it
 * covers the TUI under src/cli and the recommender too): every model decision
 * reads the model definitions, so source names no model, no CLI family id and
 * no runner 'ollama' outside the definitions' owners and the family
 * implementations, reads no models.shaper.ollamaNumCtx and imports neither
 * DEFAULT_TIERS nor TIER_EFFORTS (removed in s5).
 * Comments are not scanned. Each exclusion names the Story (or decision) that
 * owns it.
 *
 * Run: npx tsx --test src/daemon/__tests__/model-literal-scan.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

interface Exclusion { readonly file: string; readonly owner: string; readonly why: string }

/** Whole trees outside the scan. */
const EXCLUDED_TREES: readonly Exclusion[] = [];

/** Model-name literals allowed outside the definitions file. */
const MODEL_NAME_EXCLUSIONS: readonly Exclusion[] = [];

/** Where a CLI family id may be written: the definitions' owners and the family implementation. */
const FAMILY_ID_OWNERS: readonly Exclusion[] = [
	{ file: 'src/daemon/model-catalog.ts', owner: 's1', why: 'the definitions file contract (FamilyId)' },
	{ file: 'src/daemon/model-registry.ts', owner: 's1', why: 'the registry over the definitions' },
	{ file: 'src/agent/providers/cli-provider.ts', owner: 's3', why: 'the CLI family implementation' },
];

/** Where a quoted 'ollama' is not a runner. */
const OLLAMA_NON_RUNNER: readonly Exclusion[] = [
	...FAMILY_ID_OWNERS,
	{ file: 'src/agent/providers/ollama.ts', owner: 's3', why: 'the Ollama family implementation' },
	{ file: 'src/indexer/embedder.ts', owner: 'Epic override item 3', why: "the embedder backend name and the 'ollama' npm package; embedding models are out of the Epic" },
	{ file: 'src/daemon/lifecycle.ts', owner: 'Epic override item 3', why: 'the embedder backend name; embedding models are out of the Epic' },
	{ file: 'src/indexer/index.ts', owner: 'Epic override item 3', why: "the 'ollama' npm package import for re-embedding" },
	{ file: 'src/daemon/handler-runtime.ts', owner: 's3', why: "the 'ollama' npm package import and the daemon-wide ollama.host config key" },
	{ file: 'src/shared/system-info.ts', owner: 's3', why: 'the SystemInfo ollama detection key' },
	{ file: 'src/workflow/types.ts', owner: 's3', why: "the legacy run-label union ('client' | 'ollama')" },
	{ file: 'src/cli/services/setup.ts', owner: 's5', why: "the 'ollama' program `setup pull` runs (spawn), not a runner" },
];

interface ShippedDefinitions { families: Array<{ id: string; cliKind?: string; models: Array<{ id: string; aliases?: string[] }> }> }
const shipped = (): ShippedDefinitions =>
	JSON.parse(readFileSync(join(ROOT, 'src', 'assets', 'models', 'cloud-model-catalog.json'), 'utf8')) as ShippedDefinitions;

/** The model ids and aliases the shipped definitions name. */
function modelNames(): Set<string> {
	const names = new Set<string>();
	for (const f of shipped().families) for (const m of f.models) { names.add(m.id); for (const a of m.aliases ?? []) names.add(a); }
	return names;
}

/** The ids of the shipped families that run a CLI (Epic b220bb61, Story s3: vendor and Ollama-hosted alike). */
function cliFamilyIds(): string[] {
	return shipped().families.filter(f => f.cliKind !== undefined).map(f => f.id);
}

/** The source with its comments removed, scanned lexically so a comment marker
 *  inside a string literal ('/*', '//') neither starts a comment nor hides code. */
function stripComments(src: string): string {
	let out = '';
	let i = 0;
	while (i < src.length) {
		const c = src[i]!;
		const next = src[i + 1];
		if (c === '/' && next === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
		if (c === '/' && next === '/') { const end = src.indexOf('\n', i); i = end < 0 ? src.length : end; continue; }
		if (c === "'" || c === '"' || c === '`') {
			let j = i + 1;
			while (j < src.length && src[j] !== c) j += src[j] === '\\' ? 2 : 1;
			out += src.slice(i, j + 1);
			i = j + 1;
			continue;
		}
		out += c;
		i++;
	}
	return out;
}
const blankStrings = (code: string): string => code.replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"/g, "''");
const quoted = (name: string): RegExp => new RegExp(`['"\`]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
const excluded = (list: readonly Exclusion[], file: string): boolean => list.some(e => file === e.file || (e.file.endsWith('/') && file.startsWith(e.file)));

/** The daemon-code files the scan covers, repo-relative. */
function daemonFiles(): string[] {
	const out: string[] = [];
	const walk = (dir: string): void => {
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) { if (name !== '__tests__') walk(p); continue; }
			if (!/\.(ts|tsx|mts)$/.test(name) || name.endsWith('.test.ts')) continue;
			const rel = relative(ROOT, p).split('\\').join('/');
			if (!excluded(EXCLUDED_TREES, rel)) out.push(rel);
		}
	};
	walk(join(ROOT, 'src'));
	return out;
}

/** The violations in `files`, read from `source` (default: disk). */
function scan(files: readonly string[], source: (file: string) => string = f => readFileSync(join(ROOT, f), 'utf8')): string[] {
	const names = modelNames();
	const familyIds = cliFamilyIds();
	const violations: string[] = [];
	for (const file of files) {
		const code = stripComments(source(file));
		if (!excluded(MODEL_NAME_EXCLUSIONS, file)) {
			for (const n of names) if (quoted(n).test(code)) violations.push(`${file}: model-name literal '${n}'`);
		}
		if (!excluded(FAMILY_ID_OWNERS, file) && familyIds.some(id => quoted(id).test(code))) violations.push(`${file}: CLI family id literal`);
		if (!excluded(OLLAMA_NON_RUNNER, file) && /['"`]ollama['"`]/.test(code)) violations.push(`${file}: runner 'ollama' literal`);
		// A read is code: `.ollamaNumCtx` outside a string (the retired path is named in one), or a bracket access.
		if (/\.ollamaNumCtx\b/.test(blankStrings(code)) || /\[\s*['"]ollamaNumCtx['"]\s*\]/.test(code)) violations.push(`${file}: reads models.shaper.ollamaNumCtx`);
		if (/^import[^;]*\b(DEFAULT_TIERS|TIER_EFFORTS)\b[^;]*;/m.test(code)) violations.push(`${file}: imports DEFAULT_TIERS / TIER_EFFORTS`);
	}
	return violations;
}

test('model-literal-scan.test.ts: the scan passes on the tree and fails on an injected literal; exclusions name their owning Story', () => {
	const files = daemonFiles();
	assert.ok(files.length > 300, `the scan covers the daemon code (${files.length} files)`);
	assert.deepEqual(scan(files), []);

	// Each rule fails on a literal injected into an ordinary daemon file.
	const target = 'src/daemon/workflow-rpc.ts';
	assert.ok(files.includes(target));
	const inject = (extra: string) => (f: string): string => readFileSync(join(ROOT, f), 'utf8') + (f === target ? `\n${extra}\n` : '');
	const cases: Array<[string, RegExp]> = [
		["const m = 'claude-opus-5-5';", /model-name literal 'claude-opus-5-5'/],
		["const m = 'opus';", /model-name literal 'opus'/],
		["const r = 'cli-codex';", /CLI family id literal/],
		["const r = 'ollama';", /runner 'ollama' literal/],
		['const n = cfg.shaper.ollamaNumCtx;', /reads models\.shaper\.ollamaNumCtx/],
		["import { DEFAULT_TIERS } from '../config/analyze.js';", /imports DEFAULT_TIERS/],
	];
	for (const [extra, expected] of cases) {
		const found = scan(files, inject(extra));
		assert.equal(found.length, 1, `${extra}: ${found.join('; ')}`);
		assert.match(found[0]!, expected);
		assert.ok(found[0]!.startsWith(target));
	}
	// A comment naming them is not code.
	assert.deepEqual(scan(files, inject("// 'claude-opus-5-5' 'cli-codex' 'ollama' cfg.shaper.ollamaNumCtx")), []);
	assert.deepEqual(scan(files, inject("/* const m = 'opus'; */")), []);
	// Comment markers inside strings do not hide a literal between them.
	const hidden = scan(files, inject("const a = '/*'; const m = 'opus'; const b = '*/';"));
	assert.equal(hidden.length, 1, hidden.join('; '));
	assert.match(hidden[0]!, /model-name literal 'opus'/);
	assert.match(scan(files, inject("const u = 'http://x'; const m = 'opus';"))[0] ?? '', /model-name literal 'opus'/);

	// Every exclusion names its owner and reason, and points at a file that exists.
	for (const e of [...EXCLUDED_TREES, ...MODEL_NAME_EXCLUSIONS, ...FAMILY_ID_OWNERS, ...OLLAMA_NON_RUNNER]) {
		assert.match(e.owner, /^(s\d+|Epic override item \d+)$/, e.file);
		assert.ok(e.why.length > 10, e.file);
		assert.ok(statSync(join(ROOT, e.file)).isFile() || statSync(join(ROOT, e.file)).isDirectory(), e.file);
	}
});

test('model-literal-scan.test.ts: the scan covers src/cli and the recommender', () => {
	const files = daemonFiles();
	for (const f of ['src/cli/panes/ModelTiersPane.tsx', 'src/cli/panes/ModelCheckScreen.tsx', 'src/cli/services/setup.ts', 'src/shared/model-recommender.ts']) {
		assert.ok(files.includes(f), `${f} is scanned`);
		const found = scan([f], g => readFileSync(join(ROOT, g), 'utf8') + "\nconst m = 'claude-opus-5-5';\n");
		assert.deepEqual(found, [`${f}: model-name literal 'claude-opus-5-5'`], `a model literal in ${f} is caught`);
	}
	assert.deepEqual(scan(files.filter(f => f.startsWith('src/cli/') || f === 'src/shared/model-recommender.ts')), []);
	// No exclusion covers the TUI tree or the recommender's model names.
	assert.deepEqual(EXCLUDED_TREES, []);
	assert.equal(MODEL_NAME_EXCLUSIONS.some(e => e.file.startsWith('src/cli') || e.file === 'src/shared/model-recommender.ts'), false);
});

test('model-literal-scan.test.ts: every CLI family id of the shipped definitions, including ollama-claude and cli-vibe, is flagged outside the owners', () => {
	const ids = cliFamilyIds();
	// Read from the shipped definitions: the vendor CLIs and the Ollama-hosted one, not the CLI-less local family.
	for (const id of ['cli-claude', 'cli-codex', 'cli-vibe', 'ollama-claude']) assert.ok(ids.includes(id), `${id} is a shipped CLI family`);
	assert.equal(ids.includes('ollama'), false);

	const target = 'src/cli/panes/ModelTiersPane.tsx';
	for (const id of ids) {
		const found = scan([target], f => readFileSync(join(ROOT, f), 'utf8') + `\nconst r = '${id}';\n`);
		assert.deepEqual(found, [`${target}: CLI family id literal`], `'${id}' is caught`);
		// An owner may write it, and a comment naming it is not code.
		assert.deepEqual(scan(['src/daemon/model-catalog.ts'], f => readFileSync(join(ROOT, f), 'utf8') + `\nconst r = '${id}';\n`), []);
		assert.deepEqual(scan([target], f => readFileSync(join(ROOT, f), 'utf8') + `\n// const r = '${id}';\n`), []);
	}
	// A longer id that merely contains one is not a match.
	assert.deepEqual(scan([target], f => readFileSync(join(ROOT, f), 'utf8') + "\nconst r = 'ollama-claude-next';\n"), []);
});
