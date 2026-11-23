import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BridgeHandshake, validateBridgeOutcome } from '../bridge-protocol.js';
import { parseInstaller } from '../schemas.js';

const nonce = 'a'.repeat(32);
const request = { protocolVersion: 1, endpoint: { kind: 'unix', address: '/tmp/insrc/daemon.sock', installationId: 'home' }, rpcFrame: JSON.stringify({ id: 1, method: 'daemon.status', params: {} }) + '\n' };
const send = { kind: 'send', transportId: 'transport-1', request };

test('correlated bridge send cancel write outcomes preserve uncertainty', () => {
  const session = new BridgeHandshake(nonce);
  session.acceptReady({ kind: 'ready', protocolVersion: 2, sessionNonce: nonce });
  assert.deepEqual(session.admit(send), send);
  assert.equal(validateBridgeOutcome('transport-1', undefined).outcome, 'unknown');
  const cancelled = validateBridgeOutcome('transport-1', { kind: 'cancelled', transportId: 'transport-1', written: false });
  assert.equal(cancelled.outcome, 'not-written');
  assert.equal(validateBridgeOutcome('transport-1', undefined, cancelled.outcome).outcome, 'not-written');
  const written = validateBridgeOutcome('transport-1', { kind: 'written', transportId: 'transport-1', written: true });
  assert.equal(written.outcome, 'written');
  assert.equal(validateBridgeOutcome('transport-1', { kind: 'closed', transportId: 'transport-1' }, written.outcome).outcome, 'written');
  assert.throws(() => validateBridgeOutcome('transport-1', { kind: 'cancelled', transportId: 'transport-1', written: false }, 'written'));
  assert.throws(() => validateBridgeOutcome('transport-1', { kind: 'written', transportId: 'transport-1', written: true }, 'not-written'));
  assert.throws(() => validateBridgeOutcome('transport-1', { kind: 'written', transportId: 'other', written: true }));
  assert.throws(() => validateBridgeOutcome('transport-1', { kind: 'cancelled', transportId: 'transport-1' }));
  assert.throws(() => validateBridgeOutcome('transport-1', { kind: 'frame', transportId: 'transport-1', frame: '{}', written: false }));
  const response = JSON.stringify({ id: 1, result: { name: 'λ🙂' } }) + '\n';
  assert.equal(validateBridgeOutcome('transport-1', { kind: 'frame', transportId: 'transport-1', frame: response }).event?.frame, response);
  assert.deepEqual(session.admit({ kind: 'cancel', transportId: 'transport-1' }), { kind: 'cancel', transportId: 'transport-1' });
  assert.throws(() => parseInstaller('bridgeCommand', { ...send, request: { ...request, rpcFrame: '{}\n{}\n' } }));
});

test('bridge hello ready requires exact nonce within three seconds before dispatch', () => {
  let clock = 0;
  const session = new BridgeHandshake(nonce, () => clock);
  assert.deepEqual(session.hello, { kind: 'hello', protocolVersion: 2, sessionNonce: nonce });
  assert.throws(() => session.admit(send), { code: 'bridge-protocol-mismatch' });
  clock = 2999;
  session.acceptReady({ kind: 'ready', protocolVersion: 2, sessionNonce: nonce });
  assert.deepEqual(session.admit(send), send);
  assert.throws(() => session.acceptReady({ kind: 'ready', protocolVersion: 2, sessionNonce: nonce }), { code: 'bridge-protocol-mismatch' });
  assert.throws(() => session.admit(send));
  const timed = new BridgeHandshake(nonce, () => clock);
  clock += 3000;
  assert.throws(() => timed.acceptReady({ kind: 'ready', protocolVersion: 2, sessionNonce: nonce }), { code: 'bridge-handshake-timeout' });
  assert.throws(() => timed.admit(send));
  for (const invalid of [{ kind: 'ready', protocolVersion: 1, sessionNonce: nonce }, { kind: 'ready', protocolVersion: 2, sessionNonce: 'b'.repeat(32) }, { kind: 'frame', transportId: 'id', frame: '{}' }, null]) {
    const peer = new BridgeHandshake(nonce);
    assert.throws(() => peer.acceptReady(invalid), { code: 'bridge-protocol-mismatch' });
    assert.throws(() => peer.admit(send));
  }
  assert.throws(() => new BridgeHandshake('short'));
});
