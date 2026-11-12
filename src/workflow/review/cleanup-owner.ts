/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import type { CleanupResult } from '../code-review/task-review/cleanup.js';
export type ReviewCleanupTarget={readonly project:string;readonly family:'code';readonly epicHash:string;readonly storyId:string}|{readonly project:string;readonly family:'design';readonly artifactId:string};
export const reviewCleanupScope=(t:ReviewCleanupTarget)=>JSON.stringify([t.project,t.family,t.family==='code'?`${t.epicHash}:${t.storyId}`:t.artifactId]);
/** Unverified subject discovery conservatively fences this repo/family only. */
export const reviewUnknownCleanupScope=(project:string,family:'code'|'design')=>JSON.stringify([project,family,null]);
export type ReviewCleanupOwner=(target:ReviewCleanupTarget)=>Promise<CleanupResult|undefined>;
let owner:ReviewCleanupOwner|undefined;
export function installReviewCleanupOwner(value:ReviewCleanupOwner):void{owner=value;}
/** Absent outside the daemon, and before the coordinated production cutover. */
export async function ownedReviewCleanup(target:ReviewCleanupTarget):Promise<CleanupResult|undefined>{return owner?.(target);}
