const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const KEY='infinite.saves.v1';
const sources=['save-store.js','world-progress.js','covenant-progress.js'].map(file=>fs.readFileSync(path.join(__dirname,'../loading-page',file),'utf8'));
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(data=new Map()){
  const events=[],listeners=new Map();let failWrite=false;
  const window={
    addEventListener(name,fn){const handlers=listeners.get(name)||[];handlers.push(fn);listeners.set(name,handlers);},
    dispatchEvent(event){events.push(event);for(const fn of listeners.get(event.type)||[])fn(event);return true;}
  };
  const context={window,crypto,Date,Math,JSON,Set,Map,Error,
    CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},
    localStorage:{getItem:key=>data.get(key)??null,setItem(key,value){if(failWrite)throw Error('quota');data.set(key,value);}}
  };
  sources.forEach(source=>vm.runInNewContext(source,context));
  return {saves:window.InfiniteSaves,world:window.InfiniteWorldProgress,covenant:window.InfiniteCovenantProgress,data,events,window,failWrites(){failWrite=true;}};
}
function create(app,name='契约旅程'){
  const save=app.saves.create({name,deity:{id:'hongzhuang'}});app.saves.activate(save.id);return save;
}
function complete(app,count=1){for(let i=0;i<count;i++){const state=app.world.getState();app.world.complete(app.saves.worldStageIdAt(state.completedCount));}}

test('new journeys start with only the free origin and no points',()=>{
  const app=setup();assert.equal(app.covenant.getState().saveId,null);
  const save=create(app),state=app.covenant.getState();
  assert.equal(state.saveId,save.id);assert.equal(state.earned,0);assert.equal(state.balance,0);
  assert.deepEqual(plain(state.unlocked),['root']);
  assert.throws(()=>app.covenant.unlock('insight'),cause=>cause.userMessage==='契约点不足。');
});

test('world completions award three points and repeated completions cannot award again',()=>{
  const app=setup();create(app);complete(app);
  assert.equal(app.covenant.getState().earned,3);
  const bytes=app.data.get(KEY),eventCount=app.events.length;
  app.world.complete('mist-ferry');
  assert.equal(app.data.get(KEY),bytes);assert.equal(app.events.length,eventCount);
  assert.equal(app.covenant.getState().balance,3);
});

test('legacy world progress earns retroactive points without rewriting a save on read',()=>{
  const app=setup(),save=create(app);
  const doc=JSON.parse(app.data.get(KEY));
  doc.saves[0].progress={selected:'records',world:{completed:['mist-ferry','red-inn','paper-city']}};
  const bytes=JSON.stringify(doc);app.data.set(KEY,bytes);
  const state=app.covenant.getState();
  assert.equal(state.completedCount,3);assert.equal(state.earned,9);assert.equal(app.data.get(KEY),bytes);
  assert.equal(app.saves.get(save.id).progress.covenant,undefined);
  app.covenant.unlock('insight');
  assert.equal(app.saves.get(save.id).progress.selected,'records');
  assert.equal(app.saves.get(save.id).progress.world.completedCount,3);
});

test('task rewards use a persistent, idempotent ledger without affecting world completion',()=>{
  const app=setup(),save=create(app);
  assert.equal(app.covenant.awardTask('mist-ferry:main').balance,1);
  const bytes=app.data.get(KEY),eventCount=app.events.length;
  assert.equal(app.covenant.awardTask('mist-ferry:main').balance,1);
  assert.equal(app.data.get(KEY),bytes);assert.equal(app.events.length,eventCount);
  assert.equal(app.covenant.getState().completedCount,0);
  const reloaded=setup(app.data);reloaded.saves.activate(save.id);
  assert.equal(reloaded.covenant.awardTask('mist-ferry:main').earned,1);
  assert.equal(reloaded.covenant.awardTask('mist-ferry:side-1').earned,2);
  assert.throws(()=>app.covenant.awardTask(''),/任务编号/);
  assert.throws(()=>app.covenant.awardTask('quest\nsecret'),/任务编号/);
});

test('unlock checks prerequisites and balance, persists purchases, and is idempotent',()=>{
  const app=setup(),save=create(app);complete(app,2);
  const bytes=app.data.get(KEY);
  assert.throws(()=>app.covenant.unlock('listen'),/前置/);assert.equal(app.data.get(KEY),bytes);
  assert.equal(app.covenant.unlock('insight').balance,4);
  assert.equal(app.covenant.unlock('listen').balance,2);
  assert.throws(()=>app.covenant.unlock('discern'),/不足/);
  assert.equal(app.covenant.unlock('ward').balance,0);
  const after=app.data.get(KEY),eventCount=app.events.length;
  app.covenant.unlock('ward');app.covenant.unlock('root');
  assert.equal(app.data.get(KEY),after);assert.equal(app.events.length,eventCount);
  const reloaded=setup(app.data);reloaded.saves.activate(save.id);
  const state=reloaded.covenant.getState();
  assert.equal(state.spent,6);assert.equal(state.balance,0);
  assert.deepEqual(plain(state.unlocked),['root','insight','listen','ward']);
});

