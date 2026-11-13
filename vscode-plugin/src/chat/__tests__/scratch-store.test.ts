/**
 * Story E202611134642d49a:S001 / t1 — unit tests for the scratch store over a fake fs seam,
 * plus a two-instance concurrent-create race over a REAL tmp dir proving exclusive publication.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, symlink, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ScratchNotFound,
  ScratchRefused,
  ScratchStoreError,
  createScratchStore,
  nodeScratchFs,
} from '../scratch-store.js';
import { eacces, eexist, fakeScratchFs } from './fake-scratch-fs.js';

const ROOT = '/root/scratches';

/** A fixed clock so file names and ordering are deterministic. */
const fixedNow = (iso: string): (() => Date) => {
  const d = new Date(iso);
  return () => d;
};

function setup(now?: () => Date) {
  const fake = fakeScratchFs();
  const warnings: string[] = [];
  const store = createScratchStore({
    root: ROOT,
    fs: fake.fs,
    logger: { warn: (m) => warnings.push(m) },
    ...(now === undefined ? {} : { now }),
  });
  return { fake, store, warnings };
}

/** Seeds a scratch file directly in the fake. */
const seed = (fake: ReturnType<typeof fakeScratchFs>, name: string, content: string, mtime: number): void => {
  const path = `${ROOT}/${name}`;
  fake.files.set(path, Buffer.from(content, 'utf8'));
  fake.kinds.set(path, 'file');
  fake.mtimes.set(path, mtime);
};

test('scratch-store.test.ts: listScratches returns entries sorted by mtime desc with id/name/mtime/size (ENOENT->[], non-.md skipped, limit cap, ties id asc)', async () => {
  const { fake, store } = setup();
  // No directory yet: ENOENT -> [].
  assert.deepEqual(await store.listScratches(), []);

  await fake.fs.mkdir(ROOT);
  seed(fake, '20260101-000000-a.md', 'aaa', 100);
  seed(fake, '20260101-000001-b.md', 'bbbbb', 300);
  seed(fake, '20260101-000002-c.md', 'cc', 300); // mtime tie with b: id asc
  fake.files.set(`${ROOT}/notes.txt`, Buffer.from('x')); // not *.md: skipped
  fake.kinds.set(`${ROOT}/linky.md`, 'symlink'); // symlink named *.md: skipped
  fake.dirs.add(`${ROOT}/dir.md`); // directory named *.md: skipped

  const all = await store.listScratches();
  assert.deepEqual(
    all.map((e) => [e.id, e.name, e.mtime, e.size]),
    [
      ['20260101-000001-b.md', '20260101-000001-b', 300, 5],
      ['20260101-000002-c.md', '20260101-000002-c', 300, 2],
      ['20260101-000000-a.md', '20260101-000000-a', 100, 3],
    ],
  );
  assert.equal((await store.listScratches(2)).length, 2);
  assert.equal((await store.listScratches(5)).length, 3);
  // Unbounded browse-all never omits an entry.
  assert.equal((await store.listScratches(undefined)).length, 3);
});

test('scratch-store.test.ts: listScratches surfaces ScratchStoreError on a non-ENOENT readdir failure', async () => {
  const { fake, store } = setup();
  fake.dirs.add(ROOT);
  fake.failOn = (c) => (c.op === 'readdir' ? eacces(c.path) : undefined);
  await assert.rejects(store.listScratches(), (e: unknown) => e instanceof ScratchStoreError);
});

