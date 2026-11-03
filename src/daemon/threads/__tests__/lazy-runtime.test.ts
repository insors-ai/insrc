/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic 86197ac6, Story s4 / t5: the main thread's handler runtime, built by the local forward
 * on its first request: once, reused after, answered with its error when the build fails and
 * built again by the next request; a step handler's nested in-daemon call works once built.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { directDispatch } from '../../server.js';
import type { DeliverEnvelope, ForwardRequest, RpcHandlers } from '../../server.js';
import { createInDaemonClient, installStepDaemonClient, stepDaemonClient } from '../../steps/daemon-client.js';
import type { InDaemonClient } from '../../steps/daemon-client.js';
import { lazyForward } from '../lazy-runtime.js';
import type { LocalRequestEnvelope } from '../channel.js';

let seq = 0;
/** One request through `forward`; resolves with its reply, or a stream's last frame. */
function ask(forward: ForwardRequest, method: string, stream = false): Promise<{ result?: unknown; error?: string }> {
	return new Promise(resolve => {
		const deliver: DeliverEnvelope = e => {
			if (e.kind === 'reply') { resolve({ ...(e.result !== undefined ? { result: e.result } : {}), ...(e.error !== undefined ? { error: e.error } : {}) }); return; }
			const frame = e.frame as { stream: string; data: unknown };
			if (frame.stream === 'done') resolve({ result: frame.data });
			if (frame.stream === 'error') resolve({ error: (frame.data as { error: string }).error });
		};
		forward({ kind: 'request', requestId: `r${++seq}`, method, params: null, stream } as LocalRequestEnvelope, deliver);
	});
}

test('lazy runtime: the local forward builds once on the first local request and reuses it; a failed build answers that request and the next one builds again', async () => {
	let builds = 0;
	let failNext = true;
	const lazy = lazyForward(() => {
		builds++;
		if (failNext) { failNext = false; throw new Error('a handler table failed to load'); }
		return directDispatch({ 'x.echo': async () => `served by build ${builds}` });
	});
	assert.equal(lazy.built(), false, 'nothing built before the first request');
	assert.deepEqual(await ask(lazy.forward, 'x.echo'), { error: 'a handler table failed to load' }, 'a failed build answers that request with its error');
	assert.deepEqual(await ask(lazy.forward, 'x.echo', true), { result: 'served by build 2' }, 'the next request builds again');
	assert.equal(lazy.built(), true);
	assert.deepEqual(await ask(lazy.forward, 'x.echo'), { result: 'served by build 2' }, 'later requests reuse the built runtime');
	assert.equal(builds, 2, 'one failed build, one good build, no more');

	// A stream request whose build fails gets an error frame.
	const failing = lazyForward(() => { throw new Error('no tables'); });
	assert.deepEqual(await ask(failing.forward, 'x.echo', true), { error: 'no tables' });
});

test('lazy runtime: a nested in-daemon call made while serving a local request works after the lazy build', async () => {
	installStepDaemonClient(undefined);
	// The build makes the tables and installs the in-daemon client over them, as the daemon's main thread does.
	const lazy = lazyForward(() => {
		const handlers: RpcHandlers = {
			'x.inner': async () => 'inner result',
			'x.outer': async () => ({ nested: await (stepDaemonClient() as InDaemonClient).request('x.inner', null) }),
		};
		installStepDaemonClient(createInDaemonClient(handlers, {}));
		return directDispatch(handlers);
	});
	assert.throws(() => stepDaemonClient(), /no daemon client is installed/, 'no client before the first local request');
	assert.deepEqual(await ask(lazy.forward, 'x.outer'), { result: { nested: 'inner result' } });
	installStepDaemonClient(undefined);
});
