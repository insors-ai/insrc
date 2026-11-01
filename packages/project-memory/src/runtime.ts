import { MemoryError } from './errors.js';
import { ModelDispatcher } from './model-dispatcher.js';
import type { DirectoryOwnership } from './ownership.js';
import type { ContextResult, DrainResult, InspectRequest, Json, MemoryCommand, MemoryLogger, MemoryService, OperationReceipt, OperationRequest, ReadRequest, SearchRequest } from './types.js';

/** Private composition points for the later queue/writer/store owners, not plugins. */
export interface OwnedWork {
  stopAdmission(): void;
  pending(): number;
  drain(): Promise<void>;
  close(): Promise<void>;
}
type State = 'ready' | 'draining' | 'closing' | 'closed' | 'failed';
const unavailable = () => new MemoryError('NOT_READY', 'Memory data capabilities are not available in this foundation.');

export class EmbeddedMemoryService implements MemoryService {
  #state: State = 'ready';
  #admissionStopped = false;
  #stopFailed = false;
  #quiesced: Promise<void> | undefined;
  #closing: Promise<void> | undefined;
  readonly #readyResult = Promise.resolve();
  readonly #work: readonly OwnedWork[];
  readonly #owner: DirectoryOwnership;
  readonly #models: ModelDispatcher;
  readonly #logger: MemoryLogger;

  constructor(owner: DirectoryOwnership, models: ModelDispatcher, logger: MemoryLogger, work: readonly OwnedWork[] = []) {
    this.#owner = owner; this.#models = models; this.#logger = logger;
    this.#work = [...work];
    this.#log('memory.ready');
  }
  #log(event: string): void {
    try { this.#logger.write('info', event, { state: this.#state }); } catch { /* Host logging cannot interrupt cleanup. */ }
  }
  ready(): Promise<void> {
    return this.#state === 'ready' ? this.#readyResult : Promise.reject(new MemoryError('NOT_READY', 'Memory is no longer ready.'));
  }
  #stopAdmission(): void {
    if (!this.#admissionStopped) {
      this.#admissionStopped = true;
      for (const work of this.#work) {
        try { work.stopAdmission(); } catch { this.#stopFailed = true; }
      }
    }
    if (this.#stopFailed) throw new MemoryError('STORE_UNAVAILABLE', 'Memory admission could not be stopped safely.');
  }
  #quiesce(): Promise<void> {
    this.#quiesced ??= (async () => {
      for (const work of this.#work) await work.drain();
      await this.#models.waitIdle();
    })();
    return this.#quiesced;
  }
  async drain(deadlineMs: number): Promise<DrainResult> {
    if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 2_147_483_647) throw new MemoryError('INVALID_REQUEST', 'A positive bounded drain duration is required.');
    if (this.#state === 'closed') return { completed: true, pending: 0 };
    if (this.#state === 'failed') throw new MemoryError('STORE_UNAVAILABLE', 'Memory cleanup is not verified.');
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = performance.now();
    try {
      if (this.#state === 'ready') this.#state = 'draining';
      this.#stopAdmission();
      const wait = this.#closing ?? this.#quiesce();
      const remaining = Math.max(0, deadlineMs - (performance.now() - start));
      const completed = await Promise.race([wait.then(() => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), remaining); })]);
      const pending = completed ? 0 : Math.max(1, this.#models.pending + this.#work.reduce((sum, work) => sum + work.pending(), 0));
      return { completed, pending };
    } catch {
      this.#state = 'failed'; this.#models.stop();
      throw new MemoryError('STORE_UNAVAILABLE', 'Memory drain could not be verified.');
    } finally { clearTimeout(timer); }
  }
  close(): Promise<void> {
    this.#closing ??= (async () => {
      this.#state = 'closing';
      try {
        this.#stopAdmission();
        this.#models.stop();
        await this.#quiesce();
        for (const work of this.#work) await work.close();
        await this.#owner.close();
        this.#state = 'closed'; this.#log('memory.closed');
      } catch {
        this.#models.stop(); this.#state = 'failed'; this.#log('memory.cleanup-unverified');
        throw new MemoryError('STORE_UNAVAILABLE', 'Memory close could not be verified.');
      }
    })();
    return this.#closing;
  }
  submit(_command: MemoryCommand): Promise<OperationReceipt> { return Promise.reject(unavailable()); }
  context(_request: ReadRequest): Promise<ContextResult> { return Promise.reject(unavailable()); }
  search(_request: SearchRequest): Promise<ContextResult> { return Promise.reject(unavailable()); }
  inspect(_request: InspectRequest): Promise<Json> { return Promise.reject(unavailable()); }
  operation(_request: OperationRequest): Promise<OperationReceipt> { return Promise.reject(unavailable()); }
}
