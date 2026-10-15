/**
 * Story E202610138d4b90c9:S001 — reading an HTML companion of a workflow artifact for the
 * review pane's frame.
 *
 * A vscode-free, deps-injected reader. Given a repo-relative path it answers the file's
 * text, or undefined unless ALL of these hold: the path ends in .html, it stays under the
 * workspace folder's docs/ directory (checked on the path as written and again after
 * symlinks are resolved), it is a regular file, and it is at most COMPANION_MAX_BYTES. It
 * never throws: the pane shows the path and a line of text for a file it is not given.
 */

import { promises as nodeFsp } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

/** The largest companion the pane will load into its frame. */
export const COMPANION_MAX_BYTES = 8 * 1024 * 1024;

export interface CompanionReaderDeps {
  /** The workspace folder the artifact's paths are relative to; undefined when none is open. */
  readonly root: () => string | undefined;
  /** The file system, injectable for tests. */
  readonly fs?: Pick<typeof nodeFsp, 'realpath' | 'stat' | 'readFile'> | undefined;
}

export type CompanionReader = (relPath: string) => Promise<string | undefined>;

/** Whether `path` is `dir` itself or inside it. */
function within(dir: string, path: string): boolean {
  const rel = relative(dir, path);
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);
}

type ResolveFs = Pick<typeof nodeFsp, 'realpath' | 'stat'>;

/**
 * The real path of the regular file `relPath` names under `root`, or undefined. `relPath` is
 * refused when it is absolute or when `..` takes it out of `container` (the whole of `root`
 * unless a narrower folder is given), checked as written and again once symlinks are resolved,
 * so a link inside the folder cannot lead out of it. It never throws.
 */
export async function resolveWithin(
  root: string,
  relPath: string,
  fs: ResolveFs = nodeFsp,
  container: string = root,
): Promise<string | undefined> {
  try {
    if (typeof relPath !== 'string' || relPath === '' || isAbsolute(relPath)) return undefined;
    const file = resolve(root, relPath);
    // As written: a '..' that leaves the container is refused before anything is touched.
    if (!within(container, file)) return undefined;
    // As it really is: a symlink under the container must not lead out of it.
    const realContainer = await fs.realpath(container);
    const realFile = await fs.realpath(file);
    if (!within(realContainer, realFile)) return undefined;
    const stat = await fs.stat(realFile);
    return stat.isFile() ? realFile : undefined;
  } catch {
    return undefined; // missing, unreadable, or no such folder
  }
}

export function createCompanionReader(deps: CompanionReaderDeps): CompanionReader {
  const fs = deps.fs ?? nodeFsp;
  return async (relPath) => {
    try {
      const root = deps.root();
      if (root === undefined || root === '') return undefined;
      if (typeof relPath !== 'string' || !/\.html$/i.test(relPath)) return undefined;
      const realFile = await resolveWithin(root, relPath, fs, resolve(root, 'docs'));
      if (realFile === undefined || !/\.html$/i.test(realFile)) return undefined;
      const stat = await fs.stat(realFile);
      if (stat.size > COMPANION_MAX_BYTES) return undefined;
      return await fs.readFile(realFile, 'utf8');
    } catch {
      return undefined; // missing, unreadable, or no docs/ folder
    }
  };
}
