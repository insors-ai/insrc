import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { IpcServer, directDispatch } from '../server.js';
import type { TrustedRpcContext } from '../request-context.js';
class Socket extends EventEmitter {
	readonly replies: unknown[] = [];
	write(line: string, done?: (error?: Error) => void): boolean {
		this.replies.push(JSON.parse(line));
		done?.();
		return true;
	}
}
interface Internals {
	handleConnection(socket: Socket): void;
	handleMessage(line: string, socket: Socket): Promise<void>;
}
test('CM-S1-J: real socket dispatch owns identity and epoch across forged params labels reconnects and direct unary forwarding', async () => {
	const contexts: TrustedRpcContext[] = [];
	const create = () => new IpcServer(directDispatch({ 'context.echo': async (_params, context) => {
			assert.ok(context);
			assert.equal(Object.isFrozen(context), true);
			contexts.push(context);
			return context;
		} }));
	const first = create(), second = create(), a = new Socket(), b = new Socket(), c = new Socket();
	const one = first as unknown as Internals, two = second as unknown as Internals;
	one.handleConnection(a);
	one.handleConnection(b);
	two.handleConnection(c);
	try {
		const line = (id: number) => JSON.stringify({ id, method: 'context.echo', params: { connectionIdentity: 'forged', daemonEpoch: 'forged', trustedContext: { connectionIdentity: 'forged', daemonEpoch: 'forged' } }, trustedContext: { connectionIdentity: 'forged', daemonEpoch: 'forged' }, client: { label: 'claimed-label-' + id, pid: 1234 + id } });
		await one.handleMessage(line(1), a);
		await one.handleMessage(line(2), a);
		await one.handleMessage(line(3), b);
		await two.handleMessage(line(4), c);
		assert.equal(contexts[0]!.connectionIdentity, contexts[1]!.connectionIdentity);
		assert.notEqual(contexts[0]!.connectionIdentity, contexts[2]!.connectionIdentity);
		assert.equal(contexts[0]!.daemonEpoch, contexts[2]!.daemonEpoch);
		assert.notEqual(contexts[0]!.daemonEpoch, contexts[3]!.daemonEpoch);
		assert.ok(contexts.every(context => context.daemonEpoch !== 'forged' && context.connectionIdentity !== 'forged'));
	}
	finally {
		a.emit('close');
		b.emit('close');
		c.emit('close');
	}
});
