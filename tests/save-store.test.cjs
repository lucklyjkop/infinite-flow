const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto');
const source=fs.readFileSync(require('node:path').join(__dirname,'../loading-page/save-store.js'),'utf8');
function setup(data=new Map()){
  const events=[],handlers={};let failWrite=false;
  const context={crypto,Date,Math,JSON,Set,Error,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}},localStorage:{getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>{if(failWrite)throw Error('quota');data.set(k,v);}}};
  context.window={dispatchEvent:e=>events.push(e),addEventListener:(name,fn)=>handlers[name]=fn};
  vm.runInNewContext(source,context);
  return {api:context.window.InfiniteSaves,data,events,handlers,failWrite(){failWrite=true;}};
}
const deity={id:'hongzhuang',name:'红妆'};

test('personal profiles are isolated, bounded and restored without arbitrary fields',()=>{
  const x=setup(),a=x.api.create({name:'甲',deity}),b=x.api.create({name:'乙',deity});
  x.api.update(a.id,{profile:{displayName:' 春晓 ',title:'旅人',bio:'句\n子',apiKey:'DO-NOT-SAVE',portrait:'javascript:bad()'}});
  const reloaded=setup(x.data);assert.equal(reloaded.api.get(a.id).profile.displayName,'春晓');assert.equal(reloaded.api.get(a.id).profile.bio,'句 子');assert.equal(reloaded.api.get(b.id).profile,undefined);
  assert.ok(!x.data.get('infinite.saves.v1').includes('DO-NOT-SAVE'));assert.ok(!x.data.get('infinite.saves.v1').includes('javascript'));
  x.api.update(a.id,{profile:{bio:'🌸'.repeat(200)}});assert.equal(Array.from(x.api.get(a.id).profile.bio).length,180);assert.equal(x.api.get(a.id).profile.title,'旅人');
});
test('deletion emits a portrait-cleanup event only after persistence succeeds',()=>{
  const x=setup(),a=x.api.create({name:'甲',deity});x.api.remove(a.id);assert.ok(x.events.some(e=>e.type==='infinite:savedeleted'&&e.detail.id===a.id));
  const y=setup(),b=y.api.create({name:'乙',deity});y.failWrite();assert.throws(()=>y.api.remove(b.id));assert.ok(!y.events.some(e=>e.type==='infinite:savedeleted'));
});
test('same named journeys remain distinct and survive a browser reload',()=>{
  const a=setup(),one=a.api.create({name:'红线',deity}),two=a.api.create({name:'红线',deity});
  assert.notEqual(one.id,two.id);a.api.activate(one.id);a.api.appendMessagePair(one.id,'记住甲','甲的回答');a.api.update(two.id,{progress:{selected:'inventory'}});
  const b=setup(a.data);assert.equal(b.api.active(),null);assert.equal(b.api.list().length,2);b.api.activate(one.id);
  assert.equal(b.api.active().chat[1].content,'甲的回答');assert.equal(b.api.get(two.id).chat.length,0);assert.equal(b.api.get(two.id).progress.selected,'inventory');
});
test('returned values are detached and persistent schema excludes credentials',()=>{
  const x=setup(),save=x.api.create({name:'  新旅程  ',deity,apiKey:'DO-NOT-SAVE'});save.name='修改副本';x.api.activate(save.id);
  x.api.update(save.id,{apiKey:'DO-NOT-SAVE',baseUrl:'PRIVATE-ENDPOINT',chat:[{role:'system',content:'INJECT'}],progress:{selected:'records'}});
  const raw=[...x.data.values()][0];assert.equal(x.api.get(save.id).name,'新旅程');assert.equal(raw.includes('DO-NOT-SAVE'),false);assert.equal(raw.includes('PRIVATE-ENDPOINT'),false);assert.equal(raw.includes('INJECT'),false);
});
test('name validation counts Unicode characters and preserves existing data',()=>{
  const x=setup();x.api.create({name:'😀'.repeat(24),deity});const original=[...x.data.values()][0];
  for(const name of ['', '  ', '😀'.repeat(25), '换\n行'])assert.throws(()=>x.api.create({name,deity}));
  assert.equal([...x.data.values()][0],original);
});
test('corrupt data is never overwritten by a new journey',()=>{
  const x=setup(new Map([['infinite.saves.v1','{broken']]));assert.throws(()=>x.api.list());assert.throws(()=>x.api.create({name:'新旅程',deity}));assert.equal(x.data.get('infinite.saves.v1'),'{broken');
});
test('failed persistence leaves original save intact and emits no success event',()=>{
  const x=setup(),save=x.api.create({name:'原存档',deity});x.api.activate(save.id);const original=[...x.data.values()][0],count=x.events.length;x.failWrite();
  assert.throws(()=>x.api.appendMessagePair(save.id,'问题','回答'));assert.equal([...x.data.values()][0],original);assert.equal(x.events.length,count);assert.equal(x.api.active().id,save.id);
});
test('concurrent browser tabs merge updates from fresh storage reads',()=>{
  const a=setup(),one=a.api.create({name:'甲',deity}),b=setup(a.data),two=b.api.create({name:'乙',deity});a.api.appendMessagePair(one.id,'甲问','甲答');b.api.appendMessagePair(two.id,'乙问','乙答');
  assert.equal(a.api.get(one.id).chat[0].content,'甲问');assert.equal(a.api.get(two.id).chat[0].content,'乙问');
});
test('history retention preserves complete user/assistant pairs',()=>{
  const x=setup(),save=x.api.create({name:'长旅程',deity});for(let i=0;i<103;i++)x.api.appendMessagePair(save.id,'问题'+i,'回答'+i);
  const chat=x.api.get(save.id).chat;assert.equal(chat.length,200);assert.equal(chat[0].content,'问题3');assert.equal(chat.at(-1).content,'回答102');
  assert.ok(chat.every((m,i)=>m.role===(i%2?'assistant':'user')));
});
test('long chat truncation preserves complete Unicode characters',()=>{
  const x=setup(),save=x.api.create({name:'长对话',deity});
  x.api.appendMessagePair(save.id,'😀'.repeat(4001),'🌸'.repeat(12001));
  const chat=x.api.get(save.id).chat;
  assert.equal(chat[0].content,'😀'.repeat(4000));
  assert.equal(chat[1].content,'🌸'.repeat(12000));
});
test('deleting one named save preserves all fields of every other save',()=>{
  const x=setup(),one=x.api.create({name:'同名',deity}),two=x.api.create({name:'同名',deity});
  x.api.appendMessagePair(two.id,'留下问题','留下回答');x.api.update(two.id,{progress:{selected:'records'}});x.api.activate(two.id);
  const kept=JSON.stringify(x.api.get(two.id));
  assert.equal(x.api.remove(one.id),true);assert.equal(x.api.get(one.id),null);
  assert.equal(JSON.stringify(x.api.get(two.id)),kept);assert.equal(x.api.active().id,two.id);
  assert.equal(setup(x.data).api.list().length,1);
});
test('deleting the current save clears active state before list-change notification',()=>{
  const x=setup(),save=x.api.create({name:'当前旅程',deity});x.api.activate(save.id);const start=x.events.length;
  assert.equal(x.api.remove(save.id),true);assert.equal(x.api.active(),null);assert.equal(x.api.list().length,0);
  const changes=x.events.slice(start);
  assert.deepEqual(changes.map(event=>event.type),['infinite:saveactive','infinite:saveschange','infinite:savedeleted']);
  assert.equal(changes[0].detail.id,null);assert.equal(changes[1].detail.id,null);assert.equal(changes[1].detail.count,0);
  assert.equal(setup(x.data).api.list().length,0);
});
test('failed deletion preserves storage, active journey and success notifications',()=>{
  const x=setup(),save=x.api.create({name:'不可丢失',deity});x.api.activate(save.id);
  const original=x.data.get('infinite.saves.v1'),events=x.events.length;x.failWrite();
  assert.throws(()=>x.api.remove(save.id),error=>error.userMessage==='未能删除存档，请重试。');
  assert.equal(x.data.get('infinite.saves.v1'),original);assert.equal(x.api.active().id,save.id);assert.equal(x.events.length,events);
});
test('confirmation-time deletion preserves newer saves and updates from another tab',()=>{
  const a=setup(),one=a.api.create({name:'待删除',deity}),b=setup(a.data),two=b.api.create({name:'另一份',deity});
  b.api.appendMessagePair(two.id,'新问题','新回复');
  assert.equal(a.api.remove(one.id),true);assert.equal(b.api.get(one.id),null);assert.equal(b.api.get(two.id).chat[1].content,'新回复');
  assert.throws(()=>b.api.update(one.id,{name:'迟到的更新'}));assert.equal(a.api.get(one.id),null);
});
test('already deleted saves are idempotent and clear a stale active selection without writing',()=>{
  const a=setup(),save=a.api.create({name:'跨页删除',deity}),b=setup(a.data);a.api.activate(save.id);
  b.api.remove(save.id);a.failWrite();const original=a.data.get('infinite.saves.v1');
  assert.equal(a.api.remove(save.id),false);assert.equal(a.api.active(),null);assert.equal(a.data.get('infinite.saves.v1'),original);
  const count=a.events.length;assert.equal(a.api.remove(save.id),false);assert.equal(a.events.length,count);
});
test('storage event clears the active save deleted by another tab',()=>{
  const a=setup(),save=a.api.create({name:'跨页旅程',deity}),b=setup(a.data);a.api.activate(save.id);b.api.remove(save.id);
  a.handlers.storage({key:'infinite.saves.v1'});
  assert.equal(a.api.active(),null);assert.equal(a.events.at(-1).type,'infinite:saveschange');assert.equal(a.events.at(-1).detail.external,true);
});
test('deletion never overwrites corrupted or incompatible storage',()=>{
  for(const raw of ['{broken',JSON.stringify({version:99,saves:[]})]){
    const x=setup(new Map([['infinite.saves.v1',raw]]));
    assert.throws(()=>x.api.remove('save_missing'));assert.equal(x.data.get('infinite.saves.v1'),raw);assert.equal(x.events.length,0);
  }
});
