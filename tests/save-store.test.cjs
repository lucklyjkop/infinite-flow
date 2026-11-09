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
