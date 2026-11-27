/** Browser-safe state: exactly one apply authorization in flight; every local
 * draft is still reported immediately for recovery. Older acks never replace
 * newer typing. DOM rendering/selection belongs to the webview adapter (t6). */
import { parseScratchEditorMessage, parseScratchHostMessage, type ScratchDraftProposal } from './scratch-editor-protocol.js';

export interface ScratchSnapshot { readonly version: number; readonly digest: string; readonly markdown: string }

export class ScratchRendererState {
  private sequence = 0;
  private acknowledged = 0;
  private inFlight: ScratchDraftProposal | undefined;
  private latest: ScratchDraftProposal | undefined;
  private frozen = false;
  private value: string;
  private canonical: ScratchSnapshot;

  constructor(readonly paneSessionId: string, snapshot: ScratchSnapshot, private readonly post: (draft: ScratchDraftProposal) => void) {
    if (!parseScratchHostMessage({ ...snapshot, paneSessionId, type: 'document-state', locked: true })) throw new Error('Invalid initial editor state');
    this.canonical = snapshot; this.value = snapshot.markdown;
  }
  get markdown(): string { return this.value; }
  get draftSeq(): number { return this.sequence; }
  get snapshot(): ScratchSnapshot { return this.canonical; }
  get hasPending(): boolean { return this.sequence > this.acknowledged; }
  get conflicted(): boolean { return this.frozen; }

  edit(markdown: string): void {
    if (this.frozen) throw new Error('Resolve the conflicting draft before editing.');
    if (markdown === this.value) return;
    this.value = markdown; this.sequence++;
    const draft: ScratchDraftProposal = { type: 'draft', paneSessionId: this.paneSessionId, draftSeq: this.sequence,
      editId: `edit_${this.sequence}`, baseVersion: this.canonical.version, baseDigest: this.canonical.digest,
      markdown, apply: this.inFlight === undefined, ...(this.inFlight ? { parentEditId: this.inFlight.editId } : {}) };
    if (!parseScratchEditorMessage(draft)) { this.frozen = true; throw new Error('Draft exceeds editor transport limits; local text is retained.'); }
    this.latest = draft;
    if (draft.apply) this.inFlight = draft;
    this.post(draft);
  }

  /** Returns text only when the owning adapter should replace the view. */
  receive(value: unknown): { readonly replace?: string; readonly conflict?: string } {
    const msg = parseScratchHostMessage(value);
    if (!msg || msg.paneSessionId !== this.paneSessionId) return {};
    if (msg.type === 'conflict') {
      if (msg.draftSeq <= this.acknowledged && msg.draftSeq !== 0) return {};
      this.frozen = true; return { conflict: msg.message };
    }
    if (msg.type === 'document-state') {
      if (msg.version < this.canonical.version) return {};
      if (msg.version === this.canonical.version && msg.digest === this.canonical.digest) return {};
      if (msg.version === this.canonical.version) { this.frozen = true; return { conflict: 'Conflicting document version; local text retained.' }; }
      if (this.hasPending) { this.frozen = true; return { conflict: 'Source changed; local draft retained.' }; }
      this.canonical = msg; this.value = msg.markdown;
      return { replace: msg.markdown };
    }
    if (msg.type !== 'apply-ack' || msg.draftSeq <= this.acknowledged) return {};
    if (!this.inFlight || msg.editId !== this.inFlight.editId || msg.draftSeq !== this.inFlight.draftSeq ||
      msg.markdown !== this.inFlight.markdown || msg.version < this.canonical.version) {
      this.frozen = true; return { conflict: 'Unexpected acknowledgement; local draft retained.' };
    }
    this.canonical = msg; this.acknowledged = msg.draftSeq; this.inFlight = undefined;
    if (this.sequence === msg.draftSeq) { this.value = msg.markdown; return {}; }
    if (!this.frozen && this.latest) {
      const promoted: ScratchDraftProposal = { ...this.latest, apply: true, baseVersion: msg.version, baseDigest: msg.digest, parentEditId: msg.editId };
      this.latest = promoted; this.inFlight = promoted; this.post(promoted);
    }
    return {};
  }
}
