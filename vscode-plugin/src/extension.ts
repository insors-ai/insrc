/**
 * Story E20260921ad0d45c9:S001 / t2+t6 — the VS Code extension entry.
 *
 * This is the ONLY module that imports `vscode`. It binds the real editor API
 * into the injectable surfaces and hands them to the VS-Code-free activation
 * core. It owns no reasoning (k2) and reaches the daemon only through the shared
 * ipc-client (k5). The Marketplace listing + packaging is Story S006.
 */
import * as vscode from 'vscode';

import { createIpcClient } from '../../src/shared/ipc-client.js';
import { createStatusSurface } from './surfaces/status-surface.js';
import { createCommandRegistry } from './surfaces/command-registry.js';
import { createConsentGate } from './surfaces/consent-gate.js';
import { activateExtension } from './activation.js';
import type { StatusBarHandle } from './surfaces/types.js';

/**
 * VS Code activation entry. Constructs the shared daemon client + the sc2/sc3/sc4
 * surfaces from the real editor API, registers the status-bar item into
 * `context.subscriptions` (auto-disposed on deactivate — no duplicate on
 * re-activate), and starts the off-UI reachability probe. Never throws.
 */
export function activate(context: vscode.ExtensionContext): void {
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  // The StatusBarItem satisfies the structural StatusBarHandle used by sc2.
  const status = createStatusSurface(statusItem as unknown as StatusBarHandle);
  context.subscriptions.push(statusItem);

  const client = createIpcClient();

  // sc3 + sc4 are stood up here so later stories can register commands / prompts;
  // s1 registers no command bodies and performs no invasive action itself.
  createCommandRegistry(
    (command, callback) => vscode.commands.registerCommand(command, callback),
    context.subscriptions,
  );
  createConsentGate((message, options, ...items) =>
    vscode.window.showInformationMessage(message, options, ...items),
  );

  activateExtension({ client, status });
}

/**
 * Deactivation is a no-op: every Disposable the extension created is registered
 * in `context.subscriptions`, which VS Code disposes automatically on deactivate.
 */
export function deactivate(): void {
  /* nothing to do — subscriptions are auto-disposed by the host */
}
