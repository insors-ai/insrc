/** Invocation-local revision windows and nonserializable continuation provenance. */
import { createHash } from 'node:crypto';
import { savedConnectionResolver, sessionRegistryStamp, sessionRevisionCheck } from '../daemon/db/pool-cache.js';
import { assertAnalysisConnectionExecution, analysisConnectionContext } from './connection-access.js';
import { ConnectionExecutionError, requireConnectionExecution } from '../shared/step-context.js';
import type { ConnectionExecutionContext, SessionConnectionExecution } from '../shared/step-context.js';
interface Window { readonly owner: string; readonly fingerprint: string; readonly check: () => void }
const windows = new WeakMap<SessionConnectionExecution, Window>();
const continuations = new WeakMap<object, Pick<Window, 'owner' | 'fingerprint'>>();
export function sessionReuseOwner(execution: SessionConnectionExecution): string {
	requireConnectionExecution(execution);
	return JSON.stringify([execution.connectionAccess.daemonEpoch, execution.connectionAccess.sessionHandle, execution.connectionAccess.lookupRoot, execution.controlGeneration]);
}
async function snapshot(execution: SessionConnectionExecution): Promise<Window> {
	try {
		const root = execution.connectionAccess.lookupRoot;
		const stamp = sessionRegistryStamp(execution.connectionAccess);
		const entries = await savedConnectionResolver.list(analysisConnectionContext(root, execution));
		assertAnalysisConnectionExecution(execution);
		const revisions = entries.map(entry => [entry.key.scope, entry.key.id, entry.revision]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
		if (sessionRegistryStamp(execution.connectionAccess) !== stamp) throw new ConnectionExecutionError('session-expired');
		const validate = sessionRevisionCheck(execution.connectionAccess, entries, stamp);
		const check = () => { try { validate(); } catch { throw new ConnectionExecutionError('session-expired'); } }; check();
		return Object.freeze({ owner: sessionReuseOwner(execution), fingerprint: createHash('sha256').update(JSON.stringify(revisions)).digest('hex'), check });
	} catch { throw new ConnectionExecutionError('session-expired'); }
}
/** Capture before reading a phase input or reusing any continuation. Never infer an owner. */
export async function beginSessionReuse(execution: ConnectionExecutionContext | undefined): Promise<void> {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode !== 'session-memory') return;
	if (windows.has(execution)) return assertSessionReuse(execution);
	const value = await snapshot(execution);
	value.check();
	windows.set(execution, value);
}
export async function assertSessionReuse(execution: ConnectionExecutionContext | undefined): Promise<void> {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode !== 'session-memory') return;
	const window = windows.get(execution);
	if (!window || window.owner !== sessionReuseOwner(execution) || window.fingerprint !== (await snapshot(execution)).fingerprint) throw new ConnectionExecutionError('session-expired');
	window.check();
}
/** Safe metadata only; callers use it before touching a private stored payload. */
export function sessionReuseWindow(execution: SessionConnectionExecution): Readonly<Window> {
	assertAnalysisConnectionExecution(execution);
	const window = windows.get(execution);
	if (!window) throw new ConnectionExecutionError('session-expired');
	window.check();
	return window;
}
export async function rememberSessionContinuation<T extends object>(value: T, execution: ConnectionExecutionContext | undefined): Promise<T> {
	await assertSessionReuse(execution);
	if (execution?.mode === 'session-memory') { const window = sessionReuseWindow(execution); continuations.set(value, { owner: window.owner, fingerprint: window.fingerprint }); }
	return value;
}
export async function assertSessionContinuation(value: object, execution: ConnectionExecutionContext | undefined): Promise<void> {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode !== 'session-memory') return;
	const owned = continuations.get(value), current = sessionReuseWindow(execution);
	if (!owned || owned.owner !== current.owner || owned.fingerprint !== current.fingerprint) throw new ConnectionExecutionError('session-expired');
	await assertSessionReuse(execution);
}
export async function deriveSessionContinuation<T extends object>(previous: object, value: T, execution: ConnectionExecutionContext | undefined): Promise<T> {
	await assertSessionContinuation(previous, execution);
	return rememberSessionContinuation(value, execution);
}

/** Recheck synchronously in the caller's publication/read turn after an await. */
export function assertSessionReuseNow(execution: ConnectionExecutionContext | undefined): void {
	assertAnalysisConnectionExecution(execution);
	if (execution?.mode === 'session-memory') sessionReuseWindow(execution).check();
}
