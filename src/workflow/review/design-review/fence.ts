import { realpathSync } from 'node:fs';
/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { DesignReviewConflictError } from './contracts.js';
const critical=new Set<string>(),active=new Map<string,string>();
const key=(project:string,id:string)=>`${realpathSync(project)}\0${id}`;
/** Short critical sections only. Provider work is represented by an owner, not awaited under this fence. */
export async function withDesignArtifactFence<T>(project:string,id:string,run:()=>Promise<T>):Promise<T>{
 const k=key(project,id);if(critical.has(k))throw new DesignReviewConflictError('Artifact lifecycle operation is busy');
 critical.add(k);try{return await run();}finally{critical.delete(k);}
}
export function claimDesignArtifact(project:string,id:string,owner:string):void{
 const k=key(project,id);if(critical.has(k)||active.has(k))throw new DesignReviewConflictError('Artifact approval/review ownership is busy');active.set(k,owner);
}
export function releaseDesignArtifact(project:string,id:string,owner:string):void{const k=key(project,id);if(active.get(k)===owner)active.delete(k);}
export const designArtifactActive=(project:string,id:string):boolean=>active.has(key(project,id));
