import type { ConnectionExecutionContext } from '../shared/step-context.js';
import type { ConnectionAccessContext, ConnectionSessionAudience } from '../shared/connection-management.js';
export interface TrustedConnectionSession {
	readonly role: 'control' | 'data';
	readonly access: Readonly<ConnectionAccessContext>;
	readonly audience: ConnectionSessionAudience;
	readonly controlGeneration: number;
	readonly signal: AbortSignal;
	readonly assertActive: () => void;
}
/** Server-owned transport metadata; never deserialized from request params or client labels. */
export interface TrustedRpcContext {
	readonly connectionIdentity: string;
	readonly daemonEpoch: string;
	readonly connectionExecution?: ConnectionExecutionContext | undefined;
	readonly connectionSession?: TrustedConnectionSession | undefined;
	/** Connection lifetime, including after a prior unary request completed. */
	readonly connectionSignal?: AbortSignal | undefined;
	/** Local-only lifecycle. Never projected onto a worker-thread channel. */
	readonly signal?: AbortSignal | undefined;
	readonly assertRequestActive?: (() => void) | undefined;
	readonly registerDrain?: ((work: PromiseLike<unknown>) => void) | undefined;
}
/** A response can finish while admitted work is still being disposed. */
export class RequestLifetime {
	readonly #controller = new AbortController();
	readonly signal = this.#controller.signal;
	readonly completed: Promise<void>;
	readonly drained: Promise<void>;
	#finish!: () => void;
	#drain!: () => void;
	#complete = false;
	#sealed = false;
	#pending = 0;
	constructor() {
		this.completed = new Promise(resolve => { this.#finish = resolve; });
		this.drained = new Promise(resolve => { this.#drain = resolve; });
	}
	readonly registerDrain = (work: PromiseLike<unknown>): void => {
		if (this.#sealed) throw new Error('Request drain registration is sealed');
		this.#pending++;
		void Promise.resolve(work).then(() => this.#settled(), () => this.#settled());
	};
	readonly assertActive = (): void => { if (this.#complete || this.signal.aborted) throw new Error('Request is no longer accepting work'); };
	abort(): void { this.#controller.abort(); }
	seal(): void { this.#sealed = true; this.#check(); }
	complete(): void {
		if (this.#complete) return;
		this.#complete = true;
		this.seal();
		this.#finish();
	}
	#settled(): void { this.#pending--; this.#check(); }
	#check(): void { if (this.#sealed && this.#pending === 0) this.#drain(); }
}
