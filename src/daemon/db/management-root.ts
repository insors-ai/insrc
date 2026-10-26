/** Shared S001 root validation. Saved lookup defaults retain exact existing behavior. */
import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import { ManagementInputError } from '../../shared/connection-management-wire.js';

export async function connectionLookupRoot(value: unknown, canonical = false): Promise<string> {
	if (typeof value !== 'string' || !value || value.length > 16384 || /[\u0000-\u001f]/.test(value) || !isAbsolute(value)) throw new ManagementInputError();
	let actual: string;
	try { actual = await realpath(value); } catch { throw new ManagementInputError(); }
	if (canonical && (actual !== value || resolve(value) !== value)) throw new ManagementInputError();
	return actual;
}

export async function registeredConnectionRoot(value: unknown, isRegistered: (root: string) => Promise<boolean>): Promise<string> {
	const root = await connectionLookupRoot(value, true);
	try { if (!(await stat(root)).isDirectory() || !await isRegistered(root)) throw new Error(); }
	catch { throw new ManagementInputError(); }
	return root;
}
