/**
 * The model that proposes document relationships (Epic c2ba6fa6 s10): the mid
 * tier, reached only through a CLI provider (ac4, k3, k9).
 *
 * The role 'indexer.docRelations' is peripheral with default tier 'mid', and a
 * role override may assign it another tier. The capability runs only on the
 * mid tier, so the selection refuses any other assignment rather than follow
 * it -- the router's general precedence is not changed. It checks the
 * assignment with the pure resolveRole (per-repo and global roleTiers
 * included), then, under a routing context, that the router resolved the same
 * mid assignment; on a thread with no routing context (the summary worker) it
 * builds the provider from that resolution. In both it requires a family with
 * a CLI kind and a model the definitions list for it. A refusal carries the
 * reason the status shows; nothing is called.
 *
 * Failures of a call: every error the provider call throws -- whatever its
 * shape: a CLI exit, a stall, an error event or envelope turned into an Error,
 * a structured-output retry that gave up -- is a provider failure; only a
 * value the provider did return that fails the pass's own shape check is a
 * per-document failure (DocRelationsOutputInvalid).
 */

import type { AnalyzeConfig } from '../config/analyze.js';
import type { LLMProvider } from '../shared/types.js';
import type { ModelRegistry } from '../daemon/model-registry.js';
import { getModelRegistry } from '../daemon/model-registry.js';
import { resolveRole } from '../analyze/context/role-router.js';
import { currentRoutingContext, familyProvider } from '../analyze/context/shaper-provider.js';

export const DOC_RELATIONS_ROLE = 'indexer.docRelations';

export type DocRelationsSelection =
	| { readonly ok: true; readonly provider: LLMProvider; readonly modelId: string }
	| { readonly ok: false; readonly reason: string };

/** The mid-tier CLI provider for the repository's document-relations pass, or why there is none. */
export function selectDocRelationsProvider(
	cfg:      AnalyzeConfig,
	repoPath: string,
	deps:     { readonly registry?: ModelRegistry | undefined } = {},
): DocRelationsSelection {
	const registry = deps.registry ?? getModelRegistry();
	try {
		const resolution = resolveRole(DOC_RELATIONS_ROLE, cfg, repoPath, { registry });
		if (resolution.tier !== 'mid') {
			return { ok: false, reason: `${DOC_RELATIONS_ROLE} is assigned to tier ${resolution.tier}; this capability runs only on the mid tier` };
		}
		const family = resolution.runner;
		if (registry.cliKind(family) === undefined) {
			return { ok: false, reason: `the mid tier runs ${family}, which is not a CLI provider` };
		}
		const model = registry.find(family, resolution.model);
		if (model === undefined) {
			return { ok: false, reason: `the mid tier names no model the definitions list for ${family} ('${resolution.model}')` };
		}
		const ctx = currentRoutingContext();
		if (ctx !== undefined) {
			const routed = ctx.router.resolveProviderForRole(DOC_RELATIONS_ROLE, cfg, ctx.repoPath ?? repoPath);
			if (routed.resolution.tier !== 'mid' || routed.resolution.runner !== family || routed.resolution.model !== resolution.model) {
				return { ok: false, reason: `the router resolved ${DOC_RELATIONS_ROLE} to tier ${routed.resolution.tier} (${routed.resolution.runner}); this capability runs only on the mid tier` };
			}
			return { ok: true, provider: routed.provider, modelId: model.id };
		}
		return { ok: true, provider: familyProvider(registry, family, model, { effort: resolution.effort }), modelId: model.id };
	} catch (err) {
		return { ok: false, reason: failureMessage(err) };
	}
}

/** A value the provider returned that is not a set of proposals. */
export class DocRelationsOutputInvalid extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DocRelationsOutputInvalid';
	}
}

/** Whether a failure of one document's examination is the provider's (stop, retry later) or that document's output. */
export function classifyDocRelationsFailure(err: unknown): 'provider' | 'output' {
	return err instanceof DocRelationsOutputInvalid ? 'output' : 'provider';
}

/** The error's message followed by each cause's, as the status shows a provider failure. */
export function failureMessage(err: unknown): string {
	const parts: string[] = [];
	const seen = new Set<unknown>();
	for (let e: unknown = err; e !== undefined && e !== null && !seen.has(e); e = (e as { cause?: unknown }).cause) {
		seen.add(e);
		const text = e instanceof Error ? e.message : String(e);
		if (text !== '' && !parts.includes(text)) parts.push(text);
		if (!(e instanceof Error)) break;
	}
	return parts.join(': ') || 'unknown provider failure';
}
