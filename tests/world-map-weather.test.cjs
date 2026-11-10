const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../loading-page/world-map-weather.js'),'utf8');
function setup(options={}){
  let now=0,nextFrame=0,work=0;const callbacks=new Map(),canvases=[],changes=[];
  const target=()=>{const handlers=new Map();return{handlers,addEventListener(name,fn){handlers.set(name,fn);},removeEventListener(name,fn){if(handlers.get(name)===fn)handlers.delete(name);},emit(name,event={}){handlers.get(name)?.(event);}};};
  const context=()=>{const calls={clear:0,fill:0,stroke:0,gradients:0,paths:[]};let points=[];return{calls,setTransform(){},clearRect(){calls.clear++;},drawImage(){calls.fill++;work+=options.operationMs||0;},createLinearGradient(){calls.gradients++;return{addColorStop(){}};},createRadialGradient(){calls.gradients++;return{addColorStop(){}};},fillRect(){calls.fill++;work+=options.operationMs||0;},beginPath(){points=[];},moveTo(x,y){points.push([x,y]);},lineTo(x,y){points.push([x,y]);},closePath(){},ellipse(){},fill(){calls.fill++;work+=options.operationMs||0;},stroke(){calls.stroke++;work+=options.operationMs||0;if(options.capturePaths)calls.paths.push(points.slice());}};};
  const host={style:{cssText:'color:red'},children:[],setAttribute(){},getBoundingClientRect:()=>({width:options.width||1440,height:options.height||900}),appendChild(canvas){host.children.push(canvas);canvas.parent=host;}};
  const document={...target(),hidden:false,createElement(){const ctx=context(),canvas={...target(),style:{},width:0,height:0,getContext:type=>type==='2d'?ctx:null,remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);},ctx};canvases.push(canvas);return canvas;}};
  const window={...target(),innerWidth:1440,innerHeight:900,devicePixelRatio:2};
  const sandbox={window,document,performance:{now:()=>now+work},requestAnimationFrame:callback=>{callbacks.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:id=>callbacks.delete(id),Float32Array,Math,Object,Number,Error,TypeError};
  vm.runInNewContext(source,sandbox);const api=window.InfiniteWorldWeather.create(host,{onChange:value=>changes.push({...value,time:now}),getSurfaces:options.getSurfaces});
  const step=time=>{now=time;const scheduled=[...callbacks.values()];callbacks.clear();for(const callback of scheduled)callback(time);};
  const render=time=>{now=time;return api.render(time);};
  return{api,host,window,document,changes,callbacks,canvases,step,render};
}
test('weather starts stopped with two bounded canvases and no image resource dependency',()=>{
  const x=setup(),s=x.api.getState();assert.equal(s.drawing,false);assert.equal(s.frames,0);assert.equal(x.host.children.length,2);assert.equal(s.backend,'canvas2d');assert.equal(s.cloudCubes,252);assert.equal(s.cloudGroups,7);assert.ok(s.particleCount>100&&s.particleCount<=260);assert.equal(s.dpr,1);
  assert.equal(x.host.children[0].width,1080);assert.equal(x.host.children[0].height,675);assert.equal(x.host.children[1].width,1440);assert.equal(x.host.children[1].height,900);assert.equal(x.callbacks.size,0);
});
test('manual timestamps visit clear, overcast, rain, mist and return to clear',()=>{
  const x=setup();x.api.setState({active:true,motion:true,progress:1});x.render(0);assert.equal(x.api.getState().phase,'clear');assert.equal(x.api.getState().values.rain,0);
  x.render(28000);const blend=x.api.getState().values;assert.ok(blend.cloud>.28&&blend.cloud<.85);assert.ok(blend.sun>0.12&&blend.sun<1);
  x.render(32000);assert.equal(x.api.getState().phase,'overcast');x.render(66000);assert.equal(x.api.getState().phase,'rain');assert.equal(x.api.getState().values.rain,1);x.render(102000);assert.equal(x.api.getState().phase,'mist');assert.equal(x.api.getState().values.rain,0);x.render(126000);assert.equal(x.api.getState().phase,'clear');assert.equal(x.api.getState().values.sun,1);
});
test('phase boundaries keep atmospheric values continuous through an eight-second blend',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);
  for(const boundary of [32000,62000,98000,126000]){x.render(boundary-1);const before=x.api.getState().values;x.render(boundary);const after=x.api.getState().values;for(const key of ['rain','cloud','sun','fog'])assert.ok(Math.abs(before[key]-after[key])<.00001);}
});
test('state synchronization never paints or allocates new canvases during motion',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);const before=x.api.getState().frames,canvases=x.canvases.length;
  for(let i=0;i<300;i++)x.api.setState({progress:1,camera:i*100,pageWidth:1440,chapterIndex:1000000+i});
  assert.equal(x.api.getState().frames,before);assert.equal(x.canvases.length,canvases);assert.equal(x.callbacks.size,1);
});
test('rain has a smooth independent clock while atmosphere stays at eight frames per second',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);x.render(66000);const before=x.api.getState();for(let t=66016;t<=67000;t+=16.667)x.step(t);const state=x.api.getState(),frames=state.frames-before.frames;assert.ok(frames>=55&&frames<=60);assert.ok(state.airFrames-before.airFrames<=8);assert.equal(x.callbacks.size,1);
});
test('clear weather paints only the slow atmosphere clock',()=>{
  const x=setup();x.api.setState({active:true,progress:1});for(let t=0;t<=1000;t+=8)x.step(t);assert.ok(x.api.getState().frames<=9);
});
test('reduced motion stops callbacks and freezes weather while retaining static atmosphere',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);x.render(66000);x.api.setState({motion:false});const before=x.api.getState();assert.equal(before.drawing,false);assert.equal(before.opacity,1);assert.equal(x.callbacks.size,0);
  x.render(150000);assert.equal(x.api.getState().cycleElapsed,before.cycleElapsed);assert.equal(x.api.getState().phase,'rain');x.api.setState({motion:true});x.render(180000);assert.equal(x.api.getState().cycleElapsed,before.cycleElapsed);x.render(181000);assert.equal(x.api.getState().cycleElapsed,before.cycleElapsed+1000);
});
test('inactive and hidden periods neither draw nor advance the weather clock',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);x.render(1000);x.document.hidden=true;x.document.emit('visibilitychange');const count=x.api.getState().frames;assert.equal(x.callbacks.size,0);assert.equal(x.render(50000),false);assert.equal(x.api.getState().frames,count);
  x.document.hidden=false;x.document.emit('visibilitychange');x.render(51000);assert.equal(x.api.getState().cycleElapsed,2000);x.api.setState({active:false});assert.equal(x.api.getState().opacity,0);assert.equal(x.callbacks.size,0);assert.equal(x.render(100000),false);
});
test('entering opacity follows progress and fully disappears at either exit state',()=>{
  const x=setup();x.api.setState({active:true,progress:0});assert.equal(x.api.getState().opacity,0);x.api.setState({progress:.5});assert.ok(x.api.getState().opacity>0&&x.api.getState().opacity<1);x.api.setState({progress:1});assert.equal(x.api.getState().opacity,1);x.api.setState({progress:0});assert.equal(x.api.getState().opacity,0);x.api.setState({progress:1,active:false});assert.equal(x.api.getState().opacity,0);
});
test('rain strokes appear only during rainfall and are bounded by the particle budget',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);const rain=x.host.children.find(c=>c.style.zIndex==='1').ctx;assert.equal(rain.calls.stroke,0);x.render(66000);assert.ok(x.api.getState().paintedDrops>100);assert.ok(x.api.getState().paintedDrops<=x.api.getState().particleCount);assert.ok(rain.calls.stroke<=6,'rain and contact effects use six bounded paths');const previous=rain.calls.stroke;x.api.setState({motion:false});x.render(67000);assert.equal(rain.calls.stroke,previous);
});
test('weather callbacks are rate limited and do not share mutable state',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);for(let t=24000;t<=33000;t+=100)x.render(t);
  for(let i=1;i<x.changes.length;i++)assert.ok(x.changes[i].time-x.changes[i-1].time>=500);x.changes.at(-1).rain=999;const exposed=x.api.getState();exposed.values.rain=999;assert.ok(x.api.getState().values.rain<=1);
});
test('dispose releases canvases, frame callback and all lifecycle listeners',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);x.api.dispose();assert.equal(x.api.getState().disposed,true);assert.equal(x.api.getState().drawing,false);assert.equal(x.callbacks.size,0);assert.equal(x.host.children.length,0);assert.equal(x.host.style.cssText,'color:red');assert.equal(x.window.handlers.size,0);assert.equal(x.document.handlers.size,0);x.api.dispose();x.api.setState({active:true});x.api.resize();assert.equal(x.render(5000),false);assert.equal(x.callbacks.size,0);
});

