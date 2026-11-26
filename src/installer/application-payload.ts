/** App-only inventory rule; no filesystem, acquisition or dependency policy loop. */
import { InstallerError } from './contracts.js';
import { isDistributionArtifact } from './distribution-artifacts.js';
export function assertApplicationPayload(files: readonly { path: string; sha256: string }[]): void {
  for (const file of files) {
    const path = file.path.normalize('NFC').toLowerCase();
    if (/^(?:tools\/(?:node|ollama)|runtime|ollama)(?:\/|$)/.test(path)
      || /(?:^|\/)(?:node(?:\.exe)?|ollama(?:\.exe)?)$/.test(path) || isDistributionArtifact(file.sha256)) {
      throw new InstallerError('archive-unsafe', `Application payload contains a runtime distribution contribution: ${file.path}`);
    }
  }
}
