import { onUtf8Data } from './utf8-stream.js';
import { createConnection, type Socket } from 'node:net';
import type { IpcRequest, IpcResponse, IpcStreamMessage, DaemonStatus, DaemonUpdateResult, DaemonUpdateOutcome } from './types.js';
import { PATHS } from './paths.js';

// The single thin socket-client boundary shared by the CLI/TUI and the VS Code
// extension (Story E20260921ad0d45c9:S001, sc1 SharedIpcClient). This module owns
// exactly ONE daemon socket-client code path — the `rpc` fn moved here from
// src/cli/client.ts (which now re-exports it) — so no consumer mirrors the IPC
// contract, and no daemon internals / indexer / storage code enters the graph.
// Its only imports are node:net + the shared types + the shared paths (k5).

// The daemon IPC request/reply types + the real `DaemonStatus` are re-exported
// so downstream consumers import ONE client + ONE set of types (no parallel copies).
export type { IpcRequest, IpcResponse, DaemonStatus } from './types.js';

/** The daemon Unix-socket path (`~/.insrc/daemon.sock`). */
export const sockFilePath: string = PATHS.sockFile;

/**
 * The daemon's coarse reachability, DERIVED from a `daemon.status` call outcome.
 * The wire `DaemonStatus` carries no `running` field, so reachability is inferred:
 * a resolved status ⇒ 'running'; the "daemon is not running" throw ⇒ 'stopped';
 * any other failure ⇒ 'errored'.
 */
export type DaemonReachability = 'running' | 'stopped' | 'errored';

/**
 * The message `rpc` rejects with when the daemon socket is absent/refused
 * (ENOENT / ECONNREFUSED). Reachability classification keys off this prefix.
 */
const DAEMON_DOWN_PREFIX = 'daemon is not running';

let _nextId = 1;
const connectToDaemon = (): Socket => createConnection(PATHS.sockFile);

/**
 * The connection to the daemon was lost after a request was written and before
 * its reply arrived (the daemon exited, restarted or dropped the socket). The
 * request may or may not have been carried out, so callers must not treat this
 * as a refusal; `cause` is the socket error when there was one.
 */
export class DaemonDisconnectedError extends Error {
  readonly code = 'disconnected';
  readonly method: string;
  constructor(method: string, cause?: unknown) {
    super(`the daemon closed the connection before answering ${method}`, cause !== undefined ? { cause } : undefined);
    this.name = 'DaemonDisconnectedError';
    this.method = method;
  }
}

/**
 * Send one JSON-RPC request to the daemon and return the result.
 * Throws if the daemon is not running or returns an error, and
 * DaemonDisconnectedError if the connection is lost after the request was
 * written and before a reply. The promise settles exactly once.
 *
 * `connect` is an injectable seam (defaults to the real Unix-socket
 * connection) so the request-write behaviour — including the Story-s4 client
 * identity envelope — can be unit-tested with a fake socket.
 *
 * Moved verbatim from src/cli/client.ts (which now re-exports it) so the CLI/TUI
 * and the extension share exactly one socket-client path.
 */
