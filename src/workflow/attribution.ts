/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Model-attribution helpers (Epic per-role-per-step, S004 — sc5).
 *
 * The scalar `meta.model` is retired in favour of the per-output
 * `meta.attribution.outputs[]` aggregate. These pure helpers give every reader a
 * SINGLE uniform view regardless of which era an artifact was written in:
 *
 *   - `attributionOf(meta)` → the per-output stamps. New artifacts return their
 *     stored `attribution.outputs`; legacy artifacts (scalar `model`, no
 *     `attribution`) get a read-time-only single-element shim; a pre-attribution
 *     artifact with neither field returns `[]` (never a fabricated model).
 *   - `modelSummary(meta)` → a single human label for the ~few readers that want
 *     one line (CLI, IPC done-frame): the sole `runner:model` when the run was
 *     homogeneous, else a `mixed(...)` summary; legacy artifacts show their
 *     original scalar label unchanged.
 *
 * No stored migration — on-disk legacy artifacts are never rewritten. `model` is
 * read here through a widened accessor because the field is `@deprecated`
 * OPTIONAL on the type (writers no longer set it).
 */

import type { ArtifactMetaBase, ArtifactModelAttribution, OutputModelStamp } from './types.js';

/** Best-effort map a run-wide scalar model label
 *  (`client` | `ollama:<m>` | `claude` | `codex` | …) onto a runner + model for
 *  a single synthesized stamp. `role` is a placeholder note — `(legacy)` for the
 *  read-shim on old artifacts, `(client)` for the MCP client-driven write path.
 *  Fidelity is approximate by design. */
function labelStamp(label: string, role: string): OutputModelStamp {
	if (label.startsWith('ollama:')) return { role, tier: 'core', runner: 'ollama', model: label.slice('ollama:'.length) };
	if (label === 'ollama')          return { role, tier: 'core', runner: 'ollama', model: 'ollama' };
	if (label === 'codex' || label.startsWith('codex')) return { role, tier: 'core', runner: 'cli-codex', model: label };
	// 'client' (outer MCP client drove) / 'claude' / anything else → treat as a
	// claude-CLI-family label; the raw label is preserved in `model`.
	return { role, tier: 'core', runner: 'cli-claude', model: label };
}

/**
 * Build a single-element attribution from one run-wide label — used by the
 * MCP client-driven path (`insrc_workflow_step`), where the OUTER client
 * (Claude Code / Codex) drove every step and no per-step RoleRouter resolution
 * exists, so the whole run is honestly one model. The daemon runner instead
 * passes a real per-output aggregate.
 */
export function singleModelAttribution(label: string): ArtifactModelAttribution {
	return { outputs: [labelStamp(label, '(client)')] };
}

/**
 * The uniform per-output view. Prefers a stored `attribution.outputs`; falls
 * back to a single shim stamp synthesized from a legacy scalar `model`; returns
 * `[]` when neither is present (honestly unattributed — no fabricated model).
 * When BOTH are present the aggregate wins (the richer record; the stale scalar
 * is ignored — no dual-source reconciliation).
 */
export function attributionOf(meta: ArtifactMetaBase): readonly OutputModelStamp[] {
	const outputs = meta.attribution?.outputs;
	if (outputs !== undefined && outputs.length > 0) return outputs;
	// Empty stored aggregate on a NEW artifact is authoritative (zero-output run).
	if (meta.attribution !== undefined) return outputs ?? [];
	const legacy = meta.model;
	if (typeof legacy === 'string' && legacy.length > 0) return [labelStamp(legacy, '(legacy)')];
	return [];
}

/**
 * A single human-readable label for readers that want one line. Homogeneous runs
 * collapse to `runner:model`; heterogeneous runs render `mixed(n: a, b, …)`;
 * legacy artifacts show their original scalar label unchanged; a fully
 * unattributed artifact reads `unknown`.
 */
export function modelSummary(meta: ArtifactMetaBase): string {
	if (meta.attribution !== undefined) {
		const uniq = [...new Set(meta.attribution.outputs.map(o => `${o.runner}:${o.model}`))];
		if (uniq.length === 0) return 'none';
		if (uniq.length === 1) return uniq[0]!;
		const head = uniq.slice(0, 3).join(', ');
		return `mixed(${uniq.length}: ${head}${uniq.length > 3 ? ', …' : ''})`;
	}
	return meta.model ?? 'unknown';
}
