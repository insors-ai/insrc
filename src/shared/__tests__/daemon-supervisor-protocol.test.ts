/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	SUPERVISOR_FRAME_BYTES, SupervisorFrameReader, SupervisorLifecycleError,
	encodeSupervisorFrame, readSupervisorHello, readSupervisorReply, readSupervisorRequest,
	replyToSupervisorHello, verifySupervisorHelloReply,
} from '../daemon-supervisor-protocol.js';
import type { SupervisorErrorCode, SupervisorRequest } from '../daemon-supervisor-protocol.js';

const release = { installationRoot: '/state', releaseId: 'r1' };
const peer = { uid: 501, pid: 123, startedAt: 'boot:1', commandLine: '/pinned/bin/supervisor' };
const hello = readSupervisorHello({ hello: 1, id: 'hello', supportedVersions: [1, 2] });
const controller = { role: 'controller', version: 1 } as const;
const child = { role: 'child', generation: 'g1', leaseToken: 'lease1', drainId: 'drain1' } as const;
const stop = { v: 1, id: 'req1', op: 'stop', generation: 'g1' } as const;

function rejects(code: SupervisorErrorCode, action: () => unknown): void {
	assert.throws(action, error => error instanceof SupervisorLifecycleError && error.code === code);
}

test('Wrong peer, root and generation', () => {
	const reply = replyToSupervisorHello(hello, release, [1]);
	for (const wrong of [{ ...peer, uid: 502 }, { ...peer, startedAt: 'boot:2' }, { ...peer, pid: 321 }]) {
		rejects('ownership-conflict', () => verifySupervisorHelloReply(reply, hello, release, peer, wrong));
	}
	for (const wrong of [{ ...release, installationRoot: '/foreign' }, { ...release, releaseId: 'r2' }]) {
		rejects('ownership-conflict', () => verifySupervisorHelloReply(reply, hello, wrong, peer, peer));
	}
	rejects('ownership-conflict', () => readSupervisorRequest({ ...stop, op: 'ready', generation: 'old' }, child));
});

test('Protocol version, frame bounds, channel role and request correlation', () => {
	const reader = new SupervisorFrameReader();
	const received: unknown[] = [];
	const collect = (frame: unknown) => received.push(frame);
	const multilingual = { ...stop, id: 'café' };
	const encoded = encodeSupervisorFrame(multilingual);
	const split = encoded.indexOf(0xc3) + 1;
	reader.push(encoded.subarray(0, split), collect);
	reader.push(Buffer.concat([encoded.subarray(split), encodeSupervisorFrame(stop)]), collect);
	assert.deepEqual(received, [multilingual, stop]);
	const limit = Buffer.from('"' + 'a'.repeat(SUPERVISOR_FRAME_BYTES - 2) + '"\n');
	reader.push(limit, collect);
	assert.equal((received.at(-1) as string).length, SUPERVISOR_FRAME_BYTES - 2);
	reader.push(Buffer.from('{'), collect);
	reader.discardPartial();
	reader.push(encoded, collect);
	assert.deepEqual(received.at(-1), multilingual);
	rejects('watchdog-protocol', () => reader.push(Buffer.from([0x22, 0xff, 0x22, 0x0a]), collect));
	rejects('watchdog-protocol', () => new SupervisorFrameReader().push(Buffer.alloc(SUPERVISOR_FRAME_BYTES + 1), collect));
	rejects('watchdog-protocol', () => encodeSupervisorFrame({ ...stop, id: 'é'.repeat(SUPERVISOR_FRAME_BYTES) }));

	for (const frame of [{ ...stop, v: 2 }, { ...stop, op: 'arm' }, { ...stop, deadlineMs: 0 }, { ...stop, generation: null }]) {
		rejects('watchdog-protocol', () => readSupervisorRequest(frame, controller));
	}
	rejects('watchdog-protocol', () => readSupervisorRequest(stop, child));
	rejects('watchdog-protocol', () => readSupervisorRequest(stop, { ...controller, version: null }));
	assert.deepEqual(readSupervisorRequest(stop, controller), stop);
	const reply = { v: 1, id: 'req1', generation: 'g1', ok: true, state: 'draining' };
	assert.deepEqual(readSupervisorReply(reply, stop), reply);
	for (const invalid of [{ ...reply, id: 'old' }, { ...reply, generation: 'g2' }, { ...reply, v: 2 }]) {
		rejects('watchdog-protocol', () => readSupervisorReply(invalid, stop));
	}
	const start = { ...stop, op: 'start' } as const;
	assert.equal(readSupervisorReply({ ...reply, generation: 'g2', state: 'starting' }, start).generation, 'g2');
});

