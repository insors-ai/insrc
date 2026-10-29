import type { ConnectionsManagerHost } from './host.js';

/** All entry points reveal one workbench-owned manager. Arguments never authorize effects. */
export const CONNECTION_COMMANDS = [
  ['insrc.openDataSources', 'Manage Connections'],
  ['insrc.connections.add', 'Add Connection'],
  ['insrc.connections.edit', 'Edit Connection'],
  ['insrc.connections.test', 'Test Connection'],
  ['insrc.connections.remove', 'Delete or Discard Connection'],
] as const;

export function registerConnectionCommands(
  register: (id: string, run: () => Promise<void>) => { dispose(): void },
  host: Pick<ConnectionsManagerHost, 'open'>,
): { dispose(): void } {
  // Untrusted command URI/menu arguments are intentionally ignored. Selection and
  // every effect require current daemon metadata and explicit manager controls.
  const subscriptions = CONNECTION_COMMANDS.map(([id]) => register(id, () => host.open()));
  return { dispose: () => { for (const subscription of subscriptions) subscription.dispose(); } };
}
