import { test } from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSessionOutput } from '../session-output.js';
import { createProviderRegistry, nodeSpawner } from '../cli-adapter.js';
import type { TurnEvent } from '../stream-events.js';
import { makeFakeSpawner, waitFor } from './fixtures.js';

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
  // main's write seam (sync decision D11): false = undelivered, a throw is undelivered, onError = an asynchronous failure
  for (const failure of ['missing','throws','false','onError'] as const) {
    const spawner = makeFakeSpawner({ lines: [], hangUntilKilled: true });
    const adapter = createProviderRegistry({ isInstalled: () => true, spawn: (command,args,opts) => {
      const p=spawner.spawn(command,args,opts);
      if(failure==='missing') { const {write: _write,...rest}=p;return rest; }
      return {...p,write:(_data: string, onError?: (err: unknown) => void)=>{
        if(failure==='throws')throw new Error('closed input');
        if(failure==='onError'){ queueMicrotask(() => onError?.(new Error('closed input'))); return true; }
        return false;
      }};
    } }).get('claude');
    const events=await collect(adapter.run({provider:'claude',cwd:'/tmp',prompt:'hi'}));
    assert.equal(events.at(-1)?.kind,'error', failure);
    assert.match((events.at(-1) as {message:string}).message,/stdin/, failure);
    assert.equal(spawner.calls.length,1);
    const signals=spawner.procs[0]!.signals();
    assert.ok(signals.length>=1&&signals.every(sig=>sig==='SIGTERM'), failure);
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
    let proc: import('../cli-adapter.js').TurnProcess | undefined;
    const adapter = createProviderRegistry({
      spawn: (_command, _args, opts) => nodeSpawner(process.execPath, ['-e', script], opts),
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

test('a legacy turn id (no request uuid) ends at its first result, as on main (sync decision D9)', async () => {
  const sessionOutput = createSessionOutput({ root: join(mkdtempSync(join(tmpdir(), 'issue83-legacy-')), 'output'), pollMs: 5 });
  const segment = await sessionOutput.beginTurn('session', 'legacy-turn');
  appendFileSync(segment.outPath, [text('already displayed'), JSON.stringify({ type: 'result', is_error: true, result: 'native failure' }), text('after the result')].join('\n') + '\n');
  await sessionOutput.endTurn('session', 'legacy-turn', { code: 0, signal: null });
  const adapter = createProviderRegistry({ spawn: makeFakeSpawner({ lines: [] }).spawn, isInstalled: () => true, sessionOutput, isAlive: () => false, livenessPollMs: 5 }).get('claude');
  const events = await collect(adapter.resume({ cursor: segment.cursor, pid: 123, startedAt: 1 }));
  assert.deepEqual(events.map(e => e.kind), ['assistant-delta', 'done']);
  assert.equal((events[1] as {ok:boolean}).ok, false);
  assert.equal((events[1] as {message:string}).message, 'native failure');
});

test('checkpointed own terminal is recovered on reattach without duplicated content', async () => {
  const sessionOutput = createSessionOutput({ root: join(mkdtempSync(join(tmpdir(), 'issue83-terminal-')), 'output'), pollMs: 5 });
  const uuid = '12345678-1234-4234-8234-123456789abc';
  const segment = await sessionOutput.beginTurn('session', `claude-request-${uuid}`);
  const prefix = [text('displayed'), JSON.stringify({type:'result',user_message_uuid:uuid,is_error:true,result:'own failure'})].join('\n')+'\n';
  appendFileSync(segment.outPath,prefix);
  const cursor = {...segment.cursor,offset:segment.cursor.offset+Buffer.byteLength(prefix)};
  const adapter = createProviderRegistry({spawn:makeFakeSpawner({lines:[]}).spawn,isInstalled:()=>true,sessionOutput,isAlive:()=>false}).get('claude');
  const events = await collect(adapter.resume({cursor,pid:123,startedAt:1}));
  assert.deepEqual(events.map(e=>e.kind),['done']);
  assert.equal((events[0] as {message:string}).message,'own failure');
});

test('Codex item completion retains content and native turn completion does not wait for exit', async () => {
  const spawner=makeFakeSpawner({hangUntilKilled:true,lines:[
    JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Codex reply'}}),
    JSON.stringify({type:'turn.completed'}),
    JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'late'}}),
  ]});
  const adapter=createProviderRegistry({spawn:spawner.spawn,isInstalled:()=>true}).get('codex');
  try {
    const events=await collect(adapter.run({provider:'codex',cwd:'/tmp',prompt:'hi'}));
    assert.deepEqual(events.map(e=>e.kind),['assistant-delta','done']);
    assert.equal((events[0] as {text:string}).text,'Codex reply');
    assert.equal(spawner.procs[0]!.exited(),false);
    assert.deepEqual(spawner.procs[0]!.signals(),[]);
  } finally {spawner.procs[0]?.exitNow();}
});

test('a retained segment that is gone is an observation failure, never an invented completion', async () => {
  const sessionOutput = createSessionOutput({ root: join(mkdtempSync(join(tmpdir(), 'issue83-old-')), 'output'), pollMs: 5 });
  const segment = await sessionOutput.beginTurn('session', 'old-turn');
  await sessionOutput.endTurn('session','old-turn',{code:0,signal:null});
  const adapter=createProviderRegistry({spawn:makeFakeSpawner({lines:[]}).spawn,isInstalled:()=>true,sessionOutput,isAlive:()=>false,logger:{warn:()=>{},error:()=>{}}}).get('claude');
  const missing=await collect(adapter.resume({cursor:{...segment.cursor,turnId:'missing'},pid:123,startedAt:1}));
  assert.ok(missing.every(e=>e.kind!=='done'),'retention failure must not invent successful completion');
  assert.equal(missing.at(-1)?.kind,'error');
});