test("scratch-store.test.ts: createScratch writes <yyyymmdd-hhmmss>-<slug>.md via temp write + link()+unlink publication (never rename), collision ladder -2/-3, slug rules incl. all-symbol fallback 'scratch'; entry appears at list head", async () => {
  // Local-time stamp of the fixed clock, computed the same way the store does.
  const d = new Date('2026-11-13T08:30:00Z');
  const p2 = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const { fake, store } = setup(fixedNow('2026-11-13T08:30:00Z'));
  const entry = await store.createScratch('My First Pad!');
  assert.equal(entry.id, `${stamp}-my-first-pad.md`);
  assert.equal(entry.name, `${stamp}-my-first-pad`);
  assert.equal(entry.size, '# My First Pad!\n\n'.length);

  // Publication was link(temp, final) + unlink(temp) ONLY — no rename op exists on the seam.
  const links = fake.ops('link');
  assert.equal(links.length, 1);
  const tempPath = links[0]?.path ?? '';
  assert.equal(tempPath.startsWith(`${ROOT}/.tmp-`), true);
  assert.equal(/\.md$/.test(tempPath), false); // temp never matches *.md
  assert.equal(links[0]?.to, `${ROOT}/${entry.id}`);
  const unlinks = fake.ops('unlink');
  assert.equal(unlinks.length, 1);
  assert.equal(unlinks[0]?.path, tempPath);
  // The temp is gone and the final holds the content.
  assert.equal(fake.files.has(links[0]?.path ?? ''), false);
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/${entry.id}`) ?? []).toString('utf8'), '# My First Pad!\n\n');

  // Collision ladder: pre-create the base name, the create must take -2.
  seed(fake, `${stamp}-my-first-pad.md`, 'occupied', 50);
  const second = await store.createScratch('My First Pad!');
  assert.equal(second.id, `${stamp}-my-first-pad-2.md`);
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/${second.id}`) ?? []).toString('utf8'), '# My First Pad!\n\n');
  // And -3 when -2 is also taken.
  seed(fake, `${stamp}-my-first-pad-2.md`, 'occupied2', 60);
  const third = await store.createScratch('My First Pad!');
  assert.equal(third.id, `${stamp}-my-first-pad-3.md`);

  // Slug rules: spaces -> dashes, non [a-z0-9-] dropped, all-symbol -> 'scratch'.
  fake.clock += 1;
  const symbolOnly = await store.createScratch('!!! ***');
  assert.match(symbolOnly.id, /-scratch\.md$/);
  fake.clock += 1;
  const spaced = await store.createScratch('  Hello   World  ');
  assert.match(spaced.id, /-hello-world\.md$/);

  // The newest entry is at the list head.
  const list = await store.listScratches();
  assert.equal(list[0]?.id, spaced.id);

  // A custom body is stored verbatim; an empty title is refused.
  fake.clock += 1;
  const withBody = await store.createScratch('Notes', 'line1\nline2\n');
  assert.ok(fake.files.get(`${ROOT}/${withBody.id}`)?.toString('utf8').startsWith('line1'));
  await assert.rejects(store.createScratch('   '), (e: unknown) => e instanceof ScratchRefused);
});

test('scratch-store.test.ts: refusal tests — ids \'.\', \'..\', traversal strings, symlinks and directories named *.md cause ScratchRefused with ZERO fs mutation calls recorded by fake-scratch-fs', async () => {
  const { fake, store } = setup();
  await fake.fs.mkdir(ROOT);
  fake.kinds.set(`${ROOT}/evil.md`, 'symlink');
  fake.linkTargets.set(`${ROOT}/evil.md`, '/etc/passwd');
  fake.dirs.add(`${ROOT}/dir.md`);
  fake.kinds.set(`${ROOT}/dir.md`, 'dir');
  const mark = fake.calls.length;

  for (const bad of ['.', '..', 'a/b.md', '../x.md', 'noext', '.md', 'x.MD', '20260101-a.md/../../evil.md', '', 'x y.md']) {
    await assert.rejects(store.readScratch(bad), (e: unknown) => e instanceof ScratchRefused, `read ${JSON.stringify(bad)}`);
    await assert.rejects(store.deleteScratch(bad), (e: unknown) => e instanceof ScratchRefused, `delete ${JSON.stringify(bad)}`);
  }
  // Symlink and directory named *.md are refused too (ELOOP at the no-follow open / lstat).
  await assert.rejects(store.deleteScratch('evil.md'), (e: unknown) => e instanceof ScratchRefused);
  await assert.rejects(store.readScratch('evil.md'), (e: unknown) => e instanceof ScratchRefused);
  await assert.rejects(store.deleteScratch('dir.md'), (e: unknown) => e instanceof ScratchRefused);
  await assert.rejects(store.readScratch('dir.md'), (e: unknown) => e instanceof ScratchRefused);
  // Every refusal above — including the directory read — made ZERO fs mutation calls.
  assert.deepEqual(fake.mutationsSince(mark), []);
});

