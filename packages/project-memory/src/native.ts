import { MemoryError } from './errors.js';

/** Private Node adapter. This module itself never loads the native dependency. */
export interface NativeLock {
  exclusive(fd: number): Promise<void>;
  closeOnExec(fd: number): void;
}

interface Binding {
  flockSync(fd: number, flags: string): void;
  fcntlSync(fd: number, command: string, arg: number): number;
  constants: { FD_CLOEXEC: number };
}

const nativeModule = 'fs-ext';
export async function loadNative(loader: () => Promise<unknown> = () => import(nativeModule)): Promise<NativeLock> {
  let loaded: unknown;
  try { loaded = await loader(); } catch { throw new MemoryError('NOT_READY', 'Native ownership support is unavailable.', true); }
  const module = loaded as { default?: unknown } | null;
  const value = (module?.default ?? loaded) as Partial<Binding> | null;
  if (typeof value?.flockSync !== 'function' || typeof value.fcntlSync !== 'function' || typeof value.constants?.FD_CLOEXEC !== 'number') {
    throw new MemoryError('NOT_READY', 'Native ownership support is incompatible.');
  }
  const binding = value as Binding;
  return {
    // exnb never waits for another owner. Avoid fs-ext's async callback, whose
    // NAN callback state is unsafe across concurrent Node worker isolates.
    exclusive: async fd => { binding.flockSync(fd, 'exnb'); },
    closeOnExec: fd => { binding.fcntlSync(fd, 'setfd', binding.constants.FD_CLOEXEC); },
  };
}
