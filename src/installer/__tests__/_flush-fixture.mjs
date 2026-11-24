// Observe real fsync calls, with narrowly scoped I/O-failure injection. Restore
// builtin ESM bindings before leaving the isolated fixture process.
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
export function traceFlushes(fail = () => false) {
  const original = { open: fs.openSync, close: fs.closeSync, sync: fs.fsyncSync }, descriptors = new Map(), events = [];
  fs.openSync = (...args) => { const fd = original.open(...args); descriptors.set(fd, String(args[0])); return fd; };
  fs.closeSync = fd => { try { return original.close(fd); } finally { descriptors.delete(fd); } };
  fs.fsyncSync = fd => {
    const event = { path: descriptors.get(fd) ?? '', directory: fs.fstatSync(fd).isDirectory() }; events.push(event);
    if (fail(event)) throw Object.assign(new Error('Injected durability failure'), { code: 'EIO' });
    return original.sync(fd);
  };
  syncBuiltinESMExports();
  return { events, restore() { fs.openSync = original.open; fs.closeSync = original.close; fs.fsyncSync = original.sync; syncBuiltinESMExports(); } };
}
