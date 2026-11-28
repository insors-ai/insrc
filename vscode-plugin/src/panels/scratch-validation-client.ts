import { SCRATCH_NOTE_BYTES, SCRATCH_MESSAGE_BYTES, scratchUtf8Bytes } from './scratch-editor-protocol.js';

export interface ScratchValidationRequest {
  readonly source: string;
  readonly draft: string;
  readonly baseKey: string;
  readonly expectedIntent?: string | undefined;
  /** Read-only codec evidence for qualification; not used on the typing path. */
  readonly qualification?: true | undefined;
}
export interface ScratchCodecProof { readonly schema: string; readonly sourceIntent: string; readonly sourceSerialized: string; readonly draftIntent: string; readonly draftSerialized: string }
export interface ScratchValidationResult { readonly allowed: boolean; readonly reason?: string | undefined; readonly proof?: ScratchCodecProof | undefined }
export interface ScratchValidationPort {
  post(message: unknown): void;
  listen(message: (value: unknown) => void, error: () => void): () => void;
  terminate(): void;
}
export const SCRATCH_CODEC_VERSION = 1;
export function scratchValidationMessageFits(value: unknown): boolean {
  try { return scratchUtf8Bytes(JSON.stringify(value)) <= SCRATCH_MESSAGE_BYTES; } catch { return false; }
}
export function scratchValidationRequestFits(value: ScratchValidationRequest): boolean {
  return typeof value.source === 'string' && typeof value.draft === 'string' &&
    scratchUtf8Bytes(value.source) <= SCRATCH_NOTE_BYTES && scratchUtf8Bytes(value.draft) <= SCRATCH_NOTE_BYTES &&
    typeof value.baseKey === 'string' && value.baseKey.length > 0 && value.baseKey.length <= 256 &&
    (value.expectedIntent === undefined || /^[a-f0-9]{64}$/.test(value.expectedIntent)) && (value.qualification === undefined || value.qualification === true);
}
interface Job { readonly id: number; readonly request: ScratchValidationRequest; resolve(value: ScratchValidationResult): void; reject(error: Error): void }

/** One active request plus the newest queued request. A dead executor is never
 * reused, and a reply cannot cross its startup epoch. Source/candidate travel
 * separately so no message contains several full-size snapshots. */
export class ScratchValidationClient {
  private readonly epoch = globalThis.crypto.randomUUID();
  private sequence = 0;
  private started = false;
  readonly ready: Promise<void>;
  private readyResolve!: () => void;
  private readyReject!: (error: Error) => void;
  private closed = false;
  private active: Job | undefined;
  private queued: Job | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly unlisten: () => void;
  constructor(private readonly port: ScratchValidationPort, private readonly timeoutMs = 15_000) {
    this.ready = new Promise((resolve, reject) => { this.readyResolve = resolve; this.readyReject = reject; });
    void this.ready.catch(() => { /* callers may use run() without awaiting startup */ });
    this.unlisten = port.listen(value => this.receive(value), () => this.stop('Background validation failed; draft retained.'));
    this.arm();
    try { port.post({ type: 'init', epoch: this.epoch, codecVersion: SCRATCH_CODEC_VERSION }); }
    catch { this.stop('Background validation could not start; draft retained.'); }
  }
  run(request: ScratchValidationRequest): Promise<ScratchValidationResult> {
    if (this.closed || !scratchValidationRequestFits(request)) return Promise.reject(new Error('Validation unavailable or draft exceeds its bounds.'));
    return new Promise((resolve, reject) => {
      this.queued?.reject(new Error('Validation superseded by newer typing.'));
      this.queued = { id: ++this.sequence, request: { ...request }, resolve, reject };
      this.pump();
    });
  }
  private arm(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.stop('Background validation timed out; draft retained.'), this.timeoutMs);
  }
  private pump(): void {
    if (!this.started || this.closed || this.active || !this.queued) return;
    const job = this.queued; this.queued = undefined; this.active = job;
    const common = { epoch: this.epoch, requestId: job.id, baseKey: job.request.baseKey };
    const messages = [{ ...common, type: 'base', source: job.request.source },
      { ...common, type: 'validate', draft: job.request.draft, ...(job.request.expectedIntent === undefined ? {} : { expectedIntent: job.request.expectedIntent }), ...(job.request.qualification ? { qualification: true } : {}) }];
    if (!messages.every(scratchValidationMessageFits)) { this.stop('Validation message exceeds its bounds; draft retained.'); return; }
    this.arm();
    try { for (const message of messages) this.port.post(message); }
    catch { this.stop('Background validation delivery failed; draft retained.'); }
  }
  private receive(value: unknown): void {
    if (this.closed || !value || typeof value !== 'object' || !scratchValidationMessageFits(value)) return;
    const message = value as Record<string, unknown>;
    if (message['epoch'] !== this.epoch) return;
    if (message['type'] === 'ready' && message['codecVersion'] === SCRATCH_CODEC_VERSION && !this.started) {
      this.started = true; this.readyResolve(); clearTimeout(this.timer); this.pump(); return;
    }
    const job = this.active;
    if (!job || message['type'] !== 'result' || message['requestId'] !== job.id || message['baseKey'] !== job.request.baseKey ||
      typeof message['allowed'] !== 'boolean' || (message['reason'] !== undefined && (typeof message['reason'] !== 'string' || message['reason'].length > 1024))) return;
    const proof = message['proof'];
    const proofKeys = ['schema', 'sourceIntent', 'sourceSerialized', 'draftIntent', 'draftSerialized'];
    if (proof !== undefined && (!proof || typeof proof !== 'object' || Object.keys(proof).length !== proofKeys.length || !proofKeys.every(key => /^[a-f0-9]{64}$/.test(String((proof as Record<string, unknown>)[key]))))) return;
    if (job.request.qualification && !proof) return;
    clearTimeout(this.timer); this.active = undefined;
    job.resolve({ allowed: message['allowed'], ...(typeof message['reason'] === 'string' ? { reason: message['reason'] } : {}), ...(proof ? { proof: proof as ScratchCodecProof } : {}) }); this.pump();
  }
  private stop(message: string): void {
    if (this.closed) return;
    this.closed = true; this.readyReject(new Error(message)); clearTimeout(this.timer); this.unlisten?.(); this.port.terminate();
    this.active?.reject(new Error(message)); this.queued?.reject(new Error(message)); this.active = undefined; this.queued = undefined;
  }
  invalidateBase(): void {
    if (this.closed || !this.started) return;
    try { this.port.post({ type: 'invalidate', epoch: this.epoch }); }
    catch { this.stop('Background validation invalidation failed; draft retained.'); }
  }
  dispose(): void { this.stop('Background validation disposed; draft retained.'); }
}

/** Only host-supplied fixed bundle bytes may be passed here. Never note text. */
export function createScratchBrowserValidator(trustedBundle: string): ScratchValidationClient {
  const url = URL.createObjectURL(new Blob([trustedBundle], { type: 'text/javascript' }));
  let worker: Worker;
  try { worker = new Worker(url); } catch (error) { URL.revokeObjectURL(url); throw error; }
  return new ScratchValidationClient({
    post: value => worker.postMessage(value),
    listen: (message, error) => {
      const onMessage = (event: MessageEvent): void => message(event.data);
      worker.addEventListener('message', onMessage); worker.addEventListener('error', error); worker.addEventListener('messageerror', error);
      return () => { worker.removeEventListener('message', onMessage); worker.removeEventListener('error', error); worker.removeEventListener('messageerror', error); };
    },
    terminate: () => { worker.terminate(); URL.revokeObjectURL(url); },
  });
}
