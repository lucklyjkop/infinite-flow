/* The covenant page owns presentation only; the save ledger validates every unlock. */
(() => {
  'use strict';
  const progress=window.InfiniteCovenantProgress;
  if(!progress||!window.InfiniteCovenantScene)return;
  const branches=[['insight','灵识'],['ward','守心'],['crossing','因缘']];
  const catalog=progress.catalog,byId=new Map(catalog.map(node=>[node.id,node]));
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const root=document.createElement('dialog');
  root.id='covenant-space';root.className='covenant-space';root.setAttribute('aria-labelledby','covenant-heading');root.dataset.phase='hidden';
  root.innerHTML=`
    <div class="covenant-haze" aria-hidden="true"></div>
    <header class="covenant-header">
      <button type="button" class="covenant-back"><span aria-hidden="true">←</span> <span class="covenant-back-label">返回空间</span></button>
      <div class="covenant-heading"><p>红妆</p><h1 id="covenant-heading">主神契约</h1></div>
      <div class="covenant-points" aria-label="可用契约点" title="通关 +3 · 完成任务 +1"><img src="assets/world-detail/view-flower.png" alt="" draggable="false"><span>契约点 <strong>0</strong></span></div>
    </header>
    <div class="covenant-body">
      <section class="covenant-constellation" aria-label="契约天赋">
        <canvas class="covenant-canvas" aria-hidden="true"></canvas>
        <div class="covenant-nodes">${catalog.map(node=>`<button type="button" class="covenant-node" data-covenant-node="${node.id}" aria-controls="covenant-detail" aria-expanded="false" hidden><span class="covenant-node-label"><span>${node.name}</span><small></small></span></button>`).join('')}</div>
        <nav class="covenant-branches" aria-label="契约分支"><button type="button" data-covenant-branch="all" class="covenant-overview" aria-pressed="true">总览</button>${branches.map(([id,name])=>`<button type="button" data-covenant-branch="${id}" aria-pressed="false"><span class="covenant-icon" data-icon="${id}" aria-hidden="true"></span><span>${name}</span></button>`).join('')}</nav>
      </section>
      <section id="covenant-detail" class="covenant-ability covenant-detail" aria-labelledby="covenant-ability-name" hidden>
        <div class="covenant-detail-orbit" aria-hidden="true"><i></i><i></i><span><img src="assets/world-detail/view-flower.png" alt="" draggable="false"></span></div>
        <div class="covenant-ability-content">
          <div class="covenant-detail-eyebrow"><span class="covenant-ability-icon covenant-icon" data-icon="root" aria-hidden="true"></span><p class="covenant-ability-type"></p><span class="covenant-detail-status" tabindex="-1" role="status"></span></div>
          <h2 id="covenant-ability-name" tabindex="-1"></h2>
          <div class="covenant-detail-rule" aria-hidden="true"><span>✧</span></div>
          <p class="covenant-ability-copy"></p>
          <dl class="covenant-detail-metrics"><div><dt class="covenant-detail-metric-label"></dt><dd class="covenant-detail-metric-value"></dd></div><div><dt>持有契约点</dt><dd class="covenant-detail-balance"></dd></div></dl>
          <div class="covenant-detail-growth" aria-label="三脉契约">${branches.map(([id,name])=>`<button type="button" data-detail-branch="${id}"><span class="covenant-icon" data-icon="${id}" aria-hidden="true"></span><span>${name}</span><span class="covenant-detail-progress"><i></i></span><small>0 / 4</small><span aria-hidden="true">↗</span></button>`).join('')}</div>
          <div class="covenant-detail-chain"><span class="covenant-detail-chain-label">前置契约</span><button type="button" class="covenant-detail-parent"></button><span class="covenant-detail-parent-status"></span></div>
          <div class="covenant-detail-footer"><p class="covenant-ability-condition"></p><button class="covenant-unlock" type="button"></button></div>
          <p class="covenant-feedback" role="status" aria-live="polite"></p>
        </div>
      </section>
    </div>`;
  document.body.append(root);
  const canvas=root.querySelector('canvas'),ability=root.querySelector('.covenant-ability'),body=root.querySelector('.covenant-body');
  const fields={icon:root.querySelector('.covenant-ability-icon'),type:root.querySelector('.covenant-ability-type'),name:root.querySelector('#covenant-ability-name'),copy:root.querySelector('.covenant-ability-copy'),condition:root.querySelector('.covenant-ability-condition'),unlock:root.querySelector('.covenant-unlock'),feedback:root.querySelector('.covenant-feedback')};
  const detailFields={status:root.querySelector('.covenant-detail-status'),metricLabel:root.querySelector('.covenant-detail-metric-label'),metricValue:root.querySelector('.covenant-detail-metric-value'),balance:root.querySelector('.covenant-detail-balance'),growth:root.querySelector('.covenant-detail-growth'),chain:root.querySelector('.covenant-detail-chain'),parent:root.querySelector('.covenant-detail-parent'),parentStatus:root.querySelector('.covenant-detail-parent-status')};
  const nodeLayer=root.querySelector('.covenant-nodes'),branchNav=root.querySelector('.covenant-branches'),backLabel=root.querySelector('.covenant-back-label');
  const nodeButtons=new Map([...root.querySelectorAll('[data-covenant-node]')].map(button=>[button.dataset.covenantNode,button]));
  const branchButtons=[...root.querySelectorAll('[data-covenant-branch]')];
  const nodePoses=new Map();
  function readState(){try{return progress.getState();}catch(failure){return {saveId:null,earned:0,spent:0,balance:0,unlocked:['root'],tasks:[],error:failure.userMessage||'未能读取契约存档，请重试。'};}}
  let phase='hidden',selected='root',branch=null,state=readState(),opener=null,serial=0,preloadJob=null,closeJob=null,animation=null,panelAnimation=null,lastCue=0,lastHover=null,lastSceneHover=null,focusAfterOpen=false;
  let detailId=null,detailPhase='hidden',detailOrigin=null,detailSerial=0,detailJob=null;
  let outsidePress=null,lastActionCue=0;
  const motion=()=>!media.matches&&window.InfiniteSettings?.getState?.().motion!==false;
  function stopCue(group,fade=.055){window.dispatchEvent(new CustomEvent('infinite:soundstop',{detail:{group,fade}}));}
  function cue(name){
    if(document.hidden)return;
    const focus=name==='covenant-focus',group=focus?'covenant-focus':'covenant-action';
    if(!focus){lastActionCue=performance.now();stopCue('covenant-focus',.035);stopCue('covenant-action');}
    window.dispatchEvent(new CustomEvent('infinite:soundcue',{detail:{name,group,variation:false}}));
  }
  function status(id){const node=byId.get(id);return state.unlocked.includes(id)?'unlocked':state.unlocked.includes(node.parent)?'available':'locked';}
  function hover(id){const now=performance.now();if(!id||id===lastHover||now-lastCue<220||now-lastActionCue<220||phase!=='ready')return;lastHover=id;lastCue=now;cue('covenant-focus');}
  function layout(nodes){
    for(const node of nodes){
      const button=nodeButtons.get(node.id);if(!button)continue;
      button.hidden=!node.visible;
      if(!node.visible)continue;
      const pose={x:node.x.toFixed(2),y:node.y.toFixed(2),size:Math.max(44,node.r*2.08).toFixed(2),opacity:node.opacity.toFixed(3)},previous=nodePoses.get(node.id);
      if(!previous||pose.x!==previous.x||pose.y!==previous.y)button.style.transform=`translate3d(${pose.x}px,${pose.y}px,0) translate(-50%,-50%)`;
      if(!previous||pose.size!==previous.size){button.style.width=`${pose.size}px`;button.style.height=`${pose.size}px`;}
      if(!previous||pose.opacity!==previous.opacity)button.style.opacity=pose.opacity;
      nodePoses.set(node.id,pose);
    }
  }
  const scene=window.InfiniteCovenantScene.create(canvas,{onNodeClick:openDetail,onNodeHover:hover,onLayout:layout});
  function sceneHover(id){if(lastSceneHover===id)return;lastSceneHover=id;scene.setState({hovered:id});}
  function refresh(){
    state=readState();if(state.error)fields.feedback.textContent=state.error;root.querySelector('.covenant-points strong').textContent=state.balance;
    root.querySelector('.covenant-points').setAttribute('aria-label',`可用契约点 ${state.balance}`);
    for(const [id,button] of nodeButtons){
      const node=byId.get(id),kind=status(id),label=id==='root'?'契约之始':kind==='unlocked'?'已解锁':kind==='available'?`${node.cost} 契约点`:'未解锁';
      button.dataset.status=kind;button.setAttribute('aria-pressed',String(id===selected));button.setAttribute('aria-label',`${node.name}，${label}`);button.querySelector('small').textContent=label;
      button.setAttribute('aria-expanded',String(id===detailId));
    }
    for(const button of branchButtons)button.setAttribute('aria-pressed',String(button.dataset.covenantBranch===(branch||'all')));
    root.dataset.view=branch?'branch':'overview';scene.setState({selected,branch,detail:detailId,unlocked:state.unlocked,motion:motion()});
    if(!detailId)return;
    const node=byId.get(detailId),kind=status(detailId),owned=kind==='unlocked',prerequisite=byId.get(node.parent),origin=detailId==='root';
    fields.icon.dataset.icon=node.branch||'root';fields.type.textContent=origin?'本命契印':`${branches.find(([id])=>id===node.branch)?.[1]||''} · ${node.type}`;
    fields.name.textContent=node.name;fields.copy.textContent=node.description;
    detailFields.status.textContent=origin?'已缔结':owned?'已觉醒':kind==='locked'?'未解锁':'可解锁';
    detailFields.metricLabel.textContent=origin?'已觉醒契印':'所需契约点';
    detailFields.metricValue.textContent=origin?`${Math.max(0,state.unlocked.length-1)} / 12`:String(node.cost);
    detailFields.balance.textContent=state.balance;
    detailFields.growth.hidden=!origin;detailFields.chain.hidden=origin;
    for(const button of detailFields.growth.querySelectorAll('button')){const count=catalog.filter(item=>item.branch===button.dataset.detailBranch&&state.unlocked.includes(item.id)).length;button.querySelector('small').textContent=`${count} / 4`;button.querySelector('i').style.transform=`scaleX(${count/4})`;button.setAttribute('aria-label',`${button.dataset.detailBranch==='insight'?'灵识':button.dataset.detailBranch==='ward'?'守心':'因缘'}，已觉醒 ${count} 项，查看分支`);}
    if(prerequisite){detailFields.parent.textContent=prerequisite.name+' ↗';detailFields.parent.dataset.parentId=prerequisite.id;detailFields.parentStatus.textContent=state.unlocked.includes(node.parent)?'已缔结':'未解锁';}
    fields.condition.textContent=origin?'':owned?'契印已觉醒':kind==='locked'?'前置契约尚未缔结':state.balance<node.cost?`尚缺 ${node.cost-state.balance} 契约点`:'';
    fields.unlock.hidden=origin||owned;fields.unlock.disabled=owned||kind==='locked'||state.balance<node.cost||!state.saveId;
    fields.unlock.textContent=kind==='locked'?'尚未解锁':state.balance<node.cost?'点数不足':'缔结契约';
    ability.dataset.status=kind;ability.dataset.origin=String(origin);
  }
  function chooseBranch(id){
    if(phase!=='ready'||!byId.has(id))return;
    if(!detailId&&detailPhase==='hidden'&&selected===id&&branch===byId.get(id).branch)return;
    closeDetail({immediate:true,focus:false});
    selected=id;branch=byId.get(id).branch;fields.feedback.textContent='';cue('covenant-branch');refresh();
  }
  function detailMode(active){
    nodeLayer.inert=active;branchNav.inert=active;
    backLabel.textContent=active?'返回契图':'返回空间';
    root.dataset.detail=active?'open':'closed';
  }
  function openDetail(id){
    if(phase!=='ready'||!byId.has(id))return false;
    const token=++detailSerial;panelAnimation?.cancel();
    if(!detailId)detailOrigin={selected,branch,focus:nodeButtons.get(id)};
    detailId=selected=id;detailPhase='opening';fields.feedback.textContent='';ability.hidden=false;
    refresh();focusAfterOpen=true;fields.name.focus({preventScroll:true});focusAfterOpen=false;detailMode(true);cue('covenant-detail-open');
    if(motion()&&!document.hidden){
      panelAnimation=ability.animate([{opacity:0,transform:'translateX(22px)'},{opacity:1,transform:'translateX(0)'}],{duration:460,delay:60,easing:'cubic-bezier(.16,.8,.2,1)',fill:'backwards'});
      detailJob=panelAnimation.finished.catch(()=>{}).then(()=>{if(token===detailSerial){detailPhase='ready';panelAnimation=null;}return true;});
    }else{detailPhase='ready';panelAnimation=null;detailJob=Promise.resolve(true);}
    return true;
  }
  function closeDetail({immediate=false,focus=true}={}){
    if(detailPhase==='hidden')return Promise.resolve(false);
    if(detailPhase==='closing'&&!immediate)return detailJob;
    const token=++detailSerial;panelAnimation?.cancel();panelAnimation=null;outsidePress=null;
    detailId=null;detailPhase='closing';
    if(detailOrigin){selected=detailOrigin.selected;branch=detailOrigin.branch;}
    root.dataset.detail='closing';refresh();
    const finish=()=>{if(token!==detailSerial)return false;ability.hidden=true;detailMode(false);detailPhase='hidden';panelAnimation=null;const target=detailOrigin?.focus;detailOrigin=null;if(focus&&root.open){focusAfterOpen=true;(target&&!target.hidden?target:root.querySelector('.covenant-back')).focus({preventScroll:true});focusAfterOpen=false;}return true;};
    if(!immediate)cue('covenant-detail-close');
    if(immediate||!motion()||document.hidden){finish();return Promise.resolve(true);}
    panelAnimation=ability.animate([{opacity:1,transform:'translateX(0)'},{opacity:0,transform:'translateX(14px)'}],{duration:260,easing:'ease-in',fill:'forwards'});
    const current=panelAnimation;detailJob=current.finished.then(()=>{const value=finish();current.cancel();return value;},()=>false);return detailJob;
  }
  function preload(){
    if(!preloadJob){const urls=['assets/covenant/branch-icons.png','assets/covenant/unlock-petal.png','assets/world-detail/view-flower.png'];
      const resources=urls.map(src=>{const image=new Image();image.src=src;return image.decode().then(()=>true,()=>false);});
      resources.push(Promise.resolve(scene.prepare?.()??true).then(value=>value!==false,()=>false));
      preloadJob=Promise.all(resources).then(values=>{if(values.some(value=>!value)){preloadJob=null;return false;}return true;});
    }return preloadJob;
  }
  async function open(trigger){
    if(phase!=='hidden'||window.InfiniteSystemSpace?.getState().phase!=='ready')return false;
    const token=++serial;phase='preparing';opener=trigger;opener?.setAttribute('aria-busy','true');
    const ready=await preload();
    if(token!==serial)return false;
    opener?.removeAttribute('aria-busy');
    if(!ready){phase='hidden';window.dispatchEvent(new CustomEvent('infinite:covenanterror',{detail:{message:'契约资源未能载入，请重试。'}}));return false;}
    const system=window.InfiniteSystemSpace?.getState();
    if(system?.phase!=='ready'||system.transitioning||document.querySelector('dialog[open]')){phase='hidden';return false;}
    state=readState();
    if(state.error){phase='hidden';window.dispatchEvent(new CustomEvent('infinite:covenanterror',{detail:{message:state.error}}));return false;}
    selected='root';branch=null;fields.feedback.textContent='';lastHover=null;lastCue=0;lastSceneHover=null;scene.setState({hovered:null});root.dataset.phase='opening';root.classList.toggle('motion-off',!motion());
    window.InfiniteSystemSpace.setTransitioning(true);opener?.setAttribute('aria-expanded','true');
    root.showModal();document.getElementById('world')?.classList.add('covenant-covered');phase='opening';refresh();scene.resize();scene.start();cue('covenant-enter');
    const duration=motion()&&!document.hidden?680:0;
    if(duration){animation=body.animate([{opacity:0},{opacity:1}],{duration,easing:'cubic-bezier(.16,.7,.2,1)'});await animation.finished.catch(()=>{});}
    if(token!==serial)return false;
    phase='ready';root.dataset.phase='ready';animation=null;scene.resize();focusAfterOpen=true;root.querySelector('.covenant-back').focus({preventScroll:true});focusAfterOpen=false;
    return true;
  }
  function close({immediate=false,focus=true}={}){
    if(phase==='hidden')return Promise.resolve(false);
    if(phase==='closing'&&!immediate)return closeJob||Promise.resolve(false);
    closeDetail({immediate:true,focus:false});++serial;animation?.cancel();panelAnimation?.cancel();animation=panelAnimation=null;
    if(phase==='preparing'){phase='hidden';opener?.removeAttribute('aria-busy');return Promise.resolve(true);}
    phase='closing';root.dataset.phase='closing';if(!immediate)cue('covenant-leave');
    const finish=()=>{scene.stop();root.close();document.getElementById('world')?.classList.remove('covenant-covered');phase='hidden';root.dataset.phase='hidden';animation?.cancel();animation=null;opener?.setAttribute('aria-expanded','false');opener?.removeAttribute('aria-busy');window.InfiniteSystemSpace?.setTransitioning(false);if(focus&&window.InfiniteSystemSpace?.getState().phase==='ready')opener?.focus({preventScroll:true});stopCue('covenant-action',.1);stopCue('covenant-focus',.04);};
    if(immediate||!motion()||document.hidden){finish();return Promise.resolve(true);}
    const token=serial;
    animation=body.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.965)'}],{duration:300,easing:'ease-in',fill:'forwards'});
    closeJob=animation.finished.then(()=>{if(token===serial)finish();return true;},()=>false);return closeJob;
  }
  root.querySelector('.covenant-back').addEventListener('click',()=>detailPhase!=='hidden'?closeDetail():close());
  detailFields.parent.addEventListener('click',()=>openDetail(detailFields.parent.dataset.parentId));
  root.addEventListener('cancel',event=>{event.preventDefault();if(detailPhase!=='hidden')closeDetail();else close();});
  root.addEventListener('click',event=>{const node=event.target.closest('[data-covenant-node]'),branchButton=event.target.closest('[data-covenant-branch]'),detailBranch=event.target.closest('[data-detail-branch]');if(node)openDetail(node.dataset.covenantNode);else if(branchButton)chooseBranch(branchButton.dataset.covenantBranch==='all'?'root':branchButton.dataset.covenantBranch);else if(detailBranch)chooseBranch(detailBranch.dataset.detailBranch);});
  function isDetailOutside(event){
    if(!detailId||!['opening','ready'].includes(detailPhase)||event.target.closest('.covenant-ability-content,.covenant-header button,.covenant-points'))return false;
    const pose=scene.getState().layout.find(node=>node.id===detailId),box=canvas.getBoundingClientRect();
    // Treat the whole fluid sculpture as content, including its moving openings.
    return !pose||Math.hypot(event.clientX-box.left-pose.x,event.clientY-box.top-pose.y)>pose.r*1.25;
  }
  root.addEventListener('pointerdown',event=>{
    outsidePress=event.isPrimary&&event.button===0&&isDetailOutside(event)?{id:detailId,pointerId:event.pointerId,x:event.clientX,y:event.clientY,scroll:root.scrollTop}:null;
  },{passive:true});
  root.addEventListener('pointermove',event=>{if(outsidePress&&Math.hypot(event.clientX-outsidePress.x,event.clientY-outsidePress.y)>8)outsidePress=null;},{passive:true});
  root.addEventListener('pointercancel',()=>{outsidePress=null;},{passive:true});
  root.addEventListener('scroll',()=>{outsidePress=null;},{passive:true});
  root.addEventListener('click',event=>{
    const press=outsidePress;outsidePress=null;
    if(event.button===0&&press&&press.id===detailId&&press.scroll===root.scrollTop&&isDetailOutside(event))closeDetail();
  });
  root.addEventListener('pointerover',event=>{const button=event.target.closest('button');if(button&&!button.disabled)hover(button.dataset.covenantNode||button.dataset.covenantBranch||button.className);});
  root.addEventListener('pointerover',event=>{const node=event.target.closest('[data-covenant-node]');sceneHover(node?.dataset.covenantNode||null);});
  root.addEventListener('pointerleave',()=>sceneHover(null));
  root.addEventListener('focusin',event=>{const node=event.target.closest('[data-covenant-node]');if(node)sceneHover(node.dataset.covenantNode);});
  root.addEventListener('focusout',event=>{if(event.target.closest('[data-covenant-node]'))sceneHover(null);});
  root.addEventListener('focusin',event=>{if(!focusAfterOpen&&event.target.matches('button:focus-visible'))hover(event.target.dataset.covenantNode||event.target.className);});
  root.addEventListener('keydown',event=>{
    if(phase!=='ready'||event.altKey||event.metaKey||event.ctrlKey)return;
    const button=event.target.closest('[data-covenant-node]');if(!button||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const visible=[...nodeButtons.values()].filter(item=>!item.hidden),index=visible.indexOf(button);event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?visible.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+visible.length)%visible.length;visible[next]?.focus({preventScroll:true});
  });
  fields.unlock.addEventListener('click',()=>{
    if(phase!=='ready'||!detailId||fields.unlock.disabled||fields.unlock.hidden)return;
    try{progress.unlock(detailId);fields.feedback.textContent='';cue('covenant-unlock');focusAfterOpen=true;detailFields.status.focus({preventScroll:true});focusAfterOpen=false;if(motion())detailFields.status.animate([{opacity:.3},{opacity:1}],{duration:850,easing:'ease-out'});}
    catch(failure){fields.feedback.textContent=failure.userMessage||'未能保存契约，请重试。';refresh();}
  });
  root.addEventListener('contextmenu',event=>event.preventDefault());root.addEventListener('dragstart',event=>event.preventDefault());
  window.addEventListener('infinite:covenantchange',()=>{if(root.open)refresh();});
  function changedMotion(){root.classList.toggle('motion-off',!motion());if(!motion()){animation?.finish();panelAnimation?.finish();}if(root.open)refresh();}
  for(const name of ['infinite:settings','infinite:settingssaved'])window.addEventListener(name,changedMotion);
  media.addEventListener('change',changedMotion);
  window.addEventListener('infinite:systemclosed',()=>close({immediate:true,focus:false}));
  window.addEventListener('pagehide',()=>{scene.stop();});
  window.InfiniteCovenant=Object.freeze({open,close,preload,getState:()=>({phase,selected,branch,detail:detailId,detailPhase,save:readState(),scene:scene.getState()})});
})();
