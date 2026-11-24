// Owned test processes only. No daemon, application stores or process signalling.
import { managerFixture } from './_manager-fixture.ts';
import { requireTerminal } from '../terminal-admission.ts';
import { spawnFixture, stopOwnedChildren, childLine } from '../../daemon/tools/__tests__/_proc.ts';
import { mkdirSync, writeFileSync, readFileSync, openSync, fsyncSync, closeSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { once } from 'node:events';
const [role, home, encoded] = process.argv.slice(2);
if (role === 'preparing') {
  const fixture = managerFixture(home), manager = fixture.manager();
  // Pause only after candidate identity and preparing snapshot are durable.
  fixture.peers.lifecycle.observe = async () => { process.stdout.write('prepared\n'); return new Promise(() => {}); };
  const installed = manager.inspect().snapshot.installation.activeReleaseId;
  const pending = installed
    ? manager.checkUpgrade().then(offer => manager.execute({ protocolVersion: 1, operationId: 'operation', installationId: 'fixture', action: 'upgrade', acceptedOfferId: offer.offerId }))
    : manager.install(requireTerminal({ stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: true } }), 'operation', { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' });
  process.stdin.once('data', () => { manager.inspect(); void pending; process.exit(0); });
} else if (role === 'manager') {
  const fixture = managerFixture(home), manager = fixture.manager();
  fixture.peers.lifecycle.launchMigration = async (_candidate, admission, validate) => { validate(); process.stdout.write(JSON.stringify(admission) + '\n'); };
  fixture.peers.migrations.waitForJournal = async () => new Promise(() => {});
  const offer = await manager.checkUpgrade();
  const pending = manager.execute({ protocolVersion: 1, operationId: 'operation', installationId: 'fixture', action: 'upgrade', acceptedOfferId: offer.offerId });
  process.stdin.once('data', () => { manager.inspect(); void pending; process.exit(0); });
} else {
  const admission = JSON.parse(encoded);
  if (role === 'candidate') {
    process.stdout.write('ready\n');
    process.stdin.once('data', () => {
      writeFileSync(join(home, 'candidate-journal.json'), JSON.stringify({ installationId: admission.installationId, operationId: admission.operationId, candidateReleaseId: admission.candidateReleaseId, candidateInventorySha256: admission.candidateInventorySha256, sessionId: admission.sessionId, validated: true, hooks: [] }));
      process.exit(0);
    });
  } else if (role === 'wrapper') {
    const children = [];
    try {
      const child = spawnFixture(process.execPath, ['--import', 'tsx/esm', fileURLToPath(import.meta.url), 'candidate', home, encoded], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(child);
      await childLine(child); process.stdout.write('ready\n');
      await new Promise(resolve => process.stdin.once('data', resolve));
      const closed = once(child, 'close'); child.stdin.end('complete\n'); const [exitCode, signal] = await closed;
      // Sole wrapper writes only after observing actual candidate self-exit.
      const identity = Object.fromEntries(['installationId', 'operationId', 'candidateReleaseId', 'candidateInventorySha256', 'sessionId', 'childInstanceId', 'completionNonce'].map(key => [key, admission[key]]));
      mkdirSync(dirname(admission.receiptPath), { recursive: true, mode: 0o700 });
      const temporary = admission.receiptPath + '.tmp', fd = openSync(temporary, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify({ schemaVersion: 1, purpose: 'migration', ...identity, exitCode, signal })); fsyncSync(fd); } finally { closeSync(fd); }
      renameSync(temporary, admission.receiptPath);
      process.stdin.destroy();
    } finally { await stopOwnedChildren(children); }
  }
}
