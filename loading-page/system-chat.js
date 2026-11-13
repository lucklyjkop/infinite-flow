/* Each save owns its conversation. Connection credentials and SDK session IDs
   stay in memory; only completed player/character pairs enter the save store. */
(() => {
  'use strict';
  const sessions = new Map();
  let connectionId = '', active = null, phase = 'idle';
  function failure(message) {
    const error = new Error('Chat request failed');
    error.userMessage = message;
    return error;
  }
  const currentSave = () => window.InfiniteSaves?.active?.() || null;
  const routeKey = (saveId, connection) => JSON.stringify([saveId, connection]);
  function cancel() {
    const previous = active;
    active = null;
    phase = 'idle';
    previous?.controller.abort();
    if(previous)window.dispatchEvent(new CustomEvent('infinite:chatcancelled'));
  }
  function settings() {
    const value = window.InfiniteSettings?.getModelConnection?.();
    if (!value || !['openai','anthropic'].includes(value.protocol)) throw failure('请先在系统设置中保存模型接口配置。');
    if (!value.baseUrl || !value.name) throw failure('请先保存接口地址和模型 ID。');
    return value;
  }
  function historyFor(save) {
    const source = Array.isArray(save.chat) ? save.chat : [];
    const pairs = [];
    for (let i = 0; i + 1 < source.length; i += 2) {
      const user = source[i], assistant = source[i + 1];
      if (user?.role !== 'user' || assistant?.role !== 'assistant'
          || typeof user.content !== 'string' || typeof assistant.content !== 'string'
          || !user.content.trim() || !assistant.content.trim()) continue;
      pairs.push([
        {role:'user', content:Array.from(user.content.trim()).slice(0,4000).join('')},
        {role:'assistant', content:Array.from(assistant.content.trim()).slice(0,12000).join('')},
      ]);
    }
    let history = pairs.slice(-10).flat();
    while (history.reduce((sum, message) => sum + Array.from(message.content).length, 0) > 16000) history = history.slice(2);
    return history;
  }
  async function send(detail) {
    const save = currentSave();
    if (!save?.id) throw failure('请先建立或载入存档，再与红妆交谈。');
    const config = settings();
    const nextConnection = JSON.stringify([config.protocol, config.baseUrl, config.name, config.apiKey]);
    if (nextConnection !== connectionId) { sessions.clear(); connectionId = nextConnection; }
    cancel();
    const controller = new AbortController(), key = routeKey(save.id, nextConnection);
    const run = {controller, saveId:save.id, connection:nextConnection};
    active = run; phase = 'sending';
    const current = () => active === run && currentSave()?.id === run.saveId;
    const timer = setTimeout(() => controller.abort(), 130000);
    try {
      const response = await fetch('api/chat', {
        method:'POST', headers:{'Content-Type':'application/json','Accept':'application/x-ndjson'}, cache:'no-store', signal:controller.signal,
        body:JSON.stringify({message:detail.text, history:historyFor(save), sessionId:sessions.get(key) || null,
          protocol:config.protocol, baseUrl:config.baseUrl, apiKey:config.apiKey, model:config.name}),
      });
      const result = await readResponse(response, (kind,delta) => {if(current())detail.progress?.(kind,delta);},controller.signal);
      if (!current()) return false;
      if (!response.ok) throw failure(typeof result?.error === 'string' ? result.error.slice(0,240) : '对话服务暂时不可用，请稍后重试。');
      if (!result || typeof result.reply !== 'string' || !result.reply.trim() || typeof result.sessionId !== 'string') {
        throw failure('没有收到完整回复，请重试。');
      }
      if (controller.signal.aborted) throw failure('等待已结束，消息已保留，可以重新发送。');
      sessions.delete(key); sessions.set(key, result.sessionId);
      while (sessions.size > 50) sessions.delete(sessions.keys().next().value);
      try { window.InfiniteSaves.appendMessagePair(run.saveId, detail.text, result.reply); }
      catch (error) {
        // Keep the received answer visible even if browser storage is full.
        detail.respond(result.reply);
        throw failure(error?.userMessage || '回复已收到，但未能写入存档，请检查浏览器存储后重试。');
      }
      detail.respond(result.reply);
      window.InfiniteSystemLive2D?.greet?.();
      phase = 'ready';
      return true;
    } catch (error) {
      // Leaving or switching saves invalidates a request silently. An older
      // request must never overwrite the new save's reply, error or phase.
      if (!current()) return false;
      phase = 'error';
      if (error?.userMessage) throw error;
      throw failure(controller.signal.aborted ? '等待已结束，消息已保留，可以重新发送。' : '暂时无法连接对话服务，请检查接口设置和网络。');
    } finally {
      clearTimeout(timer);
      if (active === run) active = null;
    }
  }
  async function readResponse(response,progress,signal){
    if(!(response.headers?.get('Content-Type')||'').includes('application/x-ndjson')||!response.body)return response.json().catch(()=>null);
    const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',total=0,result=null;
    const parse=line=>{if(!line.trim())return;const item=JSON.parse(line);if(item.type==='error')throw failure(typeof item.error==='string'?item.error.slice(0,240):'对话暂时中断，请重试。');if(item.type==='done')result=item;else if(['thinking','text'].includes(item.type)&&typeof item.delta==='string')progress(item.type,item.delta);};
    try{while(true){if(signal.aborted)throw failure('等待已结束，消息已保留，可以重新发送。');const {value,done}=await reader.read();if(done){buffer+=decoder.decode();if(buffer.trim())parse(buffer);break;}total+=value.byteLength;if(total>1048576)throw failure('回复内容过长，请重试。');buffer+=decoder.decode(value,{stream:true});let index;while((index=buffer.indexOf('\n'))>=0){parse(buffer.slice(0,index));buffer=buffer.slice(index+1);}if(result)break;}return result;}
    finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  }
  window.addEventListener('infinite:systemmessage', event => {
    if (event.defaultPrevented || !event.detail?.text) return;
    event.preventDefault();
    event.detail.waitUntil(send(event.detail));
  });
  for (const name of ['infinite:systemleaving','infinite:systemclosed','infinite:saveactive','pagehide']) window.addEventListener(name, cancel);
  window.addEventListener('infinite:settingssaved', () => {
    const config = window.InfiniteSettings?.getModelConnection?.();
    if (config && JSON.stringify([config.protocol, config.baseUrl, config.name, config.apiKey]) === connectionId) return;
    cancel(); sessions.clear(); connectionId = '';
  });
  window.InfiniteSystemChat = Object.freeze({getState:() => ({phase, busy:Boolean(active),
    hasSession:Boolean(sessions.get(routeKey(currentSave()?.id, connectionId)))})});
})();
