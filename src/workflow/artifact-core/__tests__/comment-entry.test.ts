import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { CommentEntry, CommentParty, ReviewContextRound } from '../types.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const TSC = resolve(ROOT, 'node_modules/typescript/bin/tsc');
const FIXTURE = 'src/workflow/artifact-core/__type-tests__/comment-entry.typecheck.ts';

/**
 * tsconfig.json excludes `__type-tests__` from the main build, so this runs tsc itself against
 * a throwaway project that extends the root config with just the fixture included -- proving
 * every field's required/optional and readonly status (asserted there via @ts-expect-error)
 * without widening any shared tsconfig.
 */
function typecheckFixture(): void {
	const dir = mkdtempSync(join(tmpdir(), 'insrc-comment-entry-typecheck-'));
	try {
		writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
			extends: resolve(ROOT, 'tsconfig.json'),
			compilerOptions: {
				noEmit: true, declaration: false, declarationMap: false, sourceMap: false,
				typeRoots: [resolve(ROOT, 'node_modules/@types')],
			},
			include: [resolve(ROOT, FIXTURE)],
			exclude: [],
		}));
		execFileSync('node', [TSC, '-p', join(dir, 'tsconfig.json')], { cwd: ROOT, stdio: 'pipe' });
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

describe('CommentParty, CommentEntry and ReviewContextRound', () => {
	it('are exported with the exact documented field shapes', () => {
		assert.doesNotThrow(typecheckFixture,
			`${FIXTURE} must compile with no @ts-expect-error mismatches`);

		const submitter: CommentParty = 'submitter';
		const reviewer: CommentParty = 'reviewer';

		const entry: CommentEntry = { round: 1, party: submitter, timestamp: '2026-11-19T00:00:00.000Z', text: 'hello' };
		assert.equal(entry.round, 1);
		assert.equal(entry.party, submitter);
		assert.equal(entry.timestamp, '2026-11-19T00:00:00.000Z');
		assert.equal(entry.text, 'hello');

		const reviewerEntry: CommentEntry = { ...entry, party: reviewer };
		assert.equal(reviewerEntry.party, 'reviewer');

		const round: ReviewContextRound = { round: 1, comments: [entry, reviewerEntry] };
		assert.equal(round.round, 1);
		assert.deepEqual(round.comments, [entry, reviewerEntry]);
	});
});
