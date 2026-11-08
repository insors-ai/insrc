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
 *
 * Story s3 adds two more existing-style calls: `repo.settings.get` and
 * `repo.settings.set` (the repo-scoped tracker settings the daemon owns).
 */

import type { RepoFieldDef } from '../../../src/config/repo-fields.js';
import type { SettingsResult } from '../../../src/daemon/repo-settings.js';
import type { IpcClient } from '../../../src/shared/ipc-client.js';
import type { ConfigCatalogSnapshot, ConfigGateway, ConfigWriteResult, DaemonRead } from './types.js';

/** The subset of the `config.catalog` payload sc8's pull consumes (S001: values only). */
interface CatalogPayload {
  readonly values?: Readonly<Record<string, unknown>>;
  /** Static repo-scoped tracker rows; absent from an older daemon. */
  readonly repoFields?: readonly RepoFieldDef[];
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
export function createDaemonConfigGateway(
  client: IpcClient,
  rpc: DaemonRead = (method, params) => client.rpc(method, params),
): ConfigGateway {
  return {
    async catalog(timeoutMs?: number): Promise<ConfigCatalogSnapshot> {
      const payload = await rpc<CatalogPayload>('config.catalog', undefined, timeoutMs);
      const values = new Map<string, unknown>(Object.entries(payload?.values ?? {}));
      return { values, repoFields: payload?.repoFields ?? [] };
    },

    async writeKey(key: string, value: unknown): Promise<ConfigWriteResult> {
      return writeResult(await client.rpc<DaemonWriteAnswer>('config.write', { path: key, value }));
    },

    async writeKeyPath(segments: readonly string[], value: unknown): Promise<ConfigWriteResult> {
      // The ARRAY form of config.write: each element is one literal key segment,
      // so a dotted leaf (models.tasks['context.assemble']) is written un-mis-nested.
      return writeResult(await client.rpc<DaemonWriteAnswer>('config.write', { path: segments, value }));
    },

    async rawConfig(timeoutMs?: number): Promise<Record<string, unknown>> {
      // The existing config.show read: the raw parsed ~/.insrc/config.json (or {}),
      // the source of dynamic per-role overrides the config.catalog snapshot omits.
      const raw = await rpc<Record<string, unknown>>('config.show', undefined, timeoutMs);
      return raw ?? {};
    },

    async repoSettings(repoPath: string, timeoutMs?: number): Promise<SettingsResult> {
      return await rpc<SettingsResult>('repo.settings.get', { repo: repoPath }, timeoutMs);
    },

    async writeRepoSetting(repoPath: string, key: string, value: string | boolean | null): Promise<ConfigWriteResult> {
      const result = await client.rpc<SettingsResult>('repo.settings.set', { repo: repoPath, key, value });
      return result.ok ? { ok: true } : { ok: false, reason: result.error.message };
    },
  };
}
