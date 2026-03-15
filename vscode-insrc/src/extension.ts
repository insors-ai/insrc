import * as vscode from 'vscode';
import { createDaemonManager, type DaemonManager, type DaemonStatus } from './daemon/lifecycle';

// ---------------------------------------------------------------------------
// Extension state
// ---------------------------------------------------------------------------

let daemonManager: DaemonManager | null = null;

// ---------------------------------------------------------------------------
// Extension lifecycle
// ---------------------------------------------------------------------------

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const outputChannel = vscode.window.createOutputChannel('insrc');
  outputChannel.appendLine('insrc extension activating...');

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

  // Start health polling
  daemonManager.startHealthPolling((status: DaemonStatus) => {
    outputChannel.appendLine(
      `health: running=${status.running} queue=${status.queueDepth ?? '?'} ollama=${status.ollamaAvailable ?? '?'}`,
    );
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
            daemonManager.startHealthPolling((status) => {
              outputChannel.appendLine(`health: running=${status.running}`);
            });
          } else {
            vscode.window.showErrorMessage('insrc daemon failed to restart');
          }
        },
      );
    }),
  );

  // Placeholder commands (future segments)
  const placeholders: Array<[string, string]> = [
    ['insrc.openPanel', 'Chat panel coming in Segment 5'],
    ['insrc.newSession', 'New session coming in Segment 5'],
    ['insrc.openSettings', 'Settings panel coming in Segment 9'],
    ['insrc.addRepo', 'Add repo coming in Segment 4'],
    ['insrc.reindex', 'Re-index coming in Segment 4'],
    ['insrc.togglePermissionMode', 'Permission toggle coming in Segment 3'],
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
