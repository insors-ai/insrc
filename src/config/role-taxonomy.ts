/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * ReasoningRoleTaxonomy (Epic per-role-per-step, Story S001 — sc4).
 *
 * The closed, hand-authored registry of reasoning-site identifiers across the
 * analyze, workflow, and tracker lifecycle — each classified `critical`
 * (subject to the coreFloor clamp, default tier `core`) or `peripheral`
 * (eligible for `mid`/`cheap`). Downstream stories consume ONLY the exposed
 * shapes + accessors: the RoleRouter (S003) keys resolution on RoleId and reads
 * `defaultTier` as the gap fallback; the CoreFloorGuard (S002) reads
 * `criticality` + `rankOf` to compare capability.
 *
 * The role set is grounded in the s1 caller sweep (corrected by the HLD review:
 * ~11 analyze-pipeline `buildShaperProvider` callers, not one) across three
 * categories: (A) direct analyze-pipeline reasoning, (B) workflow-runner steps +
 * review + build + tracker, (C) indexer summarisation.
 *
 * This module is pure DATA + accessors — it does not resolve providers (S003)
 * or enforce the floor (S002).
 */

import type { TierName } from './analyze.js';

/** Intent-named reasoning-site identifier. The value space is the closed
 *  registry below; an id absent from it resolves to defaultTier semantics
 *  downstream (never throws). */
export type RoleId = string;

export type Criticality = 'critical' | 'peripheral';

export interface RoleDescriptor {
	readonly id:          RoleId;
	readonly criticality: Criticality;
	/** Tier used when no roleTiers assignment covers the role — the gap fallback
	 *  guaranteeing every reasoning site has a resolvable tier. */
	readonly defaultTier: TierName;
}

export interface RoleTaxonomy {
	readonly roles:  readonly RoleDescriptor[];
	/** Tier capability ordering cheap < mid < core, used by the coreFloor clamp. */
	readonly rankOf: Readonly<Record<TierName, number>>;
}

const RANK_OF: Readonly<Record<TierName, number>> = { cheap: 0, mid: 1, core: 2 };

/**
 * The closed reasoning-role registry. critical → default `core` (floor-protected);
 * peripheral → `mid` (design-adjacent / grounding) or `cheap` (rendering,
 * classification, narrow probes, summarisation).
 */
const ROLES: readonly RoleDescriptor[] = [
	// (B) Workflow design reasoning — CRITICAL → core (the actual decisions).
	{ id: 'design.alternatives.enumerate', criticality: 'critical',   defaultTier: 'core' },
	{ id: 'design.alternatives.judge',     criticality: 'critical',   defaultTier: 'core' },
	{ id: 'design.contract.detail',        criticality: 'critical',   defaultTier: 'core' },
	{ id: 'scope.audit',                   criticality: 'critical',   defaultTier: 'core' },  // checklist.verify
	{ id: 'review',                        criticality: 'critical',   defaultTier: 'core' },
	{ id: 'build',                         criticality: 'critical',   defaultTier: 'core' },
	{ id: 'define.scope.assess',           criticality: 'critical',   defaultTier: 'core' },
	{ id: 'define.epic.frame',             criticality: 'critical',   defaultTier: 'core' },
	{ id: 'define.stories.compose',        criticality: 'critical',   defaultTier: 'core' },

	// (B) Workflow support — PERIPHERAL → mid (design-adjacent detail / grounding).
	{ id: 'context.assemble',              criticality: 'peripheral', defaultTier: 'mid'  },
	{ id: 'design.decompose',              criticality: 'peripheral', defaultTier: 'mid'  },
	{ id: 'design.error.paths',            criticality: 'peripheral', defaultTier: 'mid'  },
	{ id: 'design.test.strategy',          criticality: 'peripheral', defaultTier: 'mid'  },
	{ id: 'design.migration.write',        criticality: 'peripheral', defaultTier: 'mid'  },
	{ id: 'design.framework.write',        criticality: 'peripheral', defaultTier: 'mid'  },  // HLD framework
	{ id: 'design.rollout.overview',       criticality: 'peripheral', defaultTier: 'mid'  },
	{ id: 'synthesize',                    criticality: 'peripheral', defaultTier: 'mid'  },  // render artifact from settled outputs
	{ id: 'workflow.questions',            criticality: 'peripheral', defaultTier: 'mid'  },

	// (B) Tracker rendering — PERIPHERAL → cheap (prose over settled facts).
	{ id: 'tracker.render.issueBody',      criticality: 'peripheral', defaultTier: 'cheap' },
	{ id: 'tracker.render.summary',        criticality: 'peripheral', defaultTier: 'cheap' },

	// (A) Analyze pipeline — the ~11 buildShaperProvider callers.
	{ id: 'analyze.decompose',             criticality: 'peripheral', defaultTier: 'mid'  },  // context/decomposer
	{ id: 'analyze.synthesize',            criticality: 'peripheral', defaultTier: 'mid'  },  // context/synthesizer
	{ id: 'analyze.plan',                  criticality: 'peripheral', defaultTier: 'mid'  },  // planner/driver
	{ id: 'analyze.classify',              criticality: 'peripheral', defaultTier: 'cheap' }, // classifier/driver
	{ id: 'analyze.scope.pick',            criticality: 'peripheral', defaultTier: 'cheap' }, // classifier/scope-picker
	{ id: 'analyze.adherence',             criticality: 'peripheral', defaultTier: 'mid'  },  // runtimes/shared/adherence
	{ id: 'analyze.aggregate',             criticality: 'peripheral', defaultTier: 'mid'  },  // runtimes/shared/aggregator
	{ id: 'analyze.narrow',                criticality: 'peripheral', defaultTier: 'cheap' }, // explore probes (capability-reuse-check, doc-decision-trace, doc-constraint-enumerate)

	// (C) Indexing — PERIPHERAL → cheap (already local by default today).
	{ id: 'indexer.summarise',             criticality: 'peripheral', defaultTier: 'cheap' }, // summariser
];

const ROLE_TAXONOMY: RoleTaxonomy = { roles: ROLES, rankOf: RANK_OF };
const ROLE_INDEX: ReadonlyMap<RoleId, RoleDescriptor> = new Map(ROLES.map(r => [r.id, r]));

/** The single exposed accessor for the closed reasoning-role taxonomy (sc4). */
export function reasoningRoleTaxonomy(): RoleTaxonomy {
	return ROLE_TAXONOMY;
}

/** Descriptor for a role id, or undefined for an id outside the closed registry
 *  (which the router resolves via defaultTier semantics rather than throwing). */
export function roleDescriptor(id: RoleId): RoleDescriptor | undefined {
	return ROLE_INDEX.get(id);
}
