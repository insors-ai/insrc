import { createHash } from 'node:crypto';
import { lstatSync, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import { posix, win32 } from 'node:path';
import { InstallerError } from './contracts.js';
import type { InstallationLocation, Target } from './contracts.js';

export function assertToken(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value)) throw new InstallerError('identity-invalid', 'Expected a bounded path-safe identity');
}
export function assertRelativeFile(value: string): void {
  if (!value || value.length > 1024 || /[\\:<>"|?*\u0000-\u001f\u007f]/.test(value)
    || value.split('/').some(part => !part || part === '.' || part === '..' || /[. ]$/.test(part)
      || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    throw new InstallerError('path-invalid', 'Expected a contained portable relative file path');
  }
}
export function normalizeHome(home: string, os: Target['os']): string {
  const path = os === 'win32' ? win32 : posix;
  if (!home || home.length > 4096 || /[\u0000-\u001f\u007f]/.test(home) || /^[\\/]{2}/.test(home)
    || !path.isAbsolute(home) || (os === 'win32' && !/^[a-z]:[\\/]/i.test(home))
    || home.split(/[\\/]/).some(part => part === '..' || part === '.')) {
    throw new InstallerError('home-invalid', 'Installation home must be an absolute local path without traversal');
  }
  if (os === 'win32' && /[:<>"|?*]/.test(home.slice(2))) throw new InstallerError('home-invalid', 'Unsupported Windows home path');
  if (os === 'win32') {
    const tail = home.slice(3).replaceAll('\\', '/').replace(/\/+$/, '');
    if (tail) assertRelativeFile(tail);
  }
  const normalized = path.normalize(home);
  return normalized.length === path.parse(normalized).root.length ? normalized : normalized.replace(/[\\/]+$/, '');
}

/** Pure resolver. The caller obtains a SID from the qualified platform binding. */
export function resolveInstallationLocation(installationId: string, options: {
  home?: string | undefined; os?: Target['os'] | undefined; userHome?: string | undefined; userSid?: string | undefined;
} = {}): InstallationLocation {
  assertToken(installationId);
  const os = options.os ?? process.platform;
  if (os !== 'darwin' && os !== 'linux' && os !== 'win32') throw new InstallerError('target-unsupported', 'Unsupported installation OS');
  const path = os === 'win32' ? win32 : posix;
  const home = normalizeHome(options.home ?? path.join(options.userHome ?? homedir(), '.insrc'), os);
  let address: string;
  if (os === 'win32') {
    if (!options.userSid || !/^S-1-(?:\d+-)+\d+$/.test(options.userSid)) throw new InstallerError('user-identity-unavailable', 'A verified Windows user SID is required');
    const key = createHash('sha256').update(`${options.userSid}\0${installationId}\0${home.toLowerCase()}`).digest('hex').slice(0, 32);
    address = `\\\\.\\pipe\\insrc-${key}`;
  } else {
    address = path.join(home, 'daemon.sock');
    if (Buffer.byteLength(address) > (os === 'darwin' ? 103 : 107)) throw new InstallerError('endpoint-too-long', 'Unix socket path exceeds the platform limit');
  }
  return { home, installationId, daemonEndpoint: { kind: os === 'win32' ? 'named-pipe' : 'unix', address, installationId } };
}

/** Filesystem-family admission is separate from target-native release qualification.
 * Linux identifiers: https://github.com/torvalds/linux/blob/master/include/uapi/linux/magic.h
 * APFS type 26 is also checked by the host-native location test. Windows needs
 * the t2 volume/drive probe: Node statfs alone is not proof of a local volume. */
export function isSupportedControlFilesystem(os: Target['os'], type: number): boolean {
  return os === 'darwin' ? type === 26 : os === 'linux' ? [0xef53, 0x58465342, 0x9123683e].includes(type) : false;
}

/** Read-only admission. The qualified platform binding supplies the Windows probe.
 * Does not create home, allocate identity or open stores. */
export function assertLocalControlRoot(home: string, verifyFilesystem?: (directory: string) => boolean): void {
  const os = process.platform;
  if (os !== 'darwin' && os !== 'linux' && os !== 'win32') throw new InstallerError('target-unsupported', 'Unsupported installation OS');
  const normalized = normalizeHome(home, os), path = os === 'win32' ? win32 : posix;
  for (const name of [normalized, path.join(normalized, 'install')]) {
    let current = name;
    while (true) {
      try {
        const stat = lstatSync(current);
        if (stat.isSymbolicLink() || !stat.isDirectory()) throw new InstallerError('home-invalid', 'Control roots and ancestors must be real directories');
        if (!(verifyFilesystem ? verifyFilesystem(current) : isSupportedControlFilesystem(os, statfsSync(current).type))) {
          throw new InstallerError('filesystem-unsupported', 'Control filesystem is network-backed, unsupported or lacks its platform probe');
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) break;
      current = parent;
    }
  }
}
