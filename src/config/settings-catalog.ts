/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The self-describing settings-catalog payload (Story S001 / sc1).
 *
 * `buildSettingsCatalog(rawConfig)` assembles ONE payload the IDE settings
 * surface renders from, derived entirely from the daemon's single sources of
 * truth — the enriched CONFIG_CATALOG (src/config/config-catalog.ts) and the
 * reasoning-role taxonomy (src/config/role-taxonomy.ts) — never a plugin-side
 * copy (lc1/k1). It is PURE and TOTAL: it reads only its argument plus those two
 * static sources, performs no IO, and never throws — an empty/garbage rawConfig
 * yields a complete schema with an empty `values` map.
 *
 * The daemon `config.catalog` IPC (src/daemon/index.ts) is a thin read-only
 * wrapper: read PATHS.config (parse-or-{}) → buildSettingsCatalog → return.
 */

import { CONFIG_CATALOG, type ConfigOption } from './config-catalog.js';
import { reasoningRoleTaxonomy } from './role-taxonomy.js';

/** One recognized reasoning role the per-role override editor (S004) targets. */
export interface SettingsRole {
	readonly id:          string;
	readonly defaultTier: string;
}

/**
 * The wire shape returned by the `config.catalog` IPC and mirrored by the
 * plugin's Kotlin DTOs. Everything is derived from the daemon's single catalog +
 * role taxonomy, so the plugin renders whatever the daemon reports.
 */
export interface SettingsCatalogPayload {
	/** The enriched catalog rows, verbatim and in catalog order. */
	readonly options:   readonly ConfigOption[];
	/** The distinct group labels, in first-seen (catalog) order. */
	readonly groups:    readonly string[];
	/** The recognized roles + their default tiers (for per-role overrides). */
	readonly roles:     readonly SettingsRole[];
	/** The allowed tier names (cheap|mid|core), the override values. */
	readonly tierNames: readonly string[];
	/**
	 * The current value of each catalog path present in rawConfig. A path that is
	 * absent (or whose intermediate is absent) is OMITTED — the consumer treats a
	 * missing entry as "unset / using the default".
	 */
	readonly values:    Readonly<Record<string, unknown>>;
}

/**
 * Resolve the value at a dot-path inside `root`, or `undefined` if any segment
 * along the way is absent or not a traversable object. Catalog paths are plain
 * dotted keys (no dots-inside-a-key), so a simple '.' split is correct here —
 * this is NOT the dynamic-key write path (which needs segment arrays).
 */
function getAtPath(root: Record<string, unknown>, path: string): unknown {
	let cur: unknown = root;
	for (const seg of path.split('.')) {
		if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) return undefined;
		cur = (cur as Record<string, unknown>)[seg];
		if (cur === undefined) return undefined;
	}
	return cur;
}

/**
 * Assemble the self-describing settings payload from the given parsed config.
 * Pure + total (never throws). `rawConfig` is the parsed `~/.insrc/config.json`
 * object, or `{}` when the file is absent/unreadable.
 */
export function buildSettingsCatalog(rawConfig: Record<string, unknown>): SettingsCatalogPayload {
	const options = CONFIG_CATALOG;

	// Distinct group labels in first-seen (catalog) order.
	const groups: string[] = [];
	for (const opt of options) {
		if (!groups.includes(opt.group)) groups.push(opt.group);
	}

	const taxonomy = reasoningRoleTaxonomy();
	const roles: SettingsRole[] = taxonomy.roles.map((r) => ({ id: r.id, defaultTier: r.defaultTier }));
	const tierNames = Object.keys(taxonomy.rankOf);

	// Current value per catalog path; absent paths are omitted (⇒ using-default).
	const values: Record<string, unknown> = {};
	for (const opt of options) {
		const v = getAtPath(rawConfig, opt.path);
		if (v !== undefined) values[opt.path] = v;
	}

	return { options, groups, roles, tierNames, values };
}
