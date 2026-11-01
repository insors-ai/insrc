import type { Json, ModelPort, ModelRequest } from './types.js';
import { MemoryError } from './errors.js';

/** Private pending-call count, unrelated to the durable journal's byte limits. */
export const MAX_PENDING_MODEL_CALLS = 64;
interface Call { start(): void; cancel(reason: MemoryError): void; }

/** One lane for all module model work. Caller timeout never frees an active lane. */
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
  #notifyIdle(): void {
    if (this.pending !== 0) return;
    for (const resolve of this.#idle) resolve();
    this.#idle.clear();
  }
  #kick(): void {
    if (!this.#active) this.#queue.shift()?.start();
    this.#notifyIdle();
  }
  #enqueue<T>(run: (signal: AbortSignal) => Promise<T>, external: AbortSignal): Promise<T> {
    if (this.#stopped || external.aborted) return Promise.reject(new MemoryError('NOT_READY', 'Memory model request is unavailable.', true));
    if (this.#queue.length >= MAX_PENDING_MODEL_CALLS) return Promise.reject(new MemoryError('BACKPRESSURE', 'Memory model request capacity is exhausted.', true));
    return new Promise<T>((resolve, reject) => {
      const controller = new AbortController();
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => { clearTimeout(timer); external.removeEventListener('abort', onAbort); };
      const fail = (reason: MemoryError) => { if (!settled) { settled = true; cleanup(); reject(reason); } };
      const onAbort = () => call.cancel(new MemoryError('NOT_READY', 'Memory model request was cancelled.', true));
      const call: Call = {
        cancel: reason => {
          fail(reason);
          controller.abort(reason);
          if (this.#active !== call) {
            const index = this.#queue.indexOf(call);
            if (index >= 0) this.#queue.splice(index, 1);
            this.#kick();
          }
        },
        start: () => {
          this.#active = call;
          void Promise.resolve().then(() => {
            controller.signal.throwIfAborted();
            return run(controller.signal);
          }).then(value => {
            if (!settled) { settled = true; cleanup(); resolve(value); }
          }, () => fail(new MemoryError('NOT_READY', 'Memory model provider request failed.', true))).finally(() => {
            this.#active = undefined;
            this.#kick();
          });
        },
      };
      timer = setTimeout(() => call.cancel(new MemoryError('DEADLINE_EXCEEDED', 'Memory model request deadline was exceeded.', true)), this.timeoutMs);
      external.addEventListener('abort', onAbort, { once: true });
      this.#queue.push(call);
      this.#kick();
      if (external.aborted) onAbort();
    });
  }
}
