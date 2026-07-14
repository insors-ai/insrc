/**
 * Generic classifier types. Daemon-layer and agent-layer code both
 * consume these; keep it dependency-free.
 *
 * The classifier module itself lives at `src/insrc/agent/classify/`.
 */

/**
 * Scope / size estimate for the work the user is asking for. Always
 * returned alongside the class id so downstream agents can adapt
 * (how many ideas to seed, Pair vs Delegate routing, single-turn vs
 * multi-round planning, etc.).
 *
 * The tiers are INTENT-NEUTRAL -- they describe work-volume in any
 * vocabulary (changes, analysis depth, query breadth, refactor span).
 * Pre-Phase-A.4 the descriptions were framed as "a change" and every
 * read-only intent (code-analysis, data-analysis, research, review,
 * document, brainstorm) defaulted to M because no tier fit. The
 * current wording reads sensibly for ALL intents.
 *
 *   S      -- one focused unit (a function, a column, a paragraph); minutes
 *   M      -- one module / one report section / one focused query; single session
 *   L      -- a full module or 5-10 sections / a feature build; multi-session
 *   XL     -- a subsystem (HDFS / auth / storage layer); many modules
 *   XXL    -- multiple subsystems or repo-wide analysis
 *   XXXL   -- cross-cutting concern that touches every subsystem
 *   XXXXL  -- whole-product / multi-product / major rewrite
 *
 * When the LLM doesn't return a recognizable scope, callers get 'M'
 * (the safe "normal" default). `fallback: true` lets callers
 * distinguish a guessed scope from a confidently-emitted one.
 */
export type ScopeSize = 'S' | 'M' | 'L' | 'XL' | 'XXL' | 'XXXL' | 'XXXXL';

/**
 * Human-readable metadata for each scope tier. Consumed by the UI for
 * the intent pill / logs for operator readability / downstream agents
 * that want to quote the tier to the user.
 *
 * `label` is a two-word headline suitable for a chip / pill.
 * `description` is a one-liner suitable for a tooltip or log line.
 */
export interface ScopeMeta {
  readonly label: string;
  readonly description: string;
}

export const SCOPE_META: Readonly<Record<ScopeSize, ScopeMeta>> = {
  S: {
    label: 'Small',
    description: 'one focused unit (a function, a column, a paragraph); minutes',
  },
  M: {
    label: 'Medium',
    description: 'one module / one report section / one focused query; single session',
  },
  L: {
    label: 'Large',
    description: 'a full module or 5-10 sections / a feature build; multi-session',
  },
  XL: {
    label: 'Very Large',
    description: 'a subsystem (HDFS / auth / storage layer); many modules',
  },
  XXL: {
    label: 'Very Very Large',
    description: 'multiple subsystems or repo-wide analysis',
  },
  XXXL: {
    label: 'Extremely Large',
    description: 'cross-cutting concern that touches every subsystem',
  },
  XXXXL: {
    label: 'Gigantic',
    description: 'whole-product / multi-product / major rewrite',
  },
};

/** Ordered scope tiers, smallest to largest. */
export const SCOPE_ORDER: readonly ScopeSize[] = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL'];

/** Convenience: label for a scope tier. */
export function scopeLabel(scope: ScopeSize): string {
  return SCOPE_META[scope].label;
}

/** Convenience: description for a scope tier. */
export function scopeDescription(scope: ScopeSize): string {
  return SCOPE_META[scope].description;
}

/** One class the caller wants the LLM to consider. */
export interface ClassChoice {
  /** Machine-readable key returned to the caller. */
  readonly id: string;
  /** Short human-readable label shown in the prompt. Defaults to `id`. */
  readonly label?: string;
  /**
   * One-line description of what the class means. Strongly encouraged
   * -- without it the LLM has to guess from the `id` alone.
   */
  readonly description?: string;
}

export interface ClassifyInput {
  /** The classes to choose from. Order preserved. */
  readonly classes: readonly ClassChoice[];
  /** The user / system text to classify. */
  readonly text: string;
  /**
   * Optional context appended to the prompt. Free-form string --
   * anything the caller wants the LLM to know (prior intent,
   * selected entity, previous user turn, etc.).
   */
  readonly context?: string;
  /**
   * Optional role label for the prompt preamble ("You are a <role>...").
   * Defaults to "classifier".
   */
  readonly role?: string;
  /**
   * Optional relationship enum. When supplied, the classifier ALSO
   * picks how the input text relates to prior conversation activity
   * referenced in `context`. The system prompt grows a relationship
   * section; the response schema grows a `relationship` block. The
   * caller is expected to embed citation keys (`[t1]`, `[s2]`, etc.)
   * inside `context` so the LLM can refer back to them. The classifier
   * does NOT validate citation keys -- it just returns whatever the
   * LLM emitted; the caller filters against its own memory bundle.
   */
  readonly relationshipEnum?: readonly string[];
}

/**
 * Relationship classification emitted alongside the primary class
 * when the caller supplied `relationshipEnum`. Always populated on
 * a successful classify() call when `relationshipEnum` was set;
 * defaults safely (`kind = relationshipEnum[0]`, empty citations) on
 * any parse failure.
 */
export interface ClassifyRelationship {
  /** One of `ClassifyInput.relationshipEnum`. */
  readonly kind: string;
  /** 0..1 confidence the LLM reported. Clamped. */
  readonly confidence: number;
  /** One-sentence reasoning the LLM gave. May be empty. */
  readonly reasoning: string;
  /**
   * Raw citation keys the LLM emitted (e.g. `['t1', 's2']`). The
   * caller is responsible for filtering against its own memory
   * bundle and translating keys into hydrated citation objects.
   */
  readonly citations: readonly string[];
}

export interface ClassifyResult {
  /**
   * The `id` of the chosen class. Always one of `classes[i].id`.
   * When the LLM returned an unknown id or errored, falls back to
   * `classes[0].id` and `fallback: true`.
   */
  readonly id: string;
  /** 0..1 confidence the LLM reported. Clamped. */
  readonly confidence: number;
  /** One-sentence reasoning the LLM gave. May be empty. */
  readonly reasoning: string;
  /**
   * Scope / size estimate. Always present -- defaults to 'M' when
   * the LLM omits it or returns an unrecognized value.
   */
  readonly scope: ScopeSize;
  /**
   * True when the LLM errored / returned unparseable output / returned
   * an id not in `classes`. The caller decides whether to retry.
   */
  readonly fallback: boolean;
  /**
   * Present iff `ClassifyInput.relationshipEnum` was supplied. Always
   * populated on success (defaults to `{ kind: relationshipEnum[0],
   * confidence: 0.5, reasoning: '...', citations: [] }` if the LLM
   * omitted or malformed the relationship block).
   */
  readonly relationship?: ClassifyRelationship | undefined;
}
