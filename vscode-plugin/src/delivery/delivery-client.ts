/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The delivery board's client (E2 s1, sc1): the board's only path to delivery
 * data, the daemon's workflow.delivery and workflow.deliveryEvidence methods.
 *
 * Every request carries the open workspace's root as `repo`, so the board never
 * falls back to the daemon's own INSRC_REPO; with no folder open the daemon is
 * not called at all. Each call races a deadline, because the shared IPC client
 * sets no timeout of its own, and an answer that arrives after it is ignored.
 * Neither method rejects: every outcome is a typed DeliveryResult, so the board
 * can tell an unavailable daemon, a failed or timed-out read and a missing
 * workspace apart. vscode-free; the rpc function is injected.
 */

import type { DeliveryEvidenceRecord, DeliverySnapshot } from './delivery-contract.js';
import { errorText, isObject } from './guards.js';

export type DeliveryFailureKind = 'daemon-unavailable' | 'read-failed' | 'timed-out' | 'no-workspace';

export interface DeliveryFailure {
  readonly kind: DeliveryFailureKind;
  /** The daemon's error text, the socket error message, or a fixed text for a timeout or an unsupported shape. */
  readonly message: string;
}

export type DeliveryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: DeliveryFailure };

export interface DeliveryClientDeps {
  readonly rpc: <T>(method: string, params?: unknown) => Promise<T>;
  /** The workspace root, or null when no folder is open. */
  readonly repo: string | null;
  readonly deadlinesMs: { readonly snapshot: number; readonly evidence: number };
}

export interface DeliveryClient {
  snapshot(): Promise<DeliveryResult<DeliverySnapshot>>;
  evidence(artifactId: string): Promise<DeliveryResult<DeliveryEvidenceRecord>>;
}

/** The shared IPC client's fixed rejection when the daemon socket is missing or refuses (ENOENT / ECONNREFUSED). */
const NOT_RUNNING_PREFIX = 'daemon is not running';

const NO_WORKSPACE = 'Open a folder to see its delivery board.';

const fail = <T>(kind: DeliveryFailureKind, message: string): DeliveryResult<T> => ({ ok: false, failure: { kind, message } });


/** One rpc call bounded by a deadline; resolves to the answer, a rejection, or the timeout, whichever comes first. */
function race(call: () => Promise<unknown>, deadlineMs: number): Promise<{ readonly kind: 'answer'; readonly value: unknown } | { readonly kind: 'rejected'; readonly error: unknown } | { readonly kind: 'timeout' }> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ kind: 'timeout' });
    }, deadlineMs);
    const settle = (outcome: { readonly kind: 'answer'; readonly value: unknown } | { readonly kind: 'rejected'; readonly error: unknown }): void => {
      if (settled) return;   // a late answer after the deadline is ignored
      settled = true;
      clearTimeout(timer);
      resolve(outcome);
    };
    let pending: Promise<unknown>;
    try {
      pending = call();
    } catch (error) {
      settle({ kind: 'rejected', error });
      return;
    }
    pending.then((value) => settle({ kind: 'answer', value }), (error: unknown) => settle({ kind: 'rejected', error }));
  });
}

function rejectionFailure<T>(error: unknown): DeliveryResult<T> {
  const message = errorText(error);
  return fail(message.startsWith(NOT_RUNNING_PREFIX) ? 'daemon-unavailable' : 'read-failed', message);
}

/** The daemon's own { error } arm, returned as a successful result. */
function daemonError(value: unknown): string | null {
  return isObject(value) && typeof value['error'] === 'string' ? value['error'] : null;
}

/** One bounded daemon call, classified: no workspace, timeout, rejection, the daemon's { error } arm, or a non-object answer. */
async function callDaemon(
  deps: DeliveryClientDeps,
  method: 'workflow.delivery' | 'workflow.deliveryEvidence',
  params: Record<string, string>,
  deadlineMs: number,
  what: string,
): Promise<DeliveryResult<Record<string, unknown>>> {
  if (deps.repo === null) return fail('no-workspace', NO_WORKSPACE);
  const repo = deps.repo;
  const outcome = await race(() => deps.rpc(method, { repo, ...params }), deadlineMs);
  if (outcome.kind === 'timeout') return fail('timed-out', `The daemon did not answer ${method} within ${deadlineMs / 1000} s.`);
  if (outcome.kind === 'rejected') return rejectionFailure(outcome.error);
  const error = daemonError(outcome.value);
  if (error !== null) return fail('read-failed', error);
  if (!isObject(outcome.value)) return fail('read-failed', `The daemon returned ${what} that is not an object.`);
  return { ok: true, value: outcome.value };
}

export function createDeliveryClient(deps: DeliveryClientDeps): DeliveryClient {
  return {
    async snapshot() {
      const r = await callDaemon(deps, 'workflow.delivery', {}, deps.deadlinesMs.snapshot, 'a delivery snapshot');
      if (!r.ok) return r;
      if (r.value['schemaVersion'] !== 1) {
        return fail('read-failed', `The daemon returned delivery snapshot schemaVersion ${String(r.value['schemaVersion'])}; this board reads schemaVersion 1.`);
      }
      for (const field of ['items', 'rootIds', 'notices'] as const) {
        if (!Array.isArray(r.value[field])) return fail('read-failed', `The daemon returned a delivery snapshot whose ${field} is not a list.`);
      }
      return { ok: true, value: r.value as unknown as DeliverySnapshot };
    },

    async evidence(artifactId) {
      const r = await callDaemon(deps, 'workflow.deliveryEvidence', { artifactId }, deps.deadlinesMs.evidence, 'an evidence record');
      if (!r.ok) return r;
      return { ok: true, value: r.value as unknown as DeliveryEvidenceRecord };
    },
  };
}
