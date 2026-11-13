/* Two recycled chapter scenes form a continuous atlas; navigation never selects a level. */
(() => {
  'use strict';
  const world=document.getElementById('world');if(!world)return;
  const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const root=document.createElement('section');
  root.id='world-map';root.hidden=true;root.tabIndex=-1;root.dataset.phase='hidden';
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','world-map-title');
  root.innerHTML=`
    <div class="world-map-void" aria-hidden="true"></div>
    <div class="world-map-viewport"><div class="world-map-stage"></div></div>
    <div class="world-map-weather" aria-hidden="true"></div>
    <div class="world-map-haze" aria-hidden="true"></div>
    <div class="world-map-dust" aria-hidden="true"></div>
    <header class="world-map-header">
      <button type="button" class="world-map-back" data-world-back><span aria-hidden="true">←</span> 返回空间</button>
      <div class="world-map-title"><h1 id="world-map-title" class="world-map-sr">世界入口</h1><img src="assets/world-map/title.png" alt="" draggable="false"></div>
      <div class="world-map-count"><span>行迹</span><strong data-world-count>00</strong><i>/ 06</i></div>
    </header>
    <div class="world-map-chapter"><span data-world-volume>第一卷</span><h2 data-world-chapter>山海初醒</h2><i aria-hidden="true"></i></div>
    <footer class="world-map-footer">
      <div class="world-map-reading"><span class="world-map-number" data-world-number>01</span><div><p class="world-map-status" data-world-status>待探索</p><h2 data-world-name>雾渡</h2></div><span class="world-map-reading-rule" aria-hidden="true"></span><p class="world-map-kind" data-world-kind></p>
      </div><div class="world-map-actions"><button type="button" class="world-map-arrow" data-world-prev aria-label="向左移动地图">‹</button><span data-world-position>第一卷</span><button type="button" class="world-map-arrow" data-world-next aria-label="向右移动地图">›</button></div>
    </footer>
    <p class="world-map-error" role="status" aria-live="polite" hidden></p>
    <canvas class="world-map-hold" aria-hidden="true" hidden></canvas>
    <dialog id="world-level-detail" class="world-level-detail" aria-labelledby="world-detail-name" aria-describedby="world-detail-description world-detail-state">
      <button type="button" class="world-detail-close" aria-label="关闭世界详情" data-world-detail-close autofocus>×</button>
      <div class="world-detail-layout">
        <div class="world-detail-preview"><div class="world-detail-landmark" aria-hidden="true"></div><p class="world-detail-index"></p><p id="world-detail-state" class="world-detail-state"></p></div>
        <div class="world-detail-copy"><p class="world-detail-kicker">世界档案</p><h2 id="world-detail-name"></h2><p class="world-detail-kind"></p>
          <div class="world-detail-difficulty"><span>难度</span><span class="world-detail-stars" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span><strong></strong></div>
          <div class="world-detail-traits" aria-label="世界特性"><span></span><span></span><span></span></div>
          <p id="world-detail-description" class="world-detail-description"></p>
          <div class="world-detail-objective"><span>探索目标</span><p></p></div>
          <footer class="world-detail-actions"><button type="button" class="world-detail-dismiss" data-world-detail-close>返回地图</button></footer>
        </div>
      </div>
    </dialog>`;
  document.body.append(root);
  const viewport=root.querySelector('.world-map-viewport'),stage=root.querySelector('.world-map-stage'),hold=root.querySelector('.world-map-hold');
  const detail=root.querySelector('dialog'),errorNode=root.querySelector('.world-map-error');
  const artUrls={landmarks:'assets/world-map/landmarks.png',bamboo:'assets/world-map/landmarks-bamboo.png',snow:'assets/world-map/landmarks-snow.png',props:'assets/world-map/scenery-props.png',clear:'assets/world-map/cleared-seal.png',texture:'assets/world-map/terrain-pigment-natural.png',seal:'assets/world-map/node-seal.png',title:'assets/world-map/title.png'};
  let surfaceSampler=null,surfaceRevision=0;
  let phase='hidden',serial=0,assets=null,preloadJob=null,opener=null,snapshot=null,state=null,weather=null;
  let frame=0,lastTime=0,progress=0,pointerX=0,pointerY=0,aimX=0,aimY=0,transition=null,pan=null,lastFocus=0,lastFocusId=null,drag=null,ignoreClickUntil=0,pageWidth=1320,camera=0,lastError='',revision=0,shownChapter=-1;
  let warmTimer=0,lastWarmKey='',prepareJob=null,detailAnimation=null,detailVersion=0,detailClosing=false;
  const pages=[];
  const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
  const smooth=v=>{const a=clamp(v);return a*a*(3-2*a);};
  const motion=()=>!reducedQuery.matches&&window.InfiniteSettings?.getState?.().motion!==false;
  const emit=(name,detail)=>window.dispatchEvent(new CustomEvent(name,{detail}));
  const cue=name=>emit('infinite:soundcue',{name,group:'world-map',variation:false});
  const store=()=>window.InfiniteWorldProgress,system=()=>window.InfiniteSystemSpace;
  const volume=i=>'第'+(i<9?'一二三四五六七八九'[i]:i+1)+'卷';
  const statusName=s=>s==='completed'?'已通关':s==='available'?'待探索':'未解锁';
  const waitFor=(promise,ms,message)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
  const yieldPreparation=()=>new Promise(resolve=>setTimeout(resolve,16));
  const buttonFor=id=>root.querySelector('[data-world-stage="'+id+'"]');
  const maxCamera=()=>Math.max(0,((state?.maxPreviewChapterIndex||0)+1)*pageWidth-innerWidth);
  const selectedStage=()=>state?store().getChapter(state.selectedChapterIndex).stages.find(s=>s.id===state.selectedId):null;
  for(let i=0;i<9;i++){const dot=document.createElement('i');dot.style.setProperty('--i',i);root.querySelector('.world-map-dust').append(dot);}
  function setPhase(value){phase=value;root.dataset.phase=value;root.setAttribute('aria-busy',String(['preparing','entering','closing'].includes(value)));}
  function fail(error){lastError=error?.userMessage||error?.message||'世界地图暂未载入，请重试。';errorNode.textContent=lastError;errorNode.hidden=false;}
  function preload(){
    if(!preloadJob)preloadJob=Promise.all(Object.entries(artUrls).map(async([key,url])=>{const image=new Image();image.src=url;await waitFor(image.decode(),30000,'地图资源加载较慢，请重试。');return[key,image];})).then(values=>assets=Object.fromEntries(values)).catch(error=>{preloadJob=null;throw error;});
    return preloadJob;
  }
  // Keep two stopped renderers and decoded scenery ready before the title menu.
  // A fresh photograph is the only texture that depends on the current scene.
  function prepare(){
    if(prepareJob)return prepareJob;
    if(phase!=='hidden'&&phase!=='preparing')return Promise.resolve({ready:true});
    const job=(async()=>{
      await preload();pageWidth=Math.max(1320,innerWidth);
      let chapter=store().getState().selectedChapterIndex;
      if(!store().getState().saveId){
        try{const recent=window.InfiniteSaves?.list?.()[0];if(recent)chapter=Math.max(0,Math.floor(window.InfiniteSaves.worldStageIndexOf(recent.progress.world.selected)/6));}catch{}
      }
      while(pages.length<2){createPage();await yieldPreparation();}
      for(let i=0;i<pages.length;i++){
        const page=pages[i];page.el.style.width=pageWidth+'px';page.el.style.height=innerHeight+'px';page.renderer.resize();
        await page.renderer.prepareChapter?.(chapter+i);
        if(phase==='hidden'||phase==='preparing'){
          page.renderer.setState({chapterIndex:chapter+i,progress:1});
          page.renderer.render();page.renderKey='';page.index=-1;
        }
        await yieldPreparation();
      }
      surfaceSampler ||= window.InfiniteWeatherSurfaces?.create(assets);
      return {ready:true};
    })();prepareJob=job;
    job.finally(()=>{if(prepareJob===job)prepareJob=null;}).catch(()=>{});
    return job;
  }
  function createPage(){
    const el=document.createElement('div');el.className='world-chapter-scene';el.innerHTML='<canvas class="world-map-terrain" aria-hidden="true"></canvas><div class="world-scenery" aria-hidden="true"></div><svg class="world-map-routes" aria-hidden="true"><g></g></svg><nav class="world-map-nodes" aria-label="世界关卡"></nav><div class="world-chapter-boundary" aria-hidden="true"><i></i><span></span><i></i></div>';
    el.style.width=pageWidth+'px';el.style.height=innerHeight+'px';stage.append(el);
    const canvas=el.querySelector('canvas'),renderer=window.InfiniteWorldTerrain?.create(canvas,{getSize:()=>({width:pageWidth,height:innerHeight}),onError:()=>{root.dataset.fallback='true';}});
    if(!renderer)throw new Error('山海地图尚未准备好，请重试。');
    el.style.width=pageWidth+'px';el.style.height=innerHeight+'px';renderer.prepare({source:snapshot?.image||null,texture:assets.texture,draw:false});
    const page={el,canvas,renderer,index:-1,data:null,revision:-1,nodes:el.querySelector('nav'),props:el.querySelector('.world-scenery'),routes:el.querySelector('svg'),group:el.querySelector('g'),decorations:[]};pages.push(page);el.hidden=true;el.inert=true;return page;
  }
  function mountPage(page,index){
    const changed=page.index!==index;
    page.index=index;page.data=store().getChapter(index);page.el.dataset.chapter=String(index);page.el.dataset.locked=String(!page.data.unlocked);
    if(changed){
      if(page.nodes.contains(document.activeElement))root.focus({preventScroll:true});
      page.nodes.replaceChildren();
      for(const item of page.data.stages){
        const button=document.createElement('button');button.type='button';button.className='world-level';button.dataset.worldStage=item.id;button.dataset.index=item.index;button.setAttribute('aria-pressed','false');button.setAttribute('aria-haspopup','dialog');button.setAttribute('aria-controls','world-level-detail');
        button.innerHTML='<span class="world-landmark" aria-hidden="true"></span><span class="world-level-stem" aria-hidden="true"></span><span class="world-level-label"><span class="world-level-seal" aria-hidden="true"><b></b><i class="world-clear-seal"></i></span><span class="world-level-type"><span></span><small data-world-node-state></small></span></span><span class="world-level-aura" aria-hidden="true"></span>';
        const art=button.querySelector('.world-landmark');art.style.backgroundImage='url("'+page.data.atlas+'")';art.style.setProperty('--column',item.index%3);art.style.setProperty('--row',Math.floor(item.index/3));
        button.querySelector('b').textContent=item.number;button.querySelector('.world-level-type>span').textContent=item.name;page.nodes.append(button);
      }
      page.group.replaceChildren();for(let i=0;i<5;i++){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.dataset.worldRoute=i;page.group.append(path);}
      page.el.querySelector('.world-chapter-boundary span').textContent=volume(index);
      page.renderer.setState({chapterIndex:index});
      page.decorations=page.renderer.getDecorations?.()||[];
      page.props.replaceChildren();
      for(const item of page.decorations){const el=document.createElement('span');el.className='world-scenery-prop';el.style.setProperty('--prop-col',item.type%4);el.style.setProperty('--prop-row',Math.floor(item.type/4));page.props.append(el);}
    }
    for(const item of page.data.stages){
      const button=page.nodes.querySelector('[data-world-stage="'+item.id+'"]');button.dataset.status=item.status;button.dataset.lighted=String(item.lighted);button.classList.toggle('is-selected',item.id===state.selectedId);button.setAttribute('aria-pressed',String(item.id===state.selectedId));button.setAttribute('aria-label',volume(index)+' '+item.number+' '+item.name+'，'+statusName(item.status));button.querySelector('[data-world-node-state]').textContent=statusName(item.status);
    }
    for(const path of page.group.children)path.classList.toggle('is-cleared',Number(path.dataset.worldRoute)<page.data.completedCount-1);
    page.revision=revision;
  }
  function ensurePages(){
    if(!state||!snapshot)return;
    const first=Math.floor((camera+.01)/pageWidth),last=Math.min(state.maxPreviewChapterIndex,Math.floor((camera+innerWidth-.01)/pageWidth)),needed=[];
    for(let i=first;i<=last;i++)needed.push(i);
    for(const index of needed){let page=pages.find(p=>p.index===index);if(!page){page=pages.find(p=>!needed.includes(p.index))||createPage();mountPage(page,index);}else if(page.revision!==revision)mountPage(page,index);}
    for(const page of pages){const visible=needed.includes(page.index),wasHidden=page.el.hidden;if(!visible&&page.el.contains(document.activeElement))root.focus({preventScroll:true});page.el.hidden=!visible;page.el.inert=!visible;if(!visible)continue;if(wasHidden||page.needsResize){page.renderer.resize();page.needsResize=false;}page.el.style.transform='translate3d('+(page.index*pageWidth-camera).toFixed(2)+'px,0,0)';}
  }
  function warmNearby(){
    if(phase!=='ready'||pan||drag||transition||document.hidden||!pages.length)return;
    const index=Math.floor(camera/pageWidth),key=[index,state.maxPreviewChapterIndex,pageWidth,innerHeight].join(':');if(key===lastWarmKey||warmTimer)return;
    warmTimer=setTimeout(()=>{warmTimer=0;if(phase!=='ready'||pan||drag||document.hidden)return;lastWarmKey=key;const renderer=pages.find(p=>!p.el.hidden)?.renderer;for(const next of [index+1,index-1])if(next>=0&&next<=state.maxPreviewChapterIndex)renderer?.prepareChapter?.(next).catch(()=>{lastWarmKey='';});},90);
  }
  function syncChrome(){
    if(!state)return;
    const visibleIndex=Math.min(state.maxPreviewChapterIndex,Math.floor((camera+innerWidth*.5)/pageWidth)),chapter=store().getChapter(visibleIndex);
    if(shownChapter!==visibleIndex){shownChapter=visibleIndex;root.querySelector('[data-world-volume]').textContent=volume(visibleIndex);root.querySelector('[data-world-chapter]').textContent=chapter.name;}
    root.querySelector('.world-map-chapter').dataset.preview=String(!chapter.unlocked);
    root.querySelector('[data-world-count]').textContent=String(chapter.completedCount).padStart(2,'0');
    root.querySelector('[data-world-position]').textContent=volume(visibleIndex);
    root.querySelector('[data-world-prev]').disabled=camera<1;root.querySelector('[data-world-next]').disabled=camera>maxCamera()-1;
    if(document.activeElement?.matches('.world-map-arrow:disabled'))root.focus({preventScroll:true});
  }
  function syncState(){
    try{state=store().getState();}catch(error){fail(error);return;}
    revision++;camera=clamp(camera,0,maxCamera());if(pan)pan.to=clamp(pan.to,0,maxCamera());
    const active=selectedStage();if(!active)return;
    root.dataset.completed=String(state.completedCount);root.dataset.selected=active.id;
    root.querySelector('[data-world-number]').textContent=active.number;root.querySelector('[data-world-name]').textContent=active.name;root.querySelector('[data-world-status]').textContent=statusName(active.status);root.querySelector('[data-world-kind]').textContent=active.kind||'';
    syncChrome();
    if(detail.open){
      try{const displayed=store().getChapter(Number(detail.dataset.chapter)).stages.find(item=>item.id===detail.dataset.stageId);if(displayed)fillDetail(displayed);else void closeDetail({immediate:true});}
      catch{void closeDetail({immediate:true});}
    }
    requestDraw();
  }
  function resize(){
    const fraction=camera/pageWidth;pageWidth=Math.max(1320,innerWidth);camera=clamp(fraction*pageWidth,0,maxCamera());pan=null;
    stage.style.width=innerWidth+'px';stage.style.height=innerHeight+'px';
    for(const page of pages){page.el.style.width=pageWidth+'px';page.el.style.height=innerHeight+'px';page.renderKey='';if(page.el.hidden)page.needsResize=true;else page.renderer.resize();}lastWarmKey='';weather?.resize();requestDraw();
  }
  function positionPage(page){
    surfaceRevision++;
    const points=[];page.routes.setAttribute('viewBox','0 0 '+pageWidth+' '+innerHeight);page.routes.setAttribute('width',pageWidth);page.routes.setAttribute('height',innerHeight);
    for(const item of page.data.stages){
      const p=page.renderer.project({u:item.u,v:item.v,lift:0}),node=page.nodes.querySelector('[data-world-stage="'+item.id+'"]');if(!p||!node)continue;
      const screenX=page.index*pageWidth-camera+p.x;node.tabIndex=screenX>50&&screenX<innerWidth-50?0:-1;
      node.style.left=p.x.toFixed(2)+'px';node.style.top=p.y.toFixed(2)+'px';node.style.zIndex=String(Math.round(p.y));node.style.setProperty('--arrival',smooth((progress-(.16+item.u*.39))/.28).toFixed(3));node.style.setProperty('--node-scale',clamp(p.scale||1,.85,1.12).toFixed(3));points.push(p);
    }
    for(let i=0;i<points.length-1;i++){const a=points[i],b=points[i+1],dx=(b.x-a.x)*.48;page.group.children[i]?.setAttribute('d','M '+a.x+' '+(a.y+12)+' C '+(a.x+dx)+' '+(a.y+12)+', '+(b.x-dx)+' '+(b.y+12)+', '+b.x+' '+(b.y+12));}
    const litCount=page.data.stages.filter(s=>s.lighted).length;
    page.decorations.forEach((item,i)=>{const p=page.renderer.project({u:item.u,v:item.v,lift:item.lift||0}),el=page.props.children[i];if(!p||!el)return;const scale=(item.scale||1)*(innerWidth>1600?1.15:1),size=(item.type===4?170:item.type===5?150:138)*scale;el.style.width=size+'px';el.style.height=size+'px';el.style.left=p.x+'px';el.style.top=p.y+'px';el.style.zIndex=String(Math.round(p.y));el.style.opacity=smooth((progress-(.14+item.u*.39))/.35).toFixed(3);el.dataset.lighted=String(item.u<litCount/6);});
  }
  function draw(now=performance.now()){
    try{drawFrame(now);}catch(error){
      console.error('World map frame failed',error);
      const pending=transition;transition=null;progress=pending?.to??1;
      for(const page of pages)page.renderKey='';
      try{drawFrame(now);pending?.resolve(true);}catch(failure){pending?.resolve(false);const message=failure?.message||'地图载入失败，请重试。';cleanup({focus:true});emit('infinite:worldmaperror',{message});}
    }
  }
  function drawFrame(now=performance.now()){
    frame=0;if(root.hidden||document.hidden||!snapshot)return;
    const dt=Math.min(.1,(now-(lastTime||now))/1000);lastTime=now;pointerX+=(aimX-pointerX)*(1-Math.exp(-dt*5));pointerY+=(aimY-pointerY)*(1-Math.exp(-dt*5));
    if(Math.abs(aimX-pointerX)<.0015)pointerX=aimX;if(Math.abs(aimY-pointerY)<.0015)pointerY=aimY;
    if(pan){const t=motion()?clamp((now-pan.start)/pan.duration):1;camera=pan.from+(pan.to-pan.from)*(1-Math.pow(1-t,3));if(t>=1){camera=pan.to;pan=null;}}
    if(transition){const t=motion()?clamp((now-transition.start)/transition.duration):1,e=smooth(t);progress=transition.from+(transition.to-transition.from)*e;if(transition.to===0)camera=transition.camera+(transition.cameraEnd-transition.camera)*e;if(t>=1){const done=transition;transition=null;progress=done.to;queueMicrotask(()=>done.resolve(true));}}
    stage.style.transform='translate3d('+(motion()?pointerX*6*progress:0).toFixed(3)+'px,'+(motion()?pointerY*4*progress:0).toFixed(3)+'px,0)';surfaceRevision++;
    ensurePages();
    for(const page of pages){
      if(page.el.hidden)continue;
      const selectedIndex=page.data.stages.find(s=>s.id===state.selectedId)?.index??-1,litCount=page.data.litCount;
      const renderKey=[page.index,progress,page.data.completedCount,litCount,selectedIndex,pageWidth,innerHeight,progress<1?page.index*pageWidth-camera:0].join(':');
      if(page.renderKey!==renderKey){page.renderer.setState({progress,chapterIndex:page.index,sourceOffsetX:page.index*pageWidth-camera,completedCount:page.data.completedCount,litCount,selectedIndex,pointerX:0,pointerY:0,time:now});page.renderer.render();positionPage(page);page.renderKey=renderKey;}
      else for(const node of page.nodes.children){const screenX=page.index*pageWidth-camera+parseFloat(node.style.left);node.tabIndex=screenX>50&&screenX<innerWidth-50?0:-1;}
    }
    syncChrome();root.style.setProperty('--interface',smooth((progress-.54)/.37).toFixed(3));root.style.setProperty('--mist',smooth((progress-.32)/.5).toFixed(3));
    weather?.setState({progress,camera,pageWidth,surfaceRevision,chapterIndex:shownChapter,active:!root.hidden,motion:motion()});
    if(!pan&&!transition)warmNearby();
    if(transition||pan||motion()&&phase==='ready'&&(Math.abs(aimX-pointerX)>.0002||Math.abs(aimY-pointerY)>.0002))frame=requestAnimationFrame(draw);
  }
  function requestDraw(){if(!frame&&!root.hidden&&!document.hidden&&snapshot)frame=requestAnimationFrame(draw);}
  function animateTo(value,duration){
    transition?.resolve(false);transition=null;pan=null;
    const cameraEnd=Math.floor((camera+.01)/pageWidth)*pageWidth;
    if(!motion()||document.hidden||Math.abs(progress-value)<.0001){progress=value;if(value===0)camera=cameraEnd;draw();return Promise.resolve(true);}
    return new Promise(resolve=>{transition={from:progress,to:value,start:performance.now(),duration,resolve,camera,cameraEnd};requestDraw();});
  }
  function cancelAnimation(){cancelAnimationFrame(frame);clearTimeout(warmTimer);warmTimer=0;lastWarmKey='';frame=0;lastTime=0;transition?.resolve(false);transition=null;pan=null;}
  function releaseRenderers({destroy=false}={}){weather?.dispose();weather=null;emit('infinite:worldweatherchange',{rain:0,active:false});for(const p of pages){if(destroy){p.renderer.dispose();p.el.remove();}else{p.el.hidden=true;p.el.inert=true;p.renderer.prepare({source:null,draw:false});p.renderKey='';}}if(destroy){pages.length=0;surfaceSampler?.dispose();surfaceSampler=null;}if(snapshot?.image)snapshot.image.width=snapshot.image.height=1;snapshot=null;hold.width=hold.height=1;}
  function focusSelected(){const node=buttonFor(state?.selectedId),b=node?.getBoundingClientRect();if(b&&b.right>0&&b.left<innerWidth)node.focus({preventScroll:true});else root.focus({preventScroll:true});}
  function panTo(value,{instant=false}={}){const target=clamp(value,0,maxCamera());aimX=pointerX;aimY=pointerY;if(instant||!motion()){pan=null;camera=target;draw();}else{pan={from:camera,to:target,start:performance.now(),duration:620};requestDraw();}}
  function moveMap(delta){if(phase!=='ready')return;aimX=pointerX;aimY=pointerY;const from=pan?.to??camera;panTo(from+delta*Math.min(pageWidth,innerWidth));}
  function showSelected({instant=false}={}){const item=selectedStage();if(!item)return;const target=item.chapterIndex*pageWidth+Math.max(0,pageWidth*(.05+.90*item.u)-innerWidth*.45);panTo(target,{instant});}
  async function open(trigger){
    if(phase!=='hidden'||system()?.getState().phase!=='ready')return false;
    const token=++serial;setPhase('preparing');opener=trigger||document.getElementById('system-control-world');lastError='';errorNode.hidden=true;system().setTransitioning(true);opener?.setAttribute('aria-busy','true');opener?.classList.add('world-map-pending');
    try{
      await waitFor(preload(),18000,'地图资源加载较慢，请重试。');if(token!==serial)return false;
      if(prepareJob||pages.length<2)await waitFor(prepare(),18000,'地图尚未准备好，请重试。');if(token!==serial)return false;
      await waitFor(window.DeityReturnCapture?.prepare?.(document.getElementById('system-space')),12000,'当前画面尚未准备好，请重试。');if(token!==serial)return false;
      if(system()?.getState().phase!=='ready'||!system()?.getState().visible)throw new Error('请从系统空间重新打开地图。');
      snapshot=window.captureSceneReturnFrame?.(document.getElementById('system-space'));if(!snapshot?.image)throw new Error('当前画面尚未准备好，请重试。');
      for(const page of pages)page.renderer.prepare({source:snapshot.image,draw:false});
      root.hidden=false;root.inert=false;root.style.setProperty('--interface','0');root.style.setProperty('--mist','0');root.dataset.motion=motion()?'full':'reduced';progress=0;aimX=aimY=pointerX=pointerY=0;shownChapter=-1;
      hold.width=snapshot.image.width;hold.height=snapshot.image.height;hold.getContext('2d').drawImage(snapshot.image,0,0);hold.hidden=false;
      // Let the held scene paint between snapshot work and GPU preparation.
      await yieldPreparation();if(token!==serial)return false;
      state=store().getState();resize();camera=state.selectedChapterIndex*pageWidth;revision++;ensurePages();
      surfaceSampler ||= window.InfiniteWeatherSurfaces?.create(assets);
      weather=window.InfiniteWorldWeather?.create(root.querySelector('.world-map-weather'),{getSurfaces:()=>surfaceSampler?.sample(pages,{camera,pageWidth,width:innerWidth,height:innerHeight,progress,offsetX:motion()?pointerX*6*progress:0,offsetY:motion()?pointerY*4*progress:0})||[],onChange:values=>{const active=!root.hidden&&phase!=='closing';emit('infinite:worldweatherchange',{...values,active,rain:active?values.rain*smooth((progress-.34)/.5):0});}});
      syncState();world.dataset.state='world-map';setPhase('entering');draw();hold.hidden=true;opener?.setAttribute('aria-expanded','true');opener?.removeAttribute('aria-busy');opener?.classList.remove('world-map-pending');root.focus({preventScroll:true});cue(motion()?'world-tectonic-rise':'world-node-select');
      const finished=await animateTo(1,1600);if(token!==serial||!finished)return false;
      setPhase('ready');syncState();focusSelected();requestDraw();emit('infinite:worldmapready',{saveId:state?.saveId});return true;
    }catch(error){if(token!==serial)return false;fail(error);cleanup({focus:true});throw error;}
  }
  function cleanup({focus=true}={}){
    cancelAnimation();releaseDrag();ignoreClickUntil=0;void closeDetail({immediate:true,focus:false});root.hidden=true;root.inert=true;root.classList.remove('is-dragging');setPhase('hidden');opener?.setAttribute('aria-expanded','false');opener?.removeAttribute('aria-busy');opener?.classList.remove('world-map-pending');emit('infinite:soundstop',{group:'world-map',fade:.12});releaseRenderers();
    if(system()?.getState().visible){system().setTransitioning(false);world.dataset.state='system';if(focus&&!document.hidden)opener?.focus({preventScroll:true});}emit('infinite:worldmapclosed',{});
  }
  async function close({immediate=false,focus=true}={}){
    if(phase==='hidden'||phase==='closing')return false;const token=++serial;
    if(phase==='preparing'||immediate||!pages.length){cleanup({focus});return true;}
    void closeDetail({immediate:true,focus:false});releaseDrag();setPhase('closing');root.inert=true;emit('infinite:worldweatherchange',{rain:0,active:false});emit('infinite:soundstop',{group:'world-map',fade:.1});cue('world-tectonic-fold');await animateTo(0,1350);if(token!==serial)return false;cleanup({focus});return true;
  }
  function select(id,{focus=false}={}){
    if(phase!=='ready'||detail.open)return false;
    try{const old=state?.selectedId;store().select(id);syncState();if(old!==id){lastFocus=performance.now();lastFocusId=id;const node=buttonFor(id);node?.classList.remove('world-node-written');void node?.offsetWidth;node?.classList.add('world-node-written');}if(focus)focusSelected();return true;}catch(error){fail(error);return false;}
  }
  function focusCue(node){const now=performance.now();if(phase!=='ready'||detail.open||now-lastFocus<220||(lastFocusId===node.dataset.worldStage&&now-lastFocus<650))return;lastFocus=now;lastFocusId=node.dataset.worldStage;cue('world-node-focus');}
  function fillDetail(item){
    const chapter=store().getChapter(item.chapterIndex);detail.dataset.stageId=item.id;detail.dataset.chapter=String(item.chapterIndex);detail.dataset.status=item.status;detail.dataset.lighted=String(item.lighted);const art=detail.querySelector('.world-detail-landmark');art.style.backgroundImage='url("'+chapter.atlas+'")';art.style.setProperty('--column',item.index%3);art.style.setProperty('--row',Math.floor(item.index/3));
    detail.querySelector('.world-detail-index').textContent=volume(item.chapterIndex)+' · '+item.number;detail.querySelector('h2').textContent=item.name;detail.querySelector('.world-detail-kind').textContent=item.kind||'';detail.querySelector('.world-detail-description').textContent=item.description||'';detail.querySelector('.world-detail-state').textContent=item.status!=='locked'?statusName(item.status):!chapter.unlocked?'前一卷通关后开启':'通关「'+(chapter.stages[item.index-1]?.name||'前一关')+'」后开启';
    const difficulty=detail.querySelector('.world-detail-difficulty'),level=item.difficulty.level;
    difficulty.setAttribute('aria-label','难度：'+item.difficulty.label+'，'+level+' / 5');difficulty.querySelector('strong').textContent=item.difficulty.label;
    [...detail.querySelectorAll('.world-detail-stars i')].forEach((star,index)=>star.classList.toggle('is-lit',index<level));
    [...detail.querySelectorAll('.world-detail-traits span')].forEach((tag,index)=>{tag.textContent=item.traits[index];});
    detail.querySelector('.world-detail-objective p').textContent=item.objective;
    window.InfiniteWorldDetailViews?.fill(item,chapter);
  }
  function inspect(){
    if(phase!=='ready'||detail.open||detailClosing)return;
    const item=selectedStage();if(!item)return;
    releaseDrag();pan=null;aimX=pointerX;aimY=pointerY;fillDetail(item);
    detailVersion++;detail.classList.remove('is-closing');detail.dataset.state='open';detail.showModal();detail.scrollTop=0;
    cue('world-node-select');detail.querySelector('button').focus({preventScroll:true});
    void window.InfiniteWorldDetailMorph?.play(detail,buttonFor(item.id),{motion:motion()});
  }
  async function closeDetail({immediate=false,focus=true}={}){
    if(!detail.open&&!detailClosing)return false;
    if(detailClosing&&!immediate)return false;
    window.InfiniteWorldDetailViews?.suspend();
    const interruptedMorph=window.InfiniteWorldDetailMorph?.cancel();
    if(!immediate)cue('ui-back');
    const token=++detailVersion;detailAnimation?.cancel();detailAnimation=null;detailClosing=true;detail.classList.add('is-closing');detail.dataset.state='closing';
    if(!immediate&&motion()&&!document.hidden){
      await window.InfiniteWorldDetailMorph?.play(detail,buttonFor(detail.dataset.stageId),{reverse:true,motion:motion(),from:interruptedMorph?.dialog===detail?interruptedMorph.progress:undefined});
    }
    if(token!==detailVersion)return false;
    detail.close();detailAnimation?.cancel();detailAnimation=null;detailClosing=false;detail.classList.remove('is-closing');detail.dataset.state='closed';
    if(focus&&phase==='ready'&&!root.hidden&&!document.hidden)focusSelected();
    return true;
  }
  root.addEventListener('click',event=>{if(performance.now()<ignoreClickUntil)return;const node=event.target.closest('[data-world-stage]');if(node){if(select(node.dataset.worldStage))inspect();}else if(event.target.closest('[data-world-back]'))void close();else if(event.target.closest('[data-world-prev]'))moveMap(-1);else if(event.target.closest('[data-world-next]'))moveMap(1);});
  stage.addEventListener('pointerover',event=>{const node=event.target.closest('[data-world-stage]');if(node&&!node.contains(event.relatedTarget))focusCue(node);});stage.addEventListener('focusin',event=>{const node=event.target.closest('[data-world-stage]');if(node)focusCue(node);});
  root.addEventListener('pointermove',event=>{if(phase!=='ready'||detail.open||!motion()||pan||drag?.moved)return;aimX=(event.clientX/innerWidth-.5)*2;aimY=(event.clientY/innerHeight-.5)*2;requestDraw();});root.addEventListener('pointerleave',()=>{if(!pan&&!detail.open){aimX=aimY=0;requestDraw();}});
  viewport.addEventListener('pointerdown',event=>{if(phase==='ready'&&event.button===0){pan=null;aimX=pointerX;aimY=pointerY;drag={id:event.pointerId,start:event.clientX,camera,moved:false};}});
  viewport.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const delta=event.clientX-drag.start;if(Math.abs(delta)>7&&!drag.moved){drag.moved=true;viewport.setPointerCapture(event.pointerId);root.classList.add('is-dragging');}if(drag.moved){camera=clamp(drag.camera-delta,0,maxCamera());ignoreClickUntil=performance.now()+250;requestDraw();}});
  function releaseDrag(){const active=drag;drag=null;if(active&&viewport.hasPointerCapture(active.id))viewport.releasePointerCapture(active.id);root.classList.remove('is-dragging');}
  viewport.addEventListener('pointerup',releaseDrag);viewport.addEventListener('pointercancel',releaseDrag);viewport.addEventListener('lostpointercapture',event=>{if(event.target===viewport&&event.pointerId===drag?.id)releaseDrag();});
  viewport.addEventListener('wheel',event=>{if(phase!=='ready')return;event.preventDefault();pan=null;camera=clamp(camera+(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY),0,maxCamera());requestDraw();},{passive:false});
  for(const button of detail.querySelectorAll('[data-world-detail-close]'))button.addEventListener('click',()=>void closeDetail());
  detail.addEventListener('cancel',event=>{event.preventDefault();void closeDetail();});
  detail.addEventListener('keydown',event=>{
    if(event.key!=='Tab'||!detail.open)return;
    const controls=[...detail.querySelectorAll('button:not(:disabled)')].filter(button=>button.getClientRects().length&&!button.closest('[inert]')&&getComputedStyle(button).visibility!=='hidden'),first=controls[0],last=controls.at(-1);
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus({preventScroll:true});}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus({preventScroll:true});}
  });
  detail.addEventListener('click',event=>{if(event.target!==detail)return;const r=detail.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)void closeDetail();});
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(detail.open){void closeDetail();}else void close();return;}if(phase!=='ready'||detail.open)return;
    const node=event.target.closest('[data-world-stage]');
    if(node&&(event.key==='Enter'||event.key===' ')){event.preventDefault();event.stopPropagation();if(!event.repeat&&select(node.dataset.worldStage))inspect();return;}
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();if(event.key==='Home')panTo(0);else if(event.key==='End')panTo(maxCamera());else moveMap(event.key==='ArrowLeft'?-1:1);}
    if(event.key==='Tab'){const available=[...root.querySelectorAll('button:not(:disabled)')].filter(el=>{const r=el.getBoundingClientRect();return el.tabIndex>=0&&!detail.contains(el)&&r.width&&r.right>0&&r.left<innerWidth&&!el.closest('[hidden]');});const first=available[0],last=available.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  });
  window.addEventListener('infinite:worldprogress',event=>{if(phase==='hidden')return;if(event.detail?.error){fail({message:event.detail.error});return;}const before=state?.activeChapterIndex;syncState();if(event.detail?.reason==='completion'){root.classList.remove('world-color-bloom');void root.offsetWidth;root.classList.add('world-color-bloom');if(phase==='ready'&&state.activeChapterIndex!==before)panTo(state.activeChapterIndex*pageWidth);}});
  window.addEventListener('infinite:saveactive',()=>{if(phase!=='hidden'){void closeDetail({immediate:true,focus:false});syncState();if(phase==='ready')showSelected({instant:true});}});window.addEventListener('resize',resize);
  function motionChange(){root.dataset.motion=motion()?'full':'reduced';if(transition&&!motion()){const done=transition;transition=null;progress=done.to;if(done.to===0)camera=done.cameraEnd;done.resolve(true);}if(pan&&!motion()){camera=pan.to;pan=null;}requestDraw();}
  reducedQuery.addEventListener('change',motionChange);window.addEventListener('infinite:settings',motionChange);
  window.addEventListener('keydown',event=>{if(phase==='preparing'&&event.key==='Escape'){event.preventDefault();event.stopPropagation();void close({immediate:true});}},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){detailAnimation?.finish();cancelAnimationFrame(frame);frame=0;if(transition){const done=transition;transition=null;progress=done.to;if(done.to===0)camera=done.cameraEnd;done.resolve(true);}if(pan){camera=pan.to;pan=null;}}else{lastTime=0;for(const page of pages)page.renderKey='';requestDraw();}});
  for(const name of ['infinite:title','pagehide'])window.addEventListener(name,()=>{if(phase!=='hidden')void close({immediate:true,focus:false});});
  window.addEventListener('pagehide',()=>releaseRenderers({destroy:true}));
  window.InfiniteWorldMap=Object.freeze({open,close,preload,prepare,getState:()=>({phase,visible:!root.hidden,progress,completedCount:state?.completedCount||0,selectedId:state?.selectedId||null,saveId:state?.saveId||null,detailOpen:detail.open,detailId:detail.open?detail.dataset.stageId:null,moving:Boolean(frame),lastError,camera,pageWidth,viewChapterIndex:shownChapter,activeChapterIndex:state?.activeChapterIndex??0,maxPreviewChapterIndex:state?.maxPreviewChapterIndex??1,preparedRenderers:pages.length,renderedChapters:pages.filter(p=>!p.el.hidden).map(p=>p.index),renderer:pages.find(p=>!p.el.hidden)?.renderer.getState?.()||null,weather:weather?.getState()||null})});
})();
