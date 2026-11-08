import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

interface ArchiveEntry {
  entryName: string;
}

interface ZipArchive {
  addFile(name: string, contents: Buffer): void;
  toBuffer(): Buffer;
  getEntry(name: string): ArchiveEntry;
  extractAllTo(target: string, overwrite: boolean, keepPermissions: boolean): void;
  extractAllToAsync(target: string, overwrite: boolean, keepPermissions: boolean, callback: (error?: Error) => void): void;
  extractEntryTo(entry: ArchiveEntry, target: string, keepPath: boolean, overwrite: boolean, keepPermissions: boolean): void;
}

const require = createRequire(import.meta.url);
const cassandraRequire = createRequire(require.resolve('cassandra-driver'));
const Zip = cassandraRequire('adm-zip') as new (bytes?: Buffer) => ZipArchive;

test('Cassandra ZIP dependency preserves outside sentinel bytes and mode with overwrite enabled', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'insrc-cassandra-zip-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = new Zip();
  archive.addFile('data.txt', Buffer.from('replacement'));
  const extractors = {
    all: (zip: ZipArchive, path: string) => zip.extractAllTo(path, true, true),
    async: (zip: ZipArchive, path: string) => new Promise<void>((resolve, reject) => {
      zip.extractAllToAsync(path, true, true, error => error ? reject(error) : resolve());
    }),
    entry: (zip: ZipArchive, path: string) => zip.extractEntryTo(zip.getEntry('data.txt'), path, true, true, true),
  };
  for (const [name, extract] of Object.entries(extractors)) {
    const destination = join(root, name);
    const sentinel = join(root, name + '.sentinel');
    await mkdir(destination);
    await writeFile(sentinel, 'sentinel', { mode: 0o600 });
    await symlink(sentinel, join(destination, 'data.txt'));
    const zip = new Zip(archive.toBuffer());
    try {
      await extract(zip, destination);
    } catch {
      // The safe implementation may reject the archive or skip the entry.
    }
    assert.equal(await readFile(sentinel, 'utf8'), 'sentinel', name);
    assert.equal((await stat(sentinel)).mode & 0o777, 0o600, name);
  }
});
