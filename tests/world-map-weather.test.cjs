const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../loading-page/world-map-weather.js'),'utf8');
function setup(){
  let now=0,nextFrame=0;const callbacks=new Map(),canvases=[],changes=[];
  const target=()=>{const handlers=new Map();return{handlers,addEventListener(name,fn){handlers.set(name,fn);},removeEventListener(name,fn){if(handlers.get(name)===fn)handlers.delete(name);},emit(name,event={}){handlers.get(name)?.(event);}};};
  const context=()=>{const calls={clear:0,fill:0,stroke:0};return{calls,setTransform(){},clearRect(){calls.clear++;},createLinearGradient(){return{addColorStop(){}};},createRadialGradient(){return{addColorStop(){}};},fillRect(){calls.fill++;},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){calls.fill++;},stroke(){calls.stroke++;}};};
  const host={style:{cssText:'color:red'},children:[],setAttribute(){},getBoundingClientRect:()=>({width:1440,height:900}),appendChild(canvas){host.children.push(canvas);canvas.parent=host;}};
  const document={...target(),hidden:false,createElement(){const ctx=context(),canvas={...target(),style:{},width:0,height:0,getContext:type=>type==='2d'?ctx:null,remove(){if(this.parent)this.parent.children.splice(this.parent.children.indexOf(this),1);},ctx};canvases.push(canvas);return canvas;}};
  const window={...target(),innerWidth:1440,innerHeight:900,devicePixelRatio:2};
  const sandbox={window,document,performance:{now:()=>now},requestAnimationFrame:callback=>{callbacks.set(++nextFrame,callback);return nextFrame;},cancelAnimationFrame:id=>callbacks.delete(id),Float32Array,Math,Object,Number,Error,TypeError};
  vm.runInNewContext(source,sandbox);const api=window.InfiniteWorldWeather.create(host,{onChange:value=>changes.push({...value,time:now})});
  const step=time=>{now=time;const scheduled=[...callbacks.values()];callbacks.clear();for(const callback of scheduled)callback(time);};
  const render=time=>{now=time;return api.render(time);};
  return{api,host,window,document,changes,callbacks,canvases,step,render};
}
test('weather starts stopped with two bounded canvases and no image resource dependency',()=>{
  const x=setup(),s=x.api.getState();assert.equal(s.drawing,false);assert.equal(s.frames,0);assert.equal(x.host.children.length,2);assert.equal(s.backend,'canvas2d');assert.equal(s.cloudCubes,90);assert.equal(s.cloudGroups,5);assert.equal(s.particleCount,90);assert.equal(s.dpr,1);
  assert.ok(x.host.children.every(c=>c.width===1440&&c.height===900));assert.equal(x.callbacks.size,0);
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
test('independent animation paints no more than 24 frames per second',()=>{
  const x=setup();x.api.setState({active:true,progress:1});for(let t=0;t<=1000;t+=8)x.step(t);const frames=x.api.getState().frames;assert.ok(frames>=18&&frames<=25);assert.equal(x.callbacks.size,1);
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
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);const rain=x.host.children.find(c=>c.style.zIndex==='1').ctx;assert.equal(rain.calls.stroke,0);x.render(66000);assert.ok(rain.calls.stroke>35&&rain.calls.stroke<=90);const previous=rain.calls.stroke;x.api.setState({motion:false});x.render(67000);assert.equal(rain.calls.stroke,previous);
});
test('weather callbacks are rate limited and do not share mutable state',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);for(let t=24000;t<=33000;t+=100)x.render(t);
  for(let i=1;i<x.changes.length;i++)assert.ok(x.changes[i].time-x.changes[i-1].time>=500);x.changes.at(-1).rain=999;const exposed=x.api.getState();exposed.values.rain=999;assert.ok(x.api.getState().values.rain<=1);
});
test('dispose releases canvases, frame callback and all lifecycle listeners',()=>{
  const x=setup();x.api.setState({active:true,progress:1});x.render(0);x.api.dispose();assert.equal(x.api.getState().disposed,true);assert.equal(x.api.getState().drawing,false);assert.equal(x.callbacks.size,0);assert.equal(x.host.children.length,0);assert.equal(x.host.style.cssText,'color:red');assert.equal(x.window.handlers.size,0);assert.equal(x.document.handlers.size,0);x.api.dispose();x.api.setState({active:true});x.api.resize();assert.equal(x.render(5000),false);assert.equal(x.callbacks.size,0);
});
