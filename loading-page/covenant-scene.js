/* Procedural liquid sculpture. Cached implicit-surface meshes are shaded directly
   on the visible WebGL canvas; no sphere images, atlas copies or readbacks. */
(() => {
  'use strict';
  const BRANCHES = Object.freeze({insight:['insight','listen','discern','night'],ward:['ward','resolve','renew','steadfast'],crossing:['crossing','path','bond','home']});
  const IDS = ['root',...Object.values(BRANCHES).flat()];
  const PARENTS = new Map();
  for(const chain of Object.values(BRANCHES))chain.forEach((id,i)=>PARENTS.set(id,i?chain[i-1]:'root'));
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const mix=(a,b,t)=>a+(b-a)*t;
  const ease=t=>1-Math.pow(1-clamp(t),3);
  const random=n=>{const v=Math.sin(n*127.13+19.71)*43758.5453;return v-Math.floor(v);};
  const meshCache=new Map();
  const smoothMax=(a,b,k)=>{const h=Math.max(k-Math.abs(a-b),0)/k;return Math.max(a,b)+h*h*k*.25;};
  const nextSlice=()=>new Promise(resolve=>setTimeout(resolve,0));
  function fieldFor(index){
    const family=index===0?'root':index<=4?'insight':index<=8?'ward':'crossing';
    const seed=17+index*29,phase=random(seed)*6.28;
    const pores=[],count=family==='root'?28:family==='insight'?15:family==='ward'?12:18;
    for(let i=0;i<count;i++){
      const z=1-2*(i+.5)/count,angle=i*2.399963+phase+(random(seed+i+8)-.5)*.56,r=Math.sqrt(1-z*z);
      const radius=(family==='root'?.222:family==='ward'?.285:family==='insight'?.285:.265)+random(seed+i+55)*.035;
      pores.push({x:Math.cos(angle)*r*.83,y:Math.sin(angle)*r*.83,z:z*.83,r:radius,stretch:.88+random(seed+i+77)*.30});
    }
    const axes=family==='insight'?[1.11,.92,.78]:family==='ward'?[.95,1.05,.96]:family==='crossing'?[.87,1.16,.91]:[1.02,.97,.95];
    const turn=random(seed+14)*.7-.35,ct=Math.cos(turn),st=Math.sin(turn);
    const knot=[];
    if(family==='crossing')for(let i=0;i<=48;i++){const t=i/48*Math.PI*2;const r=.29*(2.+Math.cos(t*3.+phase*.13));knot.push({x:Math.cos(t*2)*r,y:Math.sin(t*2)*r,z:Math.sin(t*3+phase*.13)*.27,w:.115+.025*Math.sin(t*5+phase)});}
    return (x,y,z)=>{
      const tx=x*ct-y*st,ty=x*st+y*ct;
      x=tx/axes[0];y=ty/axes[1];z/=axes[2];
      // A low-frequency displacement creates soft, unequal lobes and stretched pores.
      const wx=x+.072*Math.sin(y*3.0+phase)*Math.cos(z*2.2),wy=y+.065*Math.sin(z*3.2-phase)*Math.cos(x*2.7),wz=z+.061*Math.sin(x*3.3+phase)*Math.cos(y*2.4);
      const radius=Math.hypot(wx,wy,wz);
      if(family==='insight'){
        const angle=Math.atan2(wy,wx),radial=Math.hypot(wx,wy),ring=.65+.065*Math.sin(angle*3+phase)+.035*Math.cos(angle*5-phase);
        const tube=.155+.038*Math.sin(angle*3+phase);
        let value=Math.hypot(radial-ring,wz-.13*Math.sin(angle*2+phase))-tube;
        const back=Math.hypot(Math.hypot(wy*.91,wz)-.45,wx-.10)-.072;
        value=-smoothMax(-value,-back,.11);
        const bead=Math.hypot(wx+.56,wy-.26,wz-.03)-.24;
        return -smoothMax(-value,-bead,.16);
      }
      if(family==='ward'){
        let value=Math.hypot(wx*.94,wy*1.06,wz*1.16)-.64;
        for(let i=0;i<5;i++){const a=i*1.2566+phase*.16,cx=Math.cos(a)*.46,cy=Math.sin(a)*.47,cz=.10*Math.sin(a*2+phase);const part=Math.hypot(wx-cx,wy-cy,(wz-cz)*1.25)-(.35+.045*Math.sin(i*2+phase));value=-smoothMax(-value,-part,.20);}
        const eye=Math.hypot(wx*1.1,wy-.08)-.21;
        value=smoothMax(value,-eye,.15);
        return value;
      }
      if(family==='crossing'){
        let value=10.;
        for(let i=0;i<knot.length-1;i++){const a=knot[i],b=knot[i+1],dx=b.x-a.x,dy=b.y-a.y,dz=b.z-a.z;const t=clamp(((wx-a.x)*dx+(wy-a.y)*dy+(wz-a.z)*dz)/(dx*dx+dy*dy+dz*dz));const distance=Math.hypot(wx-a.x-dx*t,wy-a.y-dy*t,wz-a.z-dz*t)-mix(a.w,b.w,t);value=Math.min(value,distance);}
        return value;
      }
      const ripple=.065*Math.sin(wx*3.2+phase)*Math.sin(wy*2.6-.6)+.045*Math.cos(wz*4.2+wx*1.8-phase);
      const shell=family==='ward'?.64:family==='insight'?.74:family==='root'?.755:.71;
      let value=smoothMax(radius-(.98+ripple),shell+.035*Math.sin(wy*3.1+phase)-radius,.08);
      for(const p of pores){
        const dx=wx-p.x,dy=wy-p.y,dz=(wz-p.z)*p.stretch;
        const hole=Math.sqrt(dx*dx+dy*dy+dz*dz)-p.r;
        value=smoothMax(value,-hole,.145);
      }
      return value;
    };
  }
  // Marching tetrahedra is performed only once per node, in cooperative slices.
  // Vertex normals interpolate the scalar-field gradient, giving smooth wet rims.
  async function buildMesh(index,compact){
    const key=`liquid-${index}-${compact?'compact':'full'}-6`;
    if(meshCache.has(key))return meshCache.get(key);
    const task=(async()=>{
      const field=fieldFor(index),n=index===0?(compact?41:53):(compact?29:35),side=n+1,bound=1.42,step=bound*2/n;
      const total=side*side*side,values=new Float32Array(total),gradient=new Float32Array(total*3);
      const at=(x,y,z)=>x+side*(y+side*z);
      let slice=performance.now();
      for(let z=0;z<=n;z++)for(let y=0;y<=n;y++){
        for(let x=0;x<=n;x++)values[at(x,y,z)]=field(x*step-bound,y*step-bound,z*step-bound);
        if(performance.now()-slice>5){await nextSlice();slice=performance.now();}
      }
      for(let z=0;z<=n;z++)for(let y=0;y<=n;y++){
        for(let x=0;x<=n;x++){
          const q=at(x,y,z)*3;
          gradient[q]=values[at(Math.min(n,x+1),y,z)]-values[at(Math.max(0,x-1),y,z)];
          gradient[q+1]=values[at(x,Math.min(n,y+1),z)]-values[at(x,Math.max(0,y-1),z)];
          gradient[q+2]=values[at(x,y,Math.min(n,z+1))]-values[at(x,y,Math.max(0,z-1))];
        }
        if(performance.now()-slice>5){await nextSlice();slice=performance.now();}
      }
      const tetra=[[0,5,1,6],[0,1,2,6],[0,2,3,6],[0,3,7,6],[0,7,4,6],[0,4,5,6]];
      const offsets=[[0,0,0],[1,0,0],[1,1,0],[0,1,0],[0,0,1],[1,0,1],[1,1,1],[0,1,1]];
      const output=[],corners=Array.from({length:8},()=>({id:0,x:0,y:0,z:0,v:0}));
      function edge(a,b){
        const t=a.v/(a.v-b.v),ai=a.id*3,bi=b.id*3;
        let nx=mix(gradient[ai],gradient[bi],t),ny=mix(gradient[ai+1],gradient[bi+1],t),nz=mix(gradient[ai+2],gradient[bi+2],t);
        const length=Math.hypot(nx,ny,nz)||1;nx/=length;ny/=length;nz/=length;
        return [mix(a.x,b.x,t),mix(a.y,b.y,t),mix(a.z,b.z,t),nx,ny,nz];
      }
      function triangle(a,b,c){
        const ux=b[0]-a[0],uy=b[1]-a[1],uz=b[2]-a[2],vx=c[0]-a[0],vy=c[1]-a[1],vz=c[2]-a[2];
        const direction=(uy*vz-uz*vy)*(a[3]+b[3]+c[3])+(uz*vx-ux*vz)*(a[4]+b[4]+c[4])+(ux*vy-uy*vx)*(a[5]+b[5]+c[5]);
        if(direction<0){const temp=b;b=c;c=temp;}
        output.push(...a,...b,...c);
      }
      for(let z=0;z<n;z++)for(let y=0;y<n;y++){
        for(let x=0;x<n;x++){
          let below=0;
          for(let i=0;i<8;i++){const o=offsets[i],p=corners[i];p.id=at(x+o[0],y+o[1],z+o[2]);p.v=values[p.id];p.x=(x+o[0])*step-bound;p.y=(y+o[1])*step-bound;p.z=(z+o[2])*step-bound;if(p.v<0)below++;}
          if(!below||below===8)continue;
          for(const t of tetra){
            const inside=[],outside=[];for(const i of t)(corners[i].v<0?inside:outside).push(corners[i]);
            if(inside.length===1){triangle(edge(inside[0],outside[0]),edge(inside[0],outside[1]),edge(inside[0],outside[2]));}
            else if(inside.length===3){triangle(edge(outside[0],inside[0]),edge(outside[0],inside[1]),edge(outside[0],inside[2]));}
            else if(inside.length===2){const a=edge(inside[0],outside[0]),b=edge(inside[0],outside[1]),c=edge(inside[1],outside[0]),d=edge(inside[1],outside[1]);triangle(a,b,c);triangle(b,d,c);}
          }
        }
        if(performance.now()-slice>5){await nextSlice();slice=performance.now();}
      }
      return {key,vertices:new Float32Array(output),count:output.length/6,seed:17+index*29};
    })();
    meshCache.set(key,task);
    try{return await task;}catch(error){meshCache.delete(key);throw error;}
  }
  function sphereMesh(){
    const data=[],rows=16,columns=24;
    const point=(y,x)=>{const a=y/rows*Math.PI,b=x/columns*Math.PI*2,p=[Math.sin(a)*Math.cos(b),Math.cos(a),Math.sin(a)*Math.sin(b)];return [...p,...p];};
    for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const a=point(y,x),b=point(y+1,x),c=point(y,x+1),d=point(y+1,x+1);data.push(...a,...c,...b,...c,...d,...b);}
    return {vertices:new Float32Array(data),count:data.length/6,key:'seal-sphere'};
  }
  const VERTEX=`precision highp float;
    attribute vec3 aPosition;attribute vec3 aNormal;
    uniform vec2 uViewport,uCenter;uniform float uRadius,uTime,uSeed,uEnergy,uHover,uScale,uKind;
    varying vec3 vPosition,vNormal,vRaw;
    void main(){
      vec3 p=aPosition*uScale,n=aNormal;float t=uTime*(.36+.35*uEnergy)+uSeed;
      float amplitude=(.014+.080*uEnergy+.008*uHover)*(uKind>1.5?.3:1.);
      vec3 wave=vec3(sin(p.y*3.1+t)*cos(p.z*2.7-t*.43),sin(p.z*2.9-t*.72)*cos(p.x*2.5+t*.31),sin(p.x*3.0+t*.57)*cos(p.y*2.8-t*.36));
      vec3 jx=vec3(1.,-amplitude*2.5*sin(p.z*2.9-t*.72)*sin(p.x*2.5+t*.31),amplitude*3.*cos(p.x*3.+t*.57)*cos(p.y*2.8-t*.36));
      vec3 jy=vec3(amplitude*3.1*cos(p.y*3.1+t)*cos(p.z*2.7-t*.43),1.,-amplitude*2.8*sin(p.x*3.+t*.57)*sin(p.y*2.8-t*.36));
      vec3 jz=vec3(-amplitude*2.7*sin(p.y*3.1+t)*sin(p.z*2.7-t*.43),amplitude*2.9*cos(p.z*2.9-t*.72)*cos(p.x*2.5+t*.31),1.);
      n=normalize(cross(jy,jz)*n.x+cross(jz,jx)*n.y+cross(jx,jy)*n.z);p+=amplitude*wave;
      float ry=.24*sin(uSeed)+uTime*(.018+.017*uEnergy),rx=.18*sin(uSeed*.7)+sin(uTime*.12+uSeed)*.07;
      mat3 yaw=mat3(cos(ry),0.,-sin(ry),0.,1.,0.,sin(ry),0.,cos(ry));
      mat3 pitch=mat3(1.,0.,0.,0.,cos(rx),sin(rx),0.,-sin(rx),cos(rx));
      vRaw=p;p=pitch*yaw*p;n=pitch*yaw*n;vPosition=p;vNormal=n;
      float perspective=3.7/(3.7-p.z*.25);vec2 screen=uCenter+vec2(p.x,-p.y)*uRadius*perspective;
      gl_Position=vec4(screen.x/uViewport.x*2.-1.,1.-screen.y/uViewport.y*2.,-.32-p.z*.19,1.);
    }`;
  const FRAGMENT=`precision highp float;
    uniform float uEnergy,uHover,uOpacity,uTime,uSeed,uKind;
    varying vec3 vPosition,vNormal,vRaw;
    float ggx(vec3 n,vec3 v,vec3 l,float rough){vec3 h=normalize(v+l);float nl=max(dot(n,l),0.),nv=max(dot(n,v),.01),nh=max(dot(n,h),0.),vh=max(dot(v,h),0.);float a=rough*rough,a2=a*a,d=nh*nh*(a2-1.)+1.;float distribution=a2/(3.14159*d*d);float k=(rough+1.)*(rough+1.)*.125;float g=nv/(nv*(1.-k)+k)*nl/(nl*(1.-k)+k);float f=.06+.94*pow(1.-vh,5.);return distribution*g*f/(4.*nv*max(nl,.01))*nl;}
    void main(){
      vec3 n=normalize(vNormal);if(!gl_FrontFacing)n=-n;
      vec3 v=normalize(vec3(-vPosition.xy*.1,3.7-vPosition.z)),r=reflect(-v,n);
      float nv=max(dot(n,v),0.),fresnel=.07+.93*pow(1.-nv,5.);
      float unlocked=smoothstep(.35,.95,uEnergy),rough=mix(.39,.19,uEnergy);
      if(uKind>.5)rough=mix(.46,.24,uEnergy);
      vec3 cool=vec3(.62,.72,.78),warm=vec3(1.,.57,.25),base=vec3(.002,.003,.0035);
      float softbox=exp(-pow((r.x+.43)/.29,2.)-pow((r.y-.48)/.39,2.));
      float strip=exp(-pow((r.x-.64)/.12,2.)-pow((r.y-.2)/.72,2.));
      float lower=exp(-pow((r.x+.14)/.7,2.)-pow((r.y+.61)/.15,2.));
      float diffuse=.36+.64*max(dot(n,normalize(vec3(-.5,.7,1.))),0.);
      float mottled=.9+.1*sin(vRaw.x*11.+sin(vRaw.y*9.))*sin(vRaw.z*10.-vRaw.y*4.);
      vec3 color=base*diffuse*mottled;
      color+=cool*(softbox*.20+strip*.26)*(fresnel*.72+.23)*(.55+.45*uEnergy);
      color+=cool*lower*.018*fresnel;
      color+=cool*ggx(n,v,normalize(vec3(-.6,.8,1.2)),rough)*.42;
      color+=vec3(.20,.25,.28)*ggx(n,v,normalize(vec3(.8,-.4,.5)),rough)*.38;
      float inner=pow(1.-max(dot(n,normalize(vPosition)),0.),2.);
      float flow=sin(vRaw.x*4.1+sin(vRaw.y*5.2+uTime*.27)+vRaw.z*3.8-uTime*.21);
      float vein=pow(max(0.,1.-abs(flow)/.075),3.);
      color+=mix(vec3(.35,.014,.009),vec3(.72,.19,.035),unlocked)*uEnergy*vein*inner*.004;
      color+=cool*uHover*.012*fresnel;
      if(uKind>1.5){float core=.36+.16*sin(uTime*1.6+uSeed);color=mix(vec3(.006,.008,.01),vec3(.22,.048,.012)*(core+.6*pow(nv,3.))+vec3(.30,.18,.06)*pow(nv,6.),unlocked);}
      else if(uKind>.5)color*=.48;
      color=vec3(1.)-exp(-color*1.45);color=pow(max(color,vec3(0.)),vec3(1./2.2));
      gl_FragColor=vec4(color*uOpacity,uOpacity);
    }`;
  const THREAD_VERTEX=`precision highp float;attribute vec2 aParameter;uniform vec2 uViewport,uA,uB;uniform float uBend,uWidth;varying vec2 vParameter;void main(){float t=aParameter.x,s=1.-t;vec2 c=mix(uA,uB,.36)+vec2(0.,uBend),d=mix(uA,uB,.67)-vec2(0.,uBend*.35);vec2 p=s*s*s*uA+3.*s*s*t*c+3.*s*t*t*d+t*t*t*uB;vec2 tangent=normalize(3.*s*s*(c-uA)+6.*s*t*(d-c)+3.*t*t*(uB-d));p+=vec2(-tangent.y,tangent.x)*aParameter.y*uWidth;vParameter=aParameter;gl_Position=vec4(p.x/uViewport.x*2.-1.,1.-p.y/uViewport.y*2.,.85,1.);}`;
  const THREAD_FRAGMENT=`precision mediump float;uniform float uTime,uEnergy,uOpacity,uSeed;varying vec2 vParameter;void main(){float width=abs(vParameter.y),core=exp(-width*width*19.),halo=exp(-width*width*4.)*.13;float head=fract(uTime*.12+uSeed),distance=abs(vParameter.x-head);float pulse=exp(-distance*distance*2900.)*uEnergy;vec3 color=mix(vec3(.25,.30,.31),vec3(.63,.10,.045),smoothstep(.3,.7,uEnergy));color=mix(color,vec3(.95,.68,.30),pulse);float alpha=(core*.67+halo+pulse*halo*3.)*uOpacity;gl_FragColor=vec4(color*alpha,alpha);}`;
  function create(canvas,{onNodeClick,onNodeHover,onLayout}={}){
    if(!canvas?.getContext)throw new TypeError('A covenant canvas is required.');
    const media=matchMedia('(prefers-reduced-motion: reduce)');
    const state={selected:'root',branch:null,unlocked:new Set(['root']),motion:true};
    const nodes=IDS.map((id,index)=>({id,index,x:0,y:0,r:0,opacity:0,target:null,from:null,mesh:null,building:null,energy:id==='root'?1:index===1||index===5||index===9?.30:0,seal:id==='root'?0:index===1||index===5||index===9?.62:1,hover:0,reveal:0}));
    const byId=new Map(nodes.map(node=>[node.id,node]));
    let width=0,height=0,dpr=1,wanted=false,disposed=false,frame=0,lastTick=0,lastPaint=0,clock=0,transitionAt=0,transitioning=false,preparing=null;
    let pointer={x:0,y:0},aim={x:0,y:0},hovered=null,lastLayout='',layout=[],gl=null,program=null,lineProgram=null,lineBuffer=null,sphere=null,locations=null,lineLocations=null;
    let initialized=false,initializing=null,initEpoch=0,initStage='idle',parallelCompile=false,lost=false,error=null,quality=1,slowFrames=0,qualityAt=0,lastRaf=0,avgFrame=16.7,cpuMs=0,drawCalls=0,triangles=0,renderCount=0,meshBuildMs=0;
    let fallback=null,fallbackCtx=null;
    const buffers=new Map();
    const moves=()=>state.motion&&!media.matches;
    const statusOf=id=>state.unlocked.has(id)?'unlocked':state.unlocked.has(PARENTS.get(id))?'available':'locked';
    const materialFor=id=>{const kind=statusOf(id);return kind==='unlocked'?{energy:1,seal:0}:kind==='available'?{energy:.30,seal:.62}:{energy:0,seal:1};};
    const initActive=token=>!disposed&&!lost&&token===initEpoch&&(!gl||!gl.isContextLost());
    function shader(type,source){const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);return value;}
    async function makeProgram(vertex,fragment,token,extension){
      const v=shader(gl.VERTEX_SHADER,vertex),f=shader(gl.FRAGMENT_SHADER,fragment),p=gl.createProgram();
      gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);gl.flush();
      try{
        // LINK_STATUS / COMPILE_STATUS are synchronous fences. The KHR completion
        // query is nonblocking; without it, isolate linking in its own task.
        // https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/
        await nextSlice();
        if(extension){const started=performance.now();while(initActive(token)&&!gl.getProgramParameter(p,extension.COMPLETION_STATUS_KHR)){if(performance.now()-started>10000)throw Error('liquid-shader-timeout');await new Promise(resolve=>setTimeout(resolve,5));}}
        if(!initActive(token))return null;
        if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
          const message=gl.getProgramInfoLog(p)||gl.getShaderInfoLog(v)||gl.getShaderInfoLog(f)||'Liquid program';
          throw Error(message);
        }
        return p;
      }catch(failure){if(initActive(token))gl.deleteProgram(p);throw failure;}
      finally{if(initActive(token)){gl.deleteShader(v);gl.deleteShader(f);}}
    }
    function makeFallback(){if(fallback)return;fallback=document.createElement('canvas');fallback.className=canvas.className+' covenant-render-fallback';fallback.setAttribute('aria-hidden','true');fallback.style.pointerEvents='none';canvas.after(fallback);fallbackCtx=fallback.getContext('2d',{alpha:true});resize();}
    function init(){
      if(disposed)return Promise.resolve(false);
      if(lost)return Promise.resolve(Boolean(fallbackCtx));
      if(initialized)return Promise.resolve(Boolean(program||fallbackCtx));
      if(initializing)return initializing;
      const token=++initEpoch;
      initializing=(async()=>{
        let main=null,lines=null;
        try{
          // Context creation, each program, and buffer setup occupy separate
          // browser tasks. A cold driver cannot stack them into one opening hitch.
          initStage='context';await nextSlice();if(!initActive(token))return false;
          gl=gl||canvas.getContext('webgl',{alpha:true,premultipliedAlpha:true,antialias:true,depth:true,stencil:false,preserveDrawingBuffer:false,powerPreference:'high-performance'});
          if(!gl)throw Error('webgl-unavailable');
          await nextSlice();if(!initActive(token))return false;
          const extension=gl.getExtension('KHR_parallel_shader_compile');parallelCompile=Boolean(extension);
          initStage='material';main=await makeProgram(VERTEX,FRAGMENT,token,extension);if(!main||!initActive(token))return false;
          await nextSlice();if(!initActive(token))return false;
          initStage='threads';lines=await makeProgram(THREAD_VERTEX,THREAD_FRAGMENT,token,extension);if(!lines||!initActive(token))return false;
          await nextSlice();if(!initActive(token))return false;
          initStage='buffers';
          const nextLocations={position:gl.getAttribLocation(main,'aPosition'),normal:gl.getAttribLocation(main,'aNormal')};
          for(const name of ['Viewport','Center','Radius','Time','Seed','Energy','Hover','Scale','Kind','Opacity'])nextLocations[name]=gl.getUniformLocation(main,'u'+name);
          const nextLineLocations={parameter:gl.getAttribLocation(lines,'aParameter')};
          for(const name of ['Viewport','A','B','Bend','Width','Time','Energy','Opacity','Seed'])nextLineLocations[name]=gl.getUniformLocation(lines,'u'+name);
          const values=[];for(let i=0;i<28;i++){const a=i/28,b=(i+1)/28;values.push(a,-1,b,-1,a,1,a,1,b,-1,b,1);}
          const nextLineBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,nextLineBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);
          sphere=sphere||sphereMesh();program=main;lineProgram=lines;lineBuffer=nextLineBuffer;locations=nextLocations;lineLocations=nextLineLocations;
          gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(0,0,0,0);
          initialized=true;error=null;initStage='ready';if(fallback)fallback.style.display='none';request();return true;
        }catch(failure){
          if(!initActive(token))return false;
          if(main)gl.deleteProgram(main);if(lines)gl.deleteProgram(lines);
          error=String(failure.message||failure);program=lineProgram=null;initialized=true;initStage='fallback';makeFallback();request();return Boolean(fallbackCtx);
        }finally{if(token===initEpoch)initializing=null;}
      })();
      return initializing;
    }
    async function ensureMesh(node){
      if(node.mesh)return node.mesh;if(node.building)return node.building;
      node.building=(async()=>{const started=performance.now();const mesh=await buildMesh(node.index,(width||window.innerWidth)<600);meshBuildMs+=performance.now()-started;if(disposed)return null;node.mesh=mesh;node.reveal=wanted&&moves()?0:1;request();return mesh;})();
      try{return await node.building;}catch(failure){error='mesh: '+String(failure.message||failure);return null;}finally{node.building=null;}
    }
    function prepare(){
      if(disposed)return Promise.resolve(false);if(preparing)return preparing;
      const job=(async()=>{
        resize();if(!await init())return false;
        const epoch=initEpoch;
        // Prepare every branch serially during resource loading. Starting three
        // mesh builders from a click stacked their first CPU slices; uploading
        // only when drawn then added GPU work to the same transition.
        for(const node of nodes){
          if(disposed||epoch!==initEpoch)return false;
          const mesh=await ensureMesh(node);if(!mesh)return false;
          await nextSlice();
          if(disposed||epoch!==initEpoch)return false;
          if(program&&!lost)bufferFor(mesh);
        }
        if(program&&!lost){bufferFor(sphere);gl.flush();}
        return !disposed&&Boolean(program||fallbackCtx);
      })().then(ready=>{if(!ready&&preparing===job)preparing=null;return ready;},failure=>{if(preparing===job){error=String(failure.message||failure);preparing=null;}return false;});
      preparing=job;return job;
    }
    function targets(animate=moves()&&wanted){
      if(!width||!height)return;const compact=width<540;
      const radius=clamp(Math.min(width*(compact?.17:.15),height*.27),compact?35:48,compact?82:185);
      const overview={root:[.44,.47,1,1],insight:[.16,.23,.39,1],ward:[.81,.29,.42,1],crossing:[.67,.79,.38,1]};
      if(compact)Object.assign(overview,{root:[.49,.48,1,1],insight:[.19,.22,.47,1],ward:[.80,.26,.47,1],crossing:[.51,.81,.46,1]});
      const positions={};
      for(const id of IDS){const branch=Object.keys(BRANCHES).find(key=>BRANCHES[key].includes(id));positions[id]=overview[id]||[...overview[branch].slice(0,2),.1,0];}
      if(state.branch){
        positions.root=[.10,.55,.50,1];const line=compact?[[.29,.31],[.49,.58],[.70,.30],[.89,.54]]:[[.29,.43],[.49,.22],[.69,.53],[.88,.26]];
        BRANCHES[state.branch].forEach((id,i)=>{positions[id]=[...line[i],i===0?.35:.29,1];});
        Object.keys(BRANCHES).filter(key=>key!==state.branch).forEach((key,i)=>{positions[key]=[.09,i?.86:.15,.2,.13];});
      }
      for(const node of nodes){const [x,y,r,opacity]=positions[node.id];node.from={x:node.x,y:node.y,r:node.r,opacity:node.opacity};node.target={x:x*width,y:y*height,r:radius*r,opacity};if(!animate||!node.r)Object.assign(node,node.target);}
      transitionAt=performance.now();transitioning=Boolean(animate);lastLayout='';request();
    }
    function resize(){
      if(disposed)return;const box=canvas.getBoundingClientRect(),nextWidth=Math.round(box.width),nextHeight=Math.round(box.height);if(!nextWidth||!nextHeight)return;
      const budget=nextWidth<600?850000:1800000,nextDpr=Math.min(devicePixelRatio||1,nextWidth<600?1.35:1.5,Math.sqrt(budget/(nextWidth*nextHeight)))*quality;
      if(nextWidth===width&&nextHeight===height&&Math.abs(nextDpr-dpr)<.001){if(fallback&&(fallback.width!==canvas.width||fallback.height!==canvas.height)){fallback.width=canvas.width;fallback.height=canvas.height;}return;}
      width=nextWidth;height=nextHeight;dpr=nextDpr;canvas.width=Math.max(1,Math.round(width*dpr));canvas.height=Math.max(1,Math.round(height*dpr));if(fallback){fallback.width=canvas.width;fallback.height=canvas.height;}targets(false);
    }
    function screenNode(node){const depth=node.id==='root'?1:.52;return {x:node.x+pointer.x*depth,y:node.y+pointer.y*depth,r:node.r,opacity:node.opacity};}
    function bufferFor(mesh){let buffer=buffers.get(mesh.key);if(!buffer){buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,mesh.vertices,gl.STATIC_DRAW);buffers.set(mesh.key,buffer);}return buffer;}
    function bindMesh(mesh){gl.bindBuffer(gl.ARRAY_BUFFER,bufferFor(mesh));gl.enableVertexAttribArray(locations.position);gl.vertexAttribPointer(locations.position,3,gl.FLOAT,false,24,0);gl.enableVertexAttribArray(locations.normal);gl.vertexAttribPointer(locations.normal,3,gl.FLOAT,false,24,12);}
    function drawThreads(){
      gl.disable(gl.CULL_FACE);gl.useProgram(lineProgram);gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);gl.enableVertexAttribArray(lineLocations.parameter);gl.vertexAttribPointer(lineLocations.parameter,2,gl.FLOAT,false,0,0);
      // The mesh normal attribute may share another slot; no stale enabled buffers.
      if(locations.normal!==lineLocations.parameter)gl.disableVertexAttribArray(locations.normal);
      if(locations.position!==lineLocations.parameter)gl.disableVertexAttribArray(locations.position);
      gl.uniform2f(lineLocations.Viewport,width,height);gl.uniform1f(lineLocations.Time,clock);gl.depthMask(false);
      for(const node of nodes){if(node.opacity<.02||!PARENTS.has(node.id))continue;const a=screenNode(byId.get(PARENTS.get(node.id))),b=screenNode(node),distance=Math.hypot(b.x-a.x,b.y-a.y);if(distance<12)continue;
        gl.uniform2f(lineLocations.A,a.x,a.y);gl.uniform2f(lineLocations.B,b.x,b.y);gl.uniform1f(lineLocations.Bend,clamp(distance*.2,18,95)*(node.index%2?-1:1));gl.uniform1f(lineLocations.Width,node.energy>.65?2.2:1.6);gl.uniform1f(lineLocations.Energy,node.energy);gl.uniform1f(lineLocations.Opacity,node.opacity*(node.energy>.1?.8:.36));gl.uniform1f(lineLocations.Seed,node.index*.23);gl.drawArrays(gl.TRIANGLES,0,28*6);drawCalls++;}
      gl.depthMask(true);gl.enable(gl.CULL_FACE);
    }
    function drawOrb(node){
      if(node.opacity<.02||node.r<2)return;const at=screenNode(node),mesh=node.mesh||sphere;
      gl.uniform2f(locations.Center,at.x,at.y);gl.uniform1f(locations.Radius,at.r*1.10);gl.uniform1f(locations.Seed,node.index*1.217+.61);gl.uniform1f(locations.Energy,node.energy);gl.uniform1f(locations.Hover,node.hover);gl.uniform1f(locations.Opacity,node.opacity);
      // The dark inner mass recedes as the contract opens. It is real depth-tested
      // geometry, visible through cavities, not a screen-space glow overlay.
      if(node.seal>.05){gl.uniform1f(locations.Kind,1);gl.uniform1f(locations.Scale,.045+node.seal*.685);bindMesh(sphere);gl.drawArrays(gl.TRIANGLES,0,sphere.count);drawCalls++;triangles+=sphere.count/3;}
      else{bindMesh(sphere);gl.uniform1f(locations.Kind,2);for(let i=0;i<3;i++){gl.uniform2f(locations.Center,at.x+Math.sin(i*2.3+node.index)*at.r*.16,at.y+Math.cos(i*2.1+node.index)*at.r*.13);gl.uniform1f(locations.Scale,.012+i*.004);gl.drawArrays(gl.TRIANGLES,0,sphere.count);drawCalls++;triangles+=sphere.count/3;}gl.uniform2f(locations.Center,at.x,at.y);}
      gl.uniform1f(locations.Kind,0);gl.uniform1f(locations.Scale,1);bindMesh(mesh);gl.uniform1f(locations.Opacity,node.opacity*(node.mesh?node.reveal:.35));gl.drawArrays(gl.TRIANGLES,0,mesh.count);drawCalls++;triangles+=mesh.count/3;
    }
    function drawFallback(){
      if(!fallbackCtx)return;fallback.style.display='block';const ctx=fallbackCtx;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
      for(const node of nodes){if(node.opacity<.02||!node.mesh)continue;const at=screenNode(node),data=node.mesh.vertices,faces=[],stride=Math.max(18,Math.ceil(data.length/18/1100)*18),ry=node.index*1.217+.61+clock*.02,cy=Math.cos(ry),sy=Math.sin(ry);
        for(let i=0;i<data.length;i+=stride){const pts=[];let z=0,light=0;for(let j=0;j<3;j++){const k=i+j*6;if(k+5>=data.length)continue;const x=data[k]*cy+data[k+2]*sy,pz=-data[k]*sy+data[k+2]*cy,y=data[k+1];pts.push([at.x+x*at.r*1.10,at.y-y*at.r*1.10]);z+=pz;light+=Math.max(0,data[k+3]*-.4+data[k+4]*.65+data[k+5]*.7);}if(pts.length===3)faces.push({pts,z,light:light/3});}
        faces.sort((a,b)=>a.z-b.z);ctx.globalAlpha=node.opacity;for(const face of faces){const base=22+face.light*76,energy=node.energy;ctx.fillStyle=`rgb(${Math.round(base+energy*9)},${Math.round(base+energy*3)},${Math.round(base+4)})`;ctx.beginPath();ctx.moveTo(...face.pts[0]);ctx.lineTo(...face.pts[1]);ctx.lineTo(...face.pts[2]);ctx.closePath();ctx.fill();}ctx.globalAlpha=1;
      }
    }
    function publish(now,force=false){
      // Labels and hit targets share the exact rendered pose. Throttling this
      // callback independently made a smooth 60 Hz scene carry 15 Hz labels.
      const value=nodes.map(node=>({...screenNode(node),id:node.id,visible:node.opacity>.3,status:statusOf(node.id)}));
      const stamp=value.map(n=>n.id+':'+Math.round(n.x*10)+','+Math.round(n.y*10)+','+Math.round(n.r*10)+','+Math.round(n.opacity*100)+','+n.status).join('|');if(stamp===lastLayout&&!force)return;lastLayout=stamp;layout=value;onLayout?.(value);
    }
    function draw(now){
      const begin=performance.now();drawCalls=triangles=0;
      if(gl&&program&&!lost){gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);drawThreads();gl.useProgram(program);gl.uniform2f(locations.Viewport,width,height);gl.uniform1f(locations.Time,clock);for(const node of nodes)drawOrb(node);}else drawFallback();
      publish(now);cpuMs=performance.now()-begin;renderCount++;
    }
    function tick(now){
      frame=0;if(disposed||!wanted||document.hidden)return;
      lastRaf=now;
      const animated=moves(),interval=program&&!lost?1000/60:1000/18,elapsed=lastPaint?now-lastPaint:interval;
      if(animated&&elapsed<interval-.35){request();return;}
      const presented=lastTick?now-lastTick:interval,dt=lastTick?Math.min(presented/1000,.075):0;avgFrame=mix(avgFrame,Math.min(presented,120),.04);lastTick=now;lastPaint=animated&&lastPaint?lastPaint+interval*Math.max(1,Math.floor(elapsed/interval)):now;if(animated)clock+=dt;
      if(transitioning){const t=animated?ease((now-transitionAt)/620):1;for(const node of nodes)for(const key of ['x','y','r','opacity'])node[key]=mix(node.from[key],node.target[key],t);if(t>=1)transitioning=false;}
      const smoothing=animated?1-Math.exp(-dt*8):1,materialEase=animated?1-Math.exp(-dt*5.4):1;
      pointer.x=mix(pointer.x,animated?aim.x:0,smoothing);pointer.y=mix(pointer.y,animated?aim.y:0,smoothing);
      for(const node of nodes){const goal=materialFor(node.id);node.energy=mix(node.energy,goal.energy,materialEase);node.seal=mix(node.seal,goal.seal,materialEase);node.hover=mix(node.hover,node.id===hovered||node.id===state.selected?1:0,smoothing);if(node.mesh)node.reveal=mix(node.reveal,1,animated?1-Math.exp(-dt*11):1);}
      draw(now);
      // Adapt on observed presentation cadence, not merely JavaScript submission.
      if(animated&&program&&!lost&&now-qualityAt>1800){if(avgFrame>25)slowFrames++;else slowFrames=Math.max(0,slowFrames-1);if(slowFrames>45&&quality>.68){quality=Math.max(.68,quality-.12);qualityAt=now;slowFrames=0;resize();}}
      if(animated||transitioning)request();
    }
    function request(){if(!disposed&&wanted&&(initialized||fallbackCtx)&&!document.hidden&&!frame)frame=requestAnimationFrame(tick);}
    function start(){if(disposed)return;wanted=true;lastTick=lastPaint=lastRaf=0;qualityAt=performance.now();resize();prepare().then(()=>request());request();}
    function stop(){wanted=false;cancelAnimationFrame(frame);frame=0;lastTick=lastRaf=0;}
    function setState(value={}){
      if(disposed)return;const oldBranch=state.branch;
      if(IDS.includes(value.selected))state.selected=value.selected;if('branch'in value)state.branch=BRANCHES[value.branch]?value.branch:null;
      if(Array.isArray(value.unlocked)||value.unlocked instanceof Set)state.unlocked=new Set(['root',...value.unlocked].filter(id=>IDS.includes(id)));
      if(typeof value.motion==='boolean')state.motion=value.motion;
      if('hovered'in value)hovered=IDS.includes(value.hovered)?value.hovered:null;
      if(oldBranch!==state.branch)targets(moves()&&wanted);
      if(!moves()){pointer=aim={x:0,y:0};if(transitioning){nodes.forEach(node=>Object.assign(node,node.target));transitioning=false;}for(const node of nodes)Object.assign(node,materialFor(node.id));}
      lastLayout='';request();
    }
    function hit(x,y){return nodes.filter(node=>node.opacity>.3).map(node=>({node,at:screenNode(node)})).filter(({at})=>Math.hypot(x-at.x,y-at.y)<=at.r*1.15).sort((a,b)=>Math.hypot(x-a.at.x,y-a.at.y)-Math.hypot(x-b.at.x,y-b.at.y))[0]?.node.id||null;}
    function pointerMove(event){if(!wanted||document.hidden)return;const box=canvas.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;if(event.pointerType!=='touch')aim={x:(x/width-.5)*10,y:(y/height-.5)*7};const id=hit(x,y);if(id!==hovered){hovered=id;canvas.style.cursor=id?'pointer':'';onNodeHover?.(id);request();}}
    function pointerLeave(){aim={x:0,y:0};if(hovered){hovered=null;canvas.style.cursor='';onNodeHover?.(null);}request();}
    function click(event){if(!wanted)return;const b=canvas.getBoundingClientRect(),id=hit(event.clientX-b.left,event.clientY-b.top);if(id)onNodeClick?.(id);}
    function visibility(){cancelAnimationFrame(frame);frame=0;lastTick=lastPaint=lastRaf=0;if(!document.hidden)request();}
    function reduce(){if(!moves()){for(const node of nodes){if(node.target)Object.assign(node,node.target);Object.assign(node,materialFor(node.id));}transitioning=false;pointer=aim={x:0,y:0};}request();}
    function contextLost(event){event.preventDefault();lost=true;initialized=false;++initEpoch;initializing=preparing=null;initStage='lost';program=lineProgram=lineBuffer=null;buffers.clear();makeFallback();request();}
    function contextRestored(){lost=false;initialized=false;++initEpoch;initializing=preparing=null;program=lineProgram=lineBuffer=null;buffers.clear();prepare().then(()=>request());}
    canvas.addEventListener('pointermove',pointerMove,{passive:true});canvas.addEventListener('pointerleave',pointerLeave);canvas.addEventListener('click',click);canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);
    document.addEventListener('visibilitychange',visibility);media.addEventListener('change',reduce);
    const observer=typeof ResizeObserver==='function'?new ResizeObserver(resize):null;observer?.observe(canvas);window.addEventListener('resize',resize);resize();
    return Object.freeze({prepare,setState,resize,start,stop,dispose(){
      if(disposed)return;stop();disposed=true;++initEpoch;initializing=preparing=null;observer?.disconnect();window.removeEventListener('resize',resize);canvas.removeEventListener('pointermove',pointerMove);canvas.removeEventListener('pointerleave',pointerLeave);canvas.removeEventListener('click',click);canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);document.removeEventListener('visibilitychange',visibility);media.removeEventListener('change',reduce);fallback?.remove();
      if(gl&&!lost){for(const buffer of buffers.values())gl.deleteBuffer(buffer);if(lineBuffer)gl.deleteBuffer(lineBuffer);if(program)gl.deleteProgram(program);if(lineProgram)gl.deleteProgram(lineProgram);gl.getExtension('WEBGL_lose_context')?.loseContext();}buffers.clear();
    },getState:()=>({running:wanted&&!document.hidden,framePending:Boolean(frame),transitioning,width,height,dpr,selected:state.selected,branch:state.branch,unlocked:[...state.unlocked],hovered,motion:moves(),textureReady:true,
      liquid:{ready:Boolean(program||fallbackCtx),mode:program&&!lost?'procedural-webgl':'procedural-cpu',error,lost},
      renderer:{mode:program&&!lost?'webgl-mesh':'cpu-mesh',ready:Boolean(program||fallbackCtx),initStage,parallelCompile,lost,error,pixelBudget:width<600?850000:1800000,pixels:canvas.width*canvas.height,drawCalls,triangles,cpuMs,avgFrameMs:avgFrame,quality,renderCount,meshBuildMs,preparedMeshes:nodes.filter(node=>node.mesh).length,uploadedMeshes:buffers.size},
      materials:nodes.map(node=>({id:node.id,status:statusOf(node.id),seed:17+node.index*29,geometryKey:node.mesh?.key||`pending-${node.index}`,vertices:node.mesh?.count||0,energy:node.energy,seal:node.seal,hover:node.hover,reveal:node.reveal})),visibleNodes:layout.filter(node=>node.visible).length,layout:layout.map(node=>({...node}))})});
  }
  window.InfiniteCovenantScene=Object.freeze({create});
})();
