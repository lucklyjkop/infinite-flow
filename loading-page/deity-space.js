/* A complete, cancelable handoff from the title photograph to the pantheon. */
(() => {
  'use strict';
  const world = document.getElementById('world');
  if (!world) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const root = document.createElement('section');
  root.id = 'deity-space';
  root.className = 'deity-space';
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('aria-labelledby', 'deity-location');
  root.innerHTML = `
    <div class="deity-view" aria-hidden="true">
      <img class="deity-backdrop" src="assets/deity-space/sanctuary.webp" alt="" draggable="false" decoding="async">
      <div class="deity-tone"></div>
      <div class="deity-depth-haze"></div>
    </div>
    <div class="deity-actors" aria-label="主神">
      <button id="deity-hongzhuang" class="deity-god deity-primary" type="button" aria-pressed="false" aria-label="红妆，可选择的主神">
        <span class="deity-aura" aria-hidden="true"></span>
        <span class="deity-plinth" aria-hidden="true"></span>
        <img class="deity-figure" src="assets/deity-space/hongzhuang.webp" alt="" draggable="false" decoding="async">
        <span class="deity-god-name"><span class="deity-name-rule" aria-hidden="true"></span>红妆<span class="deity-god-state">可共鸣</span></span>
      </button>
      ${[1, 2, 3, 4, 5, 2].map((n, i) => `
      <button class="deity-god deity-locked deity-locked-${i + 1}" type="button" disabled aria-label="未唤醒的主神 ${i + 1}，暂不可选择">
        <span class="deity-plinth" aria-hidden="true"></span>
        <img class="deity-figure" src="assets/deity-space/locked-${n}.webp" alt="" draggable="false" decoding="async">
        <span class="deity-locked-name" aria-hidden="true">未唤醒</span>
      </button>`).join('')}
    </div>
    <canvas id="deity-assembly" aria-hidden="true"></canvas>
    <header class="deity-location">
      <h1 id="deity-location"><span class="deity-heading-words">主神空间</span><img src="assets/deity-space/location-title.webp" alt="" draggable="false" decoding="async"></h1>
      <p>万界之外 · 命运之间</p>
    </header>
    <button id="deity-return" class="deity-return" type="button"><span aria-hidden="true">←</span> 返回标题</button>
    <p class="deity-index" aria-hidden="true">一席已唤醒<span>七位主神</span></p>
    <div class="deity-detail">
      <div class="deity-detail-copy"><p class="deity-detail-kicker">请选择共鸣之人</p><h2 id="deity-detail-name">红线所系，诸界相逢。</h2><p id="deity-detail-note">移向红妆，唤醒她的真容。</p></div>
      <button id="deity-confirm" class="deity-confirm" type="button" disabled>确认主神</button>
    </div>
    <p id="deity-selection-status" class="deity-selection-status" role="status" aria-live="polite"></p>
    <p class="deity-controls" aria-hidden="true"><span>点击主神 · 确认选择</span><span>ESC 返回</span></p>`;
  world.appendChild(root);

  const primary = root.querySelector('#deity-hongzhuang');
  const back = root.querySelector('#deity-return');
  const confirm = root.querySelector('#deity-confirm');
  const titleArt = root.querySelector('.deity-location img');
  const canvas = root.querySelector('#deity-assembly');
  const status = root.querySelector('#deity-selection-status');
  const images = [...root.querySelectorAll('img')];
  const waiting = new Map();
  let generation = 0, phase = 'hidden', assembly = null, preloadJob = null;
  let selected = false, confirmed = false, launching = false;
  let hovering = false, focusing = false, pointerFrame = 0;
  let aim = {x: 0, y: 0, lx: 50, ly: 42};
  let loads = 0, failures = 0;

  const motionAllowed = () => !reduced.matches && window.InfiniteSettings?.getState().motion !== false;
  const isOpen = () => phase !== 'hidden';
  function cue(name, options = {}) {
    window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail: {name, group: 'deity-space', ...options}}));
  }
  function setPhase(value) {
    phase = value;
    root.dataset.phase = value;
    if (value !== 'hidden') world.dataset.state = value === 'ready' ? 'deity' : 'deity-arriving';
  }
  function delay(ms) {
    return new Promise(resolve => {
      const timer = setTimeout(() => { waiting.delete(timer); resolve(true); }, ms);
      waiting.set(timer, resolve);
    });
  }
  function cancelWaiting() {
    for (const [timer, resolve] of waiting) { clearTimeout(timer); resolve(false); }
    waiting.clear();
  }
  function imageReady(image) {
    return new Promise(resolve => {
      if (image.complete) { resolve(image.naturalWidth > 0); return; }
      let done = false;
      const finish = success => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        image.removeEventListener('load', loaded);
        image.removeEventListener('error', failed);
        resolve(success);
      };
      const loaded = () => finish(true), failed = () => finish(false);
      const timeout = setTimeout(() => finish(false), 6500);
      image.addEventListener('load', loaded, {once: true});
      image.addEventListener('error', failed, {once: true});
    });
  }
  function preload() {
    if (!preloadJob) preloadJob = Promise.all(images.map(imageReady)).then(results => {
      loads = results.filter(Boolean).length;
      failures = results.length - loads;
      root.classList.toggle('has-title-art', titleArt.naturalWidth > 0);
      return {loaded: loads, failed: failures};
    });
    return preloadJob;
  }
  titleArt.addEventListener('load', () => root.classList.add('has-title-art'));
  titleArt.addEventListener('error', () => root.classList.remove('has-title-art'));

  function resetAim() {
    cancelAnimationFrame(pointerFrame); pointerFrame = 0;
    aim = {x: 0, y: 0, lx: 50, ly: 42};
    root.style.setProperty('--deity-view-x', '0px');
    root.style.setProperty('--deity-view-y', '0px');
    primary.style.setProperty('--light-x', '50%');
    primary.style.setProperty('--light-y', '42%');
  }
  function updateLight() {
    const lit = selected || hovering || focusing;
    primary.classList.toggle('is-lit', lit);
    root.classList.toggle('is-communing', lit);
  }
  function setSelection(value) {
    selected = value;
    confirmed = false;
    primary.classList.toggle('is-selected', selected);
    primary.setAttribute('aria-pressed', String(selected));
    primary.querySelector('.deity-god-state').textContent = selected ? '已选择' : '可共鸣';
    confirm.disabled = !selected;
    confirm.textContent = '确认主神';
    root.classList.toggle('has-selection', selected);
    root.querySelector('.deity-detail-kicker').textContent = selected ? '已选择 · 共鸣之人' : '请选择共鸣之人';
    root.querySelector('#deity-detail-name').textContent = selected ? '红妆' : '红线所系，诸界相逢。';
    root.querySelector('#deity-detail-note').textContent = selected ? '红线已相系。' : '移向红妆，唤醒她的真容。';
    status.textContent = '';
    updateLight();
  }

  function drawFitted(context, image, rect, fit = 'contain') {
    if (!image.naturalWidth || !rect.width || !rect.height) return;
    const naturalWidth = image.naturalWidth, naturalHeight = image.naturalHeight;
    const scale = fit === 'cover' ? Math.max(rect.width / naturalWidth, rect.height / naturalHeight)
      : Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const width = naturalWidth * scale, height = naturalHeight * scale;
    const x = rect.x + (rect.width - width) / 2;
    const y = rect.y + (fit === 'cover' ? (rect.height - height) / 2 : rect.height - height);
    context.save();
    context.beginPath(); context.rect(rect.x, rect.y, rect.width, rect.height); context.clip();
    context.drawImage(image, x, y, width, height);
    context.restore();
  }
  function snapshot() {
    const bounds = root.getBoundingClientRect();
    const output = document.createElement('canvas');
    const scale = Math.min(1.3, 1600 / bounds.width);
    output.width = Math.round(bounds.width * scale);
    output.height = Math.round(bounds.height * scale);
    const context = output.getContext('2d');
    if (!context) return null;
    context.scale(scale, scale);
    context.fillStyle = '#070a0e'; context.fillRect(0, 0, bounds.width, bounds.height);
    const rectOf = image => {
      const r = image.getBoundingClientRect();
      return {x: r.left - bounds.left, y: r.top - bounds.top, width: r.width, height: r.height};
    };
    drawFitted(context, root.querySelector('.deity-backdrop'), rectOf(root.querySelector('.deity-backdrop')), 'cover');
    const shade = context.createLinearGradient(0, 0, 0, bounds.height);
    shade.addColorStop(0, 'rgba(2,4,8,.25)');
    shade.addColorStop(.42, 'rgba(2,4,8,0)');
    shade.addColorStop(1, 'rgba(2,3,7,.73)');
    context.fillStyle = shade; context.fillRect(0, 0, bounds.width, bounds.height);
    // Back-row silhouettes first, the red figure last: the DOM uses this same depth order.
    const figures = [...root.querySelectorAll('.deity-locked .deity-figure'), primary.querySelector('.deity-figure')];
    for (const image of figures) {
      context.save();
      const style = getComputedStyle(image);
      context.filter = style.filter;
      context.globalAlpha = Number(style.opacity);
      drawFitted(context, image, rectOf(image));
      context.restore();
    }
    return {image: output, width: bounds.width, height: bounds.height};
  }

  function ready(token) {
    if (token !== generation || !isOpen() || phase === 'ready') return;
    assembly = null;
    canvas.hidden = true;
    root.classList.remove('is-assembling');
    root.classList.toggle('motion-reduced', !motionAllowed());
    setPhase('ready');
    primary.disabled = false;
    root.setAttribute('aria-busy', 'false');
    root.focus({preventScroll: true});
    window.dispatchEvent(new CustomEvent('infinite:deityready', {detail: {available: ['hongzhuang'], locked: 6}}));
  }
  async function open() {
    if (isOpen()) return false;
    const token = ++generation;
    window.InfiniteTitle?.hide();
    hovering = focusing = false;
    setSelection(false);
    resetAim();
    root.classList.toggle('motion-reduced', !motionAllowed());
    root.hidden = false;
    canvas.hidden = true;
    primary.disabled = true;
    root.setAttribute('aria-busy', 'true');
    setPhase('announcing');
    root.focus({preventScroll: true});
    cue('brush-write', {gain: .7});
    const [waited] = await Promise.all([delay(motionAllowed() && !document.hidden ? 650 : 30), preload()]);
    if (!waited || token !== generation || !isOpen()) return false;
    if (!motionAllowed() || document.hidden) { ready(token); return true; }
    setPhase('assembling');
    root.classList.add('is-assembling');
    const frame = snapshot();
    if (!frame || typeof window.playDeityAssembly !== 'function') {
      ready(token);
      return true;
    }
    canvas.hidden = false;
    try {
      assembly = window.playDeityAssembly(canvas, frame.image, {
        width: frame.width, height: frame.height, reducedMotion: !motionAllowed(),
      });
      cue('menu-open', {gain: .55});
      const complete = await assembly.finished;
      if (token !== generation || !isOpen()) return false;
      if (!complete) { ready(token); return true; }
      ready(token);
    } catch { assembly?.cancel(); assembly = null; ready(token); }
    return true;
  }
  function close({returnToTitle = true} = {}) {
    if (!isOpen() && !launching) return false;
    ++generation;
    launching = false;
    cancelWaiting();
    assembly?.cancel(); assembly = null;
    resetAim();
    hovering = focusing = false;
    root.hidden = true;
    canvas.hidden = true;
    root.classList.remove('is-assembling');
    root.setAttribute('aria-busy', 'false');
    setPhase('hidden');
    window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail: {group: 'deity-space', fade: .1}}));
    if (returnToTitle) window.InfiniteTitle?.returnToTitle();
    return true;
  }

  primary.addEventListener('pointerenter', () => {
    if (phase !== 'ready') return;
    hovering = true; updateLight();
    if (!selected && !focusing) cue('ui-focus', {gain: .85, pan: -.2});
  });
  primary.addEventListener('pointerleave', () => { hovering = false; updateLight(); });
  primary.addEventListener('focus', () => {
    focusing = true; updateLight();
    if (phase === 'ready' && !selected && !hovering) cue('ui-focus', {gain: .85, pan: -.2});
  });
  primary.addEventListener('blur', () => { focusing = false; updateLight(); });
  primary.addEventListener('click', () => {
    if (phase !== 'ready') return;
    setSelection(true);
    status.textContent = '已选择红妆。';
  });
  confirm.addEventListener('click', () => {
    if (!selected || phase !== 'ready' || confirmed) return;
    confirmed = true;
    confirm.textContent = '已确认';
    status.textContent = '已选择 · 红妆';
    const event = new CustomEvent('infinite:deityselected', {cancelable: true, detail: {id: 'hongzhuang', name: '红妆'}});
    window.dispatchEvent(event);
  });
  back.addEventListener('click', () => close());
  root.addEventListener('contextmenu', event => event.preventDefault());
  root.addEventListener('dragstart', event => event.preventDefault());
  root.addEventListener('pointermove', event => {
    if (phase !== 'ready' || !motionAllowed() || document.hidden || event.pointerType === 'touch') return;
    const bounds = root.getBoundingClientRect(), subject = primary.getBoundingClientRect();
    aim = {
      x: ((event.clientX - bounds.left) / bounds.width - .5) * 8,
      y: ((event.clientY - bounds.top) / bounds.height - .5) * 5,
      lx: Math.max(10, Math.min(90, (event.clientX - subject.left) / subject.width * 100)),
      ly: Math.max(15, Math.min(85, (event.clientY - subject.top) / subject.height * 100)),
    };
    if (!pointerFrame) pointerFrame = requestAnimationFrame(() => {
      pointerFrame = 0;
      root.style.setProperty('--deity-view-x', `${aim.x.toFixed(2)}px`);
      root.style.setProperty('--deity-view-y', `${aim.y.toFixed(2)}px`);
      primary.style.setProperty('--light-x', `${aim.lx.toFixed(1)}%`);
      primary.style.setProperty('--light-y', `${aim.ly.toFixed(1)}%`);
    });
  }, {passive: true});
  root.addEventListener('pointerleave', resetAim);
  document.addEventListener('keydown', event => {
    if ((!isOpen() && !launching) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (phase === 'ready' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) {
      event.preventDefault(); primary.focus({preventScroll: true});
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    resetAim();
    hovering = focusing = false; updateLight();
    if (phase === 'assembling') {
      assembly?.cancel(); assembly = null;
      ready(generation);
    }
  });
  function updateMotion() {
    root.classList.toggle('motion-reduced', !motionAllowed());
    if (!motionAllowed()) {
      resetAim();
      if (phase === 'assembling') { assembly?.cancel(); assembly = null; ready(generation); }
    }
  }
  reduced.addEventListener('change', updateMotion);
  window.addEventListener('infinite:settings', updateMotion);
  window.addEventListener('infinite:settingssaved', updateMotion);
  window.addEventListener('infinite:title', () => { if (isOpen()) close({returnToTitle: false}); });
  window.addEventListener('pagehide', () => { if (isOpen()) close({returnToTitle: false}); });
  window.addEventListener('infinite:startgame', async event => {
    if (event.defaultPrevented || event.detail?.mode !== 'new' || typeof event.detail.playTransition !== 'function') return;
    event.preventDefault();
    if (launching || isOpen()) return;
    const token = ++generation;
    launching = true;
    preload();
    try {
      const complete = await event.detail.playTransition();
      if (token !== generation || !complete) return;
      launching = false;
      await open();
    } catch {
      if (token === generation) close();
    } finally { if (token === generation) launching = false; }
  });
  window.InfiniteDeitySpace = Object.freeze({
    open, close, preload,
    getState: () => ({phase, visible: !root.hidden, selected: selected ? 'hongzhuang' : null,
      confirmed, launching, loaded: loads, failed: failures, locked: 6,
      assembly: assembly?.getState?.() ?? null, pointerFrame: Boolean(pointerFrame)}),
  });
  preload();
})();
