/** Provider privacy admission. Production starts with no verified adapter/service proof. */
import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { LLMProvider } from './types.js';
import { assertExplicitConnectionExecution, currentStepContext, ConnectionExecutionError } from './step-context.js';
import type { ConnectionExecutionContext } from './step-context.js';

/** Immutable diagnostic status; neither this value nor caller evidence grants authority. */
export const connectionProviderPrivacyStatus = Object.freeze({
	status: 'pending' as const,
	mode: 'unsupported' as const,
	reason: 'No configured production provider has an owner-issued local adapter and service privacy proof.',
});

interface LocalIdentity {
	readonly modelId: string;
	readonly host: string;
	readonly source: string;
	readonly memoryOnly: boolean;
	readonly assertUnchanged: () => void;
}
const identities = new WeakMap<LLMProvider, Readonly<LocalIdentity>>();
interface Proof { readonly candidate: LLMProvider; readonly identity: Readonly<LocalIdentity>; readonly digest: string; readonly sourceDigest: string; readonly assertService: () => void }
const proofs = new WeakMap<object, Proof>();
const verificationCounts = new WeakMap<LLMProvider, number>();
interface Attempt { readonly execution: ConnectionExecutionContext; readonly proof: Proof }
const attempts = new AsyncLocalStorage<Attempt>();
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const adapterFingerprint = (identity: LocalIdentity) => digest(Buffer.concat([readFileSync(identity.source), readFileSync(new URL(import.meta.url)), readFileSync(new URL('../../node_modules/ollama/package.json', import.meta.url)), readFileSync(new URL('../../node_modules/ollama/dist/index.mjs', import.meta.url)), readFileSync(new URL('../../node_modules/ollama/dist/browser.mjs', import.meta.url)), readFileSync(new URL('../agent/providers/structured-output.' + (import.meta.url.endsWith('.ts') ? 'ts' : 'js'), import.meta.url))]));

/** Internal adapter registration, called only by the concrete constructor. It
 * grants nothing: actual-service verification must issue a separate opaque proof.
 * No RPC/config/JSON surface exposes this port. */
export function recordLocalConnectionProvider(candidate: LLMProvider, identity: LocalIdentity): Readonly<LocalIdentity> {
	const captured = Object.freeze({ ...identity }); identities.set(candidate, captured); return captured;
}
function checkProof(proof: Proof): void {
	try {
		proof.identity.assertUnchanged(); proof.assertService();
		if (adapterFingerprint(proof.identity) !== proof.sourceDigest) throw new ConnectionExecutionError('unsupported-temporary');
		if (identities.get(proof.candidate) !== proof.identity) throw new ConnectionExecutionError('unsupported-temporary');
	} catch { throw new ConnectionExecutionError('unsupported-temporary'); }
}

/** Test/daemon-owned evidence collector. Runs only a generated, non-user canary
 * against an isolated server. The snapshot port and service lifetime belong to
 * the trusted server launcher; callers cannot submit boolean evidence claims.
 * The returned token is memory-only and is valid for this exact instance,
 * adapter bytes, selected model, endpoint and still-owned service process.
 */
export async function verifyLocalConnectionProvider(candidate: LLMProvider, ports: {
	readonly modelId: string; readonly host: string;
	readonly assertIsolatedService: () => void;
	readonly snapshot: () => Promise<readonly Buffer[]>;
}): Promise<object> {
	assertConnectionProviderAdmission();
	const identity = identities.get(candidate);
	const { nativeConnectionProviderIdentity } = await import('../agent/providers/ollama.js');
	if (nativeConnectionProviderIdentity(candidate) !== identity || !identity || !identity.memoryOnly || identity.modelId !== ports.modelId || identity.host !== ports.host) throw new ConnectionExecutionError('unsupported-temporary');
	const endpoint = new URL(identity.host);
	if (endpoint.protocol !== 'http:' || !['127.0.0.1', '[::1]'].includes(endpoint.hostname) || endpoint.username || endpoint.password || endpoint.pathname !== '/') throw new ConnectionExecutionError('unsupported-temporary');
	const count = verificationCounts.get(candidate) ?? 0; if (count >= 64) throw new ConnectionExecutionError('resource-limit'); verificationCounts.set(candidate, count + 1);
	identity.assertUnchanged(); ports.assertIsolatedService();
	const version = await fetch(new URL('/api/version', endpoint), { signal: AbortSignal.timeout(4000) });
	if (!version.ok) throw new ConnectionExecutionError('unsupported-temporary');
	const serviceVersion: unknown = await version.json();
	const sourceDigest = adapterFingerprint(identity);
	const marker = 'CM_LOCAL_PRIVACY_' + randomUUID().replaceAll('-', '');
	const before = await ports.snapshot();
	const response = await candidate.complete([{ role: 'user', content: 'Return exactly this marker and nothing else: ' + marker }], { maxTokens: 128, temperature: 0, cacheSystem: false, disableThinking: true, signal: AbortSignal.timeout(180000) });
	ports.assertIsolatedService(); identity.assertUnchanged();
	if (!response.text.includes(marker)) throw new ConnectionExecutionError('unsupported-temporary');
	const after = await ports.snapshot();
	if ([...before, ...after].some(bytes => bytes.includes(marker))) throw new ConnectionExecutionError('unsupported-temporary');
	const proof: Proof = Object.freeze({
		candidate, identity, sourceDigest, assertService: ports.assertIsolatedService,
		digest: digest(JSON.stringify({ sourceDigest, serviceVersion, host: identity.host, modelId: identity.modelId, before: before.map(digest), after: after.map(digest) }))
	});
	checkProof(proof);
	const token = Object.freeze(Object.create(null)) as object; proofs.set(token, proof); return token;
}