test('drops terminate at supplied surfaces and spawn bounded contact splashes',()=>{
  const x=setup({capturePaths:true,getSurfaces:()=>[{x:720,y:510,kind:'scenery',light:1}]});
  x.api.setState({active:true,progress:1});x.render(0);const ctx=x.host.children.find(c=>c.style.zIndex==='1').ctx;ctx.calls.paths=[];x.render(66000);
  const state=x.api.getState();assert.equal(state.surfaceCount,1);assert.ok(state.paintedSplashes>0&&state.paintedSplashes<=24);assert.ok(state.contacts.scenery>0);
  for(const path of ctx.calls.paths.slice(0,3))for(const [,y]of path)assert.ok(y<=510,'falling streak must never go through contact surface');
  assert.ok(state.paintedSplashes<=state.particleCount);
});
test('surface geometry is cached while idle and refreshes only after view changes',()=>{
  let reads=0;const x=setup({getSurfaces:()=>{reads++;return[{x:500,y:450,kind:'mountain'}];}});
  x.api.setState({active:true,progress:1});x.render(0);assert.equal(reads,0,'clear sky does not sample map collision geometry');x.render(66000);for(let t=66050;t<=68000;t+=50)x.render(t);assert.equal(reads,1);
  x.api.setState({camera:100});x.render(68100);assert.equal(reads,2);x.api.setState({surfaceRevision:2});x.render(68120);assert.equal(reads,2);x.render(68200);assert.equal(reads,3);
});
test('snow chapter uses drifting snow instead of rain and keeps rain audio off',()=>{
  const x=setup({getSurfaces:()=>[{x:700,y:550,kind:'ground'}]});x.api.setState({active:true,progress:1,chapterIndex:2});x.render(0);x.render(66000);
  const s=x.api.getState();assert.equal(s.phase,'snow');assert.equal(s.values.rain,0);assert.equal(s.values.snow,1);assert.ok(s.paintedDrops>30);assert.ok(s.paintedSplashes>0);
});
test('small screens have a lower bounded precipitation population',()=>{
  const x=setup({width:390,height:844});assert.ok(x.api.getState().particleCount<=100);assert.ok(x.api.getState().particleCount>=50);
});

test('sustained expensive painting reduces the particle budget without growing the pool',()=>{
  const x=setup({operationMs:2});x.api.setState({active:true,progress:1});const initial=x.api.getState().particleCount;x.render(0);
  for(let t=66000;t<70000;t+=50)x.render(t);
  const s=x.api.getState();assert.ok(s.quality<1);assert.ok(s.particleCount<initial);assert.equal(s.particleCapacity,260);assert.ok(s.quality>=.45);
});
test('cloud geometry is rasterized once per lighting step and stays within a small cache',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);const initial=x.api.getState();
  for(let t=50;t<6000;t+=50)x.render(t);
  assert.equal(x.api.getState().cloudBuilds,initial.cloudBuilds);assert.ok(x.api.getState().cloudTextureBytes<3000000);
  x.render(66000);assert.ok(x.api.getState().cloudBuilds>initial.cloudBuilds);
});

test('air gradients are created once and never rebuilt by animated rain or fog',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);const gradients=()=>x.canvases.reduce((sum,c)=>sum+c.ctx.calls.gradients,0),initial=gradients();
  for(let t=66000;t<67000;t+=17)x.render(t);for(let t=102000;t<103000;t+=125)x.render(t);assert.equal(gradients(),initial);
});
