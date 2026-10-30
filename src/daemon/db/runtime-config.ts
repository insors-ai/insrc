/** Read-only runtime paths shared by activation and draft probes. Never persists config. */
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConnectionConfig } from '../../shared/db-driver.js';
import { familyOf } from './registry.js';
import { ManagementInputError } from '../../shared/connection-management-wire.js';

export async function prepareRuntimeConfig(config: ConnectionConfig, root: string, signal?: AbortSignal): Promise<ConnectionConfig> {
	signal?.throwIfAborted();
	const family = familyOf(config.kind);
	let next = config;
	let path = config.path;
	if (config.kind === 'sqlite' && path === undefined) {
		path = config.url;
		if (path === undefined || path === '') throw new ManagementInputError();
		if (path.startsWith('file:')) {
			let url: URL;
			try { url = new URL(path); } catch { throw new ManagementInputError(); }
			if (url.hostname && url.hostname !== 'localhost' || url.search || url.hash) throw new ManagementInputError();
			try { path = fileURLToPath(url); } catch { throw new ManagementInputError(); }
		} else if (/^[a-z][a-z0-9+.-]*:/i.test(path)) throw new ManagementInputError();
	}
	if (family === 'file' || config.kind === 'sqlite') {
		if (path === undefined || path === '') throw new ManagementInputError();
		next = { ...next, path: await resolvePath(path, root, signal) };
	}
	if (config.schemaSource) next = { ...next, schemaSource: { type: config.schemaSource.type, path: await resolvePath(config.schemaSource.path, root, signal) } };
	signal?.throwIfAborted();
	return next;
}
async function resolvePath(path: string, root: string, signal?: AbortSignal): Promise<string> {
	signal?.throwIfAborted();
	const absolute = isAbsolute(path) ? path : resolve(root, path), rel = relative(root, absolute);
	if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new ManagementInputError();
	try { await access(absolute, constants.R_OK); } catch {
		signal?.throwIfAborted();
		throw new ManagementInputError();
	}
	signal?.throwIfAborted();
	return absolute;
}
