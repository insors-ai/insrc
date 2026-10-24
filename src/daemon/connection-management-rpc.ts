/** Strict v2 adapters. Authority comes from transport and the installed maintenance owner. */
import { realpath } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import type { RpcHandlers } from './server.js';
import type { TrustedRpcContext } from './request-context.js';
import type { ManagementRequestContext, ManagementCapabilities, MutationRequest } from '../shared/connection-management.js';
import { parseConnectionKey, parseMutationRequest, parseOperationTicket, ManagementInputError } from '../shared/connection-management-wire.js';
import { canonicalRequestJson } from './db/management-tickets.js';
import { ManagementServiceError, managementRejection, savedManagementFor } from './db/management.js';
import { driverDescriptors } from './db/driver-profiles.js';
import { savedConnectionResolver } from './db/pool-cache.js';
import { loadConnections, connectionsPath } from './db/config.js';
import { managementMarkerExists } from './db/managed-store.js';
export const CONNECTION_V2_METHODS = [
	'db.connections.v2.capabilities', 'db.connections.v2.drivers', 'db.connections.v2.list', 'db.connections.v2.read',
	'db.connections.v2.ticket', 'db.connections.v2.mutate', 'db.connections.v2.status', 'db.connections.v2.activate',
] as const;
type Method = typeof CONNECTION_V2_METHODS[number];
function object(value: unknown, required: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
	const parsed = JSON.parse(canonicalRequestJson(value === undefined ? {} : value)) as unknown;
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
		throw new ManagementInputError();
	const record = parsed as Record<string, unknown>;
	if (required.some(key => !Object.hasOwn(record, key)) || Object.keys(record).some(key => !required.includes(key) && !optional.includes(key)))
		throw new ManagementInputError();
	return record;
}
function trusted(context: TrustedRpcContext | undefined): TrustedRpcContext {
	if (!context || typeof context.connectionIdentity !== 'string' || !context.connectionIdentity || typeof context.daemonEpoch !== 'string' || !context.daemonEpoch)
		throw new ManagementInputError();
	return context;
}
async function root(value: unknown, canonical = false): Promise<string> {
	if (typeof value !== 'string' || !value || value.length > 16384 || /[\u0000-\u001f]/.test(value) || !isAbsolute(value))
		throw new ManagementInputError();
	let actual: string;
	try {
		actual = await realpath(value);
	}
	catch {
		throw new ManagementInputError();
	}
	if (canonical && (actual !== value || resolve(value) !== value))
		throw new ManagementInputError();
	return actual;
}
export function managementContext(repoRoot: string, context: TrustedRpcContext): ManagementRequestContext {
	return { connectionIdentity: context.connectionIdentity, access: { lookupRoot: repoRoot, managementRepoRoot: repoRoot, daemonEpoch: context.daemonEpoch } };
}
async function owner(repoRoot: string) {
	const service = savedManagementFor(repoRoot);
	if (!service)
		throw new ManagementServiceError(await managementMarkerExists(connectionsPath(repoRoot)) ? 'recovery-required' : 'upgrade-required');
	return service;
}
async function safeList(repoRoot: string, context: TrustedRpcContext) {
	const service = savedManagementFor(repoRoot);
	if (service)
		return service.list(managementContext(repoRoot, context));
	let registry: Awaited<ReturnType<typeof loadConnections>>;
	try {
		registry = await loadConnections(repoRoot);
	}
	catch {
		throw new ManagementServiceError('registry-unreadable');
	}
	if (registry.file._management || await managementMarkerExists(connectionsPath(repoRoot)))
		throw new ManagementServiceError('recovery-required');
	return savedConnectionResolver.list({ lookupRoot: repoRoot, daemonEpoch: context.daemonEpoch });
}
export async function connectionManagementRpc(method: Method, value: unknown, transport?: TrustedRpcContext): Promise<unknown> {
	try {
		const context = trusted(transport);
		if (!CONNECTION_V2_METHODS.includes(method)) throw new ManagementInputError();
		if (method === 'db.connections.v2.capabilities') {
			const params = object(value, [], ['repoRoot']);
			const features = ['safe-read', 'driver-descriptors'];
			if (params.repoRoot !== undefined) {
				const repoRoot = await root(params.repoRoot), service = savedManagementFor(repoRoot);
				if (service) {
					try {
						await service.list(managementContext(repoRoot, context));
						features.push('saved-create', 'saved-update', 'operation-tickets', 'operation-status', 'activation-retry', 'immutable-credentials', 'full-use-leases', 'memory-only-files');
					}
					catch { /* Failed gates never advertise mutation authority. */
					}
				}
			}
			return { version: 2, daemonEpoch: context.daemonEpoch, features, receiptRetentionDays: 30 } satisfies ManagementCapabilities;
		}
		if (method === 'db.connections.v2.drivers') {
			object(value, []);
			return driverDescriptors();
		}
		if (method === 'db.connections.v2.list') {
			const params = object(value, ['repoRoot']);
			return await safeList(await root(params.repoRoot), context);
		}
		if (method === 'db.connections.v2.read') {
			const params = object(value, ['key']), key = parseConnectionKey(params.key);
			if (key.scope !== 'saved')
				throw new ManagementServiceError('upgrade-required');
			const repoRoot = await root(key.repoRoot, true), connections = await safeList(repoRoot, context), connection = connections.find(item => item.key.id === key.id);
			if (!connection)
				throw new ManagementServiceError('not-found');
			return connection;
		}
		if (method === 'db.connections.v2.ticket') {
			const params = object(value, ['key', 'mode']), key = parseConnectionKey(params.key);
			if (key.scope !== 'saved' || (typeof params.mode !== 'string' || !['create', 'update'].includes(params.mode)))
				throw new ManagementInputError();
			const repoRoot = await root(key.repoRoot, true);
			return await (await owner(repoRoot)).ticket(managementContext(repoRoot, context), key, params.mode as 'create' | 'update');
		}
		if (method === 'db.connections.v2.mutate') {
			const request = parseMutationRequest(JSON.parse(canonicalRequestJson(value))) as MutationRequest;
			if (request.key.scope !== 'saved' || request.mode === 'remove')
				throw new ManagementInputError();
			const repoRoot = await root(request.key.repoRoot, true);
			return await (await owner(repoRoot)).mutate(managementContext(repoRoot, context), request);
		}
		if (method === 'db.connections.v2.status') {
			const params = object(value, ['ticket']), ticket = parseOperationTicket(params.ticket);
			if (ticket.scope !== 'saved')
				throw new ManagementServiceError('upgrade-required');
			const repoRoot = await root(ticket.lookupRoot, true);
			return await (await owner(repoRoot)).status(managementContext(repoRoot, context), ticket);
		}
		const params = object(value, ['key', 'committedRevision']), key = parseConnectionKey(params.key);
		if (key.scope !== 'saved' || typeof params.committedRevision !== 'string' || !params.committedRevision || params.committedRevision.length > 16384)
			throw new ManagementInputError();
		const repoRoot = await root(key.repoRoot, true);
		return await (await owner(repoRoot)).retryActivation(managementContext(repoRoot, context), { key, committedRevision: params.committedRevision });
	}
	catch (error) {
		return managementRejection(error instanceof SyntaxError ? new ManagementInputError() : error);
	}
}
export function connectionManagementHandlers(): RpcHandlers {
	return Object.fromEntries(CONNECTION_V2_METHODS.map(method => [method, (params: unknown, context?: TrustedRpcContext) => connectionManagementRpc(method, params, context)]));
}
