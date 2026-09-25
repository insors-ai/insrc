/**
 * Story E20260925edb76e2e:S002 / sc2 — the normalized CLI stream-event schema.
 *
 * The provider-agnostic event union the StreamAdapter (sc5, cli-adapter.ts) emits
 * per turn. It is the ONLY vocabulary downstream surfaces see — the terminal chat
 * panel (S003), the lifecycle markers (S004) and the inline-diff view (S006) all
 * consume `TurnEvent`, so a claude/codex native-stream-format difference never
 * leaks past the per-provider adapter (k1/k4/k8). Type-only; vscode-free.
 *
 * Shape is verbatim from the approved HLD sc2 interfaceSketch.
 */

/** A hunk-based diff for a single file edit (kept hunk-based, not full blobs, for streaming throughput). */
export interface UnifiedDiff {
  readonly path: string;
  readonly hunks: ReadonlyArray<{
    readonly oldStart: number;
    readonly oldLines: number;
    readonly newStart: number;
    readonly newLines: number;
    readonly lines: string[];
  }>;
}

/**
 * One discrete event in a chat turn's normalized stream. Every event carries the
 * `turnId` it belongs to. A turn ends with exactly one terminal event (`done` or
 * `error`); nothing is yielded after it.
 */
export type TurnEvent =
  | { readonly kind: 'assistant-delta'; readonly turnId: string; readonly text: string }
  | {
      readonly kind: 'tool-call';
      readonly turnId: string;
      readonly tool: string;
      readonly mcp?: { readonly server: string; readonly name: string };
    }
  | { readonly kind: 'file-edit'; readonly turnId: string; readonly path: string; readonly diff: UnifiedDiff }
  | { readonly kind: 'status'; readonly turnId: string; readonly phase: 'thinking' | 'streaming' | 'tool' | 'editing' }
  | {
      readonly kind: 'done';
      readonly turnId: string;
      readonly ok: boolean;
      /** The provider's native session id for this turn, when captured — the resume handle S005 persists. */
      readonly sessionId?: string;
    }
  | { readonly kind: 'error'; readonly turnId: string; readonly message: string };

/** The discriminant values of {@link TurnEvent}. Exported so consumers/tests can assert exhaustiveness. */
export const TURN_EVENT_KINDS = [
  'assistant-delta',
  'tool-call',
  'file-edit',
  'status',
  'done',
  'error',
] as const;

export type TurnEventKind = (typeof TURN_EVENT_KINDS)[number];
