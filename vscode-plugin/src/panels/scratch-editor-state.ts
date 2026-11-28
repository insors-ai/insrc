/** Browser-safe state: exactly one apply authorization in flight; every local
 * draft is still reported immediately for recovery. Older acks never replace
 * newer typing. DOM rendering/selection belongs to the webview adapter (t6). */
import { parseScratchEditorMessage, parseScratchHostMessage, scratchEditId, type ScratchDraftProposal } from './scratch-editor-protocol.js';

export interface ScratchSnapshot { readonly version: number; readonly digest: string; readonly markdown: string }
export type ScratchAdmissionPhase = 'applied' | 'waiting-idle' | 'validating' | 'authorized' | 'conflict';
export interface ScratchViewUpdate { readonly replace?: string | undefined; readonly conflict?: string | undefined; readonly revalidate?: boolean | undefined }

export class ScratchRendererState {
  private sequence = 0;
  private acknowledged = 0;
  private inFlight: ScratchDraftProposal | undefined;
  private latest: ScratchDraftProposal | undefined;
  private frozen = false;
  private value: string;
  private canonical: ScratchSnapshot;
  private admission: ScratchAdmissionPhase = 'applied';

  constructor(readonly paneSessionId: string, snapshot: ScratchSnapshot, private readonly post: (draft: ScratchDraftProposal) => void) {
    if (!parseScratchHostMessage({ ...snapshot, paneSessionId, type: 'document-state', locked: true })) throw new Error('Invalid initial editor state');
    this.canonical = snapshot; this.value = snapshot.markdown;
  }
  get markdown(): string { return this.value; }
  get draftSeq(): number { return this.sequence; }
  get snapshot(): ScratchSnapshot { return this.canonical; }
  get hasPending(): boolean { return this.sequence > this.acknowledged; }
  get conflicted(): boolean { return this.frozen; }
  get phase(): ScratchAdmissionPhase { return this.admission; }

  /** Immediate recovery staging is never a claim of fidelity or application. */
  stage(markdown: string): number {
    if (this.frozen) throw new Error('Resolve the conflicting draft before editing.');
    this.value = markdown; this.sequence++;
    const draft: ScratchDraftProposal = { type: 'draft', paneSessionId: this.paneSessionId, draftSeq: this.sequence,
      editId: scratchEditId(this.sequence), baseVersion: this.canonical.version, baseDigest: this.canonical.digest,
      markdown, apply: false, ...(this.inFlight ? { parentEditId: this.inFlight.editId } : {}) };
    if (!parseScratchEditorMessage(draft)) { this.frozen = true; this.admission = 'conflict'; throw new Error('Draft exceeds editor transport limits; local text is retained.'); }
    this.latest = draft;
    this.admission = 'waiting-idle';
    this.post(draft);
    return this.sequence;
  }

  validating(sequence: number, baseVersion: number, baseDigest: string): boolean {
    if (this.frozen || sequence <= this.acknowledged || sequence !== this.latest?.draftSeq || this.inFlight || baseVersion !== this.canonical.version || baseDigest !== this.canonical.digest) return false;
    this.admission = 'validating'; return true;
  }
  /** The caller has freshly validated this exact generation against this base. */
  authorize(sequence: number, baseVersion: number, baseDigest: string): boolean {
    const latest = this.latest;
    if (this.frozen || sequence <= this.acknowledged || !latest || sequence !== latest.draftSeq || this.inFlight || baseVersion !== this.canonical.version || baseDigest !== this.canonical.digest) return false;
    const authorized: ScratchDraftProposal = { ...latest, apply: true, baseVersion, baseDigest };
    if (!parseScratchEditorMessage(authorized)) return false;
    this.latest = authorized; this.inFlight = authorized; this.admission = 'authorized'; this.post(authorized); return true;
  }
  refuse(sequence: number, _reason: string): void {
    if (sequence !== this.latest?.draftSeq) return;
    this.frozen = true; this.admission = 'conflict';
  }

  /** Returns text only when the owning adapter should replace the view. */
  receive(value: unknown): ScratchViewUpdate {
    const msg = parseScratchHostMessage(value);
    if (!msg || msg.paneSessionId !== this.paneSessionId) return {};
    if (msg.type === 'conflict') {
      if (msg.draftSeq <= this.acknowledged && msg.draftSeq !== 0) return {};
      this.frozen = true; this.admission = 'conflict'; return { conflict: msg.message };
    }
    if (msg.type === 'document-state') {
      if (msg.version < this.canonical.version) return {};
      if (msg.version === this.canonical.version && msg.digest === this.canonical.digest) return {};
      if (msg.version === this.canonical.version) { this.frozen = true; this.admission = 'conflict'; return { conflict: 'Conflicting document version; local text retained.' }; }
      if (this.hasPending) { this.frozen = true; this.admission = 'conflict'; return { conflict: 'Source changed; local draft retained.' }; }
      this.canonical = msg; this.value = msg.markdown; this.admission = 'applied';
      return { replace: msg.markdown };
    }
    if (msg.type === 'admission-superseded') {
      if (!this.inFlight || this.sequence <= msg.draftSeq || msg.draftSeq !== this.inFlight.draftSeq || msg.editId !== this.inFlight.editId ||
        msg.baseVersion !== this.canonical.version || msg.baseDigest !== this.canonical.digest ||
        msg.baseVersion !== this.inFlight.baseVersion || msg.baseDigest !== this.inFlight.baseDigest) return {};
      this.inFlight = undefined; // no native edit or acknowledgement is claimed
      if (this.frozen) return {};
      this.admission = 'waiting-idle'; return { revalidate: true };
    }
    if (msg.type !== 'apply-ack' || msg.draftSeq <= this.acknowledged) return {};
    if (!this.inFlight || msg.editId !== this.inFlight.editId || msg.draftSeq !== this.inFlight.draftSeq ||
      msg.markdown !== this.inFlight.markdown || msg.version < this.canonical.version) {
      this.frozen = true; this.admission = 'conflict'; return { conflict: 'Unexpected acknowledgement; local draft retained.' };
    }
    this.canonical = msg; this.acknowledged = msg.draftSeq; this.inFlight = undefined;
    if (this.sequence === msg.draftSeq) { this.value = msg.markdown; this.admission = this.frozen ? 'conflict' : 'applied'; return {}; }
    // A newer draft was checked against the old base (or is still unchecked).
    // Neither an ack nor a receipt grants admission against the new source.
    if (this.frozen) return {};
    this.admission = 'waiting-idle'; return { revalidate: true };
  }
}