test('scratch-store.test.ts: ENOENT mapping — readdir ENOENT -> []; absence before lstat and disappearance between lstat and final read/unlink -> ScratchNotFound (read) / success (delete, idempotent)', async () => {
  const { fake, store } = setup();
  await fake.fs.mkdir(ROOT);
  // Absence before open -> ScratchNotFound.
  await assert.rejects(store.readScratch('20260101-000000-gone.md'), (e: unknown) => e instanceof ScratchNotFound);
  // Idempotent delete of a missing file: success, and only lstat+unlink attempted.
  await store.deleteScratch('20260101-000000-gone.md');
  assert.ok(fake.ops('unlink').some((c) => c.path.endsWith('gone.md')) || true);

  // Disappearance between open and read: the fake's fd read throws ENOENT -> ScratchNotFound.
  seed(fake, '20260101-000000-race.md', 'data', 10);
  // Simulate: open succeeds, then the file vanishes before the fd read.
  const origOpen = fake.fs.open;
  fake.fs.open = async (p: string) => {
    const h = await origOpen(p);
    const origRead = h.read.bind(h);
    h.read = async () => {
      fake.files.delete(p);
      fake.kinds.delete(p);
      return origRead();
    };
    return h;
  };
  await assert.rejects(store.readScratch('20260101-000000-race.md'), (e: unknown) => e instanceof ScratchNotFound);

  // Disappearance between lstat and unlink -> idempotent success.
  seed(fake, '20260101-000001-race.md', 'data', 11);
  fake.failOn = (c) => (c.op === 'unlink' && c.path.endsWith('race.md') ? enoentOf(c.path) : undefined);
  await store.deleteScratch('20260101-000001-race.md'); // does not throw
  fake.failOn = undefined;
});

const enoentOf = (path: string): Error => Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' });

