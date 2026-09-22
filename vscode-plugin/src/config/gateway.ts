/**
 * Story E20260922401ae5fb:S001 / t5 — the daemon-backed ConfigGateway (sc8).
 *
 * The VS-Code-free boundary that maps sc8's ConfigGateway onto the EXISTING sc1
 * SharedIpcClient. `catalog()` wraps `config.catalog` (mapping its `values`
 * record into a path-keyed Map); `writeKey()` wraps `config.write`, widening the
 * daemon's bare `{ok:boolean}` (no reason) into a ConfigWriteResult with a
 * client-authored reason on refusal. No new daemon capability is introduced —
 * only these two existing IPC methods are called (k3), and there is no cloud
 * path (k2). Constructed in extension.ts from the shared client.
 */

import type { IpcClient } from '../../../src/shared/ipc-client.js';
import type { ConfigCatalogSnapshot, ConfigGateway, ConfigWriteResult } from './types.js';

/** The subset of the `config.catalog` payload sc8's pull consumes (S001: values only). */
interface CatalogPayload {
  readonly values?: Readonly<Record<string, unknown>>;
}

/**
 * Build the sc8 ConfigGateway over the shared daemon client. `catalog()` may
 * reject (daemon unreachable) — the engine's pull catches it. `writeKey()`
 * resolves a ConfigWriteResult: the daemon's `{ok:true}` passes through, an
 * `{ok:false}` (invalid path) becomes a reason-carrying refusal, and a socket
 * rejection propagates so applyChanges can treat it as an aborted write.
 */
export function createDaemonConfigGateway(client: IpcClient): ConfigGateway {
  return {
    async catalog(): Promise<ConfigCatalogSnapshot> {
      const payload = await client.rpc<CatalogPayload>('config.catalog');
      const values = new Map<string, unknown>(Object.entries(payload?.values ?? {}));
      return { values };
    },

    async writeKey(key: string, value: unknown): Promise<ConfigWriteResult> {
      const result = await client.rpc<{ ok: boolean }>('config.write', { path: key, value });
      if (result?.ok) return { ok: true };
      return { ok: false, reason: 'the daemon refused the write (invalid path)' };
    },

    async writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult> {
      // The ARRAY form of config.write: each element is one literal key segment,
      // so a dotted leaf (models.tasks['context.assemble']) is written un-mis-nested.
      const result = await client.rpc<{ ok: boolean }>('config.write', { path: segments, value });
      if (result?.ok) return { ok: true };
      return { ok: false, reason: 'the daemon refused the write (invalid path)' };
    },

    async rawConfig(): Promise<Record<string, unknown>> {
      // The existing config.show read: the raw parsed ~/.insrc/config.json (or {}),
      // the source of dynamic per-role overrides the config.catalog snapshot omits.
      const raw = await client.rpc<Record<string, unknown>>('config.show');
      return raw ?? {};
    },
  };
}
