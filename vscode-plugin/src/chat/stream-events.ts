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
      /**
       * S001 sc2 (additive): the actual command the tool ran, when the provider
       * exposes it (Bash `input.command` / codex `item.command`). Absent for
       * command-less tools — consumers then fall back to the tool name (k2).
       */
      readonly command?: string;
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
  | { readonly kind: 'error'; readonly turnId: string; readonly message: string }
  | {
      /**
       * S001 (dev-chat ux polish) sc2 (additive): the OUTPUT a tool produced, surfaced so the
       * transcript can show the command + a collapsed preview of what it printed (claude's
       * `type:'user'` tool_result message / codex's completed command-execution output). `command`
       * carries the correlated command when the adapter can pair it back to the preceding tool_use;
       * absent otherwise (the row then shows only the output). `exitCode` is the process exit code
       * when the provider reports one. Persisted structurally (a `role:'tool-result'` transcript
       * row), not as a flat lifecycle marker (k2) — markerFor maps it to null.
       */
      readonly kind: 'tool-result';
      readonly turnId: string;
      readonly command?: string;
      readonly output: string;
      readonly exitCode?: number;
    }
  | {
      /**
       * S004 sc2 (additive): a tool-permission request the underlying CLI raised
       * mid-turn (claude `--permission-prompts host` control line / codex approval
       * item), surfaced so the webview can show an approve/deny card instead of the
       * action being silently blocked. `requestId` is the correlation key the
       * webview's permission-decision carries back so the adapter answers the RIGHT
       * request. Live-only: markerFor maps it to null, so it never persists to the
       * plain replayable transcript (k4).
       */
      readonly kind: 'approval-request';
      readonly turnId: string;
      readonly requestId: string;
      readonly title: string;
      readonly detail: string;
      readonly toolName?: string;
      /**
       * S001 (bugfix): the actual command the blocked action was about to run, when the
       * provider exposes it (claude `command` / `input.command`). Carried so an Approve
       * grant re-run can name the EXACT command to run instead of a vague nudge. Absent
       * for command-less requests — the event is then byte-identical to today (k2).
       */
      readonly command?: string;
    }
  | {
      /**
       * S003 (dev-chat ux polish) sc2 (additive): the RESOLVED outcome of a permission
       * approval-request (the user clicked approve/deny on the live card). HOST-emitted
       * from the permission-decision handler (not adapter-streamed), so the transcript can
       * replace the live-only card with a decided, non-actionable chip. Persisted
       * STRUCTURALLY as a `role:'permission-outcome'` transcript row (like tool-result),
       * so markerFor maps it to null — it never renders as a flat lifecycle marker (k2).
       */
      readonly kind: 'permission-outcome';
      readonly turnId: string;
      readonly toolName: string;
      readonly decision: 'approved' | 'rejected';
    }
  | {
      /**
       * S004 (dev-chat ux polish) sc2 (additive): an interactive selection request the model
       * raised mid-turn via an `insrc:select` fenced marker in its assistant text (parsed by
       * cli-adapter). Surfaced so the webview shows a single/multi-select widget (radio when
       * `multi` is absent/false, checkbox when true) with a confirm button, instead of the raw
       * marker leaking as text. `requestId` is the correlation key the webview's
       * selection-decision carries back. Live-only (like approval-request): markerFor maps it to
       * null so it never persists — the RESOLVED choice persists structurally as a
       * `role:'selection-outcome'` transcript row (k4).
       */
      readonly kind: 'selection-request';
      readonly turnId: string;
      readonly requestId: string;
      readonly prompt: string;
      readonly options: readonly { readonly id: string; readonly label: string }[];
      readonly multi?: boolean;
    }
  | {
      /**
       * S004 (dev-chat ux polish) sc2 (additive): the RESOLVED outcome of a selection-request
       * (the user confirmed one or more chips). HOST-emitted from the selection-decision handler
       * (not adapter-streamed), so the transcript can replace the live-only widget with a decided,
       * non-actionable chip listing the chosen label(s). Persisted STRUCTURALLY as a
       * `role:'selection-outcome'` transcript row (like permission-outcome), so markerFor maps it
       * to null — it never renders as a flat lifecycle marker (k2).
       */
      readonly kind: 'selection-outcome';
      readonly turnId: string;
      readonly chosen: readonly string[];
    };

/**
 * The discriminant values of {@link TurnEvent}. Exported so consumers/tests can assert exhaustiveness.
 *
 * S001 sc2 (additive) RESERVES 'approval-request' as a kind S004 fills: the KIND is
 * reserved here (so downstream switches/registries can already reference it and the
 * sc1 registry routes it through its fallback), while the event's concrete shape is
 * added to the {@link TurnEvent} union by S004. No existing kind changes shape (k2),
 * and S001 registers no handler for it.
 */
export const TURN_EVENT_KINDS = [
  'assistant-delta',
  'tool-call',
  'file-edit',
  'status',
  'done',
  'error',
  'tool-result',
  'approval-request',
  'permission-outcome',
  'selection-request',
  'selection-outcome',
] as const;

export type TurnEventKind = (typeof TURN_EVENT_KINDS)[number];