export async function rpc<T = unknown>(
  method: string,
  params: unknown = {},
  connect: () => Socket = connectToDaemon,
  opts?: { readonly timeoutMs?: number | undefined; readonly closeAware?: boolean | undefined },
): Promise<T> {
  return new Promise<T>((resolveReply, rejectReply) => {
    const socket = connect();
    let   buffer = '';
    let   sent = false;
    let   settled = false;
    const settle = (fn: () => void): void => { if (!settled) { settled = true; fn(); } };

    // Opt-in deadline (Story s3). Without `timeoutMs` (or `closeAware`) nothing below changes the
    // request: no timer, no extra listeners, no destroy. With `timeoutMs` the request also
    // rejects on the deadline and on the socket ending or closing before a reply, and the
    // socket is destroyed and the timer cleared on every outcome. `closeAware` (Story s10) is
    // the same end and close handling with NO timer: a long call, such as an approval that waits
    // on a person, is never cut short, but a daemon that goes away is not waited for either.
    const timeoutMs = opts?.timeoutMs;
    const watched = timeoutMs !== undefined || opts?.closeAware === true;
    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const settle = (fn: () => void): void => {
      if (!watched) { fn(); return; }
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      socket.destroy();
      fn();
    };
    const resolve = (v: T): void => settle(() => resolveReply(v));
    const reject = (e: Error): void => settle(() => rejectReply(e));

    if (watched) {
      if (timeoutMs !== undefined) timer = setTimeout(() => reject(new Error(`daemon did not reply within ${timeoutMs} ms (timeout)`)), timeoutMs);
      const closed = (): void => reject(new Error('daemon closed the connection before replying (closed)'));
      socket.on('end', closed);
      socket.on('close', closed);
    }

    socket.on('connect', () => {
      // Self-identify to the daemon's attached-client registry (Story s4).
      const req: IpcRequest = { id: _nextId++, method, params, client: { label: 'cli', pid: process.pid } };
      socket.write(JSON.stringify(req) + '\n');
      sent = true;
    });

    onUtf8Data(socket, (decodedChunk, chunkBytes) => {
      buffer += decodedChunk;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const res = JSON.parse(line) as IpcResponse;
          socket.end();
          if (res.error) settle(() => reject(new Error(res.error)));
          else           settle(() => resolve(res.result as T));
        } catch {
          socket.end();
          settle(() => reject(new Error('invalid response from daemon')));
        }
      }
    });

    socket.on('error', (err: NodeJS.ErrnoException) => {
      if (sent) settle(() => reject(new DaemonDisconnectedError(method, err)));
      else if (err.code === 'ENOENT' || err.code === 'ECONNREFUSED') {
        settle(() => reject(new Error('daemon is not running — start it with: insrc daemon start')));
      } else {
        settle(() => reject(err));
      }
    });

    // A connection that ends or closes with no reply would otherwise leave the promise pending forever.
    const lost = (): void => settle(() => reject(sent ? new DaemonDisconnectedError(method) : new Error(`the daemon closed the connection before ${method} was sent`)));
    socket.on('end', lost);
    socket.on('close', lost);
  });
}

/**
 * The thin daemon client the extension (and any shared consumer) uses. Every
 * method reaches the daemon only through `rpc` over the local socket — there is
 * no cloud path and no daemon-internal code here (k2/k5).
 */
export interface IpcClient {
  /** One JSON-RPC round-trip to the daemon; rejects on daemon error / unreachable socket. */
  rpc<T = unknown>(method: string, params?: unknown): Promise<T>;
  /** The daemon's real status snapshot (via `daemon.status`); rejects when the daemon is down. */
  status(): Promise<DaemonStatus>;
  /** Coarse reachability, derived from a `daemon.status` outcome. Never throws. */
  reachability(): Promise<DaemonReachability>;
  /**
   * Ask the daemon to update AND restart itself (Story S001 / sc1). Resolves with
   * a launch acknowledgement ({ launched:true }); the daemon then restarts, so
   * the caller's socket drops and it must reconnect. The terminal result is read
   * back via {@link updateOutcome} after reconnect. Rejects (result.error) when an
   * update is already in progress or the daemon root/helper cannot be resolved.
   */
  update(): Promise<DaemonUpdateResult>;
  /** The last persisted daemon self-update outcome, or null when none exists. */
  updateOutcome(): Promise<DaemonUpdateOutcome | null>;
  /**
   * Open a stream method on the daemon and deliver every frame it pushes to `onFrame`.
   * Optional: a client that cannot stream (a test double) omits it, and only the modules
   * that subscribe (the approval prompts) check for it. `onClose` runs once when the stream
   * ends, with the error if it ended abnormally (the daemon went away).
   */
  stream?(method: string, params: unknown, onFrame: (frame: IpcStreamMessage) => void, onClose?: (err?: Error) => void): IpcStreamHandle;
}

/** An open stream. close() destroys the socket; the daemon's server then aborts the stream handler. */
export interface IpcStreamHandle { close(): void }

/**
 * Open a daemon stream: one request with `stream: true`, then newline-delimited frames until the
 * socket closes. Unlike `rpc` it does not end after the first line. Modelled on
 * src/mcp/daemon-stream.ts; `connect` is the same injectable seam.
 */
