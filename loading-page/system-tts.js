/* Built-in online voices. One cancellable playback owns its audio and mouth
   envelope; switching saves or pages cannot replay a late synthesis response. */
(() => {
  'use strict';
  const sample='红线在，归途便在。欢迎来到系统空间，下一场故事，我们一同见证。';
  const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
  let context=null,active=null,serial=0,phase='idle',lastError='',lastKind=null,lastVoice='female';
  const fail=message=>Object.assign(new Error('Speech unavailable'),{userMessage:message});
  const finite=(value,fallback)=>Number.isFinite(Number(value))?Number(value):fallback;
  function options(value={}){return {voice:value.voice==='male'?'male':'female',rate:Math.round(clamp(finite(value.rate,100),75,125)),
    volume:clamp(finite(value.volume,80),0,100),master:clamp(finite(value.master,80),0,100)};}
  function getState(){return {phase,kind:active?.kind||lastKind,voice:active?.config.voice||lastVoice,busy:Boolean(active),error:lastError};}
  function notify(next,error=''){phase=next;lastError=error;window.dispatchEvent(new CustomEvent('infinite:ttsstate',{detail:getState()}));}
  function mouth(amount=0){window.InfiniteSystemLive2D?.setSpeechLevel?.(amount);}
  function foreground(){return !document.hidden;}
  function current(run){return active===run&&foreground();}
  async function unlock(){
    if(!foreground())return false;
    const Constructor=window.AudioContext||window.webkitAudioContext;
    if(!Constructor)return false;
    if(!context||context.state==='closed')context=new Constructor({latencyHint:'interactive'});
    if(context.state!=='running')await context.resume();
    return context.state==='running';
  }
  function endAudio(run,fade=false){
    cancelAnimationFrame(run.frame);run.frame=0;
    const source=run.source,gain=run.gain,analyser=run.analyser;
    run.source=run.gain=run.analyser=null;
    if(source){
      source.onended=null;
      const disconnect=()=>{try{source.disconnect();analyser?.disconnect();gain?.disconnect();}catch{}};
      try{
        if(fade&&context?.state==='running'){
          const now=context.currentTime;gain.gain.cancelScheduledValues(now);gain.gain.setValueAtTime(gain.gain.value,now);gain.gain.linearRampToValueAtTime(0,now+.035);source.stop(now+.04);setTimeout(disconnect,80);
        }else{source.stop();disconnect();}
      }catch{disconnect();}
    }
    run.endPlayback?.(false);run.endPlayback=null;
    mouth(0);
  }
  function stop(){
    const run=active;active=null;serial++;
    if(run){run.controller.abort();endAudio(run,true);}
    lastKind=null;notify('idle');mouth(0);
  }
  function speechChunks(value){
    // Speak prose rather than Markdown delimiters or raw link destinations.
    const text=String(value||'').replace(/```[\s\S]*?```/g,'').replace(/!\[[^\]]*\]\([^)]*\)/g,'')
      .replace(/\[([^\]]+)\]\([^)]*\)/g,'$1').replace(/^\s{0,3}[#>]+\s?/gm,'').replace(/[*_`~]/g,'').trim();
    const chars=Array.from(text),chunks=[];
    while(chars.length){
      let count=Math.min(900,chars.length);
      if(chars.length>count){for(let i=count-1;i>=400;i--){if(/[。！？；\n]/.test(chars[i])){count=i+1;break;}}}
      const part=chars.splice(0,count).join('').trim();if(part)chunks.push(part);
    }
    return chunks;
  }
  async function synthesize(run,text){
    const timer=setTimeout(()=>{run.timedOut=true;run.controller.abort();},65000);
    try{
      const response=await fetch('api/tts',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',signal:run.controller.signal,
        body:JSON.stringify({text,voice:run.config.voice,rate:run.config.rate})});
      if(!current(run))return null;
      if(!response.ok){const result=await response.json().catch(()=>null);throw fail(typeof result?.error==='string'?result.error.slice(0,220):'语音服务暂时不可用，请重试。');}
      if(!(response.headers.get('Content-Type')||'').startsWith('audio/'))throw fail('语音服务没有返回音频。');
      const bytes=await response.arrayBuffer();if(!current(run))return null;
      if(bytes.byteLength>8*1024*1024||bytes.byteLength<128)throw fail('收到的语音文件无效。');
      const buffer=await context.decodeAudioData(bytes);return current(run)?buffer:null;
    }finally{clearTimeout(timer);}
  }
  function play(run,buffer){
    if(!current(run)||!buffer)return Promise.resolve(false);
    const source=context.createBufferSource(),gain=context.createGain(),analyser=context.createAnalyser();
    const level=Math.pow(run.config.master/100,1.35)*(run.config.volume/100),now=context.currentTime;
    source.buffer=buffer;analyser.fftSize=256;source.connect(analyser);analyser.connect(gain);gain.connect(context.destination);
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(level,now+.018);
    gain.gain.setValueAtTime(level,now+Math.max(.02,buffer.duration-.045));gain.gain.linearRampToValueAtTime(0,now+buffer.duration);
    run.source=source;run.gain=gain;run.analyser=analyser;
    const values=new Float32Array(analyser.fftSize);
    function envelope(){
      if(!current(run)||run.source!==source)return;
      if(run.kind==='reply'){
        analyser.getFloatTimeDomainData(values);let sum=0;for(const value of values)sum+=value*value;
        mouth(clamp((Math.sqrt(sum/values.length)-.012)*6,0,.85));
      }
      run.frame=requestAnimationFrame(envelope);
    }
    const completion=new Promise(resolve=>{
      run.endPlayback=resolve;
      source.onended=()=>{if(run.source===source){run.endPlayback=null;endAudio(run);}resolve(true);};
    });
    source.start();notify('playing');envelope();return completion;
  }
  async function speak(text,config,kind='reply'){
    stop();const chunks=speechChunks(text);if(!chunks.length||!foreground())return false;
    const run={id:++serial,controller:new AbortController(),config:options(config),kind,frame:0,timedOut:false};
    active=run;lastKind=kind;lastVoice=run.config.voice;notify('synthesizing');
    try{
      if(!await unlock())throw fail('浏览器尚未开启声音，请点击页面后重试。');
      if(!current(run))return false;
      // Resolve prefetch failures into values immediately so a rejected next
      // paragraph cannot become an unhandled rejection during current speech.
      const prepare=part=>synthesize(run,part).then(buffer=>({buffer}),error=>({error}));
      let next=prepare(chunks[0]);
      for(let i=0;i<chunks.length;i++){
        const item=await next;if(!current(run))return false;if(item.error)throw item.error;
        const playing=play(run,item.buffer);
        next=i+1<chunks.length?prepare(chunks[i+1]):null;
        if(!await playing||!current(run))return false;
        if(next)notify('synthesizing');
      }
      if(active===run){active=null;notify('idle');}return true;
    }catch(error){
      if(active!==run)return false;
      active=null;run.controller.abort();endAudio(run,true);
      const message=error?.userMessage||(run.timedOut?'语音合成超时，请重试。':'暂时无法播放语音，请检查网络后重试。');
      notify('error',message);throw fail(message);
    }finally{
      if(active===run){active=null;endAudio(run);notify('idle');}
    }
  }
  function savedOptions(){const state=window.InfiniteSettings?.getState?.()||{};return {...window.InfiniteSettings?.getTTSConfig?.(),master:state.audio?.master??80};}
  async function reply(text){
    if(!window.InfiniteSettings?.getTTSConfig?.().enabled)return false;
    const hub=window.InfiniteSystemSpace?.getState?.();if(!hub?.visible||hub.phase!=='ready'||document.querySelector('dialog[open]'))return false;
    return speak(text,savedOptions(),'reply');
  }
  window.addEventListener('infinite:systemreply',event=>{void reply(event.detail?.text).catch(()=>{});});
  for(const name of ['infinite:systemmessage','infinite:systemleaving','infinite:systemclosed','infinite:saveactive','pagehide'])window.addEventListener(name,stop);
  window.addEventListener('infinite:settingssaved',stop);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();context?.suspend().catch(()=>{});}});
  // Prime the audio device during the player's send/click gesture. The later
  // network reply may then play without relying on autoplay-policy exceptions.
  for(const type of ['pointerdown','keydown'])document.addEventListener(type,()=>{
    if(window.InfiniteSettings?.getTTSConfig?.().enabled)void unlock().catch(()=>{});
  },{capture:true,passive:true});
  window.InfiniteTTS=Object.freeze({preview:config=>speak(sample,config,'preview'),reply,stop,unlock,getState});
})();
