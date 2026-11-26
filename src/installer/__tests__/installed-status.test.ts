import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import io from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { isAbsolute, join, relative } from 'node:path';
import { dependencyPort } from '../dependencies.js';
import { prepareOllama } from '../ollama-prepare.js';
import { ollamaFixture } from './_ollama-fixture.js';
import { observeOllamaReads } from './_ollama-read-sentinel.js';

test('prepared Ollama inspection reads completion records without walking or opening payload contents', async t => {
  const f = await ollamaFixture();
  let observer: ReturnType<typeof observeOllamaReads> | undefined;
  try {
    const { policy, offer } = await f.input(); let downloads = 0;
    const prepared = await prepareOllama(f.location, policy, offer, f.context(), {
      recheck: f.recheck, transport: async () => { downloads++; return f.transport(); },
    });
    const receipt = join(prepared.directory, '.ollama-receipt.json'), before = readFileSync(receipt);
    const data = join(prepared.directory, 'lib/data.dat');
    writeFileSync(data, Buffer.alloc(lstatSync(data).size, 3));
    const inside = (path: unknown) => {
      const name = relative(prepared.directory, String(path)).replaceAll('\\', '/');
      return name !== '..' && !name.startsWith('../') && !isAbsolute(name);
    };
    const readdir = io.readdir;
    t.mock.method(io, 'readdir', ((path: unknown, ...args: unknown[]) => {
      assert.equal(inside(path), false, 'Installed inspection must not traverse the prepared payload');
      return Reflect.apply(readdir, io, [path, ...args]);
    }) as typeof io.readdir);
    observer = observeOllamaReads(prepared.directory, async file => {
      if (inside(file)) assert.ok(['inventory.json', '.ollama-receipt.json'].includes(relative(prepared.directory, file)), 'Installed inspection must not open payload contents');
    });
    const port = dependencyPort(f.target, f.location, f.options);
    assert.equal((await port.inspect(f.location)).ollama, 'installed-not-running');
    assert.ok(observer.metadataReads.some(read => read.file === 'inventory.json'));
    assert.ok(observer.metadataReads.some(read => read.file === '.ollama-receipt.json'));
    assert.equal(observer.reads.length, 0); assert.equal(downloads, 1);
    assert.deepEqual(readFileSync(receipt), before);
    const changed = JSON.parse(before.toString('utf8')); changed.inventorySha256 = 'f'.repeat(64);
    writeFileSync(receipt, JSON.stringify(changed));
    assert.equal((await port.inspect(f.location)).ollama, 'unavailable', 'Bound completion metadata must still be checked');
    assert.equal(downloads, 1);
    await observer.drain();
  } finally {
    observer?.restore(); t.mock.restoreAll(); syncBuiltinESMExports(); await f.cleanup();
  }
});
