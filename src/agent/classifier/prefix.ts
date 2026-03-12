import type { ExplicitProvider, Intent } from '../../shared/types.js';

// ---------------------------------------------------------------------------
// All recognized intents for the /intent override
// ---------------------------------------------------------------------------

const VALID_INTENTS = new Set<Intent>([
  'implement', 'refactor', 'test', 'debug', 'review',
  'document', 'research', 'graph', 'plan', 'requirements', 'design',
  'deploy', 'release', 'infra',
]);

// ---------------------------------------------------------------------------
// Parsed result
// ---------------------------------------------------------------------------

export interface PrefixResult {
  /** Explicit provider override (@claude, @opus, @local) */
  explicit?: ExplicitProvider | undefined;
  /** Explicit intent override (/intent <name>) */
  intentOverride?: Intent | undefined;
  /** Message body with all prefixes stripped */
  message: string;
}

/**
 * Parse prefix overrides from a raw user message.
 *
 * Supports:
 *   /intent <name> [@provider] <message>
 *   @claude <message>
 *   @opus <message>
 *   @local <message>
 *
 * Parse order: /intent first, then @provider, then remaining is message.
 * Both can coexist: `/intent debug @claude why is this slow?`
 */
export function parsePrefix(raw: string): PrefixResult {
  let remaining = raw.trim();
  let explicit: ExplicitProvider | undefined;
  let intentOverride: Intent | undefined;

  // 1. Check for /intent <name> prefix
  const intentMatch = remaining.match(/^\/intent\s+(\S+)\s*/);
  if (intentMatch) {
    const candidate = intentMatch[1]!.toLowerCase();
    if (VALID_INTENTS.has(candidate as Intent)) {
      intentOverride = candidate as Intent;
      remaining = remaining.slice(intentMatch[0].length);
    }
  }

  // 2. Check for @provider prefix
  if (remaining.startsWith('@claude ')) {
    explicit = 'claude';
    remaining = remaining.slice(8);
  } else if (remaining.startsWith('@opus ')) {
    explicit = 'opus';
    remaining = remaining.slice(6);
  } else if (remaining.startsWith('@local ')) {
    explicit = 'local';
    remaining = remaining.slice(7);
  }

  return {
    explicit,
    intentOverride,
    message: remaining.trim(),
  };
}
