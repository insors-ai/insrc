/** VS Code-free, one-per-TextDocument edit controller. Activation supplies the
 * native document operations (t7), and t5 supplies durable recovery operations. */
import { createHash } from 'node:crypto';
import { parseScratchEditorMessage, parseScratchHostMessage, type ScratchDraftProposal, type ScratchHostToEditor } from './scratch-editor-protocol.js';
import type { ScratchSnapshot } from './scratch-editor-state.js';

export interface ScratchTextEdit { readonly baseVersion: number; readonly start: number; readonly end: number; readonly text: string }
export interface ScratchDocumentControllerDeps {
  read(): { readonly version: number; readonly markdown: string };
  applyEdit(edit: ScratchTextEdit): Promise<boolean>;
  /** Must persist before receipt; errors refuse application. */
  retainDraft(draft: ScratchDraftProposal): Promise<void>;
  /** Clear only this exact applied draft, never a newer recovery record. */
  draftApplied(draft: ScratchDraftProposal): Promise<void>;
  admit(source: string, draft: string): { readonly allowed: boolean; readonly reason?: string };
  warn(message: string): void;
}
export const scratchDigest = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export function minimalScratchEdit(before: string, after: string, baseVersion: number): ScratchTextEdit {
  let start = 0, suffix = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  const high = (s: string, i: number): boolean => /[\uD800-\uDBFF]/.test(s[i] ?? '');
  const low = (s: string, i: number): boolean => /[\uDC00-\uDFFF]/.test(s[i] ?? '');
  if (high(before, start - 1) && low(before, start)) start--;
  while (suffix < before.length - start && suffix < after.length - start && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix++;
  if (low(before, before.length - suffix) && high(before, before.length - suffix - 1)) suffix--;
  return { baseVersion, start, end: before.length - suffix, text: after.slice(start, after.length - suffix) };
}

interface Pane {
  readonly id: string;
  readonly post: (message: ScratchHostToEditor) => void;
  locked: boolean;
  attached: boolean;
  latest?: ScratchDraftProposal | undefined;
  appliedSeq: number;
  failure?: string | undefined;
  ack?: { readonly editId: string; readonly baseVersion: number; readonly baseDigest: string; readonly snapshot: ScratchSnapshot } | undefined;
}

export class ScratchDocumentController {
  private readonly panes = new Map<string, Pane>();
  private readonly jobs: { pane: Pane; draft: ScratchDraftProposal }[] = [];
  private receipts: Promise<void> = Promise.resolve();
  private worker: Promise<void> | undefined;
  private inFlight: { readonly pane: Pane; readonly draft: ScratchDraftProposal; readonly base: ScratchSnapshot } | undefined;
  private known: ScratchSnapshot;
  private frozen = false;
  private disposed = false;
  private readonly waiters = new Set<() => void>();

  constructor(private readonly deps: ScratchDocumentControllerDeps) { this.known = this.read(); }
  private read(): ScratchSnapshot { const value = this.deps.read(); return { ...value, digest: scratchDigest(value.markdown) }; }
  private post(pane: Pane, message: ScratchHostToEditor): void {
    if (!pane.attached) return;
    if (!parseScratchHostMessage(message)) {
      this.frozen = true; pane.failure = 'Document exceeds rich editor transport limits; original source is retained. Use the text editor.';
      try { pane.post({ type: 'conflict', paneSessionId: pane.id, draftSeq: pane.latest?.draftSeq ?? 0, message: pane.failure }); }
      catch { this.deps.warn('Scratchpad limit notice could not be delivered.'); }
      this.notify(); return;
    }
    try { pane.post(message); } catch { this.deps.warn('Scratchpad message delivery failed; recovery data is retained.'); }
    this.notify();
  }
  private notify(): void { for (const check of this.waiters) check(); }
  private conflict(pane: Pane, seq: number, message: string): void {
    pane.failure = message;
    this.post(pane, { type: 'conflict', paneSessionId: pane.id, draftSeq: seq, message });
  }
  addPane(id: string, post: Pane['post'], locked: boolean): void {
    if (this.disposed || this.panes.has(id) || !parseScratchEditorMessage({ type: 'editor-ready', paneSessionId: id })) throw new Error('Invalid or duplicate editor session');
    const pane: Pane = { id, post, locked, attached: true, appliedSeq: 0 };
    this.panes.set(id, pane);
    this.post(pane, { type: 'document-state', paneSessionId: id, ...this.read(), locked });
  }
  removePane(id: string): void {
    const pane = this.panes.get(id);
    if (!pane) return;
    pane.attached = false; // accepted jobs continue; never cancel them on tab disposal
    this.notify();
    if ((pane.latest?.draftSeq ?? 0) <= pane.appliedSeq && !this.jobs.some(job => job.pane === pane) && this.inFlight?.pane !== pane) this.panes.delete(id);
  }
  setLocked(id: string, locked: boolean): void { const pane = this.panes.get(id); if (pane?.attached) pane.locked = locked; }
  get hasPending(): boolean { return this.jobs.length > 0 || this.inFlight !== undefined || [...this.panes.values()].some(p => (p.latest?.draftSeq ?? 0) > p.appliedSeq); }
  get conflicted(): boolean { return this.frozen; }
  get snapshot(): ScratchSnapshot { return this.read(); }

  receive(id: string, value: unknown): Promise<void> {
    const pane = this.panes.get(id), parsed = parseScratchEditorMessage(value);
    if (!pane?.attached || this.disposed || !parsed || parsed.type !== 'draft' || parsed.paneSessionId !== id) return Promise.reject(new Error('Invalid scratchpad draft/session'));
    const draft = { ...parsed };
    if (pane.ack?.editId === draft.editId && pane.appliedSeq === draft.draftSeq && pane.ack.snapshot.markdown === draft.markdown) {
      this.post(pane, { type: 'apply-ack', paneSessionId: id, draftSeq: draft.draftSeq, editId: draft.editId, ...pane.ack.snapshot });
      return Promise.resolve();
    }
    const previous = pane.latest;
    const same = previous && previous.draftSeq === draft.draftSeq;
    if (previous && draft.draftSeq < previous.draftSeq) return Promise.reject(new Error('Stale draft sequence'));
    if (same) {
      if (JSON.stringify(previous) === JSON.stringify(draft)) return this.receipts;
      // A reported recovery draft may be promoted only with identical identity,
      // sequence and text, once its older in-flight parent has been acknowledged.
      if (previous.editId !== draft.editId || previous.markdown !== draft.markdown || previous.apply !== false || draft.apply === false) return Promise.reject(new Error('Conflicting duplicate draft'));
    } else if (previous?.editId === draft.editId) return Promise.reject(new Error('Reused edit identity'));
    pane.latest = draft;
    const receipt = this.receipts.then(async () => {
      await this.deps.retainDraft(draft);
      this.post(pane, { type: 'receipt', paneSessionId: id, draftSeq: draft.draftSeq, editId: draft.editId });
      if (this.frozen || pane.locked) { this.conflict(pane, draft.draftSeq, 'Source changed or pane is locked; draft retained.'); return; }
      if (draft.apply === false) return;
      const superseded = this.jobs.findIndex(job => job.pane === pane && job.draft.parentEditId === draft.parentEditId);
      if (superseded >= 0) this.jobs[superseded] = { pane, draft };
      else this.jobs.push({ pane, draft });
      this.start();
    });
    this.receipts = receipt.catch(() => { this.conflict(pane, draft.draftSeq, 'Recovery could not be persisted; draft was not applied.'); });
    return receipt;
  }
  private start(): void {
    if (this.worker) return;
    this.worker = this.run().finally(() => { this.worker = undefined; if (this.jobs.length) this.start(); });
  }
  private async run(): Promise<void> {
    while (this.jobs.length) {
      const { pane, draft } = this.jobs.shift()!;
      try {
        if (this.frozen || pane.failure) { this.conflict(pane, draft.draftSeq, 'Conflicting source; recovery draft retained.'); continue; }
        const base = this.read(), ack = pane.ack;
        const direct = base.version === draft.baseVersion && base.digest === draft.baseDigest;
        const descendant = ack !== undefined && ack.editId === draft.parentEditId && ack.baseVersion === draft.baseVersion && ack.baseDigest === draft.baseDigest && ack.snapshot.version === base.version && ack.snapshot.digest === base.digest;
        if (!direct && !descendant) { this.conflict(pane, draft.draftSeq, 'Stale source version; draft retained.'); continue; }
        if (draft.parentEditId && ack?.editId !== draft.parentEditId) { this.conflict(pane, draft.draftSeq, 'Unacknowledged edit parent; draft retained.'); continue; }
        const admission = this.deps.admit(base.markdown, draft.markdown);
        if (!admission.allowed) { this.conflict(pane, draft.draftSeq, admission.reason ?? 'Unsafe Markdown; source and draft retained.'); continue; }
        this.inFlight = { pane, draft, base };
        if (base.markdown !== draft.markdown && !await this.deps.applyEdit(minimalScratchEdit(base.markdown, draft.markdown, base.version))) throw new Error('Native edit refused');
        const applied = this.read();
        if (this.frozen || applied.markdown !== draft.markdown || applied.version !== base.version + (base.markdown === draft.markdown ? 0 : 1)) throw new Error('Document changed while applying');
        this.known = applied;
        await this.deps.draftApplied(draft);
        const confirmed = this.read();
        if (this.frozen || confirmed.version !== applied.version || confirmed.digest !== applied.digest) {
          await this.deps.retainDraft(pane.latest ?? draft);
          throw new Error('Document changed before acknowledgement');
        }
        pane.appliedSeq = draft.draftSeq;
        pane.ack = { editId: draft.editId, baseVersion: base.version, baseDigest: base.digest, snapshot: applied };
        this.post(pane, { type: 'apply-ack', paneSessionId: pane.id, draftSeq: draft.draftSeq, editId: draft.editId, ...applied });
        for (const other of this.panes.values()) if (other !== pane) this.post(other, { type: 'document-state', paneSessionId: other.id, ...applied, locked: other.locked });
      } catch { this.conflict(pane, draft.draftSeq, 'Edit could not be confirmed; source and recovery draft retained.'); }
      finally { this.inFlight = undefined; if (!pane.attached && (pane.latest?.draftSeq ?? 0) <= pane.appliedSeq && !this.jobs.some(job => job.pane === pane)) this.panes.delete(pane.id); }
    }
  }

  /** Called from the real document listener, including our own WorkspaceEdit. */
  documentChanged(): void {
    const next = this.read();
    if (next.version === this.known.version && next.digest === this.known.digest) return;
    const own = this.inFlight && next.version === this.inFlight.base.version + 1 && next.markdown === this.inFlight.draft.markdown;
    this.known = next;
    if (own) return;
    if (this.hasPending) {
      this.frozen = true;
      for (const pane of this.panes.values()) {
        if ((pane.latest?.draftSeq ?? 0) > pane.appliedSeq) this.conflict(pane, pane.latest?.draftSeq ?? 0, 'External change; competing draft retained.');
        else this.post(pane, { type: 'document-state', paneSessionId: pane.id, ...next, locked: pane.locked });
      }
      return;
    }
    for (const pane of this.panes.values()) this.post(pane, { type: 'document-state', paneSessionId: pane.id, ...next, locked: pane.locked });
  }
  async flush(): Promise<ScratchSnapshot> {
    // Receipts can enqueue work, and acknowledgements can promote the latest
    // already-reported draft. Recheck both after each await.
    for (;;) {
      const receipts = this.receipts; await receipts;
      const worker = this.worker; if (worker) await worker;
      if (receipts === this.receipts && !this.worker && !this.jobs.length) return this.read();
    }
  }
  appliedSequence(id: string): number { return this.panes.get(id)?.appliedSeq ?? 0; }
  /** Save/Send barriers wait for the captured sequence, including a later
   * promotion arriving asynchronously after an acknowledgement was delivered. */
  waitForSequence(id: string, sequence: number, timeoutMs = 10_000): Promise<ScratchSnapshot> {
    const pane = this.panes.get(id);
    if (!pane || !Number.isSafeInteger(sequence) || sequence < 0 || sequence > (pane.latest?.draftSeq ?? 0)) return Promise.reject(new Error('Unknown draft sequence'));
    return new Promise((resolve, reject) => {
      const finish = (error?: Error): void => { clearTimeout(timer); this.waiters.delete(check); if (error) reject(error); else resolve(this.read()); };
      const check = (): void => {
        if (this.disposed || !pane.attached || this.frozen || pane.failure) finish(new Error('Draft could not be confirmed; recovery is retained.'));
        else if (pane.appliedSeq >= sequence) finish();
      };
      const timer = setTimeout(() => finish(new Error('Timed out waiting for draft acknowledgement; recovery is retained.')), timeoutMs);
      this.waiters.add(check); check();
    });
  }
  async dispose(): Promise<void> { this.disposed = true; this.notify(); await this.flush(); this.panes.clear(); }
}
