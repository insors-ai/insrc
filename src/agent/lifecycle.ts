import { Ollama } from 'ollama';
import { sessionPrune } from './tools/mcp-client.js';
import { loadConfig } from './config.js';
import { getLogger } from '../shared/logger.js';

const log = getLogger('agent');

/**
 * Ensure the agent model is installed in Ollama. Pulls if missing.
 * The embedding model is handled separately by the daemon lifecycle.
 */
export async function ensureAgentModel(
  host: string,
  onProgress?: (pct: number) => void,
): Promise<void> {
  const config = loadConfig();
  const agentModel = config.models.local;
  const ollama = new Ollama({ host });

  const { models } = await ollama.list();
  const modelBase = agentModel.split(':')[0] ?? agentModel;
  const installed = models.some(
    m => m.name === agentModel || m.name.startsWith(modelBase),
  );
  if (installed) return;

  log.info(`pulling ${agentModel}...`);
  const stream = await ollama.pull({ model: agentModel, stream: true });
  for await (const event of stream) {
    if (event.total && event.completed) {
      const pct = Math.round((event.completed / event.total) * 100);
      onProgress?.(pct);
    }
  }
  log.info(`${agentModel} ready`);
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
