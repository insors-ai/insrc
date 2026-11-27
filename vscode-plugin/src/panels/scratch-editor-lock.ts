/** Insrc-owned preference. Updating it affects only the toggled pane and future
 * panes; existing siblings keep their own captured lock state. */
export const SCRATCH_LOCK_PREFERENCE = 'scratchpad.editor.locked';
export interface ScratchPreferenceStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): PromiseLike<void>;
}
export class ScratchLockPreference {
  private pending = Promise.resolve();
  constructor(private readonly storage: ScratchPreferenceStorage) {}
  initial(): boolean { const value = this.storage.get<unknown>(SCRATCH_LOCK_PREFERENCE); return typeof value === 'boolean' ? value : true; }
  remember(locked: boolean): Promise<void> {
    const result = this.pending.catch(() => {}).then(async () => { await this.storage.update(SCRATCH_LOCK_PREFERENCE, locked); });
    this.pending = result; return result;
  }
}
