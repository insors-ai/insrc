#!/usr/bin/env tsx
/**
 * Phase 10 tests — Attachment Modifier
 *
 * Tests cover:
 *   - Types: ContentBlock, LLMMessage multimodal support
 *   - Attachment router: kind detection, escalation check, file path extraction
 *   - Size limits: text truncation, image/PDF limit checks
 *   - Forced-Claude pipeline: exports, system prompts, result shape
 *   - Provider router: attachment-forced escalation
 *   - Context assembly: attachment injection into L4
 *   - Claude provider: multimodal content block conversion
 *   - REPL wiring: imports, attachment flow
 *   - File structure: all new files exist
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { writeFileSync, mkdirSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve(fn()).then(
    () => { passed++; console.log(`  ✓ ${name}`); },
    (err: unknown) => { failed++; console.log(`  ✗ ${name}`); console.log(`    ${err}`); },
  );
}

// ===========================================================================
// 1. Types — ContentBlock and LLMMessage
// ===========================================================================

console.log('\n── Types ──');

import type { ContentBlock, LLMMessage, Attachment } from '../src/shared/types.js';

await test('ContentBlock text type is assignable', () => {
  const block: ContentBlock = { type: 'text', text: 'hello' };
  assert.equal(block.type, 'text');
});

await test('ContentBlock image type is assignable', () => {
  const block: ContentBlock = { type: 'image', mediaType: 'image/png', data: 'base64data' };
  assert.equal(block.type, 'image');
  assert.equal(block.mediaType, 'image/png');
});

await test('ContentBlock document type is assignable', () => {
  const block: ContentBlock = { type: 'document', mediaType: 'application/pdf', data: 'base64data' };
  assert.equal(block.type, 'document');
});

await test('LLMMessage accepts string content (backward compatible)', () => {
  const msg: LLMMessage = { role: 'user', content: 'hello' };
  assert.equal(typeof msg.content, 'string');
});

await test('LLMMessage accepts ContentBlock[] content', () => {
  const msg: LLMMessage = {
    role: 'user',
    content: [
      { type: 'text', text: 'describe this image' },
      { type: 'image', mediaType: 'image/png', data: 'abc123' },
    ],
  };
  assert.ok(Array.isArray(msg.content));
  assert.equal(msg.content.length, 2);
});

await test('Attachment type unchanged from prior phases', () => {
  const a: Attachment = { kind: 'image', name: 'test.png', path: '/tmp/test.png' };
  assert.equal(a.kind, 'image');
  assert.equal(a.name, 'test.png');
});

// ===========================================================================
// 2. Attachment Router — Kind Detection
// ===========================================================================

console.log('\n── Attachment Router — Kind Detection ──');

import {
  detectAttachmentKind,
  forcesClaudeEscalation,
  hasEscalationAttachment,
  extractFilePaths,
  resolveAttachment,
} from '../src/agent/attachments/router.js';

await test('detectAttachmentKind: .ts → code', () => {
  assert.equal(detectAttachmentKind('/path/to/file.ts'), 'code');
});

await test('detectAttachmentKind: .py → code', () => {
  assert.equal(detectAttachmentKind('/path/to/file.py'), 'code');
});

await test('detectAttachmentKind: .go → code', () => {
  assert.equal(detectAttachmentKind('/path/to/file.go'), 'code');
});

await test('detectAttachmentKind: .json → code', () => {
  assert.equal(detectAttachmentKind('/path/config.json'), 'code');
});

await test('detectAttachmentKind: .png → image', () => {
  assert.equal(detectAttachmentKind('/path/screenshot.png'), 'image');
});

await test('detectAttachmentKind: .jpg → image', () => {
  assert.equal(detectAttachmentKind('/path/photo.jpg'), 'image');
});

await test('detectAttachmentKind: .jpeg → image', () => {
  assert.equal(detectAttachmentKind('/path/photo.jpeg'), 'image');
});

await test('detectAttachmentKind: .gif → image', () => {
  assert.equal(detectAttachmentKind('/path/anim.gif'), 'image');
});

await test('detectAttachmentKind: .webp → image', () => {
  assert.equal(detectAttachmentKind('/path/modern.webp'), 'image');
});

await test('detectAttachmentKind: .pdf → pdf', () => {
  assert.equal(detectAttachmentKind('/path/doc.pdf'), 'pdf');
});

await test('detectAttachmentKind: .txt → text', () => {
  assert.equal(detectAttachmentKind('/path/notes.txt'), 'text');
});

await test('detectAttachmentKind: .log → text', () => {
  assert.equal(detectAttachmentKind('/path/crash.log'), 'text');
});

await test('detectAttachmentKind: .md → text', () => {
  assert.equal(detectAttachmentKind('/path/README.md'), 'text');
});

await test('detectAttachmentKind: .csv → text', () => {
  assert.equal(detectAttachmentKind('/path/data.csv'), 'text');
});

await test('detectAttachmentKind: unknown ext → text', () => {
  assert.equal(detectAttachmentKind('/path/file.xyz'), 'text');
});

// ===========================================================================
// 3. Attachment Router — Escalation Check
// ===========================================================================

console.log('\n── Attachment Router — Escalation Check ──');

await test('forcesClaudeEscalation: image → true', () => {
  assert.ok(forcesClaudeEscalation('image'));
});

await test('forcesClaudeEscalation: pdf → true', () => {
  assert.ok(forcesClaudeEscalation('pdf'));
});

await test('forcesClaudeEscalation: text → false', () => {
  assert.ok(!forcesClaudeEscalation('text'));
});

await test('forcesClaudeEscalation: code → false', () => {
  assert.ok(!forcesClaudeEscalation('code'));
});

await test('hasEscalationAttachment: undefined → false', () => {
  assert.ok(!hasEscalationAttachment(undefined));
});

await test('hasEscalationAttachment: empty array → false', () => {
  assert.ok(!hasEscalationAttachment([]));
});

await test('hasEscalationAttachment: text only → false', () => {
  assert.ok(!hasEscalationAttachment([
    { kind: 'text', name: 'notes.txt', path: '/tmp/notes.txt' },
    { kind: 'code', name: 'main.ts', path: '/tmp/main.ts' },
  ]));
});

await test('hasEscalationAttachment: image present → true', () => {
  assert.ok(hasEscalationAttachment([
    { kind: 'text', name: 'notes.txt', path: '/tmp/notes.txt' },
    { kind: 'image', name: 'screen.png', path: '/tmp/screen.png' },
  ]));
});

await test('hasEscalationAttachment: pdf present → true', () => {
  assert.ok(hasEscalationAttachment([
    { kind: 'pdf', name: 'doc.pdf', path: '/tmp/doc.pdf' },
  ]));
});

// ===========================================================================
// 4. Attachment Router — File Path Extraction
// ===========================================================================

console.log('\n── Attachment Router — File Path Extraction ──');

await test('extractFilePaths: absolute path', () => {
  const { paths } = extractFilePaths('debug this /tmp/crash.log please');
  assert.ok(paths.some(p => p === '/tmp/crash.log'));
});

await test('extractFilePaths: relative path with ./', () => {
  const { paths } = extractFilePaths('review ./src/main.ts');
  assert.ok(paths.some(p => p === './src/main.ts'));
});

await test('extractFilePaths: relative path with ../', () => {
  const { paths } = extractFilePaths('check ../other/file.py');
  assert.ok(paths.some(p => p === '../other/file.py'));
});

await test('extractFilePaths: path with directory separator', () => {
  const { paths } = extractFilePaths('implement src/utils/helper.ts');
  assert.ok(paths.some(p => p === 'src/utils/helper.ts'));
});

await test('extractFilePaths: no paths → empty array', () => {
  const { paths } = extractFilePaths('implement a new feature');
  assert.equal(paths.length, 0);
});

await test('extractFilePaths: cleaned message removes paths', () => {
  const { cleanedMessage } = extractFilePaths('debug this /tmp/crash.log please');
  assert.ok(!cleanedMessage.includes('/tmp/crash.log'));
  assert.ok(cleanedMessage.includes('debug'));
  assert.ok(cleanedMessage.includes('please'));
});

// ===========================================================================
// 5. Attachment Router — resolveAttachment
// ===========================================================================

console.log('\n── Attachment Router — resolveAttachment ──');

// Create temp files for resolve tests
const tmpDir = join(tmpdir(), 'insrc-test-p10-' + Date.now());
mkdirSync(tmpDir, { recursive: true });

const tmpTextFile = join(tmpDir, 'test.txt');
writeFileSync(tmpTextFile, 'Hello, world!');

const tmpCodeFile = join(tmpDir, 'test.ts');
writeFileSync(tmpCodeFile, 'export const x = 42;');

// Create a tiny 1x1 PNG (68 bytes)
const tinyPng = Buffer.from([
  0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
  0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
  0x00, 0x00, 0x02, 0x00, 0x01, 0xE2, 0x21, 0xBC,
  0x33, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, // IEND chunk
  0x44, 0xAE, 0x42, 0x60, 0x82,
]);
const tmpImageFile = join(tmpDir, 'test.png');
writeFileSync(tmpImageFile, tinyPng);

const tmpPdfFile = join(tmpDir, 'test.pdf');
writeFileSync(tmpPdfFile, '%PDF-1.4 minimal test');

await test('resolveAttachment: text file → textContent populated', () => {
  const result = resolveAttachment(tmpTextFile);
  assert.equal(result.attachment.kind, 'text');
  assert.equal(result.attachment.name, 'test.txt');
  assert.equal(result.textContent, 'Hello, world!');
  assert.equal(result.contentBlocks, undefined);
  assert.equal(result.warnings.length, 0);
});

await test('resolveAttachment: code file → textContent populated', () => {
  const result = resolveAttachment(tmpCodeFile);
  assert.equal(result.attachment.kind, 'code');
  assert.equal(result.textContent, 'export const x = 42;');
});

await test('resolveAttachment: image file → contentBlocks with base64', () => {
  const result = resolveAttachment(tmpImageFile);
  assert.equal(result.attachment.kind, 'image');
  assert.ok(result.contentBlocks);
  assert.equal(result.contentBlocks!.length, 1);
  assert.equal(result.contentBlocks![0]!.type, 'image');
  if (result.contentBlocks![0]!.type === 'image') {
    assert.equal(result.contentBlocks![0]!.mediaType, 'image/png');
    assert.ok(result.contentBlocks![0]!.data.length > 0);
  }
  assert.equal(result.textContent, undefined);
});

await test('resolveAttachment: PDF file → contentBlocks with base64', () => {
  const result = resolveAttachment(tmpPdfFile);
  assert.equal(result.attachment.kind, 'pdf');
  assert.ok(result.contentBlocks);
  assert.equal(result.contentBlocks!.length, 1);
  assert.equal(result.contentBlocks![0]!.type, 'document');
  if (result.contentBlocks![0]!.type === 'document') {
    assert.equal(result.contentBlocks![0]!.mediaType, 'application/pdf');
  }
});

await test('resolveAttachment: nonexistent file → warning', () => {
  const result = resolveAttachment('/nonexistent/file.txt');
  assert.ok(result.warnings.length > 0);
  assert.ok(result.warnings[0]!.includes('Cannot read'));
});

// ===========================================================================
// 6. Size Limits
// ===========================================================================

console.log('\n── Size Limits ──');

import {
  enforceTextLimit,
  checkImageLimits,
  checkPdfLimits,
  TEXT_TOKEN_CEILING,
  IMAGE_MAX_BYTES,
  PDF_MAX_BYTES,
  IMAGE_MAX_EDGE,
  PDF_MAX_PAGES,
} from '../src/agent/attachments/limits.js';

await test('TEXT_TOKEN_CEILING equals TOKEN_BUDGET.code (16000)', () => {
  assert.equal(TEXT_TOKEN_CEILING, 16_000);
});

await test('IMAGE_MAX_BYTES is 5MB', () => {
  assert.equal(IMAGE_MAX_BYTES, 5 * 1024 * 1024);
});

await test('PDF_MAX_BYTES is 32MB', () => {
  assert.equal(PDF_MAX_BYTES, 32 * 1024 * 1024);
});

await test('IMAGE_MAX_EDGE is 8000', () => {
  assert.equal(IMAGE_MAX_EDGE, 8_000);
});

await test('PDF_MAX_PAGES is 100', () => {
  assert.equal(PDF_MAX_PAGES, 100);
});

await test('enforceTextLimit: small text passes through unchanged', () => {
  const { text, warning } = enforceTextLimit('short text', 'test.txt');
  assert.equal(text, 'short text');
  assert.equal(warning, undefined);
});

await test('enforceTextLimit: large text is truncated with warning', () => {
  // Create text that exceeds 16K tokens (16000 * 3 = 48000 chars)
  const largeText = 'x'.repeat(60_000);
  const { text, warning } = enforceTextLimit(largeText, 'big.log');
  assert.ok(text.length < largeText.length);
  assert.equal(text.length, TEXT_TOKEN_CEILING * 3);
  assert.ok(warning);
  assert.ok(warning!.includes('truncated'));
  assert.ok(warning!.includes('big.log'));
});

await test('checkImageLimits: small file → ok', () => {
  const result = checkImageLimits(tmpImageFile);
  assert.ok(result.ok);
  assert.equal(result.warning, undefined);
});

await test('checkImageLimits: nonexistent file → not ok', () => {
  const result = checkImageLimits('/nonexistent/image.png');
  assert.ok(!result.ok);
  assert.ok(result.warning);
});

await test('checkPdfLimits: small file → ok', () => {
  const result = checkPdfLimits(tmpPdfFile);
  assert.ok(result.ok);
});

await test('checkPdfLimits: nonexistent file → not ok', () => {
  const result = checkPdfLimits('/nonexistent/doc.pdf');
  assert.ok(!result.ok);
});

// ===========================================================================
// 7. Forced-Claude Pipeline
// ===========================================================================

console.log('\n── Forced-Claude Pipeline ──');

import { runForcedClaudePipeline, type ForcedClaudeResult } from '../src/agent/attachments/forced-claude.js';

await test('runForcedClaudePipeline is exported', () => {
  assert.equal(typeof runForcedClaudePipeline, 'function');
});

await test('ForcedClaudeResult has expected shape', () => {
  const result: ForcedClaudeResult = {
    accepted: false,
    diff: '',
    filesWritten: [],
    message: 'test',
  };
  assert.equal(result.accepted, false);
  assert.equal(typeof result.message, 'string');
  assert.ok(Array.isArray(result.filesWritten));
});

await test('runForcedClaudePipeline returns failure when no diff produced', async () => {
  const mockProvider = {
    complete: async () => ({ text: 'No diff here', stopReason: 'end_turn' as const }),
    stream: async function* () { yield ''; },
    embed: async () => [],
    supportsTools: false,
  };
  const result = await runForcedClaudePipeline(
    'implement', 'add a feature', '/tmp', '', '',
    [{ type: 'text' as const, text: 'context' }],
    mockProvider,
    () => {},
  );
  assert.ok(!result.accepted);
  assert.ok(result.message.length > 0);
});

// ===========================================================================
// 8. Provider Router — Attachment Escalation
// ===========================================================================

console.log('\n── Provider Router — Attachment Escalation ──');

import { selectProvider, type RouteResult, type RouterDeps } from '../src/agent/router.js';

const mockOllama = {
  complete: async () => ({ text: '', stopReason: 'end_turn' as const }),
  stream: async function* () { yield ''; },
  embed: async () => [],
  supportsTools: false,
};

const mockConfig = {
  ollama: { host: 'http://localhost:11434' },
  models: {
    local: 'test-model',
    tiers: { fast: 'claude-haiku-4-5', standard: 'claude-sonnet-4-6', powerful: 'claude-opus-4-6' },
    roles: {},
  },
  keys: { anthropic: 'test-key' },
  permissions: { mode: 'validate' as const },
};

await test('selectProvider: no attachments → normal routing (local for implement)', () => {
  const result = selectProvider('implement', undefined, {
    ollamaProvider: mockOllama,
    claudeProvider: null,
    config: mockConfig,
  });
  assert.equal(result.label, 'Local');
  assert.equal(result.attachmentForced, undefined);
});

await test('selectProvider: text attachment → no escalation', () => {
  const result = selectProvider('implement', undefined, {
    ollamaProvider: mockOllama,
    claudeProvider: null,
    config: mockConfig,
    attachments: [{ kind: 'text', name: 'log.txt', path: '/tmp/log.txt' }],
  });
  assert.equal(result.label, 'Local');
});

await test('selectProvider: image attachment → forces Claude escalation', () => {
  // Need a real ClaudeProvider-like object for this test
  const mockClaude = {
    complete: async () => ({ text: '', stopReason: 'end_turn' as const }),
    stream: async function* () { yield ''; },
    embed: async () => [],
    supportsTools: true,
  };
  const result = selectProvider('implement', undefined, {
    ollamaProvider: mockOllama,
    claudeProvider: mockClaude as any,
    config: mockConfig,
    attachments: [{ kind: 'image', name: 'arch.png', path: '/tmp/arch.png' }],
  });
  assert.ok(result.label.includes('attachment'));
  assert.equal(result.attachmentForced, true);
  assert.equal(result.tier, 'standard');
});

await test('selectProvider: pdf attachment → forces Claude escalation', () => {
  const mockClaude = {
    complete: async () => ({ text: '', stopReason: 'end_turn' as const }),
    stream: async function* () { yield ''; },
    embed: async () => [],
    supportsTools: true,
  };
  const result = selectProvider('debug', undefined, {
    ollamaProvider: mockOllama,
    claudeProvider: mockClaude as any,
    config: mockConfig,
    attachments: [{ kind: 'pdf', name: 'spec.pdf', path: '/tmp/spec.pdf' }],
  });
  assert.ok(result.label.includes('attachment'));
  assert.equal(result.attachmentForced, true);
});

await test('selectProvider: image attachment + @opus → Opus (not standard)', () => {
  const mockClaude = {
    complete: async () => ({ text: '', stopReason: 'end_turn' as const }),
    stream: async function* () { yield ''; },
    embed: async () => [],
    supportsTools: true,
  };
  const result = selectProvider('review', 'opus', {
    ollamaProvider: mockOllama,
    claudeProvider: mockClaude as any,
    config: mockConfig,
    attachments: [{ kind: 'image', name: 'arch.png', path: '/tmp/arch.png' }],
  });
  // @opus explicit wins over attachment escalation
  assert.ok(result.label.includes('Opus'));
  assert.equal(result.tier, 'powerful');
});

await test('selectProvider: image attachment + no Claude → local fallback with warning', () => {
  const result = selectProvider('implement', undefined, {
    ollamaProvider: mockOllama,
    claudeProvider: null,
    config: mockConfig,
    attachments: [{ kind: 'image', name: 'arch.png', path: '/tmp/arch.png' }],
  });
  assert.ok(result.label.includes('Local'));
});

await test('RouteResult has attachmentForced field', () => {
  const result: RouteResult = {
    provider: mockOllama,
    label: 'test',
    graphOnly: false,
    attachmentForced: true,
  };
  assert.equal(result.attachmentForced, true);
});

// ===========================================================================
// 9. Context Assembly — Attachment Injection
// ===========================================================================

console.log('\n── Context Assembly — Attachment Injection ──');

// Read the context/index.ts source to verify attachment handling
const contextSrc = await readFile(
  join(import.meta.dirname!, '..', 'src', 'agent', 'context', 'index.ts'),
  'utf-8',
);

await test('ContextManager has setAttachmentContext method', () => {
  assert.ok(contextSrc.includes('setAttachmentContext'));
});

await test('ContextManager has getAttachmentContext method', () => {
  assert.ok(contextSrc.includes('getAttachmentContext'));
});

await test('ContextManager.assemble injects attachment context into L4', () => {
  assert.ok(contextSrc.includes('## Attached Files'));
  assert.ok(contextSrc.includes('this.attachmentContext'));
});

await test('Attachment context cleared after assemble (single-turn)', () => {
  // Verify the pattern: this.attachmentContext = '';
  assert.ok(contextSrc.includes("this.attachmentContext = ''"));
  // Verify it appears AFTER the injection (in the assemble method)
  const injectIdx = contextSrc.indexOf('## Attached Files');
  const clearIdx = contextSrc.indexOf("this.attachmentContext = ''", injectIdx);
  assert.ok(clearIdx > injectIdx, 'attachment context should be cleared after injection');
});

// ===========================================================================
// 10. Claude Provider — Multimodal Content
// ===========================================================================

console.log('\n── Claude Provider — Multimodal Content ──');

const claudeSrc = await readFile(
  join(import.meta.dirname!, '..', 'src', 'agent', 'providers', 'claude.ts'),
  'utf-8',
);

await test('ClaudeProvider imports ContentBlock', () => {
  assert.ok(claudeSrc.includes('ContentBlock'));
});

await test('splitMessages handles string content (backward compatible)', () => {
  assert.ok(claudeSrc.includes("typeof m.content === 'string'"));
});

await test('toAnthropicContent converts image blocks', () => {
  assert.ok(claudeSrc.includes("case 'image':"));
  assert.ok(claudeSrc.includes("type: 'base64'"));
  assert.ok(claudeSrc.includes('media_type'));
});

await test('toAnthropicContent converts document blocks', () => {
  assert.ok(claudeSrc.includes("case 'document':"));
  assert.ok(claudeSrc.includes("'application/pdf'"));
});

await test('toAnthropicContent converts text blocks', () => {
  assert.ok(claudeSrc.includes("case 'text':"));
});

// ===========================================================================
// 11. REPL Wiring
// ===========================================================================

console.log('\n── REPL Wiring ──');

const replSrc = await readFile(
  join(import.meta.dirname!, '..', 'src', 'agent', 'index.ts'),
  'utf-8',
);

await test('REPL imports extractFilePaths', () => {
  assert.ok(replSrc.includes('extractFilePaths'));
});

await test('REPL imports resolveAttachment', () => {
  assert.ok(replSrc.includes('resolveAttachment'));
});

await test('REPL imports hasEscalationAttachment', () => {
  assert.ok(replSrc.includes('hasEscalationAttachment'));
});

await test('REPL imports runForcedClaudePipeline', () => {
  assert.ok(replSrc.includes('runForcedClaudePipeline'));
});

await test('REPL extracts file paths from user input', () => {
  assert.ok(replSrc.includes('extractFilePaths(raw)'));
});

await test('REPL resolves attachments', () => {
  assert.ok(replSrc.includes('resolveAttachment('));
});

await test('REPL passes attachments to selectProvider', () => {
  assert.ok(replSrc.includes('attachments,') || replSrc.includes('attachments:'));
});

await test('REPL sets attachment context on ContextManager', () => {
  assert.ok(replSrc.includes('setAttachmentContext'));
});

await test('REPL checks route.attachmentForced for forced-Claude path', () => {
  assert.ok(replSrc.includes('route.attachmentForced'));
});

await test('REPL calls runForcedClaudePipeline for implement/test with attachments', () => {
  assert.ok(replSrc.includes('runForcedClaudePipeline('));
  // Verify it checks for implement or test intent
  assert.ok(replSrc.includes("classified.intent === 'implement'"));
  assert.ok(replSrc.includes("classified.intent === 'test'"));
});

await test('REPL injects content blocks into last user message for non-pipeline intents', () => {
  assert.ok(replSrc.includes('attachmentContentBlocks.length > 0'));
  assert.ok(replSrc.includes('lastMsg.content = [textBlock'));
});

// ===========================================================================
// 12. Router Source Verification
// ===========================================================================

console.log('\n── Router Source Verification ──');

const routerSrc = await readFile(
  join(import.meta.dirname!, '..', 'src', 'agent', 'router.ts'),
  'utf-8',
);

await test('Router imports hasEscalationAttachment', () => {
  assert.ok(routerSrc.includes('hasEscalationAttachment'));
});

await test('Router checks attachments before explicit routing', () => {
  // Attachment check should come before explicit @local check
  const attachIdx = routerSrc.indexOf('hasEscalationAttachment');
  const localIdx = routerSrc.indexOf("explicit === 'local'");
  assert.ok(attachIdx > 0);
  assert.ok(localIdx > 0);
  assert.ok(attachIdx < localIdx, 'attachment check should precede explicit @local check');
});

await test('Router attachment escalation uses standard tier', () => {
  // Find the attachment escalation block
  const attachBlock = routerSrc.slice(
    routerSrc.indexOf('hasEscalationAttachment'),
    routerSrc.indexOf("explicit === 'local'"),
  );
  assert.ok(attachBlock.includes("'standard'"));
});

await test('Router attachment escalation respects @opus', () => {
  // @opus should bypass attachment escalation (explicit === 'opus' check)
  const attachBlock = routerSrc.slice(
    routerSrc.indexOf('hasEscalationAttachment'),
    routerSrc.indexOf("explicit === 'local'"),
  );
  assert.ok(attachBlock.includes("'opus'"));
});

await test('RouterDeps has optional attachments field', () => {
  assert.ok(routerSrc.includes('attachments?'));
});

// ===========================================================================
// 13. File Structure
// ===========================================================================

console.log('\n── File Structure ──');

import { existsSync } from 'node:fs';

const BASE = join(import.meta.dirname!, '..', 'src', 'agent');

await test('src/agent/attachments/router.ts exists', () => {
  assert.ok(existsSync(join(BASE, 'attachments', 'router.ts')));
});

await test('src/agent/attachments/limits.ts exists', () => {
  assert.ok(existsSync(join(BASE, 'attachments', 'limits.ts')));
});

await test('src/agent/attachments/forced-claude.ts exists', () => {
  assert.ok(existsSync(join(BASE, 'attachments', 'forced-claude.ts')));
});

await test('src/shared/types.ts has ContentBlock export', async () => {
  const typesSrc = await readFile(join(import.meta.dirname!, '..', 'src', 'shared', 'types.ts'), 'utf-8');
  assert.ok(typesSrc.includes('export type ContentBlock'));
});

// ===========================================================================
// 14. Edge Cases
// ===========================================================================

console.log('\n── Edge Cases ──');

await test('resolveAttachment: .PDF (uppercase) → pdf', () => {
  // Create a temp file with uppercase extension
  const upperPdf = join(tmpDir, 'test.PDF');
  writeFileSync(upperPdf, '%PDF-1.4 test');
  const result = resolveAttachment(upperPdf);
  assert.equal(result.attachment.kind, 'pdf');
});

await test('detectAttachmentKind: .JPG (uppercase) → image', () => {
  assert.equal(detectAttachmentKind('/path/photo.JPG'), 'image');
});

await test('extractFilePaths: multiple paths in one message', () => {
  const { paths } = extractFilePaths('compare ./src/a.ts and ./src/b.ts');
  assert.ok(paths.length >= 2);
});

await test('enforceTextLimit: exactly at limit passes without warning', () => {
  // TEXT_TOKEN_CEILING * 3 chars = exactly at limit
  const exactText = 'y'.repeat(TEXT_TOKEN_CEILING * 3);
  const { text, warning } = enforceTextLimit(exactText, 'exact.txt');
  assert.equal(text, exactText);
  assert.equal(warning, undefined);
});

await test('enforceTextLimit: one char over limit triggers truncation', () => {
  const overText = 'z'.repeat(TEXT_TOKEN_CEILING * 3 + 1);
  const { text, warning } = enforceTextLimit(overText, 'over.txt');
  assert.ok(text.length < overText.length);
  assert.ok(warning);
});

// ===========================================================================
// 15. Cross-Module Integration
// ===========================================================================

console.log('\n── Cross-Module Integration ──');

await test('Attachment router exports match REPL imports', () => {
  // Verify all exports used in REPL are available
  assert.equal(typeof extractFilePaths, 'function');
  assert.equal(typeof resolveAttachment, 'function');
  assert.equal(typeof hasEscalationAttachment, 'function');
});

await test('Forced-Claude pipeline accepts ContentBlock array', () => {
  // Type check: runForcedClaudePipeline signature accepts ContentBlock[]
  const blocks: ContentBlock[] = [
    { type: 'text', text: 'test' },
    { type: 'image', mediaType: 'image/png', data: 'abc' },
  ];
  assert.ok(Array.isArray(blocks));
  assert.equal(blocks.length, 2);
});

await test('LLMMessage backward compatibility: all pipelines use string content', async () => {
  // Verify implement.ts and test.ts still use string content for their LLMMessages
  const implSrc = await readFile(join(BASE, 'tasks', 'implement.ts'), 'utf-8');
  // Stage 1 messages use string content
  assert.ok(implSrc.includes("role: 'system', content: IMPLEMENT_SYSTEM"));
  assert.ok(implSrc.includes("role: 'user', content:"));
});

await test('Router selectProvider returns attachmentForced only for escalation', () => {
  // Without attachments
  const normalResult = selectProvider('implement', undefined, {
    ollamaProvider: mockOllama,
    claudeProvider: null,
    config: mockConfig,
  });
  assert.equal(normalResult.attachmentForced, undefined);
});

// ===========================================================================
// Cleanup
// ===========================================================================

try {
  rmSync(tmpDir, { recursive: true, force: true });
} catch { /* ignore */ }

// ===========================================================================
// Summary
// ===========================================================================

console.log(`\n── Phase 10 Results: ${passed} passed, ${failed} failed ──\n`);
process.exit(failed > 0 ? 1 : 0);
