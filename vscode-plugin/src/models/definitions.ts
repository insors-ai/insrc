/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Procix Software India. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The daemon's model definitions as the VS Code extension reads them (Epic ce99b72065d03b1b,
 * Story s6). The answer to `models.definitions` is typed here structurally — the extension
 * imports no daemon module and keeps no family, model or effort list of its own; every
 * choice it offers or accepts comes from this answer. Shared by the model-tier picker and
 * the native-settings sync engine. VS-Code-free and pure.
 */

/** One model of a family, as the daemon serves it. */
export interface DefinedModel {
  readonly id: string;
  readonly aliases: readonly string[];
  readonly displayName?: string | undefined;
  readonly efforts: readonly string[];
  readonly source: 'shipped' | 'user-approved';
  /** Ollama only; absent when Ollama did not answer. */
  readonly installed?: boolean | undefined;
  /** Models of a family with a host: where the model runs. */
  readonly hosting?: 'cloud' | 'local' | undefined;
}

/** One model family (runner), as the daemon serves it. */
export interface DefinedFamily {
  readonly id: string;
  /** Present for a CLI family; absent for the local (Ollama) family. */
  readonly cliKind?: 'claude' | 'codex' | 'vibe' | undefined;
  /** Present when the family runs its CLI on a host (Ollama): its models are a closed list. */
  readonly host?: 'ollama' | undefined;
  readonly displayName: string;
  readonly tierDefaults?: Readonly<Record<string, { readonly model: string; readonly effort?: string | undefined }>> | undefined;
  readonly toolLoopModel?: string | undefined;
  readonly rejectedModels?: readonly string[] | undefined;
  readonly models: readonly DefinedModel[];
}

/** The `models.definitions` answer. */
export interface ModelDefinitions {
  readonly version: number;
  readonly defaultFamily: string;
  readonly families: readonly DefinedFamily[];
}

/** The family with this id, if the daemon serves it. */
export function familyOf(defs: ModelDefinitions, familyId: string): DefinedFamily | undefined {
  return defs.families.find((f) => f.id === familyId);
}

/** The model of a family named by id or alias, if the family serves it. */
export function servedModel(family: DefinedFamily, idOrAlias: string): DefinedModel | undefined {
  return family.models.find((m) => m.id === idOrAlias || m.aliases.includes(idOrAlias));
}

/** The tier a family runs by default: its tierDefaults[tier], else its tool-loop model with no
 *  effort (the local family), else its first model. Undefined for a family with no models. */
export function familyDefault(family: DefinedFamily, tier: string): { readonly model: DefinedModel; readonly effort: string } | undefined {
  const named = family.tierDefaults?.[tier];
  const model = named !== undefined ? servedModel(family, named.model)
    : family.toolLoopModel !== undefined ? servedModel(family, family.toolLoopModel)
    : family.models[0];
  if (model === undefined) return undefined;
  const effort = named?.effort !== undefined && model.efforts.includes(named.effort) ? named.effort : '';
  return { model, effort };
}

/**
 * What a failed daemon request means, in the user's terms. Four cases, by the rejection:
 * the daemon is not running ('daemon is not running…'); the connection closed mid-request
 * (a DaemonDisconnectedError, code 'disconnected' — it may have been carried out); the daemon
 * does not know the request (its own 'unknown method: …' answer — an older daemon); or any
 * other failure (a handler error, a malformed reply), shown as it is.
 */
export type DaemonFailure =
  | { readonly kind: 'not-running'; readonly text: string }
  | { readonly kind: 'disconnected'; readonly text: string }
  | { readonly kind: 'older-daemon'; readonly text: string }
  | { readonly kind: 'other'; readonly text: string };

export function classifyDaemonFailure(err: unknown): DaemonFailure {
  const message = err instanceof Error ? err.message : String(err);
  if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'disconnected') {
    return { kind: 'disconnected', text: 'the daemon closed the connection before answering' };
  }
  if (message.startsWith('daemon is not running')) return { kind: 'not-running', text: 'the daemon is not running' };
  if (message.startsWith('unknown method: ')) {
    return { kind: 'older-daemon', text: `the daemon does not know this request (${message}) — update the daemon (insrc: Update daemon)` };
  }
  return { kind: 'other', text: message };
}
