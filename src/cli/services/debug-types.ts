/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * sc1 — the Debug pane section-hosting shape + DebugService facade contract.
 *
 * Type-level only (Story s1 scaffold). These are the single stable seam the
 * four Debug-section stories (s2-s5) build against: the DebugPane hosts the
 * inner sections and the `debug` facade (added to `makeServices`) carries the
 * ordered section registry now and each section's read methods later.
 *
 * `DebugSection` is deliberately metadata-only (`id` + `title`) — the section's
 * React view is mapped `id -> component` inside the DebugPane (in `panes/`), so
 * no React type leaks into the services layer.
 */

import type { AttachedClient, RegisteredRepo } from '../../shared/types.js';

/** The closed union of the three Debug-pane inner sections, in authored order. */
export type DebugSectionId = 'daemon' | 'mcp' | 'logs';

/** A section's tab-strip metadata. Metadata only — the view is wired in the pane. */
export interface DebugSection {
	readonly id: DebugSectionId;
	readonly title: string;
}

/**
 * The `debug` facade added to the top-level `Services` object. For s1 it holds
 * just the ordered `sections` registry; s2-s5 augment this interface with their
 * own read methods (status card, orphan scan/kill, debug-status clients, log tail).
 */
export interface DebugService {
	readonly sections: readonly DebugSection[];
	/** Daemon-section status card (Story s2): daemon.status over IPC + client-known
	 *  fields, folded into a discriminated reachable/unreachable view-model. */
	daemonStatus(): Promise<DaemonCardModel>;
	/** Orphan daemon-process scan (Story s3): a POSIX-only, read-only `ps`
	 *  recommendation of stray daemon-entry processes (the managed daemon excluded).
	 *  Synchronous — a one-shot scan on mount / explicit refresh, never a poll (lc1). */
	scanOrphans(): OrphanScanResult;
	/** Terminate the EXPLICITLY-selected orphan pids (Story s3): the single guarded
	 *  mutating action in the whole pane (k2). SIGTERM → wait → SIGKILL-for-survivors,
	 *  the managed pid re-excluded (k5); returns one outcome per input pid. */
	killOrphans(pids: readonly number[]): Promise<KillOutcome[]>;
	/** Attached-socket-client list (Story s4): reads the daemon.debug-status IPC
	 *  and folds it into a discriminated reachable/unreachable model. Read-only. */
	attachedClients(): Promise<DebugStatusModel>;
	/** Per-MCP-client registration/connection status (Story s4): a client-side
	 *  `<cli> mcp list` parse per claude/codex. Read-only; daemon-independent. */
	mcpStatus(): Promise<readonly McpClientStatus[]>;
}

/** The DebugPane's props: a narrowed view of `Services` exposing only `debug`. */
export interface DebugPaneProps {
	readonly services: { readonly debug: DebugService };
}

/**
 * The Daemon-section status-card view-model (Story s2). A discriminated union
 * so `reachable` gates every running field — the unreachable variant carries
 * NO stale/blank fields. Structured data only (no display formatting / React);
 * the DaemonSection component owns presentation.
 *
 * Daemon-held fields (uptimeSec, repoCount, repos+index-state) come over the
 * daemon.status IPC; socket/pid/version are client-known reads (best-effort).
 */
export type DaemonCardModel =
	| {
			readonly reachable: true;
			readonly uptimeSec: number;
			readonly repoCount: number;
			readonly repos: readonly { readonly name: string; readonly status: RegisteredRepo['status'] }[];
			readonly socket: string;
			readonly pid?: number | undefined;
			readonly version?: string | undefined;
	  }
	| { readonly reachable: false };

/**
 * Orphan-scan result (Story s3). Discriminated on `supported` so the non-POSIX
 * degrade (ac3) is a first-class variant the DaemonSection renders with no
 * platform logic of its own. Structured data only — the pane owns presentation.
 */
export type OrphanScanResult =
	| { readonly supported: true; readonly orphans: readonly OrphanProcess[] }
	| { readonly supported: false };

/** One scanned orphan candidate: its pid + the `ps` command line (for review). */
export interface OrphanProcess {
	readonly pid: number;
	readonly command: string;
}

/**
 * Per-pid kill result (Story s3): 'terminated' (died on SIGTERM), 'forced'
 * (survived to SIGKILL), 'not-found' (already gone / the managed pid, skipped),
 * 'error' (the signal threw, e.g. EPERM). Lets the UI report what happened to
 * each selected process.
 */
export interface KillOutcome {
	readonly pid: number;
	readonly result: 'terminated' | 'forced' | 'not-found' | 'error';
}

/**
 * The MCP-section attached-client view-model (Story s4). A discriminated union
 * (mirroring DaemonCardModel): `reachable` gates the client list so the
 * unreachable variant carries no stale data. `clients` are the daemon's live
 * socket connections (label/pid/connected-at) read over the daemon.debug-status
 * IPC. Structured data only — the MCPSection component owns presentation.
 */
export type DebugStatusModel =
	| { readonly reachable: true; readonly clients: readonly AttachedClient[] }
	| { readonly reachable: false };

/**
 * One MCP client's registration/connection status (Story s4), derived from a
 * client-side `<cli> mcp list` parse. `available` = the CLI is on PATH and the
 * listing succeeded; `registered` = an `insrc` server line is present;
 * `connected` = that line reports a live connection. Independent of daemon
 * reachability. One entry per known client (claude, codex); never omitted.
 */
export interface McpClientStatus {
	readonly client: 'claude' | 'codex';
	readonly available: boolean;
	readonly registered: boolean;
	readonly connected: boolean;
}
