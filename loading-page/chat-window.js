/* A bounded, non-modal reading window. Provider HTML is rebuilt from a small
   presentation-only allowlist; it never becomes executable page markup. */
(() => {
  'use strict';
  const tags=new Set('p div span br hr strong b em i u s small mark h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code table thead tbody tfoot tr th td caption a details summary'.split(' '));
  const drop=new Set('script style iframe frame object embed svg math img audio video source link meta base template form input button textarea select'.split(' '));
  const styles=new Set('color background-color font-weight font-style text-decoration text-align border-color border-style border-width border-radius padding padding-left padding-right padding-top padding-bottom margin margin-top margin-bottom'.split(' '));
  function fragment(value){
    const source=String(value||'').slice(0,48000).replace(/^\s*```(?:html)?\s*\n([\s\S]*?)\n```\s*$/i,'$1');
    const result=document.createDocumentFragment();
    if(!/<\/?[a-z][\s\S]*?>/i.test(source)){
      const p=document.createElement('p');p.className='chat-plain';p.textContent=source;result.append(p);return result;
    }
    const template=document.createElement('template');template.innerHTML=source;
    let count=0;
    function copy(from,to,depth=0){
      if(depth>24||count>2400)return;
      for(const node of from.childNodes){
        if(++count>2400)break;
        if(node.nodeType===Node.TEXT_NODE){to.append(document.createTextNode(node.textContent));continue;}
        if(node.nodeType!==Node.ELEMENT_NODE)continue;
        const tag=node.localName;if(drop.has(tag))continue;
        if(!tags.has(tag)){copy(node,to,depth+1);continue;}
        const safe=document.createElement(tag);
        for(const name of node.style){
          const value=node.style.getPropertyValue(name);
          if(styles.has(name)&&value.length<120&&!/url|var\(|expression|@|\\/i.test(value)){
            // Bound decorative spacing; no positioning, transforms or external resources.
            if(/margin|padding|width|radius/.test(name)&&! /^(?:\d{1,2}(?:\.\d+)?(?:px|em|rem|%)?\s*){1,4}$/.test(value))continue;
            if(/margin|padding/.test(name)&&[...value.matchAll(/[\d.]+/g)].some(m=>Number(m[0])>32))continue;
            safe.style.setProperty(name,value);
          }
        }
        if(tag==='a'){
          try{const url=new URL(node.getAttribute('href'));if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password){safe.href=url.href;safe.target='_blank';safe.rel='noopener noreferrer';}}catch{}
        }
        if(['th','td'].includes(tag))for(const attr of ['colspan','rowspan']){const n=Number(node.getAttribute(attr));if(n>0&&n<=12)safe.setAttribute(attr,String(n));}
        copy(node,safe,depth+1);to.append(safe);
      }
    }
    copy(template.content,result);return result;
  }
  function text(value){const node=document.createElement('div');node.append(fragment(value));return node.textContent||'';}
  function create(root,{onClose=()=>{}}={}){
    const panel=document.createElement('section');panel.className='system-chat-window';panel.hidden=true;
    panel.setAttribute('aria-label','与红妆的对话');
    panel.innerHTML=`<header class="chat-window-bar"><span class="chat-window-grip" tabindex="0" role="button" aria-label="拖动对话框，方向键移动">✧ <span>红妆</span><i aria-hidden="true"></i></span><button class="chat-window-reset" type="button" aria-label="重置对话框位置和大小" title="复位">⌖</button><button class="chat-window-close" type="button" aria-label="收起回复">×</button></header><div class="chat-window-scroll" tabindex="0" role="log" aria-label="对话记录" aria-live="off"></div><button type="button" class="chat-window-latest" aria-label="查看最新回复" hidden>↓</button><span class="chat-window-resize" tabindex="0" role="button" aria-label="缩放对话框，方向键调整大小"></span>`;
    root.append(panel);
    const scroll=panel.querySelector('.chat-window-scroll'),grip=panel.querySelector('.chat-window-grip'),resize=panel.querySelector('.chat-window-resize'),latest=panel.querySelector('.chat-window-latest');
    let geometry=null,gesture=null,active=null,frame=0,pending='',thinking='',readingBottom=true;
    const bounds=()=>({w:Math.min(root.clientWidth,window.visualViewport?.width||Infinity),h:Math.min(root.clientHeight,window.visualViewport?.height||Infinity)});
    function fit(next){const b=bounds(),w=Math.max(Math.min(300,b.w-20),Math.min(next.w,b.w-20)),h=Math.max(Math.min(168,b.h-20),Math.min(next.h,b.h-20));return{x:Math.max(10,Math.min(next.x,b.w-w-10)),y:Math.max(10,Math.min(next.y,b.h-h-10)),w,h};}
    function place(next){geometry=fit(next);for(const [key,prop] of [['x','left'],['y','top'],['w','width'],['h','height']])panel.style[prop]=geometry[key]+'px';}
    function reset(){const b=bounds(),w=Math.min(660,b.w*.88),h=Math.min(310,b.h*.38);place({x:(b.w-w)/2,y:Math.max(12,b.h*.73-h),w,h});}
    function remember(){const b=bounds();try{localStorage.setItem('infinite-chat-window:v1',JSON.stringify({x:geometry.x/b.w,y:geometry.y/b.h,w:geometry.w,h:geometry.h}));}catch{}}
    function show(){panel.hidden=false;if(!geometry){try{const g=JSON.parse(localStorage.getItem('infinite-chat-window:v1')),b=bounds();if(g&&['x','y','w','h'].every(k=>Number.isFinite(g[k])))place({...g,x:g.x*b.w,y:g.y*b.h});else reset();}catch{reset();}}else place(geometry);}
    function bottom(){scroll.scrollTop=scroll.scrollHeight;readingBottom=true;latest.hidden=true;}
    function changed(){if(readingBottom)bottom();else latest.hidden=false;}
    function article(role,value){const row=document.createElement('article');row.className='chat-message chat-message-'+role;const label=document.createElement('span');label.className='chat-message-label';label.textContent=role==='user'?'你':'红妆';const body=document.createElement('div');body.className='chat-rich-text';body.append(fragment(value));row.append(label,body);scroll.append(row);return{row,body};}
    function flush(){cancelAnimationFrame(frame);frame=0;if(!active)return;active.thought.textContent=thinking;if(pending){active.body.replaceChildren(fragment(pending));active.body.hidden=false;}changed();}
    function schedule(){if(!frame)frame=requestAnimationFrame(flush);}
    function restore(messages=[]){cancelAnimationFrame(frame);frame=0;active=null;pending=thinking='';scroll.replaceChildren();for(const item of messages.slice(-200))if(['user','assistant'].includes(item.role))article(item.role,item.content);if(messages.length){show();bottom();}else panel.hidden=true;}
    function begin(question){show();active=null;pending=thinking='';article('user',question);const entry=article('assistant','');entry.body.hidden=true;const thoughts=document.createElement('details');thoughts.className='chat-thoughts';thoughts.open=true;thoughts.innerHTML='<summary><span class="chat-thought-pulse" aria-hidden="true"></span><span class="chat-thought-label">正在思考</span><span class="chat-thought-chevron" aria-hidden="true">⌄</span></summary><div class="chat-thought-text"></div>';entry.row.insertBefore(thoughts,entry.body);active={...entry,thoughts,thought:thoughts.querySelector('.chat-thought-text'),label:thoughts.querySelector('.chat-thought-label'),answered:false};panel.dataset.phase='thinking';readingBottom=true;bottom();}
    function progress(kind,delta){if(!active||!['thinking','text'].includes(kind)||typeof delta!=='string')return;if(kind==='thinking'){thinking=(thinking+delta).slice(0,24000);}else{pending=(pending+delta).slice(0,48000);if(!active.answered){active.answered=true;active.thoughts.open=false;active.label.textContent=thinking?'思绪':'回应中';active.thoughts.hidden=!thinking;panel.dataset.phase='responding';}}schedule();}
    function finish(value){if(!active){show();article('assistant',value);changed();return;}pending=value;flush();active.thoughts.open=false;active.thoughts.hidden=!thinking;active.label.textContent='思绪';panel.dataset.phase='ready';active=null;}
    function stop(message=''){if(active){flush();active.label.textContent=message?'回应中断':'已停止';active.thoughts.hidden=!thinking&&!message;active.thoughts.open=Boolean(thinking);if(message){const error=document.createElement('p');error.className='chat-message-error';error.textContent=message;active.row.append(error);}active=null;}panel.dataset.phase='ready';}
    function hide(){end();panel.hidden=true;}
    function start(event,mode){if(event.button!==0||!event.isPrimary)return;event.preventDefault();const target=event.currentTarget;gesture={id:event.pointerId,x:event.clientX,y:event.clientY,start:{...geometry},mode};target.setPointerCapture(event.pointerId);panel.classList.add('is-manipulating');}
    function move(event){if(!gesture||gesture.id!==event.pointerId)return;const {start,mode,x,y}=gesture,dx=event.clientX-x,dy=event.clientY-y;place(mode==='move'?{...start,x:start.x+dx,y:start.y+dy}:{...start,w:start.w+dx,h:start.h+dy});}
    function end(){if(!gesture)return;gesture=null;panel.classList.remove('is-manipulating');remember();}
    // Track on the window as well: some browser gestures/native controls may
    // transfer pointer capture away from a small corner grip during a drag.
    window.addEventListener('pointermove',move,{passive:true});window.addEventListener('pointerup',end);window.addEventListener('pointercancel',end);window.addEventListener('blur',end);
    for(const [element,mode] of [[grip,'move'],[resize,'resize']]){element.addEventListener('pointerdown',e=>start(e,mode));element.addEventListener('keydown',e=>{const direction={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];if(!direction)return;e.preventDefault();e.stopPropagation();const step=e.shiftKey?24:8,[x,y]=direction,g=geometry;place(mode==='move'?{...g,x:g.x+x*step,y:g.y+y*step}:{...g,w:g.w+x*step,h:g.h+y*step});remember();});}
    grip.addEventListener('dblclick',()=>{reset();remember();});
    panel.querySelector('.chat-window-reset').addEventListener('click',()=>{reset();remember();});
    panel.querySelector('.chat-window-close').addEventListener('click',()=>{hide();onClose();});
    panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();hide();onClose();}});
    scroll.addEventListener('scroll',()=>{readingBottom=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<36;if(readingBottom)latest.hidden=true;},{passive:true});
    scroll.addEventListener('wheel',e=>e.stopPropagation(),{passive:true});latest.addEventListener('click',bottom);
    window.addEventListener('resize',()=>{if(geometry)place(geometry);});window.visualViewport?.addEventListener('resize',()=>{if(geometry)place(geometry);});
    return Object.freeze({begin,progress,finish,restore,stop,hide,show,isOpen:()=>!panel.hidden,setEnabled:value=>{panel.inert=!value;},getState:()=>({visible:!panel.hidden,phase:panel.dataset.phase||'ready',geometry:{...geometry}})});
  }
  window.InfiniteChatWindow=Object.freeze({create,fragment,text});
})();
