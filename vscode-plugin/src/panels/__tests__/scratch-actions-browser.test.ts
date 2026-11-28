import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { runScratchBrowser } from './fixtures/scratch-browser-runner.js';

test('Later typing retained through action flush failure and pane disposal',async()=>{
  const chrome=process.env['INSRC_CHROME_BIN']??['/usr/bin/google-chrome','/usr/bin/chromium'].find(existsSync);assert.ok(chrome);
  const dir=mkdtempSync(join(tmpdir(),'scratch-actions-browser-'));
  try{
    await build({entryPoints:[fileURLToPath(new URL('./fixtures/scratch-actions-browser.ts',import.meta.url))],outfile:join(dir,'fixture.js'),bundle:true,platform:'browser',format:'iife',loader:{'.woff':'file','.woff2':'file','.ttf':'file'},logLevel:'silent'});
    writeFileSync(join(dir,'index.html'),'<!doctype html><meta charset="utf-8"><script defer src="fixture.js"></script>');
    const html=await runScratchBrowser(chrome,dir),match=html.match(/<pre id="scratch-result">([\s\S]*?)<\/pre>/);assert.ok(match,html);
    const data=JSON.parse(match[1]!.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&'));
    if(process.env['INSRC_ACTION_EVIDENCE'])writeFileSync(process.env['INSRC_ACTION_EVIDENCE'],JSON.stringify(data,null,2));
    for(const row of data.actions){assert.equal(row.before,0);assert.ok(row.validationMs<300,JSON.stringify(row));assert.equal(row.request.draftSeq,1);assert.equal(row.request.docVersion,2);assert.ok(row.events.indexOf('ack:1')<row.events.indexOf(row.action));assert.match(row.draft,/edit/);}
    assert.equal(data.sent.before,0);assert.equal(data.sent.messages.length,1);assert.equal(data.sent.messages[0].selectedText,data.sent.selected);assert.ok(data.sent.events.indexOf('ack:1')<data.sent.events.indexOf('send-selection'));
    assert.deepEqual(data.locking.immediate,{readonly:true,actualLocked:false});assert.equal(data.locking.before,false);assert.equal(data.locking.locked,true);assert.equal(data.locking.readonly,true);assert.ok(data.locking.events.indexOf('ack:1')<data.locking.events.indexOf('lock-committed:true'));
    for(const row of data.newer){assert.deepEqual(row.requests,[]);assert.match(row.markdown,/newer/);assert.match(row.status,/changed/);if(row.action==='send'){assert.equal(row.retained,row.selected);assert.equal(row.retainedVisible,true);}}
    assert.equal(data.nativeSave.before,0);assert.equal(data.nativeSave.messages.length,1);assert.equal(data.nativeSave.messages[0].confirmed,true);assert.equal(data.nativeSave.messages[0].draftSeq,1);
    for(const row of data.failures){assert.deepEqual(row.requests,[]);assert.match(row.retained.markdown,/retained/);if(row.kind==='worker'){assert.equal(row.readonly,true);assert.match(row.markdown,/retained/);assert.ok(row.status);}else assert.equal(row.waiting,false);}
  }finally{rmSync(dir,{recursive:true,force:true});}
});
