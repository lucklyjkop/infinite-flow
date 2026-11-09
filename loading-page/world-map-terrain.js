/* A single travelling fault folds the live hub photograph into a voxel relief.
   The page owns animation timing; this renderer never starts its own RAF loop. */
(() => {
  'use strict';
  const STOPS=[{u:.10,v:.66},{u:.26,v:.42},{u:.42,v:.63},{u:.58,v:.38},{u:.74,v:.58},{u:.90,v:.40}];
  const clamp=(value,min=0,max=1)=>Math.max(min,Math.min(max,value));
  const mix=(a,b,t)=>a+(b-a)*t;
  const smooth=(a,b,value)=>{const t=clamp((value-a)/(b-a));return t*t*(3-2*t);};
  const hash=(u,v)=>{const value=Math.sin(u*127.1+v*311.7+29.36)*43758.5453;return value-Math.floor(value);};
  const profiles=new Map();
  const chapterNumber=value=>Math.max(0,Math.min(Number.MAX_SAFE_INTEGER,Math.floor(Number.isFinite(value)?value:0)));
  const palettes=[
    [[.16,.24,.20],[.43,.45,.40],[.15,.27,.28],[.39,.30,.20]],
    [[.24,.20,.16],[.48,.43,.35],[.16,.23,.23],[.46,.32,.21]],
    [[.18,.23,.25],[.44,.49,.50],[.14,.28,.32],[.42,.38,.30]],
    [[.16,.23,.16],[.39,.42,.31],[.12,.23,.21],[.39,.30,.20]],
    [[.20,.23,.26],[.55,.57,.57],[.18,.27,.32],[.38,.34,.29]],
  ];
  function profileFor(chapter=0){
    chapter=chapterNumber(chapter);if(profiles.has(chapter))return profiles.get(chapter);
    const seed=chapter%1000003+1,phase=hash(seed,4)*Math.PI*2;
    const profile={chapter,seed,phase,biome:chapter%palettes.length,palette:palettes[chapter%palettes.length],
      platforms:STOPS.map((_,i)=>.13+.095*hash(seed,i+17)),
      peaks:[.12,.47,.82].map((u,i)=>({u:u+(hash(seed,i+31)-.5)*.10,v:.17+.085*hash(seed,i+42),w:.075+.040*hash(seed,i+81),depth:.105+.055*hash(seed,i+72),height:.44+.22*hash(seed,i+51),lean:(hash(seed,i+93)-.5)*.65,cut:(hash(seed,i+113)-.5)*.025}))};
    profiles.set(chapter,profile);if(profiles.size>8)profiles.delete(profiles.keys().next().value);return profile;
  }
  function noise(u,v,seed){
    const x=Math.floor(u),y=Math.floor(v),a=smooth(0,1,u-x),b=smooth(0,1,v-y);
    return mix(mix(hash(x+seed*3,y),hash(x+1+seed*3,y),a),mix(hash(x+seed*3,y+1),hash(x+1+seed*3,y+1),a),b);
  }
  function riverAt(u,chapter=0){const p=profileFor(chapter);return .57+.12*Math.sin(u*7.1+p.phase)+.027*Math.sin(u*18.4+p.phase*.6);}
  function pathAt(u,chapter=0){
    const p=profileFor(chapter);let i=0;
    while(i<STOPS.length-2&&u>STOPS[i+1].u)i++;
    const a=STOPS[i],b=STOPS[i+1],t=clamp((u-a.u)/(b.u-a.u)),e=smooth(0,1,t);
    return {v:mix(a.v,b.v,e)+Math.sin(Math.PI*t)*.022*Math.sin(p.phase+i*2),height:mix(p.platforms[i],p.platforms[i+1],e)};
  }
  function rawHeight(u,v,chapter=0){
    const p=profileFor(chapter),river=riverAt(u,chapter),riverDistance=Math.abs(v-river),path=pathAt(u,chapter);
    let height=.072+.044*noise(u*5,v*7,p.seed);
    // Unequal, broad massifs form the far ridge. Their sheltered saddles leave
    // generous breathing room for the six landmark tableaux in the valley.
    for(const peak of p.peaks){
      const x=u-peak.u+(v-peak.v)*peak.lean,y=v-peak.v-(u-peak.u)*.30;
      const massif=Math.exp(-Math.pow(x/peak.w,2)-Math.pow(y/peak.depth,2));
      const crags=.75+.38*noise(u*25,v*21,p.seed);
      const gully=1-.38*Math.exp(-Math.pow((x+y*.52+peak.cut)/.017,2));
      height+=peak.height*massif*crags*gully;
      height+=peak.height*.18*Math.exp(-Math.pow((x-.045)/(.05+peak.w*.4),2)-Math.pow((y-.075)/.075,2));
    }
    const nearRidge=.79+.036*Math.sin(u*11+p.phase);
    height+=(.055+.085*noise(u*7,2,p.seed))*Math.exp(-Math.pow((v-nearRidge)/.12,2));
    height+=.028*(noise(u*20,v*17,p.seed)-.5)+.009*Math.sin(u*73+v*61+p.phase);
    height=mix(height,.046+.006*Math.sin(u*9+p.phase),(1-smooth(.021,.076,riverDistance))*.96);
    const road=(1-smooth(.013,.052,Math.abs(v-path.v)))*(1-(1-smooth(.014,.031,riverDistance))*.70);
    return mix(height,path.height,road*.85);
  }
  function heightAt(u,v,chapter=0){
    const p=profileFor(chapter);let value=rawHeight(u,v,chapter);
    for(const stop of STOPS){
      const i=STOPS.indexOf(stop),d=Math.hypot((u-stop.u)/.037,(v-stop.v)/.087);
      if(d<1.5)value=mix(p.platforms[i],value,smooth(.70,1.5,d));
    }
    return Math.round(clamp(value,.036,.85)/.018)*.018;
  }
  function silhouetteAt(u,v,chapter=0){
    const p=profileFor(chapter),start=.075+.027*Math.sin(u*14+p.phase)+.016*Math.cos(u*29);
    const end=.91+.025*Math.sin(u*19+p.phase)+.015*Math.cos(u*31);
    return smooth(start-.035,start+.025,v)*(1-smooth(end-.025,end+.035,v))*smooth(.005,.045,u)*(1-smooth(.955,.995,u));
  }
  function habitatAt(u,v,chapter=0){
    const river=1-smooth(.013,.031,Math.abs(v-riverAt(u,chapter))),path=1-smooth(.010,.027,Math.abs(v-pathAt(u,chapter).v));
    let terrace=0;for(const stop of STOPS)terrace=Math.max(terrace,1-smooth(.65,1.4,Math.hypot((u-stop.u)/.037,(v-stop.v)/.087)));
    return {water:river*(1-terrace),path:path*(1-river*.65),moss:noise(u*9,v*11,profileFor(chapter).seed)};
  }
  function decorationsFor(chapter=0){
    const p=profileFor(chapter);if(p.decorations)return p.decorations.map(item=>({...item}));const items=[];
    function add(u,v,type,scale,nearPath=false){
      if(u<.035||u>.965||v<.09||v>.90||silhouetteAt(u,v,chapter)<.72)return false;
      if(STOPS.some(stop=>Math.abs(stop.u-u)<.065&&Math.abs(stop.v-v)<.16))return false;
      if(!nearPath&&Math.abs(v-pathAt(u,chapter).v)<.045)return false;
      if(items.some(item=>Math.hypot((item.u-u)/.024,(item.v-v)/.065)<.8))return false;
      items.push({u,v,type,scale,lift:0});return true;
    }
    // Groves follow the distant ridge in small irregular groups, rather than
    // a uniform scatter across the playable route and label areas.
    for(let group=0;group<6;group++)for(let j=0;j<5;j++){
      const u=.075+group*.168+(j-2)*.013+(hash(p.seed+group,j)-.5)*.009;
      const v=.125+.09*hash(group+p.seed,12)+.041*hash(group+p.seed,j+9)+.014*(j%2);
      const type=chapter%3===2?11:j===0&&(group%2===0)?0:chapter%3===1||group===3?2:1;
      add(u,v,type,.53+.19*hash(group+p.seed,j+13));
    }
    const shoreGroups=[{u:.065,v:.82},{u:.29,v:.85},{u:.47,v:.80},{u:.69,v:.86},{u:.89,v:.82}];
    for(let group=0;group<shoreGroups.length;group++)for(let j=0;j<4;j++){
      const center=shoreGroups[group],u=center.u+(hash(p.seed+group,j+60)-.5)*.095,v=center.v+(hash(p.seed+group,j+70)-.5)*.09;
      const type=j===0?(chapter%3===2?11:chapter%3===1?2:1):j===2&&group%2===0?7:3;
      add(u,v,type,j===0?.50+.11*hash(group,p.seed):.34+.19*hash(p.seed,j+70));
    }
    const gaps=[.18,.34,.50,.66,.82];
    let falls=0,bridges=0;
    for(const u of gaps){
      const river=riverAt(u,chapter),road=pathAt(u,chapter).v;
      if(falls<3&&Math.abs(river-road)>.07&&add(u,river,4,.52+hash(p.seed,u)*.12))falls++;
      if(bridges<2&&add(u+.012,river+.016,5,.47,true))bridges++;
      add(u-.014,river+.060,9,.39);
    }
    for(const u of [.18,.50])add(u,pathAt(u,chapter).v,6,.40,true);
    add(.66,pathAt(.66,chapter).v,8,.42,true);
    for(const u of [.31,.70])add(u,.24,10,.43);
    // Guarantee a small, bounded set even when a chapter's river is unusually
    // close to the route. Additional accents stay on the unoccupied shore.
    for(let j=0;items.length<45&&j<160;j++){
      const group=shoreGroups[j%shoreGroups.length],u=group.u+(hash(p.seed,j+91)-.5)*.16,v=group.v+(hash(p.seed,j+121)-.5)*.15;
      add(u,v,j%5===0?(chapter%3===2?11:chapter%3===1?2:0):3,.32+.15*hash(p.seed,j+141));
    }
    p.decorations=items.slice(0,60).sort((a,b)=>a.v-b.v||a.u-b.u);return p.decorations.map(item=>({...item}));
  }
  function updateState(state,value={}){
    for(const key of ['progress','completedCount','litCount','chapterIndex','selectedIndex','pointerX','pointerY','time','sourceOffsetX','sourceViewportWidth'])if(Number.isFinite(value[key]))state[key]=value[key];
    state.progress=clamp(state.progress);state.completedCount=clamp(state.completedCount,0,6);
    if(Number.isFinite(value.completedCount)&&!Number.isFinite(value.litCount))state.litCount=Math.min(6,state.completedCount+1);
    state.litCount=clamp(state.litCount,0,6);state.chapterIndex=chapterNumber(state.chapterIndex);
    state.selectedIndex=Math.round(clamp(state.selectedIndex,0,5));state.pointerX=clamp(state.pointerX,-1,1);state.pointerY=clamp(state.pointerY,-1,1);state.sourceViewportWidth=Math.max(0,state.sourceViewportWidth||0);return state;
  }
  function sourceLayout(width,height,imageWidth,imageHeight,state){
    const cssWidth=state.sourceViewportWidth>0?state.sourceViewportWidth:Math.min(width,height*imageWidth/Math.max(1,imageHeight));
    return {width:Math.max(1,cssWidth),scale:width/Math.max(1,cssWidth),offset:(state.sourceOffsetX||0)/Math.max(1,cssWidth)};
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
    attribute vec3 habitat;
    uniform vec2 size,pointer;
    uniform vec2 grid;
    uniform float progress,pass;
    varying vec2 photoUV,mapUV;
    varying vec3 surface,localPoint;
    varying vec4 values;
    varying float materialHeight,topVoxel;
    varying vec3 habitatInfo;
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
      habitatInfo=habitat;
    }`;
  const fragment=`
    precision highp float;
    uniform sampler2D source,pigment;
    uniform vec2 sourceScale,selected;
    uniform float sourceOffset;
    uniform vec3 lowTone,highTone,waterTone,roadTone;
    uniform float progress,pass,lit,hasSource,hasPigment,time;
    varying vec2 photoUV,mapUV;
    varying vec3 surface,localPoint;
    varying vec4 values;
    varying float materialHeight,topVoxel;
    varying vec3 habitatInfo;
    float ease(float a,float b,float v){float t=clamp((v-a)/(b-a),0.,1.);return t*t*(3.-2.*t);}
    void main(){
      vec3 photograph=texture2D(source,photoUV*sourceScale+vec2(sourceOffset,0.)).rgb;
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
      float top=step(.5,-n.y);
      float elevation=clamp(materialHeight*1.55,0.,1.);
      vec3 earth=mix(lowTone,highTone,elevation);
      earth=mix(earth,texture2D(pigment,mapUV).rgb,.62*hasPigment);
      earth=mix(earth,lowTone*1.10,habitatInfo.z*.15*(1.-elevation));
      vec3 creek=waterTone*(.94+.045*sin(mapUV.x*180.+mapUV.y*41.+time*.24));
      earth=mix(earth,creek,habitatInfo.x*top*.92);
      earth=mix(earth,roadTone,habitatInfo.y*top*.67);
      earth*=.88+values.y*.19;
      vec3 ink=mix(vec3(.035,.044,.047),vec3(.105,.115,.115),elevation);
      ink*=.90+values.y*.12;
      float explored=lit>=5.999?1.:lit<.001?0.:1.-ease(lit/6.-.014,lit/6.+.014,mapUV.x);
      vec3 stone=mix(ink,earth,explored);
      float seam=abs(fract(materialHeight/.018+.015)-.5)*2.;
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
    const state={progress:0,completedCount:0,litCount:1,chapterIndex:0,selectedIndex:0,pointerX:0,pointerY:0,time:0,sourceOffsetX:0,sourceViewportWidth:0};
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
      for(const key of ['size','pointer','grid','progress','pass','lit','selected','sourceScale','sourceOffset','hasSource','hasPigment','time','source','pigment','lowTone','highTone','waterTone','roadTone'])uniforms[key]=gl.getUniformLocation(program,key);
      for(const key of ['corner','normal','cell','detail','habitat'])attributes[key]=gl.getAttribLocation(program,key);
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
        cellData.push({u,v,h:heightAt(u,v,state.chapterIndex),seed:hash(col+state.chapterIndex%100003,row),alpha:silhouetteAt(u,v,state.chapterIndex),habitat:habitatAt(u,v,state.chapterIndex)});
      }
      if(backend==='webgl'){
        const values=[],layerSize=.035;
        for(let index=0;index<cellData.length;index++){
          const cell=cellData[index],column=index%columns,row=Math.floor(index/columns);
          const neighbors=[[-1,0],[1,0],[0,-1],[0,1]].map(([x,y])=>{
            const col=column+x,r=row+y,neighbor=col>=0&&col<columns&&r>=0&&r<rows?cellData[r*columns+col]:null;
            return !neighbor||neighbor.alpha<.4?0:neighbor.h;
          });
          const floor=Math.min(...neighbors),layers=Math.ceil(cell.h/layerSize);
          for(let layer=0;layer<layers;layer++){
            const base=layer*layerSize,top=Math.min(cell.h,base+layerSize),isTop=layer===layers-1;
            // Fully buried cubes are omitted. Visible cliffs remain true cubes,
            // rather than tall columns masquerading as a voxel landscape.
            if(!isTop&&top<floor-.001)continue;
            values.push(cell.u,cell.v,top,cell.seed,cell.alpha,base,isTop?1:0,cell.h,cell.habitat.water,cell.habitat.path,cell.habitat.moss);
          }
        }
        instanceCount=values.length/11;
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
      gl.bindBuffer(gl.ARRAY_BUFFER,cellBuffer);bindAttribute('cell',4,11,0,1);bindAttribute('detail',4,11,4,1);bindAttribute('habitat',3,11,8,1);
      gl.uniform2f(uniforms.size,width,height);gl.uniform2f(uniforms.pointer,state.pointerX,state.pointerY);gl.uniform2f(uniforms.grid,columns,rows);
      gl.uniform1f(uniforms.progress,state.progress);gl.uniform1f(uniforms.lit,state.litCount);gl.uniform1f(uniforms.time,state.time*.001);
      const palette=profileFor(state.chapterIndex).palette;
      for(const [i,key] of ['lowTone','highTone','waterTone','roadTone'].entries())gl.uniform3fv(uniforms[key],palette[i]);
      const stop=STOPS[state.selectedIndex]||STOPS[0];gl.uniform2f(uniforms.selected,stop.u,stop.v);
      const sourceRect=sourceLayout(width,height,sourceImage?(sourceImage.naturalWidth||sourceImage.width):width,sourceImage?(sourceImage.naturalHeight||sourceImage.height):height,state);
      gl.uniform2f(uniforms.sourceScale,sourceRect.scale,1);gl.uniform1f(uniforms.sourceOffset,sourceRect.offset);
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
      if(sourceImage&&state.progress<1){const sourceRect=sourceLayout(width,height,sourceImage.naturalWidth||sourceImage.width,sourceImage.naturalHeight||sourceImage.height,state);ctx.drawImage(sourceImage,-state.sourceOffsetX,0,sourceRect.width,height);ctx.fillStyle=`rgba(7,11,14,${smooth(0,.72,state.progress)})`;ctx.fillRect(0,0,width,height);}
      if(state.progress<=0&&sourceImage)return;
      const ordered=cellData.slice().sort((a,b)=>a.v-b.v||b.h-a.h);
      function polygon(points,color,alpha){ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();points.forEach((point,i)=>ctx[i?'lineTo':'moveTo'](point.x,point.y));ctx.closePath();ctx.fill();}
      for(const cell of ordered){
        const t=localPhase(cell.u,cell.v,state.progress),alpha=mix(1,cell.alpha,smooth(.37,1,t))*smooth(0,.12,t);if(alpha<.005)continue;
        const du=.49/columns,dv=.49/rows;
        const top=[[-du,-dv],[du,-dv],[du,dv],[-du,dv]].map(([u,v])=>position(cell.u+u,cell.v+v,cell.h,width,height,state));
        const bottom=[[-du,-dv],[du,-dv],[du,dv],[-du,dv]].map(([u,v])=>position(cell.u+u,cell.v+v,0,width,height,state));
        const colored=state.litCount>=6||cell.u<state.litCount/6;
        const light=cell.h*70+cell.seed*8;
        const tones=profileFor(state.chapterIndex).palette;
        let rgb=colored?tones[0].map((value,i)=>value*255+light*(i===1?1:.85)):[12+light*.30,16+light*.32,18+light*.32];
        if(colored){rgb=rgb.map((value,i)=>mix(value,tones[2][i]*255,cell.habitat.water*.85));rgb=rgb.map((value,i)=>mix(value,tones[3][i]*255,cell.habitat.path*.65));}
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
      const before=state.chapterIndex;updateState(state,value);if(before!==state.chapterIndex&&!disposed)buildCells();return state;
    }
    function project({u=0,v=0,lift=0}={}){u=clamp(Number(u)||0);v=clamp(Number(v)||0);const point=position(u,v,heightAt(u,v,state.chapterIndex),width,height,state);point.y-=Number(lift)||0;return point;}
    function contextLost(event){event.preventDefault();if(disposed)return;lost=true;useFallback();resize();render();report(new Error('WebGL context lost; using the 2D terrain.'));}
    function contextRestored(){if(disposed)return;try{lost=false;if(setupGL()){error='';fallbackCanvas?.remove();fallbackCanvas=null;ctx=null;canvas.style.visibility=originalVisibility;resize();render();}}catch(problem){report(problem);useFallback();resize();render();}}
    function dispose(){if(disposed)return;disposed=true;canvas.removeEventListener('webglcontextlost',contextLost);canvas.removeEventListener('webglcontextrestored',contextRestored);fallbackCanvas?.remove();canvas.style.visibility=originalVisibility;if(gl&&!gl.isContextLost()){[meshBuffer,cellBuffer].forEach(value=>value&&gl.deleteBuffer(value));[sourceTexture,pigmentTexture].forEach(value=>value&&gl.deleteTexture(value));shaders.forEach(value=>gl.deleteShader(value));if(program)gl.deleteProgram(program);}sourceImage=pigmentImage=null;cellData=[];}
    try{if(!setupGL())useFallback();}catch(problem){report(problem);useFallback();}
    canvas.addEventListener('webglcontextlost',contextLost);canvas.addEventListener('webglcontextrestored',contextRestored);resize();
    return Object.freeze({prepare,setState,render,project,resize,dispose,getDecorations:()=>decorationsFor(state.chapterIndex),getState:()=>({backend,progress:state.progress,completedCount:state.completedCount,litCount:state.litCount,chapterIndex:state.chapterIndex,sourceOffsetX:state.sourceOffsetX,sourceViewportWidth:state.sourceViewportWidth,selectedIndex:state.selectedIndex,columns,rows,instances:backend==='webgl'?instanceCount:cellData.length,width,height,frames,lost,disposed,error})});
  }
  const api=Object.freeze({create,stops:STOPS.map(value=>Object.freeze({...value})),heightAt});
  if(typeof module==='object'&&module.exports)module.exports={heightAt,silhouetteAt,localPhase,position,pathAt,riverAt,habitatAt,decorationsFor,updateState,sourceLayout,stops:STOPS};
  else window.InfiniteWorldTerrain=api;
})();