test('a correlated Claude turn ends the CLI stdin at its own result, not before', async () => {
  const spawner = makeFakeSpawner({ hangUntilKilled: true, lines: [
    JSON.stringify({ type: 'result', user_message_uuid: 'other' }),
    text('reply'),
    JSON.stringify({ type: 'result', user_message_uuid: '__REQUEST_UUID__', result: 'reply' }),
  ] });
  const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true }).get('claude');
  try {
    let endsBeforeDone = -1;
    for await (const event of adapter.run({ provider: 'claude', cwd: '/tmp', prompt: 'hi' })) {
      if (event.kind === 'assistant-delta') assert.equal(spawner.procs[0]!.inputEnds(), 0);
      if (event.kind === 'done') endsBeforeDone = spawner.procs[0]!.inputEnds();
    }
    assert.equal(endsBeforeDone, 1);
    assert.deepEqual(spawner.procs[0]!.signals(), []);
  } finally { spawner.procs[0]?.exitNow(); }
});

test('a prompt-argument CLI turn never has an input to end', async () => {
  const spawner = makeFakeSpawner({ lines: [JSON.stringify({ type: 'turn.completed' })] });
  const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true }).get('codex');
  await collect(adapter.run({ provider: 'codex', cwd: '/tmp', prompt: 'hi' }));
  assert.equal(spawner.procs[0]!.inputEnds(), 0);
});

// ISSUE-48ffbec56130edb6 / LLD s1: a reader abandoned before the result must end the CLI's input,
// and only then. The lifecycle abandons an iterator with return(); `break` does the same.
test('an abandoned session-file Claude turn ends its input once and is not killed', async () => {
  const spawner = makeFakeSpawner({ hangUntilKilled: true, lines: [text('working')] });
  const sessionOutput = createSessionOutput({ root: join(mkdtempSync(join(tmpdir(), 'abandon-file-')), 'output'), pollMs: 5 });
  const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true, sessionOutput }).get('claude');
  try {
    for await (const event of adapter.run({ provider: 'claude', cwd: '/tmp', prompt: 'hi' }, { sessionId: 'abandon-file' })) {
      if (event.kind === 'assistant-delta') break;
    }
    assert.equal(spawner.procs[0]!.inputEnds(), 1);
    assert.deepEqual(spawner.procs[0]!.signals(), [], 'a turn that writes to its session file is detached from, never killed');
  } finally { spawner.procs[0]?.exitNow(); }
});

test('an abandoned pipe turn ends its input and is stopped with SIGTERM', async () => {
  const spawner = makeFakeSpawner({ hangUntilKilled: true, lines: [text('working')] });
  const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true }).get('claude');
  try {
    for await (const event of adapter.run({ provider: 'claude', cwd: '/tmp', prompt: 'hi' })) {
      if (event.kind === 'assistant-delta') break;
    }
    assert.equal(spawner.procs[0]!.inputEnds(), 1);
    assert.deepEqual(spawner.procs[0]!.signals(), ['SIGTERM']);
  } finally { spawner.procs[0]?.exitNow(); }
});

test("a throwing endInput does not stop the finally's cleanup", async () => {
  const spawner = makeFakeSpawner({ hangUntilKilled: true, lines: [text('working')] });
  const adapter = createProviderRegistry({
    isInstalled: () => true,
    spawn: (command, args, opts) => ({ ...spawner.spawn(command, args, opts), endInput: () => { throw new Error('seam failed'); } }),
  }).get('claude');
  try {
    for await (const event of adapter.run({ provider: 'claude', cwd: '/tmp', prompt: 'hi' })) {
      if (event.kind === 'assistant-delta') break;
    }
    assert.deepEqual(spawner.procs[0]!.signals(), ['SIGTERM'], 'the pipe-turn kill still ran after the seam threw');
  } finally { spawner.procs[0]?.exitNow(); }
});

test('an abandonment after the result adds no second call', async () => {
  const spawner = makeFakeSpawner({ hangUntilKilled: true, lines: [
    text('reply'),
    JSON.stringify({ type: 'result', user_message_uuid: '__REQUEST_UUID__', result: 'reply' }),
  ] });
  const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true }).get('claude');
  try {
    for await (const event of adapter.run({ provider: 'claude', cwd: '/tmp', prompt: 'hi' })) {
      if (event.kind === 'done') break;
    }
    assert.equal(spawner.procs[0]!.inputEnds(), 1, 'ended at the result, and not again by the finally');
    assert.deepEqual(spawner.procs[0]!.signals(), []);
  } finally { spawner.procs[0]?.exitNow(); }
});

test('an abandoned Codex turn never calls endInput', async () => {
  const spawner = makeFakeSpawner({ hangUntilKilled: true, lines: [
    JSON.stringify({ type: 'thread.started', thread_id: 'thread-codex-1' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'working' } }),
  ] });
  const adapter = createProviderRegistry({ spawn: spawner.spawn, isInstalled: () => true }).get('codex');
  try {
    for await (const event of adapter.run({ provider: 'codex', cwd: '/tmp', prompt: 'hi' })) {
      if (event.kind === 'assistant-delta') break; // abandoned before any terminal event
    }
    assert.equal(spawner.procs[0]!.inputEnds(), 0, 'a Codex turn has no input to end');
    assert.deepEqual(spawner.procs[0]!.signals(), ['SIGTERM'], 'the pipe-turn kill is the only cleanup, as before');
  } finally { spawner.procs[0]?.exitNow(); }
});
