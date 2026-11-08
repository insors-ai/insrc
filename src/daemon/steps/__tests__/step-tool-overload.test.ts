/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * finalizeSynthesize has two overloads (LLD-b9d5c5c40df5a574-s3, task t13). The project's type check leaves test files
 * out, so this test compiles a snippet with the compiler itself: the bundle handler's call
 * `finalizeSynthesize(input.bundle, execution)` resolves to the first overload and its result is assignable to the
 * bundle layers, and the call with progress resolves to the second.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

function compile(snippet: string): { ok: boolean; output: string } {
	// Inside the repository, so the snippet is an ES module of this package like the code it imports.
	const parent = join(ROOT, '.insrc', 'tmp');
	mkdirSync(parent, { recursive: true });
	const dir = mkdtempSync(join(parent, 'overload-'));
	try {
		const file = join(dir, 'check.ts');
		writeFileSync(file, snippet);
		writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
			extends: join(ROOT, 'tsconfig.json'),
			compilerOptions: { noEmit: true, rootDir: ROOT, typeRoots: [join(ROOT, 'node_modules/@types')], types: ['node'] },
			include: [file], exclude: [],
		}));
		const run = spawnSync(join(ROOT, 'node_modules/.bin/tsc'), ['-p', join(dir, 'tsconfig.json')], { cwd: ROOT, encoding: 'utf8' });
		return { ok: run.status === 0, output: `${run.stdout}${run.stderr}` };
	} finally { rmSync(dir, { recursive: true, force: true }); }
}

const HEAD = `
import { finalizeSynthesize } from '${join(ROOT, 'src/analyze/context/synthesizer.ts').replace(/\.ts$/, '.js')}';
import type { BundleLayers } from '${join(ROOT, 'src/analyze/context/driver.ts').replace(/\.ts$/, '.js')}';
import type { AnswerProgress, FinalizedAnswerTurn } from '${join(ROOT, 'src/analyze/context/answer-progress.ts').replace(/\.ts$/, '.js')}';
import type { ConnectionExecutionContext } from '${join(ROOT, 'src/shared/step-context.ts').replace(/\.ts$/, '.js')}';
declare const raw: unknown;
declare const progress: AnswerProgress;
declare const execution: ConnectionExecutionContext | undefined;
`;

test('compile-time check that finalizeSynthesize(input.bundle, execution) resolves to the first overload and the progress call to the second', () => {
	// The bundle handler's call and assignment, unchanged; the progress call; and nothing mixed up.
	const good = compile(`${HEAD}
const layers: BundleLayers = finalizeSynthesize(raw, execution);
const alone: BundleLayers = finalizeSynthesize(raw);
const turn: FinalizedAnswerTurn = finalizeSynthesize(raw, execution, progress);
export { layers, alone, turn };
`);
	assert.equal(good.ok, true, good.output);

	// The progress call is not a bundle: assigning it to the layers is an error, so it did not resolve to the first overload.
	const second = compile(`${HEAD}
const wrong: BundleLayers = finalizeSynthesize(raw, execution, progress);
export { wrong };
`);
	assert.equal(second.ok, false, 'the call with progress must not be assignable to the bundle layers');

	// The call without progress is not a turn: it resolved to the first overload.
	const first = compile(`${HEAD}
const wrong: FinalizedAnswerTurn = finalizeSynthesize(raw, execution);
export { wrong };
`);
	assert.equal(first.ok, false, 'the call without progress must not be assignable to a turn');
});
