/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { randomUUID } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import type { MessagePort } from 'node:worker_threads';
import { ArtifactIds } from '../../workflow/artifact-ids.js';
import type { HubHandlers } from './channel.js';

export const ARTIFACT_WRITE_ACQUIRE='artifact.write.acquire';
export const ARTIFACT_WRITE_RELEASE='artifact.write.release';
interface Borrow {readonly token:string;release:()=>void;}
interface Owner {closed:boolean;readonly borrows:Map<string,Borrow>;}
/** A queue borrow belongs to a private registered channel. Channel loss does
 * not release an in-flight writer: only confirmed worker reclamation does. */
export class ArtifactWriteAuthorityHost{
 private readonly owners=new Map<MessagePort,Owner>();
 handlers(port:MessagePort):HubHandlers{
  const owner:Owner={closed:false,borrows:new Map()};this.owners.set(port,owner);
  port.once('close',()=>{owner.closed=true;});
  return{
   [ARTIFACT_WRITE_ACQUIRE]:async(raw)=>{
    if(owner.closed||!raw||typeof raw!=='object')throw new Error('Artifact writer disconnected');
    const {repo,id}=raw as {repo:unknown;id:unknown};
    if(typeof repo!=='string'||typeof id!=='string'||!ArtifactIds.parse(id))throw new Error('Invalid artifact queue target');
    const canonical=await realpath(repo);if(canonical!==repo)throw new Error('Canonical artifact repository required');
    const {lifecycleFor}=await import('../lifecycle-registry.js');
    return new Promise<string>((resolve,reject)=>{
     void lifecycleFor(repo).store.exclusive(id,async()=>{
      if(owner.closed)throw new Error('Artifact writer disconnected');
      const token=randomUUID();let finish!:()=>void;
      const done=new Promise<void>(r=>{finish=r;});
      owner.borrows.set(token,{token,release:finish});resolve(token);
      try{await done;}finally{owner.borrows.delete(token);}
     }).catch(reject);
    });
   },
   [ARTIFACT_WRITE_RELEASE]:raw=>{
    const token=raw&&typeof raw==='object'?Reflect.get(raw,'token'):undefined;
    const borrow=typeof token==='string'?owner.borrows.get(token):undefined;
    if(owner.closed||!borrow)throw new Error('Foreign or stale artifact queue borrow');
    owner.borrows.delete(borrow.token);borrow.release();return true;
   },
  };
 }
 /** Called after exit plus native lock/store reclamation, never on port loss. */
 reclaim(port:MessagePort):void{
  const owner=this.owners.get(port);if(!owner)return;
  owner.closed=true;for(const borrow of owner.borrows.values())borrow.release();owner.borrows.clear();this.owners.delete(port);
 }
}
