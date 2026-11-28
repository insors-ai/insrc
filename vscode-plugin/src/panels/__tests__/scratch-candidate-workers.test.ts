import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { build } from 'esbuild';
import { ScratchValidationClient } from '../scratch-validation-client.js';
import { createScratchHostValidator } from '../scratch-validation-host.js';
import { scratchDigest } from '../scratch-editor-provider.js';
import { scratchSourceCodec,checkScratchMarkdownEdit } from '../scratch-markdown.js';
import { supportedScratchMarkdown,unsupportedScratchMarkdown } from './fixtures/scratch-markdown-corpus.js';
import { scratchHostWorkerBytes } from './fixtures/scratch-host-worker-bundle.js';
import { runScratchBrowser } from './fixtures/scratch-browser-runner.js';
import { scratchEditorHtml } from '../scratch-editor-html.js';

test('real configured and host worker candidate reuse preserves fidelity and cold fallback', {timeout:120000}, async()=>{
  const dir=await mkdtemp(join(tmpdir(),'scratch-candidate-workers-'));let worker:Worker|undefined,probe:ScratchValidationClient|undefined,production:ReturnType<typeof createScratchHostValidator>|undefined;
  const evidence:Record<string,unknown>={};
  try{
    const productionPath=join(dir,'host-production.cjs'),probePath=join(dir,'host-probe.cjs');await writeFile(productionPath,await scratchHostWorkerBytes());
    await build({entryPoints:[fileURLToPath(new URL('./fixtures/scratch-candidate-host-worker.ts',import.meta.url))],outfile:probePath,bundle:true,platform:'node',format:'cjs',target:'node22',logLevel:'silent'});
    worker=new Worker(probePath);const owned=worker;let counts:[string,number][]=[];
    probe=new ScratchValidationClient({post:value=>owned.postMessage(value),listen:(message,error)=>{const receive=(value:any)=>{if(value?.type==='candidate-probe')counts=value.counts;message(value);};owned.on('message',receive);owned.on('error',error);return()=>{owned.off('message',receive);owned.off('error',error);};},terminate:()=>{void owned.terminate();}});
    production=createScratchHostValidator(productionPath);const rows=[];
    for(const [name,client] of [['production',production.client],['instrumented',probe]] as const){
      const source='# Base\n',draft='# Candidate\n',next='# Latest\n';
      const id=(text:string,seq:number,version:number)=>({paneSessionId:'host-proof',draftSeq:seq,editId:`edit_${seq}`,baseVersion:version,baseDigest:scratchDigest(text)});
      const firstId=id(source,1,1),first=await client.run({source,draft,baseKey:`1:${firstId.baseDigest}`,identity:firstId});assert.equal(first.allowed,true);assert.ok(first.ticket);assert.equal(client.acceptCandidate(first.ticket),true);assert.equal(client.confirmCandidate(first.ticket,{...firstId,version:2,digest:scratchDigest(draft),markdown:draft}),true);
      const secondId=id(draft,2,2),second=await client.run({source:draft,draft:next,baseKey:`2:${secondId.baseDigest}`,identity:secondId});const warmCounts=counts;assert.equal(second.allowed,true);assert.ok(second.ticket);assert.equal(client.acceptCandidate(second.ticket),true);assert.equal(client.confirmCandidate(second.ticket,{...secondId,version:3,digest:'f'.repeat(64),markdown:next}),false);
      const coldId=id(next,3,3),cold=await client.run({source:next,draft:'# Cold\n',baseKey:`3:${coldId.baseDigest}`,identity:coldId});assert.equal(cold.allowed,true);
      if(name==='instrumented'){assert.equal(warmCounts.find(([s])=>s===draft),undefined,'Actual host source parse is skipped only after full candidate proof and canonical confirmation');assert.equal(warmCounts.find(([s])=>s===next)?.[1],1,'Fresh candidate still parsed');assert.equal(counts.find(([s])=>s===next)?.[1],1,'Bad confirmation forces full source check');}
      rows.push({name,warmCounts,coldCounts:counts});
    }
    const corpus=[];let seq=10;
    for(const source of [...supportedScratchMarkdown,...unsupportedScratchMarkdown]){const draft=source+'\nAdditional text.\n',baseDigest=scratchDigest(source),expected=checkScratchMarkdownEdit(source,draft,scratchSourceCodec,scratchSourceCodec.parse(draft));const result=await production.client.run({source,draft,baseKey:`10:${baseDigest}`,identity:{paneSessionId:'host-proof',draftSeq:seq,editId:`edit_${seq++}`,baseVersion:10,baseDigest}});assert.equal(result.allowed,expected.allowed);if(!result.allowed)assert.equal(result.ticket,undefined);corpus.push({expected:expected.allowed,allowed:result.allowed});}
    evidence['host']={rows,corpus};probe.dispose();await owned.terminate();worker=undefined;await production.dispose();production=undefined;
    const chrome=process.env['INSRC_CHROME_BIN']??['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);assert.ok(chrome);
    await build({entryPoints:[fileURLToPath(new URL('./fixtures/scratch-candidate-browser-worker.ts',import.meta.url))],outfile:join(dir,'probe.js'),bundle:true,platform:'browser',conditions:['worker'],format:'iife',minify:true,target:'chrome120',logLevel:'silent'});
    await build({entryPoints:[fileURLToPath(new URL('./fixtures/scratch-candidate-browser.ts',import.meta.url))],outfile:join(dir,'fixture.js'),bundle:true,platform:'browser',format:'iife',loader:{'.woff':'file','.woff2':'file','.ttf':'file'},logLevel:'silent'});
    const probeBytes=await readFile(join(dir,'probe.js'),'utf8');let html=scratchEditorHtml({script:'vscode-webview://fixture/fixture.js',style:'vscode-webview://fixture/fixture.css',cspSource:'vscode-webview://fixture'},'candidate_nonce');html=html.replace('<head>',()=>'<head><script nonce="candidate_nonce" type="application/json" id="candidate-probe-source">'+JSON.stringify(probeBytes).replaceAll('<','\\u003c')+'</script>');await writeFile(join(dir,'index.html'),html);
    const result=await runScratchBrowser(chrome,dir,'scratch-result','candidate_nonce'),match=result.match(/<pre id="scratch-result">([\s\S]*?)<\/pre>/);assert.ok(match,result);const data=JSON.parse(match[1]!.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));evidence['browser']=data;
    assert.deepEqual(data.paneChecks,{provisional:true,ignoredDuplicate:true,ignoredCancellation:true,newerTextRetained:true,baseConfirmed:true});assert.deepEqual(data.violations,[]);assert.equal(data.rows.length,2);for(const row of data.rows){assert.equal(row.allowed,true);assert.equal(row.wrongDigest,false);assert.equal(row.wrongIntent,false);if(row.name==='instrumented'){assert.equal(row.warmSourceParses,0);assert.equal(row.warmDraftParses,1);assert.equal(row.coldSourceParses,1);}}
    assert.equal(data.corpus.length,supportedScratchMarkdown.length+unsupportedScratchMarkdown.length);for(const row of data.corpus){assert.equal(row.allowed,row.expected);if(!row.allowed)assert.equal(row.ticket,false);}
  }finally{probe?.dispose();if(worker)await worker.terminate();await production?.dispose();if(process.env['INSRC_CANDIDATE_EVIDENCE'])await writeFile(process.env['INSRC_CANDIDATE_EVIDENCE'],JSON.stringify(evidence,null,2));await rm(dir,{recursive:true,force:true});}
});
