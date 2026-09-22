/**
 * Story E20260922401ae5fb:S001 / t4 — the VS-Code-free ConfigSync engine (sc8).
 *
 * `createConfigSyncEngine(deps)` mirrors the S002 createDaemonLifecycleController
 * pattern: a pure core over injected ConfigGateway + SettingsStore + Notifier +
 * the static ConfigKeyMap, unit-testable off the editor API. It owns the k5
 * truthfulness invariant:
 *   - pullFromDaemon maps the daemon `config.catalog` values into the native
 *     settings mirror (the ConfigOption default for any omitted path) and
 *     captures the last-synced snapshot; a gateway failure is caught + surfaced
 *     and leaves settings unchanged (never throws / never blocks activation).
 *   - applyChanges maps each changed native key → catalog path, PRE-FLIGHT-
 *     VALIDATES the value against its ConfigOption (client-side, because the
 *     daemon `config.write` does NOT type-validate values), writes via the
 *     gateway on success, and reports a rejected write via the Notifier on a
 *     validation failure or a daemon {ok:false}/unreachable — never advancing
 *     the snapshot for a rejected key.
 *
 * S001 implements pull + validate + write ONLY. The toast/auto-revert/loop-
 * suppression UX and the Refresh command are s3's consumption of this contract.
 */

import type { ConfigOption } from '../../../src/config/config-catalog.js';
import type {
  ChangedKey,
  ConfigSyncDeps,
  ConfigSyncEngine,
} from './types.js';

/**
 * Validate a value against its catalog option's type contract (the client-side
 * guard the daemon lacks). Returns undefined when valid, or a user-facing reason
 * when not. Enum membership is checked against the option's fixed `enumValues`.
 */
export function validateAgainstOption(option: ConfigOption, value: unknown): string | undefined {
  switch (option.type) {
    case 'string':
      return typeof value === 'string' ? undefined : `must be a string`;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? undefined : `must be a number`;
    case 'boolean':
      return typeof value === 'boolean' ? undefined : `must be true or false`;
    case 'enum': {
      const allowed = option.enumValues ?? [];
      return typeof value === 'string' && allowed.includes(value)
        ? undefined
        : `must be one of: ${allowed.join(', ')}`;
    }
    default:
      // Unreachable given ConfigOption.type's closed union; refuse rather than mis-write.
      return `unsupported option type`;
  }
}

/** Build the sc8 ConfigSync engine over its injected boundaries. Never throws. */
export function createConfigSyncEngine(deps: ConfigSyncDeps): ConfigSyncEngine {
  const { gateway, settings, notifier, keyMap } = deps;

  // The last-known-good values the daemon holds, keyed by native key. Private to
  // sc8; captured on each successful pull and advanced per successful write. s3's
  // revert UX reads it — S001 only maintains it + uses it for the idempotent no-op.
  let lastSyncedSnapshot = new Map<string, unknown>();

  return {
    async pullFromDaemon(): Promise<void> {
      let snapshot;
      try {
        snapshot = await gateway.catalog();
      } catch (err) {
        // Daemon unreachable — leave the native mirror at its last-known values.
        const message = err instanceof Error ? err.message : String(err);
        notifier.error(`insrc: could not read daemon config — ${message}`);
        return;
      }

      const next = new Map<string, unknown>();
      for (const entry of keyMap.entries) {
        // Omitted path ⇒ the option default (the payload treats absent as unset).
        next.set(
          entry.nativeKey,
          snapshot.values.has(entry.path) ? snapshot.values.get(entry.path) : entry.option.default,
        );
      }
      // Publish the last-synced snapshot BEFORE writing settings. Our own writes
      // fire onDidChangeConfiguration, which re-enters applyChanges with these
      // same values; publishing first makes each echo hit the idempotent no-op
      // guard instead of writing the daemon back (avoiding an activation write/
      // reload storm — the k5 loop-suppression UX proper is still s3's).
      lastSyncedSnapshot = next;
      for (const entry of keyMap.entries) {
        try {
          await settings.write(entry.nativeKey, next.get(entry.nativeKey));
        } catch {
          // A settings-write failure must not abort the whole pull; skip this key.
          continue;
        }
      }
    },

    async applyChanges(changed: readonly ChangedKey[]): Promise<void> {
      for (const change of changed) {
        const entry = keyMap.byNativeKey(change.key);
        // Unknown native key (drift) — never write it.
        if (entry === undefined) continue;

        // Idempotent no-op: the value already equals what the daemon holds.
        if (lastSyncedSnapshot.has(change.key) && Object.is(lastSyncedSnapshot.get(change.key), change.value)) {
          continue;
        }

        // Client-side pre-flight validation (the daemon accepts any value).
        const invalid = validateAgainstOption(entry.option, change.value);
        if (invalid !== undefined) {
          notifier.error(`insrc: '${change.key}' ${invalid} — change not applied`);
          continue;
        }

        try {
          const result = await gateway.writeKey(entry.path, change.value);
          if (result.ok) {
            lastSyncedSnapshot.set(change.key, change.value);
          } else {
            notifier.error(`insrc: daemon rejected '${change.key}' — ${result.reason}`);
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          notifier.error(`insrc: could not save '${change.key}' — ${message}`);
        }
      }
    },
  };
}
