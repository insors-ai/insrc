import { SCRATCH_NOTE_BYTES, SCRATCH_MESSAGE_BYTES, scratchUtf8Bytes, parseScratchEditorMessage } from './scratch-editor-protocol.js';

export interface ScratchValidationIdentity {
  readonly paneSessionId: string; readonly draftSeq: number; readonly editId: string;
  readonly baseVersion: number; readonly baseDigest: string;
}
export interface ScratchValidationConfirmation {
  readonly paneSessionId: string; readonly draftSeq: number; readonly editId: string;
  readonly version: number; readonly digest: string; readonly markdown: string;
}
/** Identity only: clients also require their own exact object reference. */
export interface ScratchValidationTicket { readonly requestId: number; readonly identity: ScratchValidationIdentity; readonly digest: string }
export function scratchValidationIdentity(value: unknown): value is ScratchValidationIdentity {
  if (!value || typeof value !== 'object' || Object.keys(value).length !== 5 ||
    Object.keys(value).some(key => !['paneSessionId','draftSeq','editId','baseVersion','baseDigest'].includes(key))) return false;
  return !!parseScratchEditorMessage({ ...value, type: 'draft', markdown: '', apply: false });
}
export function sameScratchValidationIdentity(a: ScratchValidationIdentity, b: ScratchValidationIdentity): boolean {
  return a.paneSessionId === b.paneSessionId && a.draftSeq === b.draftSeq && a.editId === b.editId && a.baseVersion === b.baseVersion && a.baseDigest === b.baseDigest;
}
export interface ScratchValidationRequest {
  readonly source: string;
  readonly draft: string;
  readonly baseKey: string;
  readonly expectedIntent?: string | undefined;
  readonly identity?: ScratchValidationIdentity | undefined;
  /** Read-only codec evidence for qualification; not used on the typing path. */
  readonly qualification?: true | undefined;
}
export interface ScratchCodecProof { readonly schema: string; readonly sourceIntent: string; readonly sourceSerialized: string; readonly draftIntent: string; readonly draftSerialized: string }
export interface ScratchValidationResult { readonly allowed: boolean; readonly reason?: string | undefined; readonly proof?: ScratchCodecProof | undefined; readonly ticket?: ScratchValidationTicket | undefined }
export interface ScratchValidationPort {
  post(message: unknown): void;
  listen(message: (value: unknown) => void, error: () => void): () => void;
  terminate(): void;
}
export const SCRATCH_CODEC_VERSION = 2;
export function scratchValidationMessageFits(value: unknown): boolean {
  try { return scratchUtf8Bytes(JSON.stringify(value)) <= SCRATCH_MESSAGE_BYTES; } catch { return false; }
}
export function scratchValidationRequestFits(value: ScratchValidationRequest): boolean {
  return typeof value.source === 'string' && typeof value.draft === 'string' &&
    scratchUtf8Bytes(value.source) <= SCRATCH_NOTE_BYTES && scratchUtf8Bytes(value.draft) <= SCRATCH_NOTE_BYTES &&
    typeof value.baseKey === 'string' && value.baseKey.length > 0 && value.baseKey.length <= 256 &&
    (value.expectedIntent === undefined || /^[a-f0-9]{64}$/.test(value.expectedIntent)) && (value.qualification === undefined || value.qualification === true) &&
    (value.identity === undefined || scratchValidationIdentity(value.identity) && value.baseKey === `${value.identity.baseVersion}:${value.identity.baseDigest}`);
}
interface Job { readonly revision: number; readonly id: number; readonly request: ScratchValidationRequest; resolve(value: ScratchValidationResult): void; reject(error: Error): void }

/** One active request plus the newest queued request. A dead executor is never
 * reused, and a reply cannot cross its startup epoch. Source/candidate travel
 * separately so no message contains several full-size snapshots. */
