/**
 * The Watcher reports files in directories that were created together with their parent. @parcel/watcher on
 * Linux never watches those nested directories, so a file written there produced no event at all.
 * Real watcher, temporary directories, polling waits with a time limit.
 * Run: npx tsx --test src/indexer/__tests__/watcher-new-directories.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Watcher } from '../watcher.js';
import type { FileEvent } from '../watcher.js';

const WAIT_MS = 15_000;
const cleanups: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c(); });

interface Harness { root: string; watcher: Watcher; events: FileEvent[]; seen(path: string, type?: FileEvent['type']): boolean; until(p: () => boolean, what: string): Promise<void> }

/** A watcher on a fresh temporary repo directory. */
async function harness(ignore?: readonly string[]): Promise<Harness> {
  const base = mkdtempSync(join(tmpdir(), 'insrc-watcher-'));
  const root = join(realpathSync(base), 'repo');
  mkdirSync(root);
  const watcher = new Watcher();
  const events: FileEvent[] = [];
  watcher.onEvents(e => { events.push(...e); });
  if (ignore === undefined) await watcher.addRepo(root); else await watcher.addRepo(root, ignore);
  cleanups.push(async () => { await watcher.close(); rmSync(base, { recursive: true, force: true }); });
  await new Promise(r => setTimeout(r, 300));          // let the subscription settle before the test writes
  return {
    root, watcher, events,
    seen: (path, type) => events.some(e => e.path === path && (type === undefined || e.type === type)),
    async until(p, what) {
      const end = Date.now() + WAIT_MS;
      while (!p()) {
        if (Date.now() > end) throw new Error(`timed out waiting for ${what}; events: ${events.map(e => `${e.type} ${e.path}`).join(' | ')}`);
        await new Promise(r => setTimeout(r, 50));
      }
    },
  };
}

test('src/indexer/__tests__/watcher-new-directories.test.ts: after addRepo, mkdir -p a/b/c with a file written in it at once yields a create event for that file, and a second file written in a/b/c three seconds later yields an event too (the case that produced no event before the fix)', async () => {
  const h = await harness();
  const dir = join(h.root, 'a', 'b', 'c');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'first.ts'), 'export const a = 1;\n');
  await h.until(() => h.seen(join(dir, 'first.ts'), 'create'), 'the create event for the file written at once');
  await new Promise(r => setTimeout(r, 3000));          // the scenario: a later write into the same directory
  writeFileSync(join(dir, 'second.ts'), 'export const b = 2;\n');
  await h.until(() => h.seen(join(dir, 'second.ts')), 'an event for the file written three seconds later');
});

test('src/indexer/__tests__/watcher-new-directories.test.ts: a directory tree with files created in one call yields a create event for every file in the tree, including files in nested directories, and a symbolic link to a directory is not followed', async () => {
  const h = await harness();
  const outside = mkdtempSync(join(tmpdir(), 'insrc-watcher-outside-'));
  cleanups.push(() => rmSync(outside, { recursive: true, force: true }));
  writeFileSync(join(outside, 'elsewhere.ts'), 'export const e = 1;\n');
  const tree = join(h.root, 'tree');
  const files = [join(tree, 'x', 'y', 'deep.ts'), join(tree, 'x', 'mid.ts'), join(tree, 'z', 'side.ts'), join(tree, 'top.ts')];
  mkdirSync(join(tree, 'x', 'y'), { recursive: true });
  mkdirSync(join(tree, 'z'));
  for (const f of files) writeFileSync(f, 'export const v = 1;\n');
  symlinkSync(outside, join(tree, 'link'), 'dir');
  for (const f of files) await h.until(() => h.seen(f, 'create'), `a create event for ${f}`);
  assert.equal(h.events.some(e => e.path.startsWith(join(tree, 'link') + '/')), false, 'nothing under the symbolic link is reported');
  assert.equal(h.events.some(e => e.path.includes('elsewhere.ts')), false);
});

