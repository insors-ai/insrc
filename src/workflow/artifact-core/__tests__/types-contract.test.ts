import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

import * as core from '../types.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..', '..');

/** Type-check one file with the project's compiler options (tests are excluded from `tsc -p`). */
function diagnose(file: string): string[] {
	const cfg = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
	const parsed = ts.parseJsonConfigFileContent(cfg.config, ts.sys, root);
	const program = ts.createProgram([file], { ...parsed.options, noEmit: true });
	return ts.getPreEmitDiagnostics(program).map(d => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

describe('artifact-core types', () => {
	it('the exported types accept the sc2, sc3, sc4 and sc6 sketches and the stated anchor extension', () => {
		assert.deepEqual(diagnose(join(here, 'types-contract.fixtures.ts')), []);
		// Negative control: the checker really rejects a wrong shape.
		assert.ok(diagnose(join(here, 'types-contract.bad.ts')).length > 0);
	});

	it('exports only the six error classes at runtime', () => {
		assert.deepEqual(Object.keys(core).sort(), [
			'ArtifactNotFoundError', 'ArtifactShapeError', 'HistoryEntryError',
			'HistoryReadError', 'RepoSchemaError', 'UnknownArtifactKindError',
		]);
		for (const Cls of Object.values(core)) {
			const e = new Cls('m');
			assert.ok(e instanceof Error);
			assert.equal(e.name, Cls.name);
		}
	});
});
