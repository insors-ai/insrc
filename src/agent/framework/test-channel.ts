/**
 * TestChannel — scripted channel for unit tests.
 *
 * Gate replies are pre-scripted; all sent messages are collected for assertion.
 */

import type {
  AgentMessage, Channel, GatePayload, ReplyPayload, CancelPayload,
} from './types.js';
import { createMessage } from './helpers.js';

// ---------------------------------------------------------------------------
// Scripted reply
// ---------------------------------------------------------------------------

export interface ScriptedReply {
  /** Action name to return (e.g. 'approve', 'edit', 'reject'). */
  action: string;
  /** Optional feedback text. */
  feedback?: string | undefined;
}

// ---------------------------------------------------------------------------
// TestChannel
// ---------------------------------------------------------------------------

export class TestChannel implements Channel {
  /** All messages sent by the agent. */
  readonly messages: AgentMessage[] = [];

  private readonly replies: ScriptedReply[];
  private readonly handlers: Array<(msg: AgentMessage) => void> = [];
  private closed = false;

  constructor(replies: ScriptedReply[] = []) {
    this.replies = [...replies];
  }

  // -- Channel interface ----------------------------------------------------

  send(msg: AgentMessage): void {
    this.messages.push(msg);
  }

  async gate(msg: AgentMessage<GatePayload>): Promise<ReplyPayload> {
    this.messages.push(msg);
    const scripted = this.replies.shift();
    if (!scripted) {
      throw new Error(
        `TestChannel: no scripted reply for gate "${msg.payload.title}" (gateId=${msg.payload.gateId})`,
      );
    }
    return {
      gateId: msg.payload.gateId,
      action: scripted.action,
      feedback: scripted.feedback,
    };
  }

  onMessage(handler: (msg: AgentMessage) => void): void {
    this.handlers.push(handler);
  }

  close(): void {
    this.closed = true;
  }

  // -- Test helpers ---------------------------------------------------------

  /** Simulate a cancel message from the transport. */
  cancel(reason?: string): void {
    const payload: CancelPayload = { reason };
    const msg = createMessage<CancelPayload>('test', 'test', 'cancel', payload);
    for (const h of this.handlers) h(msg);
  }

  /** Whether close() was called. */
  get isClosed(): boolean {
    return this.closed;
  }

  /** All emitted text messages. */
  getEmitted(): string[] {
    return this.messages
      .filter(m => m.kind === 'emit')
      .map(m => (m.payload as { text: string }).text);
  }

  /** All progress messages. */
  getProgress(): string[] {
    return this.messages
      .filter(m => m.kind === 'progress')
      .map(m => (m.payload as { message: string }).message);
  }

  /** All gate messages. */
  getGates(): AgentMessage<GatePayload>[] {
    return this.messages
      .filter(m => m.kind === 'gate') as AgentMessage<GatePayload>[];
  }

  /** All checkpoint messages. */
  getCheckpoints(): AgentMessage[] {
    return this.messages.filter(m => m.kind === 'checkpoint');
  }

  /** The done message (if any). */
  getDone(): AgentMessage | undefined {
    return this.messages.find(m => m.kind === 'done');
  }

  /** The error message (if any). */
  getError(): AgentMessage | undefined {
    return this.messages.find(m => m.kind === 'error');
  }

  /** Count of remaining unused scripted replies. */
  get remainingReplies(): number {
    return this.replies.length;
  }
}