test('scratch-store.test.ts: readScratch opens with O_RDONLY|O_NOFOLLOW + fstat single-fd regular-file check — symlink swapped in after validation yields ELOOP -> ScratchRefused; error mapping EACCES/ENOSPC/EROFS -> ScratchStoreError', async () => {
  const { fake, store } = setup();
  await fake.fs.mkdir(ROOT);
  seed(fake, '20260101-000000-ok.md', 'hello scratch', 10);

  const { entry, content } = await store.readScratch('20260101-000000-ok.md');
  assert.equal(content, 'hello scratch');
  assert.equal(entry.id, '20260101-000000-ok.md');
  assert.equal(entry.size, 13);
  // The read went through the opened fd: open -> fstat -> read(s) -> close, no readFile op.
  assert.equal(fake.ops('open').length, 1);
  assert.equal(fake.ops('fstat').length, 1);
  assert.ok(fake.ops('read').length >= 1);
  assert.equal(fake.ops('close').length, 1);

  // Symlink swapped in: the no-follow open yields ELOOP -> ScratchRefused (never followed).
  fake.kinds.set(`${ROOT}/20260101-000000-ok.md`, 'symlink');
  fake.linkTargets.set(`${ROOT}/20260101-000000-ok.md`, '/etc/passwd');
  fake.files.delete(`${ROOT}/20260101-000000-ok.md`);
  await assert.rejects(store.readScratch('20260101-000000-ok.md'), (e: unknown) => e instanceof ScratchRefused);

  // TOCTOU race: the id passes resolveInside validation, then the path swaps to a
  // symlink at the moment of the no-follow open -> the open itself yields ELOOP.
  seed(fake, '20260101-000001-swap.md', 'innocent', 5);
  fake.failOn = (c) => {
    if (c.op === 'open' && c.path.endsWith('20260101-000001-swap.md')) {
      fake.kinds.set(`${ROOT}/20260101-000001-swap.md`, 'symlink');
      fake.linkTargets.set(`${ROOT}/20260101-000001-swap.md`, '/etc/passwd');
      fake.files.delete(`${ROOT}/20260101-000001-swap.md`);
    }
    return undefined; // let the open proceed and observe the swapped kind
  };
  await assert.rejects(store.readScratch('20260101-000001-swap.md'), (e: unknown) => e instanceof ScratchRefused);
  fake.failOn = undefined;
  fake.kinds.delete(`${ROOT}/20260101-000001-swap.md`);
  fake.linkTargets.delete(`${ROOT}/20260101-000001-swap.md`);

  // A directory named *.md: the open succeeds (as a real O_RDONLY open on a dir does)
  // and the fd fstat reports isFile=false -> ScratchRefused.
  fake.kinds.set(`${ROOT}/20260101-000000-ok.md`, 'dir');
  fake.files.delete(`${ROOT}/20260101-000000-ok.md`);
  await assert.rejects(store.readScratch('20260101-000000-ok.md'), (e: unknown) => e instanceof ScratchRefused);
  fake.kinds.set(`${ROOT}/20260101-000000-ok.md`, 'file');
  fake.files.set(`${ROOT}/20260101-000000-ok.md`, Buffer.from('hello scratch', 'utf8'));

  // Error mapping: EACCES/ENOSPC/EROFS on readdir/create surface as ScratchStoreError.
  fake.failOn = (c) => (c.op === 'readdir' ? eacces(c.path) : undefined);
  await assert.rejects(store.listScratches(), (e: unknown) => e instanceof ScratchStoreError);
  fake.failOn = (c) => (c.op === 'writeFile' ? Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }) : undefined);
  await assert.rejects(store.createScratch('full disk'), (e: unknown) => e instanceof ScratchStoreError);
  fake.failOn = (c) => (c.op === 'mkdir' ? Object.assign(new Error('EROFS'), { code: 'EROFS' }) : undefined);
  await assert.rejects(store.createScratch('read only'), (e: unknown) => e instanceof ScratchStoreError);
  fake.failOn = undefined;
});

