/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { registerHooks } from 'node:module';
import { threadId } from 'node:worker_threads';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

interface GuardOptions {
	readonly archive: string;
	readonly requestPublicStop: () => Promise<unknown>;
	readonly attest: (table: 'main' | 'worker', thread: number) => void;
	readonly registerMainDrain: (drain: () => unknown) => void;
}

type AdminHandlers = Record<string, (...args: never[]) => unknown>;
type AdminGuard = (table: 'main' | 'worker', handlers: AdminHandlers) => AdminHandlers;
const GUARD = Symbol.for('insrc.legacyAdminGuard');

/** Intercept only the two attested imports of the archived admin tables. */
export function installLegacyAdminGuard(options: GuardOptions): void {
	const admin = pathToFileURL(join(options.archive, 'out/daemon/admin-handlers.js')).href;
	const main = pathToFileURL(join(options.archive, 'out/daemon/handler-runtime.js')).href;
	const worker = pathToFileURL(join(options.archive, 'out/daemon/threads/admin-worker.js')).href;
	const guard: AdminGuard = (table, handlers) => {
		const drain = handlers['daemon.shutdown'];
		if (drain === undefined || handlers['daemon.update'] === undefined
			|| (table === 'main') !== (threadId === 0)) throw new Error('archived admin table does not match the qualified layout');
		if (table === 'main') options.registerMainDrain(drain);
		options.attest(table, threadId);
		return {
			...handlers,
			'daemon.update': async () => { throw new Error('Restored daemon updates require the current insrc installer'); },
			'daemon.shutdown': options.requestPublicStop,
		};
	};
	Object.defineProperty(globalThis, GUARD, { value: guard, configurable: false });
	const sources = new Map<string, string>();
	registerHooks({
		resolve(specifier, context, next) {
			const resolved = next(specifier, context);
			if (resolved.url !== admin || (context.parentURL !== main && context.parentURL !== worker)) return resolved;
			const table = context.parentURL === main ? 'main' : 'worker';
			const url = admin + '?insrc-guard=' + table;
			const exported = table === 'main' ? 'sharedAdminHandlers' : 'adminWorkerHandlers';
			sources.set(url, [
				`import { ${exported} as original } from ${JSON.stringify(admin)};`,
				`const guard = globalThis[Symbol.for(${JSON.stringify(Symbol.keyFor(GUARD))})];`,
				`export const ${exported} = (...args) => guard(${JSON.stringify(table)}, original(...args));`,
			].join('\n'));
			return { url, format: 'module', shortCircuit: true };
		},
		load(url, context, next) {
			const source = sources.get(url);
			return source === undefined ? next(url, context) : { format: 'module', source, shortCircuit: true };
		},
	});
}
