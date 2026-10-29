/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The per-call context of a step tool run in the daemon (Epic c2ba6fa6,
 * Story s11). The step handlers used to read the MCP process's working
 * directory, its INSRC_REPO and the calling client; in the daemon those are
 * the caller's, carried here in an AsyncLocalStorage around each handler run.
 *
 * Inside a context its values are used and the process's are not. Outside one
 * (a daemon-internal caller, or the MCP server calling a handler in-process)
 * the readers keep the process defaults.
 *
 * In src/shared because src/analyze/context/scope.ts reads it too.
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import type { ConnectionAccessContext, ConnectionScope } from './connection-management.js';

/** Internal, explicit execution tuple. Never accepted from JSON or serialized into a run. */
export interface ConnectionExecutionLifetime {
	readonly signal: AbortSignal;
	readonly registerDrain: (work: PromiseLike<unknown>) => void;
}
export interface ConnectionExecutionRevision {
	readonly id: string;
	readonly scope: ConnectionScope;
	readonly revision: string;
}
export interface ConnectionExecutionDiagnostics {
	/** Lazy: a quiet sink must never evaluate source-bearing formatting. */
	readonly emit: (level: 'trace' | 'debug' | 'info' | 'warn' | 'error', format: () => unknown) => void;
}
interface ConnectionExecutionBase {
	readonly connectionAccess: Readonly<ConnectionAccessContext>;
	readonly lifetime: ConnectionExecutionLifetime;
	readonly revisions: readonly ConnectionExecutionRevision[];
	readonly diagnostics: ConnectionExecutionDiagnostics;
	/** Revalidate authority after awaits, before reuse and before every provider attempt. */
	readonly assertActive: () => void;
}
export interface SavedConnectionExecution extends ConnectionExecutionBase {
	readonly mode: 'saved';
	readonly provider: { readonly mode: 'saved-default' };
}
export interface SessionConnectionExecution extends ConnectionExecutionBase {
	readonly mode: 'session-memory';
	readonly bindingId: string;
	readonly audience: 'workbench-ui' | 'mcp-unverified';
	readonly controlGeneration: number;
	readonly provider: { readonly mode: 'verified-local'; readonly modelId: string; readonly evidenceDigest: string }
		| { readonly mode: 'unsupported' };
}
export type ConnectionExecutionContext = SavedConnectionExecution | SessionConnectionExecution;

export type ConnectionExecutionErrorCode = 'session-expired' | 'upgrade-required' | 'unsupported-temporary' | 'resource-limit';
const executionErrorCodes = new WeakMap<object, ConnectionExecutionErrorCode>();
export class ConnectionExecutionError extends Error {
	readonly code: ConnectionExecutionErrorCode;
	constructor(code: ConnectionExecutionErrorCode) {
		const safe = code === 'session-expired' || code === 'upgrade-required' || code === 'resource-limit' ? code : 'unsupported-temporary';
		super(safe); this.code = safe;
		this.name = 'ConnectionExecutionError'; executionErrorCodes.set(this, safe);
	}
}
/** Identity-only projection: no name/message/code getter or proxy trap is read. */
export function connectionExecutionErrorCode(error: unknown): ConnectionExecutionErrorCode | undefined {
	return error !== null && (typeof error === 'object' || typeof error === 'function') ? executionErrorCodes.get(error) : undefined;
}

const savedExecutions = new WeakSet<object>();
const sessionExecutions = new WeakSet<object>();

/** Only trusted unattached entry points may explicitly choose saved execution. */
export function savedConnectionExecution(
	access: ConnectionAccessContext,
	lifetime: ConnectionExecutionLifetime,
	diagnostics: ConnectionExecutionDiagnostics,
): SavedConnectionExecution {
	// A bound request cannot mint replacement saved authority after losing its tuple.
	if (currentStepContext()?.connectionExecution !== undefined) throw new ConnectionExecutionError('session-expired');
	if (access.sessionHandle !== undefined || !access.lookupRoot || !access.daemonEpoch) {
		throw new ConnectionExecutionError('session-expired');
	}
	const signal = lifetime.signal;
	const execution: SavedConnectionExecution = {
		mode: 'saved', connectionAccess: Object.freeze({ ...access }),
		lifetime: Object.freeze({ signal: lifetime.signal, registerDrain: lifetime.registerDrain }),
		revisions: Object.freeze([]), diagnostics: Object.freeze({ emit: diagnostics.emit }),
		provider: Object.freeze({ mode: 'saved-default' }),
		assertActive: () => { if (signal.aborted) throw new ConnectionExecutionError('session-expired'); },
	};
	Object.defineProperty(execution, 'toJSON', { value: () => { throw new ConnectionExecutionError('upgrade-required'); } });
	savedExecutions.add(execution);
	return Object.freeze(execution);
}

