import { readFileSync } from 'node:fs';
import { extname, basename } from 'node:path';
import type { Attachment, ContentBlock } from '../../shared/types.js';
import { enforceTextLimit, checkImageLimits, checkPdfLimits } from './limits.js';

// ---------------------------------------------------------------------------
// Attachment Type Router
//
// From design doc (Phase 10):
//   - Detect attachment type by extension
//   - Text/code: read file, inject as L4 text context
//   - Images: encode as base64, force Claude escalation
//   - PDFs: encode as base64, force Claude escalation
// ---------------------------------------------------------------------------

/** Extensions recognized as code files. */
const CODE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.pyi',
  '.go',
  '.rs',
  '.java', '.kt', '.scala',
  '.c', '.cpp', '.cc', '.h', '.hpp',
  '.cs',
  '.rb',
  '.php',
  '.swift',
  '.sh', '.bash', '.zsh',
  '.sql',
  '.yaml', '.yml',
  '.toml',
  '.json', '.jsonc',
  '.xml',
  '.html', '.htm', '.css', '.scss', '.less',
  '.vue', '.svelte',
]);

/** Extensions recognized as images. */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp']);

/** MIME types for image extensions. */
const IMAGE_MIME: Record<string, string> = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
};

/**
 * Detect attachment kind from file extension.
 */
export function detectAttachmentKind(filePath: string): Attachment['kind'] {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (CODE_EXTENSIONS.has(ext)) return 'code';
  return 'text';
}

/**
 * Whether an attachment kind forces Claude escalation.
 * Images and PDFs cannot be processed by local LLMs.
 */
export function forcesClaudeEscalation(kind: Attachment['kind']): boolean {
  return kind === 'image' || kind === 'pdf';
}

/**
 * Whether any attachment in the list forces Claude escalation.
 */
export function hasEscalationAttachment(attachments: Attachment[] | undefined): boolean {
  if (!attachments || attachments.length === 0) return false;
  return attachments.some(a => forcesClaudeEscalation(a.kind));
}

export interface ResolvedAttachment {
  attachment: Attachment;
  /** Text content for text/code files (injected into L4). */
  textContent?: string;
  /** Content blocks for multimodal messages (image/PDF). */
  contentBlocks?: ContentBlock[];
  /** Warning messages for the user. */
  warnings: string[];
}

/**
 * Resolve a file path into a fully loaded attachment.
 *
 * - Text/code: reads file content, enforces token limit
 * - Image: reads and base64-encodes, checks size limits
 * - PDF: reads and base64-encodes, checks size limits
 */
export function resolveAttachment(filePath: string): ResolvedAttachment {
  const kind = detectAttachmentKind(filePath);
  const name = basename(filePath);
  const warnings: string[] = [];

  const attachment: Attachment = { kind, name, path: filePath };

  if (kind === 'text' || kind === 'code') {
    try {
      const raw = readFileSync(filePath, 'utf-8');
      const { text, warning } = enforceTextLimit(raw, name);
      if (warning) warnings.push(warning);
      attachment.content = text;
      return { attachment, textContent: text, warnings };
    } catch (err) {
      warnings.push(`[attachment] Cannot read file: ${filePath}`);
      return { attachment, warnings };
    }
  }

  if (kind === 'image') {
    const check = checkImageLimits(filePath);
    if (!check.ok) {
      if (check.warning) warnings.push(check.warning);
      return { attachment, warnings };
    }

    try {
      const data = readFileSync(filePath).toString('base64');
      const ext = extname(filePath).toLowerCase();
      const mediaType = IMAGE_MIME[ext] ?? 'image/png';
      const blocks: ContentBlock[] = [
        { type: 'image', mediaType, data },
      ];
      return { attachment, contentBlocks: blocks, warnings };
    } catch {
      warnings.push(`[attachment] Cannot read image: ${filePath}`);
      return { attachment, warnings };
    }
  }

  if (kind === 'pdf') {
    const check = checkPdfLimits(filePath);
    if (!check.ok) {
      if (check.warning) warnings.push(check.warning);
      return { attachment, warnings };
    }

    try {
      const data = readFileSync(filePath).toString('base64');
      const blocks: ContentBlock[] = [
        { type: 'document', mediaType: 'application/pdf', data },
      ];
      return { attachment, contentBlocks: blocks, warnings };
    } catch {
      warnings.push(`[attachment] Cannot read PDF: ${filePath}`);
      return { attachment, warnings };
    }
  }

  return { attachment, warnings };
}

/**
 * Parse file path references from user input.
 *
 * Detects:
 *   - Explicit paths: /absolute/path/to/file.ext
 *   - Relative paths: ./relative/path/to/file.ext, ../path/to/file.ext
 *   - Named files with extensions: somefile.ts, image.png, doc.pdf
 *
 * Returns the extracted paths and the cleaned message (paths removed).
 */
export function extractFilePaths(input: string): { paths: string[]; cleanedMessage: string } {
  const paths: string[] = [];

  // Match absolute paths, relative paths (./  ../), and bare filenames with extensions
  // Avoid matching common non-path tokens like version numbers (v1.0) or URLs
  const pathPattern = /(?:^|\s)((?:\.{1,2}\/|\/)[^\s]+\.\w+|[a-zA-Z_][\w.-]*\/[^\s]+\.\w+)/g;
  let m: RegExpExecArray | null;
  let cleanedMessage = input;

  while ((m = pathPattern.exec(input)) !== null) {
    const p = m[1]!.trim();
    paths.push(p);
  }

  // Remove paths from the message
  for (const p of paths) {
    cleanedMessage = cleanedMessage.replace(p, '').trim();
  }

  // Normalize whitespace
  cleanedMessage = cleanedMessage.replace(/\s+/g, ' ').trim();

  return { paths, cleanedMessage };
}
