/**
 * The VS Code extension entry (S001 foundation + S002 daemon lifecycle).
 *
 * This is the ONLY module that imports `vscode`. It binds the real editor API
 * into the injectable surfaces and hands them to the VS-Code-free cores. It owns
 * no reasoning (k2) and reaches the daemon only through the shared ipc-client +
 * the daemon's own scripts (k5). The Marketplace listing + packaging is Story S006.
 */
import { existsSync, readFileSync, readdirSync, watch as fsWatch } from 'node:fs';
import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

import * as vscode from 'vscode';

import { createConnectionsDraftTests, createConnectionsMutationController } from './connections/gateway.js';
import { ConnectionsWorkbenchOwner } from './connections/session-owner.js';
import { ConnectionsManagerHost } from './connections/host.js';
import { registerConnectionCommands } from './connections/wiring.js';
import { ConnectionRemovals } from '../../src/shared/connection-manager/removal.js';
import { createIpcClient } from '../../src/shared/ipc-client.js';
import { PATHS } from '../../src/shared/paths.js';
import { createStatusSurface } from './surfaces/status-surface.js';
import { createCommandRegistry } from './surfaces/command-registry.js';
import { createConsentGate } from './surfaces/consent-gate.js';
import { activateExtension } from './activation.js';
import { defaultSubprocessRunner } from './daemon/subprocess.js';
import { defaultDaemonPaths } from './daemon/paths.js';
import { createDaemonLifecycleController } from './daemon/controller.js';
import { registerDaemonCommands, restartDaemonAndReport } from './daemon/commands.js';
import type { ModelDefinitions } from './models/definitions.js';
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
import { MERGED_KEY_MAP } from './config/key-map.js';
import type { ChangedKey, Notifier, SettingsStore } from './config/types.js';
import { createDaemonDataGateway } from './panels/daemon-gateway.js';
import { createWebviewPanelHost } from './panels/webview-host.js';
import { defaultProcessScan } from './panels/process-scan.js';
import { renderDaemonTab, renderWorkflowsTab } from './panels/detail-renderers.js';
import { renderDebugTab, createDebugTabController, createDebugActionHandler } from './panels/debug-renderer.js';
import { renderRepoConfig, createRepoConfigWriteHandler, createRepoRegisterProvidersHandler } from './panels/repo-config.js';
import { renderModelTiers, createModelTiersWriteHandler } from './panels/model-tiers.js';
import { createLogTail } from './panels/log-tail.js';
import { createOrphanKill, readManagedPid } from './panels/orphan-kill.js';
import type { PanelHandle } from './panels/types.js';
import { runSetModelTier, type DecisionResult, type ModelCheckResult } from './models/model-tier-picker.js';
import { runDaemonFreshnessCheck } from './freshness/daemon-freshness.js';
import { createChatPanelHost, CHAT_PANEL_TITLE, CHAT_VIEW_TYPE, DEFAULT_TURN_LOCK_TIMEOUT_MS, type ChatPanelChannel } from './chat/chat-panel.js';
import { createFileSessionLocks, defaultIsAlive, defaultProcessStartTime } from './chat/session-lock.js';
import { chatIsOffered, createQueueFactory, processAliveCheck, queuePathOf, repoKeyOf, windowKeyOf } from './chat/chat-queue-setup.js';
import type { SqliteDatabase } from './chat/chat-queue-store.js';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createChatGroupLock } from './chat/group-lock.js';
import { chooseReviewColumn } from './chat/review-column.js';
import { createFileChatSessionStore, migrateChatSessionsFromMemento } from './chat/session-file-store.js';
import { createSessionOutput } from './chat/session-output.js';
import { createAttachmentStore } from './chat/attachment-store.js';
import { createProviderRegistry, nodeSpawner, defaultBinaryProbe, deriveChatTitle } from './chat/cli-adapter.js';
import type { DiffView } from './chat/edit-governor.js';
import { createLinkOpener } from './chat/link-opener.js';
import { createDocsReviewHost, type DocsReviewHost } from './chat/docs-review-panel.js';
import { createDocsReviewClient } from './chat/docs-review-client.js';
import { createReviewPresenter } from './chat/review-presenter.js';
import { createCompanionReader } from './chat/companion-reader.js';
import { createGitBaseline } from './chat/git-baseline.js';
import { registerDeliveryBoard } from './delivery/board-wiring.js';
import { webviewChannel } from './chat/webview-channel.js';
import { execFile as nodeExecFile } from 'node:child_process';
import { promises as nodeFsp } from 'node:fs';
import { relative as pathRelative, isAbsolute as pathIsAbsolute, join as pathJoin } from 'node:path';
import { tmpdir as osTmpdir } from 'node:os';

/** The workspaceState key prefix for the one-time register-prompt dismissal flag (S004). */
const REGISTER_DISMISSED_KEY = 'insrc.workspace.register.dismissed';
/** The workspaceState key prefix for the one-time onboarding-completed flag (S005). */
const ONBOARDED_KEY = 'insrc.workspace.onboarded';
/** The globalState key for the last plugin version seen — the self-update trigger (S003 daemon-auto-update). */
const LAST_SEEN_PLUGIN_VERSION_KEY = 'insrc.daemonSelfUpdate.lastSeenPluginVersion';

/**
 * VS Code activation entry. Constructs the shared daemon client + the sc2/sc3/sc4
 * surfaces from the real editor API, wires the daemon lifecycle commands (S002),
 * registers the status-bar item into `context.subscriptions` (auto-disposed on
 * deactivate), and starts the off-UI reachability probe + a first-run Install
 * offer. Never throws / never blocks the editor.
 */
