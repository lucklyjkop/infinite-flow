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
  assert.deepEqual(plain(x.saves.active().progress),{selected:'records',world:{completedCount:0,selected:ids[0]}});
  assert.equal(x.data.get(KEY),original);assert.equal(x.world.getState().completedCount,0);
});
test('new slots start at one available stage with no invented clears',()=>{
  const x=setup();create(x);const state=x.world.getState();
  assert.equal(state.selectedId,ids[0]);assert.equal(state.nextId,ids[0]);assert.equal(state.completedCount,0);
  assert.deepEqual(plain(x.world.getChapter(0).stages.map(item=>item.status)),['available','locked','locked','locked','locked','locked']);
});
test('selecting a locked landmark only changes selection',()=>{
  const x=setup(),save=create(x);x.world.select(ids[4]);const state=x.world.getState();
  assert.equal(state.selectedId,ids[4]);assert.equal(state.completedCount,0);assert.equal(x.world.getChapter(0).stages[4].status,'locked');
  assert.equal(x.saves.get(save.id).progress.world.completedCount,0);
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
  assert.equal(state.completedCount,1);assert.equal(state.selectedId,ids[1]);assert.equal(x.world.getChapter(0).stages[2].status,'locked');
  x.saves.update(save.id,{progress:{selected:'world'}});assert.equal(x.data.get(KEY).includes('NEVER-PERSIST'),false);
});
test('world copies cannot mutate save state or stage definitions',()=>{
  const x=setup();create(x);x.world.complete(ids[0]);const state=x.world.getState(),chapter=x.world.getChapter(0);
  state.completedCount=2;chapter.stages[0].status='locked';chapter.stages[0].name='changed';
  assert.equal(x.world.getState().completedCount,1);assert.equal(x.world.getChapter(0).stages[0].name,'雾渡');assert.equal(x.world.stages[0].name,'雾渡');
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
test('finishing all six stages unlocks exactly the next chapter and selects its first stage',()=>{
  const x=setup();create(x);for(const id of ids)x.world.complete(id);const state=x.world.getState();
  assert.equal(state.completedCount,6);assert.equal(state.nextId,'chapter-2-stage-1');assert.equal(state.selectedId,state.nextId);assert.equal(state.activeChapterIndex,1);assert.equal(state.selectedChapterIndex,1);assert.equal(state.maxPreviewChapterIndex,2);
  assert.ok(x.world.getChapter(0).completed);assert.equal(x.world.getChapter(0).litCount,6);assert.ok(x.world.getChapter(0).stages.every(stage=>stage.status==='completed'));
  assert.equal(x.world.getChapter(1).stages[0].status,'available');assert.equal(x.world.getChapter(1).litCount,1);assert.equal(x.world.getChapter(1).completedCount,0);assert.equal(x.world.getChapter(2).unlocked,false);
});

test('fresh chapter lights only the available first stage without marking it complete',()=>{
  const x=setup();create(x);const first=x.world.getChapter(0),preview=x.world.getChapter(1);
  assert.equal(first.completedCount,0);assert.equal(first.completed,false);assert.equal(first.unlocked,true);assert.equal(first.litCount,1);
  assert.deepEqual(plain(first.stages.map(stage=>stage.lighted)),[true,false,false,false,false,false]);
  assert.equal(preview.unlocked,false);assert.equal(preview.litCount,0);assert.ok(preview.stages.every(stage=>stage.status==='locked'));
  x.world.select(preview.stages[5].id);assert.equal(x.world.getState().completedCount,0);assert.equal(x.world.getState().activeChapterIndex,0);assert.equal(x.world.getChapter(1).litCount,0);
});
test('five clears leave the second chapter locked, previewable and impossible to complete',()=>{
  const x=setup();create(x);for(const id of ids.slice(0,5))x.world.complete(id);
  assert.equal(x.world.getState().activeChapterIndex,0);assert.equal(x.world.getChapter(0).litCount,6);assert.equal(x.world.getChapter(0).completed,false);assert.equal(x.world.getChapter(1).unlocked,false);
  x.world.select('chapter-2-stage-1');const before=x.data.get(KEY);
  assert.throws(()=>x.world.complete('chapter-2-stage-1'),/前一关/);assert.equal(x.data.get(KEY),before);
  x.world.complete(ids[5]);assert.equal(x.world.getChapter(1).unlocked,true);assert.equal(x.world.getChapter(1).stages[0].status,'available');
});
test('reading or selecting beyond the next preview is rejected without side effects',()=>{
  const x=setup();create(x);const before=x.data.get(KEY);
  for(const id of ['chapter-3-stage-1','chapter-200-stage-1','chapter-1-stage-1','chapter-02-stage-1','chapter-2-stage-7','chapter-2-stage-0','chapter-2-stage-1x'])assert.throws(()=>x.world.select(id),/不可用/);
  for(const index of [-1,2,999999,1.5,NaN,Infinity,'1'])assert.throws(()=>x.world.getChapter(index),/不可用/);
  assert.equal(x.data.get(KEY),before);assert.equal(x.world.getState().selectedId,ids[0]);
});
test('three chapter themes have six stable stage IDs and alternate without preallocation',()=>{
  const x=setup(),save=create(x);x.saves.update(save.id,{progress:{world:{completedCount:12}}});
  const first=x.world.getChapter(0),second=x.world.getChapter(1),third=x.world.getChapter(2),fourth=x.world.getChapter(3);
  assert.equal(first.name,'山海初醒');assert.deepEqual(plain(first.stages.map(s=>s.id)),ids);
  assert.equal(second.name,'竹海灯影');assert.equal(second.atlas,'assets/world-map/landmarks-bamboo.png');assert.equal(second.theme,'bamboo');
  assert.deepEqual(plain(second.stages.map(s=>s.name)),['竹影长桥','灯火水镇','红叶书院','飞瀑栈道','云中禅寺','古树祭坛']);
  assert.equal(third.name,'雪域天门');assert.equal(third.atlas,'assets/world-map/landmarks-snow.png');assert.equal(third.theme,'snow');
  assert.deepEqual(plain(third.stages.map(s=>s.name)),['雪驿','冰湖龙骨','雪岭石寨','风雪钟楼','悬崖索桥','天门云宫']);
  assert.equal(fourth.templateId,first.templateId);assert.notEqual(fourth.name,first.name);assert.equal(fourth.stages[0].id,'chapter-4-stage-1');
  assert.equal(second.stages[5].globalIndex,11);assert.equal(second.stages[5].index,5);assert.equal(second.stages[5].chapterIndex,1);
  assert.ok([first,second,third,fourth].every(chapter=>chapter.stages.length===6&&chapter.stages.every(stage=>stage.kind&&stage.description)));
});
test('sequential gameplay can cross multiple chapter boundaries and rejects skipped stages',()=>{
  const x=setup();create(x);
  for(let i=0;i<19;i++){const next=x.world.getState().nextId;x.world.complete(next);assert.equal(x.world.getState().completedCount,i+1);}
  assert.equal(x.world.getState().activeChapterIndex,3);assert.equal(x.world.getState().nextId,'chapter-4-stage-2');assert.equal(x.world.getChapter(3).litCount,2);
  assert.throws(()=>x.world.complete('chapter-4-stage-3'),/前一关/);assert.throws(()=>x.world.complete('chapter-5-stage-1'),/前一关/);
  const before=x.data.get(KEY);x.world.complete('chapter-2-stage-4');assert.equal(x.data.get(KEY),before);
});
test('legacy six-stage completion migrates into a compact unlocked second chapter',()=>{
  const x=setup(),save=create(x),raw=JSON.parse(x.data.get(KEY));raw.saves[0].progress.world={completed:ids,selected:ids[5]};const bytes=JSON.stringify(raw);x.data.set(KEY,bytes);
  assert.equal(x.world.getState().completedCount,6);assert.equal(x.world.getState().selectedId,ids[5]);assert.equal(x.world.getState().nextId,'chapter-2-stage-1');assert.equal(x.data.get(KEY),bytes);
  x.world.select('chapter-2-stage-1');const stored=JSON.parse(x.data.get(KEY)).saves[0].progress.world;
  assert.deepEqual(stored,{completedCount:6,selected:'chapter-2-stage-1'});assert.equal(Object.hasOwn(stored,'completed'),false);
});
test('old array and stale compact patches cannot roll back newer chapters',()=>{
  const x=setup(),save=create(x);x.saves.update(save.id,{progress:{world:{completedCount:14,selected:'chapter-3-stage-3'}}});
  x.saves.update(save.id,{progress:{world:{completed:ids.slice(0,2),selected:ids[1]}}});assert.equal(x.world.getState().completedCount,14);
  x.saves.update(save.id,{progress:{world:{completedCount:2,selected:'chapter-3-stage-3'}}});assert.equal(x.world.getState().completedCount,14);assert.equal(x.world.getState().selectedId,'chapter-3-stage-3');
  x.saves.update(save.id,{progress:{selected:'records'}});x.saves.appendMessagePair(save.id,'还记得吗','记得');assert.equal(x.world.getState().completedCount,14);
  assert.equal(JSON.parse(x.data.get(KEY)).saves[0].progress.world.completed,undefined);
});
test('large chapter indices use bounded state and six stage descriptors, not arrays of history',()=>{
  const x=setup(),save=create(x),count=6000003;x.saves.update(save.id,{progress:{world:{completedCount:count,selected:'chapter-1000001-stage-4'}}});
  const state=x.world.getState(),chapter=x.world.getChapter(state.activeChapterIndex),preview=x.world.getChapter(state.maxPreviewChapterIndex);
  assert.equal(state.activeChapterIndex,1000000);assert.equal(state.nextId,'chapter-1000001-stage-4');assert.equal(chapter.stages.length,6);assert.equal(chapter.completedCount,3);assert.equal(preview.stages.length,6);
  assert.ok(!Object.values(state).some(Array.isArray));assert.ok(JSON.stringify(state).length<350);assert.ok(JSON.stringify(x.saves.active().progress.world).length<100);
  x.world.complete(state.nextId);assert.equal(x.world.getState().completedCount,count+1);
});
test('invalid compact counts and future selections cannot unlock imported chapters',()=>{
  for(const count of [-1,1.5,'12',null,Number.MAX_SAFE_INTEGER,1e30]){
    const x=setup();create(x);const raw=JSON.parse(x.data.get(KEY));raw.saves[0].progress.world={completedCount:count,selected:'chapter-999-stage-1'};x.data.set(KEY,JSON.stringify(raw));
    assert.equal(x.world.getState().completedCount,0);assert.equal(x.world.getState().selectedId,ids[0]);
  }
});
test('advanced journeys remain isolated from new slots and persist after reload',()=>{
  const x=setup(),one=create(x,'长途');x.saves.update(one.id,{progress:{world:{completedCount:18,selected:'chapter-4-stage-4'}}});const two=create(x,'初见');
  assert.equal(x.world.getState().activeChapterIndex,0);assert.throws(()=>x.world.select('chapter-4-stage-4'),/不可用/);
  const y=setup(x.data);y.saves.activate(one.id);assert.equal(y.world.getState().completedCount,18);assert.equal(y.world.getState().selectedId,'chapter-4-stage-4');y.saves.activate(two.id);assert.equal(y.world.getState().completedCount,0);
});
test('developer templates extend chapter metadata without changing stage identity or progress',()=>{
  const x=setup(),save=create(x);x.saves.update(save.id,{progress:{world:{completedCount:18}}});const before=x.world.getChapter(3).stages.map(stage=>stage.id);
  const definition={id:'desert',name:'沙海孤灯',atlas:'assets/world-map/landmarks-desert.png',theme:'desert',stages:Array.from({length:6},(_,i)=>({name:'沙海'+i,kind:'探索',description:'沙丘间的旧路。'}))};
  const registered=x.world.registerTemplate(definition);definition.stages[0].name='mutated';
  const chapter=x.world.getChapter(3);assert.equal(chapter.name,'沙海孤灯');assert.equal(chapter.stages[0].name,'沙海0');assert.deepEqual(plain(chapter.stages.map(stage=>stage.id)),plain(before));assert.equal(x.world.getState().completedCount,18);
  assert.ok(Object.isFrozen(registered));assert.ok(Object.isFrozen(registered.stages));assert.throws(()=>x.world.registerTemplate(definition),/模板/);
  assert.throws(()=>x.world.registerTemplate({...definition,id:'bad',atlas:'https://invalid/atlas.png'}),/模板/);
});

test('world details have stable difficulty, traits and objectives without writing progress',()=>{
  const x=setup(),save=create(x);x.saves.update(save.id,{progress:{world:{completedCount:12}}});
  const before=x.data.get(KEY);
  for(let chapterIndex=0;chapterIndex<4;chapterIndex++){
    const chapter=x.world.getChapter(chapterIndex);
    for(const stage of chapter.stages){
      assert.ok(Number.isInteger(stage.difficulty.level)&&stage.difficulty.level>=1&&stage.difficulty.level<=5);
      assert.ok(stage.difficulty.label);assert.equal(stage.traits.length,3);assert.equal(new Set(stage.traits).size,3);
      assert.ok(stage.traits.every(trait=>typeof trait==='string'&&trait.trim()));assert.ok(stage.objective);
    }
  }
  assert.deepEqual(plain(x.world.getChapter(3).stages.map(({difficulty,traits,objective})=>({difficulty,traits,objective}))),plain(x.world.getChapter(0).stages.map(({difficulty,traits,objective})=>({difficulty,traits,objective}))));
  assert.equal(x.data.get(KEY),before);assert.equal(x.world.getState().completedCount,12);
});

test('detail metadata is detached from template inputs and cannot mutate later views',()=>{
  const x=setup(),save=create(x);x.saves.update(save.id,{progress:{world:{completedCount:18}}});
  const definition={id:'deep-copy',name:'新卷',atlas:'assets/world-map/landmarks-custom.png',theme:'mist',stages:Array.from({length:6},()=>({name:'新境',difficulty:{level:4,label:'艰险'},traits:['迷雾','古道','幻影'],objective:'寻找出口。'}))};
  const registered=x.world.registerTemplate(definition);
  definition.stages[0].difficulty.level=1;definition.stages[0].traits[0]='changed';
  const stage=x.world.getChapter(3).stages[0];stage.difficulty.level=2;stage.traits[0]='replaced';
  assert.equal(x.world.getChapter(3).stages[0].difficulty.level,4);assert.equal(x.world.getChapter(3).stages[0].traits[0],'迷雾');
  assert.ok(Object.isFrozen(registered.stages[0].difficulty));assert.ok(Object.isFrozen(registered.stages[0].traits));
});

test('invalid detail metadata cannot partially register a template or change the journey',()=>{
  const x=setup(),save=create(x);x.saves.update(save.id,{progress:{world:{completedCount:18}}});const before=x.data.get(KEY);
  const base={id:'invalid-details',name:'新卷',atlas:'assets/world-map/landmarks-custom.png',theme:'mist'};
  for(const patch of [{difficulty:{level:0}},{difficulty:{level:6}},{difficulty:{level:1.5}},{traits:['缺失']},{traits:['','','']}]){
    assert.throws(()=>x.world.registerTemplate({...base,stages:Array.from({length:6},()=>({name:'新境',...patch}))}),/难度|特性/);
    assert.equal(x.world.getChapter(3).templateId,'mountains');assert.equal(x.data.get(KEY),before);
  }
  const registered=x.world.registerTemplate({...base,stages:Array.from({length:6},()=>({name:'新境'}))});
  assert.ok(registered.stages.every(stage=>stage.difficulty.label&&stage.traits.length===3&&stage.objective));
});
