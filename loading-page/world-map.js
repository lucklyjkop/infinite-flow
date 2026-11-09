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
      </div><div class="world-map-actions"><button type="button" class="world-map-arrow" data-world-prev aria-label="向左移动地图">‹</button><span data-world-position>第一卷</span><button type="button" class="world-map-arrow" data-world-next aria-label="向右移动地图">›</button><button type="button" class="world-map-inspect" data-world-inspect>查看关卡 <span aria-hidden="true">↗</span></button></div>
    </footer>
    <p class="world-map-error" role="status" aria-live="polite" hidden></p>
    <canvas class="world-map-hold" aria-hidden="true" hidden></canvas>
    <dialog class="world-level-detail" aria-labelledby="world-detail-name"><button type="button" class="world-detail-close" aria-label="收起关卡详情">×</button><div class="world-detail-landmark" aria-hidden="true"></div><p class="world-detail-index"></p><h2 id="world-detail-name"></h2><p class="world-detail-kind"></p><p class="world-detail-description"></p><p class="world-detail-state"></p></dialog>`;
  document.body.append(root);
  const viewport=root.querySelector('.world-map-viewport'),stage=root.querySelector('.world-map-stage'),hold=root.querySelector('.world-map-hold');
  const detail=root.querySelector('dialog'),errorNode=root.querySelector('.world-map-error');
  const artUrls={landmarks:'assets/world-map/landmarks.png',bamboo:'assets/world-map/landmarks-bamboo.png',snow:'assets/world-map/landmarks-snow.png',props:'assets/world-map/scenery-props.png',clear:'assets/world-map/cleared-seal.png',texture:'assets/world-map/terrain-pigment.png',seal:'assets/world-map/node-seal.png',title:'assets/world-map/title.png'};
  let phase='hidden',serial=0,assets=null,preloadJob=null,opener=null,snapshot=null,state=null;
  let frame=0,lastTime=0,progress=0,pointerX=0,pointerY=0,aimX=0,aimY=0,transition=null,pan=null,lastFocus=0,lastFocusId=null,drag=null,ignoreClickUntil=0,pageWidth=1320,camera=0,lastError='',revision=0,shownChapter=-1;
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
  const buttonFor=id=>root.querySelector('[data-world-stage="'+id+'"]');
  const maxCamera=()=>Math.max(0,((state?.maxPreviewChapterIndex||0)+1)*pageWidth-innerWidth);
  const selectedStage=()=>state?store().getChapter(state.selectedChapterIndex).stages.find(s=>s.id===state.selectedId):null;
  for(let i=0;i<9;i++){const dot=document.createElement('i');dot.style.setProperty('--i',i);root.querySelector('.world-map-dust').append(dot);}
  function setPhase(value){phase=value;root.dataset.phase=value;root.setAttribute('aria-busy',String(['preparing','entering','closing'].includes(value)));}
  function fail(error){lastError=error?.userMessage||error?.message||'世界地图暂未载入，请重试。';errorNode.textContent=lastError;errorNode.hidden=false;}
  function preload(){
    if(!preloadJob)preloadJob=Promise.all(Object.entries(artUrls).map(async([key,url])=>{const image=new Image();image.src=url;await image.decode();return[key,image];})).then(values=>assets=Object.fromEntries(values)).catch(error=>{preloadJob=null;throw error;});
    return preloadJob;
  }
  function createPage(){
    const el=document.createElement('div');el.className='world-chapter-scene';el.innerHTML='<canvas class="world-map-terrain" aria-hidden="true"></canvas><div class="world-scenery" aria-hidden="true"></div><svg class="world-map-routes" aria-hidden="true"><g></g></svg><nav class="world-map-nodes" aria-label="世界关卡"></nav><div class="world-chapter-boundary" aria-hidden="true"><i></i><span></span><i></i></div>';
    el.style.width=pageWidth+'px';el.style.height=innerHeight+'px';stage.append(el);
    const canvas=el.querySelector('canvas'),renderer=window.InfiniteWorldTerrain?.create(canvas,{onError:()=>{root.dataset.fallback='true';}});
    if(!renderer)throw new Error('山海地图尚未准备好，请重试。');
    el.style.width=pageWidth+'px';el.style.height=innerHeight+'px';renderer.prepare({source:snapshot.image,texture:assets.texture});
    const page={el,canvas,renderer,index:-1,data:null,revision:-1,nodes:el.querySelector('nav'),props:el.querySelector('.world-scenery'),routes:el.querySelector('svg'),group:el.querySelector('g'),decorations:[]};pages.push(page);return page;
  }
  function mountPage(page,index){
    const changed=page.index!==index;
    page.index=index;page.data=store().getChapter(index);page.el.dataset.chapter=String(index);page.el.dataset.locked=String(!page.data.unlocked);
    if(changed){
      if(page.nodes.contains(document.activeElement))root.focus({preventScroll:true});
      page.nodes.replaceChildren();
      for(const item of page.data.stages){
        const button=document.createElement('button');button.type='button';button.className='world-level';button.dataset.worldStage=item.id;button.dataset.index=item.index;button.setAttribute('aria-pressed','false');
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
    syncChrome();if(detail.open)fillDetail(active);requestDraw();
  }
  function resize(){
    const fraction=camera/pageWidth;pageWidth=Math.max(1320,innerWidth);camera=clamp(fraction*pageWidth,0,maxCamera());pan=null;
    stage.style.width=innerWidth+'px';stage.style.height=innerHeight+'px';
    for(const page of pages){page.el.style.width=pageWidth+'px';page.el.style.height=innerHeight+'px';if(page.el.hidden)page.needsResize=true;else page.renderer.resize();}requestDraw();
  }
  function positionPage(page){
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
    frame=0;if(root.hidden||document.hidden||!snapshot)return;
    const dt=Math.min(.05,(now-(lastTime||now))/1000);lastTime=now;pointerX+=(aimX-pointerX)*(1-Math.exp(-dt*5));pointerY+=(aimY-pointerY)*(1-Math.exp(-dt*5));
    if(pan){const t=motion()?clamp((now-pan.start)/pan.duration):1;camera=pan.from+(pan.to-pan.from)*(1-Math.pow(1-t,3));if(t>=1){camera=pan.to;pan=null;}}
    if(transition){const t=motion()?clamp((now-transition.start)/transition.duration):1,e=smooth(t);progress=transition.from+(transition.to-transition.from)*e;if(transition.to===0)camera=transition.camera+(transition.cameraEnd-transition.camera)*e;if(t>=1){const done=transition;transition=null;progress=done.to;queueMicrotask(()=>done.resolve(true));}}
    ensurePages();
    for(const page of pages){if(page.el.hidden)continue;page.renderer.setState({progress,chapterIndex:page.index,sourceOffsetX:page.index*pageWidth-camera,completedCount:page.data.completedCount,litCount:page.data.stages.filter(s=>s.lighted).length,selectedIndex:page.data.stages.find(s=>s.id===state.selectedId)?.index??-1,pointerX:motion()?pointerX:0,pointerY:motion()?pointerY:0,time:now});page.renderer.render();positionPage(page);}
    syncChrome();root.style.setProperty('--interface',smooth((progress-.54)/.37).toFixed(3));root.style.setProperty('--mist',smooth((progress-.32)/.5).toFixed(3));
    if(transition||pan||motion()&&phase==='ready'&&(Math.abs(aimX-pointerX)>.0002||Math.abs(aimY-pointerY)>.0002))frame=requestAnimationFrame(draw);
  }
  function requestDraw(){if(!frame&&!root.hidden&&!document.hidden&&snapshot)frame=requestAnimationFrame(draw);}
  function animateTo(value,duration){
    transition?.resolve(false);transition=null;pan=null;
    const cameraEnd=Math.floor((camera+.01)/pageWidth)*pageWidth;
    if(!motion()||document.hidden||Math.abs(progress-value)<.0001){progress=value;if(value===0)camera=cameraEnd;draw();return Promise.resolve(true);}
    return new Promise(resolve=>{transition={from:progress,to:value,start:performance.now(),duration,resolve,camera,cameraEnd};requestDraw();});
  }
  function cancelAnimation(){cancelAnimationFrame(frame);frame=0;lastTime=0;transition?.resolve(false);transition=null;pan=null;}
  function releaseRenderers(){for(const p of pages){p.renderer.dispose();p.el.remove();}pages.length=0;if(snapshot?.image)snapshot.image.width=snapshot.image.height=1;snapshot=null;hold.width=hold.height=1;}
  function focusSelected(){const node=buttonFor(state?.selectedId),b=node?.getBoundingClientRect();if(b&&b.right>0&&b.left<innerWidth)node.focus({preventScroll:true});else root.focus({preventScroll:true});}
  function panTo(value,{instant=false}={}){const target=clamp(value,0,maxCamera());if(instant||!motion()){pan=null;camera=target;draw();}else{pan={from:camera,to:target,start:performance.now(),duration:620};requestDraw();}}
  function moveMap(delta){if(phase!=='ready')return;const from=pan?.to??camera;panTo(from+delta*Math.min(pageWidth,innerWidth));}
  function showSelected({instant=false}={}){const item=selectedStage();if(!item)return;const target=item.chapterIndex*pageWidth+Math.max(0,pageWidth*(.05+.90*item.u)-innerWidth*.45);panTo(target,{instant});}
  async function open(trigger){
    if(phase!=='hidden'||system()?.getState().phase!=='ready')return false;
    const token=++serial;setPhase('preparing');opener=trigger||document.getElementById('system-control-world');lastError='';errorNode.hidden=true;system().setTransitioning(true);opener?.setAttribute('aria-busy','true');opener?.classList.add('world-map-pending');
    try{
      await waitFor(preload(),18000,'地图资源加载较慢，请重试。');if(token!==serial)return false;
      await waitFor(window.DeityReturnCapture?.prepare?.(document.getElementById('system-space')),12000,'当前画面尚未准备好，请重试。');if(token!==serial)return false;
      if(system()?.getState().phase!=='ready'||!system()?.getState().visible)throw new Error('请从系统空间重新打开地图。');
      snapshot=window.captureSceneReturnFrame?.(document.getElementById('system-space'));if(!snapshot?.image)throw new Error('当前画面尚未准备好，请重试。');
      root.hidden=false;root.inert=false;root.style.setProperty('--interface','0');root.style.setProperty('--mist','0');root.dataset.motion=motion()?'full':'reduced';progress=0;aimX=aimY=pointerX=pointerY=0;shownChapter=-1;
      state=store().getState();resize();camera=state.selectedChapterIndex*pageWidth;revision++;ensurePages();
      hold.width=snapshot.image.width;hold.height=snapshot.image.height;hold.getContext('2d').drawImage(snapshot.image,0,0);hold.hidden=false;
      syncState();world.dataset.state='world-map';setPhase('entering');draw();hold.hidden=true;opener?.setAttribute('aria-expanded','true');opener?.removeAttribute('aria-busy');opener?.classList.remove('world-map-pending');root.focus({preventScroll:true});cue(motion()?'world-tectonic-rise':'world-node-select');
      const finished=await animateTo(1,2450);if(token!==serial||!finished)return false;
      setPhase('ready');syncState();focusSelected();requestDraw();emit('infinite:worldmapready',{saveId:state?.saveId});return true;
    }catch(error){if(token!==serial)return false;fail(error);cleanup({focus:true});throw error;}
  }
  function cleanup({focus=true}={}){
    cancelAnimation();releaseDrag();ignoreClickUntil=0;if(detail.open)detail.close();root.hidden=true;root.inert=true;root.classList.remove('is-dragging');setPhase('hidden');opener?.setAttribute('aria-expanded','false');opener?.removeAttribute('aria-busy');opener?.classList.remove('world-map-pending');emit('infinite:soundstop',{group:'world-map',fade:.12});releaseRenderers();
    if(system()?.getState().visible){system().setTransitioning(false);world.dataset.state='system';if(focus&&!document.hidden)opener?.focus({preventScroll:true});}emit('infinite:worldmapclosed',{});
  }
  async function close({immediate=false,focus=true}={}){
    if(phase==='hidden'||phase==='closing')return false;const token=++serial;
    if(phase==='preparing'||immediate||!pages.length){cleanup({focus});return true;}
    if(detail.open)detail.close();releaseDrag();setPhase('closing');root.inert=true;emit('infinite:soundstop',{group:'world-map',fade:.1});cue('world-tectonic-fold');await animateTo(0,1350);if(token!==serial)return false;cleanup({focus});return true;
  }
  function select(id,{focus=false}={}){
    if(phase!=='ready')return;
    try{const old=state?.selectedId;store().select(id);syncState();if(old!==id){lastFocus=performance.now();lastFocusId=id;cue('world-node-select');const node=buttonFor(id);node?.classList.remove('world-node-written');void node?.offsetWidth;node?.classList.add('world-node-written');}if(focus)focusSelected();}catch(error){fail(error);}
  }
  function focusCue(node){const now=performance.now();if(phase!=='ready'||now-lastFocus<220||(lastFocusId===node.dataset.worldStage&&now-lastFocus<650))return;lastFocus=now;lastFocusId=node.dataset.worldStage;cue('world-node-focus');}
  function fillDetail(item){
    const chapter=store().getChapter(item.chapterIndex);detail.dataset.status=item.status;detail.dataset.lighted=String(item.lighted);const art=detail.querySelector('.world-detail-landmark');art.style.backgroundImage='url("'+chapter.atlas+'")';art.style.setProperty('--column',item.index%3);art.style.setProperty('--row',Math.floor(item.index/3));
    detail.querySelector('.world-detail-index').textContent=volume(item.chapterIndex)+' · '+item.number;detail.querySelector('h2').textContent=item.name;detail.querySelector('.world-detail-kind').textContent=item.kind||'';detail.querySelector('.world-detail-description').textContent=item.description||'';detail.querySelector('.world-detail-state').textContent=item.status!=='locked'?statusName(item.status):!chapter.unlocked?'前一卷通关后开启':'通关「'+(chapter.stages[item.index-1]?.name||'前一关')+'」后开启';
  }
  function inspect(){if(phase!=='ready')return;fillDetail(selectedStage());detail.showModal();cue('world-node-select');detail.querySelector('button').focus({preventScroll:true});}
  root.addEventListener('click',event=>{if(performance.now()<ignoreClickUntil)return;const node=event.target.closest('[data-world-stage]');if(node)select(node.dataset.worldStage);else if(event.target.closest('[data-world-back]'))void close();else if(event.target.closest('[data-world-inspect]'))inspect();else if(event.target.closest('[data-world-prev]'))moveMap(-1);else if(event.target.closest('[data-world-next]'))moveMap(1);});
  stage.addEventListener('pointerover',event=>{const node=event.target.closest('[data-world-stage]');if(node&&!node.contains(event.relatedTarget))focusCue(node);});stage.addEventListener('focusin',event=>{const node=event.target.closest('[data-world-stage]');if(node)focusCue(node);});
  root.addEventListener('pointermove',event=>{if(phase!=='ready'||!motion()||drag?.moved)return;aimX=(event.clientX/innerWidth-.5)*2;aimY=(event.clientY/innerHeight-.5)*2;requestDraw();});root.addEventListener('pointerleave',()=>{aimX=aimY=0;requestDraw();});
  viewport.addEventListener('pointerdown',event=>{if(phase==='ready'&&event.button===0){pan=null;drag={id:event.pointerId,start:event.clientX,camera,moved:false};}});
  viewport.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const delta=event.clientX-drag.start;if(Math.abs(delta)>7&&!drag.moved){drag.moved=true;viewport.setPointerCapture(event.pointerId);root.classList.add('is-dragging');}if(drag.moved){camera=clamp(drag.camera-delta,0,maxCamera());ignoreClickUntil=performance.now()+250;requestDraw();}});
  function releaseDrag(){const active=drag;drag=null;if(active&&viewport.hasPointerCapture(active.id))viewport.releasePointerCapture(active.id);root.classList.remove('is-dragging');}
  viewport.addEventListener('pointerup',releaseDrag);viewport.addEventListener('pointercancel',releaseDrag);viewport.addEventListener('lostpointercapture',event=>{if(event.target===viewport&&event.pointerId===drag?.id)releaseDrag();});
  viewport.addEventListener('wheel',event=>{if(phase!=='ready')return;event.preventDefault();pan=null;camera=clamp(camera+(Math.abs(event.deltaX)>Math.abs(event.deltaY)?event.deltaX:event.deltaY),0,maxCamera());requestDraw();},{passive:false});
  detail.querySelector('button').addEventListener('click',()=>{detail.close();focusSelected();});detail.addEventListener('click',event=>{if(event.target!==detail)return;const r=detail.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){detail.close();focusSelected();}});
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(detail.open){detail.close();focusSelected();}else void close();return;}if(phase!=='ready'||detail.open)return;
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();if(event.key==='Home')panTo(0);else if(event.key==='End')panTo(maxCamera());else moveMap(event.key==='ArrowLeft'?-1:1);}
    if(event.key==='Tab'){const available=[...root.querySelectorAll('button:not(:disabled)')].filter(el=>{const r=el.getBoundingClientRect();return el.tabIndex>=0&&!detail.contains(el)&&r.width&&r.right>0&&r.left<innerWidth&&!el.closest('[hidden]');});const first=available[0],last=available.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  });
  window.addEventListener('infinite:worldprogress',event=>{if(phase==='hidden')return;if(event.detail?.error){fail({message:event.detail.error});return;}const before=state?.activeChapterIndex;syncState();if(event.detail?.reason==='completion'){root.classList.remove('world-color-bloom');void root.offsetWidth;root.classList.add('world-color-bloom');if(phase==='ready'&&state.activeChapterIndex!==before)panTo(state.activeChapterIndex*pageWidth);}});
  window.addEventListener('infinite:saveactive',()=>{if(phase!=='hidden'){syncState();if(phase==='ready')showSelected({instant:true});}});window.addEventListener('resize',resize);
  function motionChange(){root.dataset.motion=motion()?'full':'reduced';if(transition&&!motion()){const done=transition;transition=null;progress=done.to;if(done.to===0)camera=done.cameraEnd;done.resolve(true);}if(pan&&!motion()){camera=pan.to;pan=null;}requestDraw();}
  reducedQuery.addEventListener('change',motionChange);window.addEventListener('infinite:settings',motionChange);
  window.addEventListener('keydown',event=>{if(phase==='preparing'&&event.key==='Escape'){event.preventDefault();event.stopPropagation();void close({immediate:true});}},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;if(transition){const done=transition;transition=null;progress=done.to;if(done.to===0)camera=done.cameraEnd;done.resolve(true);}if(pan){camera=pan.to;pan=null;}}else{lastTime=0;requestDraw();}});
  for(const name of ['infinite:title','pagehide'])window.addEventListener(name,()=>{if(phase!=='hidden')void close({immediate:true,focus:false});});
  window.InfiniteWorldMap=Object.freeze({open,close,preload,getState:()=>({phase,visible:!root.hidden,progress,completedCount:state?.completedCount||0,selectedId:state?.selectedId||null,saveId:state?.saveId||null,detailOpen:detail.open,moving:Boolean(frame),lastError,camera,pageWidth,viewChapterIndex:shownChapter,activeChapterIndex:state?.activeChapterIndex??0,maxPreviewChapterIndex:state?.maxPreviewChapterIndex??1,renderedChapters:pages.filter(p=>!p.el.hidden).map(p=>p.index),renderer:pages.find(p=>!p.el.hidden)?.renderer.getState?.()||null})});
})();
