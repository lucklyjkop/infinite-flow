/* Contract progression. Point totals are derived from persisted completions. */
(() => {
  'use strict';
  const freeze=value=>{
    if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}
    return value;
  };
  const catalog=freeze([
    {id:'root',name:'红线契印',branch:null,parent:null,cost:0,type:'天赋',description:'与红妆结下最初的契约。',effect:{kind:'covenant-origin'}},
    {id:'insight',name:'观照',branch:'insight',parent:'root',cost:2,type:'天赋',description:'留意场景中的细小异样。',effect:{kind:'perception',aspect:'detail',rank:1}},
    {id:'listen',name:'聆风',branch:'insight',parent:'insight',cost:2,type:'天赋',description:'从交谈与回声中寻觅线索。',effect:{kind:'perception',aspect:'listening',rank:1}},
    {id:'discern',name:'辨妄',branch:'insight',parent:'listen',cost:3,type:'能力',description:'审视线索之间的矛盾。',effect:{kind:'perception',aspect:'contradiction',rank:1}},
    {id:'night',name:'照夜',branch:'insight',parent:'discern',cost:4,type:'能力',description:'于迷雾中追寻被遮蔽的真相。',effect:{kind:'perception',aspect:'revelation',rank:1}},
    {id:'ward',name:'护命',branch:'ward',parent:'root',cost:2,type:'天赋',description:'面对险境时守住自身。',effect:{kind:'resilience',aspect:'protection',rank:1}},
    {id:'resolve',name:'守念',branch:'ward',parent:'ward',cost:2,type:'天赋',description:'在纷扰中维持清明。',effect:{kind:'resilience',aspect:'composure',rank:1}},
    {id:'renew',name:'回息',branch:'ward',parent:'resolve',cost:3,type:'能力',description:'以短暂歇息重新凝聚心神。',effect:{kind:'resilience',aspect:'recovery',rank:1}},
    {id:'steadfast',name:'不灭',branch:'ward',parent:'renew',cost:4,type:'能力',description:'在逆境中保留最后的希望。',effect:{kind:'resilience',aspect:'perseverance',rank:1}},
    {id:'crossing',name:'渡界',branch:'crossing',parent:'root',cost:2,type:'天赋',description:'感知不同世界之间的联系。',effect:{kind:'journey',aspect:'attunement',rank:1}},
    {id:'path',name:'问路',branch:'crossing',parent:'crossing',cost:2,type:'天赋',description:'循着细微迹象辨认方向。',effect:{kind:'journey',aspect:'navigation',rank:1}},
    {id:'bond',name:'牵缘',branch:'crossing',parent:'path',cost:3,type:'能力',description:'寻觅与旅途中人物的缘分。',effect:{kind:'journey',aspect:'connection',rank:1}},
    {id:'home',name:'归途',branch:'crossing',parent:'bond',cost:4,type:'能力',description:'铭记来路，寻找归返的契机。',effect:{kind:'journey',aspect:'return',rank:1}}
  ]);
  const byId=new Map(catalog.map(node=>[node.id,node]));
  const taskIdPattern=/^[a-zA-Z0-9][a-zA-Z0-9._:/-]{0,159}$/;
  const error=message=>Object.assign(new Error(message),{userMessage:message});
  let pendingReason=null;
  function stateOf(save){
    const completedCount=save?.progress?.world?.completedCount||0;
    const tasks=[...new Set(save?.progress?.covenant?.tasks||[])];
    const worldPoints=Math.min(Number.MAX_SAFE_INTEGER,completedCount*3),taskPoints=tasks.length;
    const earned=Math.min(Number.MAX_SAFE_INTEGER,worldPoints+taskPoints);
    const supplied=new Set(save?.progress?.covenant?.unlocked||[]),unlocked=['root'];
    let spent=0;
    // Catalog order is topological. Malformed imports cannot activate a child
    // without its parent or spend points that the journey has never earned.
    for(const node of catalog){
      if(node.id==='root'||!supplied.has(node.id)||!unlocked.includes(node.parent)||spent+node.cost>earned)continue;
      unlocked.push(node.id);spent+=node.cost;
    }
    return {saveId:save?.id||null,earned,spent,balance:earned-spent,unlocked,tasks,completedCount,worldPoints,taskPoints};
  }
  function getState(){return stateOf(window.InfiniteSaves?.active());}
  function requireSave(){
    const save=window.InfiniteSaves?.active();
    if(!save)throw error('请先进入一份存档。');
    return save;
  }
  function transact(reason,mutate){
    const save=requireSave(),previousReason=pendingReason;
    pendingReason=reason;
    try{return stateOf(window.InfiniteSaves.updateCovenant(save.id,mutate));}
    finally{pendingReason=previousReason;}
  }
  function unlock(id){
    const node=byId.get(id);if(!node)throw error('这项契约暂不可用。');
    return transact('unlock',(ledger,save)=>{
      const state=stateOf(save);
      if(state.unlocked.includes(id))return null;
      if(!state.unlocked.includes(node.parent))throw error('请先解锁前置契约。');
      if(state.balance<node.cost)throw error('契约点不足。');
      return {unlocked:[...ledger.unlocked,id]};
    });
  }
  function awardTask(id){
    if(typeof id!=='string'||!taskIdPattern.test(id))throw error('任务编号无效，契约点未结算。');
    return transact('task',(ledger)=>ledger.tasks.includes(id)?null:{tasks:[...ledger.tasks,id]});
  }
  function publish(event){
    let state;
    try{state=getState();}catch(cause){state={...stateOf(null),error:cause.userMessage||'契约暂不可用。'};}
    window.dispatchEvent(new CustomEvent('infinite:covenantchange',{detail:{...state,reason:pendingReason||(event?.type==='infinite:saveactive'?'active':'progress')}}));
  }
  window.addEventListener('infinite:saveschange',publish);
  window.addEventListener('infinite:saveactive',publish);
  window.InfiniteCovenantProgress=Object.freeze({catalog,getState,unlock,awardTask});
})();
