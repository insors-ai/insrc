import type { ToolCall } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Stuck Detector — tracks local model progress and triggers escalation
//
// From design doc (Phase 8):
//   - Track local model turns with tool output in hand
//   - After 2 turns without progress (no new tools called, no fix produced):
//     trigger stuck escalation
//   - Local model produces ≤200-token summary + specific question
//   - Claude/Haiku responds with direction; local model continues
// ---------------------------------------------------------------------------

export interface StuckState {
  /** Number of consecutive turns without progress */
  turnsWithoutProgress: number;
  /** Set of tool names called across all turns (for novelty detection) */
  toolsSeen: Set<string>;
  /** Whether escalation has been triggered */
  escalated: boolean;
  /** Number of times escalation has been triggered in this session */
  escalationCount: number;
  /** Evidence collected so far (tool outputs, observations) */
  evidence: string[];
}

export interface StuckEscalation {
  /** Whether the model is stuck and needs escalation */
  isStuck: boolean;
  /** Number of turns without progress */
  turnsWithoutProgress: number;
  /** Summary of evidence gathered so far */
  evidenceSummary: string;
}

const STUCK_THRESHOLD = 2;
const MAX_EVIDENCE_ITEMS = 10;

// ---------------------------------------------------------------------------
// Stuck detector class
// ---------------------------------------------------------------------------

export class StuckDetector {
  private state: StuckState;

  constructor() {
    this.state = {
      turnsWithoutProgress: 0,
      toolsSeen: new Set(),
      escalated: false,
      escalationCount: 0,
      evidence: [],
    };
  }

  /**
   * Record a turn and check for progress.
   *
   * Progress is defined as:
   *   - Calling a tool not seen before in this session
   *   - Producing a fix (diff output)
   *
   * @param toolCalls - Tools called in this turn
   * @param producedFix - Whether the model produced a fix diff
   * @param toolOutputSummary - Brief summary of tool outputs (for evidence tracking)
   * @returns StuckEscalation indicating whether escalation is needed
   */
  recordTurn(
    toolCalls: ToolCall[],
    producedFix: boolean,
    toolOutputSummary?: string,
  ): StuckEscalation {
    // Track evidence
    if (toolOutputSummary) {
      this.state.evidence.push(toolOutputSummary);
      // Cap evidence to prevent unbounded growth
      if (this.state.evidence.length > MAX_EVIDENCE_ITEMS) {
        this.state.evidence = this.state.evidence.slice(-MAX_EVIDENCE_ITEMS);
      }
    }

    // Check for progress: new tools or a fix produced
    const newToolsCalled = toolCalls.filter(tc => !this.state.toolsSeen.has(tc.name));
    const madeProgress = newToolsCalled.length > 0 || producedFix;

    // Update seen tools
    for (const tc of toolCalls) {
      this.state.toolsSeen.add(tc.name);
    }

    if (madeProgress) {
      // Reset stuck counter on progress
      this.state.turnsWithoutProgress = 0;
      this.state.escalated = false;
      return {
        isStuck: false,
        turnsWithoutProgress: 0,
        evidenceSummary: '',
      };
    }

    // No progress — increment counter
    this.state.turnsWithoutProgress++;

    if (this.state.turnsWithoutProgress >= STUCK_THRESHOLD) {
      this.state.escalated = true;
      this.state.escalationCount++;

      return {
        isStuck: true,
        turnsWithoutProgress: this.state.turnsWithoutProgress,
        evidenceSummary: this.state.evidence.join('\n'),
      };
    }

    return {
      isStuck: false,
      turnsWithoutProgress: this.state.turnsWithoutProgress,
      evidenceSummary: '',
    };
  }

  /**
   * Record that escalation was handled (Claude provided direction).
   * Resets the stuck counter but keeps evidence for context.
   */
  handleEscalation(): void {
    this.state.turnsWithoutProgress = 0;
    this.state.escalated = false;
    // Keep evidence — it's still relevant after escalation
  }

  /**
   * Record that a fix was produced (resets everything).
   */
  recordFix(): void {
    this.state.turnsWithoutProgress = 0;
    this.state.escalated = false;
    this.state.evidence = [];
  }

  /** Get current state snapshot (for testing/debugging). */
  getState(): Readonly<StuckState> {
    return { ...this.state, toolsSeen: new Set(this.state.toolsSeen) };
  }

  /** Get number of escalations triggered so far. */
  get escalationCount(): number {
    return this.state.escalationCount;
  }

  /** Get stuck threshold. */
  static get THRESHOLD(): number {
    return STUCK_THRESHOLD;
  }
}

// ---------------------------------------------------------------------------
// Escalation prompt builder
// ---------------------------------------------------------------------------

/**
 * Build an escalation prompt for Claude/Haiku.
 *
 * The local model should produce a ≤200-token summary of:
 *   - What was found so far
 *   - What specific question/direction is needed
 *
 * IMPORTANT: Raw tool output (logs, traces, file contents) is NEVER forwarded
 * to Claude. Only the local model's summary goes in the escalation prompt.
 * This function wraps that summary into the escalation format.
 */
export function buildEscalationPrompt(
  localSummary: string,
): string {
  const parts: string[] = [];

  parts.push('The local model is stuck debugging an issue and needs direction.');
  parts.push('');
  parts.push('## Local Model Summary');
  parts.push(localSummary);
  parts.push('');
  parts.push('Respond with specific direction (~200 tokens). What should the local model try next?');

  return parts.join('\n');
}

/**
 * System prompt for Claude/Haiku when handling stuck escalation.
 */
export const STUCK_ESCALATION_SYSTEM = `You are a senior engineer providing debugging direction. A local AI model is stuck and needs specific guidance.

Rules:
- Be concise (~200 tokens)
- Give specific, actionable next steps
- Suggest tools to use or files to examine
- If the evidence suggests a root cause, state it clearly
- Do NOT produce code or diffs — just provide direction`;
