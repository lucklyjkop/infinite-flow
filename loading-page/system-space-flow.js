/* Save naming and scene ownership share one serialized handoff. Neither an
   aborted name prompt nor an unfinished target can replace the current page. */
(() => {
  'use strict';
  const world=document.getElementById('world');if(!world)return;
  let generation=0,phase='idle',active=null,lastError='',handoffs=0,showingTitle=false,retrySave=null;
  const deity=()=>window.InfiniteDeitySpace,system=()=>window.InfiniteSystemSpace;
  const current=run=>active===run&&run.token===generation;
  const emit=(name,detail={})=>window.dispatchEvent(new CustomEvent(name,{detail}));
  const reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches||window.InfiniteSettings?.getState?.().motion===false;
  const frame=()=>document.hidden?Promise.resolve():new Promise(resolve=>requestAnimationFrame(resolve));
  const twoFrames=async()=>{await frame();await frame();};
  function bounded(promise,ms,message){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error(message)),ms);Promise.resolve(promise).then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});});}
  function inertDeity(value){const root=document.getElementById('deity-space');if(root&&!root.hidden)root.inert=value;}
  function requireCurrent(run){if(!current(run))throw new Error('页面切换已取消。');}
  function release(run){run.cover?.release();run.cover=null;if(run.sourceRoot)run.sourceRoot.style.visibility=run.sourceVisibility;for(const value of run.frames||[])value.image.width=value.image.height=1;run.frames=[];}
  function cancel(){++generation;const old=active;active=null;if(old)release(old);inertDeity(false);system()?.setTransitioning(false);document.getElementById('title-screen').inert=false;world.classList.remove('deity-returning');phase='idle';}
  function capture(run,root){const image=window.captureSceneReturnFrame?.(root);if(!image)throw new Error('当前页面尚未绘制完成，请重试。');run.frames.push(image);return image;}
  function cover(run,image){if(!image)throw new Error('当前页面尚未绘制完成，请重试。');if(!run.frames.includes(image))run.frames.push(image);run.cover=window.InfiniteSceneTransition.create(image);}
  async function prepareSystem(run){
    if(!system()?.open||!window.InfiniteSaves||!window.InfiniteSceneTransition)throw new Error('系统空间尚未就绪，请重试。');
    const assets=await bounded(system().preload(),16000,'系统空间资源加载较慢，请稍后重试。');requireCurrent(run);
    if(!assets?.ready)throw new Error('系统空间资源未能载入，请检查连接后重试。');
    // A failed Cubism load retains the illustration fallback. Successful loads
    // are attached before capture, never swapped into a finished wave.
    await bounded(window.InfiniteSystemLive2D?.prepare?.(),16000,'人物资源加载较慢，请稍后重试。');requireCurrent(run);
  }
  async function arrive(run,save){
    system().setTransitioning(true);
    const opened=await bounded(system().open({...save.deity,immediate:true}),12000,'系统空间打开超时，请重试。');requireCurrent(run);
    if(!opened)throw new Error('系统空间打开失败，请重试。');
    run.opened=true;phase='entering';
    await twoFrames();requireCurrent(run);
    await bounded(window.DeityReturnCapture?.prepare?.(document.getElementById('system-space')),12000,'页面素材加载超时，请重试。');requireCurrent(run);
    // attach() has its own two-frame readiness handoff; let it finish while the
    // complete old scene is still covering the screen.
    await twoFrames();requireCurrent(run);
    const target=capture(run,document.getElementById('system-space'));
    deity()?.close({returnToTitle:false,immediate:true});run.handedOff=true;
    window.InfiniteTitle?.hide();
    if(run.source==='save'){run.sourceRoot=document.getElementById('save-page');run.sourceVisibility=run.sourceRoot.style.visibility;run.sourceRoot.style.visibility='hidden';}
    let sounded=false;
    const completed=await run.cover.play(target,{direction:'right-to-left',simple:run.source==='save',duration:run.source==='save'?320:2200,reducedMotion:reduced(),onProgress(progress){if(!sounded&&progress<1){sounded=true;emit('infinite:soundcue',{name:'deity-cube-assemble',group:'system-arrival',variation:false});}}});requireCurrent(run);
    if(!completed)throw new Error('页面切换已取消，请重新载入存档。');
    // The archive is above the hub. Remove it while the completed wave still
    // owns the screen, so it cannot reappear for one frame on release.
    if(run.source==='save')await window.InfiniteSaveUI?.hide({immediate:true});
    await twoFrames();requireCurrent(run);
    release(run);system().setTransitioning(false);inertDeity(false);
    document.getElementById('system-space').focus({preventScroll:true});
    ++handoffs;retrySave=null;active=null;phase='system';
    emit('infinite:systemarrived',{id:save.deity.id,saveId:save.id});return true;
  }
  async function recover(run,error){
    if(!current(run))return false;
    lastError=error?.message||'页面未能打开，请重试。';
    if(run.opened)await system()?.close({returnToTitle:false,immediate:true});
    if(!current(run))return false;
    if(run.source==='deity'){
      if(deity()?.getState().phase!=='ready')await deity()?.open({immediate:true,selectedId:run.value.id});
      if(!current(run))return false;
      world.dataset.state='deity';inertDeity(false);
      deity()?.recoverConfirmation(lastError);
    }else if(run.source==='save'){
      world.dataset.state='archives';
      if(run.previousSave)try{window.InfiniteSaves.activate(run.previousSave);}catch{}
    }
    system()?.setTransitioning(false);release(run);active=null;phase='idle';return false;
  }
  async function enter(value){
    const run=active={token:++generation,source:'deity',value,frames:[],opened:false,handedOff:false};
    phase='naming';lastError='';inertDeity(true);
    try{
      if(!window.InfiniteSaveUI?.requestName)throw new Error('存档命名页面尚未就绪，请重试。');
      const name=await window.InfiniteSaveUI.requestName({deity:value});requireCurrent(run);
      if(name===null){inertDeity(false);deity()?.recoverConfirmation();active=null;phase='idle';return false;}
      phase='preparing';await prepareSystem(run);requireCurrent(run);
      const selected=deity()?.getState();
      if(selected?.phase!=='ready'||selected.selected!==value.id||!selected.confirmed)throw new Error('主神选择已改变，请重新确认。');
      // Keep a committed slot if rendering fails after creation. A retry with
      // the same name resumes it rather than producing duplicate slots.
      let save=retrySave?.name===name&&retrySave.deity.id===value.id?window.InfiniteSaves.get(retrySave.id):null;
      if(!save)save=window.InfiniteSaves.create({name,deity:value});
      retrySave=save;run.saveId=save.id;window.InfiniteSaves.activate(save.id);
      await window.DeityReturnCapture?.ready;requireCurrent(run);
      cover(run,deity().captureFrame());
      return await arrive(run,save);
    }catch(error){return recover(run,error);}
  }
  async function load(id){
    const run=active={token:++generation,source:'save',frames:[],opened:false,handedOff:false,previousSave:window.InfiniteSaves?.active?.()?.id};
    phase='preparing';lastError='';
    try{
      const save=window.InfiniteSaves?.get(id);if(!save)throw new Error('这个存档已不存在，请重新选择。');
      run.value=save.deity;run.saveId=save.id;
      await prepareSystem(run);
      const page=document.getElementById('save-page');
      await bounded(window.DeityReturnCapture.prepare(page),12000,'存档页面素材加载超时。');requireCurrent(run);
      cover(run,capture(run,page));window.InfiniteSaves.activate(save.id);
      return await arrive(run,save);
    }catch(error){await recover(run,error);throw error;}
  }
  async function returnTitle(immediate=false){
    const run=active={token:++generation,source:'system',frames:[],opened:false,handedOff:false};phase='returning';lastError='';
    try{
      emit('infinite:systemleaving');
      const root=document.getElementById('system-space');
      await bounded(window.DeityReturnCapture.prepare(root),12000,'标题页面素材尚未准备好。');requireCurrent(run);
      cover(run,capture(run,root));system().setTransitioning(true);
      const title=document.getElementById('title-screen');title.classList.add('deity-restored');
      showingTitle=true;try{window.InfiniteTitle.returnToTitle();}finally{showingTitle=false;}
      await system().close({returnToTitle:false,immediate:true});requireCurrent(run);
      world.classList.add('deity-returning');title.inert=true;
      emit('infinite:deityreturnstart',{id:`system-${run.token}`,motion:!immediate&&!reduced(),presentation:'cube-wave',duration:2200});
      const target=window.captureTitleReturnFrame(world);if(!target)throw new Error('标题页面尚未绘制完成。');run.frames.push(target);
      let sounded=false;
      const complete=await run.cover.play(target,{direction:'left-to-right',duration:2200,reducedMotion:immediate||reduced(),onProgress(progress){if(!sounded&&progress<1){sounded=true;emit('infinite:soundcue',{name:'deity-return-wave',group:'system-return',variation:false});}}});requireCurrent(run);
      if(!complete)throw new Error('页面切换已取消。');
      await twoFrames();requireCurrent(run);
      release(run);title.inert=false;system().setTransitioning(false);world.classList.remove('deity-returning');
      emit('infinite:deityreturnend',{id:`system-${run.token}`,immediate});
      if(!document.hidden)title.querySelector('[data-menu-action="new"]')?.focus({preventScroll:true});
      active=null;phase='idle';return true;
    }catch(error){
      if(!current(run))return false;
      lastError=error?.message||'返回标题失败，请重试。';release(run);system()?.setTransitioning(false);world.classList.remove('deity-returning');
      document.getElementById('title-screen').inert=false;
      emit('infinite:deityreturnend',{id:`system-${run.token}`,immediate:true});
      active=null;phase=system()?.getState().visible?'system':'idle';return false;
    }
  }
  window.addEventListener('infinite:deityselected',event=>{
    if(event.defaultPrevented)return;const value=event.detail,selection=deity()?.getState();
    if(!value||selection?.phase!=='ready'||!selection.confirmed||selection.selected!==value.id)return;
    event.preventDefault();if(active||system()?.getState().visible)return;void enter({id:value.id,name:value.name});
  });
  window.addEventListener('infinite:loadsave',event=>{
    if(event.defaultPrevented||typeof event.detail?.waitUntil!=='function')return;
    event.preventDefault();event.detail.waitUntil(active?Promise.resolve(false):load(event.detail.id));
  });
  window.addEventListener('infinite:systemreturn',event=>{
    if(event.defaultPrevented||typeof event.detail?.waitUntil!=='function')return;
    event.preventDefault();event.detail.waitUntil(active?Promise.resolve(false):returnTitle(Boolean(event.detail.immediate)));
  });
  window.addEventListener('infinite:startgame',()=>{system()?.preload?.().catch(()=>{});});
  window.addEventListener('infinite:title',()=>{if(showingTitle)return;cancel();void system()?.close({returnToTitle:false,immediate:true});});
  window.addEventListener('pagehide',()=>{cancel();void system()?.close({returnToTitle:false,immediate:true});});
  window.InfiniteSystemFlow=Object.freeze({getState:()=>({phase,busy:Boolean(active),handedOff:Boolean(active?.handedOff),handoffs,lastError,saveId:active?.saveId||window.InfiniteSaves?.active?.()?.id||null,transition:window.InfiniteSceneTransition?.getState()||null})});
})();
