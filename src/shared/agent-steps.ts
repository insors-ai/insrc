/**
 * Canonical catalog of every (agent, step) pair that the daemon honours
 * for per-step provider resolution. Single source of truth for:
 *
 *  - The step-provider editor (browser) when rendering the agent sections
 *    it should display.
 *  - The daemon seed logic (Item 26) when populating default bindings
 *    after the user picks / switches the active cloud in Model Providers.
 *
 * Kept in `shared/` so both runtimes consume the same list -- a new agent
 * step added in one place must be reflected here or the editor won't
 * surface it.
 *
 * `defaultTier: 'local'` means the seed writes
 *   { provider: 'local' }
 * `defaultTier: 'cloud'` means the seed writes
 *   { provider: <activeCloud> }
 * ...so the policy "expensive / quality-critical steps run on the active
 * cloud, generative / cheap steps run on local" lives in one table
 * instead of scattered across controllers.
 */

export type StepDefaultTier = 'local' | 'cloud';

export interface AgentStepDefinition {
	readonly step: string;
	readonly defaultTier: StepDefaultTier;
	/** Human-readable description for the editor. Optional. */
	readonly description?: string;
}

export interface AgentDefinition {
	readonly agent: string;
	readonly steps: readonly AgentStepDefinition[];
}

/**
 * Policy notes per agent:
 * - Generative steps stay on local (cheap, fast, iterable).
 * - Primary intent `classify` runs on cloud (per-turn routing
 *   decision is quality-critical -- a wrong intent sends the user to
 *   the wrong agent for the whole turn). The other classifier steps
 *   (decompose, command-extract) stay on local.
 * - Review / validation / enhance / detail / refine / promote / discuss
 *   default to cloud (quality matters; these are the steps the user
 *   notices when the output feels off).
 */
