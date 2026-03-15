import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Extension lifecycle
// ---------------------------------------------------------------------------

export function activate(context: vscode.ExtensionContext): void {
  const outputChannel = vscode.window.createOutputChannel('insrc');
  outputChannel.appendLine('insrc extension activated');

  // Register placeholder commands
  context.subscriptions.push(
    vscode.commands.registerCommand('insrc.openPanel', () => {
      vscode.window.showInformationMessage('insrc: Chat panel coming in Segment 5');
    }),

    vscode.commands.registerCommand('insrc.newSession', () => {
      vscode.window.showInformationMessage('insrc: New session coming in Segment 5');
    }),

    vscode.commands.registerCommand('insrc.openSettings', () => {
      vscode.window.showInformationMessage('insrc: Settings panel coming in Segment 9');
    }),

    vscode.commands.registerCommand('insrc.addRepo', () => {
      vscode.window.showInformationMessage('insrc: Add repo coming in Segment 4');
    }),

    vscode.commands.registerCommand('insrc.reindex', () => {
      vscode.window.showInformationMessage('insrc: Re-index coming in Segment 4');
    }),

    vscode.commands.registerCommand('insrc.restartDaemon', () => {
      vscode.window.showInformationMessage('insrc: Daemon restart coming in Segment 2');
    }),

    vscode.commands.registerCommand('insrc.togglePermissionMode', () => {
      vscode.window.showInformationMessage('insrc: Permission toggle coming in Segment 3');
    }),

    vscode.commands.registerCommand('insrc.openSetupWizard', () => {
      vscode.window.showInformationMessage('insrc: Setup wizard coming in Segment 8');
    }),

    vscode.commands.registerCommand('insrc.addAnnotation', () => {
      vscode.window.showInformationMessage('insrc: Annotations coming in Segment 17');
    }),

    vscode.commands.registerCommand('insrc.sendAnnotations', () => {
      vscode.window.showInformationMessage('insrc: Send annotations coming in Segment 17');
    }),

    vscode.commands.registerCommand('insrc.showCost', () => {
      vscode.window.showInformationMessage('insrc: Cost display coming in Segment 6');
    }),

    vscode.commands.registerCommand('insrc.testRun', () => {
      vscode.window.showInformationMessage('insrc: Test run coming in Segment 10');
    }),

    vscode.commands.registerCommand('insrc.testPlan', () => {
      vscode.window.showInformationMessage('insrc: Test plan coming in Segment 10');
    }),

    vscode.commands.registerCommand('insrc.agentList', () => {
      vscode.window.showInformationMessage('insrc: Agent list coming in Segment 14');
    }),

    vscode.commands.registerCommand('insrc.agentResume', () => {
      vscode.window.showInformationMessage('insrc: Agent resume coming in Segment 14');
    }),

    vscode.commands.registerCommand('insrc.configSearch', () => {
      vscode.window.showInformationMessage('insrc: Config search coming in Segment 15');
    }),

    vscode.commands.registerCommand('insrc.conversationCompact', () => {
      vscode.window.showInformationMessage('insrc: Conversation compact coming in Segment 16');
    }),

    vscode.commands.registerCommand('insrc.conversationStats', () => {
      vscode.window.showInformationMessage('insrc: Conversation stats coming in Segment 16');
    }),

    outputChannel,
  );

  // Register empty TreeDataProvider for navigation panel
  const treeProvider = new PlaceholderTreeProvider();
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('insrc.navigation', treeProvider),
  );

  outputChannel.appendLine('insrc: all commands registered');
}

export function deactivate(): void {
  // Cleanup handled by disposables in context.subscriptions
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
