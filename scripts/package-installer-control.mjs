/** Publisher-only target-native addon packaging. No consumer compiler path.
 * Invoked within the build coordinator by the full bundle publisher (t4). */
import { createHash, randomUUID } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { participantContext } from './test-harness/context.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
export function packageControlBinding({ source, destination, target, evidence, run }) {
  const digest = createHash('sha256').update(readFileSync(source)).digest('hex');
  // Deny absent/unexecuted evidence before even creating publication directories.
  const { requireNativeQualification } = require('../out/installer/native-qualification.js');
  requireNativeQualification(target, digest, evidence);
  if (run) run.assertOwner();
  const context = run ? run.record : participantContext();
  if (!['preparing', 'mutating'].includes(context.phase)) throw new Error('Native publication requires coordinator writer admission');
  if (target.os !== process.platform || target.arch !== process.arch) throw new Error('Native publication must run on its actual target');
  const id = `${target.os}-${target.arch}`;
  const final = join(resolve(destination), id, digest);
  if (existsSync(final)) {
    if (createHash('sha256').update(readFileSync(join(final, 'control.node'))).digest('hex') !== digest) throw new Error('Immutable native publication differs');
    return final;
  }
  const parent = join(resolve(destination), id); mkdirSync(parent, { recursive: true, mode: 0o700 });
  const stage = join(parent, `.control-${randomUUID()}`); mkdirSync(stage, { mode: 0o700 });
  try {
    copyFileSync(source, join(stage, 'control.node'));
    writeFileSync(join(stage, 'qualification.json'), JSON.stringify(evidence) + '\n', { flag: 'wx', mode: 0o600 });
    renameSync(stage, final);
    return final;
  } finally { rmSync(stage, { recursive: true, force: true }); }
}
