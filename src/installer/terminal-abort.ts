import type { Interface } from 'node:readline/promises';

/** Signals request the same bounded finite drain as EOF/Ctrl+C. The installer
 * owns draining; this handler never exits, terminates children or stops services. */
export function terminalAbort(terminal: Pick<Interface, 'on' | 'off' | 'close'>, write: (text: string) => void) {
  const controller = new AbortController(); let closing = false;
  const abort = (reason: string) => {
    if (controller.signal.aborted || closing) return;
    controller.abort();
    try { write(`${reason}: cancelling installation and draining finite work. Accepted Ollama services may remain running.\n`); } catch { /* Terminal may already be gone. */ }
    terminal.close();
  };
  const eof = () => { if (!closing) abort('Terminal closed'); }, interrupt = () => abort('SIGINT');
  const hup = () => abort('SIGHUP'), term = () => abort('SIGTERM');
  terminal.on('close', eof); terminal.on('SIGINT', interrupt);
  process.on('SIGINT', interrupt); process.on('SIGHUP', hup); process.on('SIGTERM', term);
  const detach = () => {
    terminal.off('close', eof); terminal.off('SIGINT', interrupt);
    process.off('SIGINT', interrupt); process.off('SIGHUP', hup); process.off('SIGTERM', term);
  };
  return { signal: controller.signal,
    close() { closing = true; detach(); terminal.close(); },
    dispose() {
      closing = true; detach(); terminal.close();
    } };
}
