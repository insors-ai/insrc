/**
 * Story E20260922401ae5fb:S001 / t5 — the daemon-backed ConfigGateway (sc8).
 *
 * The VS-Code-free boundary that maps sc8's ConfigGateway onto the EXISTING sc1
 * SharedIpcClient. `catalog()` wraps `config.catalog` (mapping its `values`
 * record into a path-keyed Map); `writeKey()` wraps `config.write`, returning a
 * ConfigWriteResult that carries the daemon's restartRequired / reason / detail
 * (Epic ce99b72065d03b1b, Story s6). No new daemon capability is introduced —
 * only these two existing IPC methods are called (k3), and there is no cloud
 * path (k2). Constructed in extension.ts from the shared client.
 */

import type { IpcClient } from '../../../src/shared/ipc-client.js';
import type { ConfigCatalogSnapshot, ConfigGateway, ConfigWriteResult } from './types.js';

/** The subset of the `config.catalog` payload sc8's pull consumes (S001: values only). */
interface CatalogPayload {
  readonly values?: Readonly<Record<string, unknown>>;
}

/** config.write's answer as the daemon sends it (an older daemon sends only `ok`). */
interface DaemonWriteAnswer {
  readonly ok?: boolean;
  readonly restartRequired?: boolean;
  readonly reason?: string;
  readonly detail?: string;
}

/** The daemon's answer as a ConfigWriteResult: restartRequired on success; reason and detail on refusal. */
function writeResult(answer: DaemonWriteAnswer | undefined): ConfigWriteResult {
  if (answer?.ok === true) return answer.restartRequired === true ? { ok: true, restartRequired: true } : { ok: true };
  const reason = typeof answer?.reason === 'string' && answer.reason.length > 0 ? answer.reason : 'refused';
  return typeof answer?.detail === 'string' && answer.detail.length > 0 ? { ok: false, reason, detail: answer.detail } : { ok: false, reason };
}

/**
 * Build the sc8 ConfigGateway over the shared daemon client. `catalog()` may
 * reject (daemon unreachable) — the engine's pull catches it. `writeKey()`
 * resolves a ConfigWriteResult: `{ok:true}` keeps restartRequired, a refusal keeps
 * the daemon's reason and detail ('refused' when an older daemon gives no reason), and a socket
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
      return writeResult(await client.rpc<DaemonWriteAnswer>('config.write', { path: key, value }));
    },

    async writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult> {
      // The ARRAY form of config.write: each element is one literal key segment,
      // so a dotted leaf (models.tasks['context.assemble']) is written un-mis-nested.
      return writeResult(await client.rpc<DaemonWriteAnswer>('config.write', { path: segments, value }));
    },

    async rawConfig(): Promise<Record<string, unknown>> {
      // The existing config.show read: the raw parsed ~/.insrc/config.json (or {}),
      // the source of dynamic per-role overrides the config.catalog snapshot omits.
      const raw = await client.rpc<Record<string, unknown>>('config.show');
      return raw ?? {};
    },
  };
}