export class ScratchValidationClient {
  private readonly epoch = globalThis.crypto.randomUUID();
  private sequence = 0;
  private revision = 0;
  private candidate: { readonly ticket: ScratchValidationTicket; readonly draft: string; readonly source: string; readonly digest: string; accepted: boolean } | undefined;
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
      this.queued = { id: ++this.sequence, revision: this.revision, request: { ...request, ...(request.identity ? { identity: Object.freeze({ ...request.identity }) } : {}) }, resolve, reject };
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
      { ...common, type: 'validate', draft: job.request.draft, ...(job.request.expectedIntent === undefined ? {} : { expectedIntent: job.request.expectedIntent }), ...(job.request.qualification ? { qualification: true } : {}), ...(job.request.identity ? { identity: job.request.identity } : {}) }];
    if (!messages.every(scratchValidationMessageFits)) { this.stop('Validation message exceeds its bounds; draft retained.'); return; }
    if (!this.candidate?.accepted) this.candidate = undefined;
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
    if (Object.keys(message).some(key => !['type','epoch','requestId','baseKey','allowed','reason','proof','candidateDigest'].includes(key))) return;
    if (!job || message['type'] !== 'result' || message['requestId'] !== job.id || message['baseKey'] !== job.request.baseKey ||
      typeof message['allowed'] !== 'boolean' || (message['reason'] !== undefined && (typeof message['reason'] !== 'string' || message['reason'].length > 1024))) return;
    const proof = message['proof'];
    const proofKeys = ['schema', 'sourceIntent', 'sourceSerialized', 'draftIntent', 'draftSerialized'];
    if (proof !== undefined && (!proof || typeof proof !== 'object' || Object.keys(proof).length !== proofKeys.length || !proofKeys.every(key => /^[a-f0-9]{64}$/.test(String((proof as Record<string, unknown>)[key]))))) return;
    if (job.request.qualification && !proof) return;
    const digest = message['candidateDigest'];
    if (digest !== undefined && (message['allowed'] !== true || !job.request.identity || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))) return;
    let ticket: ScratchValidationTicket | undefined;
    if (typeof digest === 'string' && job.request.identity && job.revision === this.revision && !this.candidate?.accepted) {
      ticket = Object.freeze({ requestId: job.id, identity: job.request.identity, digest });
      this.candidate = { ticket, draft: job.request.draft, source: job.request.source, digest, accepted: false };
    }
    clearTimeout(this.timer); this.active = undefined;
    job.resolve({ allowed: message['allowed'], ...(typeof message['reason'] === 'string' ? { reason: message['reason'] } : {}), ...(proof ? { proof: proof as ScratchCodecProof } : {}), ...(ticket ? { ticket } : {}) }); this.pump();
  }
  private stop(message: string): void {
    if (this.closed) return;
    this.candidate = undefined; this.revision++;
    this.closed = true; this.readyReject(new Error(message)); clearTimeout(this.timer); this.unlisten?.(); this.port.terminate();
    this.active?.reject(new Error(message)); this.queued?.reject(new Error(message)); this.active = undefined; this.queued = undefined;
  }
  private control(type: 'invalidate' | 'discard' | 'accept' | 'confirm', fields: Record<string, unknown> = {}): boolean {
    if (this.closed || !this.started) return false;
    try {
      const message = { type, epoch: this.epoch, ...fields };
      if (!scratchValidationMessageFits(message)) return false;
      this.port.post(message); return true;
    } catch { this.stop('Background validation control failed; draft retained.'); return false; }
  }
  discardCandidate(revokeAccepted = false): void {
    this.revision++; if (revokeAccepted || !this.candidate?.accepted) this.candidate = undefined;
    this.control('discard', revokeAccepted ? { revoke: true } : {});
  }
  acceptCandidate(ticket: ScratchValidationTicket | undefined): boolean {
    const candidate = this.candidate;
    if (!ticket || candidate?.ticket !== ticket || this.closed) return false;
    if (!this.control('accept', { requestId: ticket.requestId, baseKey: `${ticket.identity.baseVersion}:${ticket.identity.baseDigest}`, identity: ticket.identity })) return false;
    candidate.accepted = true; return true;
  }
  confirmCandidate(ticket: ScratchValidationTicket | undefined, confirmation: ScratchValidationConfirmation): boolean {
    const candidate = this.candidate, id = ticket?.identity;
    if (!candidate || candidate.ticket !== ticket || !id || this.closed) return false;
    if (!candidate.accepted || !Number.isSafeInteger(confirmation.version) || confirmation.version < 1 ||
      confirmation.paneSessionId !== id.paneSessionId || confirmation.draftSeq !== id.draftSeq || confirmation.editId !== id.editId ||
      confirmation.markdown !== candidate.draft || confirmation.digest !== candidate.digest ||
      confirmation.version !== id.baseVersion + (candidate.source === candidate.draft ? 0 : 1)) { this.invalidateBase(); return false; }
    this.candidate = undefined; this.revision++;
    return this.control('confirm', { requestId: ticket.requestId, baseKey: `${id.baseVersion}:${id.baseDigest}`, identity: id,
      source: confirmation.markdown, version: confirmation.version, digest: confirmation.digest });
  }
  invalidateBase(): void {
    this.revision++; this.candidate = undefined; this.control('invalidate');
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
