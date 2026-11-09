const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const sources=['save-store.js','world-progress.js'].map(name=>fs.readFileSync(path.join(__dirname,'../loading-page',name),'utf8'));
const KEY='infinite.saves.v1',ids=['mist-ferry','red-inn','paper-city','snow-pass','mirror-lake','return-peak'];
const deity={id:'hongzhuang',name:'红妆'};
const plain=value=>JSON.parse(JSON.stringify(value));
function setup(data=new Map()){
  const events=[],listeners=new Map();let failWrite=false;
  const window={addEventListener(name,fn){const handlers=listeners.get(name)||[];handlers.push(fn);listeners.set(name,handlers);},dispatchEvent(event){events.push(event);for(const listener of listeners.get(event.type)||[])listener(event);return true;}};
  const context={window,crypto,Date,Math,JSON,Set,Error,CustomEvent:class{constructor(type,options={}){this.type=type;this.detail=options.detail;}},localStorage:{getItem:key=>data.get(key)??null,setItem(key,value){if(failWrite)throw Error('quota');data.set(key,value);}}};
  for(const source of sources)vm.runInNewContext(source,context);
  return {saves:window.InfiniteSaves,world:window.InfiniteWorldProgress,data,events,window,failWrites(){failWrite=true;}};
}
function create(x,name='旅程'){const save=x.saves.create({name,deity});x.saves.activate(save.id);return save;}
test('legacy slots gain an unexplored map on read without modifying stored bytes',()=>{
  const legacy={version:1,saves:[{id:'legacy',name:'旧档',deity,createdAt:1,updatedAt:1,chat:[],progress:{selected:'records'}}]};
  const original=JSON.stringify(legacy),x=setup(new Map([[KEY,original]]));x.saves.activate('legacy');
  assert.deepEqual(plain(x.saves.active().progress),{selected:'records',world:{completed:[],selected:ids[0]}});
  assert.equal(x.data.get(KEY),original);assert.equal(x.world.getState().completedCount,0);
});
test('new slots start at one available stage with no invented clears',()=>{
  const x=setup();create(x);const state=x.world.getState();
  assert.equal(state.selectedId,ids[0]);assert.equal(state.nextId,ids[0]);assert.equal(state.completedCount,0);
  assert.deepEqual(plain(state.stages.map(item=>item.status)),['available','locked','locked','locked','locked','locked']);
});
test('selecting a locked landmark only changes selection',()=>{
  const x=setup(),save=create(x);x.world.select(ids[4]);const state=x.world.getState();
  assert.equal(state.selectedId,ids[4]);assert.equal(state.completedCount,0);assert.equal(state.stages[4].status,'locked');
  assert.deepEqual(plain(x.saves.get(save.id).progress.world.completed),[]);
  assert.equal(x.events.at(-1).type,'infinite:worldprogress');assert.equal(x.events.at(-1).detail.reason,'selection');
});
test('completion advances sequentially and repeated completion writes nothing',()=>{
  const x=setup();create(x);x.world.complete(ids[0]);
  assert.equal(x.world.getState().completedCount,1);assert.equal(x.world.getState().nextId,ids[1]);assert.equal(x.world.getState().selectedId,ids[1]);
  assert.equal(x.events.at(-1).detail.reason,'completion');const before=x.data.get(KEY),count=x.events.length;
  x.world.complete(ids[0]);assert.equal(x.data.get(KEY),before);assert.equal(x.events.length,count);
  x.world.complete(ids[1]);assert.equal(x.world.getState().completedCount,2);
});
test('a skipped, unknown or preview-only completion never changes progress',()=>{
  const x=setup();assert.throws(()=>x.world.complete(ids[0]),/存档/);assert.equal(x.data.size,0);
  create(x);const before=x.data.get(KEY);
  assert.throws(()=>x.world.complete(ids[2]),/前一关/);assert.throws(()=>x.world.complete('unknown'),/不可用/);
  assert.equal(x.data.get(KEY),before);assert.equal(x.world.getState().completedCount,0);
});
test('named journeys keep independent selections and clears across reloads',()=>{
  const x=setup(),one=create(x,'甲');x.world.complete(ids[0]);x.world.select(ids[3]);const two=create(x,'乙');
  assert.equal(x.world.getState().completedCount,0);assert.equal(x.world.getState().selectedId,ids[0]);
  x.world.select(ids[5]);x.saves.activate(one.id);assert.equal(x.world.getState().completedCount,1);assert.equal(x.world.getState().selectedId,ids[3]);
  const reloaded=setup(x.data);assert.equal(reloaded.world.getState().saveId,null);assert.equal(reloaded.world.getState().completedCount,0);
  reloaded.saves.activate(two.id);assert.equal(reloaded.world.getState().selectedId,ids[5]);assert.equal(reloaded.world.getState().completedCount,0);
  reloaded.saves.activate(one.id);assert.equal(reloaded.world.getState().completedCount,1);
});
test('navigation and chat writes preserve terrain progress including stale patches',()=>{
  const a=setup(),save=create(a),stale=a.saves.get(save.id).progress,b=setup(a.data);b.saves.activate(save.id);b.world.complete(ids[0]);b.world.complete(ids[1]);
  a.saves.update(save.id,{progress:{...stale,selected:'inventory'}});a.saves.appendMessagePair(save.id,'问','答');
  assert.equal(a.world.getState().completedCount,2);assert.equal(a.saves.get(save.id).progress.selected,'inventory');
  a.saves.update(save.id,{progress:{selected:'covenant'}});assert.equal(a.world.getState().completedCount,2);
});
test('malformed imported progress cannot reveal regions beyond a missing stage',()=>{
  const x=setup(),save=create(x),document=JSON.parse(x.data.get(KEY));
  document.saves[0].progress.world={completed:[ids[0],ids[2],ids[5],'unknown'],selected:'<script>',apiKey:'NEVER-PERSIST'};
  x.data.set(KEY,JSON.stringify(document));const state=x.world.getState();
  assert.equal(state.completedCount,1);assert.equal(state.selectedId,ids[1]);assert.equal(state.stages[2].status,'locked');
  x.saves.update(save.id,{progress:{selected:'world'}});assert.equal(x.data.get(KEY).includes('NEVER-PERSIST'),false);
});
test('world copies cannot mutate save state or stage definitions',()=>{
  const x=setup();create(x);x.world.complete(ids[0]);const state=x.world.getState();
  state.completedIds.push(ids[1]);state.stages[0].status='locked';state.stages[0].name='changed';
  assert.equal(x.world.getState().completedCount,1);assert.equal(x.world.getState().stages[0].name,'雾渡');assert.equal(x.world.stages[0].name,'雾渡');
});
test('persistence failure leaves the old world intact and emits no successful event',()=>{
  const x=setup();create(x);const before=x.data.get(KEY),count=x.events.length;x.failWrites();
  assert.throws(()=>x.world.complete(ids[0]),/保存/);assert.equal(x.data.get(KEY),before);assert.equal(x.events.length,count);assert.equal(x.world.getState().completedCount,0);
  assert.throws(()=>x.world.select(ids[2]),/保存/);assert.equal(x.world.getState().selectedId,ids[0]);
});
test('external save deletion clears active map state without borrowing preview progress',()=>{
  const x=setup();create(x);x.world.complete(ids[0]);x.data.delete(KEY);x.window.dispatchEvent({type:'storage',key:KEY});
  assert.equal(x.world.getState().saveId,null);assert.equal(x.world.getState().completedCount,0);assert.equal(x.world.getState().selectedId,ids[0]);
  x.world.select(ids[3]);assert.equal(x.world.getState().selectedId,ids[3]);assert.equal(x.data.size,0);
});
test('finishing the final stage produces a fully colored map with no phantom next stage',()=>{
  const x=setup();create(x);for(const id of ids)x.world.complete(id);const state=x.world.getState();
  assert.equal(state.completedCount,6);assert.equal(state.nextId,null);assert.equal(state.selectedId,ids[5]);assert.ok(state.stages.every(stage=>stage.status==='completed'));
});
