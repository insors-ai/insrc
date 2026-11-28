/** Insrc-owned preference. Updating it affects only the toggled pane and future
 * panes; existing siblings keep their own captured lock state. */
export const SCRATCH_LOCK_PREFERENCE = 'scratchpad.editor.locked';
export interface ScratchPreferenceStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}
export class ScratchLockPreference {
  private pending = Promise.resolve();
  // While persistence is provisional (or restoration failed), new panes must
  // see the previous committed default, never an uncommitted storage write.
  private held: { readonly value: unknown } | undefined;
  constructor(private readonly storage: ScratchPreferenceStorage) {}
  initial(): boolean {
    const value = this.held ? this.held.value : this.storage.get<unknown>(SCRATCH_LOCK_PREFERENCE);
    return typeof value === 'boolean' ? value : true;
  }
  /** Persistence, cancellation recheck, native commit and rollback occupy the
   * same serial lane. A rollback cannot overwrite a later pane's preference.
   * apply is synchronous: no cancellation can interleave after that commit. */
  transition(locked: boolean, current: () => boolean, apply: () => void): Promise<void> {
    const result = this.pending.catch(() => {}).then(async () => {
      if (!current()) throw new Error('Lock change cancelled; previous state retained.');
      const previous = this.held ? this.held.value : this.storage.get<unknown>(SCRATCH_LOCK_PREFERENCE);
      this.held = {value:previous};
      try {
        await this.storage.update(SCRATCH_LOCK_PREFERENCE, locked);
        if (!current()) throw new Error('Lock change cancelled; previous state retained.');
        apply(); this.held = undefined;
      } catch (failure) {
        try { await this.storage.update(SCRATCH_LOCK_PREFERENCE, previous); this.held = undefined; }
        catch {
          // Storage cannot be assumed unchanged after a rejected write. Keep
          // this window's known default and make persistence uncertainty explicit.
          const reason = failure instanceof Error ? failure.message : 'storage failure';
          throw new Error(`Lock preference failed (${reason}) and could not be restored; this window retains its previous default.`);
        }
        throw failure;
      }
    });
    this.pending = result; return result;
  }
  remember(locked: boolean): Promise<void> { return this.transition(locked, () => true, () => {}); }
}
