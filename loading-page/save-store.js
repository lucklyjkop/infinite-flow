/* Browser-local named journeys. Only explicit game fields enter persistent storage. */
(() => {
  'use strict';
  const KEY='infinite.saves.v1', VERSION=1, MAX_SAVES=100, MAX_MESSAGES=200, MAX_CHAT_CHARS=200000;
  const choices=new Set(['world','records','inventory','covenant']);
  const worldStageIds=Object.freeze(['mist-ferry','red-inn','paper-city','snow-pass','mirror-lake','return-peak']);
  const WORLD_CHAPTER_SIZE=6, WORLD_PROGRESS_LIMIT=Number.MAX_SAFE_INTEGER-18;
  let activeId=null;
  const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
  const error=message=>Object.assign(new Error(message),{userMessage:message});
  const emit=(type,detail)=>window.dispatchEvent(new CustomEvent(type,{detail}));
  function nameOf(value){
    if(typeof value!=='string')throw error('请输入存档名称。');
    const name=value.trim();
    if(!name||Array.from(name).length>24||/[\u0000-\u001f\u007f]/.test(name))throw error('存档名称需为 1–24 个字，请勿使用换行。');
    return name;
  }
  function deityOf(value){
    if(!value||value.id!=='hongzhuang')throw error('这份存档的主神暂不可用。');
    return {id:'hongzhuang',name:'红妆'};
  }
  function chatOf(value){
    if(!Array.isArray(value))return [];
    const messages=[];
    for(let i=0;i+1<value.length;i+=2){
      const user=value[i],reply=value[i+1];
      if(user?.role!=='user'||reply?.role!=='assistant'||typeof user.content!=='string'||typeof reply.content!=='string')continue;
      const a=Array.from(user.content.trim()).slice(0,4000).join(''),b=Array.from(reply.content.trim()).slice(0,12000).join('');
      if(a&&b)messages.push({role:'user',content:a},{role:'assistant',content:b});
    }
    const kept=messages.slice(-MAX_MESSAGES);
    let count=kept.reduce((sum,item)=>sum+item.content.length,0);
    while(kept.length>2&&count>MAX_CHAT_CHARS){count-=kept[0].content.length+kept[1].content.length;kept.splice(0,2);}
    return kept;
  }
  function worldStageIdAt(index){
    if(!Number.isSafeInteger(index)||index<0||index>WORLD_PROGRESS_LIMIT+12)return null;
    return index<WORLD_CHAPTER_SIZE?worldStageIds[index]:`chapter-${Math.floor(index/WORLD_CHAPTER_SIZE)+1}-stage-${index%WORLD_CHAPTER_SIZE+1}`;
  }
  function worldStageIndexOf(id){
    const first=worldStageIds.indexOf(id);if(first>=0)return first;
    if(typeof id!=='string')return -1;
    const match=/^chapter-([1-9]\d*)-stage-([1-6])$/.exec(id);if(!match)return -1;
    const chapter=Number(match[1]),index=(chapter-1)*WORLD_CHAPTER_SIZE+Number(match[2])-1;
    return chapter>=2&&Number.isSafeInteger(index)&&worldStageIdAt(index)===id?index:-1;
  }
  function worldOf(value){
    // Legacy completed IDs describe only the original six stages. Keep their
    // continuous prefix, then persist an O(1) count for all future chapters.
    const supplied=new Set(Array.isArray(value?.completed)?value.completed:[]);let legacyCount=0;
    for(const id of worldStageIds){if(!supplied.has(id))break;legacyCount++;}
    const compactCount=Number.isSafeInteger(value?.completedCount)&&value.completedCount>=0&&value.completedCount<=WORLD_PROGRESS_LIMIT?value.completedCount:0;
    const completedCount=Math.max(legacyCount,compactCount),selectedIndex=worldStageIndexOf(value?.selected);
    const maxPreviewIndex=Math.floor(completedCount/WORLD_CHAPTER_SIZE)+1;
    const selected=selectedIndex>=0&&Math.floor(selectedIndex/WORLD_CHAPTER_SIZE)<=maxPreviewIndex?value.selected:worldStageIdAt(completedCount);
    return {completedCount,selected};
  }
  function normalize(value){
    if(!value||typeof value.id!=='string'||!/^[-_a-zA-Z0-9]{1,80}$/.test(value.id))throw error('存档数据不完整，请保留浏览器数据后重试。');
    const createdAt=Number(value.createdAt),updatedAt=Number(value.updatedAt);
    if(!Number.isFinite(createdAt)||!Number.isFinite(updatedAt)||createdAt<=0||updatedAt<createdAt)throw error('存档时间数据无效。');
    return {id:value.id,name:nameOf(value.name),deity:deityOf(value.deity),createdAt,updatedAt,location:'system',
      chat:chatOf(value.chat),progress:{selected:choices.has(value.progress?.selected)?value.progress.selected:'world',world:worldOf(value.progress?.world)}};
  }
  function read(){
    let raw;
    try{raw=localStorage.getItem(KEY);}catch{throw error('浏览器无法读取存档，请检查本地存储权限。');}
    if(raw===null)return {version:VERSION,saves:[]};
    let value;try{value=JSON.parse(raw);}catch{throw error('存档数据无法读取，原数据已保留。');}
    if(value?.version!==VERSION||!Array.isArray(value.saves))throw error('这份存档格式暂不支持，原数据已保留。');
    const saves=value.saves.map(normalize);
    if(new Set(saves.map(save=>save.id)).size!==saves.length)throw error('存档编号有冲突，原数据已保留。');
    return {version:VERSION,saves};
  }
  function write(value,afterPersist){
    try{localStorage.setItem(KEY,JSON.stringify(value));}catch{throw error('存档未能保存，浏览器存储空间可能已满；原存档仍然保留。');}
    afterPersist?.();
    emit('infinite:saveschange',{id:activeId,count:value.saves.length});
  }
  function list(){return clone(read().saves.sort((a,b)=>b.updatedAt-a.updatedAt||a.id.localeCompare(b.id)));}
  function get(id){return clone(read().saves.find(save=>save.id===id)||null);}
  function create(value){
    const name=nameOf(value?.name),deity=deityOf(value?.deity),document=read();
    if(document.saves.length>=MAX_SAVES)throw error('存档数量已达上限，请继续已有的旅程。');
    let id;do{id='save_'+(crypto.randomUUID?crypto.randomUUID().replace(/-/g,''):Date.now().toString(36)+Math.random().toString(36).slice(2));}while(document.saves.some(save=>save.id===id));
    const now=Date.now(),save={id,name,deity,createdAt:now,updatedAt:now,location:'system',chat:[],progress:{selected:'world',world:worldOf(null)}};
    document.saves.push(save);write(document);return clone(save);
  }
  function activate(id){
    const save=get(id);if(!save)throw error('这份存档已不存在，请重新选择。');
    activeId=save.id;emit('infinite:saveactive',{id:activeId,save:clone(save)});return save;
  }
  function active(){return activeId?get(activeId):null;}
  function clearActive(){activeId=null;emit('infinite:saveactive',{id:null,save:null});}
  function remove(id){
    // Read at confirmation time so a newer save from another tab is preserved.
    const document=read(),index=document.saves.findIndex(save=>save.id===id);
    if(index<0){if(activeId===id)clearActive();return false;}
    document.saves.splice(index,1);
    // Clearing the current journey must happen only after persistence succeeds,
    // and before observers receive the changed list.
    try{write(document,()=>{if(activeId===id)clearActive();});}
    catch(cause){throw Object.assign(error('未能删除存档，请重试。'),{cause});}
    return true;
  }
  function change(id,mutate){
    const document=read(),index=document.saves.findIndex(save=>save.id===id);
    if(index<0)throw error('这份存档已不存在，请重新选择。');
    const save=document.saves[index];mutate(save);save.updatedAt=Math.max(Date.now(),save.createdAt,save.updatedAt+1);
    document.saves[index]=normalize(save);write(document);return clone(document.saves[index]);
  }
  function update(id,patch={}){return change(id,save=>{
    if(Object.prototype.hasOwnProperty.call(patch,'name'))save.name=nameOf(patch.name);
    if(patch.progress&&choices.has(patch.progress.selected))save.progress.selected=patch.progress.selected;
    if(patch.progress?.world&&typeof patch.progress.world==='object'&&!Array.isArray(patch.progress.world)){
      const before=worldOf(save.progress.world),next=worldOf({...before,...patch.progress.world});
      // A stale navigation patch from another tab must not erase a clear that
      // has already been persisted. Progress reset is not a navigation action.
      next.completedCount=Math.max(before.completedCount,next.completedCount);
      save.progress.world=worldOf({...next,selected:patch.progress.world.selected??before.selected});
    }
    // Other fields, including credentials, endpoints and conversation IDs, are ignored.
  });}
  function appendMessagePair(id,user,assistant){
    if(typeof user!=='string'||typeof assistant!=='string'||!user.trim()||!assistant.trim())throw error('对话未能完整保存。');
    return change(id,save=>{save.chat=chatOf([...save.chat,{role:'user',content:user},{role:'assistant',content:assistant}]);});
  }
  window.addEventListener('storage',event=>{
    if(event.key!==KEY&&event.key!==null)return;
    if(activeId){try{if(!get(activeId))clearActive();}catch{clearActive();}}
    emit('infinite:saveschange',{external:true,id:activeId});
  });
  window.InfiniteSaves=Object.freeze({list,get,create,activate,active,update,appendMessagePair,remove,clearActive,worldStageIds,worldStageIdAt,worldStageIndexOf});
})();
