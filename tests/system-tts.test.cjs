'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync(path.resolve(__dirname,'../loading-page/system-tts.js'),'utf8');
const envelopeSource=fs.readFileSync(path.resolve(__dirname,'../loading-page/speech-envelope.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));
async function settle(){for(let i=0;i<3;i++)await flush();}

function fixture(){
  const window=new EventTarget(),document=new EventTarget(),requests=[],sources=[],gains=[],mouth=[],states=[],frames=new Map(),timers=[];
  let config={enabled:true,voice:'female',rate:100,volume:80},master=80,hub={visible:true,phase:'ready'},dialog=false,frameId=0;
  const sampleRate=24000,pcm=Float32Array.from({length:sampleRate},(_,index)=>{
    const seconds=index/sampleRate;return seconds>=.12&&seconds<.42?.2*Math.sin(2*Math.PI*200*seconds):0;
  });
  document.hidden=false;document.querySelector=()=>dialog?{}:null;
  window.InfiniteSettings={getTTSConfig:()=>({...config}),getState:()=>({audio:{master}})};
  window.InfiniteSystemSpace={getState:()=>({...hub})};
  window.InfiniteSystemLive2D={setSpeechLevel:value=>mouth.push(value)};
  class Context {
    constructor(){this.state='running';this.currentTime=10;this.destination={};f.context=this;}
    async resume(){this.state='running';}
    async suspend(){this.state='suspended';}
    async decodeAudioData(bytes){return {duration:pcm.length/sampleRate,length:pcm.length,numberOfChannels:1,sampleRate,getChannelData:()=>pcm,bytes};}
    createBufferSource(){
      const item={started:false,stopped:false,disconnected:false,onended:null,connect(){},disconnect(){this.disconnected=true;},start(){this.started=true;},stop(){this.stopped=true;}};
      sources.push(item);return item;
    }
    createGain(){
      const calls=[];
      const node={calls,connect(){},disconnect(){},gain:{value:0,cancelScheduledValues(time){calls.push(['cancel',time]);},
        setValueAtTime(value,time){this.value=value;calls.push(['set',value,time]);},
        linearRampToValueAtTime(value,time){this.value=value;calls.push(['ramp',value,time]);}}};
      gains.push(node);return node;
    }
  }
  window.AudioContext=Context;
  window.addEventListener('infinite:ttsstate',event=>states.push({...event.detail}));
  const f={window,document,requests,sources,gains,mouth,states,timers,context:null,
    setConfig(next){config={...config,...next};},setMaster(value){master=value;},setHub(value){hub=value;},setDialog(value){dialog=value;},
    emit(name,detail){window.dispatchEvent(new CustomEvent(name,{detail}));},
    hide(){document.hidden=true;document.dispatchEvent(new Event('visibilitychange'));},
    frame(seconds=0){if(f.context)f.context.currentTime+=seconds;const pending=[...frames.values()];frames.clear();pending.forEach(callback=>callback());},
    finish(index=sources.length-1){sources[index]?.onended?.();},
    respond(index,{ok=true,error='语音网络暂不可用',contentType='audio/mpeg',size=256}={}){
      requests[index].resolve({ok,headers:{get:()=>contentType},json:async()=>({error}),arrayBuffer:async()=>new ArrayBuffer(size)});
    },
  };
  const context=vm.createContext({window,document,CustomEvent,AbortController,Float32Array,
    setTimeout:(fn,delay)=>{const timer=setTimeout(fn,delay);timer.unref();timers.push({fn,delay,timer});return timer;},clearTimeout,
    requestAnimationFrame:fn=>{const id=++frameId;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),
    fetch:(url,options)=>new Promise((resolve,reject)=>requests.push({url,options,payload:JSON.parse(options.body),resolve,reject})),
  });
  vm.runInContext(envelopeSource,context);vm.runInContext(source,context);
  f.api=window.InfiniteTTS;return f;
}

test('late synthesis response after cancellation never starts audio',async()=>{
  const f=fixture(),job=f.api.preview({voice:'female'});await settle();assert.equal(f.requests.length,1);
  f.api.stop();assert.equal(f.requests[0].options.signal.aborted,true);f.respond(0);
  assert.equal(await job,false);assert.equal(f.sources.length,0);assert.equal(f.api.getState().phase,'idle');
});

test('switching from male to female only plays the newest chosen voice',async()=>{
  const f=fixture(),male=f.api.preview({voice:'male'});await settle();
  const female=f.api.preview({voice:'female'});await settle();
  assert.deepEqual(f.requests.map(item=>item.payload.voice),['male','female']);
  f.respond(0);assert.equal(await male,false);assert.equal(f.sources.length,0);
  f.respond(1);await settle();assert.equal(f.sources.length,1);assert.ok(f.sources[0].started);
  assert.equal(f.api.getState().voice,'female');f.finish();assert.equal(await female,true);
});

test('service failures remain visible in state and reject the caller',async()=>{
  const f=fixture(),job=f.api.preview({});const rejected=assert.rejects(job,error=>error.userMessage==='女声服务连接失败');await settle();
  f.respond(0,{ok:false,error:'女声服务连接失败'});await rejected;
  assert.equal(f.api.getState().phase,'error');assert.equal(f.api.getState().error,'女声服务连接失败');
  assert.ok(f.states.some(state=>state.phase==='error'&&state.error==='女声服务连接失败'));assert.equal(f.sources.length,0);
});

test('synthesis timeout is visible instead of silently returning to idle',async()=>{
  const f=fixture(),job=f.api.preview({});const rejected=assert.rejects(job,error=>error.userMessage.includes('超时'));await settle();
  const deadline=f.timers.find(timer=>timer.delay>=60000);assert.ok(deadline);clearTimeout(deadline.timer);deadline.fn();
  f.requests[0].reject(new DOMException('Aborted','AbortError'));await rejected;
  assert.equal(f.api.getState().phase,'error');assert.match(f.api.getState().error,/超时/);assert.equal(f.sources.length,0);
});

test('preview resolves only at the end of playback; stopping resolves false',async()=>{
  const f=fixture();let done=false;const job=f.api.preview({}).then(value=>{done=true;return value;});await settle();f.respond(0);await settle();
  assert.equal(done,false);assert.equal(f.api.getState().phase,'playing');f.finish();assert.equal(await job,true);
  const second=f.api.preview({});await settle();f.respond(1);await settle();f.api.stop();assert.equal(await second,false);
  assert.equal(f.sources[1].stopped,true);
});

test('saving settings, navigation, save changes and page hide stop active speech',async()=>{
  for(const event of ['infinite:settingssaved','infinite:systemmessage','infinite:systemleaving','infinite:systemclosed','infinite:saveactive','pagehide']){
    const f=fixture(),job=f.api.reply('正在说话');await settle();f.respond(0);await settle();
    assert.ok(f.sources[0].started);f.emit(event);assert.equal(await job,false,event);
    assert.equal(f.sources[0].stopped,true,event);assert.equal(f.mouth.at(-1),0,event);assert.equal(f.api.getState().busy,false,event);
  }
  const f=fixture(),job=f.api.reply('切到后台');await settle();f.respond(0);await settle();f.hide();
  assert.equal(await job,false);assert.equal(f.context.state,'suspended');assert.equal(f.mouth.at(-1),0);
});

test('disabled narration and inactive scenes do not synthesize',async()=>{
  const f=fixture();f.setConfig({enabled:false});assert.equal(await f.api.reply('关闭朗读'),false);
  f.emit('infinite:systemreply',{text:'也不播放事件回复'});await settle();assert.equal(f.requests.length,0);
  f.setConfig({enabled:true});f.setHub({visible:false,phase:'ready'});assert.equal(await f.api.reply('离开'),false);
  f.setHub({visible:true,phase:'opening'});assert.equal(await f.api.reply('尚未进入'),false);
  f.setHub({visible:true,phase:'ready'});f.setDialog(true);assert.equal(await f.api.reply('设置遮挡'),false);
  f.setDialog(false);f.hide();assert.equal(await f.api.reply('后台'),false);assert.equal(f.requests.length,0);
});

test('long prose is split at Unicode boundaries and Markdown destinations are not spoken',async()=>{
  const f=fixture(),plain='这是正文。'+('🌸'.repeat(100)+'。').repeat(19)+'查看说明。';
  const job=f.api.reply('# 这是**正文**。'+('🌸'.repeat(100)+'。').repeat(19)+'[查看说明](https://secret.example/long?token=none)。\n```js\nconsole.log("NO CODE");\n```');
  for(let i=0;i<3;i++){
    await settle();assert.ok(f.requests[i],`chunk ${i}`);f.respond(i);await settle();assert.ok(f.sources[i]?.started);f.finish(i);
  }
  assert.equal(await job,true);assert.equal(f.requests.length,3);
  const chunks=f.requests.map(item=>item.payload.text);
  assert.ok(chunks.every(text=>Array.from(text).length<=900));assert.equal(chunks.join(''),plain);
  assert.ok(chunks.every(text=>!text.includes('https:')&&!text.includes('console.log')&&!text.includes('**')));
});

test('gain follows volume, while decoded speech follows the audio clock and closes on pauses',async()=>{
  const f=fixture();f.setConfig({volume:50});f.setMaster(25);const job=f.api.reply('真实口型');await settle();f.respond(0);await settle();
  const level=Math.pow(.25,1.35)*.5;
  assert.ok(f.gains[0].calls.some(call=>call[0]==='ramp'&&Math.abs(call[1]-level)<1e-10));
  assert.equal(f.mouth.at(-1),0);f.frame(.2);assert.ok(f.mouth.at(-1)>.5&&f.mouth.at(-1)<=.68);
  const held=f.mouth.at(-1);for(let frame=0;frame<15;frame++)f.frame();assert.equal(f.mouth.at(-1),held,'render frames must not advance speech');
  f.frame(.5);assert.equal(f.mouth.at(-1),0,'the pause closes the mouth before the audio buffer ends');
  f.finish();assert.equal(await job,true);assert.equal(f.mouth.at(-1),0);
});

test('preview audio does not animate the live character mouth',async()=>{
  const f=fixture(),job=f.api.preview({});await settle();f.respond(0);await settle();f.frame(.5);
  assert.ok(f.mouth.every(value=>value===0));f.finish();assert.equal(await job,true);
});

test('prefetched next-chunk failure is handled while current speech finishes',async()=>{
  const f=fixture(),unhandled=[];const capture=reason=>unhandled.push(reason);process.on('unhandledRejection',capture);
  try{
    const job=f.api.reply('甲'.repeat(1000));const rejected=assert.rejects(job,error=>error.userMessage==='下一段暂不可用');
    await settle();f.respond(0);await settle();assert.equal(f.requests.length,2);assert.equal(f.api.getState().phase,'playing');
    f.respond(1,{ok:false,error:'下一段暂不可用'});await settle();assert.equal(unhandled.length,0);
    f.finish(0);await rejected;assert.equal(f.sources.length,1);assert.equal(f.api.getState().phase,'error');assert.equal(unhandled.length,0);
  }finally{process.removeListener('unhandledRejection',capture);}
});

test('non-audio and incomplete responses are not played',async()=>{
  for(const value of [{contentType:'text/html'},{size:64}]){
    const f=fixture(),job=f.api.preview({});const rejected=assert.rejects(job,error=>Boolean(error.userMessage));await settle();
    f.respond(0,value);await rejected;assert.equal(f.sources.length,0);assert.equal(f.api.getState().phase,'error');
  }
});
