import {
  TOKEN_BUDGET,
  countTokens,
  type TokenBudget,
  type LayerContent,
  type AssembledContext,
  type DroppedInfo,
} from './budget.js';

// ---------------------------------------------------------------------------
// Overflow Priority Enforcement
//
// When assembled context exceeds the total input budget (total - response),
// content is shed in priority order — lowest priority first:
//
//   1st dropped: L4 — code entities (lowest vector-score first)
//   2nd dropped: L3b — semantic history (lowest similarity first)
//   3rd dropped: L3a — recent turns (oldest first, always keep last 2)
//   4th dropped: L2 — session summary (truncate to half, keep first sentence)
//   Never:       L1 — system context
// ---------------------------------------------------------------------------

/** Raw layer inputs before overflow enforcement. */
export interface RawLayers {
  system:   string;
  summary:  string;
  /** Recent turn blocks, ordered newest-first. */
  recent:   string[];
  /** Semantic history blocks, ordered by similarity (highest first). */
  semantic: string[];
  /** Code entity blocks, ordered by vector score (highest first). */
  code:     string[];
  /** Entity names directly mentioned in the user message — never dropped during overflow. */
  preservedNames?: Set<string> | undefined;
}

/**
 * Enforce per-layer ceilings and total budget.
 *
 * Each layer is first trimmed to its own ceiling, then if the total still
 * exceeds the input budget, layers are dropped in priority order.
 */
export function fitToBudget(raw: RawLayers, budget?: TokenBudget): AssembledContext {
  const b = budget ?? TOKEN_BUDGET;
  const inputBudget = b.total - b.response;
  const dropped: DroppedInfo[] = [];

  // 1. Enforce per-layer ceilings
  const system  = enforceceiling(raw.system, b.system);
  const summary = enforceBlockCeiling(raw.summary, b.summary);
  const recent  = enforceArrayCeiling(raw.recent, b.recent);
  const semantic = enforceArrayCeiling(raw.semantic, b.semantic);
  const code    = enforceArrayCeiling(raw.code, b.code);

  let total = system.tokens + summary.tokens + recent.tokens + semantic.tokens + code.tokens;

  // 2. If within budget, done
  if (total <= inputBudget) {
    return buildResult(system, summary, recent, semantic, code, dropped);
  }

  // 3. Drop in priority order until within budget

  // 3a. Drop code entities (lowest score = last in array, but preserve directly-named)
  const preserved = raw.preservedNames;
  {
    // Walk backwards, skipping blocks whose header contains a preserved entity name
    let i = code.blocks.length - 1;
    while (total > inputBudget && i >= 0) {
      const block = code.blocks[i]!;
      if (preserved && preserved.size > 0 && isPreserved(block, preserved)) {
        i--; // skip — this entity was directly named by the user
        continue;
      }
      code.blocks.splice(i, 1);
      const removedTokens = countTokens(block);
      code.tokens -= removedTokens;
      total -= removedTokens;
      dropped.push({ layer: 'code', reason: 'overflow — lowest vector score', tokensDropped: removedTokens });
      i--;
    }
  }

  if (total <= inputBudget) {
    return buildResult(system, summary, recent, semantic, code, dropped);
  }

  // 3b. Drop semantic history (lowest similarity = last in array)
  while (total > inputBudget && semantic.blocks.length > 0) {
    const removed = semantic.blocks.pop()!;
    const removedTokens = countTokens(removed);
    semantic.tokens -= removedTokens;
    total -= removedTokens;
    dropped.push({ layer: 'semantic', reason: 'overflow — lowest similarity', tokensDropped: removedTokens });
  }

  if (total <= inputBudget) {
    return buildResult(system, summary, recent, semantic, code, dropped);
  }

  // 3c. Drop recent turns (oldest = last in array, but keep last 2 = first 2)
  while (total > inputBudget && recent.blocks.length > 2) {
    const removed = recent.blocks.pop()!;
    const removedTokens = countTokens(removed);
    recent.tokens -= removedTokens;
    total -= removedTokens;
    dropped.push({ layer: 'recent', reason: 'overflow — oldest turn', tokensDropped: removedTokens });
  }

  if (total <= inputBudget) {
    return buildResult(system, summary, recent, semantic, code, dropped);
  }

  // 3d. Truncate summary to half, keep first sentence
  if (summary.tokens > 0) {
    const original = summary.text;
    const firstSentence = original.match(/^[^.!?]*[.!?]/)?.[0] ?? '';
    const halfLength = Math.floor(original.length / 2);
    const truncated = original.length > halfLength
      ? original.slice(0, Math.max(halfLength, firstSentence.length))
      : original;
    const oldTokens = summary.tokens;
    summary.text = truncated;
    summary.tokens = countTokens(truncated);
    total -= (oldTokens - summary.tokens);
    if (oldTokens > summary.tokens) {
      dropped.push({ layer: 'summary', reason: 'overflow — truncated to half', tokensDropped: oldTokens - summary.tokens });
    }
  }

  return buildResult(system, summary, recent, semantic, code, dropped);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface CeiledBlock {
  text: string;
  tokens: number;
}

interface CeiledArray {
  blocks: string[];
  tokens: number;
}

function enforceBlockCeiling(text: string, ceiling: number): CeiledBlock {
  const tokens = countTokens(text);
  if (tokens <= ceiling) return { text, tokens };
  // Truncate to fit
  const maxChars = ceiling * 3; // CHARS_PER_TOKEN
  return { text: text.slice(0, maxChars), tokens: ceiling };
}

function enforceArrayCeiling(blocks: string[], ceiling: number): CeiledArray {
  const result: string[] = [];
  let tokens = 0;
  for (const block of blocks) {
    const blockTokens = countTokens(block);
    if (tokens + blockTokens > ceiling) break;
    result.push(block);
    tokens += blockTokens;
  }
  return { blocks: result, tokens };
}

function enforceceiling(text: string, ceiling: number): CeiledBlock {
  return enforceBlockCeiling(text, ceiling);
}

/** Check if a code block's header contains any of the preserved entity names. */
function isPreserved(block: string, names: Set<string>): boolean {
  // Header format: [kind name — file:start-end]
  const headerEnd = block.indexOf(']');
  if (headerEnd < 0) return false;
  const header = block.slice(0, headerEnd + 1);
  for (const name of names) {
    if (header.includes(name)) return true;
  }
  return false;
}

function buildResult(
  system: CeiledBlock,
  summary: CeiledBlock,
  recent: CeiledArray,
  semantic: CeiledArray,
  code: CeiledArray,
  dropped: DroppedInfo[],
): AssembledContext {
  const recentText = recent.blocks.join('\n\n');
  const semanticText = semantic.blocks.join('\n\n');
  const codeText = code.blocks.join('\n\n---\n\n');

  return {
    system:   { text: system.text, tokens: system.tokens },
    summary:  { text: summary.text, tokens: summary.tokens },
    recent:   { text: recentText, tokens: recent.tokens },
    semantic: { text: semanticText, tokens: semantic.tokens },
    code:     { text: codeText, tokens: code.tokens },
    totalTokens: system.tokens + summary.tokens + recent.tokens + semantic.tokens + code.tokens,
    dropped,
  };
}