export const AGENT_STEP_CATALOG: readonly AgentDefinition[] = [
	{
		agent: 'classifier',
		steps: [
			// `classify` runs on cloud because the per-turn relationship
			// + intent decision is quality-critical (a wrong intent routes
			// the user to the wrong agent for the entire turn) and the
			// local model was producing too many misclassifications --
			// especially around FOLLOWUP / DRILL_DOWN / NEW boundaries
			// where a few extra tokens of cloud reasoning materially
			// changes the routing.
			{ step: 'classify', defaultTier: 'cloud', description: 'Primary intent classifier' },
			{ step: 'decompose', defaultTier: 'local', description: 'Break multi-intent prompts into actions' },
			{ step: 'command-extract', defaultTier: 'local', description: 'Extract shell commands from natural language' },
		],
	},
	{
		agent: 'brainstorm',
		steps: [
			{ step: 'seed', defaultTier: 'local', description: 'Initial idea generation' },
			{ step: 'enhance', defaultTier: 'local', description: 'Ground ideas in codebase entities' },
			{ step: 'review', defaultTier: 'cloud', description: 'Reviewer verdicts on each idea' },
			{ step: 'refine', defaultTier: 'cloud', description: 'Refine ideas per review feedback' },
			{ step: 'diverge', defaultTier: 'local', description: 'Generate idea variations' },
			{ step: 'discuss', defaultTier: 'cloud', description: 'Discuss a focused idea with the user' },
			{ step: 'cluster', defaultTier: 'cloud', description: 'Cluster accepted ideas into themes' },
			{ step: 'promote', defaultTier: 'cloud', description: 'Evaluate which ideas to promote to requirements' },
			{ step: 'theme-spec', defaultTier: 'local', description: 'Write per-theme spec section' },
			{ step: 'theme-spec-review', defaultTier: 'cloud', description: 'Review per-theme spec section' },
			{ step: 'assemble', defaultTier: 'local', description: 'Assemble the final brainstorm document' },
		],
	},
	{
		agent: 'planner',
		steps: [
			{ step: 'analyze', defaultTier: 'local', description: 'Analyze the planning input' },
			{ step: 'search', defaultTier: 'local', description: 'Search for related code during planning' },
			{ step: 'draft', defaultTier: 'local', description: 'Draft initial plan sketch' },
			{ step: 'enhance', defaultTier: 'cloud', description: 'Enhance the plan with reviewer feedback' },
			{ step: 'detail', defaultTier: 'cloud', description: 'Flesh out per-step details' },
		],
	},
	{
		// The `implementation` family covers both the pair variant (single
		// scope) and the delegate variant (batch scope). Both variants
		// share this step catalog -- provider bindings apply uniformly
		// regardless of which variant is active on a given turn.
		agent: 'implementation',
		steps: [
			{ step: 'analyze',   defaultTier: 'local', description: 'Investigate codebase before proposing changes' },
			{ step: 'propose',   defaultTier: 'local', description: 'Generate a change proposal (diff or plan step)' },
			{ step: 'execute',   defaultTier: 'local', description: 'Investigate + generate code for a plan step (delegate)' },
			{ step: 'validate',  defaultTier: 'cloud', description: 'Validate proposed change against tests / style' },
			{ step: 'summarize', defaultTier: 'local', description: 'Summarise the completed session (pair)' },
			{ step: 'report',    defaultTier: 'local', description: 'Write final execution report (delegate)' },
		],
	},
	{
		agent: 'designer',
		steps: [
			{ step: 'extract', defaultTier: 'local', description: 'Extract requirements from user input' },
			{ step: 'enhance', defaultTier: 'cloud', description: 'Enhance extracted requirements' },
			{ step: 'sketch', defaultTier: 'local', description: 'Sketch design proposal' },
			{ step: 'review', defaultTier: 'cloud', description: 'Review design proposal' },
			{ step: 'detail', defaultTier: 'local', description: 'Write the detailed design document' },
		],
	},
	{
		// Code Analyzer family. The orchestrator already routes per-step
		// via `resolverAgent: 'code-analyzer'` + `providerHint`; this entry
		// surfaces the four steps in the Model Providers pane so users can
		// rebind any of them. plan + review are quality-critical decision
		// steps -> cloud; analyzer (the per-task tool loop) and synthesise
		// (final markdown composition) -> local for cost.
		agent: 'code-analyzer',
		steps: [
			{ step: 'plan',       defaultTier: 'cloud', description: 'Decompose the request into AnalysisTask[]' },
			{ step: 'analyzer',   defaultTier: 'local', description: 'Per-task tool-loop runner' },
			{ step: 'review',     defaultTier: 'cloud', description: 'Review each task result; accept / retry / follow-up / done' },
			{ step: 'synthesise', defaultTier: 'local', description: 'Compose the final Markdown report from accepted findings' },
		],
	},
	{
		// Data Analyzer family. Same step shape + tier policy as the Code
		// Analyzer -- cloud reasons (plan + review), local tool-loops and
		// composes (analyzer + synthesise). See
		// plans/analyzers/data-analyzer.md "LLM routing" section.
		agent: 'data-analyzer',
		steps: [
			{ step: 'plan',       defaultTier: 'cloud', description: 'Decompose the request into DataAnalysisTask[]' },
			{ step: 'analyzer',   defaultTier: 'local', description: 'Per-task tool-loop against registered DB connections' },
			{ step: 'review',     defaultTier: 'cloud', description: 'Review each task result; accept / retry / follow-up / done' },
			{ step: 'synthesise', defaultTier: 'local', description: 'Compose the final Markdown report from accepted findings' },
		],
	},
];

/** All agent names in the catalog. */
export function allAgentNames(): readonly string[] {
	return AGENT_STEP_CATALOG.map(a => a.agent);
}

/** Lookup an agent definition by name. */
export function findAgentDefinition(agent: string): AgentDefinition | undefined {
	return AGENT_STEP_CATALOG.find(a => a.agent === agent);
}

import type {
	AgentProviderConfigs,
	CloudProviderName,
	ProviderName,
	StepBinding,
} from './types.js';

/**
 * Build a default `models.agents` map for the given active cloud
 * provider. Walks AGENT_STEP_CATALOG and maps each step's `defaultTier`
 * to either `{ provider: 'local' }` or `{ provider: <activeCloud> }`.
 * When `activeCloud` is null every step degrades to local -- used so the
 * editor has rows to render even before the user picks a cloud.
 *
 * Item 26a (called from `providers.setProvidersConfig` on active-cloud
 * switch) and Item 26c (called from `config.loadConfig` when an active
 * cloud is set but agents is empty) both consume this.
 */
export function buildDefaultAgentBindings(
	activeCloud: CloudProviderName | null,
): AgentProviderConfigs {
	const out: Record<string, Record<string, StepBinding>> = {};
	for (const agent of AGENT_STEP_CATALOG) {
		const steps: Record<string, StepBinding> = {};
		for (const step of agent.steps) {
			const provider: ProviderName = step.defaultTier === 'cloud' && activeCloud
				? activeCloud
				: 'local';
			steps[step.step] = { provider };
		}
		out[agent.agent] = steps;
	}
	return out as AgentProviderConfigs;
}
