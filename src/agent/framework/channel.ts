/**
 * ReplChannel — terminal transport for the agent framework.
 *
 * Maps the message protocol to readline I/O:
 *   emit      → stdout
 *   progress  → log.info
 *   checkpoint → log.debug
 *   error     → log.error
 *   gate      → render actions, prompt user, return reply
 */

import { createInterface } from 'node:readline';
import type {
  AgentMessage, Channel, GatePayload, GateAction, ReplyPayload,
  EmitPayload, ProgressPayload, ErrorPayload, CancelPayload,
} from './types.js';
import { createMessage } from './helpers.js';

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const CYAN   = '\x1b[36m';
const GREEN  = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED    = '\x1b[31m';
const DIM    = '\x1b[2m';
const BOLD   = '\x1b[1m';
const RESET  = '\x1b[0m';

// ---------------------------------------------------------------------------
// Readline helper
// ---------------------------------------------------------------------------

/** Prompt once and return the answer. */
function askOnce(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(prompt, (answer: string) => {
      rl.close();
      resolve(answer);
    });
  });
}

// ---------------------------------------------------------------------------
// Gate rendering (generalised from designer/validation.ts)
// ---------------------------------------------------------------------------

/** Render a gate for terminal display. */
function renderGate(gate: GatePayload): string {
  const parts: string[] = [];

  parts.push('');
  parts.push(`${CYAN}━━━ ${BOLD}${gate.title}${RESET}${CYAN} ━━━${RESET}`);
  parts.push('');
  parts.push(gate.content);
  parts.push('');
  parts.push(`${DIM}──────────────────────────────────────────${RESET}`);

  // Render action hints
  const hints = gate.actions.map(a => {
    const initial = a.name[0]!;
    const rest = a.label.slice(1);
    const hint = a.hint ? ` ${a.hint}` : '';
    return `${GREEN}[${initial}]${RESET}${rest}${hint}`;
  });
  parts.push(hints.join('  '));
  parts.push('');

  return parts.join('\n');
}

/** Parse user input against a gate's action list. */
function parseGateResponse(raw: string, actions: GateAction[]): { action: string; feedback?: string | undefined } {
  const trimmed = raw.trim();

  // Empty input = first action (convenience)
  if (trimmed === '') {
    const first = actions[0];
    return { action: first?.name ?? 'approve' };
  }

  const lower = trimmed.toLowerCase();

  // Try exact match by name or first character
  for (const a of actions) {
    const name = a.name.toLowerCase();
    const initial = name[0]!;

    if (lower === name || lower === initial) {
      return { action: a.name };
    }

    // Match "name <feedback>" or "initial <feedback>"
    if (lower.startsWith(name + ' ')) {
      return { action: a.name, feedback: trimmed.slice(name.length + 1).trim() || undefined };
    }
    if (lower.startsWith(initial + ' ')) {
      return { action: a.name, feedback: trimmed.slice(2).trim() || undefined };
    }
  }

  // Fallback: treat input as feedback for the second action (typically "edit")
  // or the first action if only one exists
  const editAction = actions[1] ?? actions[0];
  return { action: editAction?.name ?? 'edit', feedback: trimmed };
}

// ---------------------------------------------------------------------------
// ReplChannel
// ---------------------------------------------------------------------------

export interface ReplChannelOpts {
  /** Logger with info/debug/error methods. Falls back to console. */
  log?: { info(msg: string): void; debug(msg: string): void; error(msg: string): void };
  /** Prompt string for gate input. Default: 'agent> ' */
  prompt?: string;
}

export class ReplChannel implements Channel {
  private readonly handlers: Array<(msg: AgentMessage) => void> = [];
  private readonly log: { info(msg: string): void; debug(msg: string): void; error(msg: string): void };
  private readonly prompt: string;

  constructor(opts: ReplChannelOpts = {}) {
    this.log = opts.log ?? {
      info:  (msg: string) => console.log(msg),
      debug: (msg: string) => console.log(`${DIM}${msg}${RESET}`),
      error: (msg: string) => console.error(`${RED}${msg}${RESET}`),
    };
    this.prompt = opts.prompt ?? 'agent> ';
  }

  // -- Channel interface ----------------------------------------------------

  send(msg: AgentMessage): void {
    switch (msg.kind) {
      case 'emit': {
        const p = msg.payload as EmitPayload;
        if (p.stream) {
          process.stdout.write(p.text);
        } else {
          process.stdout.write(p.text + '\n');
        }
        break;
      }
      case 'progress': {
        const p = msg.payload as ProgressPayload;
        const pctStr = p.pct != null ? ` (${Math.round(p.pct)}%)` : '';
        this.log.info(`${p.message}${pctStr}`);
        break;
      }
      case 'checkpoint': {
        this.log.debug(`checkpoint: ${(msg.payload as { label: string }).label}`);
        break;
      }
      case 'done': {
        this.log.info(`${GREEN}Done.${RESET}`);
        break;
      }
      case 'error': {
        const p = msg.payload as ErrorPayload;
        this.log.error(`Error: ${p.error}`);
        break;
      }
      default:
        // Unknown kind — log for debugging
        this.log.debug(`[${msg.kind}] ${JSON.stringify(msg.payload)}`);
    }
  }

  async gate(msg: AgentMessage<GatePayload>): Promise<ReplyPayload> {
    // Render gate to terminal
    process.stdout.write(renderGate(msg.payload));

    // Prompt user
    const answer = await askOnce(this.prompt);
    const parsed = parseGateResponse(answer, msg.payload.actions);

    return {
      gateId: msg.payload.gateId,
      action: parsed.action,
      feedback: parsed.feedback,
    };
  }

  onMessage(handler: (msg: AgentMessage) => void): void {
    this.handlers.push(handler);
  }

  close(): void {
    // Nothing to clean up for REPL channel
  }

  // -- REPL helpers ---------------------------------------------------------

  /** Simulate a cancel from outside (e.g. SIGINT handler). */
  cancel(reason?: string): void {
    const payload: CancelPayload = { reason };
    const msg = createMessage<CancelPayload>('repl', 'repl', 'cancel', payload);
    for (const h of this.handlers) h(msg);
  }
}
