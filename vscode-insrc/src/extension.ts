import * as vscode from 'vscode';
import { createDaemonManager, type DaemonManager, type DaemonStatus } from './daemon/lifecycle';
import { createStatusBar, type StatusBarManager } from './ui/statusBar';

// ---------------------------------------------------------------------------
// Extension state
// ---------------------------------------------------------------------------

let daemonManager: DaemonManager | null = null;
let statusBar: StatusBarManager | null = null;

// ---------------------------------------------------------------------------
// Extension lifecycle
// ---------------------------------------------------------------------------

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('insrc');
  outputChannel.appendLine('insrc extension activating...');

  // Initialize status bar
  statusBar = createStatusBar();
  context.subscriptions.push({ dispose: () => statusBar?.dispose() });

  // Initialize daemon manager
  daemonManager = createDaemonManager(outputChannel);

  // Auto-start daemon if configured
  const autoStart = vscode.workspace.getConfiguration('insrc.daemon').get<boolean>('autoStart', true);
  if (autoStart) {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'insrc: Starting daemon...',
        cancellable: false,
      },
      async () => {
        const started = await daemonManager!.ensureDaemon();
        if (started) {
          outputChannel.appendLine('daemon connected');
        } else {
          outputChannel.appendLine('daemon failed to start');
          vscode.window.showWarningMessage(
            'insrc daemon could not be started. Some features will be unavailable.',
            'Retry',
          ).then((action) => {
            if (action === 'Retry') {
              daemonManager?.ensureDaemon();
            }
          });
        }
      },
    );
  }

  // Initial status bar update
  if (autoStart) {
    const initialStatus = await daemonManager.getStatus();
    statusBar.update(initialStatus);
  }

  // Start health polling — updates both log and status bar
  daemonManager.startHealthPolling((status: DaemonStatus) => {
    outputChannel.appendLine(
      `health: running=${status.running} queue=${status.queueDepth ?? '?'} ollama=${status.ollamaAvailable ?? '?'}`,
    );
    statusBar?.update(status);
  });

  // Register commands
  registerCommands(context, outputChannel);

  // Register empty TreeDataProvider for navigation panel
  const treeProvider = new PlaceholderTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('insrc.navigation', treeProvider),
  );

  // Register daemon manager for cleanup
  context.subscriptions.push({ dispose: () => daemonManager?.dispose() });
  context.subscriptions.push(outputChannel);

  outputChannel.appendLine('insrc extension activated');
}

export function deactivate(): void {
  statusBar?.dispose();
  statusBar = null;
  daemonManager?.dispose();
  daemonManager = null;
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

function registerCommands(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): void {
  // Daemon commands (functional in Segment 2)
  context.subscriptions.push(
    vscode.commands.registerCommand('insrc.restartDaemon', async () => {
      if (!daemonManager) return;
      outputChannel.appendLine('restarting daemon...');
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'insrc: Restarting daemon...',
          cancellable: false,
        },
        async () => {
          daemonManager!.dispose();
          daemonManager = createDaemonManager(outputChannel);
          const started = await daemonManager.ensureDaemon();
          if (started) {
            vscode.window.showInformationMessage('insrc daemon restarted');
            const newStatus = await daemonManager.getStatus();
            statusBar?.update(newStatus);
            daemonManager.startHealthPolling((status) => {
              outputChannel.appendLine(`health: running=${status.running}`);
              statusBar?.update(status);
            });
          } else {
            vscode.window.showErrorMessage('insrc daemon failed to restart');
          }
        },
      );
    }),
  );

  // Permission mode toggle (functional in Segment 3)
  context.subscriptions.push(
    vscode.commands.registerCommand('insrc.togglePermissionMode', async () => {
      const config = vscode.workspace.getConfiguration('insrc.permissions');
      const current = config.get<string>('mode', 'validate');
      const options = ['validate', 'auto-accept', 'strict'];
      const picked = await vscode.window.showQuickPick(options, {
        placeHolder: `Current: ${current}. Select permission mode`,
      });
      if (picked && picked !== current) {
        await config.update('mode', picked, vscode.ConfigurationTarget.Global);
        vscode.window.showInformationMessage(`insrc permission mode: ${picked}`);
        // Re-query status to update status bar state
        if (daemonManager) {
          const status = await daemonManager.getStatus();
          statusBar?.update(status);
        }
      }
    }),
  );

  // Show daemon logs (functional in Segment 3)
  context.subscriptions.push(
    vscode.commands.registerCommand('insrc.showLogs', () => {
      outputChannel.show(true);
    }),
  );

  // Placeholder commands (future segments)
  const placeholders: Array<[string, string]> = [
    ['insrc.openPanel', 'Chat panel coming in Segment 5'],
    ['insrc.newSession', 'New session coming in Segment 5'],
    ['insrc.openSettings', 'Settings panel coming in Segment 9'],
    ['insrc.addRepo', 'Add repo coming in Segment 4'],
    ['insrc.reindex', 'Re-index coming in Segment 4'],
    ['insrc.openSetupWizard', 'Setup wizard coming in Segment 8'],
    ['insrc.addAnnotation', 'Annotations coming in Segment 17'],
    ['insrc.sendAnnotations', 'Send annotations coming in Segment 17'],
    ['insrc.showCost', 'Cost display coming in Segment 6'],
    ['insrc.testRun', 'Test run coming in Segment 10'],
    ['insrc.testPlan', 'Test plan coming in Segment 10'],
    ['insrc.agentList', 'Agent list coming in Segment 14'],
    ['insrc.agentResume', 'Agent resume coming in Segment 14'],
    ['insrc.configSearch', 'Config search coming in Segment 15'],
    ['insrc.conversationCompact', 'Conversation compact coming in Segment 16'],
    ['insrc.conversationStats', 'Conversation stats coming in Segment 16'],
  ];

  for (const [command, message] of placeholders) {
    context.subscriptions.push(
      vscode.commands.registerCommand(command, () => {
        vscode.window.showInformationMessage(`insrc: ${message}`);
      }),
    );
  }
}

// ---------------------------------------------------------------------------
// Placeholder TreeDataProvider (replaced in Segment 4)
// ---------------------------------------------------------------------------

class PlaceholderTreeProvider implements vscode.TreeDataProvider<string> {
  getTreeItem(element: string): vscode.TreeItem {
    return new vscode.TreeItem(element);
  }

  getChildren(): string[] {
    return [];
  }
}
