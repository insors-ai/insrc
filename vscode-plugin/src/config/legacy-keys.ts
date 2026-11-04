/**
 * ISSUE-8d7b4704660a5866 — native settings ids that were renamed.
 *
 * A native id that is a dotted child of another id cannot live in VS Code's nested settings tree, so
 * `insrc.models.tasks.tools.convert.escalate` became `insrc.models.tasks.tools.convertEscalate`. A user who
 * had typed a value under the old id has it only in settings.json (every edit under that id was refused, so
 * the daemon never saw it). `migrateLegacyKeys` hands such a value to the new id once the daemon's values
 * have been pulled — and only when the new id still shows its default, so a value set elsewhere is never
 * overwritten. VS Code refuses to write an unregistered setting, so clearing the old id is best effort.
 * Pure and VS-Code-free: the editor bindings are injected.
 */

import type { ChangedKey, ConfigKeyMap } from './types.js';

/** A renamed native id and the id that replaced it. */
export interface LegacyNativeKey {
  readonly legacy: string;
  readonly current: string;
}

/** Every renamed native settings id. */
export const LEGACY_NATIVE_KEYS: readonly LegacyNativeKey[] = [
  { legacy: 'insrc.models.tasks.tools.convert.escalate', current: 'insrc.models.tasks.tools.convertEscalate' },
];

export interface LegacyMigrationDeps {
  readonly keyMap: ConfigKeyMap;
  /** The value the user holds under a native id in their settings (undefined when none). */
  readonly read: (nativeKey: string) => unknown;
  /** Send changes through the sync engine (it validates, writes the daemon and republishes the mirror). */
  readonly apply: (changed: readonly ChangedKey[]) => Promise<void>;
  /** Remove a user value (best effort: VS Code refuses an unregistered setting). */
  readonly clear: (nativeKey: string) => Promise<void>;
}

/** Move user values from renamed ids to their replacements. Returns the new ids that received a value. Never throws. */
export async function migrateLegacyKeys(deps: LegacyMigrationDeps, keys: readonly LegacyNativeKey[] = LEGACY_NATIVE_KEYS): Promise<readonly string[]> {
  const moved: string[] = [];
  for (const { legacy, current } of keys) {
    try {
      const entry = deps.keyMap.byNativeKey(current);
      const value = deps.read(legacy);
      if (entry === undefined || value === undefined) continue;
      const allowed = entry.option.enumValues;
      const valid = typeof value === 'string' && (allowed === undefined || allowed.includes(value));
      const held = deps.read(current);
      const untouched = held === undefined || held === entry.option.default;
      if (valid && untouched && value !== held) {
        await deps.apply([{ key: current, value }]);
        moved.push(current);
      }
      await deps.clear(legacy).catch(() => undefined);
    } catch {
      // A migration problem must never block activation.
    }
  }
  return moved;
}
