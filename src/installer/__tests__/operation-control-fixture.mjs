import { managerFixture } from './_manager-fixture.ts';
const [role, home, encoded] = process.argv.slice(2);
const fixture = managerFixture(home);
if (role === 'forward') {
  try { process.stdout.write(JSON.stringify(await fixture.manager().execute(JSON.parse(encoded))) + '\n'); }
  catch (error) { process.stdout.write(JSON.stringify({ error: error.code ?? 'failed' }) + '\n'); process.exitCode = 1; }
} else if (role === 'owner') {
  let complete;
  fixture.peers.lifecycle.waitShutdownCompletion = async (_location, request) => {
    process.stdout.write(JSON.stringify({ kind: 'draining', request }) + '\n');
    return new Promise(resolve => { complete = () => resolve({ operationId: request.operationId, instanceId: request.expectedInstanceId, completionNonce: request.completionNonce, resourceOwnershipReleased: true }); });
  };
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', command => { if (command.trim() === 'exit') process.exit(0); if (command.trim() === 'complete') complete?.(); });
  await fixture.manager().execute({ protocolVersion: 1, operationId: 'operation', installationId: 'fixture', action: 'stop' });
  process.stdin.destroy();
}
