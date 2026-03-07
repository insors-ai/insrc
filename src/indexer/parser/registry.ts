import { extname } from 'node:path';
import type { CodeParser } from './base.js';

const parsers: CodeParser[] = [];

/** Register a parser. Call this once per language module at startup. */
export function registerParser(parser: CodeParser): void {
  parsers.push(parser);
}

/** Return the parser for the given file path, or null if unsupported. */
export function getParser(filePath: string): CodeParser | null {
  const ext = extname(filePath).toLowerCase();
  return parsers.find(p => p.extensions.includes(ext)) ?? null;
}

/** All registered file extensions (for watcher ignore-list inversion). */
export function supportedExtensions(): string[] {
  return parsers.flatMap(p => p.extensions);
}
