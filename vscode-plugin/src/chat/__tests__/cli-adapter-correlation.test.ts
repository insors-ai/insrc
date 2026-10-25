import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionOutput } from '../session-output.js';
import { createProviderRegistry, nodeSpawner } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import { makeFakeSpawner } from './fixtures.js';

const text = (value: string): string => JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: value }] } });
async function collect(stream: AsyncIterable<TurnEvent>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

test('queued results cannot truncate the actual user reply', async () => {
  const spawner = makeFakeSpawner({ lines: [
    JSON.stringify({ type: 'system', subtype: 'task_notification' }),
    JSON.stringify({ type: 'result', result: '', num_turns: 0, queued_turn_count: 0 }),
    text('Actual reply'),
    JSON.stringify({ type: 'result', user_message_uuid: '__REQUEST_UUID__', result: 'Actual reply' }),
  ] });
  const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true }).get('claude');
  const events = await collect(adapter.run({ provider: 'claude', cwd: '/tmp', prompt: 'hi' }));
  assert.deepEqual(events.filter(e => e.kind === 'assistant-delta').map(e => e.text), ['Actual reply']);
  assert.equal(events.filter(e => e.kind === 'done').length, 1);
});

test('only singular or merged request UUID results complete, including empty and failed own results', async () => {
  for (const correlation of [{ user_message_uuid: '__REQUEST_UUID__' }, { user_message_uuids: ['another', '__REQUEST_UUID__'] }]) {
    for (const failed of [false, true]) {
      const spawner = makeFakeSpawner({ hangUntilKilled: true, lines: [
        JSON.stringify({ type: 'result', is_error: true, result: 'older failure', user_message_uuid: 'other' }),
        JSON.stringify({ type: 'result', user_message_uuids: [123, '__REQUEST_UUID__'] }),
        text('retained'),
        JSON.stringify({ type: 'result', ...correlation, is_error: failed, num_turns: 0, result: failed ? 'own failure' : '' }),
        text('after own result'),
      ] });
      const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true }).get('claude');
      try {
        const events = await collect(adapter.run({ provider: 'claude', cwd: '/tmp', prompt: 'hi' }));
        assert.deepEqual(events.filter(e => e.kind === 'assistant-delta').map(e => e.text), ['retained']);
        assert.equal(events.at(-1)?.kind, 'done');
        assert.equal((events.at(-1) as { ok: boolean }).ok, !failed);
        if (failed) assert.equal((events.at(-1) as { message: string }).message, 'own failure');
        assert.equal(spawner.procs[0]!.exited(), false);
        assert.deepEqual(spawner.procs[0]!.signals(), []);
      } finally { spawner.procs[0]?.exitNow(); }
    }
  }
});

test('stream input preserves exact prompt and options, and missing correlation cannot synthesize success', async () => {
  const prompt = '--resume not an option\nα🙂';
  const spawner = makeFakeSpawner({ lines: [text('partial'), JSON.stringify({ type: 'result', result: '' })] });
  const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true }).get('claude');
  const events = await collect(adapter.run({ provider: 'claude', cwd: '/tmp', prompt, resume: {provider:'claude',nativeSessionId:'native'}, permissionMode:'manual', readDirs:['/read dir'], allowedTools:['Read'] }));
  const request = JSON.parse(spawner.procs[0]!.writes()[0]!);
  assert.equal(request.type, 'user');
  assert.equal(request.message.content, prompt);
  assert.equal(events[0]?.turnId, `claude-request-${request.uuid}`);
  assert.deepEqual(spawner.calls[0]!.args, ['-p','--input-format=stream-json','--output-format=stream-json','--replay-user-messages','--verbose','--resume','native','--add-dir','/read dir','--permission-prompts','host','--allowedTools','Read','--']);
  assert.equal(events.at(-1)?.kind, 'error');
  assert.match((events.at(-1) as {message:string}).message, /without a result for this request/);
});

test('initial input write failure stops the process and returns a visible error without retry', async () => {
  for (const failure of ['missing','throws','rejects'] as const) {
    const spawner = makeFakeSpawner({ lines: [], hangUntilKilled: true });
    const adapter = createProviderRegistry({ isInstalled: () => true, spawn: (command,args,opts) => {
      const p=spawner.spawn(command,args,opts);
      if(failure==='missing') { const {write: _write,...rest}=p;return rest; }
      return {...p,write:()=>{if(failure==='throws')throw new Error('closed input');return Promise.reject(new Error('closed input'));}};
    } }).get('claude');
    const events=await collect(adapter.run({provider:'claude',cwd:'/tmp',prompt:'hi'}));
    assert.equal(events.at(-1)?.kind,'error');
    assert.match((events.at(-1) as {message:string}).message,/stdin unavailable|closed input/);
    assert.equal(spawner.calls.length,1);
    assert.deepEqual(spawner.procs[0]!.signals(),['SIGTERM']);
  }
});

