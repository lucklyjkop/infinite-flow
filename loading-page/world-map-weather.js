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
  const vertexSource=`
    precision highp float;
    attribute vec3 aVertex;attribute vec3 aNormal;attribute vec4 aCell;attribute vec4 aGroup;
    uniform vec2 uViewport;uniform float uTime;uniform float uCamera;uniform vec4 uWeather;
    varying vec3 vColor;varying float vAlpha;
    void main(){
      float unit=clamp(uViewport.x*.021,14.,30.);
      float spread=.96+.055*sin(uTime*.085+aGroup.w*6.28);
      float thickness=.67+uWeather.y*.32+uWeather.x*.19;
      vec3 center=aCell.xyz*vec3(spread,thickness,spread)*unit;
      float size=.88+.10*fract(aCell.w*7.13);
      vec3 p=center+aVertex*unit*size;
      float span=uViewport.x+unit*12.;
      float x=mod(aGroup.x*span+uTime*aGroup.z+uCamera,span)-unit*6.;
      float y=uViewport.y*aGroup.y+sin(uTime*.045+aGroup.w*6.28)*uViewport.y*.008;
      vec2 projected=vec2(p.x+p.z*.65,-p.y*.8+p.z*.35);
      gl_Position=vec4((vec2(x,y)+projected)/uViewport*vec2(2.,-2.)+vec2(-1.,1.),dot(p,vec3(.52,-.35,-.8))/(unit*22.)+aGroup.w*.015,1.);
      float lighting=.73+.32*max(0.,dot(aNormal,normalize(vec3(-.45,.85,.65))));
      vec3 albedo=mix(vec3(.51,.56,.57),vec3(.235,.285,.32),clamp((uWeather.y-.28)/.72,0.,1.));
      albedo+=vec3(.035,.022,.005)*uWeather.z;
      vColor=albedo*lighting*(.91+aCell.w*.15);
      vAlpha=.27+uWeather.y*.13+uWeather.x*.04;
    }`;
  const fragmentSource=`precision mediump float;varying vec3 vColor;varying float vAlpha;void main(){gl_FragColor=vec4(vColor*vAlpha,vAlpha);}`;
  function cubeVertices(){
    const faces=[[[1,0,0],[[.5,-.5,-.5],[.5,.5,-.5],[.5,.5,.5],[.5,-.5,.5]]],[[-1,0,0],[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]],[[0,1,0],[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]],[[0,-1,0],[[-.5,-.5,.5],[-.5,-.5,-.5],[.5,-.5,-.5],[.5,-.5,.5]]],[[0,0,1],[[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]]],[[0,0,-1],[[-.5,-.5,-.5],[-.5,.5,-.5],[.5,.5,-.5],[.5,-.5,-.5]]]];
    return new Float32Array(faces.flatMap(([normal,points])=>[0,1,2,0,2,3].flatMap(index=>[...points[index],...normal])));
  }
  function create(host,{onChange}={}){
    if(!host?.appendChild)throw new TypeError('Weather requires a host element.');
    const originalStyle=host.style.cssText;host.setAttribute('aria-hidden','true');Object.assign(host.style,{position:'absolute',inset:'0',pointerEvents:'none',overflow:'hidden',zIndex:'4',opacity:'0',contain:'strict'});
    const makeCanvas=z=>{const c=document.createElement('canvas');Object.assign(c.style,{position:'absolute',inset:'0',display:'block',width:'100%',height:'100%',pointerEvents:'none',zIndex:String(z)});host.appendChild(c);return c;};
    let cloudCanvas=makeCanvas(0);const rainCanvas=makeCanvas(1),ctx=rainCanvas.getContext('2d',{alpha:true,desynchronized:true});
    if(!ctx)throw new Error('Weather canvas is unavailable.');
    let disposed=false,frame=0,frames=0,width=1,height=1,dpr=1,elapsed=0,lastClock=null,lastPaint=-Infinity,lastNotification=-Infinity,values=atmosphereAt(0),notified=null,opacity=0;
    let backend='canvas2d',cloudContext=null,gl=null,program=null,instancing=null,uniforms=null,buffers=[];
    const state={progress:0,camera:0,pageWidth:1,chapterIndex:0,active:false,motion:true};
    let seed=0x6d2b79f5;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const rain=Array.from({length:90},(_,index)=>({x:random(),y:random(),speed:68+random()*110,length:7+random()*14,depth:index%3,sway:random()*6.28}));
    const groups=Array.from({length:5},(_,i)=>({x:.13+i*.205,y:[.105,.185,.075,.16,.095][i],speed:1.4+random()*2.2,seed:random(),cells:[]}));
    const instances=[];
    for(const group of groups){
      const candidates=[];for(let x=-3;x<=3;x++)for(let y=-1;y<=1;y++)for(let z=-2;z<=2;z++){const score=x*x/10+y*y/2+z*z/4+random()*.65;candidates.push({x,y,z,seed:random(),score});}
      // Build and order bounded fallback geometry once, never in the frame loop.
      group.cells=candidates.sort((a,b)=>a.score-b.score).slice(0,36).sort((a,b)=>(b.x*.52-b.y*.35-b.z*.8)-(a.x*.52-a.y*.35-a.z*.8));
      for(const cell of group.cells)instances.push(cell.x,cell.y,cell.z,cell.seed,group.x,group.y,group.speed,group.seed);
    }
    function releaseGL(){if(gl){for(const buffer of buffers)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);}buffers=[];program=null;gl=null;instancing=null;uniforms=null;}
    function useFallback(){
      releaseGL();cloudCanvas.removeEventListener('webglcontextlost',contextLost);cloudCanvas.width=cloudCanvas.height=1;cloudCanvas.remove();cloudCanvas=makeCanvas(0);cloudContext=cloudCanvas.getContext('2d',{alpha:true,desynchronized:true});backend='canvas2d';cloudCanvas.width=Math.round(width*dpr);cloudCanvas.height=Math.round(height*dpr);
    }
    function setupGL(){
      try{
        gl=cloudCanvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:true,depth:true,stencil:false,preserveDrawingBuffer:false,powerPreference:'low-power'});
        if(!gl)throw new Error('No WebGL');instancing=gl.getExtension('ANGLE_instanced_arrays');if(!instancing)throw new Error('No instancing');
        const shaders=[];
        try{for(const [type,source]of [[gl.VERTEX_SHADER,vertexSource],[gl.FRAGMENT_SHADER,fragmentSource]]){const shader=gl.createShader(type);shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(shader)||'Cloud shader failed');}program=gl.createProgram();for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('Cloud shader link failed');}finally{for(const shader of shaders)gl.deleteShader(shader);}
        gl.useProgram(program);
        const geometry=gl.createBuffer();buffers.push(geometry);gl.bindBuffer(gl.ARRAY_BUFFER,geometry);gl.bufferData(gl.ARRAY_BUFFER,cubeVertices(),gl.STATIC_DRAW);
        for(const [name,offset]of [['aVertex',0],['aNormal',12]]){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,24,offset);}
        const instanceBuffer=gl.createBuffer();buffers.push(instanceBuffer);gl.bindBuffer(gl.ARRAY_BUFFER,instanceBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(instances),gl.STATIC_DRAW);
        for(const [name,offset]of [['aCell',0],['aGroup',16]]){const location=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,4,gl.FLOAT,false,32,offset);instancing.vertexAttribDivisorANGLE(location,1);}
        uniforms=Object.fromEntries(['uViewport','uTime','uCamera','uWeather'].map(name=>[name,gl.getUniformLocation(program,name)]));gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.clearColor(0,0,0,0);backend='webgl';cloudCanvas.addEventListener('webglcontextlost',contextLost);
      }catch{useFallback();}
    }
    function contextLost(event){event.preventDefault();useFallback();if(drawable())render(performance.now());}
    const drawable=()=>!disposed&&state.active&&!document.hidden,animating=()=>drawable()&&state.motion;
    function updateOpacity(){opacity=state.active?smooth((state.progress-.24)/.61):0;host.style.opacity=opacity.toFixed(4);}
    function stop(){if(frame)cancelAnimationFrame(frame);frame=0;lastClock=null;}
    function schedule(){if(!frame&&animating())frame=requestAnimationFrame(tick);}
    function tick(now){frame=0;if(!animating())return;if(now-lastPaint>=frameInterval-.5)render(now);schedule();}
    function notification(now){
      if(typeof onChange!=='function'||now-lastNotification<500)return;if(notified&&notified.kind===values.kind&&['rain','cloud','sun','fog'].every(key=>Math.abs(notified[key]-values[key])<.01))return;
      lastNotification=now;notified={...values};onChange({...values});
    }
    function drawClouds(){
      const time=elapsed/1000,cameraOffset=-Math.sin(state.camera/state.pageWidth*.08)*width*.025;
      if(gl){gl.viewport(0,0,cloudCanvas.width,cloudCanvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);if(opacity<.001)return;gl.useProgram(program);gl.uniform2f(uniforms.uViewport,width,height);gl.uniform1f(uniforms.uTime,time);gl.uniform1f(uniforms.uCamera,cameraOffset);gl.uniform4f(uniforms.uWeather,values.rain,values.cloud,values.sun,values.fog);instancing.drawArraysInstancedANGLE(gl.TRIANGLES,0,36,180);return;}
      const c=cloudContext;if(!c)return;c.setTransform(dpr,0,0,dpr,0,0);c.clearRect(0,0,width,height);if(opacity<.001)return;
      const unit=clamp(width*.021,14,30),dark=clamp((values.cloud-.28)/.72),base=[130-70*dark,143-70*dark,145-63*dark],thickness=.67+values.cloud*.32+values.rain*.19;
      c.globalAlpha=.27+values.cloud*.13+values.rain*.04;
      const faces=[{shade:1.06,points:[[-.5,.5,-.5],[-.5,.5,.5],[.5,.5,.5],[.5,.5,-.5]]},{shade:.79,points:[[-.5,-.5,.5],[-.5,.5,.5],[-.5,.5,-.5],[-.5,-.5,-.5]]},{shade:.91,points:[[.5,-.5,.5],[.5,.5,.5],[-.5,.5,.5],[-.5,-.5,.5]]}];
      for(const group of groups){
        const span=width+unit*12,cx=((group.x*span+time*group.speed+cameraOffset)%span+span)%span-unit*6,cy=height*group.y+Math.sin(time*.045+group.seed*6.28)*height*.008,spread=.96+.055*Math.sin(time*.085+group.seed*6.28);
        for(let i=0;i<group.cells.length;i+=2){const cell=group.cells[i],size=unit*(.88+.1*((cell.seed*7.13)%1)),x=cell.x*spread*unit,y=cell.y*thickness*unit,z=cell.z*spread*unit;
          for(const face of faces){c.fillStyle='rgb('+base.map(v=>Math.round(v*face.shade*(.91+cell.seed*.15))).join(',')+')';c.beginPath();face.points.forEach((p,j)=>{const px=cx+x+p[0]*size+(z+p[2]*size)*.65,py=cy-(y+p[1]*size)*.8+(z+p[2]*size)*.35;if(j)c.lineTo(px,py);else c.moveTo(px,py);});c.closePath();c.fill();}
        }
      }
      c.globalAlpha=1;
    }
    function drawAir(){
      const sky=ctx.createLinearGradient(0,0,0,height*.40);sky.addColorStop(0,'rgba(74,89,103,.10)');sky.addColorStop(.55,'rgba(57,70,78,.025)');sky.addColorStop(1,'rgba(39,49,56,0)');ctx.globalAlpha=.3+values.cloud*.4;ctx.fillStyle=sky;ctx.fillRect(0,0,width,height*.40);
      if(values.sun>.01){const glow=ctx.createRadialGradient(width*.72,height*.08,0,width*.72,height*.08,width*.59);glow.addColorStop(0,'rgba(190,162,113,.065)');glow.addColorStop(.55,'rgba(151,139,111,.018)');glow.addColorStop(1,'rgba(151,139,111,0)');ctx.globalAlpha=values.sun;ctx.fillStyle=glow;ctx.fillRect(0,0,width,height*.45);}
      const center=height*(.49+Math.sin(elapsed/1000*.014)*.012),fog=ctx.createLinearGradient(0,center-height*.065,0,center+height*.075);fog.addColorStop(0,'rgba(120,137,140,0)');fog.addColorStop(.48,'rgba(120,137,140,.065)');fog.addColorStop(1,'rgba(120,137,140,0)');ctx.globalAlpha=.1+values.fog*.8;ctx.fillStyle=fog;ctx.fillRect(0,center-height*.065,width,height*.14);
    }
    function drawRain(){
      if(values.rain<.005||!state.motion)return;const time=elapsed/1000;ctx.strokeStyle='#adbdc4';ctx.lineCap='round';
      for(const drop of rain){const depth=.45+drop.depth*.27,y=((drop.y*height+time*drop.speed*depth)%(height*1.12))-height*.06,normalized=y/height,edge=smooth((normalized-.10)/.15)*(1-smooth((normalized-.78)/.17));if(edge<.01)continue;
        const x=((drop.x*width-time*10*depth+Math.sin(time*.15+drop.sway)*6)%width+width)%width;ctx.globalAlpha=values.rain*edge*(.11+drop.depth*.035);ctx.lineWidth=.42+drop.depth*.2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-1.5*depth,y+drop.length*depth);ctx.stroke();}
    }
    function render(nowMs=performance.now()){
      if(!drawable())return false;const now=Number.isFinite(nowMs)?nowMs:performance.now();
      if(state.motion){if(lastClock!==null&&now>lastClock)elapsed+=now-lastClock;lastClock=lastClock===null?now:Math.max(lastClock,now);}else lastClock=null;
      values=atmosphereAt(elapsed);lastPaint=now;drawClouds();ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);if(opacity>.001){drawAir();drawRain();}ctx.globalAlpha=1;frames++;notification(now);return true;
    }
    function setState(next={}){
      if(disposed)return;let dirty=false;for(const key of ['progress','camera','pageWidth','chapterIndex'])if(Number.isFinite(next[key])&&next[key]!==state[key]){state[key]=next[key];dirty=true;}
      state.progress=clamp(state.progress);state.pageWidth=Math.max(1,state.pageWidth);state.chapterIndex=Math.max(0,Math.floor(state.chapterIndex));const wasActive=state.active,wasMotion=state.motion;
      if(typeof next.active==='boolean')state.active=next.active;if(typeof next.motion==='boolean')state.motion=next.motion;dirty=dirty||wasActive!==state.active||wasMotion!==state.motion;updateOpacity();
      if(!animating()){stop();if(drawable()&&dirty)render(performance.now());}else{if(!wasActive||!wasMotion)lastClock=null;schedule();}
    }
    function resize(){if(disposed)return;const rect=host.getBoundingClientRect();width=Math.max(1,Math.round(rect.width||window.innerWidth||1));height=Math.max(1,Math.round(rect.height||window.innerHeight||1));dpr=clamp(window.devicePixelRatio||1,.75,1);for(const canvas of [cloudCanvas,rainCanvas]){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}if(drawable())render(performance.now());schedule();}
    function visibility(){if(document.hidden)stop();else{lastClock=null;if(drawable())render(performance.now());schedule();}}
    function dispose(){if(disposed)return;stop();disposed=true;window.removeEventListener('resize',resize);document.removeEventListener('visibilitychange',visibility);cloudCanvas.removeEventListener('webglcontextlost',contextLost);releaseGL();cloudCanvas.width=cloudCanvas.height=rainCanvas.width=rainCanvas.height=1;cloudCanvas.remove();rainCanvas.remove();host.style.cssText=originalStyle;notified=null;cloudContext=null;}
    setupGL();window.addEventListener('resize',resize);document.addEventListener('visibilitychange',visibility);resize();
    return Object.freeze({setState,render,resize,dispose,getState:()=>({phase:values.kind,values:{...values},cycleElapsed:elapsed,frames,drawing:Boolean(frame),active:state.active,motion:state.motion,opacity,width,height,dpr,particleCount:rain.length,cloudGroups:groups.length,cloudCubes:backend==='webgl'?180:90,backend,disposed})});
  }
  window.InfiniteWorldWeather=Object.freeze({create});
})();
