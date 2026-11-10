/* Fine layered rain owns its clock; cached atmosphere and terrain stay idle. */
(() => {
  'use strict';
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
  const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
  const phases=[{kind:'clear',duration:32000,rain:0,cloud:.28,sun:1,fog:.08},{kind:'overcast',duration:30000,rain:0,cloud:.85,sun:.12,fog:.22},{kind:'rain',duration:36000,rain:1,cloud:1,sun:0,fog:.34},{kind:'mist',duration:28000,rain:0,cloud:.52,sun:.35,fog:.9}];
  const cycleDuration=126000,transitionDuration=8000,frameInterval=1000/60,airInterval=125;
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
    const cloudSprites=Array.from({length:7},()=>document.createElement('canvas'));
    const fogSprite=document.createElement('canvas');let cloudCacheKey='',cloudBuilds=0,airPaint=-Infinity,airFrames=0,airDirty=true,skyGradient=null;
    fogSprite.width=128;fogSprite.height=64;const fogPaint=fogSprite.getContext('2d'),fogGradient=fogPaint.createRadialGradient(64,32,0,64,32,64);
    fogGradient.addColorStop(0,'rgba(160,187,193,.14)');fogGradient.addColorStop(.5,'rgba(124,155,168,.055)');fogGradient.addColorStop(1,'rgba(124,155,168,0)');
    fogPaint.setTransform(1,0,0,.5,0,16);fogPaint.fillStyle=fogGradient;fogPaint.fillRect(0,-32,128,128);
    const state={progress:0,camera:0,pageWidth:1,chapterIndex:0,surfaceRevision:0,active:false,motion:true};
    let seed=0x6d2b79f5;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const rain=Array.from({length:260},(_,index)=>({x:random(),y:random(),speed:420+random()*190+(index%3)*175,length:11+random()*7+(index%3)*9,depth:index%3,sway:random()*6.28,seed:random(),hit:null,splash:-1}));
    const budget=()=>Math.round(clamp(width*height/6400,55,width<700?100:260)*quality);
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
    function tick(now){frame=0;if(!animating())return;const interval=values.rain>.005||values.snow>.005?frameInterval*(quality<.7?2:1):airInterval;if(now-lastPaint>=interval-.5)render(now);schedule();}
    function notification(now){
      if(typeof onChange!=='function'||now-lastNotification<500)return;if(notified&&notified.kind===values.kind&&['rain','cloud','sun','fog'].every(key=>Math.abs(notified[key]-values[key])<.01))return;
      lastNotification=now;notified={...values};onChange({...values});
    }
    function drawClouds(){
      const c=cloudContext,time=elapsed/1000,airDpr=dpr*.75,unit=clamp(width*.021,14,30),dark=clamp((values.cloud-.28)/.72);
      const cameraOffset=-Math.sin(state.camera/state.pageWidth*.08)*width*.025;
      c.setTransform(airDpr,0,0,airDpr,0,0);c.clearRect(0,0,width,height);if(opacity<.001)return;
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
      const c=cloudContext,time=elapsed/1000;
      // Only the quiet overcast tint and cached mist remain: no sunbeam polygons.
      c.globalAlpha=values.cloud*.55;c.fillStyle=skyGradient;c.fillRect(0,0,width,height*.65);
      for(let i=0;i<5;i++){
        const x=width*((i*.27+time*(.002+i*.0002)-state.camera/state.pageWidth*.018)%1.6-.28),y=height*(.48+(i%3)*.105)+Math.sin(time*.05+i)*height*.018,radius=width*(.19+i*.015);
        c.globalAlpha=(.10+values.fog*.8)*(i%2?.68:1);c.drawImage(fogSprite,x-radius,y-radius*.26,radius*2,radius*.52);
      }
      c.globalAlpha=1;
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
      const time=elapsed/1000,count=budget(),wind=.075+Math.sin(time*.16)*.018;
      ctx.lineCap='round';
      // Match the title screen's restrained fine streaks and three depth batches.
      for(let layer=0;layer<3;layer++){
        ctx.strokeStyle='#c1d5e0';ctx.globalAlpha=values.rain*(.14+layer*.085);ctx.lineWidth=.55+layer*.28;ctx.beginPath();
        for(let i=layer;i<count;i+=3){
          const drop=rain[i],hit=contactFor(drop,i),targetY=hit?hit.y:height+35,fallTime=(targetY+48)/drop.speed,age=(time+drop.y*3)%(fallTime+.32);
          drop.hit=hit;drop.splash=-1;
          if(age>=fallTime){if(hit)drop.splash=(age-fallTime)/.32;continue;}
          const y=-48+age*drop.speed,x=(hit?hit.x:drop.x*width)+(y-targetY)*wind;
          if(y<-drop.length||y>height+drop.length)continue;
          ctx.moveTo(x-wind*drop.length,y-drop.length);ctx.lineTo(x,y);paintedDrops++;
        }
        ctx.stroke();
      }
      // A few soft arcs and short spray trails follow contact, never diamond rings.
      // Three fading batches bound paint calls as well as the visible impact count.
      ctx.strokeStyle='#d0e5ed';ctx.lineWidth=.7;
      const splashLimit=width<700?10:24;
      for(let fade=0;fade<3;fade++){
        ctx.globalAlpha=values.rain*(.39-fade*.11);ctx.beginPath();
        for(let i=0;i<count&&paintedSplashes<splashLimit;i++){
          const drop=rain[i],hit=drop.hit,t=drop.splash;
          if(!hit||t<0||t>=.94||Math.floor(t*3)!==fade||(hit.light??1)<.2)continue;
          const water=hit.kind==='water',rx=water?2+t*9:1.2+t*4.5,ry=water?.55+t*1.8:.4+t*.8;
          ctx.moveTo(hit.x-rx,hit.y+.4);ctx.ellipse(hit.x,hit.y+.4,rx,ry,0,Math.PI,water?Math.PI*3:Math.PI*2);
          if(t<.62){const spread=.7+t*6,jump=Math.sin(t*Math.PI)*(water?6:4.5);for(let side=-1;side<=1;side+=2){const x=hit.x+side*spread,y=hit.y-jump;ctx.moveTo(x,y);ctx.lineTo(x-side*.55,y-1.2);}}
          paintedSplashes++;contacts[hit.kind]=(contacts[hit.kind]||0)+1;
        }
        ctx.stroke();
      }
    }
    function drawSnow(){
      paintedDrops=paintedSplashes=0;contacts={};if(values.snow<.005||!state.motion)return;
      const time=elapsed/1000,count=Math.round(budget()*.42);ctx.fillStyle='#e1eef3';
      for(let i=0;i<count;i++){
        const flake=rain[i],hit=contactFor(flake,i),fall=(time*(flake.speed/800)*.14+flake.y)%1;
        const targetY=hit?hit.y:height*1.1,travel=height*.8,y=targetY-(1-fall)*travel;
        const x=(hit?hit.x:flake.x*width)+Math.sin(time*.7+flake.sway)*(8+flake.depth*6)*(1-fall);
        if(y<0||y>height)continue;const size=1.1+flake.depth*.6;ctx.globalAlpha=values.snow*(.28+flake.depth*.17);ctx.fillRect(x,y,size,size);paintedDrops++;
        if(hit&&fall>.96){ctx.globalAlpha=values.snow*.32;ctx.fillRect(hit.x-2,hit.y,4,1);paintedSplashes++;contacts[hit.kind]=(contacts[hit.kind]||0)+1;}
      }
    }
    function render(nowMs=performance.now()){
      if(!drawable())return false;const started=performance.now();const now=Number.isFinite(nowMs)?nowMs:performance.now();
      if(state.motion){if(lastClock!==null&&now>lastClock)elapsed+=now-lastClock;lastClock=lastClock===null?now:Math.max(lastClock,now);}else lastClock=null;
      values=atmosphereAt(elapsed);values.snow=state.chapterIndex%3===2?values.rain:0;if(values.snow>0){values.rain=0;if(values.kind==='rain')values.kind='snow';}lastPaint=now;if(state.motion&&(values.rain>.005||values.snow>.005))updateSurfaces(now);
      if(airDirty||now-airPaint>=airInterval-.5){drawClouds();if(opacity>.001)drawAir();airPaint=now;airDirty=false;airFrames++;}
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);if(opacity>.001){if(values.snow>.005)drawSnow();else drawRain();}ctx.globalAlpha=1;frames++;notification(now);renderMs=renderMs*.9+(performance.now()-started)*.1;
      if(renderMs>9){slowFrames++;fastFrames=0;}else{slowFrames=0;if(renderMs<4)fastFrames++;}
      if(slowFrames>18){quality=Math.max(.45,quality-.2);slowFrames=0;}if(fastFrames>180){quality=Math.min(1,quality+.1);fastFrames=0;}return true;
    }
    function setState(next={}){
      if(disposed)return;let dirty=false;for(const key of ['progress','camera','pageWidth','chapterIndex','surfaceRevision'])if(Number.isFinite(next[key])&&next[key]!==state[key]){state[key]=next[key];dirty=true;}
      state.progress=clamp(state.progress);state.pageWidth=Math.max(1,state.pageWidth);state.chapterIndex=Math.max(0,Math.floor(state.chapterIndex));const wasActive=state.active,wasMotion=state.motion;
      if(typeof next.active==='boolean')state.active=next.active;if(typeof next.motion==='boolean')state.motion=next.motion;dirty=dirty||wasActive!==state.active||wasMotion!==state.motion;airDirty=airDirty||wasActive!==state.active;updateOpacity();
      if(!animating()){stop();if(drawable()&&dirty)render(performance.now());}else{if(!wasActive||!wasMotion)lastClock=null;schedule();}
    }
    function resize(){if(disposed)return;const rect=host.getBoundingClientRect();width=Math.max(1,Math.round(rect.width||window.innerWidth||1));height=Math.max(1,Math.round(rect.height||window.innerHeight||1));dpr=clamp(window.devicePixelRatio||1,.75,1);cloudCanvas.width=Math.round(width*dpr*.75);cloudCanvas.height=Math.round(height*dpr*.75);rainCanvas.width=Math.round(width*dpr);rainCanvas.height=Math.round(height*dpr);skyGradient=cloudContext.createLinearGradient(0,0,0,height*.65);skyGradient.addColorStop(0,'rgba(25,39,53,.22)');skyGradient.addColorStop(1,'rgba(51,65,76,0)');airDirty=true;if(drawable())render(performance.now());schedule();}
    function visibility(){if(document.hidden)stop();else{lastClock=null;if(drawable())render(performance.now());schedule();}}
    function dispose(){if(disposed)return;stop();disposed=true;window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);for(const sprite of [...cloudSprites,fogSprite])sprite.width=sprite.height=1;cloudCanvas.width=cloudCanvas.height=rainCanvas.width=rainCanvas.height=1;cloudCanvas.remove();rainCanvas.remove();host.style.cssText=originalStyle;notified=null;surfaces=[];}
    window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);resize();
    return Object.freeze({setState,render,resize,dispose,getState:()=>({phase:values.kind,values:{...values},cycleElapsed:elapsed,frames,drawing:Boolean(frame),active:state.active,motion:state.motion,opacity,width,height,dpr,airFrames,particleCount:budget(),particleCapacity:rain.length,paintedDrops,paintedSplashes,contacts:{...contacts},surfaceCount:surfaces.length,surfaceBuilds,renderMs,quality,cloudGroups:groups.length,cloudCubes:groups.length*(quality<.7?18:36),cloudBuilds,cloudTextureBytes:cloudSprites.reduce((sum,c)=>sum+c.width*c.height*4,0),backend,disposed})});
  }
  window.InfiniteWorldWeather=Object.freeze({create});
})();
