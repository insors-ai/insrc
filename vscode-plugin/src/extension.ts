/**
 * The VS Code extension entry (S001 foundation + S002 daemon lifecycle).
 *
 * This is the ONLY module that imports `vscode`. It binds the real editor API
 * into the injectable surfaces and hands them to the VS-Code-free cores. It owns
 * no reasoning (k2) and reaches the daemon only through the shared ipc-client +
 * the daemon's own scripts (k5). The Marketplace listing + packaging is Story S006.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import * as vscode from 'vscode';

import { createIpcClient } from '../../src/shared/ipc-client.js';
import { createStatusSurface } from './surfaces/status-surface.js';
import { createCommandRegistry } from './surfaces/command-registry.js';
import { createConsentGate } from './surfaces/consent-gate.js';
import { activateExtension } from './activation.js';
import { defaultSubprocessRunner } from './daemon/subprocess.js';
import { defaultDaemonPaths } from './daemon/paths.js';
import { createDaemonLifecycleController } from './daemon/controller.js';
import { registerDaemonCommands } from './daemon/commands.js';
import { defaultHostFileSystem } from './hosts/fs.js';
import { createHostRegistry } from './hosts/adapter.js';
import { HOST_SPECS } from './hosts/specs.js';
import { registerHostCommands } from './hosts/commands.js';
import type { HostEnv } from './hosts/types.js';
import { createWorkspaceRegistrar } from './workspace/registrar.js';
import { registerWorkspaceCommands } from './workspace/commands.js';
import type { PromptStore, WorkspaceFolders } from './workspace/types.js';
import { runOnboarding } from './onboarding/onboarding.js';
import type { OnboardingStore } from './onboarding/types.js';
import type { StatusBarHandle } from './surfaces/types.js';
import { createConfigSyncEngine } from './config/sync-engine.js';
import { createDaemonConfigGateway } from './config/gateway.js';
import { CONFIG_KEY_MAP } from './config/key-map.js';
import type { ChangedKey, Notifier, SettingsStore } from './config/types.js';

/** The workspaceState key prefix for the one-time register-prompt dismissal flag (S004). */
const REGISTER_DISMISSED_KEY = 'insrc.workspace.register.dismissed';
/** The workspaceState key prefix for the one-time onboarding-completed flag (S005). */
const ONBOARDED_KEY = 'insrc.workspace.onboarded';

/**
 * VS Code activation entry. Constructs the shared daemon client + the sc2/sc3/sc4
 * surfaces from the real editor API, wires the daemon lifecycle commands (S002),
 * registers the status-bar item into `context.subscriptions` (auto-disposed on
 * deactivate), and starts the off-UI reachability probe + a first-run Install
 * offer. Never throws / never blocks the editor.
 */
