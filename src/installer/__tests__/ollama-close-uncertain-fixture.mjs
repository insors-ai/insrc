/** Isolate an actually unclosed descriptor: only observed process exit closes it. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { once } from 'node:events';
import { join } from 'node:path';
import { ollamaFixture } from './_ollama-fixture.js';
import { prepareOllama } from '../ollama-prepare.js';
import { dependencyAttemptIdentity } from '../ollama-policy.js';
import { controlBinding } from '../native.js';
const phase = process.argv[2];
assert.ok(phase === 'cleanup' || phase === 'disposed');
const f = await ollamaFixture();
process.send({ root: f.root });
const { policy, offer } = await f.input(), context = f.context();
const identity = dependencyAttemptIdentity(f.location, policy, offer, context), record = join(f.home, identity.recordRelativePath);
const originalOpen = fs.openSync, originalClose = fs.closeSync, descriptors = new Map();
let injected = false;
fs.openSync = (file, ...args) => { const fd = originalOpen(file, ...args); descriptors.set(fd, String(file)); return fd; };
fs.closeSync = fd => {
  const name = descriptors.get(fd);
  if (!injected && name?.startsWith(record.replace(/\.json$/, `.${phase}.json.`)) && name.endsWith('.tmp')) {
    injected = true;
    throw Object.assign(new Error('injected actual descriptor close uncertainty'), { code: 'EIO' });
  }
  return originalClose(fd);
};
syncBuiltinESMExports();
try {
  await assert.rejects(prepareOllama(f.location, policy, offer, context, { recheck: f.recheck, transport: f.transport }), { code: 'dependency-uncertain' });
} finally { fs.openSync = originalOpen; fs.closeSync = originalClose; syncBuiltinESMExports(); }
assert.equal(injected, true, 'disposal descriptor fault must actually be reached');
assert.throws(() => controlBinding().acquire(`${record}.lock`), { code: 'busy' }, 'unconfirmed disposal must retain the actor lock');
process.send({ root: f.root, location: f.location, target: f.target, policy, identity, record, verified: true });
await once(process, 'message');
process.disconnect();
// Do not remove the evidence or close the injected descriptor. The parent's
// captured child-close event must establish process closure before recovery.
