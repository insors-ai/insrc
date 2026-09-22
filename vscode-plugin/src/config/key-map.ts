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

import { CONFIG_CATALOG } from '../../../src/config/config-catalog.js';
import type { ConfigKeyEntry, ConfigKeyMap } from './types.js';

/** The native settings-key prefix every global option's key carries. */
export const NATIVE_KEY_PREFIX = 'insrc.';

/** The native settings id for a catalog dot-path (`insrc.` + path). */
export function nativeKeyForPath(path: string): string {
  return NATIVE_KEY_PREFIX + path;
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

/** The one shared ConfigKeyMap instance the engine + bindings consume. */
export const CONFIG_KEY_MAP: ConfigKeyMap = buildConfigKeyMap();
