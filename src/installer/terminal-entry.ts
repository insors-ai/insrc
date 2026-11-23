import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireTerminal } from './terminal-admission.js';
import { InstallerError } from './contracts.js';
/** t8 composes interaction and TUI handoff here. This separate entry already
 * enforces all TTY streams and never synthesizes production peer behavior. */
export async function terminalMain(): Promise<void> {
  requireTerminal();
  throw new InstallerError('capability-unavailable', 'Terminal interaction is not composed in this foundation stage');
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  terminalMain().catch(error => { process.stderr.write(`${error instanceof InstallerError ? error.code : 'install-failed'}: ${error instanceof Error ? error.message : 'Installation failed'}\n`); process.exitCode = 1; });
}
