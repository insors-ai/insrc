/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import { readDarwinIncarnation } from '../../shared/darwin-lifecycle.js';
import { InstallationMutationGate, recordedReleaseQualification } from '../../shared/installation-mutation-gate.js';
import { observeReleaseTrust, releaseSignatureFrame, verifyReleaseQualification } from '../../shared/managed-release-trust.js';

function envelope(domain: Parameters<typeof releaseSignatureFrame>[0], key: KeyObject, value: unknown, raw?: string): Buffer {
	const payload = Buffer.from(raw ?? JSON.stringify(value));
	const signature = sign(null, releaseSignatureFrame(domain, payload), key);
	return Buffer.from(JSON.stringify({ payload: payload.toString('base64'), signature: signature.toString('base64') }));
}

function fixture() {
	const root = generateKeyPairSync('ed25519');
	const old = generateKeyPairSync('ed25519');
	const replacement = generateKeyPairSync('ed25519');
	const now = Date.now();
	const notBefore = now - 600_000;
	const expiresAt = now + 600_000;
	const channel = { repoUrl: 'https://example.invalid/insrc.git', branch: 'v2' };
	const pair = { priorCommit: '1'.repeat(40), candidateCommit: '2'.repeat(40), priorTree: '3'.repeat(40), candidateTree: '4'.repeat(40) };
	const key = (id: string, publicKey: KeyObject) => ({
		id, publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), channel, notBefore, expiresAt,
	});
	const oldKey = key('old', old.publicKey);
	const nextKey = key('next', replacement.publicKey);
	const trust = (epoch: number, keys: typeof oldKey[], revoked: string[] = []) =>
		envelope('release-trust', root.privateKey, { version: 1, epoch, notBefore, expiresAt, keys, revoked });
	const trustEnvelope = trust(1, [oldKey]);
	const rotated = trust(2, [nextKey, oldKey], ['old']);
	const qualification = {
		version: 1, keyId: 'old', channel, ...pair, profile: 'darwin-arm64',
		referenceDigest: 'a'.repeat(64), compatibilityDigest: 'b'.repeat(64), testEvidenceDigest: 'c'.repeat(64), notBefore, expiresAt,
	};
	const qualificationEnvelope = envelope('release-qualification', old.privateKey, qualification);
	const input = { rootKey: root.publicKey, trustEnvelope, qualificationEnvelope, keyId: 'old', channel, ...pair, now };
	return { root, old, replacement, input, qualification, rotated, trust, oldKey };
}

test('Signed release metadata rejects wrong authority, duplicate fields, tree, order, expiry and revocation', () => {
	const f = fixture();
	const { input, old, qualification } = f;
	assert.equal(verifyReleaseQualification(input).profile, 'darwin-arm64');
	assert.throws(() => verifyReleaseQualification({ ...input, rootKey: old.publicKey }), /signature/);
	assert.throws(() => verifyReleaseQualification({ ...input, candidateTree: input.priorTree }), /ordered release/);
	assert.throws(() => verifyReleaseQualification({ ...input, priorCommit: input.candidateCommit }), /ordered release/);
	assert.throws(() => verifyReleaseQualification({ ...input, channel: { ...input.channel, branch: 'main' } }), /unauthorized/);
	assert.throws(() => verifyReleaseQualification({ ...input, trustEnvelope: f.rotated }), /revoked/);
	assert.throws(() => verifyReleaseQualification({ ...input, now: qualification.expiresAt }), /expired/);
	const duplicate = JSON.stringify(qualification).replace('{"version":1,', '{"version":1,"version":1,');
	assert.throws(() => verifyReleaseQualification({ ...input,
		qualificationEnvelope: envelope('release-qualification', old.privateKey, undefined, duplicate) }), /invalid/);
	const replacement = { ...qualification, keyId: 'next' };
	const verified = verifyReleaseQualification({ ...input, keyId: 'next', trustEnvelope: f.rotated,
		qualificationEnvelope: envelope('release-qualification', f.replacement.privateKey, replacement) });
	assert.equal(verified.trust.epoch, 2);
});

