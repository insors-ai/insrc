import type { Driver } from '../../shared/db-driver.js';
import { ConnectionUseError } from './lease-gate.js';
import { withDriverWork } from './driver-work.js';
const METHODS = new Set(['describe', 'sample', 'explain', 'aggregate', 'distinct', 'listTables', 'listIndexes', 'functionalDependency', 'antiJoin', 'histogram', 'correlationMatrix', 'outliers', 'temporalTrend', 'dickeyFuller', 'temporalGapStats', 'scan', 'get', 'sampleShape', 'listNamespaces', 'describeNamespace']);
const RESULT_PROTOTYPES = new Set<object>([Object.prototype, Array.prototype, Date.prototype, Buffer.prototype, Uint8Array.prototype, ArrayBuffer.prototype, DataView.prototype, RegExp.prototype, Map.prototype, Set.prototype]);
/** A callback sees only interface members; retained views cannot start work after callback exit. */
export function guardedDriver(driver: Driver): {
	readonly driver: Driver;
	finish(): Promise<void>;
} {
	let accepting = true;
	const pending = new Set<Promise<unknown>>();
	const iterators = new Set<AsyncIterator<unknown>>();
	const check = () => {
		if (!accepting)
			throw new ConnectionUseError('conflict');
	};
	const track = <T>(value: Promise<T>): Promise<T> => {
		const promise = Promise.resolve(value);
		pending.add(promise);
		void promise.then(() => pending.delete(promise), () => pending.delete(promise));
		return promise;
	};
	let view: Driver;
	const snapshot = (value: unknown, seen = new WeakMap<object, unknown>()): unknown => {
		if (value === driver)
			throw new ConnectionUseError('conflict');
		if (typeof value === 'function')
			throw new ConnectionUseError('conflict');
		if (!value || typeof value !== 'object')
			return value;
		if (seen.has(value))
			return seen.get(value);
		const descriptors = new Map(Reflect.ownKeys(value).map(key => [key, Object.getOwnPropertyDescriptor(value, key)!]));
		for (const descriptor of descriptors.values())
			if (!Object.hasOwn(descriptor, 'value'))
				throw new ConnectionUseError('conflict');
		// Custom prototypes never leave this boundary. Reject inherited raw references without invoking accessors.
		let proto = Object.getPrototypeOf(value) as object | null;
		const prototypes = new Set<object>();
		while (proto && !RESULT_PROTOTYPES.has(proto) && !prototypes.has(proto)) {
			prototypes.add(proto);
			for (const key of Reflect.ownKeys(proto)) {
				const descriptor = Object.getOwnPropertyDescriptor(proto, key)!;
				if (Object.hasOwn(descriptor, 'value') && descriptor.value === driver)
					throw new ConnectionUseError('conflict');
			}
			proto = Object.getPrototypeOf(proto) as object | null;
		}
		// Inspect native values' own properties too; their standard serializers omit those properties.
		for (const descriptor of descriptors.values())
			if (descriptor.value === driver || typeof descriptor.value === 'function')
				throw new ConnectionUseError('conflict');
		if (value instanceof Date) {
			const result = new Date(Date.prototype.getTime.call(value));
			seen.set(value, result);
			return result;
		}
		if (Buffer.isBuffer(value)) {
			const result = Buffer.from(value);
			seen.set(value, result);
			return result;
		}
		if (value instanceof ArrayBuffer || ArrayBuffer.isView(value) || value instanceof RegExp) {
			const result = structuredClone(value);
			seen.set(value, result);
			return result;
		}
		if (value instanceof Map) {
			const result = new Map<unknown, unknown>();
			seen.set(value, result);
			Map.prototype.forEach.call(value, (v: unknown, k: unknown) => result.set(snapshot(k, seen), snapshot(v, seen)));
			return result;
		}
		if (value instanceof Set) {
			const result = new Set<unknown>();
			seen.set(value, result);
			Set.prototype.forEach.call(value, (v: unknown) => result.add(snapshot(v, seen)));
			return result;
		}
		// Preserve the existing wire value of database classes (for example BSON ObjectId), while the lease is held.
		if (Object.getPrototypeOf(value) !== Object.prototype && !Array.isArray(value)) {
			let owner: object | null = value;
			while (owner) {
				const descriptor = Object.getOwnPropertyDescriptor(owner, 'toJSON');
				if (descriptor) {
					if (!Object.hasOwn(descriptor, 'value'))
						throw new ConnectionUseError('conflict');
					if (typeof descriptor.value === 'function') {
						const result = Reflect.apply(descriptor.value, value, []);
						if (result === value)
							break;
						return snapshot(result, seen);
					}
					break;
				}
				owner = Object.getPrototypeOf(owner) as object | null;
			}
		}
		const result = Array.isArray(value) ? new Array(value.length) : Object.create(Object.getPrototypeOf(value) === null ? null : Object.prototype) as object;
		seen.set(value, result);
		for (const [key, descriptor] of descriptors) {
			if (Array.isArray(value) && key === 'length')
				continue;
			Object.defineProperty(result, key, { ...descriptor, value: snapshot(descriptor.value, seen) });
		}
		return result;
	};
	const wrap = (value: unknown): unknown => {
		if (value === driver)
			return view;
		if (value && typeof value === 'object' && Symbol.asyncIterator in value) {
			const iterator = (value as AsyncIterable<unknown>)[Symbol.asyncIterator]();
			iterators.add(iterator);
			const call = (kind: 'next' | 'return' | 'throw', arg?: unknown) => {
				try {
					check();
					const method = iterator[kind];
					if (!method) {
						iterators.delete(iterator);
						return Promise.resolve({ done: true, value: undefined });
					}
					return track(Promise.resolve(withDriverWork(track, () => method.call(iterator, arg))).then(result => {
						if (result.done)
							iterators.delete(iterator);
						return { done: result.done, value: wrap(result.value) };
					}).catch(error => {
						throw driverFailure(error);
					}));
				}
				catch (error) {
					throw driverFailure(error);
				}
			};
			return { [Symbol.asyncIterator]() {
					return this;
				}, next: (arg?: unknown) => call('next', arg), return: (arg?: unknown) => call('return', arg), throw: (arg?: unknown) => call('throw', arg) };
		}
		return snapshot(value);
	};
	const target = Object.create(null) as Record<string, unknown>;
	for (const key of ['id', 'kind', 'family'])
		Object.defineProperty(target, key, { enumerable: true, configurable: true, get: () => {
				try {
					check();
					const value: unknown = Reflect.get(driver, key);
					if (typeof value !== 'string')
						throw new ConnectionUseError('conflict');
					return value;
				}
				catch (error) {
					throw driverFailure(error);
				}
			} });
	for (const key of METHODS) {
		let method: unknown;
		try {
			method = Reflect.get(driver, key);
		}
		catch (error) {
			throw driverFailure(error);
		}
		if (typeof method !== 'function')
			continue;
		Object.defineProperty(target, key, { enumerable: true, configurable: true, value: (...args: unknown[]) => {
				try {
					check();
					const result = withDriverWork(track, () => Reflect.apply(method, driver, args));
					if (result && (typeof result === 'object' || typeof result === 'function') && typeof Reflect.get(result, 'then') === 'function')
						return track(Promise.resolve(result).then(wrap).catch(error => {
							throw driverFailure(error);
						}));
					return wrap(result);
				}
				catch (error) {
					throw driverFailure(error);
				}
			} });
	}
	Object.defineProperty(target, 'close', { value: () => {
			throw new ConnectionUseError('busy');
		} });
	view = Object.freeze(target) as unknown as Driver;
	return { driver: view, async finish() {
			accepting = false;
			while (iterators.size || pending.size) {
				const closing: Promise<unknown>[] = [];
				for (const iterator of iterators) {
					iterators.delete(iterator);
					closing.push(Promise.resolve().then(() => {
						const finish = iterator.return;
						return finish ? withDriverWork(track, () => Reflect.apply(finish, iterator, [])) : undefined;
					}));
				}
				await Promise.allSettled(closing);
				if (pending.size)
					await Promise.allSettled([...pending]);
			}
		} };
}
/** Exceptions cross the capability boundary as fresh errors, never as source-owned objects. */
export function driverFailure(error: unknown): Error {
	try {
		if (error instanceof ConnectionUseError) {
			const code = Object.getOwnPropertyDescriptor(error, 'code');
			if (code && Object.hasOwn(code, 'value') && ['busy', 'conflict', 'not-found', 'duplicate-id'].includes(code.value))
				return new ConnectionUseError(code.value);
		}
		if (!(error instanceof Error))
			return new ConnectionUseError('conflict');
		const message = Object.getOwnPropertyDescriptor(error, 'message');
		const result = new Error(message && Object.hasOwn(message, 'value') && typeof message.value === 'string' ? message.value : 'Connection operation failed.');
		for (const key of ['name', 'code']) {
			const descriptor = Object.getOwnPropertyDescriptor(error, key);
			if (descriptor && Object.hasOwn(descriptor, 'value') && (typeof descriptor.value === 'string' || typeof descriptor.value === 'number'))
				Object.defineProperty(result, key, { value: descriptor.value, enumerable: true, configurable: true });
		}
		return result;
	}
	catch {
		return new ConnectionUseError('conflict');
	}
}
