/**
 * The answer shapes of the Jira ops (the part of each output-union member after the literal `op`). Only the properties a
 * caller needs are typed (key, id, name, and a watcher's accountId); everything else acli prints is left out or passes
 * through as unknown, so acli adding or nulling a property never fails a call.
 */

import { Type } from '@sinclair/typebox';
import type { TSchema } from '@sinclair/typebox';

export type Shape = Readonly<Record<string, TSchema>>;

const KeyId = { key: Type.String(), id: Type.String(), fields: Type.Optional(Type.Unknown()) };

/** {ok, target, message}: every op that changes Jira. `target` is the key(s) changed or, for create and clone, the new key(s). */
export const changeShape: Shape = { ok: Type.Boolean(), target: Type.String(), message: Type.String() };

export const viewShape: Shape = { item: Type.Object({ ...KeyId, transitions: Type.Optional(Type.Unknown()) }) };
export const searchShape: Shape = { count: Type.Number(), items: Type.Array(Type.Object(KeyId)) };
export const countShape: Shape = { count: Type.Number() };
export const attachmentListShape: Shape = { count: Type.Number(), attachments: Type.Array(Type.Unknown()) };
export const watcherListShape: Shape = { count: Type.Number(), watchers: Type.Array(Type.Object({ accountId: Type.Optional(Type.String()), displayName: Type.Optional(Type.String()) })) };
export const commentListShape: Shape = { total: Type.Number(), isLast: Type.Boolean(), comments: Type.Array(Type.Unknown()) };
/** One of the two, by the lookup asked for. */
export const visibilityShape: Shape = {
  groups: Type.Optional(Type.Array(Type.Object({ name: Type.String(), id: Type.String() }))),
  roles: Type.Optional(Type.Array(Type.String())),
};
export const linkListShape: Shape = { links: Type.Array(Type.Unknown()) };
export const linkTypesShape: Shape = { types: Type.Array(Type.String()) };

const Project = Type.Object({ key: Type.String(), id: Type.String(), name: Type.String() });
export const projectListShape: Shape = { count: Type.Number(), projects: Type.Array(Project) };
export const projectViewShape: Shape = { project: Project };

export const authStatusShape: Shape = {
  signedIn: Type.Boolean(),
  site: Type.Optional(Type.String()),
  email: Type.Optional(Type.String()),
  authType: Type.Optional(Type.String()),
};
