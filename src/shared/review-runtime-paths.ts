/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** Project-relative daemon runtime namespace; never review source, even when force-added to Git. */
export const INVESTIGATION_RUNTIME_PATH = '.insrc/review-runs/investigation-v1';
export const PRODUCTION_REVIEW_RUNTIME_PATH = '.insrc/review-runs/production-v1';
export const REVIEW_BRIDGE_RUNTIME_PATH = '.insrc/review-runs/bridge-v1';
export function isInvestigationRuntimePath(path:string):boolean {
 return [INVESTIGATION_RUNTIME_PATH,PRODUCTION_REVIEW_RUNTIME_PATH,REVIEW_BRIDGE_RUNTIME_PATH]
  .some(root=>path===root||path.startsWith(`${root}/`));
}
