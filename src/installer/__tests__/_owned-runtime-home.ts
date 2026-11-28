/** Test-only capability. Never adopts a path or repairs a shared SDK/runtime. */
import { constants } from 'node:fs';
import type { Stats } from 'node:fs';
import { lstat, mkdtemp, open, readdir, realpath, rmdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import type { ChildProcess } from 'node:child_process';
import { stopOwnedChildren } from '../../daemon/tools/__tests__/_proc.js';
import { InstallerError } from '../contracts.js';
import { closeOwnedFile } from '../owned-file.js';
import { operationTimeBudgets } from '../operation-time-budgets.mjs';

const uncertain = (reason: string, cause?: unknown) => new InstallerError('fixture-cleanup-uncertain', reason, { cause });
const same = (a: Stats, b: Stats) => a.dev === b.dev && a.ino === b.ino && a.uid === b.uid
  && a.isDirectory() === b.isDirectory() && a.isSymbolicLink() === b.isSymbolicLink();

export async function ownedRuntimeHome(prefix = 'insrc-owned-runtime-') {
  if (!prefix || /[/\\\0]/.test(prefix)) throw uncertain('Fixture prefix must be a single filename');
  const root = await mkdtemp(join(await realpath(tmpdir()), prefix)), original = await lstat(root);
  const children: ChildProcess[] = [], links = new Set<string>();
  const resources: { closed: boolean; failure?: unknown; settled: Promise<void> }[] = [];
  let retained: unknown, closing: Promise<void> | undefined;
  const assertOpen = () => { if (closing) throw uncertain('Fixture cleanup already started'); };
  async function assertRoot() {
    const current = await lstat(root);
    if (!same(original, current) || !current.isDirectory() || current.isSymbolicLink()
      || (process.platform !== 'win32' && (current.uid !== process.getuid?.() || (current.mode & 0o7077)))) {
      throw uncertain(`Original fixture root ownership changed; retained ${root}`);
    }
  }
  function relativePath(path: string) {
    const part = relative(root, path);
    if (!part || isAbsolute(part) || part === '..' || part.startsWith('../') || part.startsWith('..\\')) throw uncertain('Fixture link must be beneath its original root');
    return path;
  }
  async function dispose() {
    try {
      // This uses retained registered group handles, never PID/age inference.
      await stopOwnedChildren(children);
      if (retained) throw uncertain(`Fixture explicitly retained: ${root}`, retained);
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([Promise.all(resources.map(resource => resource.settled)), new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(uncertain(`Fixture resource closure is unconfirmed; retained ${root}`)), operationTimeBudgets().runtime.resourceDrainMs);
        })]);
      } finally { if (timer) clearTimeout(timer); }
      if (resources.some(resource => !resource.closed || resource.failure)) throw uncertain(`Fixture resource closure failed; retained ${root}`);
      await assertRoot();
      const directories: { path: string; stat: Stats }[] = [], files: { path: string; stat: Stats }[] = [];
      let count = 0;
      async function visit(path: string, depth: number): Promise<void> {
        if (++count > 200_000 || depth > 64) throw uncertain('Fixture cleanup tree bound exceeded');
        const stat = await lstat(path);
        if (stat.dev !== original.dev || (process.platform !== 'win32' && stat.uid !== original.uid)) throw uncertain('Fixture entry ownership or volume changed');
        if (stat.isSymbolicLink()) {
          if (!links.has(path)) throw uncertain('Unknown fixture symlink retained without following it');
          files.push({ path, stat }); return;
        }
        if (stat.isDirectory()) {
          if (process.platform !== 'win32' && (stat.mode & 0o7022)) throw uncertain('Unsafe fixture directory permissions');
          directories.push({ path, stat });
          for (const name of await readdir(path)) await visit(join(path, name), depth + 1);
        } else if (stat.isFile() && stat.nlink === 1) files.push({ path, stat });
        else throw uncertain('Fixture contains a special or multiply linked entry');
      }
      // Complete the nofollow preflight before changing even the root's mode.
      await visit(root, 0); await assertRoot();
      for (const { path, stat } of directories) {
        const current = await lstat(path);
        if (!same(stat, current)) throw uncertain('Fixture directory changed before write restoration');
        if (process.platform === 'win32' || (current.mode & 0o200)) continue;
        const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_DIRECTORY);
        try {
          if (!same(current, await handle.stat())) throw uncertain('Fixture directory changed while opening');
          await handle.chmod((current.mode & 0o777) | 0o200);
          if (!same(current, await lstat(path))) throw uncertain('Fixture directory changed during write restoration');
        } finally { await closeOwnedFile(handle); }
      }
      await assertRoot();
      for (const { path, stat } of files) {
        const current = await lstat(path);
        if (!same(stat, current) || (!current.isSymbolicLink() && current.nlink !== 1)) throw uncertain('Fixture file changed before disposal');
        await unlink(path); // Known symlinks are unlinked; their targets are never opened/chmodded.
      }
      for (const { path, stat } of directories.reverse()) {
        if (!same(stat, await lstat(path))) throw uncertain('Fixture directory changed before disposal');
        await rmdir(path); // Unexpected new members fail closed rather than recursive deletion.
      }
    } catch (cause) {
      retained = cause; throw uncertain(`Owned fixture cleanup is uncertain; retained ${root}`, cause);
    }
  }
  return {
    root,
    assertOwned: assertRoot,
    trackChild<T extends ChildProcess>(child: T): T { assertOpen(); children.push(child); return child; },
    trackResource(closed: Promise<void>) {
      assertOpen(); const proof: typeof resources[number] = { closed: false, settled: Promise.resolve() };
      proof.settled = closed.then(() => { proof.closed = true; }, cause => { proof.failure = cause; }); resources.push(proof);
    },
    allowFixtureSymlink(path: string) { assertOpen(); links.add(relativePath(path)); },
    retain(reason: unknown) { retained = uncertain('Fixture closure is unconfirmed', reason); },
    cleanup(): Promise<void> { return closing ??= dispose(); },
  };
}
