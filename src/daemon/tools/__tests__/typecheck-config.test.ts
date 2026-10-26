/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * One-tool-registry epic, s7/t6: the type fixtures stay out of the normal build, the dedicated config checks
 * them, and an unused @ts-expect-error fails that check.
 * Run: npx tsx --test src/daemon/tools/__tests__/typecheck-config.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = join(ROOT, 'node_modules/typescript/bin/tsc');
const json = (file: string): Record<string, unknown> => JSON.parse(readFileSync(join(ROOT, file), 'utf8')) as Record<string, unknown>;

function tsc(args: string[], cwd = ROOT): { code: number; out: string } {
	try { return { code: 0, out: execFileSync('node', [TSC, ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }) }; }
	catch (e) { const err = e as { status?: number; stdout?: string }; return { code: err.status ?? 1, out: err.stdout ?? '' }; }
}

test('typecheck-config.test.ts: the root tsconfig excludes the __type-tests__ directories, so no fixture is in the root program', () => {
	const root = json('tsconfig.json') as { exclude: string[] };
	assert.ok(root.exclude.includes('**/__type-tests__/**'));
	const listed = tsc(['-p', 'tsconfig.json', '--listFilesOnly']);
	assert.equal(listed.code, 0);
	assert.equal(listed.out.split('\n').filter(f => f.includes('__type-tests__')).length, 0, 'no fixture is compiled or emitted by the normal build');
});

test('typecheck-config.test.ts: tsconfig.typecheck.json includes the fixtures with noEmit, the script runs it, and the build chain runs the script after tsc', () => {
	const cfg = json('tsconfig.typecheck.json') as { extends: string; compilerOptions: { noEmit: boolean }; include: string[]; exclude: string[] };
	assert.equal(cfg.extends, './tsconfig.json');
	assert.equal(cfg.compilerOptions.noEmit, true);
	assert.deepEqual(cfg.include, ['src/daemon/tools/__type-tests__/**/*.ts']);
	assert.deepEqual(cfg.exclude, [], 'the fixtures are not excluded here');
	const scripts = (json('package.json') as { scripts: Record<string, string> }).scripts;
	assert.equal(scripts['typecheck:tools'], 'tsc -p tsconfig.typecheck.json');
	assert.match(scripts['build']!, /^tsc && npm run typecheck:tools && /);
});

test('typecheck-config.test.ts: the fixtures compile, and an unused @ts-expect-error fails typecheck:tools', () => {
	assert.equal(tsc(['-p', 'tsconfig.typecheck.json']).code, 0, 'the real fixtures compile');
	const dir = mkdtempSync(join(tmpdir(), 'insrc-typecheck-'));
	try {
		const base = { compilerOptions: { strict: true, noEmit: true, module: 'nodenext', moduleResolution: 'nodenext', target: 'es2022' } };
		writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ ...base, files: ['ok.ts'] }));
		writeFileSync(join(dir, 'ok.ts'), "// @ts-expect-error a real error\nexport const a: number = 'x';\n");
		assert.equal(tsc(['-p', join(dir, 'tsconfig.json')]).code, 0, 'an expected error is accepted');
		writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({ ...base, files: ['unused.ts'] }));
		writeFileSync(join(dir, 'unused.ts'), "// @ts-expect-error nothing is wrong here\nexport const a: number = 1;\n");
		const r = tsc(['-p', join(dir, 'tsconfig.json')]);
		assert.notEqual(r.code, 0, 'an unused expect-error fails');
		assert.match(r.out, /TS2578/);
	} finally { rmSync(dir, { recursive: true, force: true }); }
});
