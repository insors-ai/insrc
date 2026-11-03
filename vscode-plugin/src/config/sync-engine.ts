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
 *
 * Model tiers (Epic ce99b72065d03b1b, Story s6): a change to an
 * insrc.models.tiers.<tier>.runner / .model / .effort key is a TIER edit. Its valid
 * values are the daemon's model definitions, not a list in the manifest: the tier's
 * three native values are checked against models.definitions and, when valid, written
 * ONCE as the whole tier, so Settings can never save half a tier or a model the family
 * does not serve. An invalid edit is reverted with the reason.
 */

import type { ConfigOption } from '../../../src/config/config-catalog.js';
import { classifyDaemonFailure, familyDefault, familyOf, servedModel, type DefinedModel, type ModelDefinitions } from '../models/definitions.js';
import type {
  ChangedKey,
  ConfigSyncDeps,
  ConfigSyncEngine,
  ConfigWriteResult,
} from './types.js';

/** The three fields of a tier, in the order they are read and written. */
const TIER_FIELDS = ['runner', 'model', 'effort'] as const;
type TierField = (typeof TIER_FIELDS)[number];

/** The tier and field a catalog path names, when it is one of a tier's three fields. */
export function tierFieldOf(path: string): { readonly tier: string; readonly field: TierField } | undefined {
  const m = /^models\.tiers\.([^.]+)\.(runner|model|effort)$/.exec(path);
  return m === null ? undefined : { tier: m[1]!, field: m[2] as TierField };
}

/** A refusal as the user reads it: the daemon's reason, and its detail when it gives one. */
function refusalText(result: Extract<ConfigWriteResult, { ok: false }>): string {
  return result.detail !== undefined ? `${result.reason} — ${result.detail}` : result.reason;
}

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

/**
 * Read the value at a literal-SEGMENT path inside a raw config object (each
 * segment is one key, dots and all — so `['models','tasks','context.assemble']`
 * reads `roleTiers['context.assemble']` un-mis-nested). Returns undefined if any
 * segment along the way is absent or not a traversable object.
 */
export function readAtSegments(root: Record<string, unknown>, segments: readonly string[]): unknown {
  let cur: unknown = root;
  for (const seg of segments) {
    if (typeof cur !== 'object' || cur === null || Array.isArray(cur)) return undefined;
    cur = (cur as Record<string, unknown>)[seg];
    if (cur === undefined) return undefined;
  }
  return cur;
}