/** Called only by the authenticated daemon owner; caller JSON is never a construction input. */
export function sessionConnectionExecution(access: Readonly<ConnectionAccessContext>, authority: {
 readonly bindingId: string; readonly audience: SessionConnectionExecution['audience']; readonly controlGeneration: number;
 readonly lifetime: ConnectionExecutionLifetime; readonly assertActive: () => void;
}): SessionConnectionExecution {
 if (currentStepContext()?.connectionExecution || !Object.isFrozen(access) || !access.sessionHandle || !access.lookupRoot || !access.daemonEpoch) throw new ConnectionExecutionError('session-expired');
 const signal = authority.lifetime.signal, assertOwner = authority.assertActive;
 const assertActive = () => { if (signal.aborted) throw new ConnectionExecutionError('session-expired'); try { assertOwner(); } catch { throw new ConnectionExecutionError('session-expired'); } };
 assertActive();
 const execution: SessionConnectionExecution = { mode: 'session-memory', connectionAccess: access, bindingId: authority.bindingId, audience: authority.audience,
  controlGeneration: authority.controlGeneration, lifetime: Object.freeze({ ...authority.lifetime }), revisions: Object.freeze([]), diagnostics: Object.freeze({ emit: () => {} }),
  provider: Object.freeze({ mode: 'unsupported' }), assertActive };
 Object.defineProperty(execution, 'toJSON', { value: () => { throw new ConnectionExecutionError('upgrade-required'); } });
 sessionExecutions.add(execution); return Object.freeze(execution);
}

/** No missing-policy fallback. Only exact daemon-minted execution objects are admitted. */
export function requireConnectionExecution(value: ConnectionExecutionContext | undefined): ConnectionExecutionContext {
	if (value === undefined || (!savedExecutions.has(value) && !sessionExecutions.has(value))) throw new ConnectionExecutionError('session-expired');
	value.assertActive();
	return value;
}

/** The calling client in its one form. The one-shot analyze converts it to
 *  'cli-claude' | 'cli-codex' | 'cli-vibe' for runWithClientProviderContext. */
export type StepClient = 'claude' | 'codex' | 'vibe';

export interface StepCallContext {
 /** Verified helper carrier checked by the step host; never read from raw tool arguments. */
 readonly controllerReview?: import('./controller-review.js').ControllerExecutionCapability | undefined;
	readonly cwd:      string;
	readonly envRepo?: string | undefined;
	readonly client?:  StepClient | undefined;
	/** Out-of-band trusted carrier; the host must never read this from caller JSON. */
	readonly connectionExecution?: ConnectionExecutionContext | undefined;
}

const storage = new AsyncLocalStorage<StepCallContext>();

/** Run `fn` with `ctx` as the step context of everything it awaits. */
export function runInStepContext<T>(ctx: StepCallContext, fn: () => Promise<T>): Promise<T> {
	const outer = storage.getStore()?.connectionExecution;
	if (outer !== undefined && ctx.connectionExecution !== outer) return Promise.reject(new ConnectionExecutionError('session-expired'));
	return storage.run(Object.freeze({ ...ctx }), fn);
}

/** The step context of the current call, or undefined outside a step call. */
export function currentStepContext(): StepCallContext | undefined {
	return storage.getStore();
}

/** Denial-only loss guard. Never infer or return authority from the call context.
 * A trusted attached host binds its tuple for the request; relays still pass that
 * exact tuple explicitly. Only genuinely unbound legacy entry points may omit it.
 */
export function assertExplicitConnectionExecution(value: ConnectionExecutionContext | undefined): void {
	const bound = storage.getStore()?.connectionExecution;
	if (bound !== undefined && value !== bound) throw new ConnectionExecutionError('session-expired');
	if (value !== undefined) requireConnectionExecution(value);
}

/** The caller's working directory inside a step call, process.cwd() outside one. */
export function stepCwd(): string {
	return storage.getStore()?.cwd ?? process.cwd();
}

/** The caller's INSRC_REPO inside a step call (undefined when the caller had
 *  none: the daemon's own is never used for it), the process's outside one. */
export function stepEnvRepo(): string | undefined {
	const ctx = storage.getStore();
	const env = ctx !== undefined ? ctx.envRepo : process.env['INSRC_REPO'];
	return env !== undefined && env.length > 0 ? env : undefined;
}

/** The calling client inside a step call; undefined outside one. */
export function stepClient(): StepClient | undefined {
	return storage.getStore()?.client;
}

/** The tools the daemon's `step.call` request runs (the MCP server forwards them). */
export const STEP_TOOL_NAMES = [
	'insrc_analyze',
	'insrc_analyze_step',
	'insrc_workflow_step',
	'insrc_build_step',
	'insrc_review_step',
	'insrc_code_review_step',
	'insrc_triage',
] as const;
export type StepToolName = typeof STEP_TOOL_NAMES[number];

/** Bind explicit Session execution only so omitted sink policy can deny, never downgrade.
 * Genuine Saved callers retain their existing context and lazy entry behavior. */
export function runWithConnectionExecution<T>(execution: ConnectionExecutionContext | undefined, fn: () => Promise<T>): Promise<T> {
	assertExplicitConnectionExecution(execution);
	if (execution?.mode !== 'session-memory' || currentStepContext()?.connectionExecution === execution) return fn();
	return runInStepContext({ ...currentStepContext(), cwd: execution.connectionAccess.lookupRoot, connectionExecution: execution }, fn);
}
