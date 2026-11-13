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
      <button type="button" class="covenant-back"><span aria-hidden="true">←</span> 返回空间</button>
      <div class="covenant-heading"><p>红妆</p><h1 id="covenant-heading">主神契约</h1></div>
      <div class="covenant-points" aria-label="可用契约点" title="通关 +3 · 完成任务 +1"><img src="assets/world-detail/view-flower.png" alt="" draggable="false"><span>契约点 <strong>0</strong></span></div>
    </header>
    <div class="covenant-body">
      <section class="covenant-constellation" aria-label="契约天赋">
        <canvas class="covenant-canvas" aria-hidden="true"></canvas>
        <div class="covenant-nodes">${catalog.map(node=>`<button type="button" class="covenant-node" data-covenant-node="${node.id}" hidden><span class="covenant-node-icon covenant-icon" data-icon="${node.branch||'root'}" aria-hidden="true"></span><span class="covenant-node-label"><span>${node.name}</span><small></small></span></button>`).join('')}</div>
        <nav class="covenant-branches" aria-label="契约分支"><button type="button" data-covenant-branch="all" class="covenant-overview" aria-pressed="true">总览</button>${branches.map(([id,name])=>`<button type="button" data-covenant-branch="${id}" aria-pressed="false"><span class="covenant-icon" data-icon="${id}" aria-hidden="true"></span><span>${name}</span></button>`).join('')}</nav>
      </section>
      <aside class="covenant-ability" aria-labelledby="covenant-ability-name">
        <img class="covenant-ability-art" src="assets/covenant/ability-petal.png" alt="" draggable="false">
        <div class="covenant-ability-content">
          <span class="covenant-ability-icon covenant-icon" data-icon="root" aria-hidden="true"></span>
          <p class="covenant-ability-type"></p><h2 id="covenant-ability-name"></h2>
          <p class="covenant-ability-copy"></p>
          <p class="covenant-ability-condition"></p>
          <button class="covenant-unlock" type="button"></button>
          <p class="covenant-feedback" role="status" aria-live="polite"></p>
        </div>
      </aside>
    </div>`;
  document.body.append(root);
  const canvas=root.querySelector('canvas'),ability=root.querySelector('.covenant-ability'),body=root.querySelector('.covenant-body');
  const fields={icon:root.querySelector('.covenant-ability-icon'),type:root.querySelector('.covenant-ability-type'),name:root.querySelector('#covenant-ability-name'),copy:root.querySelector('.covenant-ability-copy'),condition:root.querySelector('.covenant-ability-condition'),unlock:root.querySelector('.covenant-unlock'),feedback:root.querySelector('.covenant-feedback')};
  const nodeButtons=new Map([...root.querySelectorAll('[data-covenant-node]')].map(button=>[button.dataset.covenantNode,button]));
  const branchButtons=[...root.querySelectorAll('[data-covenant-branch]')];
  function readState(){try{return progress.getState();}catch(failure){return {saveId:null,earned:0,spent:0,balance:0,unlocked:['root'],tasks:[],error:failure.userMessage||'未能读取契约存档，请重试。'};}}
  let phase='hidden',selected='root',branch=null,state=readState(),opener=null,serial=0,preloadJob=null,closeJob=null,animation=null,panelAnimation=null,lastCue=0,lastHover=null,focusAfterOpen=false;
  const motion=()=>!media.matches&&window.InfiniteSettings?.getState?.().motion!==false;
  function cue(name){if(!document.hidden)window.dispatchEvent(new CustomEvent('infinite:soundcue',{detail:{name,group:'covenant-ui'}}));}
  function status(id){const node=byId.get(id);return state.unlocked.includes(id)?'unlocked':state.unlocked.includes(node.parent)?'available':'locked';}
  function hover(id){const now=performance.now();if(!id||id===lastHover||now-lastCue<180||phase!=='ready')return;lastHover=id;lastCue=now;cue('system-ui-focus');}
  function layout(nodes){
    for(const node of nodes){
      const button=nodeButtons.get(node.id);if(!button)continue;
      button.hidden=!node.visible;
      if(!node.visible)continue;
      const diameter=Math.max(44,node.r*2.08);
      button.style.left=`${node.x.toFixed(2)}px`;button.style.top=`${node.y.toFixed(2)}px`;button.style.width=`${diameter.toFixed(2)}px`;button.style.height=`${diameter.toFixed(2)}px`;button.style.opacity=node.opacity.toFixed(3);
    }
  }
  const scene=window.InfiniteCovenantScene.create(canvas,{onNodeClick:choose,onNodeHover:hover,onLayout:layout});
  function refresh(){
    state=readState();if(state.error)fields.feedback.textContent=state.error;root.querySelector('.covenant-points strong').textContent=state.balance;
    root.querySelector('.covenant-points').setAttribute('aria-label',`可用契约点 ${state.balance}`);
    for(const [id,button] of nodeButtons){
      const node=byId.get(id),kind=status(id),label=id==='root'?'契约之始':kind==='unlocked'?'已解锁':kind==='available'?`${node.cost} 契约点`:'未解锁';
      button.dataset.status=kind;button.setAttribute('aria-pressed',String(id===selected));button.setAttribute('aria-label',`${node.name}，${label}`);button.querySelector('small').textContent=label;
    }
    for(const button of branchButtons)button.setAttribute('aria-pressed',String(button.dataset.covenantBranch===(branch||'all')));
    const node=byId.get(selected),kind=status(selected),owned=kind==='unlocked',prerequisite=byId.get(node.parent);
    fields.icon.dataset.icon=node.branch||'root';fields.type.textContent=selected==='root'?'本命契印':`${branches.find(([id])=>id===node.branch)?.[1]||''} · ${node.type}`;
    fields.name.textContent=node.name;fields.copy.textContent=node.description;
    fields.condition.textContent=selected==='root'?`${Math.max(0,state.unlocked.length-1)} / ${catalog.length-1} 已解锁`:kind==='locked'?`前置 · ${prerequisite.name}`:owned?'契印已亮起':`消耗 ${node.cost} 契约点`;
    fields.unlock.hidden=selected==='root'||owned;fields.unlock.disabled=owned||kind==='locked'||state.balance<node.cost||!state.saveId;
    fields.unlock.textContent=owned?'已解锁':kind==='locked'?'前置未解锁':state.balance<node.cost?'点数不足':'解 锁';
    ability.dataset.status=kind;scene.setState({selected,branch,unlocked:state.unlocked,motion:motion()});
  }
  function choose(id){
    if(phase!=='ready'||!byId.has(id))return;
    if(selected===id&&branch===byId.get(id).branch)return;
    selected=id;branch=byId.get(id).branch;fields.feedback.textContent='';cue('ui-select');refresh();
    panelAnimation?.cancel();
    if(motion())panelAnimation=fields.name.parentElement.animate([{opacity:.25,transform:'translateY(7px)'},{opacity:1,transform:'translateY(0)'}],{duration:360,easing:'cubic-bezier(.2,.7,.25,1)'});
  }
  function preload(){
    if(!preloadJob){const urls=['assets/covenant/ability-petal.png','assets/covenant/branch-icons.png','assets/covenant/thread.png','assets/covenant/unlock-petal.png'];
      preloadJob=Promise.all(urls.map(src=>{const image=new Image();image.src=src;return image.decode().then(()=>true,()=>false);})).then(values=>{if(values.some(value=>!value)){preloadJob=null;return false;}return true;});
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
    selected='root';branch=null;fields.feedback.textContent='';lastHover=null;lastCue=0;root.dataset.phase='opening';root.classList.toggle('motion-off',!motion());
    window.InfiniteSystemSpace.setTransitioning(true);opener?.setAttribute('aria-expanded','true');
    root.showModal();phase='opening';refresh();scene.resize();scene.start();cue('ui-select-open');
    const duration=motion()&&!document.hidden?680:0;
    if(duration){animation=body.animate([{opacity:0},{opacity:1}],{duration,easing:'cubic-bezier(.16,.7,.2,1)'});await animation.finished.catch(()=>{});}
    if(token!==serial)return false;
    phase='ready';root.dataset.phase='ready';animation=null;scene.resize();focusAfterOpen=true;root.querySelector('.covenant-back').focus({preventScroll:true});focusAfterOpen=false;
    return true;
  }
  function close({immediate=false,focus=true}={}){
    if(phase==='hidden')return Promise.resolve(false);
    if(phase==='closing'&&!immediate)return closeJob||Promise.resolve(false);
    ++serial;animation?.cancel();panelAnimation?.cancel();animation=panelAnimation=null;
    if(phase==='preparing'){phase='hidden';opener?.removeAttribute('aria-busy');return Promise.resolve(true);}
    phase='closing';root.dataset.phase='closing';cue('ui-back');
    const finish=()=>{scene.stop();root.close();phase='hidden';root.dataset.phase='hidden';animation?.cancel();animation=null;opener?.setAttribute('aria-expanded','false');opener?.removeAttribute('aria-busy');window.InfiniteSystemSpace?.setTransitioning(false);if(focus&&window.InfiniteSystemSpace?.getState().phase==='ready')opener?.focus({preventScroll:true});window.dispatchEvent(new CustomEvent('infinite:soundstop',{detail:{group:'covenant-ui',fade:.1}}));};
    if(immediate||!motion()||document.hidden){finish();return Promise.resolve(true);}
    const token=serial;
    animation=body.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.965)'}],{duration:300,easing:'ease-in',fill:'forwards'});
    closeJob=animation.finished.then(()=>{if(token===serial)finish();return true;},()=>false);return closeJob;
  }
  root.querySelector('.covenant-back').addEventListener('click',()=>close());
  root.addEventListener('cancel',event=>{event.preventDefault();close();});
  root.addEventListener('click',event=>{const node=event.target.closest('[data-covenant-node]'),branchButton=event.target.closest('[data-covenant-branch]');if(node)choose(node.dataset.covenantNode);else if(branchButton)choose(branchButton.dataset.covenantBranch==='all'?'root':branchButton.dataset.covenantBranch);});
  root.addEventListener('pointerover',event=>{const button=event.target.closest('button');if(button&&!button.disabled)hover(button.dataset.covenantNode||button.dataset.covenantBranch||button.className);});
  root.addEventListener('focusin',event=>{if(!focusAfterOpen&&event.target.matches('button:focus-visible'))hover(event.target.dataset.covenantNode||event.target.className);});
  root.addEventListener('keydown',event=>{
    if(phase!=='ready'||event.altKey||event.metaKey||event.ctrlKey)return;
    const button=event.target.closest('[data-covenant-node]');if(!button||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
    const visible=[...nodeButtons.values()].filter(item=>!item.hidden),index=visible.indexOf(button);event.preventDefault();
    const next=event.key==='Home'?0:event.key==='End'?visible.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+visible.length)%visible.length;visible[next]?.focus({preventScroll:true});
  });
  fields.unlock.addEventListener('click',()=>{
    if(phase!=='ready'||fields.unlock.disabled)return;
    try{progress.unlock(selected);fields.feedback.textContent='';cue('ui-select');const target=nodeButtons.get(selected);focusAfterOpen=true;target.focus({preventScroll:true});focusAfterOpen=false;target.getAnimations().forEach(value=>value.cancel());if(motion())target.animate([{filter:'brightness(1)'},{filter:'brightness(1.9)',offset:.24},{filter:'brightness(1)'}],{duration:850,easing:'ease-out'});}
    catch(failure){fields.feedback.textContent=failure.userMessage||'未能保存契约，请重试。';refresh();}
  });
  root.addEventListener('contextmenu',event=>event.preventDefault());root.addEventListener('dragstart',event=>event.preventDefault());
  window.addEventListener('infinite:covenantchange',()=>{if(root.open)refresh();});
  function changedMotion(){root.classList.toggle('motion-off',!motion());if(!motion()){animation?.finish();panelAnimation?.finish();}if(root.open)refresh();}
  for(const name of ['infinite:settings','infinite:settingssaved'])window.addEventListener(name,changedMotion);
  media.addEventListener('change',changedMotion);
  window.addEventListener('infinite:systemclosed',()=>close({immediate:true,focus:false}));
  window.addEventListener('pagehide',()=>{scene.stop();});
  window.InfiniteCovenant=Object.freeze({open,close,preload,getState:()=>({phase,selected,branch,save:readState(),scene:scene.getState()})});
})();