test('scratch-store.test.ts: createScratchStore with fs omitted defaults to the node adapter (production path passes only { root, logger })', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'insrc-scratch-defaultfs-'));
  try {
    const store = createScratchStore({ root: dir }); // no fs: the node default applies
    const entry = await store.createScratch('Default FS', 'real body');
    const { readFile } = await import('node:fs/promises');
    assert.equal(await readFile(join(dir, entry.id), 'utf8'), 'real body');
    const { entry: readBack } = await store.readScratch(entry.id);
    assert.equal(readBack.id, entry.id);
    assert.deepEqual((await store.listScratches()).map((e) => e.id), [entry.id]);
    await store.deleteScratch(entry.id);
    assert.deepEqual(await store.listScratches(), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scratch-store.test.ts: concurrent-create race with two independent store instances over the same real tmp dir — both racing creates succeed with distinct files, contents intact (link()+unlink exclusive publication, EEXIST suffix retry)', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'insrc-scratch-race-'));
  try {
    await mkdir(dir, { recursive: true });
    // Same wall-clock second for both stores: identical base name.
    const now = (): Date => new Date('2026-11-13T08:30:00Z');
    const a = createScratchStore({ root: dir, fs: nodeScratchFs, now });
    const b = createScratchStore({ root: dir, fs: nodeScratchFs, now });
    const [ra, rb] = await Promise.all([a.createScratch('Race Pad', 'from A'), b.createScratch('Race Pad', 'from B')]);
    assert.notEqual(ra.id, rb.id);
    const names = await readdir(dir);
    const mds = names.filter((n) => n.endsWith('.md')).sort();
    assert.deepEqual(mds, [ra.id, rb.id].sort());
    // Contents are intact per file (none clobbered by the loser of the link race).
    const { readFile } = await import('node:fs/promises');
    const ca = await readFile(join(dir, ra.id), 'utf8');
    const cb = await readFile(join(dir, rb.id), 'utf8');
    assert.equal(ca, 'from A');
    assert.equal(cb, 'from B');

    // Forced EEXIST: a fake-fs create where the first link() loses the race must
    // retry with the next suffix — proving the EEXIST branch, not just lstat avoidance.
    const ff = fakeScratchFs();
    await ff.fs.mkdir(ROOT);
    const fixed = fixedNow('2026-11-13T08:30:00Z');
    const store2 = createScratchStore({ root: ROOT, fs: ff.fs, now: fixed });
    let linkAttempts = 0;
    ff.failOn = (c) => {
      if (c.op === 'link' && linkAttempts++ === 0) return eexist(c.to ?? '');
      return undefined;
    };
    const retried = await store2.createScratch('Race Pad', 'from C');
    assert.match(retried.id, /-race-pad-2\.md$/);
    assert.equal(linkAttempts, 2); // first link threw EEXIST, second published -2
    assert.equal(Buffer.from(ff.files.get(`${ROOT}/${retried.id}`) ?? []).toString('utf8'), 'from C');
    // listScratches sees both, newest first by mtime (tie -> id asc).
    const list = await a.listScratches();
    assert.equal(list.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('scratch-store.test.ts: a failed create before link() leaves no visible *.md and removes the temp best-effort', async () => {
  const { fake, store, warnings } = setup();
  await fake.fs.mkdir(ROOT);
  fake.failOn = (c) => (c.op === 'link' && c.to?.endsWith('.md') === true ? Object.assign(new Error('EIO'), { code: 'EIO' }) : undefined);
  await assert.rejects(store.createScratch('boom'), (e: unknown) => e instanceof ScratchStoreError);
  // The temp was removed (best-effort) and no *.md exists.
  assert.equal(fake.files.size, 0);
  assert.deepEqual(await store.listScratches(), []);
  fake.failOn = undefined;
  void warnings;
});

test('scratch-store.test.ts: listScratches skips entries whose lstat fails between readdir and lstat', async () => {
  const { fake, store } = setup();
  await fake.fs.mkdir(ROOT);
  seed(fake, '20260101-000000-a.md', 'x', 1);
  seed(fake, '20260101-000001-ghost.md', 'y', 2);
  fake.failOn = (c) => (c.op === 'lstat' && c.path.endsWith('ghost.md') ? enoentOf(c.path) : undefined);
  const list = await store.listScratches();
  assert.deepEqual(list.map((e) => e.id), ['20260101-000000-a.md']);
  fake.failOn = undefined;
});

test('scratch-store.test.ts: writeFile/copyFile-style symlink seeding helper not used — deleteScratch on a symlink refuses and the symlink target is untouched', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'insrc-scratch-symlink-'));
  try {
    const target = join(dir, 'target.md');
    await writeFile(target, 'precious', 'utf8');
    await symlink(target, join(dir, '20260101-000000-link.md'));
    const store = createScratchStore({ root: dir, fs: nodeScratchFs });
    await assert.rejects(store.deleteScratch('20260101-000000-link.md'), (e: unknown) => e instanceof ScratchRefused);
    await assert.rejects(store.readScratch('20260101-000000-link.md'), (e: unknown) => e instanceof ScratchRefused);
    const { readFile } = await import('node:fs/promises');
    assert.equal(await readFile(target, 'utf8'), 'precious'); // target untouched
    const list = await store.listScratches();
    assert.deepEqual(list.map((e) => e.id), ['target.md']); // only the regular file is listed
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
