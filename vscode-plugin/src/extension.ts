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
import { join } from 'node:path';

import * as vscode from 'vscode';

import { createIpcClient } from '../../src/shared/ipc-client.js';
import { PATHS } from '../../src/shared/paths.js';
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
import { MERGED_KEY_MAP } from './config/key-map.js';
import type { ChangedKey, Notifier, SettingsStore } from './config/types.js';
import { createDaemonDataGateway } from './panels/daemon-gateway.js';
import { createWebviewPanelHost } from './panels/webview-host.js';
import { defaultProcessScan } from './panels/process-scan.js';
import { renderDaemonTab, renderWorkflowsTab } from './panels/detail-renderers.js';
import { renderDebugTab, createDebugTabController, createDebugActionHandler } from './panels/debug-renderer.js';
import { renderRepoConfig, createRepoConfigWriteHandler } from './panels/repo-config.js';
import { createLogTail } from './panels/log-tail.js';
import { createOrphanKill, readManagedPid } from './panels/orphan-kill.js';
import type { PanelHandle } from './panels/types.js';
import { runSetModelTier } from './models/model-tier-picker.js';
import type { ModelListResult, ModelProvider } from './models/model-tier-picker.js';
import { runDaemonFreshnessCheck } from './freshness/daemon-freshness.js';
import { createChatPanelHost } from './chat/chat-panel.js';
import { createMementoChatSessionStore } from './chat/session-store.js';
import { createProviderRegistry, nodeSpawner, defaultBinaryProbe } from './chat/cli-adapter.js';
import { defaultComputeDiff, type DiffView } from './chat/edit-governor.js';
import { createGitBaseline } from './chat/git-baseline.js';
import { execFile as nodeExecFile } from 'node:child_process';
import { promises as nodeFsp } from 'node:fs';
import { relative as pathRelative, isAbsolute as pathIsAbsolute, join as pathJoin } from 'node:path';

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

  // S003 daemon-auto-update: keep the locally-installed daemon current. This is the
  // SOLE vscode importer, so it binds the real seams — the daemon-owned update+restart
  // IPC (client.update/updateOutcome, sc1; NEVER a daemon-ctl.sh shell-out, k2), the
  // installed-commit read (client.status, sc2), a plugin-side git ls-remote (no pull,
  // k1), a native Update/Dismiss notification (k7), and the per-plugin last-seen
  // version over globalState + packageJSON.version (self-update trigger, k4). Fired
  // fire-and-forget like runReachabilityProbe so it never blocks activation (k6); the
  // flow module itself never rejects, so no .catch is needed.
  void runDaemonFreshnessCheck({
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
    // respawns the MCP host so claude/codex reconnect to the freshly updated daemon.
    reloadWindow: () =>
      Promise.resolve(vscode.commands.executeCommand('workbench.action.reloadWindow')).then(() => undefined),
  });

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
  const configSync = createConfigSyncEngine({
    gateway: configGateway,
    settings: configSettings,
    notifier: configNotifier,
    keyMap: MERGED_KEY_MAP,
  });
  // Reconcile the native mirror with the daemon on activation (non-blocking).
  void configSync.pullFromDaemon();
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
  const panelLog = { warn: (message: string): void => console.warn(`[insrc] ${message}`) };
  const daemonData = createDaemonDataGateway({
    rpc: (method, params) => client.rpc(method, params),
    artifactsRoot: () => {
      const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      return root === undefined ? undefined : join(root, '.insrc', 'artifacts');
    },
    processScan: defaultProcessScan,
    logger: panelLog,
  });
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

  // S003-model-picker sc2 consumer: the 'insrc: Set model tier' guided command. A
  // DUMB dropdown over the shipped sc2 list-models IPC (client.rpc, no new daemon
  // capability, k3) that turns the free-text global model-tier field into an
  // authoritative pick. The real editor seams live here (the sole `vscode`
  // importer): listModels over the shared client, catalog+writeKeyPath over the
  // already-hoisted sc8 configGateway, pick over showQuickPick, notify over
  // showInformationMessage. All flow/k7 logic is in the VS-Code-free module.
  commands.register({ id: 'insrc.models.setTier', title: 'insrc: Set model tier' }, () =>
    runSetModelTier({
      listModels: (provider: ModelProvider) =>
        client.rpc<ModelListResult>('providers.listModels', { provider }),
      catalog: () => configGateway.catalog(),
      writeKeyPath: (segments, value) => configGateway.writeKeyPath(segments, value),
      pick: (items, opts) => Promise.resolve(vscode.window.showQuickPick(items, opts)),
      notify: (message) => {
        // The bundled vscode.d.ts stub's showInformationMessage requires the
        // options arg; {} (all fields optional) satisfies it with no buttons.
        void vscode.window.showInformationMessage(message, {});
      },
    }),
  );

  // S003 (Phase B): the terminal chat panel, gated behind insrc.chat.enabled
  // (default false). When enabled, wire createChatPanelHost with the real injected
  // vscode channel seams (mirroring the status panel at :305), the memento-backed
  // sc4 ChatSessionStore (chat history extension-local, k3), and the sc5
  // ProviderRegistry over the installed claude/codex CLIs. The chat command is
  // registered ONLY when the flag is on, so the surface is invisible until opted in.
  const chatEnabled = vscode.workspace.getConfiguration().get<boolean>('insrc.chat.enabled') === true;
  if (chatEnabled) {
    // S005: cap extension-local chat history (k3) so globalState does not grow unbounded
    // (the S003 L4 follow-up). save() evicts the oldest non-active sessions beyond this.
    const chatStore = createMementoChatSessionStore({ memento: context.globalState, maxSessions: 200 });
    const chatProviders = createProviderRegistry({ spawn: nodeSpawner, isInstalled: defaultBinaryProbe });

    // S006: edit-governance seams. All model access stays via the user's CLIs (k2); the
    // baseline shells local git (no new dependency, no cloud REST) and captures the exact
    // pre-turn working tree without disturbing it. Everything stays extension-local (k3).
    const chatCwd = (): string => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
    const runGit = (cwd: string, args: string[]): Promise<{ ok: boolean; stdout: string }> =>
      new Promise((resolve) => {
        nodeExecFile('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
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
    // S006: git-backed baseline (untracked-safe + subdir-safe; see git-baseline.ts).
    const workspaceBaseline = createGitBaseline({ runGit, readText, cwd: chatCwd, toAbs: absForFs, toRel: relForGit });
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

    const chatHost = createChatPanelHost({
      editGovernance: {
        computeDiff: defaultComputeDiff,
        diffView: () =>
          (vscode.workspace.getConfiguration().get<DiffView>('insrc.chat.diffView') === 'editor' ? 'editor' : 'chat'),
        notify: (m) => {
          void vscode.window.showWarningMessage(`insrc chat: ${m}`);
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
      createPanel: ({ viewType, title }) => {
        const panel = vscode.window.createWebviewPanel(viewType, title, vscode.ViewColumn.Active, { enableScripts: true });
        return {
          setHtml: (html) => {
            panel.webview.html = html;
          },
          postMessage: (message) => {
            // Fire-and-forget: a post to a disposed/hidden panel must never reject inward.
            panel.webview.postMessage(message).then(undefined, () => {
              /* ignore */
            });
          },
          onMessage: (listener) => {
            panel.webview.onDidReceiveMessage((m) => listener(m));
          },
          onDidDispose: (listener) => {
            panel.onDidDispose(listener);
          },
          reveal: () => panel.reveal(),
          dispose: () => panel.dispose(),
        };
      },
      providers: chatProviders,
      store: chatStore,
      cwd: () => vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
    });
    commands.register({ id: 'insrc.chat.open', title: 'insrc: Open chat' }, async () => {
      chatHost.open();
    });
  }

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
