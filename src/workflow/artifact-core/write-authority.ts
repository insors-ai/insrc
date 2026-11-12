/* Copyright (c) Procix Software India. Licensed under the MIT License. */
/** Daemon workers borrow the canonical main-thread artifact queue. The
 * mutation/journal work stays in its caller; no executable closures cross IPC. */
export type ArtifactWriteAuthority=(repo:string,id:string)=>Promise<()=>Promise<void>>;
let authority:ArtifactWriteAuthority|undefined;
export function installArtifactWriteAuthority(value:ArtifactWriteAuthority):void{authority=value;}
export async function withArtifactWriteAuthority<T>(repo:string,id:string,run:()=>Promise<T>):Promise<T>{
 const release=await authority?.(repo,id);
 try{return await run();}finally{await release?.();}
}
