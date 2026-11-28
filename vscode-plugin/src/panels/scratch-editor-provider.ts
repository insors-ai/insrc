/** VS Code-free, one-per-TextDocument edit controller. Activation supplies the
 * native document operations (t7), and t5 supplies durable recovery operations. */
import { createHash } from 'node:crypto';
import { parseScratchEditorMessage, parseScratchHostMessage, sameScratchDraft, type ScratchDraftProposal, type ScratchHostToEditor } from './scratch-editor-protocol.js';
import type { ScratchSnapshot } from './scratch-editor-state.js';

export interface ScratchTextEdit { readonly baseVersion: number; readonly start: number; readonly end: number; readonly text: string }
export interface ScratchDocumentControllerDeps {
  read(): { readonly version: number; readonly markdown: string };
  applyEdit(edit: ScratchTextEdit): Promise<boolean>;
  /** Must persist before receipt; errors refuse application. */
  retainDraft(draft: ScratchDraftProposal): Promise<void>;
  /** Clear only this exact applied draft, never a newer recovery record. */
  draftApplied(draft: ScratchDraftProposal): Promise<void>;
  admit(source: string, draft: string, base: ScratchSnapshot): { readonly allowed: boolean; readonly reason?: string | undefined } | Promise<{ readonly allowed: boolean; readonly reason?: string | undefined }>;
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
  readonly post: (message: ScratchHostToEditor) => void | boolean | PromiseLike<void | boolean>;
  locked: boolean;
  attached: boolean;
  latest?: ScratchDraftProposal | undefined;
  reportedBaseVersion?: number;
  cancelledParent?: { readonly editId: string; readonly baseVersion: number; readonly baseDigest: string } | undefined;
  appliedSeq: number;
  failure?: string | undefined;
  ack?: { readonly editId: string; readonly baseVersion: number; readonly baseDigest: string; readonly snapshot: ScratchSnapshot; readonly request: ScratchDraftProposal } | undefined;
}

export class ScratchDocumentController {
  private readonly panes = new Map<string, Pane>();
  private readonly jobs: { pane: Pane; draft: ScratchDraftProposal }[] = [];
  private receipts: Promise<void> = Promise.resolve();
  private readonly pendingReceipts = new Map<Pane, { draft: ScratchDraftProposal; promise: Promise<void> }>();
  private worker: Promise<void> | undefined;
  private inFlight: { readonly pane: Pane; readonly draft: ScratchDraftProposal; readonly base: ScratchSnapshot } | undefined;
  private known: ScratchSnapshot;
  private frozen = false;
  private disposed = false;
  private readonly waiters = new Set<() => void>();

