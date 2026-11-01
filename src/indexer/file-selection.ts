/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Epic c2ba6fa6 s1/t7 — which files the code graph holds. ONE rule, applied by
 * the full index when it picks the files to index and by the cross-file pass
 * when it classes a relationship that awaits a file that is not stored.
 *
 * A file is code when a parser handles its extension or basename, it is not
 * generated or minified, and the artifact parser would not skip it (a lock
 * file, or a document over its size limit), and the repository's FileFilter
 * includes it (Story s6).
 */

import { readFileSync, statSync } from 'node:fs';
import { basename } from 'node:path';

import { getParser } from './parser/registry.js';
import { artifactParser, basenameParser, MAX_SIZE, SKIP_BASENAMES } from './parser/artifact.js';
import type { FileFilter } from './file-filter.js';

export type FileSelection = 'selected' | 'not-code' | 'excluded-by-ignore';

/**
 * Skip patterns for generated / minified files. These have a parser
 * (e.g. tree-sitter-typescript handles `.mjs`) but indexing them is
 * unhelpful and pathologically expensive: a 1.5MB minified file
 * produces thousands of fake-looking entities, each ~8KB long, and
 * embedding 2548 entities × 16/batch × ~99s/batch on Ollama runs to
 * 4+ hours per file. Better to drop them here than burn the daemon
 * for an entire afternoon on a build artifact the user didn't want
 * indexed in the first place. Tested against:
 *
 *   `pdf.worker.min.mjs`        -> match (.min.mjs)
 *   `vendor.bundle.js`          -> match (.bundle.js)
 *   `react.production.min.js`   -> match (.min.js)
 *   `chunk-AB12CD.js`           -> no match (kept)
 *   `Component.test.ts`         -> no match (kept)
 */
const GENERATED_FILE_PATTERN = /\.(min|bundle|dist|production|prod)\.(js|mjs|cjs|css|html|json)$|[-_]min\.(js|mjs|cjs|css)$/i;

/**
 * Whether the full index takes `filePath`: 'not-code' when no parser handles
 * it, it is generated or minified, or the artifact parser skips it (a lock
 * file, or longer than its size limit); otherwise 'excluded-by-ignore' when
 * the repository's FileFilter leaves it out (Epic c2ba6fa6 s6: the one rule);
 * otherwise 'selected'.
 */
export function selectFile(filePath: string, filter: FileFilter): FileSelection {
  const parser = getParser(filePath) ?? (basenameParser.handles(filePath) ? basenameParser : null);
  if (parser === null) return 'not-code';
  if (GENERATED_FILE_PATTERN.test(filePath)) return 'not-code';
  if ((parser === artifactParser || parser === basenameParser) && artifactSkips(filePath)) return 'not-code';
  if (!filter.includes(filePath)) return 'excluded-by-ignore';
  return 'selected';
}

/** The artifact parser's skip rules: a lock file, or a source longer than MAX_SIZE
 *  characters. A file is read only when its byte size is over the limit (a file
 *  never has more characters than bytes); one that cannot be read is not skipped. */
function artifactSkips(filePath: string): boolean {
  if (SKIP_BASENAMES.has(basename(filePath))) return true;
  const size = statSync(filePath, { throwIfNoEntry: false })?.size;
  if (size === undefined || size <= MAX_SIZE) return false;
  try {
    return readFileSync(filePath, 'utf8').length > MAX_SIZE;
  } catch {
    return false;
  }
}
