/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { createHash, createPublicKey, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import { isDeepStrictEqual, TextDecoder } from 'node:util';

const TRUST_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
export const RELEASE_FENCE_FRESHNESS_MS = 5 * 60 * 1_000;
const MAX_METADATA_BYTES = 64 * 1024;
const GIT_ID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const DIGEST = /^[a-f0-9]{64}$/;
const ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;

export interface ReleaseChannel {
	readonly repoUrl: string;
	readonly branch: string;
}

export interface ReleaseTrustFloor {
	readonly epoch: number;
	readonly digest: string;
	readonly observedAt: number;
}

export interface ReleaseQualificationReceipt {
	readonly version: 1;
	readonly channel: ReleaseChannel;
	readonly keyId: string;
	readonly trust: ReleaseTrustFloor;
	readonly qualificationDigest: string;
	readonly priorCommit: string;
	readonly candidateCommit: string;
	readonly priorTree: string;
	readonly candidateTree: string;
	readonly profile: string;
	readonly referenceDigest: string;
	readonly compatibilityDigest: string;
	readonly testEvidenceDigest: string;
	readonly validUntil: number;
}

interface Window { readonly notBefore: number; readonly expiresAt: number }
interface ChannelKey extends Window {
	readonly id: string;
	readonly publicKey: string;
	readonly channel: ReleaseChannel;
}

type Domain = 'release-trust' | 'release-qualification';
const invalid = (): never => { throw new Error('invalid signed release metadata'); };

function record(value: unknown, fields: readonly string[]): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)
		|| Object.keys(value).length !== fields.length
		|| !fields.every(key => Object.hasOwn(value, key))) return invalid();
	return value as Record<string, unknown>;
}

function string(value: unknown, pattern?: RegExp): string {
	if (typeof value !== 'string' || value.length === 0 || value.length > 2_048
		|| /[\u0000-\u0020\u007f]/.test(value) || (pattern !== undefined && !pattern.test(value))) return invalid();
	return value;
}

function timestamp(value: unknown): number {
	if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) return invalid();
	return value;
}

function windowOf(value: Record<string, unknown>): Window {
	const notBefore = timestamp(value.notBefore);
	const expiresAt = timestamp(value.expiresAt);
	if (expiresAt <= notBefore) return invalid();
	return { notBefore, expiresAt };
}

function assertCurrent(window: Window, now: number): void {
	if (now < window.notBefore || now >= window.expiresAt) throw new Error('release metadata is expired or not yet valid');
}

function list(value: unknown): unknown[] {
	if (!Array.isArray(value) || value.length > 128) return invalid();
	return value;
}

function unique(values: readonly string[]): void {
	if (new Set(values).size !== values.length) invalid();
}

export function releaseMetadataDigest(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function base64(value: unknown, max: number): Buffer {
	if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4) return invalid();
	const bytes = Buffer.from(value, 'base64');
	if (bytes.length === 0 || bytes.length > max || bytes.toString('base64') !== value) return invalid();
	return bytes;
}

function decode(bytes: Buffer): unknown {
	if (bytes.length === 0 || bytes.length > MAX_METADATA_BYTES) return invalid();
	const source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
	const value: unknown = JSON.parse(source);
	// The wire format is compact JSON as emitted by JSON.stringify. Round-tripping
	// also rejects duplicate keys, including escaped spellings of the same key.
	if (JSON.stringify(value) !== source) return invalid();
	return value;
}

export function releaseSignatureFrame(domain: Domain, payload: Buffer): Buffer {
	if (payload.length === 0 || payload.length > MAX_METADATA_BYTES) return invalid();
	const length = Buffer.alloc(4);
	length.writeUInt32BE(payload.length);
	return Buffer.concat([Buffer.from(`insrc:${domain}:v1\0`, 'ascii'), length, payload]);
}

function verifyEnvelope(domain: Domain, bytes: Buffer, key: KeyObject) {
	const envelope = record(decode(bytes), ['payload', 'signature']);
	const payload = base64(envelope.payload, MAX_METADATA_BYTES);
	const signature = base64(envelope.signature, 64);
	if (signature.length !== 64 || key.type !== 'public' || key.asymmetricKeyType !== 'ed25519'
		|| !verify(null, releaseSignatureFrame(domain, payload), key, signature)) {
		throw new Error('invalid release metadata signature');
	}
	return { value: decode(payload), digest: releaseMetadataDigest(payload) };
}

function channelOf(value: unknown): ReleaseChannel {
	const channel = record(value, ['repoUrl', 'branch']);
	return { repoUrl: string(channel.repoUrl), branch: string(channel.branch) };
}

function keyOf(value: unknown): ChannelKey {
	const key = record(value, ['id', 'publicKey', 'channel', 'notBefore', 'expiresAt']);
	return { id: string(key.id, ID), publicKey: string(key.publicKey), channel: channelOf(key.channel), ...windowOf(key) };
}

function verifyTrust(rootKey: KeyObject, envelope: Buffer, now: number) {
	const signed = verifyEnvelope('release-trust', envelope, rootKey);
	const trust = record(signed.value, ['version', 'epoch', 'notBefore', 'expiresAt', 'keys', 'revoked']);
	const window = windowOf(trust);
	if (trust.version !== 1 || window.expiresAt - window.notBefore > TRUST_MAX_AGE_MS) return invalid();
	assertCurrent(window, now);
	const keys = list(trust.keys).map(keyOf);
	const revoked = list(trust.revoked).map(value => string(value, ID));
	unique(keys.map(key => key.id));
	unique(revoked);
	return { floor: { epoch: timestamp(trust.epoch), digest: signed.digest, observedAt: now }, window, keys, revoked };
}