  constructor(private readonly deps: ScratchDocumentControllerDeps) { this.known = this.read(); }
  private read(): ScratchSnapshot { const value = this.deps.read(); return { ...value, digest: scratchDigest(value.markdown) }; }
  private async post(pane: Pane, message: ScratchHostToEditor): Promise<boolean> {
    if (!pane.attached) return false;
    if (!parseScratchHostMessage(message)) {
      this.frozen = true; pane.failure = 'Document exceeds rich editor transport limits; original source is retained. Use the text editor.';
      try { await pane.post({ type: 'conflict', paneSessionId: pane.id, draftSeq: pane.latest?.draftSeq ?? 0, message: pane.failure }); }
      catch { this.deps.warn('Scratchpad limit notice could not be delivered.'); }
      this.notify(); return false;
    }
    try { if (await pane.post(message) === false) { this.deps.warn('Scratchpad message was not delivered; recovery data is retained.'); this.notify(); return false; } }
    catch { this.deps.warn('Scratchpad message delivery failed; recovery data is retained.'); this.notify(); return false; }
    this.notify(); return true;
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
  validationUnavailable(): void {
    if (this.disposed) return;
    this.frozen = true;
    for (const pane of this.panes.values()) this.conflict(pane, pane.latest?.draftSeq ?? 0, 'Background Markdown validation is unavailable; source and recovery drafts are retained. Reopen or use the text editor.');
  }
  setLocked(id: string, locked: boolean): void { const pane = this.panes.get(id); if (pane?.attached) pane.locked = locked; }
  get hasPending(): boolean { return this.jobs.length > 0 || this.inFlight !== undefined || [...this.panes.values()].some(p => (p.latest?.draftSeq ?? 0) > p.appliedSeq); }
  get conflicted(): boolean { return this.frozen; }
  get snapshot(): ScratchSnapshot { return this.read(); }

  receive(id: string, value: unknown): Promise<void> {
    const pane = this.panes.get(id), parsed = parseScratchEditorMessage(value);
    if (!pane?.attached || this.disposed || !parsed || parsed.type !== 'draft' || parsed.paneSessionId !== id) return Promise.reject(new Error('Invalid scratchpad draft/session'));
    const draft = { ...parsed };
    if (pane.ack?.editId === draft.editId && pane.appliedSeq === draft.draftSeq) {
      if (!sameScratchDraft(pane.ack.request, draft)) return Promise.reject(new Error('Conflicting duplicate acknowledged draft'));
      this.post(pane, { type: 'apply-ack', paneSessionId: id, draftSeq: draft.draftSeq, editId: draft.editId, ...pane.ack.snapshot });
      return Promise.resolve();
    }
    const previous = pane.latest;
    const same = previous && previous.draftSeq === draft.draftSeq;
    if (previous && draft.draftSeq < previous.draftSeq) return Promise.reject(new Error('Stale draft sequence'));
    if (same) {
      if (sameScratchDraft(previous, draft)) return this.receipts;
      // Explicit admission preserves identity/text and either the exact live
      // base or the newly acknowledged base of its identified own parent.
      if (previous.editId !== draft.editId || previous.markdown !== draft.markdown || previous.apply !== false || draft.apply !== true) return Promise.reject(new Error('Conflicting duplicate draft'));
      const parent = pane.ack;
      const originalBase = parent && (
        previous.baseVersion === parent.request.baseVersion && previous.baseDigest === parent.request.baseDigest ||
        previous.baseVersion === parent.baseVersion && previous.baseDigest === parent.baseDigest
      );
      const current = this.read();
      const direct = previous.baseVersion === draft.baseVersion && previous.baseDigest === draft.baseDigest &&
        current.version === draft.baseVersion && current.digest === draft.baseDigest && draft.parentEditId === previous.parentEditId &&
        (draft.parentEditId === undefined || parent?.editId === draft.parentEditId ||
          pane.cancelledParent?.editId === draft.parentEditId && pane.cancelledParent.baseVersion === current.version && pane.cancelledParent.baseDigest === current.digest);
      const rebased = parent && originalBase && previous.parentEditId !== undefined && draft.parentEditId === previous.parentEditId &&
        parent.editId === previous.parentEditId && draft.baseVersion === parent.snapshot.version && draft.baseDigest === parent.snapshot.digest &&
        current.version === parent.snapshot.version && current.digest === parent.snapshot.digest;
      if (!direct && !rebased) {
        return Promise.reject(new Error('Conflicting pending-draft promotion'));
      }
    } else if (previous?.editId === draft.editId) return Promise.reject(new Error('Reused edit identity'));
    if (!same) pane.reportedBaseVersion = draft.baseVersion;
    pane.latest = draft;
    const pendingReceipt = this.pendingReceipts.get(pane);
    if (pendingReceipt && draft.parentEditId !== pendingReceipt.draft.editId) {
      // Only the latest waiting snapshot is needed. Do not retain one full
      // Markdown string per keystroke while storage is slow. No receipt is
      // emitted for a superseded snapshot that was never persisted.
      pendingReceipt.draft = draft;
      return pendingReceipt.promise;
    }
    const entry = { draft, promise: Promise.resolve() };
    this.pendingReceipts.set(pane, entry);
    const receipt = this.receipts.then(async () => {
      if (this.pendingReceipts.get(pane) === entry) this.pendingReceipts.delete(pane);
      const draft = entry.draft;
      await this.deps.retainDraft(draft);
      if (!await this.post(pane, { type: 'receipt', paneSessionId: id, draftSeq: draft.draftSeq, editId: draft.editId }) && pane.attached) {
        this.conflict(pane, draft.draftSeq, 'Draft receipt could not be delivered; draft retained.'); return;
      }
      if (this.frozen || pane.locked) { this.conflict(pane, draft.draftSeq, 'Source changed or pane is locked; draft retained.'); return; }
      // Historical drafts without apply remain readable/recoverable, but only
      // explicit validated authorization can enter the canonical apply lane.
      if (draft.apply !== true) return;
      const superseded = this.jobs.findIndex(job => job.pane === pane && job.draft.parentEditId === draft.parentEditId);
      if (superseded >= 0) this.jobs[superseded] = { pane, draft };
      else this.jobs.push({ pane, draft });
      this.start();
    });
    entry.promise = receipt;
    this.receipts = receipt.catch(() => { this.conflict(pane, entry.draft.draftSeq, 'Recovery could not be persisted; draft was not applied.'); });
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
        if (!direct) { this.conflict(pane, draft.draftSeq, 'Stale source version; draft retained.'); continue; }
        if (draft.parentEditId && ack?.editId !== draft.parentEditId && !(pane.cancelledParent?.editId === draft.parentEditId && pane.cancelledParent.baseVersion === base.version && pane.cancelledParent.baseDigest === base.digest)) { this.conflict(pane, draft.draftSeq, 'Unacknowledged edit parent; draft retained.'); continue; }
        let admission: Awaited<ReturnType<ScratchDocumentControllerDeps['admit']>>;
        try { admission = await this.deps.admit(base.markdown, draft.markdown, base); }
        catch (error) {
          // An obsolete failure cannot freeze newer typing. A dead executor
          // will reject the new generation visibly when it is submitted.
          if (pane.latest?.draftSeq === draft.draftSeq) throw error;
          admission = { allowed: false };
        }
        const current = this.read();
        if (this.frozen || current.version !== base.version || current.digest !== base.digest) { this.conflict(pane, draft.draftSeq, 'Source changed during validation; draft retained.'); continue; }
        if (pane.latest?.draftSeq !== draft.draftSeq) {
          pane.cancelledParent = { editId: draft.editId, baseVersion: base.version, baseDigest: base.digest };
          if (!await this.post(pane, { type: 'admission-superseded', paneSessionId: pane.id, draftSeq: draft.draftSeq, editId: draft.editId, baseVersion: base.version, baseDigest: base.digest }) && pane.attached) this.conflict(pane, draft.draftSeq, 'Validation cancellation could not be confirmed; draft retained.');
          continue;
        }
        if (this.disposed || !pane.attached || pane.locked || pane.failure) { this.conflict(pane, draft.draftSeq, 'Pane closed or locked during validation; draft retained.'); continue; }
        if (!admission.allowed) { this.conflict(pane, draft.draftSeq, admission.reason ?? 'Unsafe Markdown; source and draft retained.'); continue; }
        // No await between the exact source check above and entering the
        // native apply lane. Accepted native application may finish afterward.
        this.inFlight = { pane, draft, base };
        if (base.markdown !== draft.markdown && !await this.deps.applyEdit(minimalScratchEdit(base.markdown, draft.markdown, base.version))) throw new Error('Native edit refused');
        const applied = this.read();
        if (this.frozen || applied.markdown !== draft.markdown || applied.version !== base.version + (base.markdown === draft.markdown ? 0 : 1)) throw new Error('Document changed while applying');
        this.known = applied;
        const confirmed = this.read();
        if (this.frozen || confirmed.version !== applied.version || confirmed.digest !== applied.digest) {
          await this.deps.retainDraft(pane.latest ?? draft);
          throw new Error('Document changed before acknowledgement');
        }
        pane.appliedSeq = draft.draftSeq; pane.cancelledParent = undefined;
        pane.ack = { editId: draft.editId, baseVersion: base.version, baseDigest: base.digest, snapshot: applied, request: draft };
        const delivered = await this.post(pane, { type: 'apply-ack', paneSessionId: pane.id, draftSeq: draft.draftSeq, editId: draft.editId, ...applied });
        // Keep the durable draft throughout asynchronous acknowledgement. A
        // closed pane cannot confirm receipt, even when the native edit applied.
        if (!delivered || !pane.attached) {
          await this.deps.retainDraft(pane.latest ?? draft);
          this.conflict(pane, draft.draftSeq, 'Edit applied but acknowledgement could not be delivered; draft retained.');
        } else {
          await this.deps.draftApplied(draft);
          const afterClear = this.read();
          if (this.frozen || afterClear.version !== applied.version || afterClear.digest !== applied.digest) {
            await this.deps.retainDraft(pane.latest ?? draft);
            throw new Error('Document changed while confirming acknowledgement');
          }
        }
        for (const other of this.panes.values()) if (other !== pane) this.post(other, { type: 'document-state', paneSessionId: other.id, ...applied, locked: other.locked });
      } catch {
        // A clear can fail after unlink (for example directory fsync). Restore
        // the latest snapshot before reporting an unconfirmed operation.
        try { await this.deps.retainDraft(pane.latest ?? draft); }
        catch { this.deps.warn('Scratchpad recovery could not be persisted; keep this pane open and copy the draft before closing.'); }
        this.conflict(pane, draft.draftSeq, 'Edit could not be confirmed; source and recovery draft retained where storage is available.');
      }
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
  latestSequence(id: string): number { return this.panes.get(id)?.latest?.draftSeq ?? 0; }
  /** A selection may have been captured before our own acknowledgement reached
   * the renderer. Accept that base only for the latest draft, with either a
   * pending drain or proof that its own apply produced the current snapshot. */
  selectionSourceMatches(id: string, sequence: number, version: number): boolean {
    const pane = this.panes.get(id), current = this.read();
    if (!pane?.attached || this.disposed || this.frozen || pane.failure || sequence !== this.latestSequence(id)) return false;
    if (version === current.version) return true;
    const latest = pane.latest, ack = pane.ack;
    if (!latest || (version !== latest.baseVersion && version !== pane.reportedBaseVersion && !(ack?.request.draftSeq === sequence && version === ack.baseVersion))) return false;
    return sequence > pane.appliedSeq || (ack?.request.draftSeq === sequence && ack.snapshot.version === current.version && ack.snapshot.digest === current.digest);
  }
  /** Save/Send barriers wait for the captured sequence, including a later
   * promotion arriving asynchronously after an acknowledgement was delivered. */
  waitForSequence(id: string, sequence: number, timeoutMs = 10_000, signal?: AbortSignal): Promise<ScratchSnapshot> {
    const pane = this.panes.get(id);
    if (!pane || !Number.isSafeInteger(sequence) || sequence < 0 || sequence > (pane.latest?.draftSeq ?? 0)) return Promise.reject(new Error('Unknown draft sequence'));
    return new Promise((resolve, reject) => {
      const finish = (error?: Error): void => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); this.waiters.delete(check); if (error) reject(error); else resolve(this.read()); };
      const aborted = (): void => finish(new Error('Captured action cancelled; recovery is retained.'));
      const check = (): void => {
        if (signal?.aborted) aborted();
        else if (this.disposed || !pane.attached || this.frozen || pane.failure) finish(new Error('Draft could not be confirmed; recovery is retained.'));
        else if (pane.appliedSeq >= sequence) finish();
      };
      const timer = setTimeout(() => finish(new Error('Timed out waiting for draft acknowledgement; recovery is retained.')), timeoutMs);
      this.waiters.add(check); signal?.addEventListener('abort', aborted, {once:true}); check();
    });
  }
  async dispose(): Promise<void> { this.disposed = true; this.notify(); await this.flush(); this.panes.clear(); }
}
