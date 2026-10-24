import { AsyncLocalStorage } from 'node:async_hooks';

/** Internal lifetime channel: timeout waiters never own the underlying client work. */
const driverWork = new AsyncLocalStorage<(work: Promise<unknown>) => void>();
export function withDriverWork<T>(retain: (work: Promise<unknown>) => void, use: () => T): T {
	return driverWork.run(retain, use);
}
export function retainDriverWork<T>(work: Promise<T>): void {
	driverWork.getStore()?.(work);
}
/** Parallel client calls must all settle before their enclosing library connection closes. */
export async function allDriverWork<T extends readonly unknown[]>(work: T): Promise<{ -readonly [P in keyof T]: Awaited<T[P]> }> {
	const settled = await Promise.allSettled(work);
	for (const result of settled) if (result.status === 'rejected') throw result.reason;
	return settled.map(result => (result as PromiseFulfilledResult<unknown>).value) as { -readonly [P in keyof T]: Awaited<T[P]> };
}
