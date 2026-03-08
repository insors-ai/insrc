import { statSync } from 'node:fs';
import { TOKEN_BUDGET, countTokens } from '../context/budget.js';

// ---------------------------------------------------------------------------
// Attachment Size Limits
//
// From design doc (Phase 10):
//   - Text/code: L4 budget ceiling (~16K tokens), truncate from end
//   - Images: 5MB / longest edge ≤ 8000px
//   - PDFs: 32MB / ≤ 100 pages inline
//   - User notified on truncation or resize
// ---------------------------------------------------------------------------

/** Maximum file size for images (5MB). */
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** Maximum longest edge for images (pixels). */
export const IMAGE_MAX_EDGE = 8_000;

/** Maximum file size for inline PDFs (32MB). */
export const PDF_MAX_BYTES = 32 * 1024 * 1024;

/** Maximum pages for inline PDFs. */
export const PDF_MAX_PAGES = 100;

/** Token ceiling for text/code attachments (L4 budget). */
export const TEXT_TOKEN_CEILING = TOKEN_BUDGET.code;

export interface SizeCheckResult {
  ok: boolean;
  /** Warning message if truncation/resize needed or limit exceeded. */
  warning?: string;
}

/**
 * Check whether a text attachment fits within the L4 token budget.
 * Returns the (possibly truncated) text and a warning if truncated.
 */
export function enforceTextLimit(
  text: string,
  fileName: string,
): { text: string; warning?: string } {
  const tokens = countTokens(text);
  if (tokens <= TEXT_TOKEN_CEILING) {
    return { text };
  }

  // Truncate from end — keep first N chars that fit the budget
  const maxChars = TEXT_TOKEN_CEILING * 3; // inverse of countTokens: tokens * CHARS_PER_TOKEN
  const truncated = text.slice(0, maxChars);
  return {
    text: truncated,
    warning: `[attachment] ${fileName}: truncated from ${tokens} to ${TEXT_TOKEN_CEILING} tokens (file too large for context window)`,
  };
}

/**
 * Check whether an image file is within size limits.
 * Does NOT check pixel dimensions (would require image parsing).
 */
export function checkImageLimits(filePath: string): SizeCheckResult {
  try {
    const stat = statSync(filePath);
    if (stat.size > IMAGE_MAX_BYTES) {
      return {
        ok: false,
        warning: `[attachment] Image too large: ${(stat.size / (1024 * 1024)).toFixed(1)}MB (max ${IMAGE_MAX_BYTES / (1024 * 1024)}MB)`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, warning: `[attachment] Cannot read image: ${filePath}` };
  }
}

/**
 * Check whether a PDF file is within inline size limits.
 * Does NOT check page count (would require PDF parsing).
 */
export function checkPdfLimits(filePath: string): SizeCheckResult {
  try {
    const stat = statSync(filePath);
    if (stat.size > PDF_MAX_BYTES) {
      return {
        ok: false,
        warning: `[attachment] PDF too large for inline: ${(stat.size / (1024 * 1024)).toFixed(1)}MB (max ${PDF_MAX_BYTES / (1024 * 1024)}MB)`,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, warning: `[attachment] Cannot read PDF: ${filePath}` };
  }
}
