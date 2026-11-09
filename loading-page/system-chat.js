/* The browser sends saved connection settings to the local DSH bridge only.
   Credentials and conversation IDs are never included in diagnostics or URLs. */
(() => {
  'use strict';
  let sessionId = null, connectionId = '', active = null, phase = 'idle';
  function failure(message) {
    const error = new Error('Chat request failed');
    error.userMessage = message;
    return error;
  }
  function cancel() { active?.abort(); active = null; }
  function settings() {
    const value = window.InfiniteSettings?.getModelConnection?.();
    if (!value || !['openai','anthropic'].includes(value.protocol)) throw failure('请先在系统设置中保存模型接口配置。');
    if (!value.baseUrl || !value.name) throw failure('请先保存接口地址和模型 ID。');
    return value;
  }
  async function send(detail) {
    const config = settings();
    const nextConnection = JSON.stringify([config.protocol, config.baseUrl, config.name, config.apiKey]);
    if (nextConnection !== connectionId) { sessionId = null; connectionId = nextConnection; }
    cancel();
    const controller = new AbortController(); active = controller; phase = 'sending';
    const timer = setTimeout(() => controller.abort(), 130000);
    try {
      const response = await fetch('api/chat', {
        method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store', signal:controller.signal,
        body:JSON.stringify({message:detail.text, sessionId, protocol:config.protocol, baseUrl:config.baseUrl, apiKey:config.apiKey, model:config.name}),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw failure(typeof result?.error === 'string' ? result.error.slice(0,240) : '对话服务暂时不可用，请稍后重试。');
      if (!result || typeof result.reply !== 'string' || !result.reply.trim() || typeof result.sessionId !== 'string') {
        throw failure('没有收到完整回复，请重试。');
      }
      if (active !== controller || controller.signal.aborted) return false;
      sessionId = result.sessionId;
      detail.respond(result.reply);
      window.InfiniteSystemLive2D?.greet?.();
      phase = 'ready';
      return true;
    } catch (error) {
      phase = 'error';
      if (error?.userMessage) throw error;
      throw failure(controller.signal.aborted ? '等待已结束，消息已保留，可以重新发送。' : '暂时无法连接对话服务，请检查接口设置和网络。');
    } finally {
      clearTimeout(timer);
      if (active === controller) active = null;
    }
  }
  window.addEventListener('infinite:systemmessage', event => {
    if (event.defaultPrevented || !event.detail?.text) return;
    event.preventDefault();
    event.detail.waitUntil(send(event.detail));
  });
  window.addEventListener('infinite:systemclosed', cancel);
  window.addEventListener('pagehide', cancel);
  window.addEventListener('infinite:settingssaved', () => {
    const config = window.InfiniteSettings?.getModelConnection?.();
    if (config && JSON.stringify([config.protocol, config.baseUrl, config.name, config.apiKey]) === connectionId) return;
    cancel(); sessionId = null; connectionId = ''; phase = 'idle';
  });
  window.InfiniteSystemChat = Object.freeze({getState:() => ({phase, busy:Boolean(active), hasSession:Boolean(sessionId)})});
})();
