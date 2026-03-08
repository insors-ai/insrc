import { reindexFile as rpcReindexFile } from '../tools/mcp-client.js';

// ---------------------------------------------------------------------------
// Re-index Handoff
//
// After the implement/refactor pipeline writes files to disk, send
// file-scoped re-index requests to the daemon so the knowledge graph
// stays fresh for subsequent context assembly.
//
// Non-blocking: prints a notice to the user but doesn't await completion.
// ---------------------------------------------------------------------------

/**
 * Request the daemon to re-index a set of files.
 *
 * Fires one RPC call per file. Each call enqueues a `file` job in the
 * daemon's IndexQueue — the watcher would normally pick this up, but
 * we send explicit requests for immediate processing.
 *
 * @param filePaths - Absolute paths to the files that were modified
 * @param log - Optional logger (defaults to console.log)
 */
export async function requestReindex(
  filePaths: string[],
  log: (msg: string) => void = console.log,
): Promise<void> {
  if (filePaths.length === 0) return;

  log(`  [reindex] requesting re-index for ${filePaths.length} file(s)`);

  // Fire all requests in parallel — non-blocking
  const results = await Promise.allSettled(
    filePaths.map(fp => rpcReindexFile(fp)),
  );

  const failed = results.filter(r => r.status === 'rejected').length;
  if (failed > 0) {
    log(`  [reindex] ${failed} file(s) failed to enqueue (daemon may be down)`);
  }
}