test('Trust rotation, expiry, replay and offline rollback at the fence boundary', { skip: process.platform !== 'darwin' }, async t => {
	const root = await realpath(await mkdtemp(join('/tmp', 'insrc-release-trust-')));
	t.after(() => rm(root, { recursive: true, force: true }));
	const f = fixture();
	const { input } = f;
	const gate = new InstallationMutationGate(root);
	const owner = await readDarwinIncarnation(process.pid);
	const update = await gate.reserve({ kind: 'update', owner, predecessor: {
		priorRelease: input.priorCommit, priorCommit: input.priorCommit, candidateRelease: input.candidateCommit, wasRunning: true,
	} });
	assert.equal(update.kind, 'update');
	if (update.kind !== 'update') throw new Error('expected update reservation');
	const qualification = verifyReleaseQualification(input);
	const proof = { updateId: update.id, qualification, priorFingerprint: 'c'.repeat(64), candidateFingerprint: 'd'.repeat(64) };
	assert.equal(recordedReleaseQualification(update), undefined);
	const stale = verifyReleaseQualification({ ...input, now: input.now - 301_000 });
	await assert.rejects(gate.admitReleaseQualification(update, { ...proof, qualification: stale }), /fresh verification/);
	await assert.rejects(gate.admitReleaseQualification(update, { ...proof, updateId: 'another-update' }), /receipt/);
	await gate.admitReleaseQualification(update, proof);
	const newer = observeReleaseTrust(f.root.publicKey, f.rotated, Date.now());
	await gate.observeReleaseTrust(newer);
	await assert.rejects(gate.observeReleaseTrust(qualification.trust), /backwards/);
	await assert.rejects(gate.observeReleaseTrust({ ...newer, digest: 'e'.repeat(64) }), /backwards/);
	await assert.rejects(gate.observeReleaseTrust({ ...newer, observedAt: newer.observedAt - 1 }), /backwards/);
	await assert.rejects(gate.recordIntent(update, 'predecessor-stop', 'must remain running'), /backwards/);
	const reopened = new InstallationMutationGate(root);
	const active = (await reopened.read()).active;
	assert.equal(active?.kind, 'update');
	if (active?.kind !== 'update') throw new Error('missing durable update');
	assert.deepEqual(recordedReleaseQualification(active), proof);
	await reopened.publishOutcome(update, 'rolled-back', 'refused before any predecessor mutation');
	await reopened.release(update);
	assert.deepEqual((await reopened.read()).releaseTrust, newer);

	const replacement = { ...f.qualification, keyId: 'next' };
	const nextQualification = verifyReleaseQualification({ ...input, keyId: 'next', now: Date.now(), trustEnvelope: f.rotated,
		qualificationEnvelope: envelope('release-qualification', f.replacement.privateKey, replacement) });
	const retry = await reopened.reserve({ kind: 'update', owner, predecessor: update.predecessor });
	assert.equal(retry.kind, 'update');
	const retryProof = { ...proof, updateId: retry.id, qualification: nextQualification };
	await reopened.admitReleaseQualification(retry, retryProof);
	await reopened.recordIntent(retry, 'legacy-launcher-fence', 'original checkout pinned');
	await reopened.recordReceipt(retry, 'legacy-launcher-fence', 'original checkout fenced');
	const revoked = observeReleaseTrust(f.root.publicKey, f.trust(3, [], ['next']), Date.now());
	await reopened.observeReleaseTrust(revoked);
	const offlineGate = new InstallationMutationGate(root);
	const interrupted = (await offlineGate.read()).active;
	assert.equal(interrupted?.kind, 'update');
	if (interrupted?.kind !== 'update') throw new Error('missing fenced update');
	assert.deepEqual(recordedReleaseQualification(interrupted), retryProof);
	await offlineGate.recordIntent(retry, 'rollback-legacy-service', 'restore the archived prior');
	await offlineGate.recordReceipt(retry, 'rollback-legacy-service', 'prior reconciled');
	await offlineGate.publishOutcome(retry, 'rolled-back', 'offline recovery retained the prior release');
	await offlineGate.release(retry);
	assert.deepEqual((await offlineGate.read()).releaseTrust, revoked);
});
