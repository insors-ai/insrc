/**
 * Shared test fakes for the S003 host suites — an in-memory HostFileSystem + a
 * scripted HostEnv, so the writers/detection/adapters are exercised off a real fs
 * and off VS Code.
 */
import type { HostFileSystem } from '../fs.js';
import type { HostEnv } from '../types.js';

export interface FakeFs extends HostFileSystem {
  files: Map<string, string>;
  /** When set, the NEXT write to any path in this set throws (permission/EROFS sim). */
  failWrites: Set<string>;
}

/** An in-memory HostFileSystem; `seed` pre-populates path→content. */
export function fakeFs(seed: Record<string, string> = {}): FakeFs {
  const files = new Map<string, string>(Object.entries(seed));
  const failWrites = new Set<string>();
  return {
    files,
    failWrites,
    read(path: string): string | undefined {
      return files.get(path);
    },
    write(path: string, content: string): void {
      if (failWrites.has(path)) {
        const e = new Error(`EACCES: permission denied, open '${path}'`) as NodeJS.ErrnoException;
        e.code = 'EACCES';
        throw e;
      }
      files.set(path, content);
    },
    exists(path: string): boolean {
      return files.has(path);
    },
  };
}

/** A scripted HostEnv: `extensions` is the installed-extension id set. */
export function fakeEnv(opts: { extensions?: string[]; appName?: string; uriScheme?: string } = {}): HostEnv {
  const installed = new Set(opts.extensions ?? []);
  return {
    getExtension: (id) => installed.has(id),
    appName: opts.appName ?? 'Visual Studio Code',
    uriScheme: opts.uriScheme ?? 'vscode',
  };
}
