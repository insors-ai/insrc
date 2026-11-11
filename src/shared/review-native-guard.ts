/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { isMainThread, workerData } from 'node:worker_threads';

/** Executable native-spawn inventory. Install before review runtime imports.
 * All existing ESM and CommonJS forms, including direct ChildProcess.spawn,
 * fail closed. Pure stream facades may construct ChildProcess without spawn.
 * Native work must cross the registered host port instead. */
export const REVIEW_NATIVE_SPAWN_APIS=['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'] as const;
/** Native import boundaries reached by review providers/tools. Any new import
 * in those families must be reviewed against the executable worker guard. */
export const REVIEW_NATIVE_BOUNDARIES=Object.freeze({
 'src/agent/providers/cli-provider.ts':['resolveBin','runSubprocess','activityReview'],
 'src/shared/process-group.ts':['runInProcessGroup'],
 'src/daemon/tools/shell-helper.ts':['runShell','runShellBytes','spawnManaged'],
 'src/daemon/tools/review-shell-process.ts':['ChildProcess (stream facade only; never spawn)'],
});
let installed=false;
export function installReviewNativeSpawnGuard():void{
 if(isMainThread||workerData?.role!=='review')throw new Error('Native review guard requires a dedicated review worker');
 if(installed)return;
 const refuse=()=>{throw new Error('Native spawn is forbidden in a review worker; use the host lease bridge');};
 for(const name of REVIEW_NATIVE_SPAWN_APIS)Object.defineProperty(childProcess,name,{...Object.getOwnPropertyDescriptor(childProcess,name),value:refuse});
 Object.defineProperty(childProcess.ChildProcess.prototype,'spawn',{...Object.getOwnPropertyDescriptor(childProcess.ChildProcess.prototype,'spawn'),value:refuse});
 syncBuiltinESMExports();installed=true;
}
