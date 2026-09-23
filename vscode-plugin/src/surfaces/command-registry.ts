/**
 * Story E20260921ad0d45c9:S001 / t4 — sc3 CommandRegistry.
 *
 * A durable-command registration surface: every first-class insrc command
 * (install, wire, register, and the daemon lifecycle actions) is registered here
 * so no dismissed onboarding prompt becomes a dead end (k6). s1 registers no
 * command bodies itself — it only provides the registry that s2/s3/s4/s5
 * populate. Built over an INJECTED `registerCommand` fn + a Disposable sink so it
 * is unit-testable off the editor.
 */
import type { DisposableLike, DisposableSink, RegisterCommandFn } from './types.js';

/** The closed set of first-class command ids the extension exposes. */
export type InsrcCommandId =
  | 'insrc.daemon.install'
  | 'insrc.daemon.start'
  | 'insrc.daemon.stop'
  | 'insrc.daemon.restart'
  | 'insrc.daemon.update'
  | 'insrc.hosts.wire'
  | 'insrc.workspace.register'
  | 'insrc.settings.refresh'
  | 'insrc.status.menu'
  | 'insrc.status.detailed'
  | 'insrc.status.repoConfig';

export interface CommandDescriptor {
  id: InsrcCommandId;
  title: string;
}

export interface CommandRegistry {
  /** Register a durable command; its Disposable is stored in the subscriptions sink. */
  register(descriptor: CommandDescriptor, run: () => Promise<void>): void;
}

/**
 * Build the sc3 CommandRegistry. A duplicate {@link InsrcCommandId} is a
 * programming error and throws — s1 owns no command bodies, so this only fires on
 * downstream misuse.
 */
export function createCommandRegistry(registerCommand: RegisterCommandFn, subscriptions: DisposableSink): CommandRegistry {
  const seen = new Set<InsrcCommandId>();

  return {
    register(descriptor: CommandDescriptor, run: () => Promise<void>): void {
      if (seen.has(descriptor.id)) {
        throw new Error(`insrc command already registered: ${descriptor.id}`);
      }
      seen.add(descriptor.id);
      const disposable: DisposableLike = registerCommand(descriptor.id, () => run());
      subscriptions.push(disposable);
    },
  };
}
