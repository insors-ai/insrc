/**
 * Story E20260922401ae5fb:S004 / t3 — the read-only DaemonDataGateway (sc9).
 *
 * The VS-Code-free facade the panel host + every consuming tab read through.
 * Each method maps a daemon read (over the shared sc1 rpc — daemon.status /
 * repo.list / daemon.debug-status) or a LOCAL read (the .insrc/artifacts tree,
 * the process table) into its View type. There is no cloud path and no new
 * daemon capability (k2/k3/ac4). A failed read rejects with GatewayReadError;
 * the gateway surfaces no UI — a consuming tab body catches it and renders an
 * error state.
 *
 * S004 wires ALL five methods here (alt a1: the gateway lives in one owner).
 * The rich tab bodies that CONSUME them are s5 (daemon/workflows) and s6 (debug).
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { DaemonStatus, RegisteredRepo, AttachedClient } from '../../../src/shared/types.js';
import {
  GatewayReadError,
  type DaemonDataGateway,
  type DaemonDataGatewayDeps,
  type DaemonStatusView,
  type McpClientView,
  type RepoRef,
  type WorkflowChainRow,
  type WorkflowChainView,
} from './types.js';

/** The raw `daemon.debug-status` payload: the attached socket clients (bare, no wrapper). */
interface DebugStatusPayload {
  readonly clients?: readonly AttachedClient[];
}

/** Coerce any thrown value into a GatewayReadError carrying its message. */
function asReadError(context: string, err: unknown): GatewayReadError {
  const message = err instanceof Error ? err.message : String(err);
  return new GatewayReadError(`${context}: ${message}`);
}

/**
 * Build the sc9 DaemonDataGateway over its injected data sources. Every method
 * is read-only; scanOrphans enumerates but never kills (the consent-gated kill
 * is s6, k4). Constructed in extension.ts from the shared client + a `.insrc`
 * artifacts resolver + a real process scan.
 */
export function createDaemonDataGateway(deps: DaemonDataGatewayDeps): DaemonDataGateway {
  const { rpc, artifactsRoot, processScan } = deps;

  return {
    async status(): Promise<DaemonStatusView> {
      try {
        const raw = await rpc<DaemonStatus>('daemon.status');
        // Minimal default Daemon-tab view (ac2); s5 enriches. `detail` is built
        // only from the fields the payload actually carries (optionals may be
        // absent). The mapping is inside the try so a malformed payload also
        // rejects GatewayReadError rather than a raw TypeError.
        const parts: string[] = [`uptime ${raw.uptime}s`, `${raw.repos.length} repos`, `queue ${raw.queueDepth}`];
        if (raw.embeddingsPending > 0) parts.push(`${raw.embeddingsPending} embeds pending`);
        if (raw.modelPullStatus !== undefined) parts.push(`model ${raw.modelPullStatus}`);
        return { state: 'running', detail: parts.join(' · ') };
      } catch (err) {
        throw asReadError('daemon.status failed', err);
      }
    },

    async registeredRepos(): Promise<readonly RepoRef[]> {
      let rows: RegisteredRepo[];
      try {
        rows = await rpc<RegisteredRepo[]>('repo.list');
      } catch (err) {
        throw asReadError('repo.list failed', err);
      }
      return (rows ?? []).map((r) => ({ path: r.path, name: r.name }));
    },

    async mcpClients(): Promise<readonly McpClientView[]> {
      let payload: DebugStatusPayload;
      try {
        payload = await rpc<DebugStatusPayload>('daemon.debug-status');
      } catch (err) {
        throw asReadError('daemon.debug-status failed', err);
      }
      // The raw IPC returns a bare { clients } — an attached client is a live
      // socket connection, so it is `wired`. s6 renders the richer per-MCP view.
      return (payload?.clients ?? []).map((c) => ({ host: c.label, wired: true }));
    },

    async workflowChain(): Promise<WorkflowChainView> {
      const root = artifactsRoot();
      if (root === undefined) return { rows: [] }; // absent artifacts is a valid empty state.
      let entries: string[];
      try {
        entries = await readdir(root);
      } catch (err) {
        // A missing directory is empty, not an error; anything else is a read failure.
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { rows: [] };
        throw asReadError('reading the artifacts directory failed', err);
      }
      const rows: WorkflowChainRow[] = [];
      for (const entry of entries) {
        if (!entry.endsWith('.json')) continue;
        let parsed: { meta?: { epicSlug?: string; approvedAt?: string } };
        try {
          parsed = JSON.parse(await readFile(join(root, entry), 'utf8')) as typeof parsed;
        } catch (err) {
          throw asReadError(`reading artifact ${entry} failed`, err);
        }
        rows.push({
          slug: parsed.meta?.epicSlug ?? entry.replace(/\.json$/, ''),
          stage: stageFromFilename(entry),
          status: parsed.meta?.approvedAt !== undefined ? 'approved' : 'pending',
        });
      }
      return { rows };
    },

    async scanOrphans() {
      try {
        return await processScan();
      } catch (err) {
        throw asReadError('the orphan-process scan failed', err);
      }
    },
  };
}

/** Derive the workflow stage from an artifact filename prefix (DEF/HLD/LLD/PLAN/BUILD/…). */
function stageFromFilename(name: string): string {
  const prefix = name.split('-', 1)[0] ?? '';
  return prefix.length > 0 ? prefix.toLowerCase() : 'artifact';
}
