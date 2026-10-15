/**
 * Epic babd84c6e2fb480a Story S001 — opening a link or a code reference the user clicked in the
 * chat or the review pane.
 *
 * The page only reports what was clicked ('open-link' / 'open-code-ref'); this is where it is
 * checked and opened. A vscode-free, deps-injected module shared by both hosts: only an http or
 * https address goes to the browser, and a path opens only when it names a regular file inside
 * the workspace folder (no absolute path, no '..', no symlink out). It never throws: a refused
 * or failed open is logged and the click does nothing.
 */

import { promises as nodeFsp } from 'node:fs';
import { resolveWithin } from './companion-reader.js';

export interface LinkOpenerDeps {
  /** The workspace folder code references are relative to; undefined when none is open. */
  readonly root: () => string | undefined;
  /** Open an address in the browser. Resolves false when nothing was opened. */
  readonly openExternal: (url: string) => PromiseLike<boolean>;
  /** Open a file (a real path) in the editor with a 1-based line selected, when given. */
  readonly openFile: (realPath: string, line: number | undefined) => PromiseLike<unknown>;
  /** The file system, injectable for tests. */
  readonly fs?: Pick<typeof nodeFsp, 'realpath' | 'stat'> | undefined;
  readonly log: { warn(msg: string): void };
}

export interface LinkOpener {
  openLink(url: unknown): Promise<void>;
  openCodeRef(path: unknown, line: unknown): Promise<void>;
}

/** The largest line a reference may name; anything else opens the file at its top. */
const MAX_LINE = 10_000_000;

export function createLinkOpener(deps: LinkOpenerDeps): LinkOpener {
  const fs = deps.fs ?? nodeFsp;
  return {
    async openLink(url) {
      try {
        let parsed: URL | undefined;
        try {
          parsed = typeof url === 'string' ? new URL(url) : undefined;
        } catch {
          parsed = undefined;
        }
        if (parsed === undefined || (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')) {
          deps.log.warn(`[links] not opened: ${typeof url === 'string' ? url.slice(0, 120) : typeof url} is not an http or https address`);
          return;
        }
        if (!(await deps.openExternal(parsed.href))) deps.log.warn(`[links] the browser did not open ${parsed.href}`);
      } catch (err: unknown) {
        deps.log.warn(`[links] could not open the address: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    async openCodeRef(path, line) {
      try {
        const root = deps.root();
        if (root === undefined || root === '') {
          deps.log.warn('[links] a code reference was not opened: no workspace folder is open');
          return;
        }
        if (typeof path !== 'string' || path.split(/[\\/]/).includes('..')) {
          deps.log.warn(`[links] a code reference was not opened: ${typeof path === 'string' ? path.slice(0, 120) : typeof path} is not a path inside the workspace`);
          return;
        }
        const real = await resolveWithin(root, path, fs);
        if (real === undefined) {
          deps.log.warn(`[links] a code reference was not opened: ${path.slice(0, 120)} is not a file inside the workspace`);
          return;
        }
        const n = typeof line === 'number' && Number.isInteger(line) && line >= 1 && line <= MAX_LINE ? line : undefined;
        await deps.openFile(real, n);
      } catch (err: unknown) {
        deps.log.warn(`[links] could not open the code reference: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
  };
}
