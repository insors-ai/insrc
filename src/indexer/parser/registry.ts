import { extname } from 'node:path';
import type { Language } from '../../shared/types.js';
import { getLogger } from '../../shared/logger.js';
import type { CodeParser } from './base.js';

const log = getLogger('parser:registry');

const parsers: CodeParser[] = [];

/** A reader whose grammar could not be loaded on this machine (Epic c2ba6fa6 s9). */
interface UnavailableReader {
  readonly language:   Language;
  readonly extensions: readonly string[];
  readonly reason:     string;
}
const unavailable: UnavailableReader[] = [];

/** Register a parser. Call this once per language module at startup. */
export function registerParser(parser: CodeParser): void {
  parsers.push(parser);
}

/**
 * Record a reader that could not be loaded (its grammar's native binding
 * failed to load): its files are not indexed, and the languages request says
 * so with the reason. Other readers are unaffected.
 */
export function registerUnavailableReader(language: Language, extensions: readonly string[], reason: string): void {
  unavailable.push({ language, extensions: [...extensions], reason });
}

/**
 * The guarded load every grammar-backed reader uses (Epic c2ba6fa6 s9): build
 * the reader and register it, or -- when loading its grammar throws -- log a
 * warning, record it unavailable with the error and return null. A grammar
 * that cannot load never stops another reader from registering.
 */
export function loadReader<P extends CodeParser>(language: Language, extensions: readonly string[], load: () => P): P | null {
  try {
    const parser = load();
    registerParser(parser);
    return parser;
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    log.warn({ language, err: reason }, `the ${language} reader failed to load; its files will not be indexed (other readers unaffected)`);
    registerUnavailableReader(language, extensions, reason);
    return null;
  }
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

/** One language the index reads, as the languages request lists it. */
export interface ReaderStatus {
  readonly language:   Language;
  readonly extensions: readonly string[];
  readonly available:  boolean;
  readonly reason?:    string;
}

/**
 * Every code and SQL language a reader is registered or recorded unavailable
 * for, with its extensions (Epic c2ba6fa6 s9, ac4). A reader that serves
 * several languages (TypeScript also reads JavaScript) is listed per language,
 * named by `languageOf`; documents and config files (language 'config') are
 * not listed.
 */
export function listReaders(languageOf: (ext: string) => Language | undefined = () => undefined): ReaderStatus[] {
  const byLanguage = new Map<Language, { extensions: string[]; available: boolean; reason?: string }>();
  for (const p of parsers) {
    for (const ext of p.extensions) {
      const language = languageOf(ext) ?? p.language;
      if (language === 'config') continue;
      const entry = byLanguage.get(language) ?? { extensions: [], available: true };
      entry.extensions.push(ext);
      byLanguage.set(language, entry);
    }
  }
  for (const u of unavailable) {
    if (byLanguage.has(u.language)) continue;
    byLanguage.set(u.language, { extensions: [...u.extensions], available: false, reason: u.reason });
  }
  return [...byLanguage.entries()]
    .map(([language, e]) => ({ language, extensions: e.extensions, available: e.available, ...(e.reason !== undefined && { reason: e.reason }) }))
    .sort((a, b) => a.language.localeCompare(b.language));
}
