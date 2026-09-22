/**
 * Story E20260922401ae5fb:S001 — sc8 ConfigSync boundary types.
 *
 * The VS-Code-free contract for the engine that keeps the native
 * `contributes.configuration` surface truthful to the daemon: it maps the
 * daemon's `config.catalog` schema onto the statically-declared global keys,
 * pulls daemon values into settings on activation/refresh, and on each native
 * change pre-flight-validates + writes via `config.write`. Only these types (+
 * the ConfigSyncEngine factory) are exposed; the pull/diff mechanics are private
 * to sc8's owned boundary. S001 implements pull + validate + write ONLY — the
 * toast/auto-revert UX + the Refresh command are s3's consumption of sc8.
 */

import type { ConfigOption } from '../../../src/config/config-catalog.js';

/** One native settings key that changed since the last daemon sync. */
export interface ChangedKey {
  /** The native settings id, e.g. `insrc.logLevel`. */
  readonly key: string;
  /** Its new value as VS Code reports it. */
  readonly value: unknown;
}

/**
 * The sc8 boundary over VS Code native settings. Bound in extension.ts (the sole
 * `vscode` importer) to `workspace.getConfiguration` + a Global-target `update`
 * (machine-scope is enforced by the manifest `scope:"machine"` declaration, not
 * by a write target); a VS-Code-free fake stands in for it in unit tests.
 */
export interface SettingsStore {
  /** The current native value at `key` (or undefined when unset). */
  read(key: string): unknown;
  /** Persist `value` at `key` as a user-level (machine-scoped) setting. */
  write(key: string, value: unknown): Promise<void>;
  /** A snapshot of the current native values (keyed by native key). */
  snapshot(): ReadonlyMap<string, unknown>;
}

/** The sc8 boundary that surfaces a rejected write (bound to `window.showErrorMessage`). */
export interface Notifier {
  error(message: string): void;
}

/** The outcome of a daemon config write, widened from the daemon's bare `{ok}` with a client-authored reason. */
export type ConfigWriteResult = { ok: true } | { ok: false; reason: string };

/**
 * The daemon snapshot the pull reads: the current value of each catalog path
 * present in `~/.insrc/config.json` (absent paths are omitted ⇒ using-default).
 * Keyed by the daemon dot-path (a ConfigOption.path). Mapped in the gateway from
 * the `config.catalog` payload's `values` record.
 */
export interface ConfigCatalogSnapshot {
  readonly values: ReadonlyMap<string, unknown>;
}

/**
 * The sc8 boundary over the shared sc1 daemon client. `catalog()` wraps
 * `config.catalog`; `writeKey()` wraps `config.write`. No new daemon capability
 * is introduced — only these two existing IPC methods are called (k3).
 */
export interface ConfigGateway {
  /** Read the daemon config snapshot; rejects when the daemon is unreachable. */
  catalog(): Promise<ConfigCatalogSnapshot>;
  /** Write `value` at the daemon dot-path `key`; the daemon does NOT validate the value. */
  writeKey(key: string, value: unknown): Promise<ConfigWriteResult>;
  /**
   * Write `value` at a literal-SEGMENT config path (S002 sc8 extension, additive).
   * The dot-safe array form config.write requires for dynamic dotted keys like
   * `models.tasks.<roleId>` (a dot-split string would mis-nest the leaf). Sits
   * beside `writeKey`; the global (dot-free) keys keep using `writeKey`.
   */
  writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult>;
  /**
   * Read the raw `~/.insrc/config.json` via the existing `config.show` IPC (S002
   * sc8 extension, additive). The source of dynamic per-role override values
   * (`models.tasks.*`) that the `config.catalog` snapshot omits. Rejects when the
   * daemon is unreachable.
   */
  rawConfig(): Promise<Record<string, unknown>>;
}

/** One row of the static native-key ↔ catalog-path ↔ ConfigOption table. */
export interface ConfigKeyEntry {
  /** The native settings id, `insrc.` + the catalog path. */
  readonly nativeKey: string;
  /** The daemon config dot-path (a ConfigOption.path). */
  readonly path: string;
  /** The catalog row that drives both the native key's schema AND validation. */
  readonly option: ConfigOption;
  /**
   * The literal write SEGMENTS for a dynamic dotted key (S002 per-role keys, e.g.
   * `['models','tasks','context.assemble']`). When present, the engine writes via
   * `ConfigGateway.writeKeyPath(segments, ...)` instead of `writeKey(path, ...)`.
   * Absent for S001's dot-free global keys.
   */
  readonly segments?: readonly string[];
  /**
   * Where the pull reads this key's current value from (S002 addition). `'catalog'`
   * (the default when omitted) reads the `config.catalog` snapshot; `'raw'` reads
   * `ConfigGateway.rawConfig()` at the segment path — needed for dynamic
   * `models.tasks.*` overrides the catalog `values` omits.
   */
  readonly source?: 'catalog' | 'raw';
}

/** The static, total, bidirectional native-key ↔ catalog-path table (t3). */
export interface ConfigKeyMap {
  /** Every entry, in catalog order. */
  readonly entries: readonly ConfigKeyEntry[];
  /** Resolve an entry by its native settings id, or undefined (drift-safe). */
  byNativeKey(nativeKey: string): ConfigKeyEntry | undefined;
  /** Resolve an entry by its daemon dot-path, or undefined (drift-safe). */
  byPath(path: string): ConfigKeyEntry | undefined;
}

/**
 * The single engine that keeps the native settings surface truthful to the
 * daemon (the k5 invariant lives here once). Consumed by every config-track
 * story (s1/s2/s3).
 */
export interface ConfigSyncEngine {
  /** Pull daemon values into the native settings mirror (activation + manual refresh). Never throws. */
  pullFromDaemon(): Promise<void>;
  /** React to native settings changes: diff vs the last-synced snapshot, validate, write. Never throws. */
  applyChanges(changed: readonly ChangedKey[]): Promise<void>;
}

/** The injected dependencies of {@link ConfigSyncEngine} (mirrors the S002 controller-deps pattern). */
export interface ConfigSyncDeps {
  readonly gateway: ConfigGateway;
  readonly settings: SettingsStore;
  readonly notifier: Notifier;
  readonly keyMap: ConfigKeyMap;
}
