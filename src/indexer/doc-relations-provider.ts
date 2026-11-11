/**
 * The model that proposes document relationships (Epic c2ba6fa6 s10).
 *
 * The role defaults to cheap, which supports local Ollama and CLI providers.
 * Explicit mid-tier CLI overrides remain supported. Check the effective
 * assignment and registered model before building the provider, and require
 * an existing routing context to agree with that selection.
 *
 * Failures of a call: every error the provider call throws -- whatever its
 * shape: a CLI exit, a stall, an error event or envelope turned into an Error,
 * a structured-output retry that gave up -- is a provider failure; only a
 * value the provider did return that fails the pass's own shape check is a
 * per-document failure (DocRelationsOutputInvalid).
 */

import type { AnalyzeConfig } from '../config/analyze.js';
import type { LLMProvider } from '../shared/types.js';
import type { ModelRegistry, ResolvedModel } from '../daemon/model-registry.js';
import { getModelRegistry } from '../daemon/model-registry.js';
import { resolveRole, type RoleResolution } from '../analyze/context/role-router.js';
import { currentRoutingContext, familyProvider } from '../analyze/context/shaper-provider.js';

export const DOC_RELATIONS_ROLE = 'indexer.docRelations';

export type DocRelationsSelection =
	| { readonly ok: true; readonly provider: LLMProvider; readonly modelId: string }
	| { readonly ok: false; readonly reason: string };

/** The configured model for a repository, or why the pass cannot run. */
export function validatedDocRelationsModel(
	cfg:      AnalyzeConfig,
	repoPath: string,
	registry: ModelRegistry = getModelRegistry(),
): { readonly ok: true; readonly resolution: RoleResolution; readonly model: ResolvedModel } | { readonly ok: false; readonly reason: string } {
	try {
		const resolution = resolveRole(DOC_RELATIONS_ROLE, cfg, repoPath, { registry });
		const { tier, runner: family } = resolution;
		if (tier !== 'cheap' && tier !== 'mid') {
			return { ok: false, reason: `${DOC_RELATIONS_ROLE} is assigned to tier ${tier}; this capability supports cheap and mid` };
		}
		if (registry.cliKind(family) === undefined && (tier !== 'cheap' || family !== 'ollama')) {
			return { ok: false, reason: `the ${tier} tier runs ${family}, which is not a CLI provider` };
		}
		const model = registry.find(family, resolution.model);
		if (model === undefined) {
			return { ok: false, reason: `the ${tier} tier names no model the definitions list for ${family} ('${resolution.model}')` };
		}
		return { ok: true, resolution, model };
	} catch (err) {
		return { ok: false, reason: failureMessage(err) };
	}
}

/** The provider for the repository's document-relations pass, or why there is none. */
export function selectDocRelationsProvider(
	cfg:      AnalyzeConfig,
	repoPath: string,
	deps:     { readonly registry?: ModelRegistry | undefined } = {},
): DocRelationsSelection {
	const registry = deps.registry ?? getModelRegistry();
	const checked = validatedDocRelationsModel(cfg, repoPath, registry);
	if (!checked.ok) return checked;
	const { resolution, model } = checked;
	try {
		const ctx = currentRoutingContext();
		if (ctx !== undefined) {
			const routed = ctx.router.resolveProviderForRole(DOC_RELATIONS_ROLE, cfg, repoPath);
			if (routed.resolution.tier !== resolution.tier || routed.resolution.runner !== resolution.runner
				|| routed.resolution.model !== resolution.model) {
				return { ok: false, reason: `the router resolved a different tier, provider, or model for ${DOC_RELATIONS_ROLE}` };
			}
			return { ok: true, provider: routed.provider, modelId: model.id };
		}
		return { ok: true, provider: familyProvider(registry, resolution.runner, model, { effort: resolution.effort }), modelId: model.id };
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
