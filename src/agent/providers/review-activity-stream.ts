import { randomUUID } from 'node:crypto';
import { StringDecoder } from 'node:string_decoder';
import type { ActivityReviewSessionOpts, StructuredSchema } from '../../shared/types.js';
import type { ReviewActivityEvent } from '../../shared/review-activity.js';
import { validateAgainstSchema } from './structured-output.js';
import { ReviewDiagnosticCollector, ReviewOutputFailureError } from '../../shared/review-diagnostics.js';
import type { ReviewDiagnosticSnapshot, ReviewValidationIssue } from '../../shared/review-diagnostics.js';

const RECENT_EVENT_IDS = 4096;
const FRAME_BYTES = 8 * 1024 * 1024, CANDIDATE_BYTES = 4 * 1024 * 1024;
const record = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
/** Native metadata only escapes this decoder; raw content is never a progress message. */
export class ReviewActivityStream<T> {
 private readonly decoder = new StringDecoder('utf8');
 private buffer = '';
 private sequence = 0;
 private readonly sessionId = randomUUID();
 private readonly seen = new Set<string>();
 private readonly tools = new Set<string>();
 private pendingFinal: unknown;
 private pendingJsonError = false;
 private finalSucceeded = false;
 private failed = false;
 private value: T | undefined;
 private accepted = false;
 private readonly diagnostics: ReviewDiagnosticCollector;
 private readonly outputTools = new Set<string>();
 private diagnosticWriteError: unknown;
 constructor(private readonly kind: 'claude'|'codex', private readonly schema: StructuredSchema, private readonly opts: ActivityReviewSessionOpts, private readonly stop: () => void) { this.diagnostics = new ReviewDiagnosticCollector(kind); }
 async start(): Promise<void> { await this.activity('session_started'); }
 async feed(chunk: Buffer): Promise<void> { this.buffer += this.decoder.write(chunk); await this.decode(false); }
 async end(): Promise<void> { this.buffer += this.decoder.end(); await this.decode(true); }
 diagnosticSnapshot(): ReviewDiagnosticSnapshot { return this.diagnostics.snapshot(); }
 async failure(reason: string, message: string, exitCode?: number): Promise<ReviewOutputFailureError> {
  const prior = this.diagnosticSnapshot().terminal;
  this.diagnostics.terminal(prior?.reason ?? reason, prior?.message ?? message, exitCode ?? prior?.exitCode);
  if(!this.diagnosticSnapshot().issues.length)this.diagnostics.issue({ code: 'NATIVE_CLI_FAILURE', field: '/', correction: 'Resolve the native CLI failure before resubmitting feedback.', message });
  await this.report();
  return new ReviewOutputFailureError(message, this.diagnosticSnapshot());
 }
 result(): { accepted: true; value: T } | { accepted: false } { return this.accepted ? {accepted:true,value:this.value!} : {accepted:false}; }
 completed(): T {
  if (this.failed || !this.finalSucceeded || this.pendingFinal === undefined) throw new ReviewOutputFailureError('Review native session did not produce a successful final assessment', this.diagnosticSnapshot());
  const checked = validateAgainstSchema<T>(this.schema,this.pendingFinal);
  if (!checked.ok) throw new ReviewOutputFailureError('Review final assessment does not match schema', this.diagnosticSnapshot());
  return checked.value;
 }
 private async report(): Promise<void> {
  try { await this.opts.onDiagnostic?.(this.diagnosticSnapshot()); }
  catch (error) { this.diagnosticWriteError = error; throw error; }
 }
 private async note(issue: ReviewValidationIssue): Promise<void> { this.diagnostics.issue(issue); await this.report(); }
 private async decode(eof: boolean): Promise<void> {
  try { await this.lines(eof); }
  catch (error) {
   if (error === this.diagnosticWriteError || error instanceof ReviewOutputFailureError) throw error;
   const message = error instanceof Error ? error.message : 'Invalid native review output';
   await this.note({ code: 'NATIVE_PROTOCOL_ERROR', field: '/', correction: 'Return valid native review output within the protocol limits.', message });
   throw new ReviewOutputFailureError(message, this.diagnosticSnapshot(), error);
  }
 }
 private async lines(eof: boolean): Promise<void> {
  while (!this.accepted) {
   const newline = this.buffer.indexOf('\n');
   if (newline < 0 && !eof) break;
   const line = newline < 0 ? this.buffer : this.buffer.slice(0,newline);
   this.buffer = newline < 0 ? '' : this.buffer.slice(newline+1);
   if (Buffer.byteLength(line)>FRAME_BYTES) throw new Error('Review native frame exceeds 8 MiB');
   if (line.trim()) {
    let frame: unknown; try { frame = JSON.parse(line); } catch { throw new Error('Invalid review native JSON frame'); }
    if (!record(frame)) throw new Error('Invalid review native event');
    if (typeof frame.uuid === 'string') {
     if (frame.uuid.length > 256) throw new Error('Review native event identity exceeds limit');
     if (this.seen.has(frame.uuid)) { if(newline<0)break; continue; }
     // This is a duplicate-detection window, not a lifetime event quota.
     // Replays older than the retained window may be processed again. Active
     // tools and accepted/final feedback have their own state below.
     if (this.seen.size>=RECENT_EVENT_IDS) this.seen.delete(this.seen.values().next().value!);
     this.seen.add(frame.uuid);
    }
    if (this.kind==='claude') await this.claude(frame); else await this.codex(frame);
   }
   if (newline<0) break;
  }
  if (Buffer.byteLength(this.buffer)>FRAME_BYTES) throw new Error('Review partial native frame exceeds 8 MiB');
  if (this.accepted) this.buffer='';
 }
 private async activity(kind: ReviewActivityEvent['kind'],toolId?: string): Promise<void> {
  await this.opts.onActivity({sessionId:this.sessionId,sequence:++this.sequence,kind,...(toolId?{toolId}:{})});
 }
 private async tool(kind:'tool_started'|'tool_completed',id:unknown): Promise<void> {
  if (typeof id!=='string'||!id||id.length>256) return;
  if (kind==='tool_started') { if(this.tools.has(id))return;if(this.tools.size>=128)throw new Error('Review native active tool limit exceeded');this.tools.add(id); }
  else if(!this.tools.delete(id))return;
  await this.activity(kind,id);
 }
 private async candidate(raw: unknown): Promise<void> {
  if (this.failed || this.accepted) return;
  if (Buffer.byteLength(JSON.stringify(raw)??'')>CANDIDATE_BYTES) throw new Error('Review candidate exceeds 4 MiB');
  const checked=validateAgainstSchema<T>(this.schema,raw);
  if(!checked.ok){
   this.diagnostics.rejected(raw, Object.keys(this.schema['properties'] as object ?? {}));
   for(const issue of checked.issues ?? [{code:'SCHEMA_CONSTRAINT',field:'/',correction:'Return output matching the supplied JSON schema.'}]) this.diagnostics.issue(issue);
   await this.report();return;
  }
  await this.activity('feedback_submitted');
  let receipt: { readonly accepted: boolean };
  try { receipt=await this.opts.onCandidate(checked.value); }
  catch(error){
   const field=record(error)&&typeof error['field']==='string'?error['field']:'/';
   this.diagnostics.rejected(raw, Object.keys(this.schema['properties'] as object ?? {}));
   await this.note({code:'HOST_VALIDATION_ERROR',field,correction:'Correct the host-rejected review field before resubmitting.',message:error instanceof Error?error.message:'Host rejected review feedback'});
   throw new ReviewOutputFailureError(error instanceof Error?error.message:'Host rejected review feedback',this.diagnosticSnapshot(),error);
  }
  if(receipt.accepted){this.value=checked.value;this.accepted=true;this.stop();}
 }
 private async claude(frame:Record<string,unknown>):Promise<void>{
  if(frame.type==='stream_event'&&record(frame.event)){
   const event=frame.event;
   if(event.type==='content_block_delta'&&record(event.delta)&&['text_delta','thinking_delta','input_json_delta'].includes(String(event.delta.type)))await this.activity('model_output');
   if(event.type==='content_block_start'&&record(event.content_block)&&event.content_block.type==='tool_use')await this.tool('tool_started',event.content_block.id);
  }
  if((frame.type==='assistant'||frame.type==='user')&&record(frame.message)&&Array.isArray(frame.message.content)){
   if(frame.type==='assistant')await this.activity('model_output');
   for(const content of frame.message.content){
    if(!record(content))continue;
    if(content.type==='tool_use'){
     await this.tool('tool_started',content.id);
     if(content.name==='StructuredOutput'){
      if(typeof content.id==='string'&&content.id.length<=256){if(this.outputTools.size===128)this.outputTools.delete(this.outputTools.values().next().value!);this.outputTools.add(content.id);}
      await this.candidate(content.input);
     }
    }
    if(content.type==='tool_result'){
     if(typeof content.tool_use_id==='string'&&this.outputTools.delete(content.tool_use_id)&&content.is_error===true){
      // Local schema issues are more precise than the CLI's prose error. Only
      // correlated StructuredOutput failures enter this diagnostic channel.
      if(!this.diagnosticSnapshot().issues.length)await this.note({code:'NATIVE_VALIDATION_ERROR',field:'/',correction:'Return one JSON object matching the supplied schema.',message:typeof content.content==='string'?content.content:'Native StructuredOutput rejected the submission'});
     }
     await this.tool('tool_completed',content.tool_use_id);
    }
   }
  }
  if(frame.type==='result'){
   this.failed=frame.is_error===true;
   this.finalSucceeded=!this.failed&&frame.subtype==='success';
   if(this.failed){
    const message=Array.isArray(frame.errors)?frame.errors.filter((x):x is string=>typeof x==='string').slice(0,8).join('\n'):'Native Claude result failed';
    this.diagnostics.terminal(typeof frame.subtype==='string'?frame.subtype:'result_failed',message);
    await this.note({code:'NATIVE_CLI_FAILURE',field:'/',correction:'Resolve the reported native CLI output failure.',message});
   }
   if(this.finalSucceeded){this.pendingFinal=frame.structured_output;await this.candidate(frame.structured_output);}
  }
 }
 private async codex(frame:Record<string,unknown>):Promise<void>{
  const item=record(frame.item)?frame.item:undefined;
  if(frame.type==='item.started'&&item&&['command_execution','mcp_tool_call'].includes(String(item.type)))await this.tool('tool_started',item.id);
  if(frame.type==='item.completed'&&item){
   if(['command_execution','mcp_tool_call'].includes(String(item.type)))await this.tool('tool_completed',item.id);
   if(item.type==='agent_message'&&typeof item.text!=='string')throw new Error('Review native final message has no text');
   if(item.type==='agent_message'&&typeof item.text==='string'){
    // Only the most recent assistant message can become the final answer.
    this.pendingFinal=undefined;this.pendingJsonError=false;this.finalSucceeded=false;
    await this.activity('model_output');
    if(Buffer.byteLength(item.text)>CANDIDATE_BYTES)throw new Error('Review candidate exceeds 4 MiB');
    let raw:unknown;try{raw=JSON.parse(item.text);}catch{
     this.pendingJsonError=true;return;
    }
    // item.completed alone does not establish finality. Require a successful turn.
    this.pendingFinal=raw;
   }
  }
  if(frame.type==='turn.failed'||frame.type==='error'){
   this.failed=true;
   const message=record(frame.error)&&typeof frame.error.message==='string'?frame.error.message:typeof frame.message==='string'?frame.message:'Native Codex turn failed';
   this.diagnostics.terminal(String(frame.type),message);
   await this.note({code:'NATIVE_CLI_FAILURE',field:'/',correction:'Resolve the reported native CLI output failure.',message});
  }
  if(frame.type==='turn.completed'&&!this.failed){
   this.finalSucceeded=true;
   if(this.pendingJsonError){this.diagnostics.rejectedText('unretained final text');await this.note({code:'INVALID_JSON',field:'/',correction:'Return one valid JSON object.',message:'Final agent message is not valid JSON.'});}
   else if(this.pendingFinal!==undefined)await this.candidate(this.pendingFinal);
  }
 }
}
