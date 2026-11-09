/* A single travelling fault folds the live hub photograph into a voxel relief.
   The page owns animation timing; this renderer never starts its own RAF loop. */
(() => {
  'use strict';
  const STOPS=[{u:.10,v:.66},{u:.26,v:.42},{u:.42,v:.63},{u:.58,v:.38},{u:.74,v:.58},{u:.90,v:.40}];
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
  const mix=(a,b,t)=>a+(b-a)*t;
  const smooth=(a,b,value)=>{const t=clamp((value-a)/(b-a));return t*t*(3-2*t);};
  const hash=(u,v)=>{const value=Math.sin(u*127.1+v*311.7+29.36)*43758.5453;return value-Math.floor(value);};
  function rawHeight(u,v){
    const spine=.36+.07*Math.sin(u*9.4)+.026*Math.sin(u*23);
    const ridge=Math.exp(-Math.pow((v-spine)/.135,2));
    const peaks=.28+.25*Math.pow(Math.sin(u*18.6+.3),2)+.15*Math.pow(Math.sin(u*31.4),2);
    const foothill=.13*Math.exp(-Math.pow((v-.66-.035*Math.sin(u*14))/.14,2));
    const detail=.032*Math.sin(u*83+v*17)+.019*Math.sin(v*95-u*21)+.011*Math.cos(u*157+v*153);
    return Math.max(.038,.052+ridge*peaks+foothill+detail);
  }
  function heightAt(u,v){
    let value=rawHeight(u,v);
    for(const stop of STOPS){
      const d=Math.hypot((u-stop.u)/.031,(v-stop.v)/.075);
      if(d<1.5)value=mix(rawHeight(stop.u,stop.v),value,smooth(.60,1.5,d));
    }
    // A stepped surface leaves small, readable terraces around each landmark.
    return Math.round(value/.023)*.023;
  }
  function silhouetteAt(u,v){
    const start=.10+.035*Math.sin(u*19)+.022*Math.cos(u*37);
    const end=.90+.032*Math.sin(u*26+.4)+.021*Math.cos(u*45);
    return smooth(start-.035,start+.025,v)*(1-smooth(end-.025,end+.035,v))*smooth(.005,.045,u)*(1-smooth(.955,.995,u));
  }
  function localPhase(u,v,progress){return smooth(0,.90,progress*1.65-u*.64-v*.08);}
  function position(u,v,elevation,width,height,state,progress=state.progress){
    const t=localPhase(u,v,progress),crest=Math.pow(Math.sin(Math.PI*t),2);
    const tx=width*(.05+.90*u+.07*(v-.5))+state.pointerX*(3+elevation*11);
    const ty=height*(.69+.32*(v-.5)-.36*elevation)+state.pointerY*(2+elevation*7);
    return {x:mix(u*width,tx,t),y:mix(v*height,ty,t)-height*.14*crest,scale:.93+v*.12};
  }
  const vertex=`
    precision highp float;
    attribute vec3 corner,normal;
    attribute vec4 cell;
    attribute vec4 detail;
    uniform vec2 size,pointer;
    uniform vec2 grid;
    uniform float progress,pass;
    varying vec2 photoUV,mapUV;
    varying vec3 surface,localPoint;
    varying vec4 values;
    varying float materialHeight,topVoxel;
    float ease(float a,float b,float v){float t=clamp((v-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
    void main(){
      if(pass>.5){photoUV=corner.xy+.5;gl_Position=vec4(corner.x*2.,-corner.y*2.,.99,1.);return;}
      float t=ease(0.,.90,progress*1.65-cell.x*.64-cell.y*.08);
      float swell=pow(sin(t*3.14159265),2.);
      float spin=sin(t*3.14159265)*(.18+cell.w*.23);
      float cs=cos(spin),sn=sin(spin);
      mat3 turn=mat3(cs,sn,0.,-sn,cs,0.,0.,0.,1.);
      vec3 p=turn*corner,n=turn*normal;
      float u=cell.x+p.x/grid.x*mix(1.,.974,t);
      float v=cell.y+p.z/grid.y*mix(1.,.974,t);
      // The same local Y axis points down in both camera poses. Reversing it
      // during interpolation makes every cube collapse into a thin plate.
      float elevation=detail.y+(.5-p.y)*(cell.z-detail.y);
      vec2 target=vec2(size.x*(.05+.90*u+.07*(v-.5)),size.y*(.69+.32*(v-.5)-.36*elevation));
      target+=pointer*vec2(3.+elevation*11.,2.+elevation*7.);
      vec2 start=vec2((cell.x+p.x/grid.x)*size.x,(cell.y+p.y/grid.y)*size.y);
      vec2 point=mix(start,target,t);
      point.y-=size.y*.14*swell;
      point.x+=swell*sin(cell.w*6.28318)*size.x*.003;
      float depth=mix(-p.z*.006,-((v-.5)*.70+elevation*.28),t)-swell*.08;
      gl_Position=vec4(point.x/size.x*2.-1.,1.-point.y/size.y*2.,depth,1.);
      photoUV=vec2(cell.x+corner.x/grid.x,cell.y+corner.y/grid.y);
      mapUV=vec2(cell.x+corner.x/grid.x,cell.y+corner.z/grid.y);
      surface=n;localPoint=corner;
      values=vec4(t,cell.w,detail.x,normal.z);
      materialHeight=elevation;
      topVoxel=detail.z;
    }`;
  const fragment=`
    precision highp float;
    uniform sampler2D source,pigment;
    uniform vec2 sourceScale,selected;
    uniform float progress,pass,completed,hasSource,hasPigment,time;
    varying vec2 photoUV,mapUV;
    varying vec3 surface,localPoint;
    varying vec4 values;
    varying float materialHeight,topVoxel;
    float ease(float a,float b,float v){float t=clamp((v-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
    void main(){
      vec3 photograph=texture2D(source,photoUV*sourceScale).rgb;
      if(pass>.5){
        if(hasSource<.5)discard;
        if(progress*1.65-photoUV.x*.64-photoUV.y*.08>.034)discard;
        gl_FragColor=vec4(photograph,1.);return;
      }
      float t=values.x;
      float alpha=mix(1.,values.z,ease(.37,1.,t))*mix(ease(.13,.38,t),1.,topVoxel);
      if(alpha<.008)discard;
      vec3 n=normalize(surface);
      float diffuse=max(0.,dot(n,normalize(vec3(-.54,-.81,.26))));
      float light=.47+.69*diffuse;
      float elevation=clamp(materialHeight*1.55,0.,1.);
      vec3 earth=mix(vec3(.16,.225,.205),vec3(.43,.43,.36),elevation);
      earth=mix(earth,texture2D(pigment,mapUV).rgb,.62*hasPigment);
      earth*=.88+values.y*.19;
      vec3 ink=mix(vec3(.035,.044,.047),vec3(.105,.115,.115),elevation);
      ink*=.90+values.y*.12;
      float explored=completed>=5.999?1.:completed<.001?0.:1.-ease(completed/6.-.014,completed/6.+.014,mapUV.x);
      vec3 stone=mix(ink,earth,explored);
      float top=step(.5,-n.y);
      float seam=abs(fract(materialHeight/.023+.015)-.5)*2.;
      float strata=mix(1.,.79,ease(.85,1.,seam))*(.92+.08*top);
      stone*=light*mix(strata,1.,top);
      float rim=max(abs(localPoint.x),abs(localPoint.z));
      stone*=1.-ease(.425,.5,rim)*.12*top;
      float halo=exp(-dot((mapUV-selected)*vec2(15.,8.),(mapUV-selected)*vec2(15.,8.)));
      stone+=vec3(.014,.016,.016)*halo*(.8+.2*sin(time*.65));
      float face=max(values.w,0.)*(1.-ease(.045,.67,t))*hasSource*topVoxel;
      vec3 color=mix(stone,photograph,face);
      color=mix(color,vec3(.033,.044,.049),ease(.52,.05,mapUV.y)*.22*t);
      gl_FragColor=vec4(color*alpha,alpha);
    }`;
  function mesh(){
    const values=[];
    function face(n,right,down){for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]])values.push(...n.map((v,i)=>(v+a*right[i]+b*down[i])*.5),...n);}
    face([0,0,1],[1,0,0],[0,1,0]);face([0,0,-1],[-1,0,0],[0,1,0]);
    face([0,1,0],[1,0,0],[0,0,1]);face([0,-1,0],[1,0,0],[0,0,-1]);
    face([1,0,0],[0,0,-1],[0,1,0]);face([-1,0,0],[0,0,1],[0,1,0]);
    return new Float32Array(values);
  }
  function create(canvas,callbacks={}){
    if(!canvas||typeof canvas.getContext!=='function')throw new TypeError('A canvas is required.');
    const state={progress:0,completedCount:0,selectedIndex:0,pointerX:0,pointerY:0,time:0};
    let width=1,height=1,columns=96,rows=54,cellData=[],instanceCount=0,sourceImage=null,pigmentImage=null;
    let gl=null,extension=null,program=null,meshBuffer=null,cellBuffer=null,sourceTexture=null,pigmentTexture=null,uniforms={},attributes={};
    let fallbackCanvas=null,ctx=null,lost=false,disposed=false,backend='canvas2d',error='',frames=0;
    const shaders=[];const originalVisibility=canvas.style.visibility;
    function report(problem){error=problem?.message||String(problem);callbacks.onError?.(new Error(error));}
    function compile(kind,text){const shader=gl.createShader(kind);shaders.push(shader);gl.shaderSource(shader,text);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(shader));return shader;}
    function upload(texture,image,placeholder){
      gl.bindTexture(gl.TEXTURE_2D,texture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
      if(image&&(image.naturalWidth||image.width)>0)gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
      else gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(placeholder));
    }
    function setupGL(){
      gl=canvas.getContext('webgl',{alpha:true,antialias:true,depth:true,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:false});
      if(!gl)return false;
      extension=gl.getExtension('ANGLE_instanced_arrays');if(!extension)return false;
      program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
      for(const key of ['size','pointer','grid','progress','pass','completed','selected','sourceScale','hasSource','hasPigment','time','source','pigment'])uniforms[key]=gl.getUniformLocation(program,key);
      for(const key of ['corner','normal','cell','detail'])attributes[key]=gl.getAttribLocation(program,key);
      meshBuffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,meshBuffer);gl.bufferData(gl.ARRAY_BUFFER,mesh(),gl.STATIC_DRAW);
      cellBuffer=gl.createBuffer();sourceTexture=gl.createTexture();pigmentTexture=gl.createTexture();
      upload(sourceTexture,sourceImage,[6,9,12,255]);upload(pigmentTexture,pigmentImage,[60,74,65,255]);backend='webgl';return true;
    }
    function useFallback(){
      if(!ctx){
        if(!gl)ctx=canvas.getContext('2d',{alpha:true});
        if(!ctx){fallbackCanvas=document.createElement('canvas');fallbackCanvas.className='world-map-terrain-fallback';fallbackCanvas.setAttribute('aria-hidden','true');Object.assign(fallbackCanvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none'});canvas.insertAdjacentElement('afterend',fallbackCanvas);ctx=fallbackCanvas.getContext('2d',{alpha:true});canvas.style.visibility='hidden';}
      }
      backend='canvas2d';
    }
    function buildCells(){
      const spacing=backend==='webgl'?15:27;
      columns=clamp(Math.round(width/spacing),backend==='webgl'?64:34,backend==='webgl'?110:65);
      rows=clamp(Math.round(columns*height/width),24,backend==='webgl'?76:40);
      cellData=[];
      for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){
        const u=(col+.5)/columns,v=(row+.5)/rows;
        cellData.push({u,v,h:heightAt(u,v),seed:hash(col,row),alpha:silhouetteAt(u,v)});
      }
      if(backend==='webgl'){
        const values=[],layerSize=.035;
        for(const cell of cellData){
          const neighbors=[[-1,0],[1,0],[0,-1],[0,1]].map(([x,y])=>{
            const u=cell.u+x/columns,v=cell.v+y/rows;
            return u<0||u>1||v<0||v>1||silhouetteAt(u,v)<.4?0:heightAt(u,v);
          });
          const floor=Math.min(...neighbors),layers=Math.ceil(cell.h/layerSize);
          for(let layer=0;layer<layers;layer++){
            const base=layer*layerSize,top=Math.min(cell.h,base+layerSize),isTop=layer===layers-1;
            // Fully buried cubes are omitted. Visible cliffs remain true cubes,
            // rather than tall columns masquerading as a voxel landscape.
            if(!isTop&&top<floor-.001)continue;
            values.push(cell.u,cell.v,top,cell.seed,cell.alpha,base,isTop?1:0,cell.h);
          }
        }
        instanceCount=values.length/8;
        gl.bindBuffer(gl.ARRAY_BUFFER,cellBuffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);
      }
    }
    function resize(){
      if(disposed)return;
      const rect=canvas.getBoundingClientRect();width=Math.max(1,rect.width||canvas.clientWidth||innerWidth);height=Math.max(1,rect.height||canvas.clientHeight||innerHeight);
      const max=backend==='webgl'?Math.min(4096,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE)):2800;
      const dpr=Math.max(.5,Math.min(window.devicePixelRatio||1,backend==='webgl'?1.5:1.2,max/width,max/height));
      const target=fallbackCanvas||canvas;target.width=Math.max(1,Math.round(width*dpr));target.height=Math.max(1,Math.round(height*dpr));
      if(backend==='webgl'){canvas.width=target.width;canvas.height=target.height;gl.viewport(0,0,canvas.width,canvas.height);}
      buildCells();
    }
    function bindAttribute(name,count,stride,offset,divisor){const location=attributes[name];if(location<0)return;gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,count,gl.FLOAT,false,stride*4,offset*4);extension.vertexAttribDivisorANGLE(location,divisor);}
    function drawGL(){
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);gl.enable(gl.BLEND);gl.blendFunc(gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.CULL_FACE);
      gl.bindBuffer(gl.ARRAY_BUFFER,meshBuffer);bindAttribute('corner',3,6,0,0);bindAttribute('normal',3,6,3,0);
      gl.bindBuffer(gl.ARRAY_BUFFER,cellBuffer);bindAttribute('cell',4,8,0,1);bindAttribute('detail',4,8,4,1);
      gl.uniform2f(uniforms.size,width,height);gl.uniform2f(uniforms.pointer,state.pointerX,state.pointerY);gl.uniform2f(uniforms.grid,columns,rows);
      gl.uniform1f(uniforms.progress,state.progress);gl.uniform1f(uniforms.completed,state.completedCount);gl.uniform1f(uniforms.time,state.time*.001);
      const stop=STOPS[state.selectedIndex]||STOPS[0];gl.uniform2f(uniforms.selected,stop.u,stop.v);
      const sourceWidth=sourceImage?Math.min(width,height*(sourceImage.naturalWidth||sourceImage.width)/(sourceImage.naturalHeight||sourceImage.height)):width;
      gl.uniform2f(uniforms.sourceScale,width/Math.max(1,sourceWidth),1);
      gl.uniform1f(uniforms.hasSource,sourceImage?1:0);gl.uniform1f(uniforms.hasPigment,pigmentImage?1:0);
      gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,sourceTexture);gl.uniform1i(uniforms.source,0);
      gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,pigmentTexture);gl.uniform1i(uniforms.pigment,1);
      gl.disable(gl.DEPTH_TEST);gl.depthMask(false);gl.uniform1f(uniforms.pass,1);extension.drawArraysInstancedANGLE(gl.TRIANGLES,0,6,1);
      if(state.progress===0&&sourceImage){gl.depthMask(true);return;}
      gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.depthMask(true);gl.uniform1f(uniforms.pass,0);extension.drawArraysInstancedANGLE(gl.TRIANGLES,0,36,instanceCount);
    }
    function draw2D(){
      if(!ctx)return;
      const target=fallbackCanvas||canvas;ctx.setTransform(target.width/width,0,0,target.height/height,0,0);ctx.clearRect(0,0,width,height);
      if(sourceImage&&state.progress<1){const sourceWidth=Math.min(width,height*(sourceImage.naturalWidth||sourceImage.width)/(sourceImage.naturalHeight||sourceImage.height));ctx.drawImage(sourceImage,0,0,sourceWidth,height);ctx.fillStyle=`rgba(7,11,14,${smooth(0,.72,state.progress)})`;ctx.fillRect(0,0,width,height);}
      if(state.progress<=0&&sourceImage)return;
      const ordered=cellData.slice().sort((a,b)=>a.v-b.v||b.h-a.h);
      function polygon(points,color,alpha){ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();points.forEach((point,i)=>ctx[i?'lineTo':'moveTo'](point.x,point.y));ctx.closePath();ctx.fill();}
      for(const cell of ordered){
        const t=localPhase(cell.u,cell.v,state.progress),alpha=mix(1,cell.alpha,smooth(.37,1,t))*smooth(0,.12,t);if(alpha<.005)continue;
        const du=.49/columns,dv=.49/rows;
        const top=[[-du,-dv],[du,-dv],[du,dv],[-du,dv]].map(([u,v])=>position(cell.u+u,cell.v+v,cell.h,width,height,state));
        const bottom=[[-du,-dv],[du,-dv],[du,dv],[-du,dv]].map(([u,v])=>position(cell.u+u,cell.v+v,0,width,height,state));
        const colored=state.completedCount>=6||cell.u<state.completedCount/6;
        const light=cell.h*70+cell.seed*8;
        const rgb=colored?[42+light*.9,57+light,50+light*.8]:[12+light*.30,16+light*.32,18+light*.32];
        const color=f=>`rgb(${rgb.map(v=>Math.round(v*f)).join(',')})`;
        polygon([top[1],top[2],bottom[2],bottom[1]],color(.60),alpha);
        polygon([top[2],top[3],bottom[3],bottom[2]],color(.78),alpha);
        polygon(top,color(1.25),alpha);
      }
      ctx.globalAlpha=1;
    }
    function render(){if(disposed)return false;try{if(backend==='webgl'&&!lost)drawGL();else draw2D();frames++;callbacks.onFrame?.({progress:state.progress,backend});return true;}catch(problem){report(problem);useFallback();resize();draw2D();return false;}}
    function prepare({source=null,texture=null}={}){
      if(disposed)return false;sourceImage=source; pigmentImage=texture;
      if(backend==='webgl'&&!lost){try{upload(sourceTexture,sourceImage,[6,9,12,255]);upload(pigmentTexture,pigmentImage,[60,74,65,255]);}catch(problem){report(problem);useFallback();resize();}}
      render();return true;
    }
    function setState(value={}){
      for(const key of ['progress','completedCount','selectedIndex','pointerX','pointerY','time'])if(Number.isFinite(value[key]))state[key]=value[key];
      state.progress=clamp(state.progress);state.completedCount=clamp(state.completedCount,0,6);state.selectedIndex=Math.round(clamp(state.selectedIndex,0,5));state.pointerX=clamp(state.pointerX,-1,1);state.pointerY=clamp(state.pointerY,-1,1);return state;
    }
    function project({u=0,v=0,lift=0}={}){u=clamp(Number(u)||0);v=clamp(Number(v)||0);const point=position(u,v,heightAt(u,v),width,height,state);point.y-=Number(lift)||0;return point;}
    function contextLost(event){event.preventDefault();if(disposed)return;lost=true;useFallback();resize();render();report(new Error('WebGL context lost; using the 2D terrain.'));}
    function contextRestored(){if(disposed)return;try{lost=false;if(setupGL()){error='';fallbackCanvas?.remove();fallbackCanvas=null;ctx=null;canvas.style.visibility=originalVisibility;resize();render();}}catch(problem){report(problem);useFallback();resize();render();}}
    function dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);fallbackCanvas?.remove();canvas.style.visibility=originalVisibility;if(gl&&!gl.isContextLost()){[meshBuffer,cellBuffer].forEach(value=>value&&gl.deleteBuffer(value));[sourceTexture,pigmentTexture].forEach(value=>value&&gl.deleteTexture(value));shaders.forEach(value=>gl.deleteShader(value));if(program)gl.deleteProgram(program);}sourceImage=pigmentImage=null;cellData=[];}
    try{if(!setupGL())useFallback();}catch(problem){report(problem);useFallback();}
    canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);resize();
    return Object.freeze({prepare,setState,render,project,resize,dispose,getState:()=>({backend,progress:state.progress,completedCount:state.completedCount,selectedIndex:state.selectedIndex,columns,rows,instances:backend==='webgl'?instanceCount:cellData.length,width,height,frames,lost,disposed,error})});
  }
  const api=Object.freeze({create,stops:STOPS.map(value=>Object.freeze({...value})),heightAt});
  if(typeof module==='object'&&module.exports)module.exports={heightAt,silhouetteAt,localPhase,position,stops:STOPS};
  else window.InfiniteWorldTerrain=api;
})();
