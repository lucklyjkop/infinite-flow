/* A destination owns input only after its background is present. Both directions
   keep the old scene painted until the new one can cover it without a black cut. */
(() => {
  'use strict';
  const world = document.getElementById('world');
  if (!world) return;
  let generation = 0, phase = 'idle', active = null, lastError = '', handoffs = 0;
  const deity = () => window.InfiniteDeitySpace;
  const system = () => window.InfiniteSystemSpace;
  const current = run => active === run && generation === run.token;
  function coverDeity(value) {
    const root = document.getElementById('deity-space');
    if (root && !root.hidden) root.inert = value;
  }

  function bounded(promise, ms, message) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      Promise.resolve(promise).then(value => {clearTimeout(timer); resolve(value);}, error => {clearTimeout(timer); reject(error);});
    });
  }
  function visibleFrame(run) {
    return new Promise(resolve => {
      const root = document.getElementById('system-space');
      if (!root) { resolve(false); return; }
      let frame = 0, timer = 0, finished = false;
      const finish = value => {
        if (finished) return;
        finished = true;
        observer.disconnect(); cancelAnimationFrame(frame); clearTimeout(timer);
        document.removeEventListener('visibilitychange', inspect);
        run.cancelVisible = null;
        resolve(value);
      };
      const inspect = () => {
        if (!current(run)) {finish(false); return;}
        if (root.hidden || !['opening', 'ready'].includes(system()?.getState().phase)) return;
        if (document.hidden) {finish(true); return;}
        if (!frame) frame = requestAnimationFrame(() => {
          frame = requestAnimationFrame(() => finish(current(run) && !root.hidden));
        });
      };
      const observer = new MutationObserver(inspect);
      observer.observe(root, {attributes:true, attributeFilter:['hidden', 'data-phase']});
      document.addEventListener('visibilitychange', inspect);
      run.cancelVisible = () => finish(false);
      timer = setTimeout(() => finish(false), 10000);
      inspect();
    });
  }
  function cancel() {
    ++generation;
    const previous = active;
    active = null;
    previous?.cancelVisible?.();
    coverDeity(false);
    phase = 'idle';
  }
  async function restore(run, message) {
    if (!current(run)) return false;
    if (run.handedOff) {
      const restored = await bounded(deity()?.open({immediate:true, selectedId:run.value.id}), 10000, '主神页面恢复超时。');
      if (!current(run) || !restored) return false;
      await system()?.close({returnToDeity:false, immediate:true});
    }
    // Even an entrance that failed before the handoff may have already changed
    // world.state. Do not restore it after a newer navigation owns the page.
    if (!current(run)) return false;
    const destination = deity()?.getState();
    if (destination?.phase !== 'ready' || !destination.visible) return false;
    world.dataset.state = 'deity';
    coverDeity(false);
    deity()?.recoverConfirmation(message);
    return true;
  }
  async function enter(value) {
    const run = active = {token:++generation, value, handedOff:false, cancelVisible:null};
    phase = 'preparing'; lastError = '';
    try {
      if (!system()?.open || !deity()?.close) throw new Error('系统空间尚未就绪，请重试。');
      const assets = await bounded(system().preload(), 12000, '系统空间资源加载较慢，请稍后重试。');
      if (!current(run)) return false;
      const selection = deity().getState();
      if (selection.phase !== 'ready' || selection.selected !== value.id || !selection.confirmed) {cancel(); return false;}
      if (!assets?.ready) throw new Error('系统空间资源未能载入，请检查连接后重试。');
      phase = 'opening';
      // open starts its own entrance; observe visibility instead of waiting the
      // entire entrance duration while the old scene still handles Escape.
      const opening = Promise.resolve().then(() => system().open(value)).catch(error => {
        run.openError = error;
        return false;
      });
      const visibility = visibleFrame(run);
      opening.then(complete => {if (!complete) run.cancelVisible?.();});
      const shown = await visibility;
      if (!current(run)) return false;
      if (!shown) {
        await system().close({returnToDeity:false, immediate:true});
        throw run.openError || new Error('系统空间打开失败，请重试。');
      }
      deity().close({returnToTitle:false, immediate:true});
      run.handedOff = true;
      ++handoffs;
      const complete = await bounded(opening, 10000, '系统空间打开超时，请重试。');
      if (!current(run)) return false;
      if (!complete) throw run.openError || new Error('系统空间打开中断，请重试。');
      phase = 'system'; active = null;
      return true;
    } catch (error) {
      if (!current(run)) return false;
      lastError = error instanceof Error ? error.message : '系统空间未能打开，请重试。';
      try { await restore(run, lastError); }
      catch {
        const destination = deity()?.getState();
        if (current(run) && destination?.phase === 'ready' && destination.visible) {
          deity()?.recoverConfirmation(lastError);
        }
      }
      if (current(run)) {active = null; phase = 'idle';}
      return false;
    }
  }

  window.addEventListener('infinite:deityselected', event => {
    if (event.defaultPrevented) return;
    const value = event.detail;
    const selection = deity()?.getState();
    if (!value || selection?.phase !== 'ready' || !selection.confirmed || selection.selected !== value.id) return;
    event.preventDefault();
    if (active || system()?.getState().visible) return;
    void enter({id:value.id, name:value.name});
  });
  window.addEventListener('infinite:systemreturn', event => {
    if (event.defaultPrevented || typeof event.detail?.waitUntil !== 'function') return;
    event.preventDefault();
    if (active) { event.detail.waitUntil(Promise.resolve(false)); return; }
    const value = {id:event.detail.id, name:event.detail.name};
    const run = active = {token:++generation, value, handedOff:true};
    phase = 'returning'; lastError = '';
    const preparation = (async () => {
      try {
        const preparation = deity()?.getState().phase === 'ready'
          ? true : deity()?.open({immediate:true, selectedId:value.id});
        coverDeity(true);
        const open = await bounded(preparation, 10000, '主神页面准备超时。');
        if (!current(run)) return false;
        if (!open) throw new Error('主神页面尚未就绪，请重试。');
        coverDeity(true);
        deity()?.recoverConfirmation();
        return true;
      } catch (error) {
        if (current(run)) {
          lastError = error instanceof Error ? error.message : '返回主神页面失败。';
          deity()?.close({returnToTitle:false, immediate:true});
          world.dataset.state = 'system';
        }
        return false;
      } finally {
        if (current(run)) {active = null; phase = 'system';}
      }
    })();
    event.detail.waitUntil(preparation);
  });
  window.addEventListener('infinite:systemclosed', () => {
    coverDeity(false);
    if (!active) phase = 'idle';
    if (deity()?.getState().phase === 'ready' && !document.hidden && !document.querySelector('dialog[open]')) {
      world.dataset.state = 'deity';
      document.querySelector('#deity-space .deity-choice.is-selected')?.focus({preventScroll:true});
    }
  });
  window.addEventListener('infinite:startgame', () => { system()?.preload?.().catch(() => {}); });
  window.addEventListener('infinite:title', () => {
    cancel();
    void system()?.close({returnToDeity:false, immediate:true});
  });
  window.addEventListener('infinite:deityreturnstart', () => {if (phase === 'preparing') cancel();});
  window.addEventListener('pagehide', () => {
    cancel();
    void system()?.close({returnToDeity:false, immediate:true});
  });
  window.InfiniteSystemFlow = Object.freeze({
    getState: () => ({phase, busy:Boolean(active), handedOff:Boolean(active?.handedOff), handoffs, lastError}),
  });
})();