/** Before configuration, prompts, injected factories, cache or SDK calls.
 * Missing proof stays closed. Only the exact run facade can enter an attempt;
 * a kind flag, copied token or cached provider cannot authorize another object.
 */
function assertProviderAttempt(execution?: ConnectionExecutionContext, candidate?: LLMProvider): void {
	const bound = currentStepContext()?.connectionExecution;
	if (execution !== undefined || bound?.mode === 'session-memory') assertExplicitConnectionExecution(execution);
	else bound?.assertActive();
	if (execution?.mode === 'session-memory') {
		const attempt = attempts.getStore();
		if (!attempt || attempt.execution !== execution || execution.audience !== 'workbench-ui' || (candidate !== undefined && attempt.proof.candidate !== candidate)) throw new ConnectionExecutionError('unsupported-temporary');
		checkProof(attempt.proof); execution.assertActive();
	}
}

/** Native transport rechecks after awaited reads, before decoding SDK input. */
export function assertConnectionProviderTransport(candidate: LLMProvider): void {
	const attempt = attempts.getStore();
	assertProviderAttempt(attempt?.execution, candidate);
}

/** Factories and direct entry points never inherit permission to construct a
 * different provider from a running attempt. Native instance calls name self. */
export function assertConnectionProviderAdmission(execution?: ConnectionExecutionContext, candidate?: LLMProvider): void {
	assertProviderAttempt(execution, candidate);
	if (execution?.mode === 'session-memory' && candidate === undefined) throw new ConnectionExecutionError('unsupported-temporary');
}
/** Inner structured retries have no provider argument; their proof must already
 * be bound by the exact native-instance facade. Not a factory admission port. */
export function assertConnectionProviderAttempt(execution?: ConnectionExecutionContext): void {
	assertProviderAttempt(execution);
}

/** Exact selected-instance facade. It never changes a shared router/provider.
 * The default evidence set is empty; caller JSON cannot manufacture a token.
 */
export function admitConnectionProvider(candidate: LLMProvider, execution?: ConnectionExecutionContext, evidence?: unknown): LLMProvider {
	if (execution?.mode !== 'session-memory') { assertConnectionProviderAdmission(execution); return candidate; }
	assertExplicitConnectionExecution(execution);
	if (execution.audience !== 'workbench-ui') throw new ConnectionExecutionError('unsupported-temporary');
	const proof = evidence !== null && typeof evidence === 'object' ? proofs.get(evidence) : undefined;
	if (!proof || proof.candidate !== candidate) throw new ConnectionExecutionError('unsupported-temporary');
	checkProof(proof);
	const guard = () => { assertExplicitConnectionExecution(execution); execution.assertActive(); checkProof(proof); };
	const invoke = <T>(fn: (signal: AbortSignal) => Promise<T>, requested?: AbortSignal): Promise<T> => {
		guard();
		const signal = requested && requested !== execution.lifetime.signal ? AbortSignal.any([requested, execution.lifetime.signal]) : execution.lifetime.signal;
		const assertCall = () => { guard(); if (signal.aborted) throw new ConnectionExecutionError('session-expired'); };
		assertCall();
		const work = attempts.run({ execution, proof }, async () => {
			try { const value = await fn(signal); assertCall(); return value; }
			catch (error) { assertCall(); if (error instanceof ConnectionExecutionError) throw error; throw new ConnectionExecutionError('unsupported-temporary'); }
		});
		execution.lifetime.registerDrain(work); return work;
	};
	return Object.freeze({
		supportsTools: candidate.supportsTools, capabilities: Object.freeze({ ...candidate.capabilities, embeddings: false, streaming: false }),
		complete: async (messages, opts) => { guard(); return invoke(signal => candidate.complete(messages, { ...opts, connectionExecution: execution, signal, cacheSystem: false }), opts?.signal); },
		completeStructured: async <T>(messages: Parameters<LLMProvider['completeStructured']>[0], schema: Parameters<LLMProvider['completeStructured']>[1], opts?: Parameters<LLMProvider['completeStructured']>[2]) => { guard(); return invoke(signal => candidate.completeStructured<T>(messages, schema, { ...opts, connectionExecution: execution, signal }), opts?.signal); },
		async *stream() { guard(); throw new ConnectionExecutionError('unsupported-temporary'); },
		async embed() { guard(); throw new ConnectionExecutionError('unsupported-temporary'); },
	} satisfies LLMProvider);
}
