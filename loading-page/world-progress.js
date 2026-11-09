/* World-map navigation reads the active named journey; selection is not a clear. */
(() => {
  'use strict';
  const names=['雾渡','红衣客栈','纸人旧城','寒山隘','镜湖','归墟'];
  const ids=window.InfiniteSaves?.worldStageIds||['mist-ferry','red-inn','paper-city','snow-pass','mirror-lake','return-peak'];
  const depths=[.66,.42,.63,.38,.58,.40];
  const stages=Object.freeze(ids.map((id,index)=>Object.freeze({id,name:names[index],title:names[index],index,number:String(index+1).padStart(2,'0'),u:.10+index*.16,v:depths[index]})));
  let previewSelected=ids[0],pendingReason=null;
  const error=message=>Object.assign(new Error(message),{userMessage:message});
  function stageOf(id){const stage=stages.find(item=>item.id===id);if(!stage)throw error('这个关卡暂不可用。');return stage;}
  function getState(){
    const save=window.InfiniteSaves?.active?.(),progress=save?.progress?.world;
    const supplied=new Set(Array.isArray(progress?.completed)?progress.completed:[]),completedIds=[];
    if(save)for(const id of ids){if(!supplied.has(id))break;completedIds.push(id);}
    const completedCount=completedIds.length,nextId=ids[completedCount]||null;
    const candidate=save?progress?.selected:previewSelected;
    const selectedId=ids.includes(candidate)?candidate:(nextId||ids[ids.length-1]);
    return {saveId:save?.id||null,completedCount,completedIds,selectedId,nextId,stages:stages.map(stage=>({...stage,status:stage.index<completedCount?'completed':stage.index===completedCount?'available':'locked'}))};
  }
  function notify(reason='save'){
    try{window.dispatchEvent(new CustomEvent('infinite:worldprogress',{detail:{...getState(),reason}}));}
    catch(failure){window.dispatchEvent(new CustomEvent('infinite:worldprogress',{detail:{error:failure?.userMessage||'关卡进度未能读取。',reason}}));}
  }
  function persist(state,world,reason){
    pendingReason=reason;
    try{window.InfiniteSaves.update(state.saveId,{progress:{world}});}
    finally{pendingReason=null;}
    return getState();
  }
  function select(id){
    stageOf(id);const state=getState();if(state.selectedId===id)return state;
    if(state.saveId)return persist(state,{selected:id},'selection');
    previewSelected=id;notify('selection');return getState();
  }
  function complete(id){
    const stage=stageOf(id),state=getState();
    if(!state.saveId)throw error('请先选择存档。');
    if(stage.index<state.completedCount)return state;
    if(stage.index!==state.completedCount)throw error('请先完成前一关。');
    return persist(state,{completed:[...state.completedIds,id],selected:ids[stage.index+1]||id},'completion');
  }
  window.addEventListener('infinite:saveschange',()=>notify(pendingReason||'save'));
  window.addEventListener('infinite:saveactive',()=>{previewSelected=ids[0];notify('active');});
  window.InfiniteWorldProgress=Object.freeze({stages,getState,select,complete});
})();