/** Build the sc8 ConfigSync engine over its injected boundaries. Never throws. */
export function createConfigSyncEngine(deps: ConfigSyncDeps): ConfigSyncEngine {
  const { gateway, settings, notifier, keyMap, definitions, onRestartRequired } = deps;

  // The last-known-good values the daemon holds, keyed by native key. Private to
  // sc8; captured on each successful pull and advanced per successful write. s3's
  // revert UX reads it — S001 only maintains it + uses it for the idempotent no-op.
  let lastSyncedSnapshot = new Map<string, unknown>();

  /**
   * S003 auto-revert: restore a rejected native setting to the value the daemon
   * actually holds (the last-known-good). The snapshot is NOT advanced on a
   * rejection, so the reverted value equals lastSyncedSnapshot.get(key) and the
   * revert write's onDidChangeConfiguration echo hits the idempotent-no-op guard
   * at the top of applyChanges (no loop). When there is no last-known value, fall
   * back to the option default AND pre-set the snapshot first so the default-echo
   * is also a no-op (no unintended daemon write). Never throws.
   */
  const revertToLastKnown = async (nativeKey: string, option: ConfigOption): Promise<void> => {
    let value: unknown;
    if (lastSyncedSnapshot.has(nativeKey)) {
      value = lastSyncedSnapshot.get(nativeKey);
    } else {
      // No last-known value (e.g. a pull was skipped): fall back to the option
      // default. This can transiently show a value the daemon may not hold, but
      // the activation/refresh pullFromDaemon reassigns the snapshot to the
      // daemon's real value and rewrites the setting — self-healing.
      value = option.default;
      lastSyncedSnapshot.set(nativeKey, value);
    }
    try {
      await settings.write(nativeKey, value);
    } catch {
      // A revert write failure must never throw; the rejection was already surfaced.
    }
  };

  /** The native key of a tier field (the manifest maps every tier field). */
  const tierKey = (tier: string, field: TierField): string | undefined => keyMap.byPath(`models.tiers.${tier}.${field}`)?.nativeKey;

  /**
   * Apply a batch's changes to one tier: read the tier's three native values (the
   * changed ones from the batch, the others as currently set), check them against the
   * daemon's definitions, and write the whole tier once. Every refusal reverts the
   * changed keys. Returns the native keys whose write needs a restart. Never throws.
   */
  const applyTier = async (tier: string, changes: readonly ChangedKey[]): Promise<readonly string[]> => {
    const changedField = (field: TierField) => changes.some((c) => c.key === tierKey(tier, field));
    const revert = async (message: string): Promise<readonly string[]> => {
      notifier.error(message);
      for (const c of changes) {
        const entry = keyMap.byNativeKey(c.key);
        if (entry !== undefined) await revertToLastKnown(c.key, entry.option);
      }
      return [];
    };
    const values = {} as Record<TierField, unknown>;
    for (const field of TIER_FIELDS) {
      const key = tierKey(tier, field);
      const change = changes.find((c) => c.key === key);
      values[field] = change !== undefined ? change.value : key !== undefined ? settings.read(key) : '';
      if (values[field] === undefined || values[field] === null) values[field] = '';
      if (typeof values[field] !== 'string') return revert(`insrc: '${key ?? field}' must be a string — change not applied`);
    }
    const runner = (values.runner as string).trim();
    const model = (values.model as string).trim();
    const effort = (values.effort as string).trim();

    let tierValue: { runner: string; model: string; effort: string } | null;
    if (runner === '' && model === '' && effort === '') {
      tierValue = null; // all empty: clear the tier, so the definitions' default applies.
    } else {
      if (definitions === undefined) return revert(`insrc: the ${tier} tier cannot be checked against the daemon's model definitions — change not applied`);
      let defs: ModelDefinitions;
      try {
        defs = await definitions();
      } catch (err) {
        return revert(`insrc: could not check the ${tier} tier — ${classifyDaemonFailure(err).text} — change not applied`);
      }
      const family = familyOf(defs, runner === '' ? defs.defaultFamily : runner);
      if (family === undefined) {
        return revert(`insrc: '${runner}' is not a model family the daemon serves (${defs.families.map((f) => f.id).join(', ')}) — ${tier} tier not changed`);
      }
      let chosen: DefinedModel | undefined = model === '' ? undefined : servedModel(family, model);
      let chosenEffort = effort;
      // A family switch (the runner changed, the model did not) or an empty model takes the family's default for the tier.
      const familySwitch = changedField('runner') && !changedField('model');
      if (model === '' || familySwitch) {
        const fallback = familyDefault(family, tier);
        if (fallback === undefined) return revert(`insrc: ${family.displayName} lists no models — ${tier} tier not changed`);
        chosen = fallback.model;
        if (chosenEffort === '') chosenEffort = fallback.effort;
      } else if (chosen === undefined) {
        // Only a vendor CLI family's model can be checked and approved; Ollama, and a CLI family on a host, take only their listed models.
        return revert(family.cliKind !== undefined && family.host === undefined
          ? `insrc: '${model}' is not a model the daemon lists for ${family.displayName} — run 'insrc: Set model tier' to check and approve it — ${tier} tier not changed`
          : `insrc: '${model}' is not a listed ${family.displayName} model; only listed ${family.displayName} models can be used (${family.models.map((m) => m.id).join(', ')}) — ${tier} tier not changed`);
      }
      if (chosenEffort !== '' && !chosen.efforts.includes(chosenEffort)) {
        // Dropped only on a family switch; otherwise the edit leaves an effort the model does not take, and is refused.
        if (!familySwitch) {
          return revert(`insrc: effort '${chosenEffort}' is not accepted by ${chosen.id} (${chosen.efforts.length > 0 ? `accepted: ${chosen.efforts.join(', ')}` : 'it takes none'}) — change or clear the effort; ${tier} tier not changed`);
        }
        chosenEffort = '';
      }
      tierValue = { runner: family.id, model: chosen.id, effort: chosenEffort };
    }

    let result: ConfigWriteResult;
    try {
      result = await gateway.writeKeyPath(['models', 'tiers', tier], tierValue);
    } catch (err) {
      return revert(`insrc: could not save the ${tier} tier — ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!result.ok) return revert(`insrc: daemon rejected the ${tier} tier — ${refusalText(result)}`);
    // Mirror the written tier in the native keys; the snapshot is set first so the echo is a no-op.
    for (const field of TIER_FIELDS) {
      const key = tierKey(tier, field);
      if (key === undefined) continue;
      const written = tierValue === null ? '' : tierValue[field];
      lastSyncedSnapshot.set(key, written);
      if (settings.read(key) !== written) {
        try { await settings.write(key, written); } catch { /* the daemon holds the tier; the next pull repairs the mirror */ }
      }
    }
    return result.restartRequired === true ? changes.map((c) => c.key) : [];
  };

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

      // Dynamic-source (per-role) entries read their current value from the raw
      // config (config.catalog omits models.tasks.*). Fetch it once, and only when
      // needed; a raw-read failure degrades the per-role keys ONLY (global keys
      // still sync), leaving those settings at their last-known values.
      let raw: Record<string, unknown> | undefined;
      if (keyMap.entries.some((e) => e.source === 'raw')) {
        try {
          raw = await gateway.rawConfig();
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          // Distinct from the whole-config read failure: only the per-role
          // overrides degrade here; the global keys still synced from the catalog.
          notifier.error(`insrc: could not read per-role overrides — ${message}`);
          // raw stays undefined ⇒ per-role keys are skipped below.
        }
      }

      const next = new Map<string, unknown>();
      for (const entry of keyMap.entries) {
        if (entry.source === 'raw') {
          if (raw === undefined) continue; // raw read failed — leave this key untouched.
          const current = readAtSegments(raw, entry.segments ?? []);
          next.set(entry.nativeKey, current !== undefined ? current : entry.option.default);
          continue;
        }
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
      for (const [nativeKey, value] of next) {
        try {
          await settings.write(nativeKey, value);
        } catch {
          // A settings-write failure must not abort the whole pull; skip this key.
          continue;
        }
      }
    },

    async applyChanges(changed: readonly ChangedKey[]): Promise<void> {
      const restartKeys: string[] = [];
      const tierChanges = new Map<string, ChangedKey[]>();
      for (const change of changed) {
        const entry = keyMap.byNativeKey(change.key);
        // Unknown native key (drift) — never write it.
        if (entry === undefined) continue;

        // Idempotent no-op: the value already equals what the daemon holds.
        if (lastSyncedSnapshot.has(change.key) && Object.is(lastSyncedSnapshot.get(change.key), change.value)) {
          continue;
        }

        // A tier field: collected, then checked and written as the whole tier below.
        const tierField = tierFieldOf(entry.path);
        if (tierField !== undefined) {
          tierChanges.set(tierField.tier, [...(tierChanges.get(tierField.tier) ?? []), change]);
          continue;
        }

        // Client-side pre-flight validation (the daemon accepts any value).
        const invalid = validateAgainstOption(entry.option, change.value);
        if (invalid !== undefined) {
          notifier.error(`insrc: '${change.key}' ${invalid} — change not applied`);
          await revertToLastKnown(change.key, entry.option); // S003: restore the truthful value.
          continue;
        }

        try {
          // A per-role (segment-bearing) entry writes the dot-safe ARRAY form so a
          // dotted roleId leaf is not mis-nested; global keys keep the string path.
          const result =
            entry.segments !== undefined
              ? await gateway.writeKeyPath(entry.segments, change.value)
              : await gateway.writeKey(entry.path, change.value);
          if (result.ok) {
            lastSyncedSnapshot.set(change.key, change.value);
            if (result.restartRequired === true) restartKeys.push(change.key);
          } else {
            notifier.error(`insrc: daemon rejected '${change.key}' — ${refusalText(result)}`);
            await revertToLastKnown(change.key, entry.option); // S003: daemon refused → revert.
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          notifier.error(`insrc: could not save '${change.key}' — ${message}`);
          await revertToLastKnown(change.key, entry.option); // S003: daemon unreachable → revert.
        }
      }
      for (const [tier, changes] of tierChanges) restartKeys.push(...(await applyTier(tier, changes)));
      if (restartKeys.length > 0) onRestartRequired?.(restartKeys);
    },
  };
}