export function openStream(
  method:  string,
  params:  unknown,
  onFrame: (frame: IpcStreamMessage) => void,
  onClose?: (err?: Error) => void,
  connect: () => Socket = () => createConnection(PATHS.sockFile),
): IpcStreamHandle {
  const socket = connect();
  let buffer = '';
  let closed = false;
  const finish = (err?: Error): void => {
    if (closed) return;
    closed = true;
    socket.destroy();
    onClose?.(err);
  };

  socket.on('connect', () => {
    const req: IpcRequest = { id: _nextId++, method, params, stream: true, client: { label: 'cli', pid: process.pid } };
    socket.write(JSON.stringify(req) + '\n');
  });
  onUtf8Data(socket, (decodedChunk, chunkBytes) => {
    buffer += decodedChunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.trim()) continue;
      try { onFrame(JSON.parse(line) as IpcStreamMessage); } catch { /* a frame that is not JSON is dropped */ }
    }
  });
  socket.on('error', (err: NodeJS.ErrnoException) => {
    finish(err.code === 'ENOENT' || err.code === 'ECONNREFUSED' ? new Error('daemon is not running — start it with: insrc daemon start') : err);
  });
  socket.on('close', () => finish(closed ? undefined : new Error('daemon closed the stream')));
  return { close: () => { if (closed) return; closed = true; socket.destroy(); onClose?.(); } };
}

/**
 * Build an {@link IpcClient} over the shared `rpc`. `connect` is the same
 * injectable socket seam `rpc` takes, so the client is unit-testable with a
 * fake socket (no live daemon required).
 */
export function createIpcClient(connect?: () => Socket): IpcClient {
  const call = <T>(method: string, params?: unknown): Promise<T> =>
    connect === undefined ? rpc<T>(method, params) : rpc<T>(method, params, connect);

  return {
    rpc: call,
    status: () => call<DaemonStatus>('daemon.status'),
    reachability: async () => {
      try {
        await call<DaemonStatus>('daemon.status');
        return 'running';
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return message.startsWith(DAEMON_DOWN_PREFIX) ? 'stopped' : 'errored';
      }
    },
    update: () => call<DaemonUpdateResult>('daemon.update'),
    updateOutcome: () => call<DaemonUpdateOutcome | null>('daemon.updateOutcome'),
    stream: (method, params, onFrame, onClose) => openStream(method, params, onFrame, onClose, connect),
  };
}

/** A connection-scoped client for protocols whose authority outlives one reply.
 * Cancellation closes this connection; callers must not share it across owners.
 */
export function createPersistentIpcClient(connect: () => Socket = () => createConnection(PATHS.sockFile)) {
 const socket = connect();
 let sequence = 0, buffer = '', closed = false;
 const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void; detach(): void }>();
 const close = (error = new Error('daemon connection closed')): void => {
  if (closed) return;
  closed = true;
  for (const waiter of pending.values()) { waiter.detach(); waiter.reject(error); }
  pending.clear(); socket.destroy();
 };
 onUtf8Data(socket, chunk => {
  buffer += chunk;
  if (Buffer.byteLength(buffer) > 16 * 1024 * 1024) { close(new Error('daemon response exceeds limit')); return; }
  let newline: number;
  while ((newline = buffer.indexOf('\n')) >= 0) {
   const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
   if (!line.trim()) continue;
   let reply: { id?: number; error?: string; result?: unknown; stream?: string; data?: unknown };
   try { reply = JSON.parse(line); } catch { close(new Error('Invalid daemon response')); return; }
   const waiter = reply.id === undefined ? undefined : pending.get(reply.id);
   if (!waiter || reply.stream && !['done','error'].includes(reply.stream)) continue;
   pending.delete(reply.id!); waiter.detach();
   if (reply.error || reply.stream === 'error') waiter.reject(new Error(reply.error ?? JSON.stringify(reply.data)));
   else waiter.resolve(reply.stream === 'done' ? reply.data : reply.result);
  }
 });
 socket.on('error', error => close(error)); socket.on('close', () => close());
 return {
  get closed(): boolean { return closed; },
  close: () => close(),
  call<T>(method: string, params: unknown, opts: { signal?: AbortSignal | undefined; stream?: boolean | undefined } = {}): Promise<T> {
   if (closed) return Promise.reject(new Error('daemon connection closed; explicit review resume required'));
   if (opts.signal?.aborted) { close(new Error('Review request cancelled')); return Promise.reject(new Error('Review request cancelled')); }
   return new Promise<T>((resolve, reject) => {
    const id = ++sequence, abort = () => close(new Error('Review request cancelled'));
    opts.signal?.addEventListener('abort', abort, { once: true });
    pending.set(id, { resolve: value => resolve(value as T), reject, detach: () => opts.signal?.removeEventListener('abort', abort) });
    const request = { id, method, params, ...(opts.stream ? { stream: true } : {}), client: { label: 'mcp-review', pid: process.pid } };
    socket.write(JSON.stringify(request) + '\n', error => { if (error) close(error); });
   });
  },
 };
}

