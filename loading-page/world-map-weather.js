/* Voxel clouds and weather own a low-frequency clock; terrain stays idle. */
(() => {
  'use strict';
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
  const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
  const phases=[{kind:'clear',duration:32000,rain:0,cloud:.28,sun:1,fog:.08},{kind:'overcast',duration:30000,rain:0,cloud:.85,sun:.12,fog:.22},{kind:'rain',duration:36000,rain:1,cloud:1,sun:0,fog:.34},{kind:'mist',duration:28000,rain:0,cloud:.52,sun:.35,fog:.9}];
  const cycleDuration=126000,transitionDuration=8000,frameInterval=1000/24;
  function atmosphereAt(elapsed){
    let position=((elapsed%cycleDuration)+cycleDuration)%cycleDuration,index=0;
    while(position>=phases[index].duration){position-=phases[index].duration;index++;}
    const phase=phases[index],next=phases[(index+1)%phases.length],blend=smooth((position-(phase.duration-transitionDuration))/transitionDuration),values={kind:phase.kind};
    for(const key of ['rain','cloud','sun','fog'])values[key]=phase[key]+(next[key]-phase[key])*blend;return values;
  }
  function create(host,{onChange,getSurfaces}={}){
    if(!host?.appendChild)throw new TypeError('Weather requires a host element.');
    const originalStyle=host.style.cssText;host.setAttribute('aria-hidden','true');Object.assign(host.style,{position:'absolute',inset:'0',pointerEvents:'none',overflow:'hidden',zIndex:'4',opacity:'0',contain:'strict'});
    const makeCanvas=z=>{const c=document.createElement('canvas');Object.assign(c.style,{position:'absolute',inset:'0',display:'block',width:'100%',height:'100%',pointerEvents:'none',zIndex:String(z)});host.appendChild(c);return c;};
    const cloudCanvas=makeCanvas(0);const rainCanvas=makeCanvas(1),ctx=rainCanvas.getContext('2d',{alpha:true,desynchronized:true});
    if(!ctx)throw new Error('Weather canvas is unavailable.');
    let disposed=false,frame=0,frames=0,width=1,height=1,dpr=1,elapsed=0,lastClock=null,lastPaint=-Infinity,lastNotification=-Infinity,values=atmosphereAt(0),notified=null,opacity=0;
    let surfaces=[],surfaceKey='',surfaceBuiltAt=-Infinity,surfaceBuilds=0,renderMs=0,quality=1,slowFrames=0,fastFrames=0,paintedDrops=0,paintedSplashes=0,contacts={};
    const backend='canvas2d',cloudContext=cloudCanvas.getContext('2d',{alpha:true,desynchronized:true});
    if(!cloudContext)throw new Error('Cloud canvas is unavailable.');
    const cloudSprites=Array.from({length:7},()=>document.createElement('canvas'));let cloudCacheKey='',cloudBuilds=0;
    const state={progress:0,camera:0,pageWidth:1,chapterIndex:0,surfaceRevision:0,active:false,motion:true};
    let seed=0x6d2b79f5;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const rain=Array.from({length:900},(_,index)=>({x:random(),y:random(),speed:.62+random()*.46,length:18+random()*23,depth:index%3,sway:random()*6.28,seed:random()}));
    const motes=Array.from({length:42},()=>({x:random(),y:random(),seed:random()}));
    const budget=()=>Math.round(clamp(width*height/1500,200,width<700?320:900)*quality);
    const groups=Array.from({length:7},(_,i)=>({x:.07+i*.155,y:[.085,.175,.065,.15,.095,.20,.11][i],speed:1.4+random()*2.2,seed:random(),cells:[]}));
    for(const group of groups){
      const candidates=[];for(let x=-3;x<=3;x++)for(let y=-1;y<=1;y++)for(let z=-2;z<=2;z++){const score=x*x/10+y*y/2+z*z/4+random()*.65;candidates.push({x,y,z,seed:random(),score});}
      // Build and order bounded fallback geometry once, never in the frame loop.
      group.cells=candidates.sort((a,b)=>a.score-b.score).slice(0,36).sort((a,b)=>(b.x*.52-b.y*.35-b.z*.8)-(a.x*.52-a.y*.35-a.z*.8));
    }
    const drawable=()=>!disposed&&state.active&&!document.hidden,animating=()=>drawable()&&state.motion;
    function updateOpacity(){opacity=state.active?smooth((state.progress-.24)/.61):0;host.style.opacity=opacity.toFixed(4);}
    function stop(){if(frame)cancelAnimationFrame(frame);frame=0;lastClock=null;}
    function schedule(){if(!frame&&animating())frame=requestAnimationFrame(tick);}
    function tick(now){frame=0;if(!animating())return;if(now-lastPaint>=frameInterval/(quality<.7?.8:1)-.5)render(now);schedule();}
    function notification(now){
      if(typeof onChange!=='function'||now-lastNotification<500)return;if(notified&&notified.kind===values.kind&&['rain','cloud','sun','fog'].every(key=>Math.abs(notified[key]-values[key])<.01))return;
      lastNotification=now;notified={...values};onChange({...values});
    }
    function drawClouds(){
      const c=cloudContext,time=elapsed/1000,unit=clamp(width*.021,14,30),dark=clamp((values.cloud-.28)/.72);
      const cameraOffset=-Math.sin(state.camera/state.pageWidth*.08)*width*.025;
      c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);if(opacity<.001)return;
      const key=[Math.round(unit),Math.round(dark*16),quality<.7?1:0].join(':');
      if(key!==cloudCacheKey){
        cloudCacheKey=key;cloudBuilds++;
        const base=[139-78*dark,153-78*dark,159-74*dark];
        const faces=[{shade:1.06,points:[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]},{shade:.79,points:[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]},{shade:.91,points:[[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]]}];
        groups.forEach((group,index)=>{
          const sprite=cloudSprites[index];sprite.width=Math.ceil(unit*14);sprite.height=Math.ceil(unit*7);const paint=sprite.getContext('2d'),cx=sprite.width/2,cy=sprite.height/2;
          for(let i=0;i<group.cells.length;i+=quality<.7?2:1){const cell=group.cells[i],size=unit*(.88+.1*((cell.seed*7.13)%1)),x=cell.x*unit,y=cell.y*unit,z=cell.z*unit;
            for(const face of faces){paint.fillStyle='rgb('+base.map(v=>Math.round(v*face.shade*(.91+cell.seed*.15))).join(',')+')';paint.beginPath();face.points.forEach((p,j)=>{const px=cx+x+p[0]*size+(z+p[2]*size)*.65,py=cy-(y+p[1]*size)*.8+(z+p[2]*size)*.35;if(j)paint.lineTo(px,py);else paint.moveTo(px,py);});paint.closePath();paint.fill();}
          }
        });
      }
      c.globalAlpha=.24+values.cloud*.14+values.rain*.04;
      groups.forEach((group,index)=>{
        const sprite=cloudSprites[index],span=width+unit*12;
        const x=((group.x*span+time*group.speed+cameraOffset)%span+span)%span-unit*6,y=height*group.y+Math.sin(time*.045+group.seed*6.28)*height*.008;
        const spread=.96+.055*Math.sin(time*.085+group.seed*6.28),thickness=.80+values.cloud*.19+values.rain*.08;
        c.drawImage(sprite,x-sprite.width*spread/2,y-sprite.height*thickness/2,sprite.width*spread,sprite.height*thickness);
      });c.globalAlpha=1;
    }
    function drawAir(){
      const time=elapsed/1000;
      const sky=ctx.createLinearGradient(0,0,0,height*.65);sky.addColorStop(0,'rgba(25,39,53,.22)');sky.addColorStop(1,'rgba(51,65,76,0)');ctx.globalAlpha=values.cloud*.55;ctx.fillStyle=sky;ctx.fillRect(0,0,width,height*.65);
      if(values.sun>.01){
        const glow=ctx.createRadialGradient(width*.72,height*.04,0,width*.72,height*.04,width*.65);glow.addColorStop(0,'rgba(247,212,148,.17)');glow.addColorStop(.5,'rgba(198,183,147,.04)');glow.addColorStop(1,'rgba(151,139,111,0)');ctx.globalAlpha=values.sun;ctx.fillStyle=glow;ctx.fillRect(0,0,width,height*.83);
        for(let i=0;i<4;i++){
          const x=width*(.39+i*.13+Math.sin(time*.024+i)*.014),beam=ctx.createLinearGradient(x,0,x-width*.19,height*.8);beam.addColorStop(0,'rgba(246,220,167,0)');beam.addColorStop(.27,'rgba(246,220,167,.07)');beam.addColorStop(1,'rgba(246,220,167,0)');ctx.fillStyle=beam;ctx.globalAlpha=values.sun*(.65+i*.08);ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+width*.018,0);ctx.lineTo(x-width*.14,height*.82);ctx.lineTo(x-width*.32,height*.82);ctx.closePath();ctx.fill();
        }
        if(state.motion)for(const m of motes){const x=((m.x*width+time*(3+m.seed*3))%width),y=height*(.37+m.y*.40)+Math.sin(time*.28+m.seed*20)*14;ctx.globalAlpha=values.sun*(.1+.2*Math.sin(time*.8+m.seed*20)**2);ctx.fillStyle='#efd8a3';ctx.fillRect(x,y,1.2,1.2);}
      }
      // Separate, slowly advecting banks leave gaps around the peaks.
      for(let i=0;i<5;i++){
        const x=width*((i*.27+time*(.002+i*.0002)-state.camera/state.pageWidth*.018)%1.6-.28),y=height*(.48+(i%3)*.105)+Math.sin(time*.05+i)*height*.018;
        ctx.setTransform(dpr,0,0,dpr*.26,0,y*dpr*.74);
        const radius=width*(.19+i*.015),fog=ctx.createRadialGradient(x,y,0,x,y,radius);fog.addColorStop(0,'rgba(160,187,193,.14)');fog.addColorStop(.5,'rgba(124,155,168,.055)');fog.addColorStop(1,'rgba(124,155,168,0)');ctx.globalAlpha=(.10+values.fog*.8)*(i%2?.68:1);ctx.fillStyle=fog;ctx.fillRect(x-radius,y-radius,radius*2,radius*2);ctx.setTransform(dpr,0,0,dpr,0,0);
      }
    }
    function updateSurfaces(now){
      if(typeof getSurfaces!=='function')return;
      const key=[state.surfaceRevision,state.camera,width,height].join(':');
      if(key===surfaceKey||now-surfaceBuiltAt<100)return;
      const points=getSurfaces()||[];surfaces=points.filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<width&&p.y>=0&&p.y<height).slice(0,6000);
      surfaceKey=key;surfaceBuiltAt=now;surfaceBuilds++;
    }
    function contactFor(drop,index){
      if(!surfaces.length)return null;
      return surfaces[Math.min(surfaces.length-1,Math.floor(drop.seed*surfaces.length))];
    }
    function drawRain(){
      paintedDrops=paintedSplashes=0;contacts={};
      if(values.rain<.005||!state.motion)return;
      const time=elapsed/1000,count=budget(),wind=-42+Math.sin(time*.31)*18;
      ctx.strokeStyle='#c1dfef';ctx.lineCap='round';
      for(let layer=0;layer<3;layer++){
        ctx.globalAlpha=values.rain*(.28+layer*.12);ctx.lineWidth=.65+layer*.4;ctx.beginPath();
        for(let i=layer;i<count;i+=3){
          const drop=rain[i],hit=contactFor(drop,i),cycle=(time*drop.speed+drop.y)%1;
          if(cycle>=.76)continue;
          const travel=height*(.58+drop.x*.25),remaining=1-cycle/.76;
          const targetX=hit?hit.x:drop.x*width,targetY=hit?hit.y:height*1.12;
          const y=targetY-remaining*travel,x=targetX-remaining*wind;
          if(y<height*.09||y>height*.94)continue;
          const length=Math.min(drop.length*(.65+layer*.2),remaining*travel);
          ctx.moveTo(x-wind/travel*length,y-length);ctx.lineTo(x,y);paintedDrops++;
        }
        ctx.stroke();
      }
      // Ballistic droplets + flattened expanding rings, anchored to real surfaces.
      ctx.lineWidth=.8;ctx.strokeStyle='#c4e5ee';ctx.beginPath();
      for(let i=0;i<count;i++){
        const drop=rain[i],hit=contactFor(drop,i),cycle=(time*drop.speed+drop.y)%1;
        if(!hit||cycle<.76)continue;
        const t=(cycle-.76)/.24;if(t>.88)continue;
        const strength=(hit.light??1)*(.6+drop.depth*.2);
        if(strength<.2)continue;
        const r=(hit.kind==='water'?3.5:1.8)+t*(hit.kind==='water'?12:6),ry=r*.27;
        ctx.moveTo(hit.x-r,hit.y);ctx.lineTo(hit.x,hit.y-ry);ctx.lineTo(hit.x+r,hit.y);ctx.lineTo(hit.x,hit.y+ry);ctx.lineTo(hit.x-r,hit.y);
        const jump=Math.sin(t*Math.PI)*(hit.kind==='water'?9:6.5)*(1+drop.x),spread=2+t*8;
        if(t<.72)for(let side=-1;side<=1;side+=2){const x=hit.x+side*spread,y=hit.y-jump;ctx.moveTo(x,y);ctx.lineTo(x+side*.8,y+1.7);}
        paintedSplashes++;contacts[hit.kind]=(contacts[hit.kind]||0)+1;
      }
      ctx.globalAlpha=values.rain*.30;ctx.stroke();
    }
    function drawSnow(){
      paintedDrops=paintedSplashes=0;contacts={};if(values.snow<.005||!state.motion)return;
      const time=elapsed/1000,count=Math.round(budget()*.42);ctx.fillStyle='#e1eef3';
      for(let i=0;i<count;i++){
        const flake=rain[i],hit=contactFor(flake,i),fall=(time*flake.speed*.14+flake.y)%1;
        const targetY=hit?hit.y:height*1.1,travel=height*.8,y=targetY-(1-fall)*travel;
        const x=(hit?hit.x:flake.x*width)+Math.sin(time*.7+flake.sway)*(8+flake.depth*6)*(1-fall);
        if(y<0||y>height)continue;const size=1.1+flake.depth*.6;ctx.globalAlpha=values.snow*(.28+flake.depth*.17);ctx.fillRect(x,y,size,size);paintedDrops++;
        if(hit&&fall>.96){ctx.globalAlpha=values.snow*.32;ctx.fillRect(hit.x-2,hit.y,4,1);paintedSplashes++;contacts[hit.kind]=(contacts[hit.kind]||0)+1;}
      }
    }
    function render(nowMs=performance.now()){
      if(!drawable())return false;const started=performance.now();const now=Number.isFinite(nowMs)?nowMs:performance.now();
      if(state.motion){if(lastClock!==null&&now>lastClock)elapsed+=now-lastClock;lastClock=lastClock===null?now:Math.max(lastClock,now);}else lastClock=null;
      values=atmosphereAt(elapsed);values.snow=state.chapterIndex%3===2?values.rain:0;if(values.snow>0){values.rain=0;if(values.kind==='rain')values.kind='snow';}lastPaint=now;updateSurfaces(now);drawClouds();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);if(opacity>.001){drawAir();if(values.snow>.005)drawSnow();else drawRain();}ctx.globalAlpha=1;frames++;notification(now);renderMs=renderMs*.9+(performance.now()-started)*.1;
      if(renderMs>9){slowFrames++;fastFrames=0;}else{slowFrames=0;if(renderMs<4)fastFrames++;}
      if(slowFrames>18){quality=Math.max(.45,quality-.2);slowFrames=0;}if(fastFrames>180){quality=Math.min(1,quality+.1);fastFrames=0;}return true;
    }
    function setState(next={}){
      if(disposed)return;let dirty=false;for(const key of ['progress','camera','pageWidth','chapterIndex','surfaceRevision'])if(Number.isFinite(next[key])&&next[key]!==state[key]){state[key]=next[key];dirty=true;}
      state.progress=clamp(state.progress);state.pageWidth=Math.max(1,state.pageWidth);state.chapterIndex=Math.max(0,Math.floor(state.chapterIndex));const wasActive=state.active,wasMotion=state.motion;
      if(typeof next.active==='boolean')state.active=next.active;if(typeof next.motion==='boolean')state.motion=next.motion;dirty=dirty||wasActive!==state.active||wasMotion!==state.motion;updateOpacity();
      if(!animating()){stop();if(drawable()&&dirty)render(performance.now());}else{if(!wasActive||!wasMotion)lastClock=null;schedule();}
    }
    function resize(){if(disposed)return;const rect=host.getBoundingClientRect();width=Math.max(1,Math.round(rect.width||window.innerWidth||1));height=Math.max(1,Math.round(rect.height||window.innerHeight||1));dpr=clamp(window.devicePixelRatio||1,.75,1);for(const canvas of [cloudCanvas,rainCanvas]){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}if(drawable())render(performance.now());schedule();}
    function visibility(){if(document.hidden)stop();else{lastClock=null;if(drawable())render(performance.now());schedule();}}
    function dispose(){if(disposed)return;stop();disposed=true;window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);for(const sprite of cloudSprites)sprite.width=sprite.height=1;cloudCanvas.width=cloudCanvas.height=rainCanvas.width=rainCanvas.height=1;cloudCanvas.remove();rainCanvas.remove();host.style.cssText=originalStyle;notified=null;surfaces=[];}
    window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);resize();
    return Object.freeze({setState,render,resize,dispose,getState:()=>({phase:values.kind,values:{...values},cycleElapsed:elapsed,frames,drawing:Boolean(frame),active:state.active,motion:state.motion,opacity,width,height,dpr,particleCount:budget(),particleCapacity:rain.length,paintedDrops,paintedSplashes,contacts:{...contacts},surfaceCount:surfaces.length,surfaceBuilds,renderMs,quality,cloudGroups:groups.length,cloudCubes:groups.length*(quality<.7?18:36),cloudBuilds,cloudTextureBytes:cloudSprites.reduce((sum,c)=>sum+c.width*c.height*4,0),backend,disposed})});
  }
  window.InfiniteWorldWeather=Object.freeze({create});
})();
