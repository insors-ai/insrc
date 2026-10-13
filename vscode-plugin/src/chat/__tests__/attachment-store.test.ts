/**
 * Story E2026101259da3204:S001 / t1 — the attachment store over a fake file seam.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AttachmentRefused,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_MESSAGE,
  PASTE_IMAGE_MIMES,
  createAttachmentStore,
} from '../attachment-store.js';
import { fakeAttachmentFs } from './fake-attachment-fs.js';

const ROOT = '/root/chat-attachments';
const bytes = (n: number, fill = 7): Uint8Array => new Uint8Array(n).fill(fill);

function setup(now?: () => number) {
  const fake = fakeAttachmentFs();
  const warnings: string[] = [];
  const store = createAttachmentStore({ root: ROOT, fs: fake.fs, logger: { warn: (m) => warnings.push(m) }, ...(now ? { now } : {}) });
  return { fake, store, warnings };
}

test("attachment store: addBytes and addFile write into the session's own directory under a safe numbered name and return id, original name, kind, size and path", async () => {
  const { fake, store } = setup();
  assert.equal(store.dirOf('a/b'), `${ROOT}/a_b`);

  const pasted = await store.addBytes('a/b', { name: '', mime: 'image/png', bytes: bytes(5) });
  assert.deepEqual(pasted, { id: '1-pasted-image.png', name: 'pasted-image.png', kind: 'image', size: 5, path: `${ROOT}/a_b/1-pasted-image.png` });
  assert.deepEqual(fake.files.get(pasted.path), bytes(5));

  fake.files.set('/home/u/My Report (v2)/né.pdf', bytes(9, 1));
  const doc = await store.addFile('a/b', '/home/u/My Report (v2)/né.pdf');
  assert.deepEqual(doc, { id: '2-n.pdf', name: 'né.pdf', kind: 'file', size: 9, path: `${ROOT}/a_b/2-n.pdf` });
  assert.deepEqual(fake.files.get(doc.path), bytes(9, 1));
  // The document is copied; the original is left where it was.
  assert.ok(fake.files.has('/home/u/My Report (v2)/né.pdf'));

  // A separator or a parent step in a given name never reaches the stored name.
  const tricky = await store.addBytes('a/b', { name: '../../etc/pass wd.jpg', mime: 'image/jpeg', bytes: bytes(3) });
  assert.equal(tricky.id, '3-....etcpasswd.jpg');
  assert.equal(tricky.path, `${ROOT}/a_b/3-....etcpasswd.jpg`);
  assert.equal(tricky.name, '../../etc/pass wd.jpg');

  // A picked image is an image; the same file twice gives two attachments.
  fake.files.set('/home/u/shot.PNG', bytes(4));
  const one = await store.addFile('a/b', '/home/u/shot.PNG');
  const two = await store.addFile('a/b', '/home/u/shot.PNG');
  assert.equal(one.kind, 'image');
  assert.notEqual(one.id, two.id);

  // Another session has its own directory and its own numbering.
  const other = await store.addBytes('other', { name: 'x.gif', mime: 'image/gif', bytes: bytes(2) });
  assert.equal(other.path, `${ROOT}/other/1-x.gif`);

  // A new store over the same directory carries on after the highest number on disk.
  const again = createAttachmentStore({ root: ROOT, fs: fake.fs });
  assert.equal((await again.addBytes('a/b', { name: 'y.webp', mime: 'image/webp', bytes: bytes(1) })).id, '6-y.webp');

  // Two adds started together never share a number.
  const [p, q] = await Promise.all([
    store.addBytes('race', { name: 'p.png', mime: 'image/png', bytes: bytes(1) }),
    store.addBytes('race', { name: 'q.png', mime: 'image/png', bytes: bytes(1) }),
  ]);
  assert.deepEqual([p.id, q.id].sort(), ['1-p.png', '2-q.png']);
});

test('attachment store: an oversize paste or file, a mime outside the image list and a source that is not a regular file are refused with AttachmentRefused and nothing is written', async () => {
  const { fake, store } = setup();
  assert.equal(MAX_ATTACHMENT_BYTES, 20 * 1024 * 1024);
  assert.equal(MAX_ATTACHMENTS_PER_MESSAGE, 10);
  assert.deepEqual([...PASTE_IMAGE_MIMES], ['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

  const refused = async (run: () => Promise<unknown>, sentence: RegExp): Promise<void> => {
    await assert.rejects(run, (e: unknown) => e instanceof AttachmentRefused && sentence.test(e.message));
  };
  await refused(() => store.addBytes('s', { name: 'big.png', mime: 'image/png', bytes: bytes(MAX_ATTACHMENT_BYTES + 1) }), /big\.png is larger than the 20 MB limit/);
  await refused(() => store.addBytes('s', { name: 'a.svg', mime: 'image/svg+xml', bytes: bytes(3) }), /not a supported image/);
  await refused(() => store.addBytes('s', { name: 'a.txt', mime: 'text/plain', bytes: bytes(3) }), /not a supported image/);
  await refused(() => store.addBytes('s', { name: 'e.png', mime: 'image/png', bytes: bytes(0) }), /e\.png is empty/);

  fake.files.set('/src/huge.bin', bytes(MAX_ATTACHMENT_BYTES + 1));
  await refused(() => store.addFile('s', '/src/huge.bin'), /huge\.bin is larger than the 20 MB limit/);
  fake.dirs.add('/src/folder');
  await refused(() => store.addFile('s', '/src/folder'), /folder is not a readable file/);
  await refused(() => store.addFile('s', '/src/missing.txt'), /missing\.txt is not a readable file/);
  fake.files.set('/src/locked.txt', bytes(2));
  fake.failOn = (c) => (c.op === 'stat' && c.path === '/src/locked.txt' ? new Error('EACCES') : undefined);
  await refused(() => store.addFile('s', '/src/locked.txt'), /locked\.txt is not a readable file/);
  fake.failOn = undefined;

  assert.deepEqual(fake.ops('writeFile', 'copyFile', 'mkdir'), []);
  assert.deepEqual([...fake.files.keys()].filter((p) => p.startsWith(ROOT)), []);

  // Exactly the limit is taken.
  assert.equal((await store.addBytes('s', { name: 'edge.png', mime: 'image/png', bytes: bytes(MAX_ATTACHMENT_BYTES) })).size, MAX_ATTACHMENT_BYTES);
});

test("attachment store: remove ignores an id that is not a plain file name in the session's directory, and remove and removeSession succeed when the target is gone", async () => {
  const { fake, store } = setup();
  const a = await store.addBytes('s', { name: 'a.png', mime: 'image/png', bytes: bytes(2) });
  const b = await store.addBytes('s', { name: 'b.png', mime: 'image/png', bytes: bytes(2) });
  fake.files.set(`${ROOT}/other/1-keep.png`, bytes(1));
  fake.dirs.add(`${ROOT}/other`);

  for (const bad of ['../other/1-keep.png', '..', '.', '', 'a.png', '1-a/b.png', '1-a\\b.png', `${ROOT}/other/1-keep.png`, 7 as unknown as string]) {
    await store.remove('s', bad);
  }
  assert.deepEqual(fake.ops('rm'), []);
  assert.ok(fake.files.has(`${ROOT}/other/1-keep.png`));

  await store.remove('s', a.id);
  assert.equal(fake.files.has(a.path), false);
  assert.ok(fake.files.has(b.path));
  await store.remove('s', a.id); // already gone
  await store.remove('never', '1-x.png'); // no such directory

  await store.removeSession('s');
  assert.equal(fake.files.has(b.path), false);
  assert.equal(fake.dirs.has(`${ROOT}/s`), false);
  await store.removeSession('s'); // already gone
  await store.removeSession('never');
  assert.ok(fake.files.has(`${ROOT}/other/1-keep.png`));

  // A removed session starts numbering again.
  assert.equal((await store.addBytes('s', { name: 'c.png', mime: 'image/png', bytes: bytes(1) })).id, '1-c.png');
});

test('attachment store: sweep removes only directories of sessions not kept whose files are all older than the age', async () => {
  let clock = 0;
  const { fake, store } = setup(() => clock);
  const add = async (session: string, at: number, name: string): Promise<void> => {
    fake.clock = at;
    await store.addBytes(session, { name, mime: 'image/png', bytes: bytes(1) });
  };
  await add('old', 1000, 'a.png');
  await add('old', 2000, 'b.png');
  await add('kept/id', 1000, 'a.png');
  await add('mixed', 1000, 'a.png');
  await add('mixed', 9500, 'b.png');
  await add('fresh', 9500, 'a.png');
  fake.files.set(`${ROOT}/stray.txt`, bytes(1)); // a file in the root is not a session directory
  fake.mtimes.set(`${ROOT}/stray.txt`, 1);

  clock = 10000;
  await store.sweep({ olderThanMs: 5000, keep: new Set(['kept/id']) });

  assert.equal(fake.dirs.has(`${ROOT}/old`), false);
  assert.equal(fake.files.has(`${ROOT}/old/1-a.png`), false);
  assert.ok(fake.files.has(`${ROOT}/kept_id/1-a.png`));
  assert.ok(fake.files.has(`${ROOT}/mixed/1-a.png`));
  assert.ok(fake.files.has(`${ROOT}/mixed/2-b.png`));
  assert.ok(fake.files.has(`${ROOT}/fresh/1-a.png`));
  assert.ok(fake.files.has(`${ROOT}/stray.txt`));
  assert.deepEqual(fake.ops('rm').map((c) => c.path), [`${ROOT}/old`]);

  // No root yet: nothing to do, no throw.
  const empty = fakeAttachmentFs();
  await createAttachmentStore({ root: ROOT, fs: empty.fs }).sweep({ olderThanMs: 0, keep: new Set() });
  assert.deepEqual(empty.ops('rm'), []);
});

test('attachment store: a failed write leaves no partial file', async () => {
  const { fake, store } = setup();
  fake.failOn = (c) => (c.op === 'writeFile' ? new Error('ENOSPC') : undefined);
  await assert.rejects(() => store.addBytes('s', { name: 'a.png', mime: 'image/png', bytes: bytes(8) }), /ENOSPC/);
  assert.deepEqual([...fake.files.keys()], []);

  fake.files.set('/src/doc.txt', bytes(8));
  fake.failOn = (c) => (c.op === 'copyFile' ? new Error('EIO') : undefined);
  await assert.rejects(() => store.addFile('s', '/src/doc.txt'), (e: unknown) => !(e instanceof AttachmentRefused) && /EIO/.test(String(e)));
  assert.deepEqual([...fake.files.keys()], ['/src/doc.txt']);

  // The failure does not stop the next add.
  fake.failOn = undefined;
  const ok = await store.addFile('s', '/src/doc.txt');
  assert.deepEqual(fake.files.get(ok.path), bytes(8));
});
