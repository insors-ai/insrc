import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('release artifact retrieval rejects failed attempts, development refs, and cross-attempt substitution', () => {
	const root = mkdtempSync(join(tmpdir(), 'insrc-attempt-'));
	try {
		const sha = 'a'.repeat(40);
		const archive = 'insrc-daemon-0.2.1-pilot.1-darwin-arm64.tar.gz';
		const details = { id: 100, run_attempt: 2, repository: { id: 42 }, head_repository: { id: 42 }, workflow_id: 44,
			head_branch: 'main', head_sha: sha, event: 'workflow_dispatch', status: 'completed', conclusion: 'success',
			path: '.github/workflows/daemon-candidate.yml' };
		const artifact = { id: 101, name: `daemon-candidate-release-${sha}-2`, expired: false, expires_at: '2099-01-01T00:00:00Z',
			workflow_run: { id: 100, repository_id: 42, head_repository_id: 42, head_branch: 'main', head_sha: sha } };
		writeFileSync(join(root, 'candidate.json'), JSON.stringify({ branch: 'main', lane: 'release', commit: sha,
			runId: '100', runAttempt: '2', archiveName: archive }));
		writeFileSync(join(root, archive), 'unchanged artifact bytes');
		execFileSync('zip', ['-q', 'fixture.zip', 'candidate.json', archive], { cwd: root });
		writeFileSync(join(root, 'gh'), `#!/bin/bash
printf '%s\\n' "$2" >> "$LOG"
case "$2" in
 repos/owner/repo) echo 42;;
 */workflows/daemon-candidate.yml) echo 44;;
 */runs/100/attempts/2) printf '%s' "$RUN";;
 */artifacts/101) printf '%s' "$ARTIFACT";;
 */artifacts/101/zip) cat "$ZIP";;
 *) exit 3;;
esac
`, { mode: 0o700 });
		const log = join(root, 'requests');
		let index = 0;
		const run = (record = details, item = artifact) => {
			writeFileSync(log, '');
			const destination = join(root, `output-${index++}`);
			const result = spawnSync('/bin/bash', [new URL('../daemon-release-artifact.sh', import.meta.url).pathname,
				'100', '2', '101', sha, destination], { env: { ...process.env, GH_REPO: 'owner/repo',
				PATH: `${root}:${process.env.PATH}`, LOG: log, ZIP: join(root, 'fixture.zip'),
				RUN: JSON.stringify(record), ARTIFACT: JSON.stringify(item) } });
			return { status: result.status, destination };
		};
		const success = run();
		assert.equal(success.status, 0);
		assert.equal(readFileSync(join(success.destination, archive), 'utf8'), 'unchanged artifact bytes');
		assert.equal(JSON.parse(readFileSync(join(success.destination, 'verified-origin.json'), 'utf8')).runAttempt, '2');
		for (const [record, item] of [
			[{ ...details, conclusion: 'failure' }, artifact],
			[{ ...details, head_branch: 'v2' }, artifact],
			[{ ...details, head_sha: 'b'.repeat(40) }, artifact],
			[{ ...details, head_repository: { id: 43 } }, artifact],
			[{ ...details, workflow_id: 45 }, artifact],
			[details, { ...artifact, expires_at: '2000-01-01T00:00:00Z' }],
			[details, { ...artifact, name: `daemon-candidate-release-${sha}-1` }],
			[details, { ...artifact, workflow_run: { ...artifact.workflow_run, head_branch: 'v2' } }],
		] as const) {
			assert.notEqual(run(record, item).status, 0);
			assert.doesNotMatch(readFileSync(log, 'utf8'), /\/zip/);
		}
	} finally { rmSync(root, { recursive: true, force: true }); }
});
