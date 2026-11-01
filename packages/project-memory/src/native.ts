import { MemoryError } from './errors.js';

/** Private Node adapter. This module itself never loads the native dependency. */
export interface NativeLock {
  exclusive(fd: number): Promise<void>;
  closeOnExec(fd: number): void;
}

interface Binding {
  flock(fd: number, flags: string, callback: (error: NodeJS.ErrnoException | null) => void): void;
  fcntlSync(fd: number, command: string, arg: number): number;
  constants: { FD_CLOEXEC: number };
}

const nativeModule = 'fs-ext';
export async function loadNative(loader: () => Promise<unknown> = () => import(nativeModule)): Promise<NativeLock> {
  let loaded: unknown;
  try { loaded = await loader(); } catch { throw new MemoryError('NOT_READY', 'Native ownership support is unavailable.', true); }
  const module = loaded as { default?: unknown } | null;
  const value = (module?.default ?? loaded) as Partial<Binding> | null;
  if (typeof value?.flock !== 'function' || typeof value.fcntlSync !== 'function' || typeof value.constants?.FD_CLOEXEC !== 'number') {
    throw new MemoryError('NOT_READY', 'Native ownership support is incompatible.');
  }
  const binding = value as Binding;
  return {
    exclusive: fd => new Promise<void>((resolve, reject) => {
      binding.flock(fd, 'exnb', error => error ? reject(error) : resolve());
    }),
    closeOnExec: fd => { binding.fcntlSync(fd, 'setfd', binding.constants.FD_CLOEXEC); },
  };
}
