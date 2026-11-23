import { InstallerError } from './contracts.js';
/** Deliberately not a request/source flag. Only the terminal entry imports this
 * module; ordinary manager dispatch never accepts installation or this object. */
const issued = new WeakSet<object>();
export interface TerminalAdmission { readonly terminal: true }
export function requireTerminal(streams: { stdin: { isTTY?: boolean | undefined }; stdout: { isTTY?: boolean | undefined }; stderr: { isTTY?: boolean | undefined } } = process): TerminalAdmission {
  if (!streams.stdin.isTTY || !streams.stdout.isTTY || !streams.stderr.isTTY) throw new InstallerError('install-terminal-required', 'Installation requires the shared script in an interactive terminal');
  const admission: TerminalAdmission = Object.freeze({ terminal: true }); issued.add(admission); return admission;
}
export function assertTerminalAdmission(admission: TerminalAdmission): void {
  if (!issued.has(admission)) throw new InstallerError('install-terminal-required', 'A source/bootstrap marker cannot authorize installation');
}