test('Discriminated ownership-conflict, exit-unconfirmed, supervisor-unavailable and watchdog errors', () => {
	const reply = { v: 1, id: 'req1', generation: 'g1', ok: false };
	for (const error of ['ownership-conflict', 'exit-unconfirmed', 'supervisor-unavailable',
		'watchdog-timeout', 'watchdog-channel', 'watchdog-protocol']) {
		assert.deepEqual(readSupervisorReply({ ...reply, error }, stop), { ...reply, error });
	}
	rejects('watchdog-protocol', () => readSupervisorReply({ ...reply, error: 'arbitrary' }, stop));
	rejects('watchdog-protocol', () => readSupervisorReply({ ...reply, error: 'daemon-exit-failed' }, stop));
	const failed = { ...reply, error: 'daemon-exit-failed', exit: { kind: 'failed', code: 1, signal: null } };
	assert.deepEqual(readSupervisorReply(failed, stop), failed);
});

test('Lease token, channel and generation mismatch', () => {
	const request = { ...stop, op: 'guard-release', leaseToken: 'lease1' } as const;
	assert.deepEqual(readSupervisorRequest(request, child), request);
	rejects('watchdog-protocol', () => readSupervisorRequest(request, controller));
	rejects('ownership-conflict', () => readSupervisorRequest({ ...request, generation: 'old' }, child));
	rejects('ownership-conflict', () => readSupervisorRequest({ ...request, leaseToken: 'old' }, child));
	const arm = { ...stop, op: 'arm', armSource: 'supervisor-drain', drainId: 'drain1' } as const;
	assert.deepEqual(readSupervisorRequest(arm, child), arm);
	rejects('watchdog-protocol', () => readSupervisorRequest({ ...arm, drainId: 'old' }, child));
	rejects('watchdog-protocol', () => readSupervisorRequest({ ...arm, armSource: 'signal' }, child));
	assert.deepEqual(readSupervisorRequest({ ...stop, op: 'drain' }, { role: 'parent', generation: 'g1' }),
		{ ...stop, op: 'drain' });
});

test('Update lock, version refusal and terminal outcome', () => {
	const owned = { ...stop, updateId: 'update1' };
	assert.deepEqual(readSupervisorRequest(owned, controller), owned);
	rejects('watchdog-protocol', () => readSupervisorRequest({ ...owned, op: 'status' }, controller));
	rejects('watchdog-protocol', () => readSupervisorRequest({ ...owned, updateId: '' }, controller));
	rejects('watchdog-protocol', () => readSupervisorRequest(owned, { ...controller, version: 2 }));
	const busy = { v: 1, id: 'req1', generation: 'g1', ok: false, error: 'busy' };
	assert.deepEqual(readSupervisorReply(busy, owned), busy);
	const exited = { ...busy, ok: true, state: 'exited', exit: { kind: 'forced', code: null, signal: 9 } };
	const { error: _error, ...outcome } = exited;
	assert.deepEqual(readSupervisorReply(outcome, owned), outcome);
	rejects('watchdog-protocol', () => readSupervisorReply({ ...outcome, state: 'draining' }, owned));
});

test('Missing, misplaced, reused and stale lease tokens', () => {
	const acquire = { ...stop, op: 'guard-acquire' } as const;
	const releaseFrame = { ...stop, op: 'guard-release' } as const;
	rejects('watchdog-protocol', () => readSupervisorRequest(releaseFrame, child));
	rejects('watchdog-protocol', () => readSupervisorRequest({ ...acquire, leaseToken: 'lease1' }, child));
	const request: SupervisorRequest = readSupervisorRequest(acquire, child);
	const reply = { v: 1, id: 'req1', generation: 'g1', ok: true, state: 'draining' };
	rejects('watchdog-protocol', () => readSupervisorReply(reply, request));
	assert.deepEqual(readSupervisorReply({ ...reply, leaseToken: 'lease1' }, request), { ...reply, leaseToken: 'lease1' });
	rejects('watchdog-protocol', () => readSupervisorReply({ ...reply, leaseToken: 'lease1' }, stop));
	const released = { ...releaseFrame, leaseToken: 'lease1' };
	rejects('ownership-conflict', () => readSupervisorRequest(released, { ...child, leaseToken: null }));
	rejects('ownership-conflict', () => readSupervisorRequest(released, { ...child, leaseToken: 'lease2' }));
});

test('Hello negotiates the highest common version and rejects peer identity mismatch, malformed hello and empty overlap', () => {
	const response = replyToSupervisorHello(hello, release, [1, 3, 2]);
	assert.equal(verifySupervisorHelloReply(response, hello, release, peer, peer), 2);
	rejects('watchdog-protocol', () => verifySupervisorHelloReply({ ...response, selectedVersion: 1 }, hello, release, peer, peer));
	rejects('watchdog-protocol', () => verifySupervisorHelloReply({ ...response, id: 'old' }, hello, release, peer, peer));
	rejects('ownership-conflict', () => verifySupervisorHelloReply(response, hello, release, peer, { ...peer, uid: 502 }));
	for (const supportedVersions of [[], [1, 1], [0], [1.5], Array(17).fill(1)]) {
		rejects('watchdog-protocol', () => readSupervisorHello({ ...hello, supportedVersions }));
	}
	const noOverlap = replyToSupervisorHello(hello, release, [3]);
	assert.equal(noOverlap.selectedVersion, null);
	rejects('watchdog-protocol', () => verifySupervisorHelloReply(noOverlap, hello, release, peer, peer));
});