/** Session output files untouched this long, of sessions no longer in the store, are swept at start. */
const CHAT_OUTPUT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function activate(context: vscode.ExtensionContext): void {
  const statusItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  // The StatusBarItem satisfies the structural StatusBarHandle used by sc2.
  const status = createStatusSurface(statusItem as unknown as StatusBarHandle);
  context.subscriptions.push(statusItem);

  const client = createIpcClient();
  // Connection sessions outlive every manager view; no socket is opened until requested.
  const connectionsOwner = new ConnectionsWorkbenchOwner();
  context.subscriptions.push(connectionsOwner);
  const connectionMutations = createConnectionsMutationController(connectionsOwner);
  context.subscriptions.push(connectionMutations);
  const connectionRemovals = new ConnectionRemovals(connectionMutations);
  context.subscriptions.push(connectionRemovals);
  const connectionTests = createConnectionsDraftTests(connectionsOwner);
  context.subscriptions.push(connectionTests);

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
    homePathExists: (relPath) => existsSync(join(homedir(), relPath)),
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

  // Story E202610160e1265ed:S001: the controller lets activation start an installed daemon that the
  // probe finds stopped.
  // The settings pull, the update check and onboarding all need a reachable daemon, so they wait for
  // activation to settle (the probe and any automatic start finished) instead of racing the start.
  let resolveActivationSettled: () => void = () => {};
  const activationSettled = new Promise<void>((resolve) => {
    resolveActivationSettled = resolve;
  });
  activateExtension({ client, status, controller, onSettled: () => resolveActivationSettled() });

  // S003 daemon-auto-update: keep the locally-installed daemon current. This is the
  // SOLE vscode importer, so it binds the real seams — the daemon-owned update+restart
  // IPC (client.update/updateOutcome, sc1; NEVER a daemon-ctl.sh shell-out, k2), the
  // installed-commit read (client.status, sc2), a plugin-side git ls-remote (no pull,
  // k1), a native Update/Dismiss notification (k7), and the per-plugin last-seen
  // version over globalState + packageJSON.version (self-update trigger, k4). Fired
  // fire-and-forget like runReachabilityProbe so it never blocks activation (k6); the
  // flow module itself never rejects, so no .catch is needed.
  void activationSettled.then(() => runDaemonFreshnessCheck({
    client,
    daemonRoot: paths.daemonRoot,
    gitLsRemote: (root, branch) =>
      new Promise<string>((resolve) => {
        // A failure/timeout ⇒ undeterminable ⇒ '' (the flow skips). Never reject.
        execFile('git', ['-C', root, 'ls-remote', 'origin', branch], { timeout: 15_000 }, (err, stdout) => {
          if (err !== null) {
            resolve('');
            return;
          }
          const firstLine = stdout.split('\n', 1)[0] ?? '';
          resolve(firstLine.split(/\s+/, 1)[0] ?? '');
        });
      }),
    notify: (message, ...actions) =>
      Promise.resolve(vscode.window.showInformationMessage(message, {}, ...actions)),
    versionState: {
      current: String(context.extension.packageJSON.version ?? ''),
      getLastSeen: () => context.globalState.get<string>(LAST_SEEN_PLUGIN_VERSION_KEY),
      setLastSeen: (v) => context.globalState.update(LAST_SEEN_PLUGIN_VERSION_KEY, v),
    },
    // Reload the window when the user accepts the post-update nudge: a reload
    // respawns the MCP host so claude/codex/vibe reconnect to the freshly updated daemon.
    reloadWindow: () =>
      Promise.resolve(vscode.commands.executeCommand('workbench.action.reloadWindow')).then(() => undefined),
  }));

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
      for (const entry of MERGED_KEY_MAP.entries) {
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
  // The sc8 ConfigGateway (config.catalog/config.show/config.write over the shared
  // client) — constructed once and reused by the ConfigSync engine AND the S007
  // Repo Configuration panel (its writeKeyPath/rawConfig per-repo read/write).
  const configGateway = createDaemonConfigGateway(client);
  // Offer a daemon restart for changes that apply only after one (s6): the action runs the
  // restart and reports whether the daemon came back (restartDaemonAndReport).
  const offerRestart = (message: string): void => {
    void Promise.resolve(vscode.window.showInformationMessage(message, {}, 'Restart daemon')).then((choice) => {
      if (choice === 'Restart daemon') void restartDaemonAndReport({ status, controller });
    });
  };
  const configSync = createConfigSyncEngine({
    gateway: configGateway,
    settings: configSettings,
    notifier: configNotifier,
    keyMap: MERGED_KEY_MAP,
    // Native tier edits are checked against the daemon's model definitions (s6).
    definitions: () => client.rpc<ModelDefinitions>('models.definitions'),
    onRestartRequired: (keys) => offerRestart(`insrc: ${keys.join(', ')} saved — restart the daemon to apply`),
  });
  // Reconcile the native mirror with the daemon on activation (non-blocking).
  void activationSettled.then(() => configSync.pullFromDaemon());
  // Live-push each native insrc.* edit to the daemon (diff/validate/write in sc8).
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('insrc')) return;
      const config = vscode.workspace.getConfiguration();
      const changed: ChangedKey[] = [];
      for (const entry of MERGED_KEY_MAP.entries) {
        if (event.affectsConfiguration(entry.nativeKey)) {
          changed.push({ key: entry.nativeKey, value: config.get(entry.nativeKey) });
        }
      }
      if (changed.length > 0) void configSync.applyChanges(changed);
    }),
  );
  // S003 sc8: a first-class 'Refresh insrc settings' command (k6) that drives the
  // on-demand reconcile — re-reads the daemon and republishes the native mirror,
  // so an external change from another client (CLI / JetBrains / other window) is
  // reconciled without reactivating. Registered via the shipped sc3 registry.
  commands.register(
    { id: 'insrc.settings.refresh', title: 'Refresh insrc settings' },
    () => configSync.pullFromDaemon(),
  );

  // S004-settings-UI sc9: the WebviewPanelHost + read-only DaemonDataGateway.
  // The real editor bindings live here (the sole `vscode` importer): the gateway
  // reads the daemon ONLY through the shared sc1 client (daemon.status/repo.list/
  // daemon.debug-status — no new capability, k3) plus the local .insrc/artifacts
  // tree and a POSIX process scan (no cloud, k2/ac4); the host wraps
  // window.createWebviewPanel + window.showQuickPick. The status-bar item's click
  // opens a 2-item menu, and both panels are first-class palette commands (k6).
  // A thin degrade-path logger for the panels. The plugin ships no pino logger
  // (that would drag the daemon logging stack into the thin extension bundle, k5);
  // panel diagnostics go to the Extension Host console, the idiomatic channel.
  const panelLog = {
    warn: (message: string): void => console.warn(`[insrc] ${message}`),
    error: (message: string): void => console.error(`[insrc] ${message}`),
  };
  const daemonData = createDaemonDataGateway({
    rpc: (method, params) => client.rpc(method, params),
    artifactsRoot: () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      return root === undefined ? undefined : join(root, '.insrc', 'artifacts');
    },
    processScan: defaultProcessScan,
    logger: panelLog,
  });
  const connectionManager = new ConnectionsManagerHost({
    owner: connectionsOwner, mutations: connectionMutations,
    tests: connectionTests, removals: connectionRemovals,
    registeredRoots: async () => (await daemonData.registeredRepos()).map(repo => repo.path),
    createPanel: () => {
      const panel = vscode.window.createWebviewPanel('insrc.connections', 'Connections', vscode.ViewColumn.Active,
        { enableScripts: true, localResourceRoots: [] });
      panel.iconPath = {
        light: vscode.Uri.file(join(context.extensionPath, 'media', 'connections-icon.svg')),
        dark: vscode.Uri.file(join(context.extensionPath, 'media', 'connections-icon-dark.svg')),
      };
      return { ...webviewChannel(panel), onVisibility: listener => {
        panel.onDidChangeViewState(event => listener(event.webviewPanel.visible));
      } };
    },
  });
  context.subscriptions.push(connectionManager, registerConnectionCommands(
    (id, run) => vscode.commands.registerCommand(id, run), connectionManager,
  ));
  // S006 sc9: ONE shared managed-daemon-pid resolver, read from the pidfile. Both
  // the Debug renderer (to exclude the managed daemon from the orphan offer) and
  // the consent-gated kill (defence-in-depth re-exclusion) read through it, so they
  // agree on which process is the managed one.
  const managedPid = (): number | undefined => readManagedPid(PATHS.pidFile);
  // S006 sc9: the plugin-local rotation-aware daemon-log tail over node:fs (mirrors
  // the daemon CLI's realTailDeps without importing the daemon service module, k5).
  const debugLogTail = createLogTail({
    logDir: PATHS.logDir,
    stem: 'daemon',
    listSegments: (dir, stem) => {
      const re = new RegExp(`^${stem}\\.(\\d+)\\.log$`);
      const matched: { file: string; n: number }[] = [];
      for (const name of readdirSync(dir)) {
        const m = re.exec(name);
        if (m !== null && m[1] !== undefined) matched.push({ file: join(dir, name), n: Number.parseInt(m[1], 10) });
      }
      matched.sort((a, b) => a.n - b.n);
      return matched.map((x) => x.file);
    },
    readLines: (file) => {
      const lines = readFileSync(file, 'utf8').split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop(); // drop the trailing empty.
      return lines;
    },
    watch: (dir, onEvent) => {
      const w = fsWatch(dir, { persistent: false }, () => onEvent());
      w.on('error', () => {
        /* watcher error — swallow; a re-open happens on the next follow */
      });
      return () => {
        try {
          w.close();
        } catch {
          /* ignore */
        }
      };
    },
    maxLines: 500,
  });
  // S006 sc9: the consent-gated orphan kill. NOT on the read-only gateway (killing
  // is a mutation); invoked only after sc4 consent below, and only for the
  // non-managed orphans the scan found (k4).
  const orphanKill = createOrphanKill({
    kill: (pid, signal) => {
      process.kill(pid, signal);
    },
    wait: (ms) => new Promise<void>((resolve) => { setTimeout(resolve, ms); }),
    managedPid,
    platform: process.platform,
  });
  const panelHost = createWebviewPanelHost({
    panels: ({ viewType, title }): PanelHandle => {
      // S005: enableScripts:true so the Detailed Status tab strip + Refresh can
      // drive on-demand re-renders via the host<->webview message bridge. The
      // rendered shell carries a strict CSP + per-render nonce (webview-host.ts),
      // so only the host's own nonce'd bootstrap script runs (XSS-safe). The
      // repo-config panel flows through the same factory (its script-less
      // placeholder is unaffected; the shared CSP shell still covers it).
      const panel = vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.Active, { enableScripts: true });
      return {
        setHtml: (html) => {
          panel.webview.html = html;
        },
        reveal: () => panel.reveal(),
        onDidDispose: (listener) => {
          panel.onDidDispose(listener);
        },
        onMessage: (listener) => {
          panel.webview.onDidReceiveMessage(listener);
        },
        postMessage: (message) => {
          // A webview post failure is non-fatal; swallow the rejection (never an
          // unhandled rejection). The host does not depend on the delivery result.
          panel.webview.postMessage(message).then(undefined, () => {
            /* ignore */
          });
        },
        dispose: () => panel.dispose(),
      };
    },
    pickMenu: (items) => Promise.resolve(vscode.window.showQuickPick(items, { placeHolder: 'insrc' })),
    gateway: daemonData,
    logger: panelLog,
    // S005: the daemon + workflows tab bodies. S006: the Debug tab body (mcp clients
    // + managed-pid-excluded orphans + live-log region).
    detailRenderers: { daemon: renderDaemonTab, workflows: renderWorkflowsTab, debug: renderDebugTab({ managedPid }) },
    // S006: the Debug tab's continuous log ticker (the epic's only ticker), armed
    // while the tab is active and disposed when it is left / the panel closes.
    tabControllers: { debug: createDebugTabController({ logTail: debugLogTail, logger: panelLog }) },
    // S006: a webview action from a tab body. The ONLY action is the Debug tab's
    // 'cleanupOrphans' — the VS-Code-free handler re-scans, drops the managed
    // daemon, prompts sc4 consent (k4), and kills only on accept, surfacing via sc2.
    onDetailAction: createDebugActionHandler({
      scanOrphans: () => daemonData.scanOrphans(),
      managedPid,
      consent,
      kill: orphanKill,
      status,
      logger: panelLog,
    }),
    // S007: the Repo Configuration panel body — a repo picker (folder-independent,
    // from the sc9 registeredRepos read) + the selected repo's per-repo model-tiering
    // form read from the sc8 gateway's rawConfig (config.show).
    repoRenderer: renderRepoConfig({
      registeredRepos: () => daemonData.registeredRepos(),
      rawConfig: () => configGateway.rawConfig(),
      mcpRegistration: () => daemonData.mcpRegistration(),
    }),
    // S007: the consent-gated per-repo write sink. Reuses the sc8 writeKeyPath ARRAY
    // form (config.write) — no new daemon capability (k3); gated by sc4 (k4); the
    // outcome surfaces via sc2 and the panel re-renders from fresh config (truthful).
    onRepoConfigWrite: createRepoConfigWriteHandler({
      consent,
      writeKeyPath: (segments, value) => configGateway.writeKeyPath(segments, value),
      registeredRepos: () => daemonData.registeredRepos(),
      status,
      logger: panelLog,
      refresh: () => panelHost.openRepoConfiguration(),
      offerRestart,
    }),
    // Post-setup provider registration: the repo form's Providers section posts
    // the checked (unregistered) providers; the sink consent-gates and calls the
    // daemon's mcp.register (steering injection + per-client MCP registration).
    onRepoRegisterProviders: createRepoRegisterProvidersHandler({
      consent,
      status,
      logger: panelLog,
      registeredRepos: () => daemonData.registeredRepos(),
      registerProviders: (repoPath, steering) => client.rpc('mcp.register', { path: repoPath, steering }),
      refresh: () => panelHost.openRepoConfiguration(),
    }),
    // Story S001: the Model Tiers panel body — one card per tier (core/mid/cheap)
    // from the daemon's model catalog + the global insrc.models.* raw config.
    modelTiersRenderer: renderModelTiers({
      modelDefinitions: () => client.rpc<ModelDefinitions>('models.definitions'),
      rawConfig: () => configGateway.rawConfig(),
    }),
    // Story S001: the Model Tiers write sink. Reuses the sc8 writeKeyPath ARRAY
    // form (config.write) — no new daemon capability, no per-repo consent (tiers
    // and the core floor are global, k6); the panel re-renders from fresh config.
    onModelTiersWrite: createModelTiersWriteHandler({
      writeKeyPath: (segments, value) => configGateway.writeKeyPath(segments, value),
      logger: panelLog,
      refresh: () => panelHost.openModelTiers(),
    }),
  });
  // The status-bar item's click target — set on the raw StatusBarItem (the sc2
  // StatusBarHandle carries no `command` field and is left untouched).
  statusItem.command = 'insrc.status.menu';
  commands.register({ id: 'insrc.status.menu', title: 'insrc status menu' }, () => panelHost.showStatusMenu());
  commands.register({ id: 'insrc.status.detailed', title: 'Open Detailed Status' }, async () => {
    panelHost.openDetailedStatus();
  });
  commands.register({ id: 'insrc.status.repoConfig', title: 'Open Repo Configuration' }, async () => {
    panelHost.openRepoConfiguration();
  });
  commands.register({ id: 'insrc.status.modelTiers', title: 'Open Model Tiers' }, async () => {
    panelHost.openModelTiers();
  });

  // S003-model-picker sc2 consumer: the 'insrc: Set model tier' guided command. A
  // DUMB dropdown over the shipped sc2 list-models IPC (client.rpc, no new daemon
  // capability, k3) that turns the free-text global model-tier field into an
  // authoritative pick. The real editor seams live here (the sole `vscode`
  // importer): listModels over the shared client, catalog+writeKeyPath over the
  // already-hoisted sc8 configGateway, pick over showQuickPick, notify over
  // showInformationMessage. All flow/k7 logic is in the VS-Code-free module.
  commands.register({ id: 'insrc.models.setTier', title: 'insrc: Set model tier' }, () =>
    runSetModelTier({
      definitions: () => client.rpc<ModelDefinitions>('models.definitions'),
      rawConfig: () => configGateway.rawConfig(),
      writeKeyPath: (segments, value) => configGateway.writeKeyPath(segments, value),
      restartDaemon: () => restartDaemonAndReport({ status, controller }),
      pick: (items, opts) => Promise.resolve(vscode.window.showQuickPick(items, opts)),
      // The bundled vscode.d.ts stub's showInformationMessage requires the options
      // arg; {} (all fields optional) satisfies it, followed by any action buttons.
      notify: (message, ...actions) => Promise.resolve(vscode.window.showInformationMessage(message, {}, ...actions)),
      // The unlisted-model check and decision (models.check / approve / reject, s6).
      check: (params) => client.rpc<ModelCheckResult | { error: string }>('models.check', params),
      approve: (params) => client.rpc<DecisionResult>('models.approve', params),
      reject: (params) => client.rpc<DecisionResult>('models.reject', params),
      input: (opts) => Promise.resolve(vscode.window.showInputBox(opts)),
      pickMany: (items, opts) => Promise.resolve(vscode.window.showQuickPick(items, { ...opts, canPickMany: true })),
    }),
  );

  // S003 (Phase B): the terminal chat panel, gated behind insrc.chat.enabled
  // (default false). When enabled, wire createChatPanelHost with the real injected
  // vscode channel seams (mirroring the status panel at :305), the memento-backed
  // sc4 ChatSessionStore (chat history extension-local, k3), and the sc5
  // ProviderRegistry over the installed claude/codex/vibe CLIs. The chat command is
  // registered ONLY when the flag is on, so the surface is invisible until opted in.
  const chatEnabled = vscode.workspace.getConfiguration().get<boolean>('insrc.chat.enabled') === true;
  // E2 s4: the docs-review pane, when the chat gate creates one, is also where the
  // delivery board opens a record awaiting review; declared here so the board,
  // registered outside the gate, can receive it.
  let docsReviewHost: DocsReviewHost | undefined;
  if (chatEnabled) {
    // Chat sessions are kept in files under ~/.insrc/chat-sessions (ISSUE-c96a97a2): VS Code stores
    // all of an extension's globalState as one value, so a session kept there was rewritten whole,
    // with every other session, on each save. Sessions still in globalState are moved to the files
    // first; one that could not be moved stays there and is tried again at the next start.
    // S005: the history is capped; save() evicts the oldest non-active sessions beyond the cap.
    // Each chat session's CLI output goes to ONE rolling file under ~/.insrc/chat-output (turns
    // are segments in it), so nothing is lost when a turn runs long or the window reloads. A
    // session's files go with it when the store evicts it; stale files are swept at start.
    const chatOutput = createSessionOutput({ root: join(PATHS.insrc, 'chat-output'), logger: panelLog });
    // The images pasted and documents attached in a chat are copied to the chat's own directory
    // under ~/.insrc/chat-attachments, the only directory a turn is allowed to read them from.
    // They go with their session on eviction and are swept at start, like its output files.
    const chatAttachments = createAttachmentStore({ root: join(PATHS.insrc, 'chat-attachments'), logger: panelLog });
    const chatSessionsRoot = join(PATHS.insrc, 'chat-sessions');
    const migratedChats = migrateChatSessionsFromMemento({ memento: context.globalState, root: chatSessionsRoot, logger: panelLog });
    const chatStore = createFileChatSessionStore({
      root: chatSessionsRoot,
      logger: panelLog,
      maxSessions: 200,
      onEvict: (id) => {
        void chatOutput.remove(id).catch((e: unknown) => panelLog.warn(`chat output of ${id} not removed: ${String(e)}`));
        void chatAttachments.removeSession(id).catch((e: unknown) => panelLog.warn(`chat attachments of ${id} not removed: ${String(e)}`));
      },
    });
    const chatProviders = createProviderRegistry({ spawn: nodeSpawner, isInstalled: defaultBinaryProbe, sessionOutput: chatOutput });
    // A session the migration left in globalState is not in the store yet: its files are kept too.
    const chatKeep = new Set([...chatStore.list().map((c) => c.id), ...migratedChats.kept]);
    void chatOutput
      .sweep({ olderThanMs: CHAT_OUTPUT_MAX_AGE_MS, keep: chatKeep })
      .catch((e: unknown) => panelLog.warn(`chat output sweep failed: ${String(e)}`));
    void chatAttachments
      .sweep({ olderThanMs: CHAT_OUTPUT_MAX_AGE_MS, keep: chatKeep })
      .catch((e: unknown) => panelLog.warn(`chat attachments sweep failed: ${String(e)}`));

    // S006: edit-governance seams. All model access stays via the user's CLIs (k2); the
    // baseline shells local git (no new dependency, no cloud REST) and captures the exact
    // pre-turn working tree without disturbing it. Everything stays extension-local (k3).
    const chatCwd = (): string => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const runGit = (cwd: string, args: string[], env?: Record<string, string>): Promise<{ ok: boolean; stdout: string }> =>
      new Promise((resolve) => {
        const opts = { encoding: 'utf8' as const, maxBuffer: 64 * 1024 * 1024, ...(env !== undefined ? { env: { ...process.env, ...env } } : {}) };
        nodeExecFile('git', ['-C', cwd, ...args], opts, (err, stdout) => {
          resolve({ ok: err === null, stdout: stdout ?? '' });
        });
      });
    const relForGit = (cwd: string, p: string): string => (pathIsAbsolute(p) ? pathRelative(cwd, p) : p).split('\\').join('/');
    const absForFs = (cwd: string, p: string): string => (pathIsAbsolute(p) ? p : pathJoin(cwd, p));
    const readText = async (abs: string): Promise<string | undefined> => {
      try {
        const buf = await nodeFsp.readFile(abs);
        if (buf.includes(0)) return undefined; // binary -> no text diff
        return buf.toString('utf8');
      } catch {
        return undefined;
      }
    };
    // S006: git-backed baseline (untracked-safe + subdir-safe; see git-baseline.ts). Each turn's
    // snapshot is written through a private copy of the index, in the system temporary directory.
    let indexSeq = 0;
    const workspaceBaseline = createGitBaseline({
      runGit,
      cwd: chatCwd,
      toAbs: absForFs,
      toRel: relForGit,
      tempIndexPath: () => pathJoin(osTmpdir(), `insrc-chat-index-${process.pid}-${Date.now().toString(36)}-${indexSeq++}`),
      copyFile: async (from, to) => {
        try {
          await nodeFsp.copyFile(from, to);
          return true;
        } catch {
          return false;
        }
      },
      removeFile: (path) => nodeFsp.rm(path, { force: true }),
    });
    // Baseline docs for the native editor-diff (read-only left side), keyed by fs path.
    const baselineDocs = new Map<string, string>();
    const BASELINE_SCHEME = 'insrc-baseline';
    const baselineEmitter = new vscode.EventEmitter<vscode.Uri>();
    context.subscriptions.push(
      vscode.workspace.registerTextDocumentContentProvider(BASELINE_SCHEME, {
        onDidChange: baselineEmitter.event,
        provideTextDocumentContent: (uri) => baselineDocs.get(decodeURIComponent(uri.path)) ?? '',
      }),
    );

    // The chat opens as an EDITOR-TAB webview panel (like the Claude/Codex extensions), launched
    // from an insrc icon in the editor title bar (contributes.menus["editor/title"]) \u2014 NOT a left
    // Activity Bar container. createChatPanelHost is the S003 host, driven over an injected
    // editor-panel channel (the same wiring as before the sidebar experiment).
    //
    // S001 (bugfix): the ONE adapter that wraps any WebviewPanel (freshly created OR restored by
    // VS Code's WebviewPanelSerializer) into a ChatPanelChannel, so a restored panel is wired
    // identically to a fresh one. Sets the themed tab icon on either path.
    //
    // The chat's editor group is locked (insrc.chat.lockGroup, default on) so a file picked in
    // the Explorer opens in another group, not as a tab over the chat. All the logic — when to
    // lock, and what counts as the chat tab — lives in the vscode-free group-lock module; these
    // are thin seams only.
    const chatGroupLock = createChatGroupLock({
      enabled: () => vscode.workspace.getConfiguration().get<boolean>('insrc.chat.lockGroup') !== false,
      viewType: CHAT_VIEW_TYPE,
      activeTabInput: () => vscode.window.tabGroups.activeTabGroup.activeTab?.input,
      onTabsChanged: (listener) => {
        const tabs = vscode.window.tabGroups.onDidChangeTabs(() => listener());
        const groups = vscode.window.tabGroups.onDidChangeTabGroups(() => listener());
        return {
          dispose: () => {
            tabs.dispose();
            groups.dispose();
          },
        };
      },
      lockActiveGroup: () => vscode.commands.executeCommand('workbench.action.lockEditorGroup'),
      warn: panelLog.warn,
    });
    const webviewPanelChannel = (panel: vscode.WebviewPanel): ChatPanelChannel => {
      panel.iconPath = {
        light: vscode.Uri.file(join(context.extensionPath, 'media', 'insrc-icon.svg')),
        dark: vscode.Uri.file(join(context.extensionPath, 'media', 'insrc-icon-dark.svg')),
      };
      chatGroupLock.attach(panel);
      return webviewChannel(panel);
    };
    // Story E20261013e62a9269:S001: a document a chat turn presents for approval is opened in the
    // review pane, quietly. The review host is made below; the presenter reaches it when a
    // document is presented, by which time it exists.
    const reviewClient = createDocsReviewClient(client, { repo: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath });
    const reviewPresenter = createReviewPresenter({
      pendingDocuments: () => reviewClient.pendingDocuments(),
      open: (target) => docsReviewHost?.openArtifact({ ...target, quiet: true }),
      log: panelLog,
    });
    // Epic E20261014613abdb3 Story S001: the repository's chat queue, shared by every window on the
    // same working tree. node:sqlite is loaded only here and lazily, so a runtime without it disables
    // the chat in this window (with a notice) instead of failing the extension. Story S005: there is
    // no direct path; everything below that turns the chat on is gated on the queue existing.
    const chatQueue = createQueueFactory({
      path: queuePathOf(PATHS.insrc, repoKeyOf(chatCwd(), {
        gitTopLevel: (cwd) => execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }),
        realpath: (p) => realpathSync(p),
      })),
      openDatabase: (p) => {
        const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as { DatabaseSync: new (path: string) => SqliteDatabase };
        return new DatabaseSync(p);
      },
      now: () => Date.now(),
      pluginVersion: String(context.extension.packageJSON.version ?? ''),
      claim: {
        windowKey: windowKeyOf(
          { get: (k) => context.workspaceState.get<string>(k), update: (k, v) => context.workspaceState.update(k, v) },
          () => randomUUID(),
        ),
        pid: process.pid,
        ...(defaultProcessStartTime(process.pid) !== undefined ? { pidStartedAt: defaultProcessStartTime(process.pid)! } : {}),
      },
      isAlive: processAliveCheck(defaultIsAlive, defaultProcessStartTime),
      log: panelLog,
      notify: (message) => void vscode.window.showWarningMessage(message),
    });
    // The column a new review pane opens in: an open editor group without the chat tab (chat/review-column.ts).
    const reviewColumn = (): vscode.ViewColumn | undefined => {
      try {
        const groups = vscode.window.tabGroups.all.map((g) => ({ viewColumn: g.viewColumn as number, isActive: g.isActive, tabs: g.tabs.map((t) => ({ input: t.input })) }));
        return chooseReviewColumn(groups, CHAT_VIEW_TYPE) as vscode.ViewColumn | undefined;
      } catch (err) {
        panelLog.warn(`the editor groups could not be read for the review pane: ${String(err)}`);
        return undefined;
      }
    };
    // Epic babd84c6e2fb480a Story S001: a clicked link or code reference. An http(s) address opens in the browser; a file
    // inside the workspace opens at its line in the group the review pane would use, else beside the chat.
    const linkOpener = createLinkOpener({
      root: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
      openExternal: (url) => vscode.env.openExternal(vscode.Uri.parse(url)),
      openFile: (path, line) =>
        vscode.commands.executeCommand('vscode.open', vscode.Uri.file(path), {
          viewColumn: reviewColumn() ?? vscode.ViewColumn.Beside,
          ...(line !== undefined ? { selection: new vscode.Range(new vscode.Position(line - 1, 0), new vscode.Position(line - 1, 0)) } : {}),
        }),
      log: panelLog,
    });
    const chatHost = createChatPanelHost({
      links: linkOpener,
      attachments: {
        store: chatAttachments,
        // The file dialog is VS Code's own; a dismissed dialog attaches nothing.
        pickFiles: async () => ((await vscode.window.showOpenDialog({ canSelectMany: true, openLabel: 'Attach' })) ?? []).map((uri) => uri.fsPath),
        open: (path) => {
          void vscode.commands
            .executeCommand('vscode.open', vscode.Uri.file(path))
            .then(undefined, (e: unknown) => panelLog.warn(`chat attachment ${path} not opened: ${String(e)}`));
        },
      },
      editGovernance: {
        relPath: (p) => relForGit(chatCwd(), p),
        diffView: () =>
          (vscode.workspace.getConfiguration().get<DiffView>('insrc.chat.diffView') === 'editor' ? 'editor' : 'chat'),
        notify: (m) => {
          void vscode.window.showWarningMessage(`insrc ctrl: ${m}`);
        },
        baseline: workspaceBaseline,
        fs: {
          read: async (path) => readText(absForFs(chatCwd(), path)),
          write: async (path, content) => {
            await nodeFsp.writeFile(absForFs(chatCwd(), path), content, 'utf8');
          },
          remove: async (path) => {
            await nodeFsp.rm(absForFs(chatCwd(), path), { force: true });
          },
        },
        editorDiff: async (path, baseline, opts) => {
          const abs = absForFs(chatCwd(), path);
          baselineDocs.set(abs, baseline ?? '');
          const baseUri = vscode.Uri.parse(`${BASELINE_SCHEME}:${encodeURIComponent(abs)}`);
          baselineEmitter.fire(baseUri);
          await vscode.commands.executeCommand(
            'vscode.diff',
            baseUri,
            vscode.Uri.file(abs),
            `insrc: ${path} (baseline \u2194 current)`,
          );
          // Editor-mode review decision is self-contained here (no webview edit-decision):
          // a modal Keep/Revert; Revert restores the pre-turn baseline (or removes a new file).
          if (opts.review) {
            const pick = await vscode.window.showInformationMessage(
              `Review edit to ${path}`,
              { modal: true },
              'Keep',
              'Revert',
            );
            if (pick === 'Revert') {
              if (baseline === undefined) await nodeFsp.rm(abs, { force: true });
              else await nodeFsp.writeFile(abs, baseline, 'utf8');
            }
          }
        },
      },
      createPanel: ({ viewType, title }) =>
        // Open BESIDE the active editor group (a split), not on top of the current editor;
        // the shared factory wraps it + stamps the themed insrc mark.
        webviewPanelChannel(vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.Beside, { enableScripts: true })),
      providers: chatProviders,
      store: chatStore,
      cwd: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
      // Run-config popup: the daemon's model definitions (per-family models + efforts),
      // read once at host start; the panel re-renders when they land.
      definitions: () => client.rpc<ModelDefinitions>('models.definitions'),
      // LLM chat titling: a one-shot over the same CLI (no resume; timeout-bounded) names the
      // chat after its first turn, replacing the truncated-prompt fallback.
      deriveTitle: (input) => deriveChatTitle(chatProviders, input),
      // One CLI process per chat session, across windows and reloads: each lease is mirrored in a
      // lock file under ~/.insrc/chat-locks naming the CLI's pid. A new turn waits for it and
      // stops it only after insrc.chat.turnLockTimeoutMs.
      presenter: reviewPresenter,
      ...(chatQueue !== undefined ? { queue: chatQueue } : {}),
      sessionLocks: createFileSessionLocks({ fs: nodeFsp, lockDir: join(PATHS.insrc, 'chat-locks'), hostPid: process.pid, logger: panelLog }),
      turnLockTimeoutMs: () =>
        Math.max(1000, vscode.workspace.getConfiguration().get<number>('insrc.chat.turnLockTimeoutMs') ?? DEFAULT_TURN_LOCK_TIMEOUT_MS),
    });
    // Gate the editor-title icon (contributes.menus["editor/title"] when:insrc.chat.ready) on an
    // activate-time context key set ONLY here, inside the flag gate \u2014 NOT the live
    // config.insrc.chat.enabled. So toggling the setting without a window reload cannot surface a
    // command-less icon; it appears only after a reload re-runs activate with the flag on.
    const chatOffered = chatIsOffered(chatQueue);
    if (chatOffered) void vscode.commands.executeCommand('setContext', 'insrc.chat.ready', true);
    if (chatOffered) commands.register({ id: 'insrc.chat.open', title: 'insrc: Open chat' }, async () => {
      chatHost.open();
    });
    // S001 (bugfix): restore an insrc ctrl tab across a window reload / extension update. Without
    // this, VS Code re-opens the serialized tab but never hands it back, leaving a dead shell
    // (empty history, no wiring). deserializeWebviewPanel wraps the restored panel with the SAME
    // adapter as a fresh open and hands it to chatHost.adopt(), so history + wiring are restored
    // in place. Any failure disposes the panel (never throw into VS Code's restore path).
    if (chatOffered) context.subscriptions.push(
      vscode.window.registerWebviewPanelSerializer(CHAT_VIEW_TYPE, {
        deserializeWebviewPanel: (panel) => {
          try {
            panel.title = CHAT_PANEL_TITLE; // a restored tab keeps the title it was saved with
            chatHost.adopt(webviewPanelChannel(panel));
          } catch {
            panel.dispose();
          }
        },
      }),
    );

    // S007: the docs-review pane — a thin, passthrough (k8) observer over the daemon's
    // review IPCs (workflow.pending/artifactContent/reviewDecision). It only reads + acts on
    // daemon-tracked pending artifacts (k5), reuses the same webview channel seam, and
    // persists nothing extension-side (k3). Gated behind the same insrc.chat.enabled flag.
    const reviewHost = createDocsReviewHost({
      client: reviewClient,
      links: linkOpener,
      createPanel: ({ viewType, title, quiet }) => {
        // Story E20261013e62a9269:S001: a pane the chat opens on a presented document leaves the cursor where it is; the
        // command and the board open it as before. Standalone d27fe899: a new pane goes into an editor group that is already
        // open and holds no chat tab; with none (or if the groups cannot be read) it opens where it did: beside the chat when
        // quiet, in the active group otherwise.
        const column = reviewColumn();
        const panel = quiet === true
          ? vscode.window.createWebviewPanel(viewType, title, { viewColumn: column ?? vscode.ViewColumn.Beside, preserveFocus: true }, { enableScripts: true })
          : vscode.window.createWebviewPanel(viewType, title, column ?? vscode.ViewColumn.Active, { enableScripts: true });
        // Story E202610131f74c81f:S001: the pane's own tab icon, as the delivery board has its own.
        panel.iconPath = {
          light: vscode.Uri.file(join(context.extensionPath, 'media', 'insrc-review-icon.svg')),
          dark: vscode.Uri.file(join(context.extensionPath, 'media', 'insrc-review-icon-dark.svg')),
        };
        return webviewChannel(panel);
      },
      // Story E202610131f74c81f:S001: the open document's files are watched, so a document
      // revised outside the pane is shown without reopening it.
      watchDocument: (relPaths, onChange) => {
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (folder === undefined) return { dispose: () => {} };
        const watchers = relPaths.map((rel) => {
          const w = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, rel));
          w.onDidChange(onChange);
          w.onDidCreate(onChange);
          w.onDidDelete(onChange);
          return w;
        });
        return { dispose: () => { for (const w of watchers) w.dispose(); } };
      },
      // Story E202610138d4b90c9:S001: a decision and its comments are handed to the chat as
      // one message, which waits its turn there; and an artifact's HTML documents are read
      // from the workspace folder's docs/ directory for the pane's frame. The two hosts
      // meet only here: neither knows of the other.
      ...(chatOffered ? { notifyChat: (text: string) => chatHost.submitExternal(text) } : {}),
      readCompanion: createCompanionReader({ root: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath }),
    });
    commands.register({ id: 'insrc.chat.docsReview', title: 'insrc: Review pending documents' }, async () => {
      reviewHost.open();
    });
    docsReviewHost = reviewHost;
  }

  // E2 s1: the delivery board — a read-only editor tab over the daemon's workflow.delivery
  // snapshot for the first workspace folder. Not gated on insrc.chat.enabled.
  registerDeliveryBoard({
    commands,
    subscriptions: context.subscriptions,
    createWebviewPanel: (viewType, title) =>
      vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.Active, { enableScripts: true }),
    tabIcon: {
      light: vscode.Uri.file(join(context.extensionPath, 'media', 'insrc-delivery-icon.svg')),
      dark: vscode.Uri.file(join(context.extensionPath, 'media', 'insrc-delivery-icon-dark.svg')),
    },
    rpc: client.rpc,
    repo: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? null,
    logger: panelLog,
    reviewPane: docsReviewHost,
  });

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
    await activationSettled;
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
