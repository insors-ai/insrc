import type { ValidationGate, GateResponse, GateStage } from './types.js';

// ---------------------------------------------------------------------------
// ValidationChannel — promise-based channel for generator ↔ REPL communication
//
// The designer pipeline (async generator) yields a gate event, then calls
// channel.wait(). The REPL sees the gate, prompts the user, then calls
// channel.respond(answer). The generator resumes with the user's response.
// ---------------------------------------------------------------------------

export class ValidationChannel {
  private _resolve!: (response: GateResponse) => void;
  private _promise!: Promise<GateResponse>;

  constructor() {
    this.reset();
  }

  /** Prepare the channel for a new gate interaction. */
  reset(): void {
    this._promise = new Promise<GateResponse>(r => { this._resolve = r; });
  }

  /** Called by the REPL when the user responds to a gate. */
  respond(response: GateResponse): void {
    this._resolve(response);
  }

  /** Called by the generator after yielding a gate — blocks until respond() is called. */
  wait(): Promise<GateResponse> {
    return this._promise;
  }
}

// ---------------------------------------------------------------------------
// Gate rendering
// ---------------------------------------------------------------------------

const CYAN  = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const DIM   = '\x1b[2m';
const BOLD  = '\x1b[1m';
const RESET = '\x1b[0m';

const STAGE_LABELS: Record<GateStage, string> = {
  'requirements': 'Requirements Validation',
  'summary-flow': 'Sketch / Summary Flow Validation',
  'detail':       'Detailed Section Validation',
};

/**
 * Format a validation gate for terminal display.
 * Returns a string the REPL should print before prompting.
 */
export function renderGate(gate: ValidationGate): string {
  const parts: string[] = [];
  const label = STAGE_LABELS[gate.stage];
  const reqSuffix = gate.requirementIndex != null
    ? ` (Requirement ${gate.requirementIndex})`
    : '';

  parts.push('');
  parts.push(`${CYAN}━━━ ${BOLD}${label}${reqSuffix}${RESET}${CYAN} ━━━${RESET}`);
  parts.push('');
  parts.push(gate.content);
  parts.push('');
  parts.push(`${DIM}──────────────────────────────────────────${RESET}`);
  parts.push(`${GREEN}[a]${RESET}pprove  ${YELLOW}[e]${RESET}dit <feedback>  ${YELLOW}[r]${RESET}eject <reason>`);

  if (gate.stage !== 'requirements') {
    parts.push(`${DIM}[s]${RESET}kip this requirement`);
  }

  parts.push('');

  return parts.join('\n');
}

// ---------------------------------------------------------------------------
// Gate response parsing
// ---------------------------------------------------------------------------

/**
 * Parse a raw user input string into a GateResponse.
 *
 * Supported formats:
 *   "a" or "approve"               → approve
 *   "e <feedback>" or "edit ..."   → edit with feedback
 *   "r <reason>" or "reject ..."   → reject with reason
 *   "s" or "skip"                  → skip
 *   (empty / enter)                → approve (convenience)
 */
export function parseGateResponse(raw: string): GateResponse {
  const trimmed = raw.trim();

  // Empty input = approve (convenience for fast iteration)
  if (trimmed === '') {
    return { type: 'approve' };
  }

  const lower = trimmed.toLowerCase();

  // Approve
  if (lower === 'a' || lower === 'approve' || lower === 'yes' || lower === 'y') {
    return { type: 'approve' };
  }

  // Skip
  if (lower === 's' || lower === 'skip') {
    return { type: 'skip' };
  }

  // Edit
  if (lower === 'e' || lower.startsWith('e ') || lower.startsWith('edit ')) {
    const feedback = lower.startsWith('edit ')
      ? trimmed.slice(5).trim()
      : lower.startsWith('e ')
        ? trimmed.slice(2).trim()
        : '';
    return { type: 'edit', feedback: feedback || undefined };
  }

  // Reject
  if (lower === 'r' || lower.startsWith('r ') || lower.startsWith('reject ')) {
    const feedback = lower.startsWith('reject ')
      ? trimmed.slice(7).trim()
      : lower.startsWith('r ')
        ? trimmed.slice(2).trim()
        : '';
    return { type: 'reject', feedback: feedback || undefined };
  }

  // Fallback: treat anything else as edit feedback
  return { type: 'edit', feedback: trimmed };
}
