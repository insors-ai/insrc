import type { ModelContextConfig } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// Input Chunking — splits large inputs into overlapping segments
//
// Used by the analyze stage when input exceeds the model's context window.
// Each chunk overlaps with the next to preserve context at boundaries.
// ---------------------------------------------------------------------------

export interface Chunk {
  index: number;
  text: string;
  tokens: number;
}

/**
 * Estimate token count from text length using the configured chars-per-token ratio.
 */
export function countTokens(text: string, charsPerToken: number): number {
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Maximum input tokens available for a single LLM call.
 * Reserves space for the system prompt and output.
 */
export function availableInputTokens(
  ctx: ModelContextConfig,
  systemTokens: number,
  maxOutputTokens: number,
): number {
  return ctx.local - systemTokens - maxOutputTokens;
}

/**
 * Split text into overlapping chunks that fit within the model's context window.
 *
 * @param text - The full input text
 * @param maxTokensPerChunk - Maximum tokens per chunk (use availableInputTokens)
 * @param overlapTokens - Overlap between consecutive chunks (default: 10% of max)
 * @param charsPerToken - Chars-per-token ratio for estimation
 * @returns Array of chunks. If text fits in one chunk, returns a single-element array.
 */
export function chunkText(
  text: string,
  maxTokensPerChunk: number,
  charsPerToken: number,
  overlapTokens?: number,
): Chunk[] {
  const totalTokens = countTokens(text, charsPerToken);

  // Fits in one chunk — no splitting needed
  if (totalTokens <= maxTokensPerChunk) {
    return [{ index: 0, text, tokens: totalTokens }];
  }

  const overlap = overlapTokens ?? Math.floor(maxTokensPerChunk * 0.1);
  const maxCharsPerChunk = maxTokensPerChunk * charsPerToken;
  const overlapChars = overlap * charsPerToken;
  const strideChars = maxCharsPerChunk - overlapChars;

  const chunks: Chunk[] = [];
  let offset = 0;

  while (offset < text.length) {
    const end = Math.min(offset + maxCharsPerChunk, text.length);
    let chunkText = text.slice(offset, end);

    // Try to break at a paragraph or line boundary (don't split mid-line)
    if (end < text.length) {
      const lastNewline = chunkText.lastIndexOf('\n\n');
      if (lastNewline > strideChars * 0.5) {
        chunkText = chunkText.slice(0, lastNewline + 2);
      } else {
        const lastLine = chunkText.lastIndexOf('\n');
        if (lastLine > strideChars * 0.5) {
          chunkText = chunkText.slice(0, lastLine + 1);
        }
      }
    }

    chunks.push({
      index: chunks.length,
      text: chunkText,
      tokens: countTokens(chunkText, charsPerToken),
    });

    offset += chunkText.length - overlapChars;

    // Safety: ensure forward progress
    if (chunkText.length <= overlapChars) {
      offset = end;
    }
  }

  return chunks;
}

/**
 * Check if input needs chunking based on available context window.
 */
export function needsChunking(
  text: string,
  ctx: ModelContextConfig,
  systemTokens: number,
  maxOutputTokens: number,
): boolean {
  const available = availableInputTokens(ctx, systemTokens, maxOutputTokens);
  return countTokens(text, ctx.charsPerToken) > available;
}
