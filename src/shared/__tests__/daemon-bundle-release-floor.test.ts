import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceDaemonBundleReleaseFloor, readDaemonBundleReleaseFloor } from '../daemon-bundle-release-floor.js';
import type { DaemonBundleReleaseFloor } from '../daemon-bundle-release-floor.js';

const current: DaemonBundleReleaseFloor = {
	domain: 'production', channel: 'macos-arm64-pilot', sequence: 2,
	manifestSha256: 'a'.repeat(64), archiveSha256: 'b'.repeat(64),
};

test('a release floor permits identical retry but rejects rollback or conflicting reuse', () => {
	const state = advanceDaemonBundleReleaseFloor([], current);
	assert.strictEqual(advanceDaemonBundleReleaseFloor(state, current), state);
	assert.throws(() => advanceDaemonBundleReleaseFloor(state, { ...current, sequence: 1 }), /replay/);
	assert.throws(() => advanceDaemonBundleReleaseFloor(state, { ...current, archiveSha256: 'c'.repeat(64) }), /replace/);
	const next = advanceDaemonBundleReleaseFloor(state, { ...current, domain: 'qualification', sequence: 1 });
	assert.deepEqual(next[0], current);
	assert.equal(next.length, 2);
	assert.throws(() => readDaemonBundleReleaseFloor({ ...current, sequence: 0 }), /invalid/);
});
