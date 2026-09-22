/**
 * Story E20260922401ae5fb:S001 / t3 — the static ConfigKeyMap.
 *
 * A pure, VS-Code-free projection of the daemon's GLOBAL `CONFIG_CATALOG`
 * (src/config/config-catalog.ts) into the native-key ↔ catalog-path ↔
 * ConfigOption table sc8's pull/apply lookups run over, and the source the
 * manifest↔catalog contract test checks against. Building it here from the ONE
 * daemon catalog (never a plugin-side copy) is what keeps the map, the native
 * manifest, and the daemon in lock-step (lc1).
 */

import { CONFIG_CATALOG, type ConfigOption } from '../../../src/config/config-catalog.js';
import { reasoningRoleTaxonomy } from '../../../src/config/role-taxonomy.js';
import type { ConfigKeyEntry, ConfigKeyMap } from './types.js';

/** The native settings-key prefix every global option's key carries. */
export const NATIVE_KEY_PREFIX = 'insrc.';

/** The dot-path prefix + native-key prefix for the per-role tier-override keys (S002). */
export const PER_ROLE_PATH_PREFIX = 'models.tasks.';

/** The allowed per-role tier values (rankOf order cheap < mid < core). */
export const TIER_VALUES: readonly string[] = ['cheap', 'mid', 'core'];

/** The native settings id for a catalog dot-path (`insrc.` + path). */
export function nativeKeyForPath(path: string): string {
  return NATIVE_KEY_PREFIX + path;
}

/** Build a ConfigKeyMap (both O(1) indexes) over a pre-computed entry list. */
function mapFromEntries(entries: readonly ConfigKeyEntry[]): ConfigKeyMap {
  const byNative = new Map<string, ConfigKeyEntry>();
  const byPathIdx = new Map<string, ConfigKeyEntry>();
  for (const entry of entries) {
    byNative.set(entry.nativeKey, entry);
    byPathIdx.set(entry.path, entry);
  }
  return {
    entries,
    byNativeKey: (nativeKey) => byNative.get(nativeKey),
    byPath: (path) => byPathIdx.get(path),
  };
}

/**
 * Build the static ConfigKeyMap over the global CONFIG_CATALOG. Total + pure:
 * every catalog option yields exactly one entry, and both lookups are O(1) over
 * a pre-built index. An unknown native key or path resolves to `undefined` so a
 * version-skew daemon never drives a mis-write (drift-safe, per the LLD).
 */
export function buildConfigKeyMap(): ConfigKeyMap {
  const entries: ConfigKeyEntry[] = CONFIG_CATALOG.map((option) => ({
    nativeKey: nativeKeyForPath(option.path),
    path: option.path,
    option,
  }));
  return mapFromEntries(entries);
}

/**
 * Story E20260922401ae5fb:S002 / t3 — the static per-role ConfigKeyEntry list.
 *
 * A pure, VS-Code-free projection of the daemon's fixed reasoning-role taxonomy
 * (src/config/role-taxonomy.ts) into per-role tier-override entries. Each entry's
 * write path is the literal SEGMENTS `['models','tasks',roleId]` (dot-safe for
 * dotted role ids) and its `source` is `'raw'` (the value is read from the raw
 * config, which the config.catalog snapshot omits for dynamic keys). The synthetic
 * ConfigOption drives BOTH the native enum key's schema AND the pre-flight
 * validation. Built from the ONE daemon taxonomy so the native manifest cannot
 * drift (checked by a manifest↔taxonomy contract test).
 */
export function buildPerRoleKeyMap(): readonly ConfigKeyEntry[] {
  return reasoningRoleTaxonomy().roles.map((role) => {
    const path = PER_ROLE_PATH_PREFIX + role.id;
    const option: ConfigOption = {
      path,
      type: 'enum',
      default: role.defaultTier,
      desc: `Model tier for the '${role.id}' role (${role.criticality}). Leave at the default to use the daemon's routing.`,
      enumValues: TIER_VALUES,
      group: 'Models — per-role tiers',
    };
    return {
      nativeKey: NATIVE_KEY_PREFIX + path,
      path,
      option,
      segments: ['models', 'tasks', role.id],
      source: 'raw',
    };
  });
}

/** Build one merged ConfigKeyMap over the global + per-role entries (collision-free). */
export function buildMergedKeyMap(): ConfigKeyMap {
  return mapFromEntries([...buildConfigKeyMap().entries, ...buildPerRoleKeyMap()]);
}

/** The one shared global ConfigKeyMap instance (S001). */
export const CONFIG_KEY_MAP: ConfigKeyMap = buildConfigKeyMap();

/** The merged global + per-role key map the ONE engine consumes (S002). */
export const MERGED_KEY_MAP: ConfigKeyMap = buildMergedKeyMap();
