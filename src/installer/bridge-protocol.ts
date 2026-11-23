/** Pure protocol admission/validation, not a pipe client or helper process. */
import { performance } from 'node:perf_hooks';
import { BRIDGE_HANDSHAKE_MS, InstallerError } from './contracts.js';
import type { BridgeCommand, BridgeEvent, BridgeHello, BridgeReady } from './contracts.js';
import { parseInstaller } from './schemas.js';

export class BridgeHandshake {
  private state: 'waiting' | 'ready' | 'failed' = 'waiting';
  private readonly started: number;
  readonly hello: BridgeHello;
  constructor(sessionNonce: string, private readonly now: () => number = () => performance.now()) {
    this.hello = parseInstaller('bridgeHello', { kind: 'hello', protocolVersion: 2, sessionNonce });
    this.started = now();
  }
  private checkDeadline(): void {
    if (this.state === 'waiting' && this.now() - this.started >= BRIDGE_HANDSHAKE_MS) {
      this.state = 'failed';
      throw new InstallerError('bridge-handshake-timeout', 'No matching bridge ready within three seconds');
    }
  }
  acceptReady(input: unknown): BridgeReady {
    this.checkDeadline();
    try {
      if (this.state !== 'waiting') throw new Error('Unexpected duplicate or late ready');
      const ready = parseInstaller('bridgeReady', input);
      if (ready.sessionNonce !== this.hello.sessionNonce) throw new Error('Session nonce mismatch');
      this.state = 'ready';
      return ready;
    } catch (cause) {
      this.state = 'failed';
      throw new InstallerError('bridge-protocol-mismatch', 'Invalid bridge startup exchange', { cause });
    }
  }
  admit(input: unknown): BridgeCommand {
    this.checkDeadline();
    if (this.state !== 'ready') throw new InstallerError('bridge-protocol-mismatch', 'Bridge must confirm ready before any dispatch');
    return parseInstaller('bridgeCommand', input);
  }
}

export type WriteOutcome = 'unknown' | 'not-written' | 'written';

/** A missing event is unknown; writing helper stdin never proves a pipe write. */
export function validateBridgeOutcome(transportId: string, input: unknown, previous: WriteOutcome = 'unknown'): {
  event: BridgeEvent | undefined; outcome: WriteOutcome;
} {
  if (input === undefined) return { event: undefined, outcome: previous };
  const event = parseInstaller('bridgeEvent', input);
  if (event.transportId !== transportId) throw new InstallerError('bridge-protocol-mismatch', 'Wrong transport identity');
  if ((event.kind === 'written' && event.written !== true)
    || (event.kind === 'cancelled' && event.written !== false)
    || (event.kind === 'frame' && !event.frame)
    || (event.kind === 'frame' && event.written === false)
    || (event.kind !== 'frame' && event.frame !== undefined)
    || (previous === 'written' && event.written === false)
    || (previous === 'not-written' && (event.written === true || event.kind === 'frame'))) {
    throw new InstallerError('bridge-protocol-mismatch', 'Contradictory bridge write outcome');
  }
  const outcome = event.written === true || event.kind === 'frame' ? 'written'
    : event.written === false ? 'not-written' : previous;
  return { event, outcome };
}
