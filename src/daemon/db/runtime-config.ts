/** Read-only runtime paths shared by activation and draft probes. Never persists config. */
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConnectionConfig } from '../../shared/db-driver.js';
import { familyOf } from './registry.js';

export async function prepareRuntimeConfig(config: ConnectionConfig, root: string, signal?: AbortSignal): Promise<ConnectionConfig> {
	signal?.throwIfAborted();
	const family = familyOf(config.kind);
	let next = config;
	let path = config.path;
	if (config.kind === 'sqlite' && path === undefined) {
		path = config.url;
		if (path === undefined || path === '') throw new Error('SQLite path is required.');
		if (path.startsWith('file:')) {
			const url = new URL(path);
			if (url.hostname && url.hostname !== 'localhost' || url.search || url.hash) throw new Error('Invalid SQLite file URL.');
			path = fileURLToPath(url);
		} else if (/^[a-z][a-z0-9+.-]*:/i.test(path)) throw new Error('Invalid SQLite path.');
	}
	if (family === 'file' || config.kind === 'sqlite') {
		if (path === undefined || path === '') throw new Error('Connection path is required.');
		next = { ...next, path: await resolvePath(path, root, signal) };
	}
	if (config.schemaSource) next = { ...next, schemaSource: { type: config.schemaSource.type, path: await resolvePath(config.schemaSource.path, root, signal) } };
	signal?.throwIfAborted();
	return next;
}
async function resolvePath(path: string, root: string, signal?: AbortSignal): Promise<string> {
	signal?.throwIfAborted();
	const absolute = isAbsolute(path) ? path : resolve(root, path), rel = relative(root, absolute);
	if (rel === '..' || rel.startsWith('../') || isAbsolute(rel)) throw new Error('Connection path resolves outside the repository.');
	await access(absolute, constants.R_OK);
	signal?.throwIfAborted();
	return absolute;
}
