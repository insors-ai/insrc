/**
 * Story E20260921ad0d45c9:S003 / t1 — the injectable host-filesystem seam (sc5).
 *
 * Both reversible writers (McpConfigWriter JSON key-merge + SteeringWriter marker
 * block) go through this narrow seam so their never-clobber / no-partial-write
 * logic is unit-testable off a real fs (the S002 SubprocessRunner/DaemonPaths
 * pattern). Mirrors the JetBrains HostFileIo/NioHostFileIo split.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

/** The narrow host-owned-file slice the writers touch. */
export interface HostFileSystem {
  /** File content, or `undefined` when the file does not exist. */
  read(path: string): string | undefined;
  /** Overwrite `path` with `content` (creating parent dirs). */
  write(path: string, content: string): void;
  /** Whether `path` exists. */
  exists(path: string): boolean;
}

/**
 * Raised when a host-owned file cannot be read or written — permissions, a
 * read-only location, a missing parent, or a malformed shape we refuse to
 * clobber (Story S003 / sc5).
 *
 * Surfaced to the caller, never swallowed, and only after the target file was
 * left exactly as it was (no partial write), so the combined wire can continue
 * for the other detected hosts. Mirrors the JetBrains HostFileAccessException.
 */
export class HostFileAccessError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'HostFileAccessError';
  }
}

/**
 * The production HostFileSystem over node:fs. `read` returns `undefined` for an
 * absent file (ENOENT) and rethrows every other read error; `write` creates the
 * parent directory tree first, then writes in one call.
 */
export const defaultHostFileSystem: HostFileSystem = {
  read(path: string): string | undefined {
    try {
      return readFileSync(path, 'utf8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
      throw err;
    }
  },
  write(path: string, content: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
  },
  exists(path: string): boolean {
    return existsSync(path);
  },
};
