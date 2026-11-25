import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import { basename, relative, resolve } from 'node:path';

/** Observe real installed-file reads, allowing only small executable headers.
 * Test processes own this temporary builtin patch and always restore it. */
export function observeOllamaReads(root: string, beforeOpen?: (file: string) => Promise<void>) {
  const original = fs.open, reads: Array<{ file: string; bytes: number }> = [];
  fs.open = async (...args: Parameters<typeof original>) => {
    const file = typeof args[0] === 'string' ? resolve(args[0]) : '';
    if (beforeOpen) await beforeOpen(file);
    const handle = await original(...args), name = relative(root, file);
    if (file && name && name !== '..' && !name.startsWith('../') && !name.startsWith('..\\')
      && !['inventory.json', '.ollama-receipt.json'].includes(name)) {
      const read = handle.read; let total = 0;
      handle.read = (async (...input: unknown[]) => {
        const count = input[2];
        assert.ok(typeof count === 'number' && count <= 4096, `full installed-file read: ${name}`);
        assert.ok(/ollama(?:\.exe)?$|\.(?:dll|dylib)$|\.so(?:\.[0-9.]+)?$/i.test(basename(name)), `unexpected content read: ${name}`);
        const result = await Reflect.apply(read, handle, input) as { bytesRead: number; buffer: Buffer };
        total += result.bytesRead; assert.ok(total <= 8192, `unbounded header read: ${name}`);
        reads.push({ file: name, bytes: result.bytesRead }); return result;
      }) as typeof handle.read;
      handle.readFile = async () => { throw new Error(`whole installed-file read: ${name}`); };
    }
    return handle;
  };
  syncBuiltinESMExports();
  return { reads, restore() { fs.open = original; syncBuiltinESMExports(); } };
}
