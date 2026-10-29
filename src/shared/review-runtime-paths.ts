/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** Project-relative daemon runtime namespace; never review source, even when force-added to Git. */
export const INVESTIGATION_RUNTIME_PATH = '.insrc/review-runs/investigation-v1';
export function isInvestigationRuntimePath(path:string):boolean {
 return path===INVESTIGATION_RUNTIME_PATH||path.startsWith(`${INVESTIGATION_RUNTIME_PATH}/`);
}
