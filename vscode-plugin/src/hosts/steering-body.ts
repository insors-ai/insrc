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
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolve the bundled `assets/steering-block.md`. The module can run from two
 * different layouts — the dev/test source tree (`src/hosts/steering-body.ts`,
 * two levels below the package root) and the esbuild bundle
 * (`out/extension.js`, one level below the extension root) — so a fixed number
 * of `..` hops does not serve both. Walk up from this module's directory to the
 * first ancestor that actually holds `assets/steering-block.md`; fall back to the
 * source-layout path so a genuinely-missing asset still throws a clear error.
 */
function bundledSteeringPath(): string {
  const start = dirname(fileURLToPath(import.meta.url));
  let dir = start;
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, 'assets', 'steering-block.md');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(start, '..', '..', 'assets', 'steering-block.md');
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
