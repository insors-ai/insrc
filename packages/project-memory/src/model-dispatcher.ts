import type { Json, ModelPort, ModelRequest } from './types.js';
import { MemoryError } from './errors.js';

/** Private pending-call count, unrelated to the durable journal's byte limits. */
export const MAX_PENDING_MODEL_CALLS = 64;
interface Call { start(): void; cancel(reason: MemoryError): void; }

/** Owns one caller's settlement, deadline and abort wiring, never the lane. */
class ModelCall<T> implements Call {
  readonly result: Promise<T>;
  readonly #controller = new AbortController();
  #resolve!: (value: T) => void;
  #reject!: (error: MemoryError) => void;
  #settled = false;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #external: AbortSignal | undefined;
  readonly #onAbort = () => this.cancel(new MemoryError('NOT_READY', 'Memory model request was cancelled.', true));

  constructor(
    readonly run: (signal: AbortSignal) => Promise<T>,
    readonly cancelled: (call: Call) => void,
    readonly finished: () => void,
  ) {
    this.result = new Promise<T>((resolve, reject) => { this.#resolve = resolve; this.#reject = reject; });
  }
  arm(signal: AbortSignal, timeoutMs: number): void {
    this.#external = signal;
    this.#timer = setTimeout(() => this.cancel(new MemoryError('DEADLINE_EXCEEDED', 'Memory model request deadline was exceeded.', true)), timeoutMs);
    signal.addEventListener('abort', this.#onAbort, { once: true });
    if (signal.aborted) this.#onAbort();
  }
  #cleanup(): void {
    clearTimeout(this.#timer);
    this.#external?.removeEventListener('abort', this.#onAbort);
  }
  /** Provider failure, timeout and caller abort share this one settlement path. */
  cancel(reason: MemoryError): void {
    if (this.#settled) return;
    this.#settled = true; this.#cleanup(); this.#reject(reason);
    this.#controller.abort(reason);
    this.cancelled(this);
  }
  start(): void {
    void Promise.resolve().then(() => {
      this.#controller.signal.throwIfAborted();
      return this.run(this.#controller.signal);
    }).then(value => {
      if (!this.#settled) { this.#settled = true; this.#cleanup(); this.#resolve(value); }
    }, () => this.cancel(new MemoryError('NOT_READY', 'Memory model provider request failed.', true)))
      .finally(this.finished);
  }
}

/** Owns one FIFO lane. Caller cancellation never releases an active provider. */
export class ModelDispatcher implements ModelPort {
  readonly #queue: Call[] = [];
  readonly #idle = new Set<() => void>();
  #active: Call | undefined;
  #stopped = false;

  constructor(readonly source: ModelPort, readonly timeoutMs: number) {
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 2_147_483_647) throw new MemoryError('INVALID_REQUEST', 'A valid model timeout is required.');
  }
  get embeddingModel(): string { return this.source.embeddingModel; }
  get embeddingDimension(): number { return this.source.embeddingDimension; }
  get pending(): number { return this.#queue.length + (this.#active ? 1 : 0); }
  complete(request: ModelRequest): Promise<Json> {
    return this.#enqueue(signal => this.source.complete({ ...request, signal }), request.signal);
  }
  embed(text: string, signal: AbortSignal): Promise<readonly number[]> {
    return this.#enqueue(ownedSignal => this.source.embed(text, ownedSignal), signal);
  }
  waitIdle(): Promise<void> {
    return this.pending === 0 ? Promise.resolve() : new Promise(resolve => this.#idle.add(resolve));
  }
  stop(): void {
    this.#stopped = true;
    const reason = new MemoryError('NOT_READY', 'Memory model dispatch is closing.', true);
    for (const call of [...this.#queue]) call.cancel(reason);
    this.#active?.cancel(reason);
  }
  #kick(): void {
    if (!this.#active && !this.#stopped) {
      this.#active = this.#queue.shift();
      this.#active?.start();
    }
    if (this.pending === 0) {
      for (const resolve of this.#idle) resolve();
      this.#idle.clear();
    }
  }
  #cancelQueued(call: Call): void {
    if (this.#active === call) return; // Underlying settlement alone frees the lane.
    const index = this.#queue.indexOf(call);
    if (index >= 0) this.#queue.splice(index, 1);
    this.#kick();
  }
  #enqueue<T>(run: (signal: AbortSignal) => Promise<T>, external: AbortSignal): Promise<T> {
    if (this.#stopped || external.aborted) return Promise.reject(new MemoryError('NOT_READY', 'Memory model request is unavailable.', true));
    if (this.#queue.length >= MAX_PENDING_MODEL_CALLS) return Promise.reject(new MemoryError('BACKPRESSURE', 'Memory model request capacity is exhausted.', true));
    const call = new ModelCall(run, queued => this.#cancelQueued(queued), () => { this.#active = undefined; this.#kick(); });
    this.#queue.push(call);
    call.arm(external, this.timeoutMs);
    this.#kick();
    return call.result;
  }
}
