import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { InstallerError } from './contracts.js';
import { terminalMain } from './terminal-main.js';
export { terminalMain } from './terminal-main.js';
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  terminalMain().catch(error => { process.stderr.write(`${error instanceof InstallerError ? error.code : 'install-failed'}: ${error instanceof Error ? error.message : 'Installation failed'}\n`); process.exitCode = 1; });
}
