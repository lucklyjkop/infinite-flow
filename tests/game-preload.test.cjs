const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync('loading-page/game-preload.js','utf8');
function harness({failedImage=null, audioReady=true, characterReady=true, characterRetryable=false, saveReady=true, deityReady=true, brokenDOM=false}={}) {
  const calls=[], requests=[], attempts=new Map();
  let releaseMap;
  const mapGate=new Promise(resolve=>{releaseMap=resolve;});
  const win={};
  class Image {
    set src(url){this.url=url;requests.push(url);attempts.set(url,(attempts.get(url)||0)+1);queueMicrotask(()=>{
      if(failedImage && url.includes(failedImage) && attempts.get(url)===1)this.onerror?.();
      else {this.naturalWidth=100;this.onload?.();}
    });}
    decode(){return Promise.resolve();}
  }
  const api=(name,result)=>()=>{calls.push(name);return Promise.resolve(result);};
  win.InfiniteWorldMap={preload:api('map-images',{}),prepare:()=>{calls.push('map-preparation');return mapGate;}};
  win.InfiniteSaveUI={preload:api('save-images',[saveReady])};
  win.InfiniteSystemSpace={preload:api('system-images',{complete:true})};
  win.InfiniteDeitySpace={preload:api('deity-images',{loaded:deityReady?3:2,failed:deityReady?0:1})};
  win.InfiniteAudio={preload:api('audio',{ready:audioReady})};
  win.InfiniteSystemLive2D={prepare:api('character',{ready:characterReady,retryable:characterRetryable})};
  const domImage={currentSrc:'https://example.test/game/assets/panel.webp',complete:brokenDOM,naturalWidth:brokenDOM?0:100,
    getAttribute(){return this.currentSrc;},removeAttribute(){this.removed=true;},
    decode(){this.naturalWidth=100;return Promise.resolve();}};
  const doc={baseURI:'https://example.test/game/index.html',
    styleSheets:[{href:'https://example.test/game/ui.css',cssRules:[{style:{cssText:'background:url("assets/panel.webp");mask:url(https://foreign.test/tracker.png)'}},{cssRules:[{style:{cssText:'border-image:url(assets/card.png)'}}]}]}],
    querySelectorAll(selector){return selector==='img'?[domImage]:[];}
  };
  vm.runInNewContext(source,{window:win,document:doc,location:new URL(doc.baseURI),Image,URL,setTimeout,clearTimeout,Promise,Set,Map,console});
  return {api:win.InfiniteGamePreload,calls,requests,releaseMap,domImage};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('title readiness waits for map preparation; images are deduplicated and retained',async()=>{
  const h=harness(),progress=[];
  const first=h.api.prepare({onProgress:value=>progress.push(value)});
  const second=h.api.prepare();assert.equal(first,second);
  await settle();await settle();
  assert.equal(h.api.getState().ready,false);
  assert(h.api.getState().progress<100);
  assert(h.calls.includes('map-preparation'));
  assert.equal(h.requests.filter(url=>url.endsWith('panel.webp')).length,1);
  assert(!h.requests.some(url=>url.includes('foreign.test')));
  h.releaseMap();await first;
  assert.equal(h.api.getState().ready,true);
  assert.equal(h.api.getState().progress,100);
  assert(progress.every((value,index)=>!index||value>=progress[index-1]));
  const requests=h.requests.length,calls=h.calls.length;
  await h.api.prepare();assert.equal(h.requests.length,requests);assert.equal(h.calls.length,calls);
  assert.equal(h.api.getState().decodedImages,requests);
});

test('image failure does not reach 100%; retry only reloads failed work',async()=>{
  const h=harness({failedImage:'card.png'});
  await assert.rejects(h.api.prepare(),/incomplete/);
  assert.equal(h.api.getState().ready,false);assert(h.api.getState().progress<100);
  assert(!h.calls.includes('map-preparation'));
  h.releaseMap();await h.api.prepare();
  assert.equal(h.requests.filter(url=>url.endsWith('card.png')).length,2);
  assert.equal(h.requests.filter(url=>url.endsWith('panel.webp')).length,1);
  assert.equal(h.calls.filter(name=>name==='character').length,1);
  assert.equal(h.api.getState().ready,true);
});

test('sound preload failure blocks readiness and records the failing stage',async()=>{
  const h=harness({audioReady:false});
  await assert.rejects(h.api.prepare(),/incomplete/);
  assert.deepEqual(Array.from(h.api.getState().failed),['audio']);
  assert.equal(h.api.getState().ready,false);
});

test('unsupported Cubism preserves the existing illustration fallback',async()=>{
  const h=harness({characterReady:false});h.releaseMap();await h.api.prepare();
  assert.equal(h.api.getState().ready,true);
  assert.deepEqual(Array.from(h.api.getState().fallbacks),['character-illustration']);
});

test('character network failures remain retryable at boot instead of deferring to save entry',async()=>{
  const h=harness({characterReady:false,characterRetryable:true});
  await assert.rejects(h.api.prepare(),/incomplete/);
  assert.deepEqual(Array.from(h.api.getState().failed),['character']);
  assert.equal(h.api.getState().ready,false);
});

test('a cache refill repairs an earlier failed image in the actual scene DOM',async()=>{
  const h=harness({brokenDOM:true});h.releaseMap();await h.api.prepare();
  assert.equal(h.domImage.removed,true);
  assert.equal(h.domImage.src,h.domImage.currentSrc);
  assert.equal(h.domImage.naturalWidth,100);
});

test('scene image failures are checked even when their preload promises resolve',async()=>{
  for(const [option,key] of [['saveReady','save-images'],['deityReady','deity-images']]) {
    const h=harness({[option]:false});
    await assert.rejects(h.api.prepare(),/incomplete/);
    assert.deepEqual(Array.from(h.api.getState().failed),[key]);
    assert.equal(h.api.getState().ready,false);
  }
});

function transitionHarness(){
  const listeners=new Map();let waves=0,animation;
  const node=()=>({style:{},append(){},remove(){},setAttribute(){},getContext:()=>({drawImage(){}}),animate(){
    let resolve,reject;const finished=new Promise((yes,no)=>{resolve=yes;reject=no;});
    animation={finished,playState:'running',finish(){this.playState='finished';resolve();},cancel(){this.playState='idle';reject(new Error('cancelled'));}};
    return animation;
  }});
  const window={playDeityReturnWave(){waves++;throw new Error('Unexpected GL transition.');}};
  const document={hidden:false,createElement:node,body:{append(){}},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  vm.runInNewContext(fs.readFileSync('loading-page/system-scene-transition.js','utf8'),{window,document,Math,Float64Array});
  const frame={image:{width:1440,height:900},width:1440,height:900};
  return {cover:window.InfiniteSceneTransition.create(frame),frame,listeners,get animation(){return animation;},get waves(){return waves;}};
}

test('continuing a save fades the ready scene without compiling a GL transition',async()=>{
  const h=transitionHarness(),playing=h.cover.play(h.frame,{simple:true,duration:320});
  assert.equal(h.waves,0);h.animation.finish();assert.equal(await playing,true);
  assert.equal(h.listeners.size,0);assert.equal(h.cover.getState().progress,1);h.cover.release();
});

test('a cancelled save fade releases its pending transition and visibility handler',async()=>{
  const h=transitionHarness(),playing=h.cover.play(h.frame,{simple:true});
  h.cover.release();assert.equal(await playing,false);assert.equal(h.listeners.size,0);assert.equal(h.waves,0);
  const reduced=transitionHarness();assert.equal(await reduced.cover.play(reduced.frame,{reducedMotion:true}),true);assert.equal(reduced.waves,0);reduced.cover.release();
});
