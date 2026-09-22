/**
 * Story E20260921ad0d45c9:S004 / t1 — createWorkspaceRegistrar (sc7).
 *
 * The sc7 implementation over the shared ipc-client: state() derives enrolment
 * from the daemon's repo.list registry (never assumes, k3) and register() enrols
 * ONLY through repo.add (ac2/k3). Pure over the injected IpcClient — no VS Code
 * dependency — mirroring the S002 createDaemonLifecycleController factory.
 */
import { resolve } from 'node:path';

import type { IpcClient } from '../../../src/shared/ipc-client.js';
import type { RegistrationState, WorkspaceRegistrar } from './types.js';

/** A structural subset of the daemon's RegisteredRepo row — only `path` is load-bearing here. */
interface RepoRow {
  path: string;
}

function isRepoRow(value: unknown): value is RepoRow {
  return typeof value === 'object' && value !== null && typeof (value as { path?: unknown }).path === 'string';
}

export interface RegistrarDeps {
  /** The sc1 shared ipc-client the registrar issues repo.list / repo.add over. */
  client: IpcClient;
}

/**
 * Build the sc7 registrar over the injected shared client. `state` catches every
 * failure and returns registered:false (activation degrades, never hangs);
 * `register` surfaces a repo.add failure to the caller.
 */
export function createWorkspaceRegistrar(deps: RegistrarDeps): WorkspaceRegistrar {
  const { client } = deps;

  return {
    async state(root: string): Promise<RegistrationState> {
      try {
        const target = resolve(root);
        const rows = await client.rpc<unknown>('repo.list');
        if (!Array.isArray(rows)) return { root, registered: false };
        const registered = rows.some((row) => isRepoRow(row) && resolve(row.path) === target);
        return { root, registered };
      } catch {
        // Daemon down / socket error / malformed payload ⇒ treat as not-registered.
        return { root, registered: false };
      }
    },

    async register(root: string): Promise<RegistrationState> {
      // repo.add ONLY (k3). No `steering` key: the daemon must not also inject
      // steering / register host MCP clients — host wiring is the reversible s3
      // flow (no double-wiring, k2 boundary). Send the normalized root (the same
      // shape state() compares against). The daemon returns { ok:true } and
      // throws on a bad path, so a rejection propagates to the caller.
      await client.rpc<{ ok: true }>('repo.add', { path: resolve(root) });
      return { root, registered: true };
    },
  };
}
