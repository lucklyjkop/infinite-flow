/* Audio-clock mouth motion: 30 ms energy windows avoid pitch-cycle flicker,
   then a quiet gate and asymmetric easing preserve syllables and pauses. */
((root) => {
  'use strict';
  function build(buffer) {
    const step=.01,rate=buffer.sampleRate,hop=Math.max(1,Math.round(rate*step));
    const radius=Math.max(1,Math.round(rate*.015)),channels=[];
    for(let i=0;i<Math.min(2,buffer.numberOfChannels);i++)channels.push(buffer.getChannelData(i));
    const length=buffer.length,count=Math.ceil(length/hop)+1,energy=new Float32Array(count);
    if(!channels.length||!length)return {sample:()=>0,duration:buffer.duration,peak:0};
    let left=0,right=0,sum=0;
    const first=channels[0],second=channels[1];
    const power=second?index=>(first[index]*first[index]+second[index]*second[index])*.5:index=>first[index]*first[index];
    for(let frame=0;frame<count;frame++){
      const center=Math.min(length,frame*hop),start=Math.max(0,center-radius),end=Math.min(length,center+radius);
      while(right<end)sum+=power(right++);
      while(left<start)sum-=power(left++);
      energy[frame]=Math.sqrt(Math.max(0,sum)/Math.max(1,end-start));
    }
    const voiced=Array.from(energy).filter(value=>value>.008).sort((a,b)=>a-b);
    const reference=Math.max(.055,voiced[Math.floor(voiced.length*.9)]||.055);
    const floor=Math.max(.006,reference*.045),openGate=floor*1.65,closeGate=floor*1.15;
    const values=new Float32Array(count);let open=false,level=0,quiet=0,peak=0;
    for(let i=0;i<count;i++){
      const value=energy[i];
      if(value>=openGate){open=true;quiet=0;}
      else if(value<closeGate){quiet+=step;if(quiet>=.025)open=false;}
      const target=open ? .68*Math.pow(Math.max(0,Math.min(1,(value-floor)/(reference-floor))),.65) : 0;
      level+=(target-level)*(1-Math.exp(-step/(target>level ? .028 : .058)));
      // Actual pauses must reach the closed pose, not an indefinitely tiny gap.
      if(quiet>=.1&&level<.045)level=0;
      values[i]=level;peak=Math.max(peak,level);
    }
    return {duration:buffer.duration,peak,sample(seconds){
      if(!Number.isFinite(seconds)||seconds<0||seconds>=buffer.duration)return 0;
      const position=seconds/step,index=Math.min(values.length-1,Math.floor(position)),mix=position-index;
      return values[index]*(1-mix)+(values[index+1]??0)*mix;
    }};
  }
  const api=Object.freeze({build});
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.InfiniteSpeechEnvelope=api;
})(typeof window==='object'?window:globalThis);
