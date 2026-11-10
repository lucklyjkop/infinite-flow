/* Save names and archive browsing are views over InfiniteSaves. Player text is
   always assigned as textContent, never included in generated HTML. */
(() => {
  'use strict';
  const world = document.getElementById('world');
  if (!world) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.createElement('section');
  root.id = 'save-page'; root.className = 'save-page'; root.hidden = true; root.inert = true; root.tabIndex = -1;
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'save-page-title');
  root.innerHTML = `
    <div class="save-environment" aria-hidden="true"><img src="assets/save-ui/archive-backdrop.png" alt="" draggable="false"><div class="save-environment-shade"></div></div>
    <button class="save-back" type="button"><span aria-hidden="true">←</span> 返回标题</button>
    <header class="save-heading"><h1 id="save-page-title">存档管理</h1><img src="assets/menu-ui/sakura-branch.webp" alt="" draggable="false"></header>
    <div class="save-archive-caption"><span id="save-count"></span></div>
    <div class="save-scroll" tabindex="-1"><div class="save-grid" aria-label="已保存的存档"></div><div class="save-empty" hidden><div class="save-empty-emblem" aria-hidden="true">卷</div><h2>暂无存档</h2><p hidden></p><button class="save-new-game" type="button">开始游戏 <span aria-hidden="true">→</span></button><button class="save-new-game save-retry" type="button" hidden>重新读取 <span aria-hidden="true">↻</span></button></div></div>
    <footer class="save-footer"><p id="save-page-status" role="status" aria-live="polite"></p></footer>`;
  world.append(root);
  const naming = document.createElement('dialog');
  naming.id = 'save-name-dialog'; naming.className = 'save-name-dialog'; naming.setAttribute('aria-labelledby', 'save-name-title');
  naming.innerHTML = `<form id="save-name-form" autocomplete="off" novalidate>
    <button type="button" class="save-name-close" aria-label="取消命名">×</button>
    <p class="save-name-kicker">一线牵缘 · 此刻落款</p><h2 id="save-name-title">为旅程命名</h2>
    <p class="save-name-intro"><span data-name-deity></span>将与你一同见证，这段故事的开始。</p>
    <label for="save-name-input">存档名称</label><div class="save-name-field"><input id="save-name-input" type="text" maxlength="96" placeholder="写下这段旅程的名字" autocomplete="off" spellcheck="false" aria-describedby="save-name-error save-name-count"><span id="save-name-count">0 / 24</span></div>
    <p id="save-name-error" class="save-name-error" role="status" aria-live="polite"></p>
    <div class="save-name-actions"><button type="button" class="save-name-cancel">暂不启程</button><button type="submit" class="save-name-confirm">落款 · 启程 <span aria-hidden="true">→</span></button></div>
  </form>`;
  world.append(naming);
  const grid = root.querySelector('.save-grid'), scroll = root.querySelector('.save-scroll'), empty = root.querySelector('.save-empty');
  const back = root.querySelector('.save-back'), newGame = root.querySelector('.save-new-game'), retry = root.querySelector('.save-retry'), status = root.querySelector('#save-page-status');
  const nameForm = naming.querySelector('form'), nameInput = naming.querySelector('input'), nameError = naming.querySelector('.save-name-error'), nameCount = naming.querySelector('#save-name-count');
  let phase = 'hidden', generation = 0, animation = null, busyId = null, opener = null, lastFocusAt = 0;
  let nameRequest = null, nameAnimation = null, composing = false, closingName = false, preloadJob = null, readError = '';
  let pendingDelete = null, hold = null, consumedPointer = null, blockedClick = null;
  const HOLD_DELAY = 560, HOLD_DISTANCE = 12;
  const preloadedImages = new Map();
  const failedPreloadImages = new Set();
  const motion = () => !reduced.matches && window.InfiniteSettings?.getState?.().motion !== false && !document.hidden;
  const emit = (name, detail = {}) => window.dispatchEvent(new CustomEvent(name, {detail}));
  const cue = name => { if (!document.hidden) emit('infinite:soundcue', {name, group:'save-ui', gain:.7}); };
  function saves() {
    try { const list = window.InfiniteSaves?.list?.() || []; readError = ''; return list; }
    catch (error) { readError = error?.userMessage || '暂时无法读取存档，请稍后重试。'; return []; }
  }
  function setPhase(value) { phase = value; root.dataset.phase = value; }
  function setBusy(value) {
    busyId = value; root.setAttribute('aria-busy', String(Boolean(value)));
    for (const button of root.querySelectorAll('button')) button.disabled = Boolean(value);
    for (const card of grid.children) card.classList.toggle('is-loading', card.dataset.saveId === value);
  }
  function dateLabel(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '时间未记录' : new Intl.DateTimeFormat('zh-CN', {year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', hour12:false}).format(date);
  }
  function buildCard(save, index) {
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'save-card'; card.dataset.saveId = save.id; card.style.setProperty('--card-index', index % 8);
    card.setAttribute('aria-label', `继续存档：${save.name}`); card.setAttribute('aria-keyshortcuts', 'Delete');
    card.innerHTML = `<span class="save-card-portrait"><img src="assets/deity-space/nai-avatar.webp" alt="" draggable="false"></span><span class="save-card-copy"><span class="save-card-topline"><span class="save-card-place">系统空间</span><span class="save-card-recent"></span></span><span class="save-card-name"></span><span class="save-card-deity"></span><span class="save-card-preview"></span><time class="save-card-time"></time></span><span class="save-card-enter" aria-hidden="true">→</span><span class="save-card-thread" aria-hidden="true"><svg viewBox="0 0 400 25" preserveAspectRatio="none"><path pathLength="1" d="M2 17C85-10 194 38 330 12L385 13"/></svg><i></i></span>`;
    card.querySelector('.save-card-name').textContent = save.name;
    card.querySelector('.save-card-deity').textContent = `主神 · ${save.deity?.name || '红妆'}`;
    const latest = [...(save.chat || [])].reverse().find(message => message.role === 'assistant');
    card.querySelector('.save-card-preview').textContent = latest?.content ? latest.content.replace(/\s+/g, ' ').slice(0, 72) : '';
    const time = card.querySelector('time'); time.textContent = dateLabel(save.updatedAt);
    if (!Number.isNaN(new Date(save.updatedAt).getTime())) time.dateTime = new Date(save.updatedAt).toISOString();
    card.querySelector('.save-card-recent').textContent = index === 0 ? '最近游玩' : '';
    const focusCue = () => { const now = performance.now(); if (busyId || pendingDelete || phase !== 'ready' || now - lastFocusAt < 180) return; lastFocusAt = now; cue('ui-focus'); };
    card.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') focusCue(); });
    card.addEventListener('focus', () => { if (card.matches(':focus-visible')) focusCue(); });
    return card;
  }
  function render() {
    cancelHold(true);
    const oldError = readError;
    const list = saves();
    const focusId = document.activeElement?.closest?.('.save-card')?.dataset.saveId;
    grid.replaceChildren(...list.map(buildCard)); empty.hidden = list.length > 0; grid.hidden = list.length === 0;
    root.querySelector('#save-count').textContent = list.length ? `${list.length} 份存档` : '';
    empty.querySelector('h2').textContent = readError ? '存档暂时无法读取' : '暂无存档';
    empty.querySelector('p').hidden = true;
    newGame.hidden = Boolean(readError); retry.hidden = !readError;
    if (readError) status.textContent = readError;
    else if (status.textContent === oldError) status.textContent = '';
    if (busyId) setBusy(busyId);
    if (focusId) [...grid.children].find(card => card.dataset.saveId === focusId)?.focus({preventScroll:true});
  }
  function preload() {
    if (!preloadJob) {
      const job = Promise.all(['assets/save-ui/archive-backdrop.png', 'assets/save-ui/archive-card.png', 'assets/save-ui/name-panel.png', 'assets/deity-space/nai-avatar.webp'].map(async url => {
        let image = preloadedImages.get(url);
        if (!image) {
          image = [...root.querySelectorAll('img')].find(element => element.getAttribute('src') === url) || new Image();
          preloadedImages.set(url, image);
        }
        if ((image.complete && !image.naturalWidth) || failedPreloadImages.has(url)) image.removeAttribute('src');
        if (!image.getAttribute('src')) image.src = url;
        const success = await new Promise(resolve => {
          const timer = setTimeout(() => resolve(false),30000);
          image.decode().then(() => { clearTimeout(timer); resolve(image.naturalWidth > 0); },() => { clearTimeout(timer); resolve(false); });
        });
        if (success) failedPreloadImages.delete(url); else failedPreloadImages.add(url);
        return success;
      })).then(results => {
        if (results.includes(false) && preloadJob === job) preloadJob = null;
        return results;
      });
      preloadJob = job;
    }
    return preloadJob;
  }
  async function show({opener:trigger = document.activeElement} = {}) {
    if (phase !== 'hidden') return false;
    const token = ++generation; setPhase('preparing'); opener = trigger;
    await preload(); if (token !== generation) return false;
    if (world.dataset.state !== 'title') {setPhase('hidden');return false;}
    window.InfiniteTitle?.hide(); status.textContent = ''; render(); scroll.scrollTop = 0; setBusy(null);
    root.hidden = false; root.inert = false; world.dataset.state = 'archives'; setPhase('opening'); cue('menu-open');
    if (motion()) {
      animation = root.animate([{opacity:0},{opacity:1}], {duration:360, easing:'cubic-bezier(.2,.7,.25,1)'});
      await animation.finished.catch(() => {});
    }
    if (token !== generation) return false;
    animation = null; setPhase('ready'); (grid.querySelector('button') || (readError ? retry : newGame)).focus({preventScroll:true});
    emit('infinite:archivesvisible'); return true;
  }
  async function hide({restoreTitle = false, immediate = false} = {}) {
    cancelHold(); cancelDelete();
    if (phase === 'hidden') return false;
    const token = ++generation; animation?.cancel(); animation = null; root.inert = true; setPhase('closing');
    if (!immediate && motion() && !root.hidden) {
      animation = root.animate([{opacity:1},{opacity:0}], {duration:220, easing:'ease-in', fill:'both'});
      await animation.finished.catch(() => {});
    }
    if (token !== generation) return false;
    root.hidden = true; animation?.cancel(); animation = null; setBusy(null); setPhase('hidden');
    if (restoreTitle) {
      window.InfiniteTitle?.show();
      if (opener?.isConnected && !opener.disabled) opener.focus({preventScroll:true});
    }
    return true;
  }
  async function load(id) {
    if (phase !== 'ready' || busyId || pendingDelete) return;
    try { if (!window.InfiniteSaves?.get(id)) { render(); status.textContent = '这份存档已不可用，请选择另一段旅程。'; return; } }
    catch (error) { render(); status.textContent = error?.userMessage || '存档暂时无法读取，请重试。'; return; }
    const token = generation; cue('ui-tap'); setBusy(id); status.textContent = '正在续接这段旅程…';
    const waiting = [], request = new CustomEvent('infinite:loadsave', {cancelable:true, detail:{id, waitUntil(promise) {waiting.push(Promise.resolve(promise));}}});
    try {
      if (window.dispatchEvent(request) || !waiting.length) throw new Error('存档入口尚未就绪，请稍后再试。');
      const results = await Promise.all(waiting);
      if (token !== generation) return;
      if (results.some(result => result === false)) throw new Error('这段旅程暂时无法载入，请重试。');
      await hide({immediate:true});
    } catch (error) {
      if (token !== generation) return;
      setBusy(null); status.textContent = error?.userMessage || error?.message || '存档读取失败，请重试。';
      [...grid.children].find(card => card.dataset.saveId === id)?.focus({preventScroll:true});
    }
  }
  function blockClick(id) { blockedClick = {id, until:performance.now() + 1400}; }
  function cancelHold(suppressClick = false) {
    if (!hold) return;
    clearTimeout(hold.timer);
    if (suppressClick) {blockClick(hold.card.dataset.saveId);consumedPointer = hold.pointerId;}
    hold = null;
  }
  function cancelDelete() {
    if (!pendingDelete) return;
    const request = pendingDelete; pendingDelete = null; request.controller.abort();
  }
  async function requestDelete(card) {
    if (phase !== 'ready' || busyId || pendingDelete || !card?.isConnected) return;
    cancelHold();
    const id = card.dataset.saveId;
    let save;
    try { save = window.InfiniteSaves?.get(id); }
    catch (error) {status.textContent = error?.userMessage || '存档暂时无法读取，请重试。';return;}
    if (!save) {render();status.textContent = '这份存档已删除。';return;}
    if (!window.InfiniteDialog?.confirm) {status.textContent = '删除窗口尚未就绪，请重试。';return;}
    const request = {id, index:[...grid.children].indexOf(card), token:generation, controller:new AbortController()};
    pendingDelete = request;
    let confirmed = false;
    try {
      confirmed = await window.InfiniteDialog.confirm({
        title:'删除存档', message:`删除「${save.name}」？删除后无法恢复。`,
        confirmText:'删除', cancelText:'取消', opener:card, signal:request.controller.signal,
        onConfirm:() => {
          if (request.controller.signal.aborted || phase !== 'ready' || generation !== request.token) return false;
          window.InfiniteSaves.remove(id);
          return true;
        }
      });
    } catch (error) {
      if (!request.controller.signal.aborted) status.textContent = error?.userMessage || '删除窗口无法打开，请重试。';
    } finally {
      if (pendingDelete !== request) return;
      pendingDelete = null;
      if (phase === 'ready' && generation === request.token) {
        render();
        if (confirmed) status.textContent = '存档已删除。';
        const cards = [...grid.children];
        const target = cards.find(item => item.dataset.saveId === id) || cards[Math.min(request.index, cards.length - 1)] || (readError ? retry : newGame);
        target.focus({preventScroll:true});
      }
    }
  }
  function updateName() {
    const length = Array.from(nameInput.value.trim()).length;
    nameCount.textContent = `${length} / 24`; nameCount.classList.toggle('is-invalid', length > 24);
    nameError.textContent = ''; nameInput.removeAttribute('aria-invalid');
  }
  async function finishName(value, immediate = false) {
    if (!nameRequest || closingName) return;
    closingName = true; const request = nameRequest;
    if (!immediate) cue(value === null ? 'ui-back' : 'ui-save');
    naming.querySelectorAll('button').forEach(button => {button.disabled = true;});
    if (!immediate && motion()) {
      nameAnimation = naming.animate([{opacity:1,translate:'0 0'},{opacity:0,translate:'0 5px'}], {duration:160, easing:'ease-in', fill:'both'});
      await nameAnimation.finished.catch(() => {});
    }
    if (nameRequest !== request) return;
    naming.close(); nameAnimation?.cancel(); nameAnimation = null; nameRequest = null; closingName = false; composing = false;
    request.resolve(value);
    if (value === null && request.opener?.isConnected && !request.opener.disabled) request.opener.focus({preventScroll:true});
  }
  function requestName({deity = {name:'红妆'}} = {}) {
    if (nameRequest) return nameRequest.promise;
    if (document.querySelector('dialog[open]')) return Promise.resolve(null);
    const promise = new Promise(resolve => {nameRequest = {resolve, opener:document.activeElement, promise:null};});
    nameRequest.promise = promise;
    naming.querySelector('[data-name-deity]').textContent = deity.name || '红妆';
    nameInput.value = ''; composing = closingName = false; updateName();
    naming.querySelectorAll('button').forEach(button => {button.disabled = false;});
    naming.showModal(); nameInput.focus({preventScroll:true}); cue('menu-open');
    if (motion()) nameAnimation = naming.animate([{opacity:0,translate:'0 10px'},{opacity:1,translate:'0 0'}], {duration:260, easing:'cubic-bezier(.2,.7,.25,1)'});
    void preload(); return promise;
  }
  root.querySelector('.save-back').addEventListener('click', () => { if (!busyId && !pendingDelete) {cue('ui-back');void hide({restoreTitle:true});} });
  newGame.addEventListener('click', async () => {if (busyId || pendingDelete) return; await hide({restoreTitle:true});document.querySelector('[data-menu-action="new"]')?.click();});
  retry.addEventListener('click', () => { if (busyId || pendingDelete) return; render(); (grid.querySelector('button') || (readError ? retry : newGame)).focus({preventScroll:true}); });
  grid.addEventListener('click', event => {
    const card = event.target.closest('.save-card'); if (!card) return;
    if (pendingDelete || (blockedClick?.id === card.dataset.saveId && performance.now() < blockedClick.until)) {
      event.preventDefault();event.stopPropagation();return;
    }
    void load(card.dataset.saveId);
  });
  grid.addEventListener('contextmenu', event => {
    const card = event.target.closest('.save-card'); if (!card) return;
    event.preventDefault();cancelHold();blockClick(card.dataset.saveId);void requestDelete(card);
  });
  grid.addEventListener('pointerdown', event => {
    const card = event.target.closest('.save-card');
    if (!card || phase !== 'ready' || busyId || pendingDelete || event.isPrimary === false || event.button !== 0) return;
    blockedClick = null; consumedPointer = null;
    if (event.pointerType !== 'touch' && event.pointerType !== 'pen') return;
    cancelHold();
    const gesture = {card, pointerId:event.pointerId, x:event.clientX, y:event.clientY, timer:null};
    gesture.timer = setTimeout(() => {
      if (hold !== gesture) return;
      hold = null; consumedPointer = gesture.pointerId; blockClick(card.dataset.saveId);
      void requestDelete(card);
    }, HOLD_DELAY);
    hold = gesture;
  }, {passive:true});
  window.addEventListener('pointerdown', event => {if (hold && event.pointerId !== hold.pointerId) cancelHold(true);}, {passive:true, capture:true});
  window.addEventListener('pointermove', event => {
    if (hold?.pointerId === event.pointerId && Math.hypot(event.clientX - hold.x, event.clientY - hold.y) > HOLD_DISTANCE) cancelHold(true);
  }, {passive:true});
  for (const name of ['pointerup','pointercancel']) window.addEventListener(name, event => {
    if (hold?.pointerId === event.pointerId) cancelHold(name === 'pointercancel');
    if (consumedPointer === event.pointerId) {
      if (blockedClick) blockClick(blockedClick.id);
      consumedPointer = null;
    }
  }, {passive:true});
  grid.addEventListener('pointerleave', () => cancelHold(true));
  scroll.addEventListener('scroll', () => cancelHold(true), {passive:true});
  root.addEventListener('wheel', () => cancelHold(true), {passive:true});
  root.addEventListener('keydown', event => {
    if (phase !== 'ready' || busyId || pendingDelete || event.isComposing) return;
    if (event.key === 'Escape') {event.preventDefault();event.stopPropagation();cue('ui-back');void hide({restoreTitle:true});return;}
    const cards = [...grid.querySelectorAll('.save-card')], index = cards.indexOf(document.activeElement);
    if (index >= 0 && ['Enter',' ','Delete'].includes(event.key)) blockedClick = null;
    if (index >= 0 && event.key === 'Delete') {
      event.preventDefault();event.stopPropagation();if (!event.repeat) void requestDelete(cards[index]);return;
    }
    if (index < 0 || !['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key)) return;
    const columns = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length;
    const offset = {ArrowLeft:-1, ArrowRight:1, ArrowUp:-columns, ArrowDown:columns}[event.key];
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? cards.length - 1 : Math.max(0, Math.min(cards.length - 1, index + offset));
    event.preventDefault(); cards[next]?.focus();
  });
  root.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || root.hidden) return;
    const targets = [...root.querySelectorAll('button:not(:disabled)')].filter(element => element.getClientRects().length);
    if (!targets.length) {event.preventDefault();return;}
    if (event.shiftKey && document.activeElement === targets[0]) {event.preventDefault();targets.at(-1).focus();}
    else if (!event.shiftKey && document.activeElement === targets.at(-1)) {event.preventDefault();targets[0].focus();}
  });
  nameInput.addEventListener('input', updateName); nameInput.addEventListener('compositionstart', () => {composing = true;}); nameInput.addEventListener('compositionend', () => {composing = false;updateName();});
  nameInput.addEventListener('keydown', event => {if (event.key === 'Enter' && (event.isComposing || composing || event.keyCode === 229)) event.preventDefault();});
  nameForm.addEventListener('submit', event => {
    event.preventDefault(); if (composing || closingName) return;
    const name = nameInput.value.trim(), count = Array.from(name).length;
    if (!count || count > 24 || /[\u0000-\u001f\u007f]/.test(name)) {
      nameError.textContent = !count ? '请为这段旅程写下一个名字。' : count > 24 ? '名字请控制在 24 个字以内。' : '名字中不能包含控制字符。';
      nameInput.setAttribute('aria-invalid', 'true'); nameInput.focus(); return;
    }
    void finishName(name);
  });
  for (const button of naming.querySelectorAll('.save-name-cancel,.save-name-close')) button.addEventListener('click', () => void finishName(null));
  naming.addEventListener('cancel', event => {event.preventDefault();void finishName(null);});
  naming.addEventListener('click', event => {if (event.target !== naming) return;const r=naming.getBoundingClientRect();if (event.clientX<r.left || event.clientX>r.right || event.clientY<r.top || event.clientY>r.bottom) void finishName(null);});
  for (const owner of [root,naming]) for (const name of ['dragstart','contextmenu']) owner.addEventListener(name, event => {if (!event.target.closest('input')) event.preventDefault();if (name === 'dragstart') cancelHold(true);});
  window.addEventListener('infinite:saveschange', () => {if (phase !== 'hidden' && !busyId && !pendingDelete) render();});
  window.addEventListener('infinite:startgame', () => {void preload();});
  window.addEventListener('infinite:title', () => {if (phase !== 'hidden') void hide({immediate:true});if (nameRequest) void finishName(null,true);});
  document.addEventListener('visibilitychange', () => {if (document.hidden) {cancelHold(true);animation?.finish();nameAnimation?.finish();}});
  window.addEventListener('pagehide', () => {void hide({immediate:true});void finishName(null,true);});
  window.InfiniteSaveUI = Object.freeze({show, hide, requestName, preload, getState:() => ({phase, visible:!root.hidden, busy:Boolean(busyId), selectedId:busyId, count:saves().length, naming:naming.open, deleting:Boolean(pendingDelete)})});
})();