test('correlated resume reconstructs identity after acknowledgement and checkpoints its own terminal', async () => {
  const sessionOutput=createSessionOutput({root:join(mkdtempSync(join(tmpdir(),'issue83-')),'output'),pollMs:5});
  const uuid='12345678-1234-4234-8234-123456789abc';
  const segment=await sessionOutput.beginTurn('session',`claude-request-${uuid}`);
  const earlier=JSON.stringify({type:'user',uuid,isReplay:true})+'\n'+text('already displayed')+'\n';
  appendFileSync(segment.outPath,earlier);
  const cursor={...segment.cursor,offset:segment.cursor.offset+Buffer.byteLength(earlier)};
  const late=[JSON.stringify({type:'result',user_message_uuid:'old',result:''}),text('later reply'),JSON.stringify({type:'result',user_message_uuids:[uuid]})].join('\n')+'\n';
  appendFileSync(segment.outPath,late);
  const adapter=createProviderRegistry({spawn:makeFakeSpawner({lines:[]}).spawn,isInstalled:()=>true,sessionOutput,isAlive:()=>true,processStartTime:()=>1}).get('claude');
  const progress:number[]=[];
  const events=await collect(adapter.resume({cursor,pid:123,startedAt:1},{onProgress:c=>progress.push(c.offset)}));
  assert.deepEqual(events.filter(e=>e.kind==='assistant-delta').map(e=>e.text),['later reply']);
  assert.equal(events.at(-1)?.kind,'done');
  assert.equal(progress.length,3,'ignored result and terminal are checkpointed');
  assert.equal(progress.at(-1),cursor.offset+Buffer.byteLength(late));
});

test('correlated EOF retains partial output and reports native nonzero exit or missing result', async () => {
  for(const code of [0,9]) {
    const spawner=makeFakeSpawner({lines:[text('partial'),JSON.stringify({type:'result',user_message_uuid:'other'})],exit:{code,signal:null},stderr:code?'native failure':''});
    const adapter=createProviderRegistry({spawn:spawner.spawn,isInstalled:()=>true}).get('claude');
    const events=await collect(adapter.run({provider:'claude',cwd:'/tmp',prompt:'hi'}));
    assert.equal(events[0]?.kind,'assistant-delta');
    assert.equal(events.at(-1)?.kind,'error');
    assert.match((events.at(-1) as {message:string}).message,code?/exited with code 9: native failure/:/without a result for this request/);
  }
});

test('live pipe and retained output preserve tools and final reply after a queued result', async () => {
  for (const filed of [false, true]) {
    const root = mkdtempSync(join(tmpdir(), 'issue83-live-'));
    const sessionOutput = createSessionOutput({ root: join(root, 'output'), pollMs: 5 });
    const script = `let input='';process.stdin.on('data',chunk=>{input+=chunk;const end=input.indexOf('\\n');if(end<0)return;const req=JSON.parse(input.slice(0,end));process.stdin.pause();const frames=[
      {type:'result',num_turns:0,queued_turn_count:0,result:''},
      {type:'assistant',message:{content:[{type:'tool_use',id:'tool-1',name:'Bash',input:{command:'echo retained'}}]}},
      {type:'user',message:{content:[{type:'tool_result',tool_use_id:'tool-1',content:'retained tool output'}]}},
      {type:'assistant',message:{content:[{type:'text',text:'Final reply'}]}},
      {type:'result',user_message_uuid:req.uuid,result:'Final reply'}
    ];for(const frame of frames)process.stdout.write(JSON.stringify(frame)+'\\n');setTimeout(()=>process.exit(0),10000);});`;
    // String.raw is unnecessary here: the child needs a literal JS newline escape.
    const childScript = script.replaceAll('\\\\n', '\\n');
    let proc: import('../cli-adapter.js').TurnProcess | undefined;
    const adapter = createProviderRegistry({
      spawn: (_command, _args, opts) => nodeSpawner(process.execPath, ['-e', childScript], opts),
      isInstalled: () => true, sessionOutput,
    }).get('claude');
    try {
      const events = await collect(adapter.run({ provider: 'claude', cwd: root, prompt: 'hi' }, {
        ...(filed ? { sessionId: 'session' } : {}), onSpawn: p => { proc = p; },
      }));
      assert.deepEqual(events.map(e => e.kind), ['tool-call', 'tool-result', 'assistant-delta', 'done']);
      assert.equal((events[1] as {output:string}).output, 'retained tool output');
      assert.equal((events[2] as {text:string}).text, 'Final reply');
      assert.equal((events[3] as {ok:boolean}).ok, true);
      assert.ok(proc);
      let exited = false;
      void proc.exit.then(() => { exited = true; });
      await new Promise(r => setTimeout(r, 5));
      assert.equal(exited, false, 'own completion precedes background process exit');
    } finally { await proc?.stop(); }
  }
});
