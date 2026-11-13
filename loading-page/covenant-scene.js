/* Faceted covenant constellation. UI plaques are DOM; every tether is sampled
   from the image-generated silk texture rather than drawn as a vector stroke. */
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
  function makeGeometry(seed) {
    const vertices=[{x:0,y:-1,z:0}],faces=[];
    for(let ring=1;ring<=3;ring++) {
      const latitude=ring*Math.PI/4;
      for(let slice=0;slice<8;slice++) {
        const longitude=slice*Math.PI/4+(ring%2)*.19;
        const radius=.94+noise(seed+ring*13+slice)*.10;
        vertices.push({x:Math.cos(longitude)*Math.sin(latitude)*radius,y:-Math.cos(latitude)*radius,z:Math.sin(longitude)*Math.sin(latitude)*radius});
      }
    }
    vertices.push({x:0,y:1,z:0});
    const add=(a,b,c)=>faces.push({a,b,c,depth:0,light:0});
    for(let slice=0;slice<8;slice++) add(0,1+slice,1+(slice+1)%8);
    for(let ring=0;ring<2;ring++) for(let slice=0;slice<8;slice++) {
      const a=1+ring*8+slice,b=1+ring*8+(slice+1)%8,c=a+8,d=b+8;
      add(a,c,b);add(b,c,d);
    }
    for(let slice=0;slice<8;slice++) add(25,17+(slice+1)%8,17+slice);
    return {vertices,faces,projected:vertices.map(()=>({x:0,y:0,z:0,sx:0,sy:0}))};
  }
  function create(canvas,{onNodeClick,onNodeHover,onLayout}={}) {
    if(!canvas?.getContext) throw new TypeError('A covenant canvas is required.');
    const ctx=canvas.getContext('2d',{alpha:true,desynchronized:true});
    if(!ctx) throw new Error('The covenant scene could not initialize.');
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const state={selected:'root',branch:null,unlocked:new Set(['root']),motion:true};
    const nodes=IDS.map((id,index)=>({id,index,geometry:makeGeometry(index+4),x:0,y:0,r:0,opacity:0,target:null,from:null}));
    const byId=new Map(nodes.map(node=>[node.id,node]));
    const dust=Array.from({length:22},(_,i)=>({x:noise(i+80),y:noise(i+170),size:.5+noise(i+220)*.9,phase:noise(i+270)*Math.PI*2}));
    let width=0,height=0,dpr=1,wanted=false,disposed=false,frame=0,lastTick=0,lastPaint=0,clock=0,transitionAt=0,transitioning=false;
    let pointer={x:0,y:0},aim={x:0,y:0},hovered=null,lastLayout='',lastLayoutAt=0,layout=[];
    let threadReady=false;
    const thread=new Image();
    thread.src='assets/covenant/thread.png';
    thread.onload=()=>{threadReady=true;request();};
    thread.onerror=()=>{threadReady=false;request();};
    if(thread.complete&&thread.naturalWidth) threadReady=true;
    const moves=()=>state.motion&&!media.matches;
    function statusOf(id) { return state.unlocked.has(id) ? 'unlocked' : state.unlocked.has(PARENTS.get(id)) ? 'available' : 'locked'; }
    function targets(animate=moves()&&wanted) {
      if(!width||!height) return;
      const compact=width<540;
      const radius=clamp(Math.min(width*.13,height*.19),compact?35:48,105);
      const overview={root:[.47,.48,1,1],insight:[.18,.23,.45,1],ward:[.81,.31,.48,1],crossing:[.52,.81,.46,1]};
      if(compact) Object.assign(overview,{root:[.49,.48,1,1],insight:[.19,.22,.47,1],ward:[.80,.26,.47,1],crossing:[.51,.81,.46,1]});
      const positions={};
      for(const id of IDS) {
        const branch=Object.keys(BRANCHES).find(key=>BRANCHES[key].includes(id));
        positions[id]=overview[id] || [...overview[branch].slice(0,2),.1,0];
      }
      if(state.branch) {
        positions.root=[.10,.55,.66,1];
        const line=compact?[[.29,.31],[.49,.58],[.70,.30],[.89,.54]]:[[.30,.48],[.48,.23],[.68,.57],[.88,.30]];
        BRANCHES[state.branch].forEach((id,i)=>{positions[id]=[...line[i],i===0?.52:.38,1];});
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
      const grad=ctx.createRadialGradient(x,y,0,x,y,r);
      grad.addColorStop(0,color.replace('ALPHA',String(.34*opacity)));
      grad.addColorStop(.35,color.replace('ALPHA',String(.13*opacity)));
      grad.addColorStop(1,color.replace('ALPHA','0'));
      ctx.fillStyle=grad;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
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
      const available=statusOf(node.id)!=='locked';
      ctx.save();ctx.globalAlpha=node.opacity*(available?.82:.26);
      if(!available) ctx.filter='grayscale(1)';
      const count=Math.max(8,Math.min(22,Math.ceil(distance/20))),stripHeight=available?4.5:3.1;
      const sourceY=Math.round(thread.naturalHeight*(332/724)),sourceHeight=Math.round(thread.naturalHeight*(60/724));
      let previous=curvePoint(points,0);
      for(let i=1;i<=count;i++) {
        const point=curvePoint(points,i/count),dx=point.x-previous.x,dy=point.y-previous.y,length=Math.hypot(dx,dy);
        ctx.save();ctx.translate(previous.x,previous.y);ctx.rotate(Math.atan2(dy,dx));
        ctx.drawImage(thread,(i-1)*thread.naturalWidth/count,sourceY,thread.naturalWidth/count,sourceHeight,-.4,-stripHeight/2,length+.8,stripHeight);
        ctx.restore();previous=point;
      }
      ctx.restore();
      if(available&&moves()) {
        const t=(clock*.17+node.index*.23)%1,p=curvePoint(points,t);
        glow(p.x,p.y,8,'rgba(245,180,106,ALPHA)',.65*node.opacity);
        ctx.fillStyle='rgba(255,221,169,'+(.85*node.opacity)+')';ctx.beginPath();ctx.arc(p.x,p.y,1.3,0,Math.PI*2);ctx.fill();
      }
    }
    function drawOrb(node) {
      if(node.opacity<.02||node.r<2) return;
      const at=screenNode(node),unlocked=statusOf(node.id)==='unlocked',available=statusOf(node.id)==='available';
      const selected=state.selected===node.id,hover=hovered===node.id,root=node.id==='root';
      const strength=unlocked?1:available?.57:.16;
      const r=at.r*(selected?1.05:hover?1.035:1);
      const spin=clock*(root?.075:.11)+node.index*.93;
      const tilt=.27+Math.sin(clock*.19+node.index)*.12;
      const sy=Math.sin(spin),cy=Math.cos(spin),sx=Math.sin(tilt),cx=Math.cos(tilt);
      ctx.save();ctx.globalAlpha=node.opacity;
      glow(at.x,at.y,r*1.9,'rgba(193,45,35,ALPHA)',strength*(selected?1.1:.72));
      const base=ctx.createRadialGradient(at.x-r*.28,at.y-r*.32,r*.02,at.x,at.y,r*1.06);
      base.addColorStop(0,unlocked?'#7b3031':available?'#332a2c':'#1c2025');
      base.addColorStop(.65,unlocked?'#260e18':'#0e131b');base.addColorStop(1,'rgba(6,10,17,0)');
      ctx.fillStyle=base;ctx.beginPath();ctx.arc(at.x,at.y,r*1.08,0,Math.PI*2);ctx.fill();
      const {vertices,projected,faces}=node.geometry;
      for(let i=0;i<vertices.length;i++) {
        const v=vertices[i],p=projected[i],px=v.x*cy+v.z*sy,pz=v.z*cy-v.x*sy;
        p.x=px;p.y=v.y*cx-pz*sx;p.z=v.y*sx+pz*cx;
        const perspective=1/(1-p.z*.17);p.sx=at.x+p.x*r*perspective;p.sy=at.y+p.y*r*perspective;
      }
      for(const face of faces) {
        const a=projected[face.a],b=projected[face.b],c=projected[face.c];
        face.depth=(a.z+b.z+c.z)/3;
        const nx=(a.x+b.x+c.x)/3,ny=(a.y+b.y+c.y)/3;
        face.light=clamp(.35-nx*.3-ny*.44+face.depth*.37);
      }
      faces.sort((a,b)=>a.depth-b.depth);
      ctx.lineWidth=root?.65:.55;
      for(const face of faces) {
        const a=projected[face.a],b=projected[face.b],c=projected[face.c],light=face.light;
        ctx.beginPath();ctx.moveTo(a.sx,a.sy);ctx.lineTo(b.sx,b.sy);ctx.lineTo(c.sx,c.sy);ctx.closePath();
        const red=Math.round((unlocked?72:available?39:22)+light*(unlocked?107:35));
        const green=Math.round((unlocked?13:23)+light*(unlocked?34:31));
        const blue=Math.round((unlocked?25:31)+light*27);
        ctx.fillStyle='rgba('+red+','+green+','+blue+','+(.44+light*.18)+')';ctx.fill();
        ctx.strokeStyle='rgba('+(unlocked?'222,161,118':available?'163,150,135':'102,116,130')+','+(.08+light*(selected?.39:.23))+')';ctx.stroke();
      }
      const beat=moves()?1+Math.sin(clock*1.65+node.index)*.07:1;
      const coreR=r*(root?.22:.17)*beat;
      const coreX=at.x-r*.08,coreY=at.y+r*.08;
      glow(coreX,coreY,coreR*3.2,'rgba(242,92,35,ALPHA)',strength);
      const angles=[-.8,.8,2.2,3.7,5.1];
      for(let i=0;i<angles.length;i++) {
        const angle=angles[i]+spin*.6,next=angles[(i+1)%angles.length]+spin*.6;
        ctx.beginPath();ctx.moveTo(coreX,coreY);ctx.lineTo(coreX+Math.cos(angle)*coreR,coreY+Math.sin(angle)*coreR);ctx.lineTo(coreX+Math.cos(next)*coreR*.63,coreY+Math.sin(next)*coreR*.63);ctx.closePath();
        ctx.fillStyle=unlocked?(i%2?'rgba(255,211,139,.9)':'rgba(240,114,58,.8)'):available?'rgba(192,145,99,.48)':'rgba(93,105,116,.3)';ctx.fill();
      }
      const pointCount=root?8:3;
      for(let i=0;i<pointCount;i++) {
        const p=projected[(i*3+node.index)%projected.length];if(p.z<0)continue;
        const twinkle=.32+.45*(.5+.5*Math.sin(clock*1.1+i*3));
        ctx.fillStyle='rgba('+(unlocked?'253,212,164':'176,181,184')+','+twinkle*strength+')';ctx.beginPath();ctx.arc(p.sx,p.sy,root?1.4:1,0,Math.PI*2);ctx.fill();
      }
      if(selected||hover) {
        const gradient=ctx.createRadialGradient(at.x-r*.46,at.y-r*.55,0,at.x-r*.46,at.y-r*.55,r*.55);
        gradient.addColorStop(0,'rgba(255,219,175,.18)');gradient.addColorStop(1,'rgba(255,219,175,0)');
        ctx.fillStyle=gradient;ctx.beginPath();ctx.arc(at.x-r*.46,at.y-r*.55,r*.55,0,Math.PI*2);ctx.fill();
      }
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
      const animated=moves(),interval=transitioning?14:30;
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
    return Object.freeze({setState,resize,start,stop,dispose(){if(disposed)return;stop();disposed=true;observer?.disconnect();window.removeEventListener('resize',resize);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerleave',pointerLeave);canvas.removeEventListener('click',click);document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',reduce);thread.onload=thread.onerror=null;ctx.clearRect(0,0,canvas.width,canvas.height);},getState:()=>({running:wanted&&!document.hidden,framePending:Boolean(frame),transitioning,width,height,dpr,selected:state.selected,branch:state.branch,unlocked:[...state.unlocked],hovered,motion:moves(),textureReady:threadReady,visibleNodes:layout.filter(node=>node.visible).length,layout:layout.map(node=>({...node}))})});
  }
  window.InfiniteCovenantScene=Object.freeze({create});
})();
