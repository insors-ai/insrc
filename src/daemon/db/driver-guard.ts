import type { Driver } from '../../shared/db-driver.js';
import { ConnectionUseError } from './lease-gate.js';
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
	const assertNoRawDriver = (value: unknown, seen = new WeakSet<object>()): void => {
		if (value === driver)
			throw new ConnectionUseError('conflict');
		if (!value || typeof value !== 'object' || seen.has(value))
			return;
		seen.add(value);
		for (const key of Reflect.ownKeys(value)) {
			const property = Object.getOwnPropertyDescriptor(value, key)!;
			if (!Object.hasOwn(property, 'value'))
				throw new ConnectionUseError('conflict');
			assertNoRawDriver(property.value, seen);
		}
		const prototype = Object.getPrototypeOf(value) as object | null;
		if (prototype && !RESULT_PROTOTYPES.has(prototype))
			assertNoRawDriver(prototype, seen);
		if (value instanceof Map)
			Map.prototype.forEach.call(value, (v: unknown, k: unknown) => {
				assertNoRawDriver(k, seen);
				assertNoRawDriver(v, seen);
			});
		if (value instanceof Set)
			Set.prototype.forEach.call(value, (v: unknown) => assertNoRawDriver(v, seen));
	};
	const wrap = (value: unknown): unknown => {
		if (value === driver)
			return view;
		if (value && typeof value === 'object' && Symbol.asyncIterator in value) {
			const iterator = (value as AsyncIterable<unknown>)[Symbol.asyncIterator]();
			iterators.add(iterator);
			const call = (kind: 'next' | 'return' | 'throw', arg?: unknown) => {
				check();
				const method = iterator[kind];
				if (!method) {
					iterators.delete(iterator);
					return Promise.resolve({ done: true, value: undefined });
				}
				return track(Promise.resolve(method.call(iterator, arg)).then(result => {
					if (result.done)
						iterators.delete(iterator);
					return { done: result.done, value: wrap(result.value) };
				}));
			};
			return { [Symbol.asyncIterator]() {
					return this;
				}, next: (arg?: unknown) => call('next', arg), return: (arg?: unknown) => call('return', arg), throw: (arg?: unknown) => call('throw', arg) };
		}
		assertNoRawDriver(value);
		return value;
	};
	const target = Object.create(null) as Record<string, unknown>;
	for (const key of ['id', 'kind', 'family'])
		Object.defineProperty(target, key, { enumerable: true, configurable: true, get: () => {
				check();
				return Reflect.get(driver, key);
			} });
	for (const key of METHODS) {
		const method = Reflect.get(driver, key);
		if (typeof method !== 'function')
			continue;
		Object.defineProperty(target, key, { enumerable: true, configurable: true, value: (...args: unknown[]) => {
				check();
				const result = Reflect.apply(method, driver, args);
				if (result && (typeof result === 'object' || typeof result === 'function') && typeof Reflect.get(result, 'then') === 'function')
					return track(Promise.resolve(result).then(wrap));
				return wrap(result);
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
					if (iterator.return)
						closing.push(Promise.resolve().then(() => iterator.return!()));
				}
				await Promise.allSettled(closing);
				if (pending.size)
					await Promise.allSettled([...pending]);
			}
		} };
}
