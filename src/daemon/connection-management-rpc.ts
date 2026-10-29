/** Strict v2 adapters. Authority comes from transport and the installed maintenance owner. */
import { TEMPORARY_MANAGEMENT_METHODS } from './db/session-management.js';
import { connectionLookupRoot as root } from './db/management-root.js';
import type { RpcHandlers } from './server.js';
import type { TrustedRpcContext } from './request-context.js';
import type { ManagementRequestContext, ManagementCapabilities, MutationRequest, DraftTestRequest, EffectiveDraft } from '../shared/connection-management.js';
import { parseRemovalStateRequest, parseDraftTestRequest, parseConnectionKey, parseMutationRequest, parseOperationTicket, ManagementInputError } from '../shared/connection-management-wire.js';
import { canonicalRequestJson } from './db/management-tickets.js';
import { ManagementServiceError, managementRejection, savedManagementFor } from './db/management.js';
import { connectionTestSupervisor, DraftTestAdmissionError } from './db/draft-test.js';
import { prepareRuntimeConfig } from './db/runtime-config.js';
import { connectionManagementEnablement } from './db/management-enablement.js';
import { lookupRepoId } from '../db/repos.js';
import { driverDescriptors, materializeDraft } from './db/driver-profiles.js';
import { savedConnectionResolver } from './db/pool-cache.js';
import { loadConnections, connectionsPath } from './db/config.js';
import { managementMarkerExists } from './db/managed-store.js';
import { CONNECTION_SESSION_METHODS } from '../shared/connection-management.js';
import type { ConnectionSessionMethod } from '../shared/connection-management.js';
import { connectionSessionRuntime } from './connection-session-rpc.js';
import type { SessionRpcRuntime } from './connection-session-rpc.js';
export const CONNECTION_V2_METHODS = [
	...CONNECTION_SESSION_METHODS,
	'db.connections.v2.capabilities', 'db.connections.v2.drivers', 'db.connections.v2.list', 'db.connections.v2.read',
	'db.connections.v2.test', 'db.connections.v2.cancelTest', 'db.connections.v2.ticket', 'db.connections.v2.mutate', 'db.connections.v2.status', 'db.connections.v2.activate', 'db.connections.v2.removalState', 'db.connections.v2.retryRemovalCleanup',
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
export interface ConnectionTestPorts {
 readonly sessionRuntime?: SessionRpcRuntime | undefined;
 readonly removalEnabled?: (()=>Promise<boolean>) | undefined;
 readonly enabled?: (()=>Promise<boolean>) | undefined;
 readonly prepareTemporary?: ((request:DraftTestRequest,context:TrustedRpcContext,signal:AbortSignal,drained:Promise<void>)=>Promise<EffectiveDraft>) | undefined;
 readonly isRegistered?: ((root:string)=>Promise<boolean>) | undefined;
}
export async function connectionManagementRpc(method: Method, value: unknown, transport?: TrustedRpcContext, testPorts:ConnectionTestPorts={}): Promise<unknown> {
	try {
		const context = trusted(transport);
  const removalReady=testPorts.removalEnabled??(async()=> (await connectionManagementEnablement(undefined,['sc5','sc6'])).ready);
  const requireRemoval=async()=>{if(!await removalReady())throw new ManagementServiceError('upgrade-required');};
		if (!CONNECTION_V2_METHODS.includes(method)) throw new ManagementInputError();
		if ((CONNECTION_SESSION_METHODS as readonly string[]).includes(method)) {
			return (testPorts.sessionRuntime ?? connectionSessionRuntime).call(method as ConnectionSessionMethod, value, context);
		}
		if (context.connectionSession && TEMPORARY_MANAGEMENT_METHODS.has(method)) {
			const runtime = testPorts.sessionRuntime ?? connectionSessionRuntime;
			if (!runtime.manage) throw new ManagementServiceError('upgrade-required');
			return await runtime.manage(method, value, context);
		}
		if(method==='db.connections.v2.cancelTest')return connectionTestSupervisor.cancel(value,context);
		if(method==='db.connections.v2.test'){
			const request=parseDraftTestRequest(value), runtime=testPorts.sessionRuntime??connectionSessionRuntime;
			if (request.key.scope === 'temporary' && request.expectedRevision !== undefined && !context.connectionSession) throw new ManagementServiceError('upgrade-required');
			const probeContext=context.connectionSession ? await (runtime.probeContext?.(context,request)??Promise.reject(new ManagementServiceError('upgrade-required'))) : context;
			return await connectionTestSupervisor.run(request,probeContext,async (signal,drained)=>{
				if(!await (testPorts.enabled??(async()=> (await connectionManagementEnablement()).ready))())throw new ManagementServiceError('upgrade-required');
				signal.throwIfAborted();const repoRoot=await root(request.key.repoRoot,true);signal.throwIfAborted();
				if(request.key.scope==='saved')return (await owner(repoRoot)).prepareDraft(managementContext(repoRoot,context),request,signal,drained);
				if(request.expectedRevision!==undefined){
					const prepare=testPorts.prepareTemporary??runtime.prepareTemporary?.bind(runtime); if(!prepare)throw new ManagementServiceError('upgrade-required');
					const effective=await prepare(request,probeContext,signal,drained);signal.throwIfAborted();return {...effective,config:await prepareRuntimeConfig(effective.config,repoRoot,signal)};
				}
				if(!await (testPorts.isRegistered??(async root=>await lookupRepoId(root)!==undefined))(repoRoot))throw new ManagementServiceError('invalid-input');
				signal.throwIfAborted();
				const effective=await materializeDraft({key:request.key,mode:'create',publicPatch:request.publicPatch,credentials:request.credentials,readSecret:async()=>{throw new ManagementServiceError('secret-unavailable');}});
				signal.throwIfAborted();
				return {...effective,config:await prepareRuntimeConfig(effective.config,repoRoot,signal)};
			});
		}
		if (method === 'db.connections.v2.capabilities') {
			const params = object(value, [], ['repoRoot']);
			const features = ['safe-read', 'driver-descriptors'];
			if(await (testPorts.sessionRuntime??connectionSessionRuntime).removalReady?.())features.push('temporary-remove','removal-state','removal-cleanup-retry');
   if (await (testPorts.sessionRuntime ?? connectionSessionRuntime).ready()) features.push('workbench-sessions', 'session-delegation');
			if(await (testPorts.enabled??(async()=> (await connectionManagementEnablement()).ready))())features.push('draft-test','test-cancellation');
			if (params.repoRoot !== undefined) {
				const repoRoot = await root(params.repoRoot), service = savedManagementFor(repoRoot);
				if (service) {
					try {
						await service.list(managementContext(repoRoot, context));
						if(await removalReady()){features.push('saved-remove');for(const feature of ['removal-state','removal-cleanup-retry'])if(!features.includes(feature))features.push(feature);}
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
			if (key.scope !== 'saved' || (typeof params.mode !== 'string' || !['create', 'update', 'remove'].includes(params.mode)))
				throw new ManagementInputError();
			if(params.mode==='remove')await requireRemoval();
   const repoRoot = await root(key.repoRoot, true);
			return await (await owner(repoRoot)).ticket(managementContext(repoRoot, context), key, params.mode as 'create' | 'update' | 'remove');
		}
		if (method === 'db.connections.v2.mutate') {
			const request = parseMutationRequest(JSON.parse(canonicalRequestJson(value))) as MutationRequest;
			if (request.key.scope !== 'saved')
				throw new ManagementInputError();
			if(request.mode==='remove')await requireRemoval();
   const repoRoot = await root(request.key.repoRoot, true);
			return await (await owner(repoRoot)).mutate(managementContext(repoRoot, context), request);
		}
		if(method==='db.connections.v2.removalState'||method==='db.connections.v2.retryRemovalCleanup'){
   const {ticket}=parseRemovalStateRequest(value);
   if(ticket.scope!=='saved')throw new ManagementServiceError('upgrade-required');
   await requireRemoval();const repoRoot=await root(ticket.lookupRoot,true),service=await owner(repoRoot);
   return await service[method==='db.connections.v2.removalState'?'removalState':'retryRemovalCleanup'](managementContext(repoRoot,context),ticket);
  }
  if (method === 'db.connections.v2.status') {
			const params = object(value, ['ticket']), ticket = parseOperationTicket(params.ticket);
			if (ticket.scope !== 'saved')
				throw new ManagementServiceError('upgrade-required');
			if(ticket.mode==='remove')await requireRemoval();
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
		return managementRejection(error instanceof DraftTestAdmissionError ? new ManagementServiceError(error.code) : error instanceof SyntaxError ? new ManagementInputError() : error);
	}
}
export function connectionManagementHandlers(testPorts:ConnectionTestPorts={}): RpcHandlers {
	return Object.fromEntries(CONNECTION_V2_METHODS.map(method => [method, (params: unknown, context?: TrustedRpcContext) => connectionManagementRpc(method, params, context,testPorts)]));
}
