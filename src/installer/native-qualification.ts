import { InstallerError, PRIVATE_NODE_VERSION } from './contracts.js';
import type { Target } from './contracts.js';
/** Publisher-owned evidence, never a consumer-supplied override. s8 supplies live
 * qualification; host fixture success alone does not enable release publication. */
export interface NativeQualification {
  target: Target; runtimeVersion: string; addonSha256: string;
  nativeExecution: boolean; lockExclusion: boolean; interruptedReplace: boolean;
  privateRuntimeSmoke: boolean; liveInstallUpgrade: boolean;
}
export function requireEnabledNativeTarget(target: Target): void {
  // Release-owned exclusion, independent of any caller-supplied receipt flags.
  if (target.os === 'win32') throw new InstallerError('target-unqualified', 'Windows native execution and publication are deferred pending owned-process qualification; metadata computation remains available');
}
export function requireNativeQualification(target: Target, addonSha256: string, evidence?: NativeQualification): void {
  requireEnabledNativeTarget(target);
  if (!evidence || evidence.target.os !== target.os || evidence.target.arch !== target.arch
    || evidence.target.baseline !== target.baseline || evidence.runtimeVersion !== PRIVATE_NODE_VERSION
    || !/^[a-f0-9]{64}$/.test(addonSha256) || evidence.addonSha256 !== addonSha256
    || !evidence.nativeExecution || !evidence.lockExclusion || !evidence.interruptedReplace
    || !evidence.privateRuntimeSmoke || !evidence.liveInstallUpgrade) {
    throw new InstallerError('target-unqualified', 'Publication requires exact-target native and live qualification evidence');
  }
}
