export interface ScratchFlushState { readonly sequence: number; readonly pending: boolean; readonly unavailable: boolean }
/** A bounded acknowledgement barrier for one immutable action capture. It
 * never recaptures newer typing and never claims acknowledgement is a save. */
export class ScratchActionFlush {
  private pending: { readonly sequence: number; readonly promise: Promise<{draftSeq: number}>; readonly resolve: (value: {draftSeq: number}) => void; readonly reject: (error: Error) => void; readonly timer: ReturnType<typeof setTimeout> } | undefined;
  private closed = false;
  constructor(private readonly state: () => ScratchFlushState, private readonly expedite: (sequence: number) => boolean) {}
  get waiting(): boolean { return this.pending !== undefined; }
  flush(): Promise<{draftSeq: number}> {
    const captured = this.state();
    if (this.closed || captured.unavailable) return Promise.reject(new Error('Captured draft cannot be confirmed; text is retained.'));
    this.changed();
    if (this.pending?.sequence === captured.sequence) return this.pending.promise;
    if (!captured.pending) return Promise.resolve({draftSeq: captured.sequence});
    let resolve!: (value: {draftSeq: number}) => void, reject!: (error: Error) => void;
    const promise = new Promise<{draftSeq: number}>((r, j) => { resolve = r; reject = j; });
    const timer = setTimeout(() => { if (this.pending?.promise === promise) this.cancel('Timed out confirming the captured draft; text is retained.'); }, 20_000);
    this.pending = {sequence: captured.sequence, promise, resolve, reject, timer};
    if (!this.expedite(captured.sequence)) this.cancel('Captured validation is unavailable; text is retained.');
    return promise;
  }
  changed(): void {
    const pending = this.pending; if (!pending) return;
    const current = this.state();
    if (this.closed || current.unavailable) { this.cancel('Captured draft could not be confirmed; text is retained.'); return; }
    if (current.sequence !== pending.sequence) { this.cancel('Scratchpad changed while preparing the action; retry. Newer text is retained.'); return; }
    if (!current.pending) { clearTimeout(pending.timer); this.pending = undefined; pending.resolve({draftSeq: pending.sequence}); }
  }
  cancel(message: string): void {
    const pending = this.pending; if (!pending) return;
    clearTimeout(pending.timer); this.pending = undefined; pending.reject(new Error(message));
  }
  dispose(): void { this.closed = true; this.cancel('Scratchpad pane closed; pending text is retained.'); }
}