test('src/indexer/__tests__/watcher-new-directories.test.ts: files inside a new directory whose name is on the ignore list (node_modules) and inside an ignored subdirectory of a new directory yield no events, at creation and when written later', async () => {
  const h = await harness();
  const ignoredTop = join(h.root, 'node_modules', 'pkg', 'lib');
  mkdirSync(ignoredTop, { recursive: true });
  writeFileSync(join(ignoredTop, 'in-node-modules.ts'), 'x\n');
  const proj = join(h.root, 'proj');
  mkdirSync(join(proj, 'out', 'gen'), { recursive: true });            // 'out' is on the ignore list
  mkdirSync(join(proj, 'src', 'deep'), { recursive: true });
  writeFileSync(join(proj, 'out', 'gen', 'in-out.ts'), 'x\n');
  writeFileSync(join(proj, 'src', 'deep', 'kept.ts'), 'x\n');
  await h.until(() => h.seen(join(proj, 'src', 'deep', 'kept.ts'), 'create'), 'the event for the kept file');
  await new Promise(r => setTimeout(r, 1000));
  writeFileSync(join(ignoredTop, 'later.ts'), 'x\n');                  // written later into the ignored tree
  writeFileSync(join(proj, 'out', 'gen', 'later.ts'), 'x\n');
  writeFileSync(join(proj, 'src', 'deep', 'sentinel.ts'), 'x\n');       // arrives after the ignored writes would have
  await h.until(() => h.seen(join(proj, 'src', 'deep', 'sentinel.ts')), 'the sentinel event');
  await new Promise(r => setTimeout(r, 500));
  assert.deepEqual(h.events.filter(e => /node_modules|\/out\//.test(e.path)), [], 'no event from an ignored directory');
});

test('src/indexer/__tests__/watcher-new-directories.test.ts: after a new nested directory is deleted and created again with the same path, files written in it are reported again', async () => {
  const h = await harness();
  const dir = join(h.root, 'cycle', 'inner');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'one.ts'), 'x\n');
  await h.until(() => h.seen(join(dir, 'one.ts')), 'the first file');
  rmSync(join(h.root, 'cycle'), { recursive: true, force: true });
  await h.until(() => h.seen(join(h.root, 'cycle'), 'delete'), 'the delete event for the directory');
  h.events.length = 0;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'two.ts'), 'x\n');
  await h.until(() => h.seen(join(dir, 'two.ts'), 'create'), 'the file written at once after re-creating the directory');
  await new Promise(r => setTimeout(r, 1500));
  writeFileSync(join(dir, 'three.ts'), 'x\n');
  await h.until(() => h.seen(join(dir, 'three.ts')), 'the file written later after re-creating the directory');
});

test("src/indexer/__tests__/watcher-new-directories.test.ts: after close() no handler is called for later writes, and after removeRepo() the repo's per-directory subscriptions deliver nothing", async () => {
  const closing = await harness();
  const dirA = join(closing.root, 'q', 'r');
  mkdirSync(dirA, { recursive: true });
  writeFileSync(join(dirA, 'before.ts'), 'x\n');
  await closing.until(() => closing.seen(join(dirA, 'before.ts')), 'the file before close');
  await closing.watcher.close();
  closing.events.length = 0;
  writeFileSync(join(dirA, 'after-close.ts'), 'x\n');
  mkdirSync(join(closing.root, 'm', 'n'), { recursive: true });
  writeFileSync(join(closing.root, 'm', 'n', 'new.ts'), 'x\n');
  await new Promise(r => setTimeout(r, 1500));
  assert.deepEqual(closing.events, [], 'nothing is delivered after close()');

  const removing = await harness();
  const dirB = join(removing.root, 's', 't');
  mkdirSync(dirB, { recursive: true });
  writeFileSync(join(dirB, 'before.ts'), 'x\n');
  await removing.until(() => removing.seen(join(dirB, 'before.ts')), 'the file before removeRepo');
  await removing.watcher.removeRepo(removing.root);
  removing.events.length = 0;
  writeFileSync(join(dirB, 'after-remove.ts'), 'x\n');
  await new Promise(r => setTimeout(r, 1500));
  assert.deepEqual(removing.events, [], 'the directory subscription delivers nothing after removeRepo()');
});
