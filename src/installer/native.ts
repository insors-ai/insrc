import { createRequire } from 'node:module';
import { InstallerError } from './contracts.js';

interface ControlBinding {
  acquire(path: string): object;
  held(handle: object): boolean;
  close(handle: object): void;
  replace(handle: object, from: string, to: string): void;
  publishDirectory(handle: object, from: string, to: string): void;
  protect(directory: string): void;
  userSid(): string;
  localVolume(directory: string): boolean;
  safePath(path: string, directory: boolean, privateOwner: boolean): boolean;
}
let binding: ControlBinding | undefined;
/** No compilation, download, application imports or fallback lock implementation. */
export function controlBinding(): ControlBinding {
  if (!binding) {
    const path = import.meta.url.endsWith('.ts') ? '../../out/installer/native/control.node' : './native/control.node';
    try { binding = createRequire(import.meta.url)(path) as ControlBinding; }
    catch (cause) { throw new InstallerError('native-unavailable', 'A qualified target-native control binding is required', { cause }); }
  }
  return binding;
}
