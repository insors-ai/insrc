import type { ScratchSnapshot } from './scratch-editor-state.js';

export interface ScratchIdleValidationOptions<C, R> {
  readonly source: () => ScratchSnapshot;
  readonly eligible: (candidate: C, base: ScratchSnapshot) => boolean;
  readonly validate: (candidate: C, base: ScratchSnapshot, current: () => boolean) => Promise<R>;
  readonly complete: (candidate: C, base: ScratchSnapshot, result: R) => void;
  readonly failed: (candidate: C, error: unknown) => void;
  readonly dispose: () => void;
  readonly now?: (() => number) | undefined;
}
interface Ticket<C> { readonly candidate: C; readonly due: number }
/** One running immutable candidate and the latest typing generation. There is
 * deliberately no max-wait: continuous typing never starts full validation. */
export class ScratchIdleValidation<C, R> {
  private latest: Ticket<C> | undefined;
  private active = false;
  private forced: Ticket<C> | undefined;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private checked: { ticket: Ticket<C>; version: number; digest: string } | undefined;
  constructor(private readonly options: ScratchIdleValidationOptions<C, R>) {}
  private now(): number { return this.options.now?.() ?? performance.now(); }
  stage(candidate: C): void {
    if (this.closed) return;
    this.checked = undefined; this.forced = undefined;
    this.latest = { candidate, due: this.now() + 300 };
    this.refresh();
  }
  expedite(matches: (candidate: C) => boolean): boolean {
    if (this.closed || !this.latest || !matches(this.latest.candidate)) return false;
    this.forced = this.latest; this.refresh(); return true;
  }
  /** Acknowledgements/unlock may make a waiting candidate eligible. Preserve
   * its own typing deadline; host traffic is not a new user edit. */
  refresh(): void {
    clearTimeout(this.timer); this.timer = undefined;
    if (this.closed || this.active || !this.latest) return;
    const ticket = this.latest, base = this.options.source();
    if (this.checked?.ticket === ticket && this.checked.version === base.version && this.checked.digest === base.digest) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.run(ticket); }, this.forced === ticket ? 0 : Math.max(0, ticket.due - this.now()));
  }
  private async run(ticket: Ticket<C>): Promise<void> {
    if (this.closed || this.active || this.latest !== ticket) return;
    const base = this.options.source();
    if (!this.options.eligible(ticket.candidate, base)) return;
    this.active = true;
    const current = (): boolean => !this.closed && this.latest === ticket && this.options.source().version === base.version && this.options.source().digest === base.digest;
    try {
      const result = await this.options.validate(ticket.candidate, base, current);
      if (current() && this.options.eligible(ticket.candidate, base)) {
        this.checked = { ticket, version: base.version, digest: base.digest };
        this.options.complete(ticket.candidate, base, result);
      }
    } catch (error) {
      if (current()) {
        this.checked = { ticket, version: base.version, digest: base.digest };
        this.options.failed(ticket.candidate, error);
      }
    } finally { this.active = false; this.refresh(); }
  }
  dispose(): void {
    if (this.closed) return;
    this.closed = true; clearTimeout(this.timer); this.timer = undefined;
    this.latest = undefined; this.checked = undefined; this.forced = undefined; this.options.dispose();
  }
}
