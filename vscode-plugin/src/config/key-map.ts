/**
 * Story E20260922401ae5fb:S001 / t3 — the static ConfigKeyMap.
 *
 * A pure, VS-Code-free projection of the extension's own native settings manifest
 * (package.json contributes.configuration) into the native-key ↔ catalog-path ↔
 * ConfigOption table sc8's pull/apply lookups run over. The manifest is generated
 * from the daemon's settings catalog at build time (scripts/sync-manifest-catalog.mjs,
 * checked by the manifest contract tests), so the map, the manifest and the daemon
 * stay in lock-step (lc1) while the bundle carries no copy of the settings catalog
 * (Epic ce99b72065d03b1b, Story s6): the tier rows carry no built-in model or effort
 * list, and their valid values come from the daemon's model definitions.
 */

import { reasoningRoleTaxonomy } from '../../../src/config/role-taxonomy.js';
import PACKAGE_JSON from '../../package.json' with { type: 'json' };
import type { ConfigKeyEntry, ConfigKeyMap, ConfigOption } from './types.js';

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

/** One contributed native setting, as package.json declares it. */
export interface ManifestProperty {
  readonly type?: string;
  readonly default?: unknown;
  readonly enum?: readonly string[];
  readonly markdownDescription?: string;
  readonly description?: string;
}

/** A contributes.configuration section: its title and its settings. */
export interface ManifestSection {
  readonly title?: string;
  readonly properties?: Readonly<Record<string, ManifestProperty>>;
}

/** The extension's contributed settings sections. */
export type ManifestConfiguration = readonly ManifestSection[];

const contributed = (PACKAGE_JSON as { contributes?: { configuration?: ManifestSection | ManifestSection[] } }).contributes?.configuration;

/** The real manifest's settings sections (the default for buildConfigKeyMap). */
export const MANIFEST_CONFIGURATION: ManifestConfiguration = Array.isArray(contributed) ? contributed : contributed !== undefined ? [contributed] : [];

/**
 * Whether a native key is plugin-local rather than a settings-catalog row: the
 * plugin's own UI flags (insrc.chat.*) and the per-role insrc.models.tasks.* axis,
 * which buildPerRoleKeyMap maps from the role taxonomy. The manifest generator uses
 * this same predicate, so the two cannot drift.
 */
export function isPluginLocalKey(nativeKey: string): boolean {
  return nativeKey.startsWith('insrc.chat.') || nativeKey.startsWith(NATIVE_KEY_PREFIX + PER_ROLE_PATH_PREFIX);
}

/** A catalog-backed manifest property as the ConfigOption the sync engine validates against. */
function optionFromProperty(path: string, property: ManifestProperty, group: string): ConfigOption {
  const desc = property.markdownDescription ?? property.description ?? '';
  if (Array.isArray(property.enum)) return { path, type: 'enum', default: property.default, desc, enumValues: [...property.enum], group };
  const type = property.type === 'number' || property.type === 'boolean' ? property.type : 'string';
  return { path, type, default: property.default, desc, group };
}

/**
 * Build the static ConfigKeyMap over the manifest's catalog-backed settings. Total +
 * pure: every contributed insrc.<path> key that is not plugin-local yields exactly one
 * entry, its option taken from the property's type, enum and default; both lookups
 * are O(1) over a pre-built index. An unknown native key or path resolves to
 * `undefined` so a version-skew daemon never drives a mis-write (drift-safe).
 */
export function buildConfigKeyMap(manifest: ManifestConfiguration = MANIFEST_CONFIGURATION): ConfigKeyMap {
  const entries: ConfigKeyEntry[] = [];
  for (const section of manifest) {
    for (const [nativeKey, property] of Object.entries(section.properties ?? {})) {
      if (!nativeKey.startsWith(NATIVE_KEY_PREFIX) || isPluginLocalKey(nativeKey)) continue;
      const path = nativeKey.slice(NATIVE_KEY_PREFIX.length);
      entries.push({ nativeKey, path, option: optionFromProperty(path, property, section.title ?? '') });
    }
  }
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
