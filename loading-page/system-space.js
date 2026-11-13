/* System hub controls. The portrait stays visible until the Cubism adapter has
   painted its first complete frame, and remains a load-failure fallback. */
(() => {
  'use strict';
  const world=document.getElementById('world'); if(!world)return;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const root=document.createElement('section');
  root.id='system-space';root.className='system-space';root.hidden=true;root.tabIndex=-1;
  root.setAttribute('aria-labelledby','system-space-title');root.dataset.phase='hidden';root.dataset.characterRenderer='illustration';
  const entries=[['world','世界入口'],['records','轮回记录'],['inventory','个人信息'],['covenant','主神契约'],['settings','系统设置'],['back','返回标题']];
  const symbol=id=>`<span class="system-symbol system-symbol-${id==='inventory'?'profile':id}" aria-hidden="true"></span>`;
  const control=([id,label],index)=>`<div class="system-float-slot system-float-${id} ${index<4?'system-primary-slot':'system-utility-slot'}" style="--float-index:${index};--entry-delay:${index<4?190+index*65:90}ms"><button id="system-control-${id}" type="button" class="system-orb ${index<4?'system-primary-control':'system-utility-control'}" data-system-control="${id}" ${id==='world'?'aria-expanded="false" aria-controls="world-map"':index<4?'aria-haspopup="dialog" aria-expanded="false" aria-controls="system-details"':id==='settings'?'aria-haspopup="dialog"':''}><span class="system-nav-core">${symbol(id)}<span class="system-orb-label">${label}</span></span><span class="system-nav-flare" aria-hidden="true"></span><span class="system-nav-thread" aria-hidden="true"><svg viewBox="0 0 240 22" preserveAspectRatio="none"><path pathLength="1" d="M2 15C57-9 137 37 222 10"/><path class="system-thread-glint" pathLength="1" d="M2 15C57-9 137 37 222 10"/></svg>${symbol('blossom')}</span></button></div>`;
  root.innerHTML=`
    <div class="system-environment" aria-hidden="true"><img src="assets/system-space/moon-courtyard.png" alt="" draggable="false"><div class="system-atmosphere"></div></div>
    <header class="system-identity"><h1 id="system-space-title" class="system-sr-only">系统空间</h1><img src="assets/system-space/hub-title.png" alt="" draggable="false"></header>
    <div class="system-character-area"><div class="system-character-shadow" aria-hidden="true"></div><div class="system-character-parallax"><div class="system-character-mount" id="system-character-mount"><img class="system-character-art" src="assets/system-space/hongzhuang.webp" alt="正面直视的红妆主神" draggable="false"></div></div><button class="system-character-touch" type="button" aria-label="与红妆交谈" title="与红妆交谈"></button><div class="system-whisper" hidden><span class="system-whisper-text" role="status" aria-live="polite"></span><button class="system-whisper-close" type="button" aria-label="收起回复" hidden>×</button></div></div>
    <nav class="system-floating-navigation" aria-label="系统空间功能"><div class="system-nav-dock">${entries.slice(0,4).map(control).join('')}</div>${entries.slice(4).map((entry,index)=>control(entry,index+4)).join('')}</nav>
    <div class="system-composer-dock"><form class="system-composer" aria-label="与主神对话"><label class="system-sr-only" for="system-message">向主神说些什么</label><textarea id="system-message" name="message" rows="1" maxlength="1000" placeholder="向红妆说些什么…" autocomplete="off" spellcheck="false" aria-describedby="system-message-status"></textarea><button class="system-send" type="submit" aria-label="发送消息" title="发送">${symbol('send')}</button></form><p id="system-message-status" class="system-message-status" role="status" aria-live="polite"></p></div>
    <dialog id="system-details" class="system-details" aria-labelledby="system-detail-title"><button type="button" class="system-detail-close" aria-label="收起详情" title="收起">×</button><div class="system-panel-contents"></div></dialog>`;
  world.append(root);
  root.querySelector('#system-control-covenant').setAttribute('aria-controls','covenant-space');
  root.querySelector('#system-control-inventory').setAttribute('aria-controls','player-profile');
  const buttons=[...root.querySelectorAll('[data-system-control]')],details=root.querySelector('#system-details'),content=details.querySelector('.system-panel-contents'),closeDetailsButton=details.querySelector('.system-detail-close');
  const mount=root.querySelector('.system-character-mount'),whisper=root.querySelector('.system-whisper'),characterTouch=root.querySelector('.system-character-touch');
  const form=root.querySelector('.system-composer'),input=root.querySelector('#system-message'),send=root.querySelector('.system-send'),messageStatus=root.querySelector('#system-message-status');
  const chatWindow=window.InfiniteChatWindow.create(root,{onClose(){cue('system-ui-back');window.InfiniteTTS?.stop?.();input.focus({preventScroll:true});}});
  const thinkingIndicator=document.createElement('div');thinkingIndicator.className='system-thinking-indicator';thinkingIndicator.setAttribute('role','status');thinkingIndicator.setAttribute('aria-label','红妆正在思考');thinkingIndicator.setAttribute('aria-hidden','true');
  thinkingIndicator.innerHTML=`${symbol('blossom')}${Array.from({length:5},(_,i)=>`<i style="--i:${i}" aria-hidden="true"></i>`).join('')}`;
  root.querySelector('.system-character-area').append(thinkingIndicator);
  function setThinking(value){root.classList.toggle('is-thinking',value);thinkingIndicator.setAttribute('aria-hidden',String(!value));window.InfiniteSystemLive2D?.setThinking?.(value);}
  let phase='hidden',selected='world',deity={id:'hongzhuang',name:'红妆'},serial=0,timer=0,whisperTimer=0,animation=null,preloadJob=null,finishPending=null,settleTransition=null;
  let x=0,y=0,goalX=0,goalY=0,frame=0,previous=0,spoken=0,renderer=null,failedAssets=[],detailsAnimation=null,opener=null,composing=false,sending=false,messageSerial=0;
  let lastFocusCue=0,lastFocusControl=null,transitionPaused=false,worldOpening=false,worldOpenSerial=0;
  const animated=()=>!media.matches&&window.InfiniteSettings?.getState?.().motion!==false;
  const blocked=()=>document.hidden||Boolean(document.querySelector('dialog[open]'));
  const emit=(name,detail={})=>window.dispatchEvent(new CustomEvent(name,{detail}));
  function cue(name){if(!document.hidden)emit('infinite:soundcue',{name,group:'system-ui'});}
  function selectControl(key){selected=['world','records','inventory','covenant'].includes(key)?key:'world';for(const button of buttons){const active=button.dataset.systemControl===selected;button.classList.toggle('is-selected',active);if(active)button.setAttribute('aria-current','true');else button.removeAttribute('aria-current');}if(phase==='ready'&&!transitionPaused){const save=window.InfiniteSaves?.active?.();if(save&&save.progress?.selected!==selected){try{window.InfiniteSaves.update(save.id,{progress:{selected}});}catch{messageStatus.textContent='未能保存当前进度，请检查浏览器存储空间。';}}}}
  function focusCue(button){const now=performance.now();if(phase!=='ready'||blocked()||button.disabled||now-lastFocusCue<180||(lastFocusControl===button&&now-lastFocusCue<650))return;lastFocusControl=button;lastFocusCue=now;emit('infinite:soundcue',{name:'system-ui-focus',group:'system-ui',gain:1,pan:Math.max(-.25,Math.min(.25,(button.getBoundingClientRect().left/innerWidth-.5)*.5))});}
  function pulseControl(button){if(!animated())return;const flare=button.querySelector('.system-nav-flare');flare.getAnimations().forEach(value=>value.cancel());flare.animate([{opacity:0,transform:'scaleX(.35)'},{opacity:.65,offset:.28,transform:'scaleX(.88)'},{opacity:0,transform:'scaleX(1.12)'}],{duration:520,easing:'cubic-bezier(.2,.7,.25,1)'});}
  function say(text,{persistent=false}={}){clearTimeout(whisperTimer);if(persistent){whisper.hidden=true;chatWindow.finish(text);return;}root.querySelector('.system-character-area').append(whisper);whisper.querySelector('.system-whisper-text').textContent=text;whisper.querySelector('.system-whisper-close').hidden=true;whisper.hidden=false;whisperTimer=setTimeout(()=>{whisper.hidden=true;},4800);}
  function syncComposer(){const busy=phase!=='ready'||sending||transitionPaused;input.disabled=busy;send.disabled=busy||!input.value.trim();form.setAttribute('aria-busy',String(sending));}
  function resizeInput(){input.style.height='auto';input.style.height=`${Math.min(68,Math.max(24,input.scrollHeight))}px`;}
  function lock(value){root.setAttribute('aria-busy',String(value));for(const button of root.querySelectorAll('button'))button.disabled=value;chatWindow.setEnabled(!value);syncComposer();}
  function setPhase(value){phase=value;root.dataset.phase=value;if(value==='opening')world.dataset.state='system-arriving';else if(value==='ready')world.dataset.state='system';syncMotion();syncComposer();}
  function panelMarkup(key){
    if(key==='records')return '<p class="system-panel-kicker">往事成卷</p><h2 id="system-detail-title">轮回记录</h2><span class="system-panel-rule" aria-hidden="true"></span><div class="system-empty-mark" aria-hidden="true">卷</div><h3>此间尚无旧事</h3><p class="system-panel-copy">第一场轮回结束后，你的抉择与归途将在这里留存。</p><p class="system-panel-footnote">暂无轮回记录</p>';
    return '';
  }
  function openDetails(key,trigger){
    if(phase!=='ready'||key!=='records')return;
    detailsAnimation?.cancel();detailsAnimation=null;selectControl(key);opener=trigger;details.dataset.side=key==='covenant'?'right':'left';content.innerHTML=panelMarkup(key);
    for(const label of content.querySelectorAll('[data-system-deity-name]'))label.textContent=deity.name;
    trigger.setAttribute('aria-expanded','true');if(!details.open)details.showModal();syncMotion();closeDetailsButton.focus({preventScroll:true});cue('system-ui-select');
    if(animated()&&!document.hidden)detailsAnimation=details.animate([{opacity:0,translate:'0 10px'},{opacity:1,translate:'0 0'}],{duration:260,easing:'cubic-bezier(.2,.7,.25,1)'});
  }
  function closeDetails({immediate=false,focus=true}={}){
    if(!details.open)return Promise.resolve();detailsAnimation?.cancel();detailsAnimation=null;
    const finish=()=>{details.close();for(const button of buttons)if(button.hasAttribute('aria-expanded'))button.setAttribute('aria-expanded','false');syncMotion();if(focus&&phase==='ready')opener?.focus({preventScroll:true});};
    if(immediate||!animated()||document.hidden){finish();return Promise.resolve();}
    detailsAnimation=details.animate([{opacity:1,translate:'0 0'},{opacity:0,translate:'0 7px'}],{duration:160,easing:'ease-in',fill:'forwards'});
    return detailsAnimation.finished.then(finish,()=>{});
  }
  function resetAim(){cancelAnimationFrame(frame);frame=previous=x=y=goalX=goalY=0;root.style.setProperty('--system-aim-x','0px');root.style.setProperty('--system-aim-y','0px');renderer?.setLook?.(0,0);}
  function syncMotion(){const paused=transitionPaused||phase!=='ready'||blocked()||!animated();root.classList.toggle('system-motion-off',!animated());root.classList.toggle('system-paused',paused);renderer?.setPaused?.(paused);if(paused)resetAim();}
  function draw(now){frame=0;if(phase!=='ready'||blocked()||!animated()){resetAim();return;}const dt=previous?Math.min(.05,(now-previous)/1000):1/60;previous=now;const t=1-Math.exp(-11*dt);x+=(goalX-x)*t;y+=(goalY-y)*t;if(Math.abs(goalX-x)<.025)x=goalX;if(Math.abs(goalY-y)<.025)y=goalY;root.style.setProperty('--system-aim-x',`${x.toFixed(3)}px`);root.style.setProperty('--system-aim-y',`${y.toFixed(3)}px`);renderer?.setLook?.(x/6,y/4);if(x!==goalX||y!==goalY)frame=requestAnimationFrame(draw);else previous=0;}
  function aim(a=0,b=0){goalX=a;goalY=b;if(!frame&&phase==='ready'&&animated()&&!blocked())frame=requestAnimationFrame(draw);}
  function clearTransition(){clearTimeout(timer);timer=0;animation?.cancel();animation=null;finishPending?.(false);finishPending=null;settleTransition=null;}
  function preload(){
    window.InfiniteSystemLive2D?.prepare();
    void window.InfinitePlayerProfile?.preload();
    if(!preloadJob){const urls=['assets/system-space/moon-courtyard.png','assets/system-space/hongzhuang.webp','assets/system-space/panel.webp','assets/system-space/hub-symbols.png','assets/system-space/hub-title.png','assets/system-space/composer.webp','assets/system-space/composer-rounded.webp'];
      const job=Promise.all(urls.map(async url=>{const image=new Image();image.src=url;try{await image.decode();return true;}catch{return false;}})).then(results=>{failedAssets=urls.filter((_,i)=>!results[i]);const state={ready:results[0]&&results[1],complete:results.every(Boolean),failed:[...failedAssets]};if(!state.complete&&preloadJob===job)preloadJob=null;return state;});preloadJob=job;
    }return preloadJob;
  }
  async function open(value={}){
    if(phase!=='hidden')return false;const token=++serial,assets=await preload();if(token!==serial||!assets.ready)return false;
    deity={id:typeof value.id==='string'?value.id:'hongzhuang',name:typeof value.name==='string'?value.name:'红妆'};spoken=0;const saved=window.InfiniteSaves?.active?.();selectControl(saved?.progress?.selected||'world');lastFocusControl=null;lastFocusCue=0;sending=false;composing=false;++messageSerial;input.placeholder=`向${deity.name}说些什么…`;characterTouch.setAttribute('aria-label',`与${deity.name}交谈`);input.value='';messageStatus.textContent='';whisper.hidden=true;clearTimeout(whisperTimer);resetAim();root.hidden=false;root.inert=transitionPaused;setPhase('opening');lock(true);resizeInput();
    // The decoded backdrop is opaque immediately; only the character and UI enter.
    setThinking(false);chatWindow.restore([]);
    emit('infinite:systemvisible',{id:deity.id,name:deity.name,saveId:saved?.id||null});const duration=!value.immediate&&animated()&&!document.hidden?820:0;
    return new Promise(resolve=>{finishPending=resolve;const complete=()=>{if(token!==serial)return;clearTimeout(timer);timer=0;finishPending=null;settleTransition=null;setPhase('ready');lock(transitionPaused);chatWindow.restore(saved?.chat||[]);if(!transitionPaused)root.focus({preventScroll:true});emit('infinite:systemready',{id:deity.id,name:deity.name,saveId:saved?.id||null});resolve(true);};settleTransition=complete;if(!duration)complete();else timer=setTimeout(complete,duration);});
  }
  function close({returnToDeity=true,returnToTitle=returnToDeity,immediate=false}={}){
    if(returnToTitle&&phase==='ready'&&!transitionPaused){const waiting=[],request=new CustomEvent('infinite:systemreturn',{cancelable:true,detail:{id:deity.id,name:deity.name,deity:{...deity},immediate,waitUntil(promise){waiting.push(Promise.resolve(promise));}}});const unhandled=window.dispatchEvent(request);if(!unhandled&&waiting.length)return Promise.all(waiting).then(values=>values.every(Boolean),()=>false);return close({returnToTitle:false,immediate:true}).then(result=>{window.InfiniteTitle?.returnToTitle();return result;});}
    if(returnToTitle)return Promise.resolve(false);
    if(phase==='hidden'){++serial;return Promise.resolve(false);}if(['returning','closing'].includes(phase)&&!immediate)return Promise.resolve(false);
    const token=++serial;emit('infinite:systemleaving',{id:deity.id});clearTransition();clearTimeout(whisperTimer);whisper.hidden=true;++messageSerial;sending=false;composing=false;closeDetails({immediate:true,focus:false});resetAim();lock(true);setPhase('closing');
    return new Promise(resolve=>{finishPending=resolve;
      const leave=()=>{if(token!==serial)return;setPhase('closing');const duration=!immediate&&animated()&&!document.hidden?520:0;
        const complete=()=>{if(token!==serial)return;clearTimeout(timer);timer=0;root.hidden=true;root.inert=true;animation?.cancel();animation=null;finishPending=null;settleTransition=null;setPhase('hidden');lock(false);emit('infinite:soundstop',{group:'system-ui',fade:.1});emit('infinite:systemclosed',{id:deity.id,name:deity.name,returnToDeity});resolve(true);};settleTransition=complete;
        if(!duration){complete();return;}animation=root.animate([{opacity:1},{opacity:0}],{duration,easing:'cubic-bezier(.4,0,.6,1)',fill:'both'});timer=setTimeout(complete,duration+20);
      };
      leave();
    });
  }
  function talk(){if(phase!=='ready')return;if(sending){chatWindow.show();return;}const lines=['不急，先在这里歇一歇。','红线在，归途便在。','下一场故事，我会陪你一同见证。'];cue('system-ui-select');renderer?.greet?.();say(lines[spoken++%lines.length]);}
  async function sendMessage(event){
    event.preventDefault();const text=input.value.trim();if(!text||sending||composing||phase!=='ready')return;cue('system-ui-send');const token=++messageSerial,waiting=[];
    chatWindow.begin(text);setThinking(true);sending=true;syncComposer();
    const request=new CustomEvent('infinite:systemmessage',{cancelable:true,detail:{text,deity:{...deity},waitUntil(promise){waiting.push(Promise.resolve(promise));},progress(kind,delta){if(token!==messageSerial||phase!=='ready')return;chatWindow.progress(kind,delta);if(kind==='text')setThinking(false);},respond(value){if(token===messageSerial&&phase==='ready'&&typeof value==='string'){setThinking(false);say(value,{persistent:true});emit('infinite:systemreply',{text:window.InfiniteChatWindow.text(value)});}}}});
    if(window.dispatchEvent(request)){sending=false;setThinking(false);chatWindow.stop('对话尚未连接');syncComposer();messageStatus.textContent='对话尚未连接';return;}messageStatus.textContent='';
    try{const results=await Promise.all(waiting);if(token!==messageSerial||phase!=='ready')return;if(results.some(result=>result===false))throw new Error('Message not accepted');input.value='';resizeInput();messageStatus.textContent='';}
    catch(error){if(token===messageSerial&&phase==='ready'){const message=error?.userMessage||'消息未能发送，请稍后重试';chatWindow.stop(message);messageStatus.textContent=message;}}
    finally{if(token===messageSerial){setThinking(false);sending=false;syncComposer();input.focus({preventScroll:true});}}
  }
  async function openWorld(trigger){
    if(worldOpening||transitionPaused||phase!=='ready')return;
    if(!window.InfiniteWorldMap?.open){messageStatus.textContent='地图尚未准备好。';return;}
    const token=++worldOpenSerial;worldOpening=true;selectControl('world');cue('system-ui-select');
    try{await window.InfiniteWorldMap.open(trigger);}
    catch(failure){if(token===worldOpenSerial)messageStatus.textContent=failure?.userMessage||'地图未能打开，请重试。';}
    finally{if(token===worldOpenSerial)worldOpening=false;}
  }
  window.addEventListener('infinite:worldmapclosed',()=>{worldOpening=false;});
  root.querySelector('.system-floating-navigation').addEventListener('click',event=>{const button=event.target.closest('[data-system-control]');if(!button||phase!=='ready'||transitionPaused||blocked())return;pulseControl(button);const key=button.dataset.systemControl;if(key==='back'){cue('system-ui-back');close();}else if(key==='settings'){cue('system-ui-select');if(window.InfiniteSettings?.open)window.InfiniteSettings.open(button);else say('设置页面尚未准备好。');}else if(key==='world')openWorld(button);else if(key==='covenant'){selectControl(key);window.InfiniteCovenant?.open(button);}else openDetails(key,button);});
  root.querySelector('#system-control-covenant').addEventListener('pointerenter',()=>window.InfiniteCovenant?.preload(),{passive:true});
  root.querySelector('#system-control-inventory').addEventListener('click',event=>{event.stopPropagation();if(phase!=='ready'||transitionPaused||blocked())return;const button=event.currentTarget;selectControl('inventory');pulseControl(button);window.InfinitePlayerProfile?.open(button);});
  root.querySelector('#system-control-inventory').addEventListener('pointerenter',()=>window.InfinitePlayerProfile?.preload(),{passive:true});
  window.addEventListener('infinite:covenanterror',event=>{if(phase==='ready')messageStatus.textContent=event.detail.message;});
  root.querySelector('.system-floating-navigation').addEventListener('keydown',event=>{if(phase!=='ready'||event.altKey||event.metaKey||event.ctrlKey)return;const index=buttons.indexOf(event.target);if(index<0||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();let next;if(event.key==='Home')next=index<4?0:5;else if(event.key==='End')next=index<4?3:4;else if(event.key==='ArrowUp')next=index<2?5:4;else if(event.key==='ArrowDown')next=index===5?0:index===4?3:index;else if(index<4)next=(index+(event.key==='ArrowLeft'?-1:1)+4)%4;else next=index===4?5:4;buttons[next].focus({preventScroll:true});});
  for(const button of buttons){button.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'||event.pointerType==='pen')focusCue(button);});button.addEventListener('focus',()=>{if(button.matches(':focus-visible'))focusCue(button);});}
  closeDetailsButton.addEventListener('click',()=>{cue('system-ui-back');closeDetails();});details.addEventListener('cancel',event=>{event.preventDefault();cue('system-ui-back');closeDetails();});
  details.addEventListener('click',event=>{if(event.target!==details)return;const b=details.getBoundingClientRect();if(event.clientX<b.left||event.clientX>b.right||event.clientY<b.top||event.clientY>b.bottom){cue('system-ui-back');closeDetails();}});
  content.addEventListener('click',async event=>{if(phase!=='ready')return;if(event.target.closest('[data-system-talk]')){await closeDetails();talk();}});
  whisper.querySelector('.system-whisper-close').addEventListener('click',()=>{cue('system-ui-back');window.InfiniteTTS?.stop?.();whisper.hidden=true;input.focus({preventScroll:true});});
  characterTouch.addEventListener('click',talk);form.addEventListener('submit',sendMessage);input.addEventListener('input',()=>{syncComposer();resizeInput();messageStatus.textContent='';});input.addEventListener('compositionstart',()=>{composing=true;});input.addEventListener('compositionend',()=>{composing=false;syncComposer();});input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.isComposing&&!composing&&event.keyCode!==229){event.preventDefault();form.requestSubmit();}});
  root.addEventListener('pointermove',event=>{if(!['mouse','pen'].includes(event.pointerType)||phase!=='ready'||blocked()||!animated())return;const box=root.getBoundingClientRect();aim(Math.max(-1,Math.min(1,(event.clientX-box.left)/box.width*2-1))*6,Math.max(-1,Math.min(1,(event.clientY-box.top)/box.height*2-1))*4);},{passive:true});root.addEventListener('pointerleave',()=>aim());root.addEventListener('pointercancel',()=>aim());
  for(const name of ['dragstart','contextmenu'])root.addEventListener(name,event=>{if(!event.target.closest('textarea,input,.chat-window-scroll'))event.preventDefault();});
  document.addEventListener('keydown',event=>{if(transitionPaused||phase==='hidden'||document.querySelector('dialog[open]')||event.isComposing||event.key!=='Escape')return;event.preventDefault();event.stopImmediatePropagation();if(chatWindow.isOpen()){chatWindow.hide();window.InfiniteTTS?.stop?.();return;}if(phase==='ready')close();},true);
  for(const name of ['infinite:systemleaving','infinite:systemclosed','infinite:saveactive'])window.addEventListener(name,()=>{setThinking(false);chatWindow.stop();chatWindow.hide();});
  window.addEventListener('infinite:chatcancelled',()=>{++messageSerial;sending=false;setThinking(false);chatWindow.stop();syncComposer();});
  const observer=new MutationObserver(syncMotion);for(const dialog of document.querySelectorAll('dialog'))observer.observe(dialog,{attributes:true,attributeFilter:['open']});
  window.addEventListener('infinite:ttsstate',event=>{
    if(event.detail?.kind!=='reply'||event.detail.phase!=='error')return;
    // A speech failure must not turn a successfully received text reply into a
    // chat failure. Show it only after the composer has finished its send state.
    setTimeout(()=>{const voice=window.InfiniteTTS?.getState();if(phase==='ready'&&!sending&&!messageStatus.textContent&&voice?.phase==='error')messageStatus.textContent=voice.error;},0);
  });
  function changedMotion(){syncMotion();if(document.hidden||!animated())settleTransition?.();}
  for(const name of ['infinite:settings','infinite:settingssaved'])window.addEventListener(name,changedMotion);media.addEventListener('change',changedMotion);document.addEventListener('visibilitychange',changedMotion);window.addEventListener('blur',resetAim);window.addEventListener('resize',()=>{resetAim();if(!root.hidden)resizeInput();});window.addEventListener('pagehide',()=>close({returnToDeity:false,immediate:true}));
  window.InfiniteSystemSpace=Object.freeze({open,close,preload,prepare:preload,getCharacterMount:()=>mount,setTransitioning(value){transitionPaused=Boolean(value);root.inert=transitionPaused;if(transitionPaused)emit('infinite:systemleaving',{id:deity.id});syncMotion();lock(transitionPaused||phase!=='ready');},setCharacterRenderer(value){if(renderer===value){syncMotion();return;}renderer?.dispose?.();renderer=value||null;root.dataset.characterRenderer=renderer?.kind||(renderer?'external':'illustration');syncMotion();},getState:()=>({phase,visible:!root.hidden,selected,deity:{...deity},moving:Boolean(frame),paused:root.classList.contains('system-paused'),transitioning:transitionPaused,characterRenderer:root.dataset.characterRenderer,detailsOpen:details.open,sending,failedAssets:[...failedAssets]})});
})();
