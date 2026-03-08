/**
 * Ollama Fault Handler — mid-session detection and recovery.
 *
 * From design doc (Phase 12):
 *   - Not running at start → Claude-only mode with notice
 *   - Goes away mid-session → offer re-route to Claude for current turn
 *   - Model not pulled → print pull instruction + Claude fallback
 *   - OOM/crash (>30s timeout) → abort request, fall back to Claude for turn
 *
 * Integration: wraps Ollama errors into classified fault types,
 * enabling the REPL/CLI to make routing decisions.
 */

// ---------------------------------------------------------------------------
// Fault classification
// ---------------------------------------------------------------------------

export type OllamaFaultKind =
  | 'not_running'     // ECONNREFUSED / fetch failed
  | 'model_missing'   // model not found / 404
  | 'timeout'         // >30s, likely OOM or crash
  | 'unknown';        // other errors

export interface OllamaFault {
  kind: OllamaFaultKind;
  message: string;
  /** User-facing recovery instruction. */
  recovery: string;
  /** Whether Claude fallback is recommended. */
  suggestClaude: boolean;
}

/**
 * Classify an Ollama error into a fault type.
 */
export function classifyOllamaError(err: unknown): OllamaFault {
  const msg = err instanceof Error ? err.message : String(err);

  if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed') || msg.includes('Ollama is not running')) {
    return {
      kind: 'not_running',
      message: 'Ollama is not running.',
      recovery: 'Start Ollama with: ollama serve',
      suggestClaude: true,
    };
  }

  if (msg.includes('not found') || msg.includes('404') || msg.includes('Model not found')) {
    const modelMatch = msg.match(/pull (\S+)/);
    const model = modelMatch?.[1] ?? '<model>';
    return {
      kind: 'model_missing',
      message: `Model not found in Ollama.`,
      recovery: `Pull it with: ollama pull ${model}`,
      suggestClaude: true,
    };
  }

  if (msg.includes('timed out') || msg.includes('timeout') || msg.includes('ETIMEDOUT')) {
    return {
      kind: 'timeout',
      message: 'Ollama request timed out (possible OOM or crash).',
      recovery: 'Check Ollama logs. Restart with: ollama serve',
      suggestClaude: true,
    };
  }

  return {
    kind: 'unknown',
    message: msg,
    recovery: 'Check Ollama status.',
    suggestClaude: false,
  };
}

/**
 * Format an Ollama fault for user display.
 */
export function formatOllamaFault(fault: OllamaFault): string {
  const parts = [`[ollama] ${fault.message}`];
  parts.push(`  ${fault.recovery}`);
  if (fault.suggestClaude) {
    parts.push('  Falling back to Claude for this turn. Use @local to force local.');
  }
  return parts.join('\n');
}

/**
 * Check if an error is an Ollama connection error (not running / unreachable).
 */
export function isOllamaDown(err: unknown): boolean {
  const fault = classifyOllamaError(err);
  return fault.kind === 'not_running' || fault.kind === 'timeout';
}
