/* The mountain atlas keeps its live terrain under its UI through both handoffs. */
(() => {
  'use strict';
  const world=document.getElementById('world');if(!world)return;
  const reducedQuery=matchMedia('(prefers-reduced-motion: reduce)');
  const root=document.createElement('section');
  root.id='world-map';root.hidden=true;root.tabIndex=-1;root.dataset.phase='hidden';
  root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-labelledby','world-map-title');
  root.innerHTML=`
    <div class="world-map-void" aria-hidden="true"></div>
    <div class="world-map-viewport"><div class="world-map-stage">
      <canvas class="world-map-terrain" aria-hidden="true"></canvas>
      <svg class="world-map-routes" aria-hidden="true"><g></g></svg>
      <nav class="world-map-nodes" aria-label="世界关卡"></nav>
    </div></div>
    <div class="world-map-haze" aria-hidden="true"></div>
    <div class="world-map-dust" aria-hidden="true">${Array.from({length:9},(_,i)=>`<i style="--i:${i}"></i>`).join('')}</div>
    <header class="world-map-header">
      <button type="button" class="world-map-back" data-world-back><span aria-hidden="true">←</span> 返回空间</button>
      <div class="world-map-title"><h1 id="world-map-title" class="world-map-sr">世界入口</h1><img src="assets/world-map/title.png" alt="" draggable="false"></div>
      <div class="world-map-count"><span>行迹</span><strong data-world-count>00</strong><i>/ 06</i></div>
    </header>
    <div class="world-map-chapter"><span>第一卷</span><h2>山海初醒</h2><i aria-hidden="true"></i></div>
    <footer class="world-map-footer">
      <div class="world-map-reading"><span class="world-map-number" data-world-number>01</span><div><p class="world-map-status" data-world-status>待探索</p><h2 data-world-name>雾渡</h2></div><span class="world-map-reading-rule" aria-hidden="true"></span><p class="world-map-kind" data-world-kind>叙事 · 渡口</p></div>
      <div class="world-map-actions"><button type="button" class="world-map-arrow" data-world-prev aria-label="上一关">‹</button><span data-world-position>01 / 06</span><button type="button" class="world-map-arrow" data-world-next aria-label="下一关">›</button><button type="button" class="world-map-inspect" data-world-inspect>查看关卡 <span aria-hidden="true">↗</span></button></div>
    </footer>
    <p class="world-map-error" role="status" aria-live="polite" hidden></p>
    <canvas class="world-map-hold" aria-hidden="true" hidden></canvas>
    <dialog class="world-level-detail" aria-labelledby="world-detail-name"><button type="button" class="world-detail-close" aria-label="收起关卡详情">×</button><div class="world-detail-landmark" aria-hidden="true"></div><p class="world-detail-index"></p><h2 id="world-detail-name"></h2><p class="world-detail-kind"></p><p class="world-detail-description"></p><p class="world-detail-state"></p></dialog>`;
  document.body.append(root);
  const viewport=root.querySelector('.world-map-viewport'),stage=root.querySelector('.world-map-stage'),canvas=root.querySelector('.world-map-terrain');
  const nodes=root.querySelector('.world-map-nodes'),routes=root.querySelector('.world-map-routes'),routeGroup=routes.querySelector('g'),hold=root.querySelector('.world-map-hold');
  const detail=root.querySelector('dialog'),errorNode=root.querySelector('.world-map-error');
  const artUrls={landmarks:'assets/world-map/landmarks.png',texture:'assets/world-map/terrain-pigment.png',seal:'assets/world-map/node-seal.png',title:'assets/world-map/title.png'};
  const kinds=['叙事 · 渡口','异闻 · 客栈','调查 · 旧城','险境 · 山隘','谜境 · 湖心','终章 · 归墟'];
  const descriptions=['雾中一盏渡灯，等候尚未抵岸的人。','红灯未熄，客栈里却没有归人。','旧城的门扉，在纸页翻动时开启。','循着雪中的足迹，越过最后一道山隘。','湖面倒映着一个尚未发生的世界。','所有岔路，最终在此重逢。'];
  let phase='hidden',serial=0,renderer=null,assets=null,preloadJob=null,opener=null,snapshot=null,state=null;
  let frame=0,lastTime=0,progress=0,pointerX=0,pointerY=0,aimX=0,aimY=0,transition=null,lastFocus=0,lastFocusId=null,drag=null,ignoreClickUntil=0,virtualWidth=0,lastError='';
  const clamp=value=>Math.max(0,Math.min(1,value));
  const smooth=value=>{const a=clamp(value);return a*a*(3-2*a);};
  const motion=()=>!reducedQuery.matches&&window.InfiniteSettings?.getState?.().motion!==false;
  const emit=(name,value)=>window.dispatchEvent(new CustomEvent(name,{detail:value}));
  const cue=name=>emit('infinite:soundcue',{name,group:'world-map',variation:false});
  const progressStore=()=>window.InfiniteWorldProgress;
  const system=()=>window.InfiniteSystemSpace;
  const waitFor=(promise,ms,message)=>new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});
  const buttonFor=id=>nodes.querySelector(`[data-world-stage="${id}"]`);
  function setPhase(value){phase=value;root.dataset.phase=value;root.setAttribute('aria-busy',String(['preparing','entering','closing'].includes(value)));}
  function fail(error){lastError=error?.userMessage||error?.message||'世界地图暂未载入，请重试。';errorNode.textContent=lastError;errorNode.hidden=false;}
  function preload(){
    if(!preloadJob)preloadJob=Promise.all(Object.entries(artUrls).map(async([key,url])=>{const image=new Image();image.src=url;await image.decode();return [key,image];})).then(values=>assets=Object.fromEntries(values)).catch(error=>{preloadJob=null;throw error;});
    return preloadJob;
  }
  function markup(){
    nodes.innerHTML=progressStore().stages.map((item,index)=>`<button type="button" class="world-level" data-world-stage="${item.id}" data-index="${index}" data-status="locked" aria-pressed="false"><span class="world-landmark" style="--column:${index%3};--row:${Math.floor(index/3)}" aria-hidden="true"></span><span class="world-level-stem" aria-hidden="true"></span><span class="world-level-label"><span class="world-level-seal" aria-hidden="true"><b>${item.number}</b></span><span class="world-level-type"><span>${item.name}</span><small data-world-node-state></small></span></span><span class="world-level-aura" aria-hidden="true"></span></button>`).join('');
    routeGroup.innerHTML=progressStore().stages.slice(1).map((_,index)=>`<path data-world-route="${index}"/>`).join('');
  }
  function syncState(){
    try{state=progressStore().getState();}catch(error){fail(error);return;}
    const active=state.stages.find(item=>item.id===state.selectedId)||state.stages[0];
    root.dataset.completed=String(state.completedCount);root.dataset.selected=active.id;
    root.querySelector('[data-world-count]').textContent=String(state.completedCount).padStart(2,'0');
    for(const item of state.stages){const button=buttonFor(item.id);if(!button)continue;button.dataset.status=item.status;button.classList.toggle('is-selected',item.id===active.id);button.setAttribute('aria-pressed',String(item.id===active.id));button.setAttribute('aria-label',`${item.number} ${item.name}，${item.status==='completed'?'已通关':item.status==='available'?'待探索':'未解锁'}`);button.querySelector('[data-world-node-state]').textContent=item.status==='completed'?'已通关':item.status==='available'?'待探索':'未解锁';}
    root.querySelector('[data-world-number]').textContent=active.number;root.querySelector('[data-world-name]').textContent=active.name;
    root.querySelector('[data-world-status]').textContent=active.status==='completed'?'已通关':active.status==='available'?'待探索':'未解锁';
    root.querySelector('[data-world-kind]').textContent=kinds[active.index];root.querySelector('[data-world-position]').textContent=`${active.number} / 06`;
    root.querySelector('[data-world-prev]').disabled=active.index===0;root.querySelector('[data-world-next]').disabled=active.index===state.stages.length-1;
    for(const path of routeGroup.children)path.classList.toggle('is-cleared',Number(path.dataset.worldRoute)<state.completedCount-1);
    if(detail.open)fillDetail(active);requestDraw();
  }
  function resize(){
    virtualWidth=Math.max(1320,innerWidth);stage.style.width=`${virtualWidth}px`;stage.style.height=`${innerHeight}px`;
    routes.setAttribute('viewBox',`0 0 ${virtualWidth} ${innerHeight}`);routes.setAttribute('width',virtualWidth);routes.setAttribute('height',innerHeight);
    renderer?.resize();requestDraw();
  }
  function positionNodes(){
    if(!renderer||!state)return;const points=[];
    for(const item of state.stages){
      const p=renderer.project({u:item.u,v:item.v,lift:0}),node=buttonFor(item.id);if(!p||!node)continue;
      const alpha=smooth((progress-(.16+item.u*.39))/.28);node.style.left=`${p.x.toFixed(2)}px`;node.style.top=`${p.y.toFixed(2)}px`;node.style.setProperty('--arrival',alpha.toFixed(3));node.style.setProperty('--node-scale',Math.max(.85,Math.min(1.12,p.scale||1)).toFixed(3));points.push(p);
    }
    for(let i=0;i<points.length-1;i++){
      const a=points[i],b=points[i+1],dx=(b.x-a.x)*.48;
      routeGroup.children[i]?.setAttribute('d',`M ${a.x} ${a.y+12} C ${a.x+dx} ${a.y+12}, ${b.x-dx} ${b.y+12}, ${b.x} ${b.y+12}`);
    }
  }
  function draw(now=performance.now()){
    frame=0;if(root.hidden||document.hidden||!renderer)return;
    const dt=Math.min(.05,(now-(lastTime||now))/1000);lastTime=now;
    pointerX+=(aimX-pointerX)*(1-Math.exp(-dt*5));pointerY+=(aimY-pointerY)*(1-Math.exp(-dt*5));
    if(transition){const linear=motion()?clamp((now-transition.start)/transition.duration):1;const eased=linear*linear*(3-2*linear);progress=transition.from+(transition.to-transition.from)*eased;if(transition.to===0)viewport.scrollLeft=transition.scroll*(1-eased);if(linear>=1){const completed=transition;transition=null;progress=completed.to;queueMicrotask(()=>completed.resolve(true));}}
    renderer.setState({progress,completedCount:state?.completedCount||0,selectedIndex:state?.stages.find(item=>item.id===state.selectedId)?.index||0,pointerX:motion()?pointerX:0,pointerY:motion()?pointerY:0,time:now});renderer.render();positionNodes();
    root.style.setProperty('--interface',smooth((progress-.54)/.37).toFixed(3));root.style.setProperty('--mist',smooth((progress-.32)/.5).toFixed(3));
    if(transition||motion()&&phase==='ready'&&(Math.abs(aimX-pointerX)>.0002||Math.abs(aimY-pointerY)>.0002))frame=requestAnimationFrame(draw);
  }
  function requestDraw(){if(!frame&&!root.hidden&&!document.hidden&&renderer)frame=requestAnimationFrame(draw);}
  function animateTo(value,duration){
    transition?.resolve(false);transition=null;
    if(!motion()||document.hidden||Math.abs(progress-value)<.0001){progress=value;draw();return Promise.resolve(true);}
    return new Promise(resolve=>{transition={from:progress,to:value,start:performance.now(),duration,resolve,scroll:viewport.scrollLeft};requestDraw();});
  }
  function cancelAnimation(){cancelAnimationFrame(frame);frame=0;lastTime=0;transition?.resolve(false);transition=null;}
  function releaseRenderer(){renderer?.dispose();renderer=null;if(snapshot?.image){snapshot.image.width=snapshot.image.height=1;}snapshot=null;hold.width=hold.height=1;}
  function focusSelected(){buttonFor(state?.selectedId)?.focus({preventScroll:true});}
  function centerSelected({instant=false}={}){
    const node=buttonFor(state?.selectedId);if(!node)return;
    const left=parseFloat(node.style.left)||0;viewport.scrollTo({left:Math.max(0,left-viewport.clientWidth*.45),behavior:!instant&&motion()?'smooth':'instant'});
  }
  async function open(trigger){
    if(phase!=='hidden'||system()?.getState().phase!=='ready')return false;
    const token=++serial;setPhase('preparing');opener=trigger||document.getElementById('system-control-world');lastError='';errorNode.hidden=true;
    system().setTransitioning(true);opener?.setAttribute('aria-busy','true');opener?.classList.add('world-map-pending');
    try{
      await waitFor(preload(),15000,'地图资源加载较慢，请重试。');if(token!==serial)return false;
      await waitFor(window.DeityReturnCapture?.prepare?.(document.getElementById('system-space')),12000,'当前画面尚未准备好，请重试。');if(token!==serial)return false;
      if(system()?.getState().phase!=='ready'||!system()?.getState().visible)throw new Error('请从系统空间重新打开地图。');
      snapshot=window.captureSceneReturnFrame?.(document.getElementById('system-space'));if(!snapshot?.image)throw new Error('当前画面尚未准备好，请重试。');
      system().setTransitioning(true);opener?.setAttribute('aria-expanded','true');root.hidden=false;root.inert=false;root.style.setProperty('--interface','0');root.style.setProperty('--mist','0');root.dataset.motion=motion()?'full':'reduced';viewport.scrollLeft=0;progress=0;aimX=aimY=pointerX=pointerY=0;
      hold.width=snapshot.image.width;hold.height=snapshot.image.height;hold.getContext('2d').drawImage(snapshot.image,0,0);hold.hidden=false;
      markup();resize();renderer=window.InfiniteWorldTerrain?.create(canvas,{onError:()=>{root.dataset.fallback='true';}});if(!renderer)throw new Error('山海地图尚未准备好，请重试。');
      await renderer.prepare({source:snapshot.image,texture:assets.texture});if(token!==serial)return false;
      syncState();world.dataset.state='world-map';setPhase('entering');renderer.resize();draw();hold.hidden=true;opener?.removeAttribute('aria-busy');opener?.classList.remove('world-map-pending');root.focus({preventScroll:true});cue(motion()?'world-tectonic-rise':'world-node-select');
      const finished=await animateTo(1,2450);if(token!==serial||!finished)return false;
      setPhase('ready');syncState();centerSelected({instant:true});focusSelected();requestDraw();emit('infinite:worldmapready',{saveId:state?.saveId});return true;
    }catch(error){if(token!==serial)return false;fail(error);cleanup({focus:true});throw error;}
  }
  function cleanup({focus=true}={}){
    cancelAnimation();releaseDrag();ignoreClickUntil=0;if(detail.open)detail.close();root.hidden=true;root.inert=true;root.classList.remove('is-dragging');root.dataset.phase='hidden';setPhase('hidden');opener?.setAttribute('aria-expanded','false');opener?.removeAttribute('aria-busy');opener?.classList.remove('world-map-pending');emit('infinite:soundstop',{group:'world-map',fade:.12});releaseRenderer();
    if(system()?.getState().visible){system().setTransitioning(false);world.dataset.state='system';if(focus&&!document.hidden)opener?.focus({preventScroll:true});}
    emit('infinite:worldmapclosed',{});
  }
  async function close({immediate=false,focus=true}={}){
    if(phase==='hidden'||phase==='closing')return false;
    const token=++serial;
    if(phase==='preparing'||immediate||!renderer){cleanup({focus});return true;}
    if(detail.open)detail.close();setPhase('closing');root.inert=true;emit('infinite:soundstop',{group:'world-map',fade:.1});cue('world-tectonic-fold');
    await animateTo(0,1350);if(token!==serial)return false;cleanup({focus});return true;
  }
  function select(id,{focus=false,center=true}={}){
    if(phase!=='ready')return;
    try{const old=state?.selectedId;progressStore().select(id);syncState();if(old!==id){lastFocus=performance.now();lastFocusId=id;cue('world-node-select');const node=buttonFor(id);node?.classList.remove('world-node-written');void node?.offsetWidth;node?.classList.add('world-node-written');}if(center)centerSelected();if(focus)focusSelected();}
    catch(error){fail(error);}
  }
  function focusCue(node){const now=performance.now();if(phase!=='ready'||now-lastFocus<220||(lastFocusId===node.dataset.worldStage&&now-lastFocus<650))return;lastFocus=now;lastFocusId=node.dataset.worldStage;cue('world-node-focus');}
  function fillDetail(item){
    detail.dataset.status=item.status;const art=detail.querySelector('.world-detail-landmark');art.style.setProperty('--column',item.index%3);art.style.setProperty('--row',Math.floor(item.index/3));
    detail.querySelector('.world-detail-index').textContent=`第 ${item.number} 关`;detail.querySelector('h2').textContent=item.name;detail.querySelector('.world-detail-kind').textContent=kinds[item.index];detail.querySelector('.world-detail-description').textContent=descriptions[item.index];detail.querySelector('.world-detail-state').textContent=item.status==='completed'?'已通关':item.status==='available'?'待探索':`通关「${state.stages[item.index-1]?.name||'前一关'}」后开启`;
  }
  function inspect(){if(phase!=='ready')return;fillDetail(state.stages.find(item=>item.id===state.selectedId));detail.showModal();cue('world-node-select');detail.querySelector('button').focus({preventScroll:true});}
  root.addEventListener('click',event=>{if(performance.now()<ignoreClickUntil)return;const node=event.target.closest('[data-world-stage]');if(node)select(node.dataset.worldStage);else if(event.target.closest('[data-world-back]'))void close();else if(event.target.closest('[data-world-inspect]'))inspect();else if(event.target.closest('[data-world-prev],[data-world-next]')){const delta=event.target.closest('[data-world-prev]')?-1:1;const index=state.stages.findIndex(item=>item.id===state.selectedId);const next=state.stages[index+delta];if(next)select(next.id,{focus:true});}});
  nodes.addEventListener('pointerover',event=>{const node=event.target.closest('[data-world-stage]');if(node&&!node.contains(event.relatedTarget))focusCue(node);});
  nodes.addEventListener('focusin',event=>{const node=event.target.closest('[data-world-stage]');if(node)focusCue(node);});
  root.addEventListener('pointermove',event=>{if(phase!=='ready'||!motion())return;aimX=(event.clientX/innerWidth-.5)*2;aimY=(event.clientY/innerHeight-.5)*2;requestDraw();});
  root.addEventListener('pointerleave',()=>{aimX=aimY=0;requestDraw();});
  viewport.addEventListener('pointerdown',event=>{if(phase==='ready'&&event.pointerType!=='touch'&&event.button===0)drag={id:event.pointerId,start:event.clientX,scroll:viewport.scrollLeft,moved:false};});
  viewport.addEventListener('pointermove',event=>{if(!drag||drag.id!==event.pointerId)return;const delta=event.clientX-drag.start;if(Math.abs(delta)>7&&!drag.moved){drag.moved=true;viewport.setPointerCapture(event.pointerId);root.classList.add('is-dragging');}if(drag.moved){viewport.scrollLeft=drag.scroll-delta;ignoreClickUntil=performance.now()+250;}});
  function releaseDrag(){const active=drag;drag=null;if(active&&viewport.hasPointerCapture(active.id))viewport.releasePointerCapture(active.id);root.classList.remove('is-dragging');}
  viewport.addEventListener('pointerup',releaseDrag);viewport.addEventListener('pointercancel',releaseDrag);
  viewport.addEventListener('lostpointercapture',releaseDrag);
  viewport.addEventListener('wheel',event=>{if(phase==='ready'&&virtualWidth>innerWidth&&Math.abs(event.deltaY)>Math.abs(event.deltaX)){event.preventDefault();viewport.scrollLeft+=event.deltaY;}},{passive:false});
  detail.querySelector('button').addEventListener('click',()=>{detail.close();focusSelected();});detail.addEventListener('click',event=>{if(event.target===detail){const r=detail.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom){detail.close();focusSelected();}}});
  root.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(detail.open){detail.close();focusSelected();}else void close();return;}
    if(phase!=='ready'||detail.open)return;
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=state.stages.findIndex(item=>item.id===state.selectedId),next=event.key==='Home'?0:event.key==='End'?5:Math.max(0,Math.min(5,index+(event.key==='ArrowLeft'?-1:1)));select(state.stages[next].id,{focus:true});}
    if(event.key==='Tab'){const focusable=[...root.querySelectorAll('button:not(:disabled)')].filter(item=>item.getClientRects().length&&!detail.contains(item)),first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
  });
  window.addEventListener('infinite:worldprogress',event=>{if(phase==='hidden')return;if(event.detail?.error){fail({message:event.detail.error});return;}syncState();if(event.detail?.reason==='completion'){root.classList.remove('world-color-bloom');void root.offsetWidth;root.classList.add('world-color-bloom');}});
  window.addEventListener('infinite:saveactive',()=>{if(phase!=='hidden'){syncState();if(phase==='ready')centerSelected({instant:true});}});
  window.addEventListener('resize',resize);
  function motionChange(){root.dataset.motion=motion()?'full':'reduced';if(transition&&!motion()){const finished=transition;transition=null;progress=finished.to;finished.resolve(true);}requestDraw();}
  reducedQuery.addEventListener('change',motionChange);window.addEventListener('infinite:settings',motionChange);
  window.addEventListener('keydown',event=>{if(phase==='preparing'&&event.key==='Escape'){event.preventDefault();event.stopPropagation();void close({immediate:true});}},true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;if(transition){const finished=transition;transition=null;progress=finished.to;finished.resolve(true);}}else{lastTime=0;requestDraw();}});
  window.addEventListener('infinite:title',()=>{if(phase!=='hidden')void close({immediate:true,focus:false});});
  window.addEventListener('pagehide',()=>{if(phase!=='hidden')void close({immediate:true,focus:false});});
  window.InfiniteWorldMap=Object.freeze({open,close,preload,getState:()=>({phase,visible:!root.hidden,progress,completedCount:state?.completedCount||0,selectedId:state?.selectedId||null,saveId:state?.saveId||null,detailOpen:detail.open,moving:Boolean(frame),lastError,renderer:renderer?.getState?.()||null})});
})();
