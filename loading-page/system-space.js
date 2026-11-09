/* The central illustration is a preview. A future Cubism renderer can own the
   mount without changing the surrounding controls. */
(() => {
  'use strict';
  const world=document.getElementById('world'); if(!world)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const root=document.createElement('section');
  root.id='system-space';root.className='system-space';root.hidden=true;root.tabIndex=-1;
  root.setAttribute('aria-labelledby','system-space-title');root.dataset.phase='hidden';root.dataset.characterRenderer='illustration';
  const icons={
    world:'<path d="M6 27V9l10-5 10 5v18M11 27V12h10v15M3 27h26M16 12v15"/><path d="m11 17 5-2 5 2"/>',
    records:'<path d="M9 5h17v21H9M9 5a3 3 0 0 0-6 0v19a3 3 0 0 0 6 0V5ZM9 24h17M14 10h7M14 15h7M14 20h4"/>',
    inventory:'<path d="m11 7-3-4h16l-3 4M10 9h12M11 9C10 14 5 17 5 23c0 7 22 7 22 0 0-6-5-9-6-14M11 7h10M16 17v7M13 21l3-4 3 4"/>',
    covenant:'<path d="M5 10c0-5 8-7 11 0 3-7 11-5 11 0 0 6-11 13-11 13S5 16 5 10ZM16 23v6M11 27l5-4 5 4"/>',
    settings:'<path d="m13 3 6 0 1 4 4 2 4-1 3 5-3 3v4l3 3-3 5-4-1-4 2-1 3h-6l-1-3-4-2-4 1-3-5 3-3v-4l-3-3 3-5 4 1 4-2 1-4Z" transform="translate(1 -1) scale(.9)"/><circle cx="15.5" cy="15" r="5"/>',
    back:'<path d="M17 7 7 16l10 9M7 16h20"/>',
  };
  const entries=[['world','世界入口'],['records','轮回记录'],['inventory','行囊'],['covenant','主神契约'],['settings','系统设置'],['back','返回主神']];
  const svg=id=>`<svg viewBox="0 0 32 32" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">${icons[id]}</svg>`;
  root.innerHTML=`
    <div class="system-environment" aria-hidden="true"><img src="assets/system-space/sanctuary.webp" alt="" draggable="false"><div class="system-atmosphere"></div></div>
    <header class="system-identity"><p>一缕红线 · 一处归途</p><h1 id="system-space-title">系统空间</h1><img src="assets/menu-ui/sakura-branch.webp" alt="" draggable="false"></header>
    <div class="system-character-area"><div class="system-character-shadow" aria-hidden="true"></div><div class="system-character-parallax"><div class="system-character-mount" id="system-character-mount"><img class="system-character-art" src="assets/system-space/hongzhuang.webp" alt="正面直视的红妆主神" draggable="false"></div></div><button class="system-character-touch" type="button" aria-label="与红妆交谈" title="与红妆交谈"></button><p class="system-whisper" role="status" aria-live="polite" hidden></p></div>
    <nav class="system-floating-navigation" aria-label="系统空间功能">${entries.map(([id,label],index)=>`<div class="system-float-slot system-float-${id} system-float-${index<3?'left':'right'}" style="--float-index:${index%3};--float-delay:${-(index*1.17).toFixed(2)}s;--entry-delay:${index%3*75+(index>2?60:0)}ms"><div class="system-float-bob"><button id="system-control-${id}" type="button" class="system-orb" data-system-control="${id}" ${index<4?'aria-haspopup="dialog" aria-expanded="false" aria-controls="system-details"':id==='settings'?'aria-haspopup="dialog"':''}><span class="system-orb-medallion"><img src="assets/system-space/floating-medallion.webp" alt="" draggable="false">${svg(id)}</span><span class="system-orb-label">${label}</span></button></div></div>`).join('')}</nav>
    <div class="system-composer-dock"><form class="system-composer" aria-label="与主神对话"><label class="system-sr-only" for="system-message">向主神说些什么</label><textarea id="system-message" name="message" rows="1" maxlength="1000" placeholder="向红妆说些什么…" autocomplete="off" spellcheck="false" aria-describedby="system-message-status"></textarea><button class="system-send" type="submit" aria-label="发送消息" title="发送"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 17 21-12-8 23-4-9-9-2ZM14 19 26 5"/></svg></button></form><p id="system-message-status" class="system-message-status" role="status" aria-live="polite"></p></div>
    <dialog id="system-details" class="system-details" aria-labelledby="system-detail-title"><button type="button" class="system-detail-close" aria-label="收起详情" title="收起">×</button><div class="system-panel-contents"></div></dialog>`;
  world.append(root);
  const buttons=[...root.querySelectorAll('[data-system-control]')],details=root.querySelector('#system-details'),content=details.querySelector('.system-panel-contents'),closeDetailsButton=details.querySelector('.system-detail-close');
  const mount=root.querySelector('.system-character-mount'),whisper=root.querySelector('.system-whisper'),characterTouch=root.querySelector('.system-character-touch');
  const form=root.querySelector('.system-composer'),input=root.querySelector('#system-message'),send=root.querySelector('.system-send'),messageStatus=root.querySelector('#system-message-status');
  let phase='hidden',selected=null,deity={id:'hongzhuang',name:'红妆'},serial=0,timer=0,whisperTimer=0,animation=null,preloadJob=null,finishPending=null,settleTransition=null;
  let x=0,y=0,goalX=0,goalY=0,frame=0,previous=0,spoken=0,renderer=null,failedAssets=[],detailsAnimation=null,opener=null,composing=false,sending=false,messageSerial=0;
  const animated=()=>!media.matches&&window.InfiniteSettings?.getState?.().motion!==false;
  const blocked=()=>document.hidden||Boolean(document.querySelector('dialog[open]'));
  const emit=(name,detail={})=>window.dispatchEvent(new CustomEvent(name,{detail}));
  function cue(name){if(!document.hidden)emit('infinite:soundcue',{name,group:'system-ui'});}
  function say(text){clearTimeout(whisperTimer);whisper.textContent=text;whisper.hidden=false;whisperTimer=setTimeout(()=>{whisper.hidden=true;},4800);}
  function syncComposer(){const busy=phase!=='ready'||sending;input.disabled=busy;send.disabled=busy||!input.value.trim();form.setAttribute('aria-busy',String(sending));}
  function resizeInput(){input.style.height='auto';input.style.height=`${Math.min(68,Math.max(24,input.scrollHeight))}px`;}
  function lock(value){root.setAttribute('aria-busy',String(value));for(const button of root.querySelectorAll('button'))button.disabled=value;syncComposer();}
  function setPhase(value){phase=value;root.dataset.phase=value;if(value==='opening')world.dataset.state='system-arriving';else if(value==='ready')world.dataset.state='system';syncMotion();syncComposer();}
  function panelMarkup(key){
    if(key==='records')return '<p class="system-panel-kicker">往事成卷</p><h2 id="system-detail-title">轮回记录</h2><span class="system-panel-rule" aria-hidden="true"></span><div class="system-empty-mark" aria-hidden="true">卷</div><h3>此间尚无旧事</h3><p class="system-panel-copy">第一场轮回结束后，你的抉择与归途将在这里留存。</p><p class="system-panel-footnote">暂无轮回记录</p>';
    if(key==='inventory')return '<p class="system-panel-kicker">随身之物</p><h2 id="system-detail-title">行囊</h2><span class="system-panel-rule" aria-hidden="true"></span><div class="system-inventory-slots" aria-hidden="true"><i></i><i></i><i></i></div><h3>轻装启程</h3><p class="system-panel-copy">从诸界带回的物品与纪念，将安放在这里。</p><p class="system-panel-footnote">行囊中尚无物品</p>';
    if(key==='covenant')return '<p class="system-panel-kicker">一线相牵</p><h2 id="system-detail-title">主神契约</h2><span class="system-panel-rule" aria-hidden="true"></span><p class="system-covenant-name" data-system-deity-name></p><p class="system-covenant-state"><span aria-hidden="true">◇</span> 契约已缔结</p><p class="system-panel-copy">无论行至哪一重世界，这一缕红线都会指向你的归处。</p><button type="button" class="system-action" data-system-talk>与主神交谈</button>';
    return '<p class="system-panel-kicker">初临之地</p><h2 id="system-detail-title">下一场轮回</h2><span class="system-panel-rule" aria-hidden="true"></span><p class="system-world-status"><span aria-hidden="true">◇</span> 世界坐标 · 待定位</p><h3>万界，正待开启</h3><p class="system-panel-copy">在主神的注视下，整理行装，准备写下属于你的第一段故事。</p><div class="system-world-progress"><span>主神契约</span><strong>已缔结</strong></div><div class="system-world-progress"><span>轮回档案</span><strong>尚未建立</strong></div><button type="button" class="system-action" data-system-journey>开启轮回 <span aria-hidden="true">→</span></button><p class="system-action-note" role="status">下一段旅程，尚待开启</p>';
  }
  function openDetails(key,trigger){
    if(phase!=='ready'||!['world','records','inventory','covenant'].includes(key))return;
    detailsAnimation?.cancel();detailsAnimation=null;selected=key;opener=trigger;details.dataset.side=key==='covenant'?'right':'left';content.innerHTML=panelMarkup(key);
    for(const label of content.querySelectorAll('[data-system-deity-name]'))label.textContent=deity.name;
    trigger.setAttribute('aria-expanded','true');if(!details.open)details.showModal();syncMotion();closeDetailsButton.focus({preventScroll:true});cue('ui-tab');
    if(animated()&&!document.hidden)detailsAnimation=details.animate([{opacity:0,translate:'0 10px'},{opacity:1,translate:'0 0'}],{duration:260,easing:'cubic-bezier(.2,.7,.25,1)'});
  }
  function closeDetails({immediate=false,focus=true}={}){
    if(!details.open)return Promise.resolve();detailsAnimation?.cancel();detailsAnimation=null;
    const finish=()=>{details.close();selected=null;for(const button of buttons)if(button.hasAttribute('aria-expanded'))button.setAttribute('aria-expanded','false');syncMotion();if(focus&&phase==='ready')opener?.focus({preventScroll:true});};
    if(immediate||!animated()||document.hidden){finish();return Promise.resolve();}
    detailsAnimation=details.animate([{opacity:1,translate:'0 0'},{opacity:0,translate:'0 7px'}],{duration:160,easing:'ease-in',fill:'forwards'});
    return detailsAnimation.finished.then(finish,()=>{});
  }
  function resetAim(){cancelAnimationFrame(frame);frame=previous=x=y=goalX=goalY=0;root.style.setProperty('--system-aim-x','0px');root.style.setProperty('--system-aim-y','0px');renderer?.setLook?.(0,0);}
  function syncMotion(){const paused=phase!=='ready'||blocked()||!animated();root.classList.toggle('system-motion-off',!animated());root.classList.toggle('system-paused',paused);renderer?.setPaused?.(paused);if(paused)resetAim();}
  function draw(now){frame=0;if(phase!=='ready'||blocked()||!animated()){resetAim();return;}const dt=previous?Math.min(.05,(now-previous)/1000):1/60;previous=now;const t=1-Math.exp(-11*dt);x+=(goalX-x)*t;y+=(goalY-y)*t;if(Math.abs(goalX-x)<.025)x=goalX;if(Math.abs(goalY-y)<.025)y=goalY;root.style.setProperty('--system-aim-x',`${x.toFixed(3)}px`);root.style.setProperty('--system-aim-y',`${y.toFixed(3)}px`);renderer?.setLook?.(x/6,y/4);if(x!==goalX||y!==goalY)frame=requestAnimationFrame(draw);else previous=0;}
  function aim(a=0,b=0){goalX=a;goalY=b;if(!frame&&phase==='ready'&&animated()&&!blocked())frame=requestAnimationFrame(draw);}
  function clearTransition(){clearTimeout(timer);timer=0;animation?.cancel();animation=null;finishPending?.(false);finishPending=null;settleTransition=null;}
  function preload(){
    if(!preloadJob){const urls=['assets/system-space/sanctuary.webp','assets/system-space/hongzhuang.webp','assets/system-space/panel.webp','assets/system-space/floating-medallion.webp','assets/system-space/composer.webp','assets/system-space/composer-rounded.webp'];
      const job=Promise.all(urls.map(async url=>{const image=new Image();image.src=url;try{await image.decode();return true;}catch{return false;}})).then(results=>{failedAssets=urls.filter((_,i)=>!results[i]);const state={ready:results[0]&&results[1],complete:results.every(Boolean),failed:[...failedAssets]};if(!state.complete&&preloadJob===job)preloadJob=null;return state;});preloadJob=job;
    }return preloadJob;
  }
  async function open(value={}){
    if(phase!=='hidden')return false;const token=++serial,assets=await preload();if(token!==serial||!assets.ready)return false;
    deity={id:typeof value.id==='string'?value.id:'hongzhuang',name:typeof value.name==='string'?value.name:'红妆'};spoken=0;selected=null;sending=false;composing=false;++messageSerial;input.placeholder=`向${deity.name}说些什么…`;characterTouch.setAttribute('aria-label',`与${deity.name}交谈`);input.value='';messageStatus.textContent='';whisper.hidden=true;clearTimeout(whisperTimer);resetAim();root.hidden=false;root.inert=false;setPhase('opening');lock(true);resizeInput();
    // The decoded backdrop is opaque immediately; only the character and UI enter.
    emit('infinite:systemvisible',{id:deity.id,name:deity.name});const duration=animated()&&!document.hidden?820:0;
    return new Promise(resolve=>{finishPending=resolve;const complete=()=>{if(token!==serial)return;clearTimeout(timer);timer=0;finishPending=null;settleTransition=null;setPhase('ready');lock(false);root.focus({preventScroll:true});emit('infinite:systemready',{id:deity.id,name:deity.name});resolve(true);};settleTransition=complete;if(!duration)complete();else timer=setTimeout(complete,duration);});
  }
  function close({returnToDeity=true,immediate=false}={}){
    if(phase==='hidden'){++serial;return Promise.resolve(false);}if(['returning','closing'].includes(phase)&&!immediate)return Promise.resolve(false);
    const token=++serial;clearTransition();clearTimeout(whisperTimer);whisper.hidden=true;++messageSerial;sending=false;composing=false;closeDetails({immediate:true,focus:false});resetAim();lock(true);setPhase(returnToDeity?'returning':'closing');
    return new Promise(resolve=>{finishPending=resolve;
      const restore=()=>{if(token!==serial)return;finishPending=null;settleTransition=null;setPhase('ready');lock(false);say('归途尚未准备好，请稍后再试。');root.focus({preventScroll:true});resolve(false);};
      const leave=()=>{if(token!==serial)return;setPhase('closing');const duration=!immediate&&animated()&&!document.hidden?520:0;
        const complete=()=>{if(token!==serial)return;clearTimeout(timer);timer=0;root.hidden=true;root.inert=true;animation?.cancel();animation=null;finishPending=null;settleTransition=null;setPhase('hidden');lock(false);emit('infinite:soundstop',{group:'system-ui',fade:.1});emit('infinite:systemclosed',{id:deity.id,name:deity.name,returnToDeity});resolve(true);};settleTransition=complete;
        if(!duration){complete();return;}animation=root.animate([{opacity:1},{opacity:0}],{duration,easing:'cubic-bezier(.4,0,.6,1)',fill:'both'});timer=setTimeout(complete,duration+20);
      };
      if(!returnToDeity){leave();return;}
      const waiting=[],request=new CustomEvent('infinite:systemreturn',{cancelable:true,detail:{id:deity.id,name:deity.name,deity:{...deity},waitUntil(promise){waiting.push(Promise.resolve(promise));}}});
      const unhandled=window.dispatchEvent(request);if(unhandled&&!waiting.length){restore();return;}Promise.all(waiting).then(results=>{if(results.some(result=>result===false))restore();else leave();},restore);
    });
  }
  function talk(){if(phase!=='ready')return;const lines=['不急，先在这里歇一歇。','红线在，归途便在。','下一场故事，我会陪你一同见证。'];cue('ui-tap');say(lines[spoken++%lines.length]);}
  async function sendMessage(event){
    event.preventDefault();const text=input.value.trim();if(!text||sending||composing||phase!=='ready')return;cue('ui-tap');const token=++messageSerial,waiting=[];
    const request=new CustomEvent('infinite:systemmessage',{cancelable:true,detail:{text,deity:{...deity},waitUntil(promise){waiting.push(Promise.resolve(promise));},respond(value){if(token===messageSerial&&phase==='ready'&&typeof value==='string')say(value);}}});
    if(window.dispatchEvent(request)){messageStatus.textContent='对话尚未连接';return;}sending=true;syncComposer();messageStatus.textContent=waiting.length?'正在发送…':'已发送';
    try{const results=await Promise.all(waiting);if(token!==messageSerial||phase!=='ready')return;if(results.some(result=>result===false))throw new Error('Message not accepted');input.value='';resizeInput();messageStatus.textContent='已发送';}
    catch{if(token===messageSerial&&phase==='ready')messageStatus.textContent='消息未能发送，请稍后重试';}
    finally{if(token===messageSerial){sending=false;syncComposer();input.focus({preventScroll:true});}}
  }
  root.querySelector('.system-floating-navigation').addEventListener('click',event=>{const button=event.target.closest('[data-system-control]');if(!button||phase!=='ready'||blocked())return;const key=button.dataset.systemControl;if(key==='back'){cue('ui-tap');close();}else if(key==='settings'){cue('ui-tap');if(window.InfiniteSettings?.open)window.InfiniteSettings.open(button);else say('设置页面尚未准备好。');}else openDetails(key,button);});
  root.querySelector('.system-floating-navigation').addEventListener('keydown',event=>{if(phase!=='ready'||event.altKey||event.metaKey||event.ctrlKey)return;const index=buttons.indexOf(event.target);if(index<0||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?5:['ArrowLeft','ArrowRight'].includes(event.key)?(index+3)%6:(index+(event.key==='ArrowUp'?-1:1)+6)%6;buttons[next].focus({preventScroll:true});});
  closeDetailsButton.addEventListener('click',()=>{cue('ui-tap');closeDetails();});details.addEventListener('cancel',event=>{event.preventDefault();closeDetails();});
  details.addEventListener('click',event=>{if(event.target!==details)return;const b=details.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom)closeDetails();});
  content.addEventListener('click',async event=>{if(phase!=='ready')return;if(event.target.closest('[data-system-talk]')){await closeDetails();talk();}if(event.target.closest('[data-system-journey]')){cue('ui-tap');const request=new CustomEvent('infinite:journeyrequest',{cancelable:true,detail:{deity:{...deity}}});if(window.dispatchEvent(request))content.querySelector('.system-action-note').textContent='轮回尚未开启，先在此处稍作休整。';}});
  characterTouch.addEventListener('click',talk);form.addEventListener('submit',sendMessage);input.addEventListener('input',()=>{syncComposer();resizeInput();messageStatus.textContent='';});input.addEventListener('compositionstart',()=>{composing=true;});input.addEventListener('compositionend',()=>{composing=false;syncComposer();});input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&!composing&&event.keyCode!==229){event.preventDefault();form.requestSubmit();}});
  root.addEventListener('pointermove',event=>{if(!['mouse','pen'].includes(event.pointerType)||phase!=='ready'||blocked()||!animated())return;const box=root.getBoundingClientRect();aim(Math.max(-1,Math.min(1,(event.clientX-box.left)/box.width*2-1))*6,Math.max(-1,Math.min(1,(event.clientY-box.top)/box.height*2-1))*4);},{passive:true});root.addEventListener('pointerleave',()=>aim());root.addEventListener('pointercancel',()=>aim());
  for(const name of ['dragstart','contextmenu'])root.addEventListener(name,event=>{if(!event.target.closest('textarea,input'))event.preventDefault();});
  document.addEventListener('keydown',event=>{if(phase==='hidden'||document.querySelector('dialog[open]')||event.isComposing||event.key!=='Escape')return;event.preventDefault();event.stopImmediatePropagation();if(phase==='ready')close();},true);
  const observer=new MutationObserver(syncMotion);for(const dialog of document.querySelectorAll('dialog'))observer.observe(dialog,{attributes:true,attributeFilter:['open']});
  function changedMotion(){syncMotion();if(document.hidden||!animated())settleTransition?.();}
  for(const name of ['infinite:settings','infinite:settingssaved'])window.addEventListener(name,changedMotion);media.addEventListener('change',changedMotion);document.addEventListener('visibilitychange',changedMotion);window.addEventListener('blur',resetAim);window.addEventListener('resize',()=>{resetAim();if(!root.hidden)resizeInput();});window.addEventListener('pagehide',()=>close({returnToDeity:false,immediate:true}));
  window.InfiniteSystemSpace=Object.freeze({open,close,preload,prepare:preload,getCharacterMount:()=>mount,setCharacterRenderer(value){renderer?.dispose?.();renderer=value||null;root.dataset.characterRenderer=renderer?'external':'illustration';syncMotion();},getState:()=>({phase,visible:!root.hidden,selected,deity:{...deity},moving:Boolean(frame),paused:root.classList.contains('system-paused'),characterRenderer:root.dataset.characterRenderer,detailsOpen:details.open,sending,failedAssets:[...failedAssets]})});
})();
