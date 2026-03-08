import { Ollama } from 'ollama';
import { sessionPrune } from './tools/mcp-client.js';

const AGENT_MODEL = 'qwen3-coder:latest';

/**
 * Ensure the agent model is installed in Ollama. Pulls if missing.
 * The embedding model is handled separately by the daemon lifecycle.
 */
export async function ensureAgentModel(
  host: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const ollama = new Ollama({ host });

  const { models } = await ollama.list();
  const installed = models.some(
    m => m.name === AGENT_MODEL || m.name.startsWith('qwen3-coder'),
  );
  if (installed) return;

  console.log(`[agent] pulling ${AGENT_MODEL}...`);
  const stream = await ollama.pull({ model: AGENT_MODEL, stream: true });
  for await (const event of stream) {
    if (event.total && event.completed) {
      const pct = Math.round((event.completed / event.total) * 100);
      onProgress?.(pct);
    }
  }
  console.log(`[agent] ${AGENT_MODEL} ready`);
}

// ---------------------------------------------------------------------------
// Session pruning job
//
// Deletes expired session summaries (30-day TTL) and caps at 20 per repo.
// Plan/PlanStep nodes are NOT affected — they live in Kuzu only and are
// pruned only via explicit /plan delete.
//
// Called by the daemon's nightly maintenance job (setInterval in daemon/index.ts).
// Also exposed for the agent to trigger on session start as a best-effort cleanup.
// ---------------------------------------------------------------------------

/**
 * Trigger the pruning job via daemon RPC.
 * Returns counts of expired and capped session summaries deleted.
 */
export async function runPruningJob(): Promise<{ expired: number; capped: number }> {
  return sessionPrune();
}
