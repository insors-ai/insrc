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

import type { RegisteredRepo } from '../../shared/types.js';

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
