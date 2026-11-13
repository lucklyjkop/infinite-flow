/* Liquid covenant constellation. Generated materials flow in an offscreen GPU
   atlas; DOM plaques and image-generated silk tethers stay independently legible. */
(() => {
  'use strict';
  const BRANCHES = Object.freeze({
    insight:['insight','listen','discern','night'],
    ward:['ward','resolve','renew','steadfast'],
    crossing:['crossing','path','bond','home'],
  });
  const IDS = ['root', ...Object.values(BRANCHES).flat()];
  const PARENTS = new Map();
  for (const chain of Object.values(BRANCHES)) chain.forEach((id,i) => PARENTS.set(id,i ? chain[i-1] : 'root'));
  const clamp = (x,a=0,b=1) => Math.max(a,Math.min(b,x));
  const mix = (a,b,t) => a+(b-a)*t;
  const ease = t => 1-Math.pow(1-clamp(t),3);
  const noise = seed => { const value=Math.sin(seed*127.13+19.71)*43758.5453;return value-Math.floor(value); };
  function curvePoint(points,t) {
    const s=1-t;
    return {x:s*s*s*points[0].x+3*s*s*t*points[1].x+3*s*t*t*points[2].x+t*t*t*points[3].x,
      y:s*s*s*points[0].y+3*s*s*t*points[1].y+3*s*t*t*points[2].y+t*t*t*points[3].y};
  }
  function createLiquidAtlas(ready) {
    const atlas=document.createElement('canvas');atlas.width=1536;atlas.height=1024;
    const textureImage=new Image();let gl=null,program=null,texture=null,buffer=null,uniforms=null,loaded=false,lost=false,error=null,disposed=false,flowTime=0;
    const vertexSource='attribute vec2 aPosition;varying vec2 vUv;void main(){vUv=aPosition*.5+.5;gl_Position=vec4(aPosition,0.,1.);}';
    const fragmentSource=`precision highp float;
      varying vec2 vUv;uniform sampler2D uTexture;uniform float uTime;uniform float uPhase;uniform float uEnergy;
      void main(){
        float t=uTime*.64+uPhase;vec2 p=(vUv-.5)*1.19;
        // Independent low/high-frequency flow advects the photograph and its alpha contour together.
        float radius=length(p),twist=.020*sin(radius*12.-t*.57)+.013*sin(p.y*8.+t*.41);
        mat2 turn=mat2(cos(twist),-sin(twist),sin(twist),cos(twist));p=turn*p;
        vec2 curl=vec2(sin(p.y*9.7+t*.76+sin(p.x*5.1-t*.37)),cos(p.x*10.8-t*.61+sin(p.y*6.4+t*.49)));
        vec2 folds=vec2(sin((p.x+p.y)*18.-t*1.07),cos((p.x-p.y)*15.+t*.83));
        vec2 uv=p+.5+curl*.018+folds*.005;
        uv+=vec2(sin(p.x*7.+t*.93)*cos(p.y*8.-t*.42),cos(p.x*9.-t*.72)*sin(p.y*6.+t*.65))*.006;
        vec4 material=texture2D(uTexture,uv);
        float inside=step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);material.a*=inside;
        float luminance=dot(material.rgb,vec3(.2126,.7152,.0722));
        float reflection=(sin(p.x*12.+p.y*8.-t*.79)+sin(p.y*13.-p.x*5.+t*.47))*.045;
        vec3 color=material.rgb*(1.+reflection*smoothstep(.04,.55,luminance));
        color=mix(vec3(luminance),color,.34+.66*uEnergy)*(.67+.33*uEnergy);
        gl_FragColor=vec4(color*material.a,material.a);
      }`;
    function shader(type,source){const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(value)||'Liquid shader');return value;}
    function setup(){
      if(disposed||(loaded&&!lost&&program))return;
      try{
        gl=gl||atlas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,powerPreference:'low-power'});
        if(!gl){loaded=true;error='webgl-unavailable';ready();return;}
        const vertex=shader(gl.VERTEX_SHADER,vertexSource),fragment=shader(gl.FRAGMENT_SHADER,fragmentSource);program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);gl.deleteShader(vertex);gl.deleteShader(fragment);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program)||'Liquid program');
        gl.useProgram(program);buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);const position=gl.getAttribLocation(program,'aPosition');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
        texture=gl.createTexture();gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,textureImage);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        uniforms={time:gl.getUniformLocation(program,'uTime'),phase:gl.getUniformLocation(program,'uPhase'),energy:gl.getUniformLocation(program,'uEnergy')};gl.uniform1i(gl.getUniformLocation(program,'uTexture'),0);gl.disable(gl.BLEND);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);loaded=true;lost=false;error=null;ready();
      }catch(failure){error=String(failure.message||failure);loaded=true;program=null;ready();}
    }
    function tile(index){return index===0?{x:0,y:0,size:768}:{x:768+(index-1)%3*256,y:Math.floor((index-1)/3)*256,size:256};}
    textureImage.onload=setup;textureImage.onerror=()=>{loaded=false;error='liquid-texture-unavailable';ready();};textureImage.src='assets/covenant/liquid-core.png';
    if(textureImage.complete&&textureImage.naturalWidth)setup();
    function contextLost(event){event.preventDefault();lost=true;ready();}
    function contextRestored(){program=null;setup();}
    atlas.addEventListener('webglcontextlost',contextLost);atlas.addEventListener('webglcontextrestored',contextRestored);
    return {
      render(nodes,time,status){
        flowTime=time;if(!loaded||!gl||!program||lost||disposed)return;
        gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);gl.uniform1f(uniforms.time,time);
        for(const node of nodes){if(node.opacity<.02||node.r<2)continue;const at=tile(node.index),kind=status(node.id);gl.viewport(at.x,atlas.height-at.y-at.size,at.size,at.size);gl.uniform1f(uniforms.phase,node.index*.61);gl.uniform1f(uniforms.energy,kind==='unlocked'?1:kind==='available'?.7:.22);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);}
      },
      draw(ctx,node,x,y,size){
        if(!loaded||!textureImage.naturalWidth||disposed)return;
        if(gl&&program&&!lost){const at=tile(node.index);ctx.drawImage(atlas,at.x,at.y,at.size,at.size,x-size/2,y-size/2,size,size);}else{
          // Unsupported/lost WebGL keeps the generated material, with inexpensive narrow-band advection.
          const inner=size/1.19,rows=48,height=inner/rows,sourceHeight=textureImage.naturalHeight/rows;
          for(let row=0;row<rows;row++){const shift=Math.sin(row*.14+flowTime*.48+node.index*.61)*inner*.007;ctx.drawImage(textureImage,0,row*sourceHeight,textureImage.naturalWidth,sourceHeight,x-inner/2+shift,y-inner/2+row*height,inner,height+.18);}
        }
      },
      getState:()=>({ready:loaded,mode:gl&&program&&!lost?'webgl-flow':'image-fallback',error,lost}),
      dispose(){disposed=true;textureImage.onload=textureImage.onerror=null;atlas.removeEventListener('webglcontextlost',contextLost);atlas.removeEventListener('webglcontextrestored',contextRestored);if(gl&&!lost){if(texture)gl.deleteTexture(texture);if(buffer)gl.deleteBuffer(buffer);if(program)gl.deleteProgram(program);gl.getExtension('WEBGL_lose_context')?.loseContext();}}
    };
  }
  function create(canvas,{onNodeClick,onNodeHover,onLayout}={}) {
    if(!canvas?.getContext) throw new TypeError('A covenant canvas is required.');
    const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
    if(!ctx) throw new Error('The covenant scene could not initialize.');
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const state={selected:'root',branch:null,unlocked:new Set(['root']),motion:true};
    const nodes=IDS.map((id,index)=>({id,index,x:0,y:0,r:0,opacity:0,target:null,from:null}));
    const byId=new Map(nodes.map(node=>[node.id,node]));
    const dust=Array.from({length:22},(_,i)=>({x:noise(i+80),y:noise(i+170),size:.5+noise(i+220)*.9,phase:noise(i+270)*Math.PI*2}));
    let width=0,height=0,dpr=1,wanted=false,disposed=false,frame=0,lastTick=0,lastPaint=0,clock=0,transitionAt=0,transitioning=false;
    let pointer={x:0,y:0},aim={x:0,y:0},hovered=null,lastLayout='',lastLayoutAt=0,layout=[];
    let threadReady=false,threadStrip=null,quietThread=null;
    const glowSprites=new Map();
    const thread=new Image();
    thread.src='assets/covenant/thread.png';
    function prepareThread(){
      threadReady=Boolean(thread.naturalWidth);if(!threadReady)return;
      threadStrip=document.createElement('canvas');threadStrip.width=thread.naturalWidth;threadStrip.height=60;
      threadStrip.getContext('2d').drawImage(thread,0,Math.round(thread.naturalHeight*332/724),thread.naturalWidth,Math.round(thread.naturalHeight*60/724),0,0,threadStrip.width,60);
      quietThread=document.createElement('canvas');quietThread.width=threadStrip.width;quietThread.height=60;
      const quiet=quietThread.getContext('2d');quiet.filter='grayscale(1) sepia(.35) brightness(1.8)';quiet.drawImage(threadStrip,0,0);request();
    }
    thread.onload=prepareThread;
    thread.onerror=()=>{threadReady=false;request();};
    if(thread.complete&&thread.naturalWidth) prepareThread();
    const liquid=createLiquidAtlas(()=>request());
    const moves=()=>state.motion&&!media.matches;
    function statusOf(id) { return state.unlocked.has(id) ? 'unlocked' : state.unlocked.has(PARENTS.get(id)) ? 'available' : 'locked'; }
    function targets(animate=moves()&&wanted) {
      if(!width||!height) return;
      const compact=width<540;
      const radius=clamp(Math.min(width*(compact?.17:.15),height*.27),compact?35:48,compact?82:185);
      const overview={root:[.44,.47,1,1],insight:[.16,.23,.34,1],ward:[.81,.29,.38,1],crossing:[.67,.79,.35,1]};
      if(compact) Object.assign(overview,{root:[.49,.48,1,1],insight:[.19,.22,.47,1],ward:[.80,.26,.47,1],crossing:[.51,.81,.46,1]});
      const positions={};
      for(const id of IDS) {
        const branch=Object.keys(BRANCHES).find(key=>BRANCHES[key].includes(id));
        positions[id]=overview[id] || [...overview[branch].slice(0,2),.1,0];
      }
      if(state.branch) {
        positions.root=[.10,.55,.50,1];
        const line=compact?[[.29,.31],[.49,.58],[.70,.30],[.89,.54]]:[[.29,.43],[.49,.22],[.69,.53],[.88,.26]];
        BRANCHES[state.branch].forEach((id,i)=>{positions[id]=[...line[i],i===0?.32:.25,1];});
        Object.keys(BRANCHES).filter(key=>key!==state.branch).forEach((key,i)=>{positions[key]=[.09,i?.86:.15,.2,.13];});
      }
      nodes.forEach(node=>{
        const [x,y,r,opacity]=positions[node.id];
        node.from={x:node.x,y:node.y,r:node.r,opacity:node.opacity};
        node.target={x:x*width,y:y*height,r:radius*r,opacity};
        if(!animate||!node.r) Object.assign(node,node.target);
      });
      transitionAt=performance.now();transitioning=Boolean(animate);lastLayout='';request();
    }
    function resize() {
      if(disposed) return;
      const box=canvas.getBoundingClientRect();
      const nextWidth=Math.round(box.width),nextHeight=Math.round(box.height);
      if(!nextWidth||!nextHeight) return;
      const nextDpr=Math.min(devicePixelRatio||1,nextWidth<540?1.5:2);
      if(nextWidth===width&&nextHeight===height&&nextDpr===dpr) return;
      width=nextWidth;height=nextHeight;dpr=nextDpr;
      canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);
      ctx.setTransform(dpr,0,0,dpr,0,0);targets(false);
    }
    function glow(x,y,r,color,opacity=1) {
      if(r<.5||opacity<=0)return;
      let sprite=glowSprites.get(color);
      if(!sprite){sprite=document.createElement('canvas');sprite.width=sprite.height=128;const paint=sprite.getContext('2d'),gradient=paint.createRadialGradient(64,64,0,64,64,64);gradient.addColorStop(0,color.replace('ALPHA','1'));gradient.addColorStop(.1,color.replace('ALPHA','.68'));gradient.addColorStop(.34,color.replace('ALPHA','.16'));gradient.addColorStop(1,color.replace('ALPHA','0'));paint.fillStyle=gradient;paint.fillRect(0,0,128,128);glowSprites.set(color,sprite);}
      const alpha=ctx.globalAlpha;ctx.globalAlpha=alpha*clamp(opacity);ctx.drawImage(sprite,x-r,y-r,r*2,r*2);ctx.globalAlpha=alpha;
    }
    function screenNode(node) {
      const depth=node.id==='root'?1:.52;
      return {x:node.x+pointer.x*depth,y:node.y+pointer.y*depth,r:node.r,opacity:node.opacity};
    }
    function drawThread(parent,node) {
      if(!threadReady||node.opacity<.02) return;
      const a=screenNode(parent),b=screenNode(node),distance=Math.hypot(b.x-a.x,b.y-a.y);
      if(distance<12) return;
      const bend=clamp(distance*.2,18,95)*(node.index%2?-1:1);
      const points=[a,{x:mix(a.x,b.x,.36),y:mix(a.y,b.y,.25)+bend},{x:mix(a.x,b.x,.67),y:mix(a.y,b.y,.7)-bend*.35},b];
      const available=statusOf(node.id)!=='locked',active=state.selected===node.id||statusOf(node.id)==='unlocked';
      ctx.save();ctx.globalAlpha=node.opacity*(active?.72:available?.46:.25);
      const source=active?threadStrip:quietThread;
      const count=Math.max(8,Math.min(28,Math.ceil(distance/20))),stripHeight=active?1.6:1.2;
      let previous=curvePoint(points,0);
      for(let i=1;i<=count;i++) {
        const point=curvePoint(points,i/count),dx=point.x-previous.x,dy=point.y-previous.y,length=Math.hypot(dx,dy);
        ctx.save();ctx.translate(previous.x,previous.y);ctx.rotate(Math.atan2(dy,dx));
        ctx.drawImage(source,(i-1)*source.width/count,0,source.width/count,60,-.4,-stripHeight/2,length+.8,stripHeight);
        ctx.restore();previous=point;
      }
      ctx.restore();
      if(available&&moves()) {
        const t=(clock*.17+node.index*.23)%1,p=curvePoint(points,t);
        glow(p.x,p.y,6,'rgba(245,180,106,ALPHA)',.5*node.opacity);
        ctx.fillStyle='rgba(255,221,169,'+(.65*node.opacity)+')';ctx.beginPath();ctx.arc(p.x,p.y,.8,0,Math.PI*2);ctx.fill();
      }
    }
    function drawOrb(node) {
      if(node.opacity<.02||node.r<2)return;
      const at=screenNode(node),root=node.id==='root',kind=statusOf(node.id),strength=kind==='unlocked'?1:kind==='available'?.7:.22;
      ctx.save();ctx.globalAlpha=node.opacity;
      if(root)glow(at.x,at.y,at.r*1.5,'rgba(150,153,141,ALPHA)',.06);
      if(state.selected===node.id||hovered===node.id)glow(at.x,at.y+at.r*.12,at.r*1.2,'rgba(174,109,44,ALPHA)',strength*.08);
      // Small lights sit behind the material: only real alpha holes expose them.
      for(let core=0;core<2;core++){
        const phase=clock*.82+node.index*.7+core*2.3,pulse=.8+.2*Math.sin(phase),x=at.x+at.r*(core?-.12:.13),y=at.y+at.r*(core?-.11:.12);
        const lightStrength=strength*(root?1:.58);
        glow(x,y,at.r*(core?.22:.29),'rgba(241,173,72,ALPHA)',lightStrength*pulse*(core?.24:.34));
        const count=root?7:3;
        for(let i=0;i<count;i++){const angle=i*2.399+clock*.17,radius=at.r*(.025+.075*noise(i+core*13)),px=x+Math.cos(angle)*radius,py=y+Math.sin(angle)*radius;ctx.fillStyle=`rgba(253,215,139,${lightStrength*pulse*(.3+noise(i+6)*.35)})`;ctx.fillRect(px,py,root?.85:.6,root?.85:.6);}
      }
      // One photographic liquid material is advected per node in a shared GPU atlas.
      // The alpha is warped as well, so pores, wet rims and the silhouette flow non-rigidly.
      liquid.draw(ctx,node,at.x,at.y,at.r*2.45);
      if(root){for(let i=0;i<20;i++){const angle=i*2.399+clock*.025,rad=1.2+noise(i+427)*.3,x=at.x+Math.cos(angle)*at.r*rad,y=at.y+Math.sin(angle)*at.r*rad*.86,alpha=.12+.25*(.5+.5*Math.sin(clock*.7+i));glow(x,y,3,'rgba(216,217,187,ALPHA)',alpha*.55);ctx.fillStyle=`rgba(218,218,188,${alpha})`;ctx.fillRect(x,y,.8,.8);}}
      ctx.restore();
    }
    function publish(now,force=false) {
      if(!force&&now-lastLayoutAt<45) return;
      const value=nodes.map(node=>({...screenNode(node),id:node.id,visible:node.opacity>.3,status:statusOf(node.id)}));
      const stamp=value.map(n=>n.id+':'+Math.round(n.x*2)+','+Math.round(n.y*2)+','+Math.round(n.r)+','+Math.round(n.opacity*20)+','+n.status).join('|');
      if(stamp===lastLayout&&!force) return;
      lastLayout=stamp;lastLayoutAt=now;layout=value;
      if(typeof onLayout==='function') onLayout(value);
    }
    function draw(now) {
      liquid.render(nodes,clock,statusOf);
      ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      for(let i=0;i<dust.length;i++) {
        const particle=dust[i],x=particle.x*width+Math.sin(clock*.13+particle.phase)*6,y=particle.y*height+Math.cos(clock*.1+particle.phase)*4;
        ctx.fillStyle='rgba(193,161,125,'+(.06+.12*(.5+.5*Math.sin(clock*.55+particle.phase)))+')';ctx.beginPath();ctx.arc(x,y,particle.size,0,Math.PI*2);ctx.fill();
      }
      for(const node of nodes) if(PARENTS.has(node.id)) drawThread(byId.get(PARENTS.get(node.id)),node);
      nodes.filter(node=>node.id!=='root').forEach(drawOrb);drawOrb(byId.get('root'));publish(now);
    }
    function tick(now) {
      frame=0;if(disposed||!wanted||document.hidden)return;
      const animated=moves(),interval=transitioning?14:1000/30;
      if(animated&&now-lastPaint<interval) {request();return;}
      const dt=lastTick?Math.min((now-lastTick)/1000,.06):0;lastTick=now;lastPaint=now;
      if(animated)clock+=dt;
      if(transitioning) {
        const t=animated?ease((now-transitionAt)/520):1;
        for(const node of nodes) for(const key of ['x','y','r','opacity']) node[key]=mix(node.from[key],node.target[key],t);
        if(t>=1)transitioning=false;
      }
      const smoothing=animated?1-Math.exp(-dt*8):1;
      pointer.x=mix(pointer.x,animated?aim.x:0,smoothing);pointer.y=mix(pointer.y,animated?aim.y:0,smoothing);
      draw(now);
      if(animated||transitioning)request();
    }
    function request() {if(!disposed&&wanted&&!document.hidden&&!frame)frame=requestAnimationFrame(tick);}
    function start() {if(disposed)return;wanted=true;lastTick=lastPaint=0;resize();request();}
    function stop() {wanted=false;cancelAnimationFrame(frame);frame=0;lastTick=0;}
    function setState(value={}) {
      if(disposed)return;
      const oldBranch=state.branch;
      if(IDS.includes(value.selected))state.selected=value.selected;
      if('branch' in value)state.branch=BRANCHES[value.branch]?value.branch:null;
      if(Array.isArray(value.unlocked)||value.unlocked instanceof Set)state.unlocked=new Set(['root',...value.unlocked].filter(id=>IDS.includes(id)));
      if(typeof value.motion==='boolean')state.motion=value.motion;
      if(oldBranch!==state.branch)targets(moves()&&wanted);
      if(!moves()) {pointer=aim={x:0,y:0};if(transitioning){nodes.forEach(node=>Object.assign(node,node.target));transitioning=false;}}
      lastLayout='';request();
    }
    function hit(x,y) {
      return nodes.filter(node=>node.opacity>.3).map(node=>({node,at:screenNode(node)})).filter(({at})=>Math.hypot(x-at.x,y-at.y)<=at.r*1.15).sort((a,b)=>Math.hypot(x-a.at.x,y-a.at.y)-Math.hypot(x-b.at.x,y-b.at.y))[0]?.node.id||null;
    }
    function pointerMove(event) {
      if(!wanted||document.hidden)return;const b=canvas.getBoundingClientRect(),x=event.clientX-b.left,y=event.clientY-b.top;
      if(event.pointerType!=='touch') {aim={x:(x/width-.5)*10,y:(y/height-.5)*7};}
      const id=hit(x,y);if(id!==hovered){hovered=id;canvas.style.cursor=id?'pointer':'';onNodeHover?.(id);request();}
    }
    function pointerLeave() {aim={x:0,y:0};if(hovered){hovered=null;canvas.style.cursor='';onNodeHover?.(null);}request();}
    function click(event) {if(!wanted)return;const b=canvas.getBoundingClientRect(),id=hit(event.clientX-b.left,event.clientY-b.top);if(id)onNodeClick?.(id);}
    function visibility() {cancelAnimationFrame(frame);frame=0;lastTick=lastPaint=0;if(!document.hidden)request();}
    function reduce() {if(!moves()){nodes.forEach(node=>{if(node.target)Object.assign(node,node.target);});transitioning=false;pointer=aim={x:0,y:0};}request();}
    canvas.addEventListener('pointermove',pointerMove,{passive:true});canvas.addEventListener('pointerleave',pointerLeave);canvas.addEventListener('click',click);
    document.addEventListener('visibilitychange',visibility);media.addEventListener('change',reduce);
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(canvas);
    if(!observer)window.addEventListener('resize',resize);
    resize();
    return Object.freeze({setState,resize,start,stop,dispose(){if(disposed)return;stop();disposed=true;liquid.dispose();observer?.disconnect();window.removeEventListener('resize',resize);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerleave',pointerLeave);canvas.removeEventListener('click',click);document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',reduce);thread.onload=thread.onerror=null;ctx.clearRect(0,0,canvas.width,canvas.height);},getState:()=>({running:wanted&&!document.hidden,framePending:Boolean(frame),transitioning,width,height,dpr,selected:state.selected,branch:state.branch,unlocked:[...state.unlocked],hovered,motion:moves(),textureReady:threadReady,liquid:liquid.getState(),visibleNodes:layout.filter(node=>node.visible).length,layout:layout.map(node=>({...node}))})});
  }
  window.InfiniteCovenantScene=Object.freeze({create});
})();
