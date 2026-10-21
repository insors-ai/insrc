import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { InvalidArtifactKeyError } from '../../artifact-ids.js';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FileSidecarStore, createFileSidecarStore, ensureSidecarRepoRules } from '../sidecar-store.js';

const H = '2f27754d4ad00b8e';

describe('sidecar-files', () => {
	const store = new FileSidecarStore('/repo');

	it("filesOf maps an id to its head, log and feedback files and a TASK id to its Story's Tasks files, and mergeAttributes returns the two union rules", () => {
		assert.deepEqual(store.filesOf(`LLD-${H}-s4`), {
			head:     `.insrc/artifacts/LLD-${H}-s4.json`,
			log:      `.insrc/artifacts/LLD-${H}-s4.log.jsonl`,
			feedback: `.insrc/artifacts/LLD-${H}-s4.feedback.jsonl`,
		});
		const a = store.filesOf(`TASK-${H}-s4-t1`);
		const b = store.filesOf(`TASK-${H}-s4-t2`);
		assert.equal(a.log, `.insrc/artifacts/TASKS-${H}-s4.log.jsonl`);
		assert.equal(a.feedback, `.insrc/artifacts/TASKS-${H}-s4.feedback.jsonl`);
		assert.equal(a.log, b.log);
		assert.notEqual(a.head, b.head);
		assert.equal(store.filesOf(`TASKS-${H}-s4`).log, a.log);
		assert.notEqual(store.filesOf(`TASK-${H}-s5-t1`).log, a.log);
		assert.throws(() => store.filesOf('not-an-id'), InvalidArtifactKeyError);
		assert.deepEqual(store.mergeAttributes(), [
			'.insrc/artifacts/*.log.jsonl merge=union',
			'.insrc/artifacts/*.feedback.jsonl merge=union',
		]);
	});

	it('the ensure step adds only the missing lines to .gitattributes and .gitignore, is idempotent, and an unwritable file is a warning', async () => {
		const repo = mkdtempSync(join(tmpdir(), 'sidecar-ensure-'));
		try {
			const attrs = join(repo, '.gitattributes');
			const ignore = join(repo, '.gitignore');
			const rules = store.mergeAttributes();

			// No files yet: both are created with the lines.
			ensureSidecarRepoRules(repo, new FileSidecarStore(repo));
			assert.equal(readFileSync(attrs, 'utf8'), rules.join('\n') + '\n');
			assert.equal(readFileSync(ignore, 'utf8'), '.insrc/journal/\n');

			// A second call writes nothing.
			ensureSidecarRepoRules(repo, new FileSidecarStore(repo));
			assert.equal(readFileSync(attrs, 'utf8'), rules.join('\n') + '\n');
			assert.equal(readFileSync(ignore, 'utf8'), '.insrc/journal/\n');

			// Existing rules stay, with no final newline; only the missing lines are added.
			writeFileSync(attrs, '*.png binary\n' + rules[0]);
			writeFileSync(ignore, 'node_modules/');
			ensureSidecarRepoRules(repo, new FileSidecarStore(repo));
			assert.equal(readFileSync(attrs, 'utf8'), `*.png binary\n${rules[0]}\n${rules[1]}\n`);
			assert.equal(readFileSync(ignore, 'utf8'), 'node_modules/\n.insrc/journal/\n');

			// A file that cannot be written is a warning and the store still works.
			const bad = mkdtempSync(join(tmpdir(), 'sidecar-ensure-bad-'));
			try {
				mkdirSync(join(bad, '.gitattributes'));
				mkdirSync(join(bad, '.gitignore'));
				const made = createFileSidecarStore(bad);
				await made.appendRecord('log', { artifactId: `LLD-${H}-s4`, entry: { id: 'e1', timestamp: '2026-10-20T10:00:00Z' } });
				assert.equal((await made.readRecords('log', `LLD-${H}-s4`)).length, 1);
			} finally { rmSync(bad, { recursive: true, force: true }); }
		} finally { rmSync(repo, { recursive: true, force: true }); }
	});
});
