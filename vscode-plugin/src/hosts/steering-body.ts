/**
 * Story E20260921ad0d45c9:S003 / t1 — the bundled tracked-workflow steering body.
 *
 * Returns the extension-bundled copy of the backend's canonical
 * `src/prompts/steering-block.md` (synced into vscode-plugin/assets/ by the
 * `sync-assets` npm script — the S002 bundling pattern). This is the SAME block
 * the daemon steering-refresh (`src/daemon/steering-inject.ts`) and the JetBrains
 * plugin write, so there is one source of truth for the guidance and no
 * re-authored reasoning. It ships with the extension, so the steering block is
 * writable even before the daemon is installed (the mcp entry is not).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** assets/steering-block.md, resolved relative to this module (src/hosts or out/hosts → package root). */
function bundledSteeringPath(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'assets', 'steering-block.md');
}

/**
 * The trimmed canonical steering body. Throws when the bundled resource is
 * missing or empty (a packaging error — the sync step didn't run) so the caller
 * skips writing rather than clobbering the host's insrc section with nothing.
 */
export function defaultSteeringBody(): string {
  const body = readFileSync(bundledSteeringPath(), 'utf8').trim();
  if (body === '') {
    throw new Error('insrc: bundled steering block assets/steering-block.md is empty');
  }
  return body;
}