test('separate saves never share points or unlocks and active changes publish updated state',()=>{
  const app=setup(),first=create(app,'一');complete(app);app.covenant.unlock('insight');
  const second=create(app,'二');assert.equal(app.covenant.getState().balance,0);
  assert.deepEqual(plain(app.covenant.getState().unlocked),['root']);
  app.covenant.awardTask('same-task');assert.equal(app.covenant.getState().balance,1);
  app.saves.activate(first.id);assert.equal(app.covenant.getState().balance,1);
  assert.equal(app.covenant.awardTask('same-task').balance,2);
  app.saves.activate(second.id);
  const last=app.events.filter(event=>event.type==='infinite:covenantchange').at(-1);
  assert.equal(last.detail.saveId,second.id);assert.equal(last.detail.reason,'active');
  app.saves.clearActive();assert.equal(app.covenant.getState().saveId,null);
  assert.throws(()=>app.covenant.awardTask('no-save'),/存档/);
  assert.throws(()=>app.covenant.unlock('insight'),/存档/);
});

test('failed local storage writes preserve all original bytes, balances and events',()=>{
  const app=setup();create(app);complete(app);
  const bytes=app.data.get(KEY),before=plain(app.covenant.getState()),eventCount=app.events.length;
  app.failWrites();
  assert.throws(()=>app.covenant.unlock('insight'),cause=>!!cause.userMessage);
  assert.throws(()=>app.covenant.awardTask('failed-reward'),cause=>!!cause.userMessage);
  assert.equal(app.data.get(KEY),bytes);assert.deepEqual(plain(app.covenant.getState()),before);
  assert.equal(app.events.length,eventCount);
});

test('unrelated save edits and stale ledger patches preserve acquired progress',()=>{
  const app=setup(),save=create(app);complete(app,2);
  app.covenant.unlock('insight');app.covenant.awardTask('quest-1');
  app.saves.update(save.id,{name:'新名字',progress:{selected:'inventory',covenant:{unlocked:[],tasks:[]}}});
  app.saves.appendMessagePair(save.id,'你好','欢迎回来');
  assert.equal(app.covenant.getState().balance,5);
  assert.deepEqual(plain(app.covenant.getState().unlocked),['root','insight']);
  assert.deepEqual(plain(app.covenant.getState().tasks),['quest-1']);
  assert.equal(app.saves.get(save.id).chat.length,2);assert.equal(app.saves.get(save.id).name,'新名字');
});

test('a transaction validates the fresh document even if a previous tab spent points',()=>{
  const app=setup(),save=create(app);complete(app);
  const other=setup(app.data);other.saves.activate(save.id);other.covenant.unlock('ward');
  assert.throws(()=>app.covenant.unlock('insight'),/不足/);
  assert.equal(app.covenant.getState().balance,1);
  assert.deepEqual(plain(app.covenant.getState().unlocked),['root','ward']);
  app.covenant.awardTask('a');other.covenant.awardTask('b');
  assert.deepEqual(plain(app.covenant.getState().tasks),['a','b']);
});

test('catalog and effect metadata are immutable; returned state is detached',()=>{
  const app=setup();create(app);complete(app);app.covenant.awardTask('quest-1');
  const {catalog}=app.covenant;
  assert.equal(catalog.length,13);assert.ok(Object.isFrozen(catalog));
  for(const node of catalog){assert.ok(Object.isFrozen(node));assert.ok(Object.isFrozen(node.effect));}
  const state=app.covenant.getState();state.tasks.push('fake');state.unlocked.push('night');
  assert.equal(app.covenant.getState().earned,4);
  assert.deepEqual(plain(app.covenant.getState().unlocked),['root']);
});

test('malformed import cannot activate orphan abilities or negative balances',()=>{
  const app=setup();create(app);
  const doc=JSON.parse(app.data.get(KEY));
  doc.saves[0].progress.covenant={unlocked:['night','night','unknown','insight'],tasks:['a','a',null,'bad\nid'],balance:999,apiKey:'not-game-data'};
  app.data.set(KEY,JSON.stringify(doc));
  const state=app.covenant.getState();
  assert.equal(state.earned,1);assert.equal(state.spent,0);assert.deepEqual(plain(state.unlocked),['root']);
  app.covenant.awardTask('b');
  assert.equal(app.data.get(KEY).includes('not-game-data'),false);
  assert.equal(app.covenant.getState().balance,0);
});

test('very large chapter progress remains a finite safe integer',()=>{
  const app=setup(),save=create(app);
  app.saves.update(save.id,{progress:{world:{completedCount:Number.MAX_SAFE_INTEGER-18}}});
  const state=app.covenant.getState();
  assert.equal(state.earned,Number.MAX_SAFE_INTEGER);assert.ok(Number.isSafeInteger(state.balance));
  assert.equal(app.covenant.unlock('insight').balance,Number.MAX_SAFE_INTEGER-2);
});

test('previewing a world does not award points and storage events reflect deletion',()=>{
  const app=setup(),save=create(app);app.world.select('red-inn');
  assert.equal(app.covenant.getState().earned,0);
  app.data.set(KEY,JSON.stringify({version:1,saves:[]}));app.window.dispatchEvent({type:'storage',key:KEY});
  assert.equal(app.covenant.getState().saveId,null);assert.equal(app.covenant.getState().earned,0);
  assert.equal(app.saves.get(save.id),null);
});
