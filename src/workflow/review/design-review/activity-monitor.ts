import { ReviewActivityMonitor } from '../../../shared/review-activity.js';
import type { ReviewActivityMonitorDeps, ReviewInactivityError } from '../../../shared/review-activity.js';

/** Tools have their own observed lifetime; only tool-free idle waits expire the model grace. */
export function createDesignActivityMonitor(inactive:(error:ReviewInactivityError)=>void,deps:ReviewActivityMonitorDeps={}):ReviewActivityMonitor {
 const timer=deps.timer??((callback:()=>void,ms:number)=>{const handle=setTimeout(callback,ms);handle.unref();return()=>clearTimeout(handle);});
 let monitor:ReviewActivityMonitor;
 monitor=new ReviewActivityMonitor(inactive,{...deps,timer:(callback,ms)=>{
  let stopped=false,cancel=()=>{};
  const wake=()=>{
   if(stopped)return;
   // This check does not manufacture activity or renew lastActivity. Completion arms ordinary grace.
   if(monitor.snapshot().tools.length){cancel=timer(wake,60000);return;}
   callback();
  };
  cancel=timer(wake,ms);return()=>{stopped=true;cancel();};
 }});
 return monitor;
}