/** Persistent manager lanes share this thin socket boundary with the legacy one-shot client. */
export const IPC_LANE_LIMITS = Object.freeze({ frameBytes:16*1024*1024, inFlightBytes:16*1024*1024, pending:64, abandoned:256, timeoutMs:15000, depth:32, nodes:131072 });
export type IpcLaneFailure = 'invalid-request'|'capacity'|'closed'|'disconnected'|'timeout'|'canceled'|'invalid-response'|'remote-error';
export class IpcLaneError extends Error {
 constructor(readonly code:IpcLaneFailure, readonly written:boolean) { super('The daemon connection request could not be completed.');this.name='IpcLaneError'; }
}
export interface PersistentIpcLane {
 readonly isClosed:boolean;
 rpc<T=unknown>(method:string,params?:unknown,options?:{readonly signal?:AbortSignal|undefined}):Promise<T>;
 onClose(listener:(reason:IpcLaneFailure)=>void):()=>void;
 dispose():void;
}
export interface IpcLaneOptions {
 readonly connect?:(()=>Socket)|undefined;
 /** Injectable counter boundary for overflow tests; never accepted from an IPC/webview payload. */
 readonly firstRequestId?:number|undefined;
}
const ignoreLaneSocketError=():void=>{};
/** A synchronous data check before stringify; accessors/toJSON/functions never execute. */
function laneRequestJson(value:unknown):string {
 const active=new Set<object>();let nodes=0,estimated=0;
 const visit=(v:unknown,depth:number):void=>{
  if(++nodes>IPC_LANE_LIMITS.nodes||depth>IPC_LANE_LIMITS.depth)throw new IpcLaneError('invalid-request',false);
  if(typeof v==='string'){if(v.length>IPC_LANE_LIMITS.frameBytes)throw new IpcLaneError('invalid-request',false);estimated+=Buffer.byteLength(JSON.stringify(v));}
  else if(v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)){estimated+=String(v).length;}
  else {
   if(typeof v!=='object'||active.has(v))throw new IpcLaneError('invalid-request',false);
   const array=Array.isArray(v);if(Object.getPrototypeOf(v)!==(array?Array.prototype:Object.prototype))throw new IpcLaneError('invalid-request',false);
   active.add(v);estimated+=2;
   const d=Object.getOwnPropertyDescriptors(v),keys=Reflect.ownKeys(d);
   if(array&&keys.length!==(v as unknown[]).length+1)throw new IpcLaneError('invalid-request',false);
   for(const k of keys){
    if(typeof k!=='string'||k.length>IPC_LANE_LIMITS.frameBytes)throw new IpcLaneError('invalid-request',false);
    if(array&&k==='length')continue;
    const item=d[k]!;
    if(!item.enumerable||!Object.hasOwn(item,'value')||['__proto__','constructor','prototype'].includes(k)||array&&!/^(0|[1-9]\d*)$/.test(k))throw new IpcLaneError('invalid-request',false);
    estimated+=Buffer.byteLength(JSON.stringify(k))+2;visit(item.value,depth+1);
   }
   active.delete(v);
  }
  if(estimated>IPC_LANE_LIMITS.frameBytes)throw new IpcLaneError('invalid-request',false);
 };
 visit(value,0);return JSON.stringify(value);
}
/** JSON.parse alone silently accepts duplicate object fields. Reject them at every nesting level. */
function laneReplyJson(text:string):IpcResponse {
 const stack:{object:boolean;key:boolean;keys:Set<string>}[]=[];let nodes=0;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   const start=i;let closed=false;
   while(++i<text.length){if(text[i]==='\\'){i++;continue;}if(text[i]==='"'){closed=true;break;}}
   if(!closed||++nodes>IPC_LANE_LIMITS.nodes)throw new Error();
   const top=stack.at(-1);
   if(top?.object&&top.key){const k=JSON.parse(text.slice(start,i+1)) as string;if(top.keys.has(k))throw new Error();top.keys.add(k);top.key=false;}
  }else if(c==='{'||c==='['){if(++nodes>IPC_LANE_LIMITS.nodes||stack.length>=IPC_LANE_LIMITS.depth+1)throw new Error();stack.push({object:c==='{',key:c==='{',keys:new Set()});}
  else if(c==='}'||c===']'){const top=stack.pop();if(!top||top.object!==(c==='}'))throw new Error();}
  else if(c===','&&stack.at(-1)?.object){stack.at(-1)!.key=true;}
  else if(c==='-'||c!==undefined&&(/[0-9]/.test(c)||c==='t'||c==='f'||c==='n')){
   if(++nodes>IPC_LANE_LIMITS.nodes)throw new Error();
   while(i+1<text.length&&!/[\s,}\]]/.test(text[i+1]!))i++;
  }
 }
 if(stack.length)throw new Error();
 const v=JSON.parse(text) as IpcResponse;
 if(!v||typeof v!=='object'||Array.isArray(v)||!Number.isSafeInteger(v.id)||v.id<1
  ||Object.keys(v).some(k=>!['id','result','error'].includes(k))||Object.hasOwn(v,'result')===Object.hasOwn(v,'error')
  ||Object.hasOwn(v,'error')&&typeof v.error!=='string')throw new Error();
 return v;
}
interface LanePending {
 readonly id:number;frame:string;readonly bytes:number;written:boolean;
 readonly resolve:(value:unknown)=>void;readonly reject:(error:IpcLaneError)=>void;
 timer:ReturnType<typeof setTimeout>|undefined;
 readonly signal:AbortSignal|undefined;abort:(()=>void)|undefined;
}
/** One lane is one actual socket identity. Control, per-root data and Saved owners choose separate lanes. */
export function openIpcLane(options:IpcLaneOptions={}):PersistentIpcLane {
 let nextId=options.firstRequestId??1;
 if(!Number.isSafeInteger(nextId)||nextId<1)throw new IpcLaneError('invalid-request',false);
 let socket:Socket;
 try{socket=(options.connect??connectToDaemon)();}catch{throw new IpcLaneError('disconnected',false);}
 const pending=new Map<number,LanePending>(),abandoned=new Set<number>(),listeners=new Set<(reason:IpcLaneFailure)=>void>();
 let closed=false,connected=false,backpressure=false,inFlightBytes=0,partial=Buffer.alloc(8192),partialBytes=0,closeReason:IpcLaneFailure='closed';
 const finish=(p:LanePending,error?:IpcLaneError,value?:unknown):void=>{
  if(pending.get(p.id)!==p)return;
  pending.delete(p.id);inFlightBytes-=p.bytes;p.frame='';if(p.timer)clearTimeout(p.timer);if(p.abort)p.signal?.removeEventListener('abort',p.abort);
  if(error)p.reject(error);else p.resolve(value);
 };
 const close=(reason:IpcLaneFailure):void=>{
  if(closed)return;closed=true;closeReason=reason;
  for(const p of pending.values())finish(p,new IpcLaneError(reason,p.written));
  abandoned.clear();partial=Buffer.alloc(0);partialBytes=0;
  socket.off('connect',onConnect);socket.off('data',onData);socket.off('error',onError);socket.off('end',onEnd);socket.off('close',onSocketClose);socket.off('drain',onDrain);
  // Destroy without forwarding a raw error; absorb any already queued socket error until close.
  socket.on('error',ignoreLaneSocketError);socket.once('close',()=>socket.off('error',ignoreLaneSocketError));socket.destroy();
  for(const listener of listeners){try{listener(reason);}catch{/* A subscriber cannot prevent owned teardown. */}}
  listeners.clear();
 };
 const flush=():void=>{
  if(closed||!connected||backpressure)return;
  for(const p of pending.values()){
   if(p.written)continue;
   // Mark before write: a throw can follow a partial write; never falsely claim non-delivery.
   p.written=true;
   try{const frame=p.frame;p.frame='';if(!socket.write(frame)){backpressure=true;break;}}
   catch{close('disconnected');break;}
  }
 };
 const onConnect=():void=>{connected=true;flush();};
 const onDrain=():void=>{backpressure=false;flush();};
 const onError=():void=>close('disconnected');
 const onEnd=():void=>close(partialBytes?'invalid-response':'disconnected');
 const onSocketClose=():void=>close('disconnected');
 const onData=(chunk:Buffer):void=>{
  if(closed)return;
  try{
   let offset=0;
   while(offset<chunk.length){
    const end=chunk.indexOf(10,offset),stop=end<0?chunk.length:end;
    const needed=partialBytes+stop-offset;
    if(needed>IPC_LANE_LIMITS.frameBytes)throw new Error();
    if(needed>partial.length){const grown=Buffer.alloc(Math.min(IPC_LANE_LIMITS.frameBytes,Math.max(needed,partial.length*2)));partial.copy(grown,0,0,partialBytes);partial=grown;}
    chunk.copy(partial,partialBytes,offset,stop);partialBytes=needed;offset=stop+(end<0?0:1);
    if(end<0)break;
    const reply=laneReplyJson(new TextDecoder('utf-8',{fatal:true}).decode(partial.subarray(0,partialBytes)));partialBytes=0;
    if(partial.length>65536)partial=Buffer.alloc(8192);
    const p=pending.get(reply.id);
    if(!p){if(abandoned.delete(reply.id))continue;throw new Error();}
    if(!p.written)throw new Error();
    if(Object.hasOwn(reply,'error'))finish(p,new IpcLaneError('remote-error',true));else finish(p,undefined,reply.result);
   }
  }catch{close('invalid-response');}
 };
 socket.on('connect',onConnect);socket.on('data',onData);socket.on('error',onError);socket.on('end',onEnd);socket.on('close',onSocketClose);socket.on('drain',onDrain);
 const abandon=(p:LanePending,reason:'timeout'|'canceled'):void=>{
  if(pending.get(p.id)!==p)return;
  if(p.written)abandoned.add(p.id);
  finish(p,new IpcLaneError(reason,p.written));
  if(abandoned.size>=IPC_LANE_LIMITS.abandoned)close('capacity');
 };
 return {
  get isClosed(){return closed;},
  rpc<T=unknown>(method:string,params:unknown={},requestOptions:{readonly signal?:AbortSignal|undefined}={}):Promise<T>{
   if(closed)return Promise.reject(new IpcLaneError('closed',false));
   if(requestOptions.signal?.aborted)return Promise.reject(new IpcLaneError('canceled',false));
   if(pending.size>=IPC_LANE_LIMITS.pending)return Promise.reject(new IpcLaneError('capacity',false));
   if(nextId>Number.MAX_SAFE_INTEGER){close('closed');return Promise.reject(new IpcLaneError('closed',false));}
   if(!/^[a-zA-Z][a-zA-Z0-9._-]{0,127}$/.test(method))return Promise.reject(new IpcLaneError('invalid-request',false));
   let frame:string;const id=nextId;
   try{frame=laneRequestJson({id,method,params,client:{label:'cli',pid:process.pid}})+'\n';}
   catch{return Promise.reject(new IpcLaneError('invalid-request',false));}
   const bytes=Buffer.byteLength(frame);
   if(bytes>IPC_LANE_LIMITS.frameBytes)return Promise.reject(new IpcLaneError('invalid-request',false));
   if(inFlightBytes+bytes>IPC_LANE_LIMITS.inFlightBytes)return Promise.reject(new IpcLaneError('capacity',false));
   nextId++;
   return new Promise<T>((resolve,reject)=>{
    const p:LanePending={id,frame,bytes,written:false,resolve:value=>resolve(value as T),reject,timer:undefined,signal:requestOptions.signal,abort:undefined};
    pending.set(id,p);inFlightBytes+=bytes;
    p.timer=setTimeout(()=>abandon(p,'timeout'),IPC_LANE_LIMITS.timeoutMs);
    if(p.signal){p.abort=()=>abandon(p,'canceled');p.signal.addEventListener('abort',p.abort,{once:true});}
    flush();
   });
  },
  onClose(listener){
   if(closed){queueMicrotask(()=>{try{listener(closeReason);}catch{}});return ()=>{};}
   listeners.add(listener);return ()=>{listeners.delete(listener);};
  },
  dispose:()=>close('closed'),
 };
}