/** Persist this observation even if the requested release is later refused. */
export function observeReleaseTrust(rootKey: KeyObject, envelope: Buffer, now: number): ReleaseTrustFloor {
	return verifyTrust(rootKey, envelope, timestamp(now)).floor;
}

/** The root key comes from the trusted distribution, never from the configured remote. */
export function verifyReleaseQualification(input: {
	readonly rootKey: KeyObject;
	readonly trustEnvelope: Buffer;
	readonly qualificationEnvelope: Buffer;
	readonly keyId: string;
	readonly channel: ReleaseChannel;
	readonly priorCommit: string;
	readonly candidateCommit: string;
	readonly priorTree: string;
	readonly candidateTree: string;
	readonly now: number;
}): ReleaseQualificationReceipt {
	const now = timestamp(input.now);
	const trust = verifyTrust(input.rootKey, input.trustEnvelope, now);
	const key = trust.keys.find(key => key.id === input.keyId);
	if (key === undefined || trust.revoked.includes(key.id) || !isDeepStrictEqual(key.channel, input.channel)) {
		throw new Error('release qualification signing key is unauthorized or revoked');
	}
	assertCurrent(key, now);
	const publicKey = createPublicKey({ key: base64(key.publicKey, 128), format: 'der', type: 'spki' });
	const signed = verifyEnvelope('release-qualification', input.qualificationEnvelope, publicKey);
	const qualification = record(signed.value, ['version', 'keyId', 'channel', 'priorCommit', 'candidateCommit', 'priorTree',
		'candidateTree', 'profile', 'referenceDigest', 'compatibilityDigest', 'testEvidenceDigest', 'notBefore', 'expiresAt']);
	const validity = windowOf(qualification);
	if (qualification.version !== 1 || qualification.keyId !== key.id
		|| !isDeepStrictEqual(channelOf(qualification.channel), key.channel)
		|| string(qualification.priorCommit, GIT_ID) !== input.priorCommit
		|| string(qualification.candidateCommit, GIT_ID) !== input.candidateCommit
		|| input.priorCommit === input.candidateCommit
		|| string(qualification.priorTree, GIT_ID) !== input.priorTree
		|| string(qualification.candidateTree, GIT_ID) !== input.candidateTree) {
		throw new Error('release qualification does not match the ordered release pair and Git trees');
	}
	assertCurrent(validity, now);
	return {
		version: 1, channel: key.channel, keyId: key.id,
		trust: trust.floor,
		qualificationDigest: signed.digest, priorCommit: input.priorCommit, candidateCommit: input.candidateCommit,
		priorTree: input.priorTree, candidateTree: input.candidateTree, profile: string(qualification.profile, ID),
		referenceDigest: string(qualification.referenceDigest, DIGEST),
		compatibilityDigest: string(qualification.compatibilityDigest, DIGEST),
		testEvidenceDigest: string(qualification.testEvidenceDigest, DIGEST),
		validUntil: Math.min(validity.expiresAt, key.expiresAt, trust.window.expiresAt),
	};
}

export function readReleaseTrustFloor(value: unknown): ReleaseTrustFloor {
	const floor = record(value, ['epoch', 'digest', 'observedAt']);
	return { epoch: timestamp(floor.epoch), digest: string(floor.digest, DIGEST), observedAt: timestamp(floor.observedAt) };
}

export function readReleaseQualificationReceipt(value: unknown): ReleaseQualificationReceipt {
	const receipt = record(value, ['version', 'channel', 'keyId', 'trust', 'qualificationDigest', 'priorCommit',
		'candidateCommit', 'priorTree', 'candidateTree', 'profile', 'referenceDigest', 'compatibilityDigest', 'testEvidenceDigest', 'validUntil']);
	const trust = readReleaseTrustFloor(receipt.trust);
	const validUntil = timestamp(receipt.validUntil);
	if (receipt.version !== 1 || validUntil <= trust.observedAt || receipt.priorCommit === receipt.candidateCommit) return invalid();
	return {
		version: 1, channel: channelOf(receipt.channel), keyId: string(receipt.keyId, ID), trust,
		qualificationDigest: string(receipt.qualificationDigest, DIGEST),
		priorCommit: string(receipt.priorCommit, GIT_ID), candidateCommit: string(receipt.candidateCommit, GIT_ID),
		priorTree: string(receipt.priorTree, GIT_ID), candidateTree: string(receipt.candidateTree, GIT_ID),
		profile: string(receipt.profile, ID), referenceDigest: string(receipt.referenceDigest, DIGEST),
		compatibilityDigest: string(receipt.compatibilityDigest, DIGEST),
		testEvidenceDigest: string(receipt.testEvidenceDigest, DIGEST), validUntil,
	};
}

export function assertReleaseTrustFloor(observed: ReleaseTrustFloor, floor: ReleaseTrustFloor | undefined): void {
	if (floor !== undefined && (observed.epoch < floor.epoch || observed.observedAt < floor.observedAt
		|| (observed.epoch === floor.epoch && observed.digest !== floor.digest))) {
		throw new Error('release trust epoch, bytes or clock moved backwards');
	}
}
