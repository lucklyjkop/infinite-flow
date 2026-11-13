'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {test} = require('node:test');
const {webcrypto} = require('node:crypto');
const source = fs.readFileSync(path.resolve(__dirname, '../loading-page/system-chat.js'), 'utf8');
const storeSource = fs.readFileSync(path.resolve(__dirname, '../loading-page/save-store.js'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const window = new EventTarget(), requests = [], written = [], saves = new Map();
  let activeId = null, storageError = false;
  let config = {protocol:'openai', baseUrl:'https://test.invalid/v1', name:'test-model', apiKey:'test-not-a-real-key'};
  window.InfiniteSettings = {getModelConnection:() => ({...config})};
  window.InfiniteSaves = {
    active:() => saves.has(activeId) ? clone(saves.get(activeId)) : null,
    appendMessagePair(id, user, assistant) {
      if (storageError) throw new Error('Storage full');
      assert.ok(saves.has(id)); written.push({id, user, assistant});
      saves.get(id).chat.push({role:'user',content:user},{role:'assistant',content:assistant});
    },
  };
  window.InfiniteSystemLive2D = {greet() {}};
  const context = vm.createContext({window, CustomEvent, TextDecoder, AbortController, setTimeout, clearTimeout,
    fetch:(_url, options) => new Promise((resolve,reject) => requests.push({options,payload:JSON.parse(options.body),resolve,reject})),
  });
  vm.runInContext(source, context);
  const emit = (name, detail) => window.dispatchEvent(new CustomEvent(name, {detail,cancelable:true}));
  return {
    window, requests, written, saves,
    add(id, chat=[]) {saves.set(id,{id,chat:clone(chat)});},
    activate(id) {activeId=id;emit('infinite:saveactive',{id});},
    leave() {emit('infinite:systemleaving');},
    setConfig(next) {config={...config,...next};emit('infinite:settingssaved');},
    failStorage() {storageError=true;},
    send(text) {
      let promise; const replies=[],progress=[];
      const handled=!emit('infinite:systemmessage',{text,progress:(kind,delta)=>progress.push({kind,delta}),respond:reply=>replies.push(reply),waitUntil:job=>{promise=job;}});
      assert.ok(handled);assert.ok(promise);
      return {promise,replies,progress};
    },
    respond(index,reply='回复',sessionId='a'.repeat(32)) {
      requests[index].resolve({ok:true,json:async()=>({reply,sessionId,provider:'dsh'})});
    },
    state() {return clone(window.InfiniteSystemChat.getState());},
  };
}
test('requires a save before sending', async()=>{
  const f=fixture(), run=f.send('你好');
  await assert.rejects(run.promise,error=>error.userMessage.includes('存档'));
  assert.equal(f.requests.length,0);
});
test('restores saved context and persists only a completed pair', async()=>{
  const f=fixture(), old=[{role:'user',content:'旧问'},{role:'assistant',content:'旧答'}];
  f.add('A',old);f.activate('A');const run=f.send('新问');
  assert.deepEqual(f.requests[0].payload.history,old);assert.equal(f.requests[0].payload.sessionId,null);
  assert.equal(f.written.length,0);f.respond(0,'新答');assert.equal(await run.promise,true);
  assert.deepEqual(f.written,[{id:'A',user:'新问',assistant:'新答'}]);assert.deepEqual(run.replies,['新答']);
  assert.ok(!JSON.stringify(f.saves.get('A')).includes('apiKey'));
});
test('each save keeps an independent session and history', async()=>{
  const f=fixture();f.add('A');f.add('B');f.activate('A');
  let run=f.send('A问');f.respond(0,'A答','a'.repeat(32));await run.promise;
  f.activate('B');run=f.send('B问');assert.equal(f.requests[1].payload.sessionId,null);assert.deepEqual(f.requests[1].payload.history,[]);
  f.respond(1,'B答','b'.repeat(32));await run.promise;
  f.activate('A');run=f.send('A续');assert.equal(f.requests[2].payload.sessionId,'a'.repeat(32));
  assert.deepEqual(f.requests[2].payload.history,[{role:'user',content:'A问'},{role:'assistant',content:'A答'}]);
  f.respond(2);await run.promise;
});
test('late old reply cannot write, display, or change new-save phase', async()=>{
  const f=fixture();f.add('A');f.add('B');f.activate('A');const old=f.send('A');
  f.activate('B');assert.ok(f.requests[0].options.signal.aborted);const current=f.send('B');
  f.respond(0,'late A');assert.equal(await old.promise,false);assert.deepEqual(old.replies,[]);
  assert.equal(f.written.length,0);assert.equal(f.state().phase,'sending');assert.equal(f.state().busy,true);
  f.respond(1,'B answer');assert.equal(await current.promise,true);assert.equal(f.written[0].id,'B');
});
test('intentional navigation cancels without turning the next screen into error', async()=>{
  const f=fixture();f.add('A');f.activate('A');const run=f.send('A');f.leave();
  f.requests[0].reject(new Error('aborted'));assert.equal(await run.promise,false);
  assert.equal(f.state().phase,'idle');assert.equal(f.written.length,0);assert.deepEqual(run.replies,[]);
});
test('failed API responses do not enter the save', async()=>{
  const f=fixture();f.add('A');f.activate('A');const run=f.send('A');
  f.requests[0].resolve({ok:false,json:async()=>({error:'测试错误'})});
  await assert.rejects(run.promise,error=>error.userMessage==='测试错误');assert.equal(f.written.length,0);assert.equal(f.state().phase,'error');
});
test('history is bounded by complete turns and strips unrelated fields', async()=>{
  const f=fixture(), messages=[];
  for(let i=0;i<14;i++)messages.push({role:'user',content:'问'.repeat(1000),apiKey:'never-copy'}, {role:'assistant',content:'答'.repeat(1000),name:'never-copy'});
  f.add('A',messages);f.activate('A');const run=f.send('新问'), h=f.requests[0].payload.history;
  assert.equal(h.length,16);assert.equal(h.reduce((s,m)=>s+m.content.length,0),16000);
  assert.ok(h.every((m,i)=>m.role===(i%2?'assistant':'user')&&Object.keys(m).length===2));
  f.respond(0);await run.promise;
});
test('connection changes discard transient session IDs but keep explicit saved context', async()=>{
  const f=fixture();f.add('A');f.activate('A');let run=f.send('旧问');f.respond(0,'旧答');await run.promise;
  f.setConfig({name:'other-model'});run=f.send('新问');assert.equal(f.requests[1].payload.sessionId,null);
  assert.equal(f.requests[1].payload.history[1].content,'旧答');f.respond(1);await run.promise;
});
test('history bounds do not split Unicode code points', async()=>{
  const f=fixture();f.add('A',[{role:'user',content:'问'}, {role:'assistant',content:'🌸'.repeat(12001)}]);f.activate('A');
  const run=f.send('新问'), saved=f.requests[0].payload.history[1].content;
  assert.equal(Array.from(saved).length,12000);assert.equal(saved,'🌸'.repeat(12000));f.respond(0);await run.promise;
});
test('storage failure preserves the visible reply and reports it was not saved', async()=>{
  const f=fixture();f.add('A');f.activate('A');f.failStorage();const run=f.send('新问');f.respond(0,'已收到的回复');
  await assert.rejects(run.promise,error=>error.userMessage.includes('未能写入存档'));
  assert.deepEqual(run.replies,['已收到的回复']);assert.equal(f.written.length,0);
});
test('NDJSON thinking and text stream separately across UTF-8 boundaries; only final reply is saved',async()=>{
  const f=fixture();f.add('A');f.activate('A');const run=f.send('你好');
  const events=[{type:'thinking',delta:'先看看🌸。'},{type:'ping'},{type:'text',delta:'<b>我在。</b>'},{type:'done',reply:'<b>我在。</b>',sessionId:'a'.repeat(32)}];
  const bytes=new TextEncoder().encode(events.map(e=>JSON.stringify(e)+'\n').join(''));
  f.requests[0].resolve(new Response(new ReadableStream({start(c){for(const byte of bytes)c.enqueue(new Uint8Array([byte]));c.close();}}),{headers:{'Content-Type':'application/x-ndjson'}}));
  assert.equal(await run.promise,true);assert.deepEqual(run.progress,[{kind:'thinking',delta:'先看看🌸。'},{kind:'text',delta:'<b>我在。</b>'}]);
  assert.equal(f.written[0].assistant,'<b>我在。</b>');assert.ok(!JSON.stringify(f.saves.get('A')).includes('先看看'));
});
test('a truncated stream or explicit stream error cannot persist a partial answer',async()=>{
  for(const ending of ['',JSON.stringify({type:'error',error:'回应超时'})+'\n']){
    const f=fixture();f.add('A');f.activate('A');const run=f.send('你好');
    f.requests[0].resolve(new Response(JSON.stringify({type:'text',delta:'半句'})+'\n'+ending,{headers:{'Content-Type':'application/x-ndjson'}}));
    await assert.rejects(run.promise);assert.equal(f.written.length,0);assert.equal(run.replies.length,0);
  }
});
function persistentFixture(backing=new Map()) {
  const window=new EventTarget(), requests=[];
  const localStorage={getItem:key=>backing.get(key)??null,setItem:(key,value)=>backing.set(key,value)};
  window.InfiniteSettings={getModelConnection:()=>({protocol:'openai',baseUrl:'https://test.invalid/v1',name:'test-model',apiKey:'test-only-do-not-persist'})};
  const context=vm.createContext({window,localStorage,crypto:webcrypto,CustomEvent,AbortController,setTimeout,clearTimeout,
    fetch:(_url,options)=>new Promise(resolve=>requests.push({payload:JSON.parse(options.body),options,resolve})),
  });
  vm.runInContext(storeSource,context);vm.runInContext(source,context);
  return {window,backing,requests,store:window.InfiniteSaves,
    send(text){let promise;const replies=[];window.dispatchEvent(new CustomEvent('infinite:systemmessage',{cancelable:true,
      detail:{text,respond:reply=>replies.push(reply),waitUntil:job=>{promise=job;}}}));return {promise,replies};},
    respond(index,reply){requests[index].resolve({ok:true,json:async()=>({reply,sessionId:String(index).repeat(32),provider:'dsh'})});},
  };
}
test('real save store restores each conversation after a fresh browser context',async()=>{
  const f=persistentFixture(),a=f.store.create({name:'甲档',deity:{id:'hongzhuang'}}),b=f.store.create({name:'乙档',deity:{id:'hongzhuang'}});
  f.store.activate(a.id);let run=f.send('甲的问题');f.respond(0,'甲的回复');assert.equal(await run.promise,true);
  f.store.activate(b.id);run=f.send('乙的问题');assert.deepEqual(f.requests[1].payload.history,[]);f.respond(1,'乙的回复');await run.promise;
  assert.equal(f.store.get(a.id).chat[1].content,'甲的回复');assert.equal(f.store.get(b.id).chat[1].content,'乙的回复');
  const reloaded=persistentFixture(f.backing);assert.equal(reloaded.store.active(),null);reloaded.store.activate(a.id);
  run=reloaded.send('甲继续');assert.equal(reloaded.requests[0].payload.sessionId,null);
  assert.deepEqual(reloaded.requests[0].payload.history,[{role:'user',content:'甲的问题'},{role:'assistant',content:'甲的回复'}]);
  reloaded.respond(0,'甲继续的回复');await run.promise;assert.equal(reloaded.store.get(b.id).chat.length,2);
  assert.ok(![...f.backing.values()].join('').includes('test-only-do-not-persist'));
  assert.ok(![...f.backing.values()].join('').includes('sessionId'));
});
test('real store activation cancels pending turns without corrupting either save',async()=>{
  const f=persistentFixture(),a=f.store.create({name:'甲档',deity:{id:'hongzhuang'}}),b=f.store.create({name:'乙档',deity:{id:'hongzhuang'}});
  f.store.activate(a.id);const old=f.send('旧请求');f.store.activate(b.id);const next=f.send('新请求');
  assert.ok(f.requests[0].options.signal.aborted);f.respond(0,'迟到回复');assert.equal(await old.promise,false);
  assert.equal(f.store.get(a.id).chat.length,0);assert.deepEqual(old.replies,[]);
  assert.equal(f.window.InfiniteSystemChat.getState().phase,'sending');
  f.respond(1,'正确回复');await next.promise;assert.equal(f.store.get(b.id).chat[1].content,'正确回复');
});
