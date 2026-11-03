import { watch } from 'node:fs';
import { basename, dirname } from 'node:path';
import type { DesignBaseline, DesignReviewSubject } from './contracts.js';
import { assertDesignSubjectUnchanged } from './subject.js';

interface WatchHandle {close():void;onError(handler:()=>void):void;}
export interface DesignSubjectMonitorDeps {
 readonly interval?:((tick:()=>void,ms:number)=>()=>void)|undefined;
 readonly watch?:((directory:string,event:(kind:string,name:string|null)=>void)=>WatchHandle)|undefined;
}
const defaults={
 interval:(tick:()=>void,ms:number)=>{const timer=setInterval(tick,ms);timer.unref();return()=>clearInterval(timer);},
 watch:(directory:string,event:(kind:string,name:string|null)=>void):WatchHandle=>{const watcher=watch(directory,{persistent:false},(kind,name)=>event(kind,name?.toString()??null));return{close:()=>watcher.close(),onError:handler=>{watcher.on('error',handler);}};},
};
/** Watch hints reduce latency; the bounded fingerprint check remains authoritative. */
export class DesignSubjectMonitor {
 private readonly directories=new Map<string,Set<string>>();
 private readonly watchers=new Map<string,WatchHandle>();
 private readonly cancel:()=>void;
 private stopped=false;
 private queued=false;
 constructor(private readonly subject:DesignReviewSubject,private readonly baseline:DesignBaseline,private readonly changed:(error:unknown)=>void,private readonly deps:DesignSubjectMonitorDeps={}){
  for(const path of [subject.canonicalPath,subject.documentPath]){
   const directory=dirname(path),names=this.directories.get(directory)??new Set<string>();names.add(basename(path));this.directories.set(directory,names);
  }
  this.cancel=(deps.interval??defaults.interval)(()=>this.queue(),1000);this.check();
 }
 stop():void{if(this.stopped)return;this.stopped=true;this.cancel();for(const watcher of this.watchers.values())watcher.close();this.watchers.clear();}
 private queue():void{if(this.stopped||this.queued)return;this.queued=true;queueMicrotask(()=>{this.queued=false;this.check();});}
 private check():void{
  if(this.stopped)return;
  try{assertDesignSubjectUnchanged(this.subject,this.baseline);}catch(error){this.stop();this.changed(error);return;}
  for(const [directory,names] of this.directories){
   if(this.watchers.has(directory))continue;
   try{
    const watcher=(this.deps.watch??defaults.watch)(directory,(kind,name)=>{
     if(this.stopped||this.watchers.get(directory)!==watcher)return;
     if(name!==null&&!names.has(name))return;
     if(kind==='rename'){this.watchers.get(directory)?.close();this.watchers.delete(directory);}
     this.queue();
    });
    this.watchers.set(directory,watcher);
    watcher.onError(()=>{watcher.close();if(this.watchers.get(directory)===watcher){this.watchers.delete(directory);this.queue();}});
   }catch{/* Unavailable watches do not invent a mutation; the interval still checks the subject. */}
  }
 }
}
