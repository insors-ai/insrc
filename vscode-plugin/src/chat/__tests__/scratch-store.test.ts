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
  // A fresh inode per seeded entry: a swap-in afterwards reports a different ino.
  if (fake.inos.get(path) === undefined) fake.inos.set(path, 9_000 + fake.files.size);
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
  // Idempotent delete of a missing file: success with ZERO mutations — the lstat
  // ENOENT short-circuits before any unlink is attempted on the missing id.
  const mark2 = fake.calls.length;
  await store.deleteScratch('20260101-000000-gone.md');
  assert.deepEqual(fake.mutationsSince(mark2), [], 'a missing-file delete records no mutation at all');
  assert.equal(fake.ops('unlink').filter((c) => c.path.endsWith('gone.md')).length, 0, 'no unlink was attempted on the missing id');

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

test('scratch-store.test.ts: a post-publication lstat failure does NOT fail createScratch — the scratch file exists, so the create succeeds with degraded metadata and a warning (CR attempt-6 t1 MED)', async () => {
  const { fake, store, warnings } = setup();
  await fake.fs.mkdir(ROOT);
  // Fail the lstat of the FINAL file only AFTER link() published it: let every
  // lstat through until the link, then poison final-path lstats.
  let linked = false;
  const seen: string[] = [];
  fake.failOn = (c) => {
    if (c.op === 'link') { linked = true; return undefined; }
    if (linked && c.op === 'lstat' && c.path.endsWith('.md') && !c.path.includes('.tmp-')) {
      seen.push(c.path);
      return Object.assign(new Error('EIO'), { code: 'EIO' });
    }
    return undefined;
  };
  const entry = await store.createScratch('Published But Unstatable', 'body');
  // The create RESOLVED (did not reject) even though the post-publish lstat failed.
  assert.match(entry.id, /-published-but-unstatable\.md$/);
  assert.equal(seen.length, 1, 'exactly the post-publication lstat was poisoned');
  // The file really exists with the body (publication happened before the stat failed).
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/${entry.id}`) ?? []).toString('utf8'), 'body');
  // Degraded metadata: size from the written content, mtime from now(), warning logged.
  assert.equal(entry.size, Buffer.byteLength('body', 'utf8'));
  assert.ok(entry.mtime > 0);
  assert.ok(warnings.some((w) => w.includes('could not stat')), 'a warning carries the stat failure');
  fake.failOn = undefined;
  // A later list re-reads the real stat and the entry shows up with true metadata.
  const list = await store.listScratches();
  assert.equal(list.length, 1);
  assert.equal(list[0]!.id, entry.id);
  assert.equal(list[0]!.size, Buffer.byteLength('body', 'utf8'));
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

test('scratch-store.test.ts: updateScratch happy path writes full text and replaces content; id validation refusal (outside-root, symlink, non-.md) → ScratchRefused; missing file → ScratchNotFound; write failure leaves destination unchanged and unlinks temp; temp path occupied by a symlink or existing file → exclusive create fails (EEXIST/ELOOP) and nothing is written outside the root', async () => {
  const { fake, store } = setup();
  await fake.fs.mkdir(ROOT);
  seed(fake, '20260101-000000-a.md', 'old content', 10);

  // Happy path: full replacement via exclusive temp write + unlink/link publish (never rename).
  await store.updateScratch('20260101-000000-a.md', 'brand new body\nwith lines\n');
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/20260101-000000-a.md`) ?? []).toString('utf8'), 'brand new body\nwith lines\n');
  const excl = fake.ops('writeFileExclusive');
  assert.equal(excl.length, 1);
  const tempPath = excl[0]?.path ?? '';
  assert.equal(tempPath.startsWith(`${ROOT}/.tmp-`), true);
  assert.equal(/\.md$/.test(tempPath), false);
  // Publish sequence: backup link(path, .bak) taken before unlink(destination), then
  // link(temp, destination), unlink(temp), unlink(backup) — never rename.
  const unlinks = fake.ops('unlink');
  const links = fake.ops('link');
  const publishLink = links.find((c) => c.path === tempPath);
  const backupLink = links.find((c) => c.path === `${ROOT}/20260101-000000-a.md` && (c.to ?? '').endsWith('.bak'));
  assert.ok(publishLink, 'temp was linked over the destination');
  assert.equal(publishLink?.to, `${ROOT}/20260101-000000-a.md`);
  assert.ok(backupLink, 'a backup hard link of the validated destination was taken before the unlink');
  const backupPath = backupLink?.to ?? '';
  assert.deepEqual(unlinks.map((c) => c.path).sort(), [`${ROOT}/20260101-000000-a.md`, tempPath, backupPath].sort());
  // No temp or backup left behind; destination re-opened O_NOFOLLOW + fstat before unlink.
  assert.equal(fake.files.has(tempPath), false);
  assert.equal(fake.files.has(backupPath), false);
  assert.equal(fake.ops('open').filter((c) => c.path.endsWith('a.md')).length, 1);
  assert.equal(fake.ops('fstat').filter((c) => c.path.endsWith('a.md')).length, 1);

  // Id validation refusal: same bad ids as read/delete, plus symlink and directory targets.
  fake.kinds.set(`${ROOT}/evil.md`, 'symlink');
  fake.linkTargets.set(`${ROOT}/evil.md`, '/etc/passwd');
  fake.dirs.add(`${ROOT}/dir.md`);
  fake.kinds.set(`${ROOT}/dir.md`, 'dir');
  const mark = fake.calls.length;
  for (const bad of ['.', '..', 'a/b.md', '../x.md', 'noext', '.md', 'x.MD', '20260101-a.md/../../evil.md', '', 'x y.md']) {
    await assert.rejects(store.updateScratch(bad, 'x'), (e: unknown) => e instanceof ScratchRefused, `update ${JSON.stringify(bad)}`);
  }
  await assert.rejects(store.updateScratch('evil.md', 'x'), (e: unknown) => e instanceof ScratchRefused);
  await assert.rejects(store.updateScratch('dir.md', 'x'), (e: unknown) => e instanceof ScratchRefused);
  await assert.rejects(store.updateScratch('20260101-000000-a.md', 42 as unknown as string), (e: unknown) => e instanceof ScratchRefused);
  // Refusals never wrote anything outside the root (zero mutations at all).
  assert.deepEqual(fake.mutationsSince(mark), []);

  // Missing file at save time -> ScratchNotFound.
  await assert.rejects(store.updateScratch('20260101-000000-gone.md', 'x'), (e: unknown) => e instanceof ScratchNotFound);

  // Temp path occupied by a symlink -> exclusive create ELOOP, nothing written outside root,
  // and the occupied temp entry is left strictly alone (we did not create it).
  seed(fake, '20260101-000001-b.md', 'keep', 20);
  const realWrite = fake.fs.writeFileExclusive;
  fake.fs.writeFileExclusive = async (p, data) => {
    fake.kinds.set(p, 'symlink');
    fake.linkTargets.set(p, '/etc/passwd');
    fake.inos.set(p, 777);
    await realWrite(p, data); // the fake then throws ELOOP for the symlink
    return undefined;
  };
  const markOcc = fake.calls.length;
  await assert.rejects(store.updateScratch('20260101-000001-b.md', 'evil'), (e: unknown) => e instanceof ScratchStoreError);
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/20260101-000001-b.md`) ?? []).toString('utf8'), 'keep', 'destination untouched');
  assert.equal(fake.kinds.get(fake.calls.slice(markOcc).find((c) => c.op === 'writeFileExclusive')?.path ?? ''), 'symlink', 'occupied temp entry left untouched, never unlinked');
  assert.equal(fake.calls.slice(markOcc).some((c) => c.op === 'unlink'), false, 'no unlink at all after the occupied-temp refusal');
  fake.fs.writeFileExclusive = realWrite;

  // Temp path occupied by an existing regular file -> EEXIST, same refusal, occupier intact.
  fake.fs.writeFileExclusive = async (p, data) => {
    fake.files.set(p, Buffer.from('occupier'));
    fake.kinds.set(p, 'file');
    fake.inos.set(p, 778);
    await realWrite(p, data); // fake throws EEXIST for the existing entry
    return undefined;
  };
  const markOcc2 = fake.calls.length;
  await assert.rejects(store.updateScratch('20260101-000001-b.md', 'evil2'), (e: unknown) => e instanceof ScratchStoreError);
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/20260101-000001-b.md`) ?? []).toString('utf8'), 'keep', 'destination untouched');
  const occPath = fake.calls.slice(markOcc2).find((c) => c.op === 'writeFileExclusive')?.path ?? '';
  assert.equal(Buffer.from(fake.files.get(occPath) ?? []).toString('utf8'), 'occupier', 'occupier intact');
  assert.equal(fake.calls.slice(markOcc2).some((c) => c.op === 'unlink'), false, 'no unlink after the EEXIST refusal');
  fake.fs.writeFileExclusive = realWrite;

  // Temp write failure (ENOSPC) -> ScratchStoreError, destination unchanged, temp unlinked.
  fake.failOn = (c) => (c.op === 'writeFileExclusive' ? Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }) : undefined);
  const markFail = fake.calls.length;
  await assert.rejects(store.updateScratch('20260101-000001-b.md', 'no room'), (e: unknown) => e instanceof ScratchStoreError);
  fake.failOn = undefined;
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/20260101-000001-b.md`) ?? []).toString('utf8'), 'keep', 'destination unchanged on temp-write failure');
  // The failed temp write left no .md and the temp was unlinked again (best-effort cleanup ran).
  assert.equal(fake.calls.slice(markFail).some((c) => c.op === 'unlink' && c.path.includes('.tmp-')), true, 'temp cleanup attempted after the failed write');

  // Destination deleted between validation and save -> ScratchNotFound, temp unlinked.
  fake.failOn = (c) => (c.op === 'open' && c.path.endsWith('20260101-000001-b.md') ? enoentOf(c.path) : undefined);
  await assert.rejects(store.updateScratch('20260101-000001-b.md', 'gone'), (e: unknown) => e instanceof ScratchNotFound);
  fake.failOn = undefined;

  // link() EEXIST race (destination recreated between unlink and link) -> bounded retry:
  // the next attempt re-validates the recreated entry (lstat + O_NOFOLLOW open + fstat
  // inode equality) and publishes over it — update replaces by name, the recreated
  // entry was a regular file inside the root, so replacing it is the update semantic.
  seed(fake, '20260101-000002-c.md', 'orig', 30);
  let linkAttempts = 0;
  const realLink = fake.fs.link;
  fake.fs.link = async (from, to) => {
    if (to.endsWith('20260101-000002-c.md') && linkAttempts++ === 0) {
      // A concurrent actor recreated the destination after our unlink.
      fake.files.set(`${ROOT}/20260101-000002-c.md`, Buffer.from('recreated', 'utf8'));
      fake.kinds.set(`${ROOT}/20260101-000002-c.md`, 'file');
      fake.mtimes.set(`${ROOT}/20260101-000002-c.md`, 31);
      fake.inos.set(`${ROOT}/20260101-000002-c.md`, 555000);
      throw eexist(to);
    }
    return realLink(from, to);
  };
  await store.updateScratch('20260101-000002-c.md', 'won the retry');
  assert.equal(linkAttempts, 2, 'first link EEXIST, retry re-validated and published');
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/20260101-000002-c.md`) ?? []).toString('utf8'), 'won the retry');
  fake.fs.link = realLink;

  // Destination swapped for a different regular file between validation and unlink:
  // the re-open fstat reports a different inode -> ScratchRefused, swap target untouched.
  seed(fake, '20260101-000003-d.md', 'original', 40);
  fake.failOn = (c) => {
    if (c.op === 'open' && c.path.endsWith('20260101-000003-d.md')) {
      fake.files.set(`${ROOT}/20260101-000003-d.md`, Buffer.from('swapped', 'utf8'));
      fake.inos.set(`${ROOT}/20260101-000003-d.md`, 424242);
    }
    return undefined;
  };
  await assert.rejects(store.updateScratch('20260101-000003-d.md', 'new'), (e: unknown) => e instanceof ScratchRefused);
  fake.failOn = undefined;
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/20260101-000003-d.md`) ?? []).toString('utf8'), 'swapped', 'swapped-in file left untouched');

  // Publish failure (non-EEXIST link error after the destination was unlinked): the
  // original content is restored from the backup hard link, temp+backup are cleaned,
  // and the caller sees ScratchStoreError with the destination UNTOUCHED (the plan's
  // acceptance check: "write/publish failure → ScratchStoreError with destination
  // untouched and temp unlinked").
  seed(fake, '20260101-000004-e.md', 'precious original', 50);
  // Fail only the temp->destination publish link (source is the .tmp- temp), not the
  // backup->destination restore link (source ends .bak).
  fake.failOn = (c) => (c.op === 'link' && c.to === `${ROOT}/20260101-000004-e.md` && !c.path.endsWith('.bak') ? Object.assign(new Error('EIO'), { code: 'EIO' }) : undefined);
  const markPub = fake.calls.length;
  await assert.rejects(store.updateScratch('20260101-000004-e.md', 'should not land'), (e: unknown) => e instanceof ScratchStoreError);
  fake.failOn = undefined;
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/20260101-000004-e.md`) ?? []).toString('utf8'), 'precious original', 'destination untouched (restored from backup) after publish failure');
  const pubCalls = fake.calls.slice(markPub);
  assert.equal(pubCalls.some((c) => c.op === 'link' && c.path === `${ROOT}/20260101-000004-e.md` && (c.to ?? '').endsWith('.bak')), true, 'backup link was taken before the unlink');
  assert.equal(pubCalls.some((c) => c.op === 'link' && c.path.endsWith('.bak') && c.to === `${ROOT}/20260101-000004-e.md`), true, 'backup was linked back over the destination name on restore');
  assert.equal(pubCalls.some((c) => c.op === 'unlink' && c.path.includes('.tmp-')), true, 'temp cleaned up after the failed publish');
  assert.equal(pubCalls.some((c) => c.op === 'unlink' && c.path.endsWith('.bak')), true, 'backup cleaned up after the failed publish');

  // Retry-path failure (the r14 CR MED at scratch-store.ts: a publish EEXIST retry whose
  // LATER validation fails must still restore the original from the backup, not just
  // unlink temp+backup): the first link() loses an EEXIST race, then the next attempt's
  // lstat fails with EIO -> the destination (already unlinked once) is restored from the
  // backup, temp+backup are cleaned, and the caller sees ScratchStoreError.
  seed(fake, '20260101-000005-f.md', 'retry-path original', 60);
  let retryLinkAttempts = 0;
  const realLink2 = fake.fs.link;
  fake.fs.link = async (from, to) => {
    if (to.endsWith('20260101-000005-f.md') && !from.endsWith('.bak') && retryLinkAttempts++ === 0) {
      fake.calls.push({ op: 'link', path: from, to } as never);
      // Lost an EEXIST race: by the time the retry re-validates, the destination name is
      // free again (the racing entry is gone), but the retry's lstat fails EIO below.
      throw eexist(to);
    }
    return realLink2(from, to);
  };
  // The retry attempt's lstat of the destination fails with EIO — but only once an
  // unlink of the destination was actually recorded (the pre-loop validation lstat and
  // attempt 0's lstat must pass; attempt 1's lstat, after attempt 0 unlinked, throws).
  const realLstat = fake.fs.lstat;
  fake.fs.lstat = async (p) => {
    if (p === `${ROOT}/20260101-000005-f.md` && fake.calls.some((c) => c.op === 'unlink' && c.path === p)) {
      const err = Object.assign(new Error('EIO'), { code: 'EIO' });
      fake.calls.push({ op: 'lstat', path: p } as never);
      throw err;
    }
    return realLstat(p);
  };
  const markRetry = fake.calls.length;
  await assert.rejects(store.updateScratch('20260101-000005-f.md', 'never lands'), (e: unknown) => e instanceof ScratchStoreError);
  fake.fs.link = realLink2;
  fake.fs.lstat = realLstat;
  fake.failOn = undefined;
  const retryCalls = fake.calls.slice(markRetry);
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/20260101-000005-f.md`) ?? []).toString('utf8'), 'retry-path original', 'retry-path failure restored the original from the backup');
  assert.equal(retryCalls.some((c) => c.op === 'link' && c.path.endsWith('.bak') && c.to === `${ROOT}/20260101-000005-f.md`), true, 'backup was linked back over the destination on the retry-path failure');
  assert.equal(retryCalls.some((c) => c.op === 'unlink' && c.path.includes('.tmp-')), true, 'temp cleaned up after the retry-path failure');
  assert.equal(retryCalls.some((c) => c.op === 'unlink' && c.path.endsWith('.bak')), true, 'backup cleaned up after the retry-path failure');

  // Backup-link ownership (the r26 CR MED): when the backup link itself fails (the random
  // .bak name is already occupied -> EEXIST), fail() must NOT unlink that backup path — it
  // is an entry this operation never created, so deleting it would clobber another file.
  seed(fake, '20260101-000006-g.md', 'owned original', 70);
  const ownedBak = `${ROOT}/.tmp-owned.bak`;
  seed(fake, '.tmp-owned.bak', 'foreign backup entry', 71);
  const realLink3 = fake.fs.link;
  let backupLinkHits = 0;
  fake.fs.link = async (from, to) => {
    // Fail ONLY the destination->backup link (to ends with a generated .bak name) with
    // EEXIST, simulating a collision on the random backup name.
    if (to.endsWith('.bak') && from === `${ROOT}/20260101-000006-g.md`) {
      backupLinkHits++;
      fake.calls.push({ op: 'link', path: from, to } as never);
      throw eexist(to);
    }
    return realLink3(from, to);
  };
  const markBak = fake.calls.length;
  await assert.rejects(store.updateScratch('20260101-000006-g.md', 'never lands'), (e: unknown) => e instanceof ScratchStoreError);
  fake.fs.link = realLink3;
  const bakCalls = fake.calls.slice(markBak);
  assert.equal(backupLinkHits, 1, 'backup link was attempted exactly once');
  assert.equal(bakCalls.some((c) => c.op === 'unlink' && c.path.endsWith('.bak')), false, 'no .bak path was unlinked — the failed backup link was never owned');
  assert.equal(Buffer.from(fake.files.get(`${ROOT}/20260101-000006-g.md`) ?? []).toString('utf8'), 'owned original', 'destination untouched when the backup link fails');
  assert.equal(Buffer.from(fake.files.get(ownedBak) ?? []).toString('utf8'), 'foreign backup entry', 'the foreign .bak entry survives a failed backup link');
  assert.equal(bakCalls.some((c) => c.op === 'unlink' && c.path.includes('.tmp-')), true, 'temp still cleaned up when the backup link fails');
});

test('scratch-store.test.ts: updateScratch bumps mtime so listScratches reflects the save', async () => {
  const { fake, store } = setup();
  await fake.fs.mkdir(ROOT);
  seed(fake, '20260101-000000-a.md', 'before', 100);
  seed(fake, '20260101-000001-b.md', 'other', 200);
  assert.equal((await store.listScratches())[0]?.id, '20260101-000001-b.md');

  fake.clock += 50;
  await store.updateScratch('20260101-000000-a.md', 'after');
  const list = await store.listScratches();
  assert.equal(list[0]?.id, '20260101-000000-a.md', 'the saved scratchpad moved to the list head');
  assert.equal(list[0]?.size, Buffer.byteLength('after', 'utf8'));
  assert.ok((list[0]?.mtime ?? 0) > 100, 'mtime bumped past the seeded value');
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
