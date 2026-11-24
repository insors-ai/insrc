// Owning peer fixtures only; never imported by production composition.
import assert from 'node:assert/strict';
export async function createDevManagerPeers(home, runtimeDirectory, target, workerEntrypoint, environment) {
  const {managerFixture}=await import('./_manager-fixture.ts');
  const {devDelivery}=await import('../dev-delivery.ts');
  const f = managerFixture(home); assert.deepEqual(f.target, target);
  const port = devDelivery(target, { runtimeDirectory, workerEntrypoint, environment }); f.peers.dev = port;
  f.state.observation = { state: 'absent', resourceOwnershipReleased: true, evidence: { kind: 'never-started' } };
  const snapshot=f.manager().inspect();
  if(snapshot.kind==='present'&&snapshot.snapshot.installation.activeReleaseId)f.state.observation={state:'present',identity:{protocolVersion:1,installationId:'fixture',instanceId:'fixture-incumbent',releaseId:snapshot.snapshot.installation.activeReleaseId,state:'ready'},endpoint:f.location.daemonEndpoint};
  const activate = f.peers.lifecycle.activate.bind(f.peers.lifecycle);
  f.peers.lifecycle.activate = async (...args) => { const ready = await activate(...args); f.state.observation = { state: 'present', identity: ready.identity, endpoint: ready.endpoint }; return ready; };
  const completion = f.peers.lifecycle.waitShutdownCompletion.bind(f.peers.lifecycle);
  f.peers.lifecycle.waitShutdownCompletion = async (...args) => { const old = f.state.observation.identity, proof = await completion(...args); f.state.observation = { state: 'absent', resourceOwnershipReleased: true, evidence: { kind: 'observed-exit', identity: old } }; return proof; };
  const journal = f.peers.migrations.waitForJournal.bind(f.peers.migrations);
  f.peers.migrations.waitForJournal = async (candidate, admission) => ({ ...await journal(candidate, admission), hooks: candidate.manifest.migrations.map(hook => ({ id: hook.id, version: hook.version, passed: true })) });
  return { ...f, port };
}
