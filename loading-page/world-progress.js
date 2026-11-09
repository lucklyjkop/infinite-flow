/* Chapter data is generated on demand. Selection never advances a journey. */
(() => {
  'use strict';
  const CHAPTER_SIZE=6,PROGRESS_LIMIT=Number.MAX_SAFE_INTEGER-18;
  const depths=[.66,.42,.63,.38,.58,.40],templates=[];
  const saves=()=>window.InfiniteSaves;
  const error=message=>Object.assign(new Error(message),{userMessage:message});
  const idAt=index=>saves().worldStageIdAt(index);
  const indexOf=id=>saves().worldStageIndexOf(id);
  let previewSelected=idAt(0),pendingReason=null;
  function registerTemplate(value){
    if(!value||typeof value.id!=='string'||!/^[-a-z0-9]+$/.test(value.id)||templates.some(item=>item.id===value.id)||typeof value.name!=='string'||!value.name.trim()||typeof value.atlas!=='string'||!/^assets\/world-map\/[-a-z0-9]+\.png$/.test(value.atlas)||typeof value.theme!=='string'||!Array.isArray(value.stages)||value.stages.length!==CHAPTER_SIZE)throw error('章节模板不完整。');
    const stages=value.stages.map(stage=>{if(!stage||typeof stage.name!=='string'||!stage.name.trim())throw error('章节关卡不完整。');return Object.freeze({name:stage.name.trim(),kind:typeof stage.kind==='string'?stage.kind:'',description:typeof stage.description==='string'?stage.description:''});});
    const template=Object.freeze({id:value.id,name:value.name.trim(),atlas:value.atlas,theme:value.theme,stages:Object.freeze(stages)});templates.push(template);return template;
  }
  registerTemplate({id:'mountains',name:'山海初醒',atlas:'assets/world-map/landmarks.png',theme:'mist',stages:[
    {name:'雾渡',kind:'叙事 · 渡口',description:'雾中一盏渡灯，等候尚未抵岸的人。'},
    {name:'红衣客栈',kind:'探索 · 客栈',description:'红灯未熄，客栈里却没有归人。'},
    {name:'纸人旧城',kind:'谜境 · 旧城',description:'旧城的门扉，在纸页翻动时开启。'},
    {name:'寒山隘',kind:'试炼 · 山隘',description:'循着雪中的足迹，越过最后一道山隘。'},
    {name:'镜湖',kind:'幻境 · 湖泊',description:'湖面倒映着一个尚未发生的世界。'},
    {name:'归墟',kind:'终局 · 祭坛',description:'所有岔路，最终在此重逢。'}
  ]});
  registerTemplate({id:'bamboo',name:'竹海灯影',atlas:'assets/world-map/landmarks-bamboo.png',theme:'bamboo',stages:[
    {name:'竹影长桥',kind:'叙事 · 长桥',description:'竹影交叠，桥下传来一声迟到的回响。'},
    {name:'灯火水镇',kind:'探索 · 水镇',description:'沿着河灯，走入不肯入夜的小镇。'},
    {name:'红叶书院',kind:'谜境 · 书院',description:'满庭红叶，藏着无人读完的旧卷。'},
    {name:'飞瀑栈道',kind:'试炼 · 栈道',description:'越过水声，前路悬在薄雾之中。'},
    {name:'云中禅寺',kind:'幻境 · 禅寺',description:'钟声落下，云层后浮现一座古寺。'},
    {name:'古树祭坛',kind:'终局 · 祭坛',description:'红绳缠满枝头，古树仍在等候来人。'}
  ]});
  registerTemplate({id:'snow',name:'雪域天门',atlas:'assets/world-map/landmarks-snow.png',theme:'snow',stages:[
    {name:'雪驿',kind:'叙事 · 驿站',description:'风雪封路，驿站里留着最后一盏灯。'},
    {name:'冰湖龙骨',kind:'探索 · 冰湖',description:'冰面之下，远古的轮廓渐渐清晰。'},
    {name:'雪岭石寨',kind:'谜境 · 石寨',description:'雪埋半城，石墙后仍有脚步经过。'},
    {name:'风雪钟楼',kind:'试炼 · 钟楼',description:'登上钟楼，听见风雪深处的回应。'},
    {name:'悬崖索桥',kind:'幻境 · 索桥',description:'一线索桥，连接云海两端的孤崖。'},
    {name:'天门云宫',kind:'终局 · 云宫',description:'穿过天门，云上的宫阙缓缓苏醒。'}
  ]});
  function getState(){
    const save=saves()?.active?.(),progress=save?.progress?.world,completedCount=save?progress.completedCount:0;
    const activeChapterIndex=Math.floor(completedCount/CHAPTER_SIZE),maxPreviewChapterIndex=activeChapterIndex+1;
    const candidate=save?progress.selected:previewSelected,candidateIndex=indexOf(candidate);
    const selectedId=candidateIndex>=0&&Math.floor(candidateIndex/CHAPTER_SIZE)<=maxPreviewChapterIndex?candidate:idAt(completedCount);
    return {saveId:save?.id||null,completedCount,activeChapterIndex,maxPreviewChapterIndex,selectedChapterIndex:Math.floor(indexOf(selectedId)/CHAPTER_SIZE),selectedId,nextId:idAt(completedCount)};
  }
  function chapterOf(index,state){
    if(!Number.isSafeInteger(index)||index<0||index>state.maxPreviewChapterIndex)throw error('这个章节暂不可用。');
    const template=templates[index%templates.length],cycle=Math.floor(index/templates.length),start=index*CHAPTER_SIZE;
    const completedCount=Math.min(CHAPTER_SIZE,Math.max(0,state.completedCount-start)),unlocked=index<=state.activeChapterIndex,completed=completedCount===CHAPTER_SIZE;
    const stages=template.stages.map((item,localIndex)=>{
      const globalIndex=start+localIndex,status=globalIndex<state.completedCount?'completed':globalIndex===state.completedCount?'available':'locked';
      return {...item,title:item.name,id:idAt(globalIndex),index:localIndex,globalIndex,chapterIndex:index,number:String(localIndex+1).padStart(2,'0'),u:.10+localIndex*.16,v:depths[localIndex],status,lighted:status!=='locked'};
    });
    return {id:`chapter-${index+1}`,index,number:String(index+1).padStart(2,'0'),name:template.name+(cycle?`·第${cycle+1}重`:''),templateId:template.id,atlas:template.atlas,theme:template.theme,unlocked,completed,completedCount,litCount:stages.filter(stage=>stage.lighted).length,stages};
  }
  const getChapter=index=>chapterOf(index,getState());
  function stageOf(id,state){const index=indexOf(id);if(index<0||Math.floor(index/CHAPTER_SIZE)>state.maxPreviewChapterIndex)throw error('这个关卡暂不可用。');return index;}
  function notify(reason='save'){
    try{window.dispatchEvent(new CustomEvent('infinite:worldprogress',{detail:{...getState(),reason}}));}
    catch(failure){window.dispatchEvent(new CustomEvent('infinite:worldprogress',{detail:{error:failure?.userMessage||'关卡进度未能读取。',reason}}));}
  }
  function persist(state,world,reason){
    pendingReason=reason;
    try{saves().update(state.saveId,{progress:{world}});}
    finally{pendingReason=null;}
    return getState();
  }
  function select(id){
    const state=getState();stageOf(id,state);if(state.selectedId===id)return state;
    if(state.saveId)return persist(state,{selected:id},'selection');
    previewSelected=id;notify('selection');return getState();
  }
  function complete(id){
    const state=getState(),index=stageOf(id,state);
    if(!state.saveId)throw error('请先选择存档。');
    if(index<state.completedCount)return state;
    if(index!==state.completedCount)throw error('请先完成前一关。');
    if(state.completedCount>=PROGRESS_LIMIT)throw error('这份旅程的进度已达存储上限。');
    return persist(state,{completedCount:state.completedCount+1,selected:idAt(index+1)},'completion');
  }
  // Kept as immutable first-chapter metadata for callers using the original API.
  const stages=Object.freeze(chapterOf(0,{completedCount:0,activeChapterIndex:0,maxPreviewChapterIndex:1}).stages.map(({status,lighted,...stage})=>Object.freeze(stage)));
  window.addEventListener('infinite:saveschange',()=>notify(pendingReason||'save'));
  window.addEventListener('infinite:saveactive',()=>{previewSelected=idAt(0);notify('active');});
  window.InfiniteWorldProgress=Object.freeze({stages,getState,getChapter,select,complete,registerTemplate});
})();