export function activate(context: vscode.ExtensionContext): void {
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  // The StatusBarItem satisfies the structural StatusBarHandle used by sc2.
  const status = createStatusSurface(statusItem as unknown as StatusBarHandle);
  context.subscriptions.push(statusItem);

  const client = createIpcClient();

  const commands = createCommandRegistry(
    (command, callback) => vscode.commands.registerCommand(command, callback),
    context.subscriptions,
  );
  const consent = createConsentGate((message, options, ...items) =>
    vscode.window.showInformationMessage(message, options, ...items),
  );

  // S002 sc6: the daemon lifecycle controller over the daemon's own scripts, and
  // its durable commands (install gated by sc4; start/stop/restart/update).
  const paths = defaultDaemonPaths(context.extensionPath);
  const controller = createDaemonLifecycleController({
    runner: defaultSubprocessRunner,
    paths,
    client,
  });
  registerDaemonCommands({ commands, consent, status, controller });

  // S003 sc5: the pluggable AI-host registry over the real editor env + fs, with
  // the insrc-mcp launch target resolved from the same daemon home S002 installs.
  const env: HostEnv = {
    getExtension: (id) => vscode.extensions.getExtension(id) !== undefined,
    appName: vscode.env.appName,
    uriScheme: vscode.env.uriScheme,
  };
  const registry = createHostRegistry(HOST_SPECS, {
    env,
    fs: defaultHostFileSystem,
    launchTarget: () => {
      const target = join(paths.daemonRoot, 'out', 'bin', 'insrc-mcp.js');
      return existsSync(target) ? target : undefined;
    },
  });
  registerHostCommands({ commands, consent, status, registry });

  // S004 sc7: the workspace registrar over the shared client + the real
  // workspace-folders + a per-workspace persisted prompt-dismissed flag.
  const registrar = createWorkspaceRegistrar({ client });
  const folders: WorkspaceFolders = () =>
    vscode.workspace.workspaceFolders?.map((f) => f.uri.fsPath) ?? [];
  const prompts: PromptStore = {
    wasDismissed: (key) => {
      try {
        return context.workspaceState.get<boolean>(`${REGISTER_DISMISSED_KEY}:${key}`, false);
      } catch {
        return false;
      }
    },
    markDismissed: (key) => {
      try {
        void context.workspaceState.update(`${REGISTER_DISMISSED_KEY}:${key}`, true);
      } catch {
        /* a persistence failure must never break the flow */
      }
    },
  };
  registerWorkspaceCommands({ commands, consent, status, registrar, folders });

  activateExtension({ client, status });

  // S001-settings-UI sc8: the ConfigSync engine that keeps the native
  // `contributes.configuration` surface truthful to the daemon. The real
  // bindings live here (the sole `vscode` importer): a ConfigGateway over the
  // existing sc1 client (config.catalog/config.write only — no new capability,
  // k3), a SettingsStore over `workspace.getConfiguration` writing at the Global
  // (user) target (machine-scope is enforced by the manifest `scope:"machine"`
  // declaration, not a write target — VS Code has no machine target), and a
  // Notifier over `showErrorMessage`. Pull runs off the activation path (never
  // throws/blocks, S001 preserved); a change listener live-pushes insrc.* edits.
  const configSettings: SettingsStore = {
    read: (key) => vscode.workspace.getConfiguration().get(key),
    write: async (key, value) => {
      await vscode.workspace.getConfiguration().update(key, value, vscode.ConfigurationTarget.Global);
    },
    snapshot: () => {
      const values = new Map<string, unknown>();
      const config = vscode.workspace.getConfiguration();
      for (const entry of CONFIG_KEY_MAP.entries) {
        values.set(entry.nativeKey, config.get(entry.nativeKey));
      }
      return values;
    },
  };
  const configNotifier: Notifier = {
    error: (message) => {
      void vscode.window.showErrorMessage(message);
    },
  };
  const configSync = createConfigSyncEngine({
    gateway: createDaemonConfigGateway(client),
    settings: configSettings,
    notifier: configNotifier,
    keyMap: CONFIG_KEY_MAP,
  });
  // Reconcile the native mirror with the daemon on activation (non-blocking).
  void configSync.pullFromDaemon();
  // Live-push each native insrc.* edit to the daemon (diff/validate/write in sc8).
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('insrc')) return;
      const config = vscode.workspace.getConfiguration();
      const changed: ChangedKey[] = [];
      for (const entry of CONFIG_KEY_MAP.entries) {
        if (event.affectsConfiguration(entry.nativeKey)) {
          changed.push({ key: entry.nativeKey, value: config.get(entry.nativeKey) });
        }
      }
      if (changed.length > 0) void configSync.applyChanges(changed);
    }),
  );

  // S005 sc-capstone: the per-workspace one-time onboarding-completed flag over
  // workspaceState (distinct key from the S004 register-dismissed flag).
  const onboarded: OnboardingStore = {
    wasOnboarded: (root) => {
      try {
        return context.workspaceState.get<boolean>(`${ONBOARDED_KEY}:${root}`, false);
      } catch {
        return false;
      }
    },
    markOnboarded: (root) => {
      try {
        void context.workspaceState.update(`${ONBOARDED_KEY}:${root}`, true);
      } catch {
        /* a persistence failure must never break the flow */
      }
    },
  };

  // S005: ONE coherent first-run onboarding sequence (install → register → wire),
  // replacing the three scattered fire-and-forget offer IIFEs — off the activation
  // critical path, guarded so activate() never throws/blocks (S001 preserved). Any
  // step the developer skips stays reachable via its durable command (ac2); the
  // uninstall reversal is the vscode:uninstall hook (src/uninstall.ts).
  void (async () => {
    try {
      await runOnboarding({ controller, registrar, registry, consent, status, folders, prompts, onboarded });
    } catch {
      /* never let onboarding surface an error into activation */
    }
  })();
}

/**
 * Deactivation is a no-op: every Disposable the extension created is registered
 * in `context.subscriptions`, which VS Code disposes automatically on deactivate.
 */
export function deactivate(): void {
  /* nothing to do — subscriptions are auto-disposed by the host */
}
