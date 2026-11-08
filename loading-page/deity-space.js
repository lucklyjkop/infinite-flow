/* A complete, cancelable handoff from the title photograph to the pantheon. */
(() => {
  'use strict';
  const world = document.getElementById('world');
  if (!world) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  // Only available characters belong in the roster. Add future entries here.
  const roster = [{id: 'hongzhuang', name: '红妆', image: 'assets/deity-space/nai-avatar.webp',
    title: '红线相系', description: '一袭红妆，静候与你相逢。'}];
  const root = document.createElement('section');
  root.id = 'deity-space';
  root.className = 'deity-space';
  root.hidden = true;
  root.tabIndex = -1;
  root.setAttribute('aria-labelledby', 'deity-location');
  root.innerHTML = `
    <div class="deity-view" aria-hidden="true">
      <img class="deity-backdrop" src="assets/deity-space/nai-scene.webp" alt="" draggable="false" decoding="async">
      <canvas id="deity-spatial" class="deity-spatial-surface"></canvas>
      <canvas id="deity-spatial-fallback" class="deity-spatial-surface"></canvas>
      <canvas id="deity-freeze" hidden></canvas>
      <div class="deity-tone"></div>
      <div class="deity-depth-haze"></div>
      <div class="deity-scene-light"></div>
    </div>
    <canvas id="deity-assembly" aria-hidden="true"></canvas>
    <header class="deity-location">
      <h1 id="deity-location"><span class="deity-heading-words">主神空间</span><img src="assets/deity-space/location-title.webp" alt="" draggable="false" decoding="async"></h1>
      <div class="deity-location-branch"><img src="assets/menu-ui/sakura-branch.webp" alt="" draggable="false" decoding="async"></div>
    </header>
    <button id="deity-return" class="deity-return" type="button"><span class="deity-return-arrow" aria-hidden="true">←</span><span>返回标题</span></button>
    <aside class="deity-roster" aria-labelledby="deity-roster-title">
      <header class="deity-roster-heading"><span class="deity-roster-rule" aria-hidden="true"></span><h2 id="deity-roster-title">选择主神</h2></header>
      <div class="deity-roster-list" role="group" aria-label="可选择的主神">
        ${roster.map(deity => `<button id="deity-${deity.id}" class="deity-choice" type="button" data-deity-id="${deity.id}" aria-pressed="false" aria-label="选择${deity.name}">
          <span class="deity-avatar"><span class="deity-avatar-window"><img src="${deity.image}" alt="" draggable="false" decoding="async"></span><span class="deity-avatar-border" aria-hidden="true"></span></span>
          <span class="deity-choice-name">${deity.name}</span><span class="deity-choice-state" aria-hidden="true">已选择</span>
        </button>`).join('')}
      </div>
      <div class="deity-detail">
        <p class="deity-detail-kicker">红线相系</p><h2 id="deity-detail-name">红妆</h2>
        <p id="deity-detail-note">一袭红妆，静候与你相逢。</p>
      </div>
      <button id="deity-confirm" class="deity-confirm" type="button"><span>确认主神</span></button>
      <p id="deity-selection-status" class="deity-selection-status" role="status" aria-live="polite"></p>
    </aside>
    <p class="deity-controls" aria-hidden="true">选择头像切换主神<span>ESC 返回</span></p>`;
  world.appendChild(root);

  const choices = [...root.querySelectorAll('.deity-choice')];
  const backdrop = root.querySelector('.deity-backdrop');
  const spatial = window.SpatialPhoto ? new window.SpatialPhoto(root, backdrop,
    root.querySelector('#deity-spatial'), root.querySelector('#deity-spatial-fallback'), {
      urls: ['assets/deity-space/nai-plate.webp', 'assets/deity-space/nai-portrait.webp'],
    }) : null;
  const back = root.querySelector('#deity-return');
  const confirm = root.querySelector('#deity-confirm');
  const titleArt = root.querySelector('.deity-location img');
  const locationBranch = root.querySelector('.deity-location-branch img');
  const frozen = root.querySelector('#deity-freeze');
  const titleScreen = document.getElementById('title-screen');
  const canvas = root.querySelector('#deity-assembly');
  const status = root.querySelector('#deity-selection-status');
  const images = [...root.querySelectorAll('img')];
  const waiting = new Map();
  let generation = 0, phase = 'hidden', assembly = null, preloadJob = null;
  let selected = roster[0].id, confirmed = false, launching = false;
  let hovering = false, focusing = false;
  let loads = 0, failures = 0;
  let locationReveal = null, closing = null, restoringTitle = false;

  const motionAllowed = () => !reduced.matches && window.InfiniteSettings?.getState().motion !== false;
  const isOpen = () => phase !== 'hidden';
  function cue(name, options = {}) {
    window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail: {name, group: 'deity-space', ...options}}));
  }
  function setPhase(value) {
    phase = value;
    root.dataset.phase = value;
    if (value !== 'hidden' && value !== 'closing') world.dataset.state = value === 'ready' ? 'deity' : 'deity-arriving';
    syncSpatial();
  }
  function syncSpatial() {
    spatial?.setEnabled(phase === 'ready' && !root.hidden && motionAllowed() && !document.hidden);
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
    spatial?.reset();
  }
  function updateLight() {
    root.classList.toggle('is-peering', hovering || focusing);
    root.classList.toggle('is-communing', Boolean(selected));
  }
  function setSelection(id, reset = false) {
    const deity = roster.find(item => item.id === id);
    if (!deity) return;
    const changed = selected !== id;
    selected = id;
    if (changed || reset) confirmed = false;
    choices.forEach(button => {
      const active = button.dataset.deityId === selected;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    confirm.disabled = phase !== 'ready' || confirmed;
    confirm.querySelector('span').textContent = confirmed ? '已确认' : '确认主神';
    root.querySelector('.deity-detail-kicker').textContent = deity.title;
    root.querySelector('#deity-detail-name').textContent = deity.name;
    root.querySelector('#deity-detail-note').textContent = deity.description;
    status.textContent = confirmed ? `已确认 · ${deity.name}` : '';
    updateLight();
  }

  function drawFitted(context, image, rect) {
    if (!image.naturalWidth || !rect.width || !rect.height) return;
    const style = getComputedStyle(image);
    const fit = style.objectFit;
    const naturalWidth = image.naturalWidth, naturalHeight = image.naturalHeight;
    const scale = fit === 'cover' ? Math.max(rect.width / naturalWidth, rect.height / naturalHeight)
      : Math.min(rect.width / naturalWidth, rect.height / naturalHeight);
    const width = naturalWidth * scale, height = naturalHeight * scale;
    const alignment = (token, spare) => {
      if (token === 'left' || token === 'top') return 0;
      if (token === 'right' || token === 'bottom') return spare;
      if (token?.endsWith('%')) return spare * parseFloat(token) / 100;
      if (token?.endsWith('px')) return parseFloat(token);
      return spare / 2;
    };
    const [posX, posY] = style.objectPosition.split(/\s+/);
    const x = rect.x + alignment(posX, rect.width - width);
    const y = rect.y + alignment(posY, rect.height - height);
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
    drawFitted(context, backdrop, rectOf(backdrop));
    const shade = context.createLinearGradient(0, 0, 0, bounds.height);
    shade.addColorStop(0, 'rgba(2,4,8,.25)');
    shade.addColorStop(.42, 'rgba(2,4,8,0)');
    shade.addColorStop(1, 'rgba(2,3,7,.73)');
    context.fillStyle = shade; context.fillRect(0, 0, bounds.width, bounds.height);
    const sideShade = context.createLinearGradient(0, 0, bounds.width, 0);
    sideShade.addColorStop(0, 'rgba(9,11,16,.7)');
    sideShade.addColorStop(.3, 'rgba(9,11,16,.45)');
    sideShade.addColorStop(.57, 'rgba(9,11,16,0)');
    sideShade.addColorStop(1, 'rgba(9,11,16,0)');
    context.fillStyle = sideShade; context.fillRect(0, 0, bounds.width, bounds.height);
    return {image: output, width: bounds.width, height: bounds.height};
  }

  function ready(token) {
    if (token !== generation || !isOpen() || phase === 'ready') return;
    assembly = null;
    canvas.hidden = true;
    root.classList.remove('is-assembling');
    root.classList.toggle('motion-reduced', !motionAllowed());
    spatial?.refresh();
    setPhase('ready');
    back.disabled = false;
    choices.forEach(button => { button.disabled = false; });
    confirm.disabled = confirmed;
    root.setAttribute('aria-busy', 'false');
    root.focus({preventScroll: true});
    window.dispatchEvent(new CustomEvent('infinite:deityready', {detail: {available: roster.map(item => item.id), locked: 0}}));
  }
  async function open() {
    if (isOpen()) return false;
    const token = ++generation;
    window.InfiniteTitle?.hide();
    titleScreen.classList.remove('deity-restored');
    hovering = focusing = false;
    setSelection(selected || roster[0].id, true);
    resetAim();
    root.classList.toggle('motion-reduced', !motionAllowed());
    root.hidden = false;
    root.inert = false;
    root.classList.remove('location-written', 'is-frozen');
    back.disabled = false;
    canvas.hidden = true;
    choices.forEach(button => { button.disabled = true; });
    confirm.disabled = true;
    root.setAttribute('aria-busy', 'true');
    setPhase('announcing');
    root.focus({preventScroll: true});
    await preload();
    if (token !== generation || !isOpen()) return false;
    const animated = motionAllowed() && !document.hidden;
    if (animated) { cue('brush-write', {gain: .68}); cue('branch-grow', {gain: .4, delay: .65}); }
    const writing = window.playDeityLocationReveal?.(root, titleArt, locationBranch, {motion:animated});
    locationReveal = writing ?? null;
    if (!writing) root.classList.add('location-written');
    const written = writing ? await writing.finished : await delay(animated ? 700 : 0);
    if (locationReveal === writing) locationReveal = null;
    if (!written || token !== generation || !isOpen()) return false;
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
  function signalReturn(type, detail) {
    window.dispatchEvent(new CustomEvent(`infinite:deityreturn${type}`, {detail}));
  }
  function freezeView() {
    const bounds = root.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.25);
    frozen.width = Math.max(1, Math.round(bounds.width * dpr));
    frozen.height = Math.max(1, Math.round(bounds.height * dpr));
    const context = frozen.getContext('2d', {alpha:false});
    if (!context) return false;
    const source = spatial?.captureSource() || backdrop;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (source === backdrop) drawFitted(context, source, {x:0,y:0,width:bounds.width,height:bounds.height});
    else context.drawImage(source, 0, 0, bounds.width, bounds.height);
    frozen.hidden = false;
    root.classList.add('is-frozen');
    return true;
  }
  function showTitle() {
    restoringTitle = true;
    try { window.InfiniteTitle?.returnToTitle(); }
    finally { restoringTitle = false; }
  }
  function finishClose(immediate = false) {
    const run = closing;
    closing = null;
    root.hidden = true;
    root.inert = false;
    canvas.hidden = frozen.hidden = true;
    frozen.width = frozen.height = 1;
    root.classList.remove('is-frozen', 'is-assembling');
    root.setAttribute('aria-busy', 'false');
    back.disabled = false;
    if (run) {
      clearTimeout(run.guard);
      run.animations.forEach(animation => animation.cancel());
    }
    setPhase('hidden');
    hovering = focusing = false; updateLight();
    world.classList.remove('deity-returning');
    if (run) {
      titleScreen.inert = false;
      signalReturn('end', {id:run.id, immediate});
      if (world.dataset.state === 'title' && !document.hidden && !document.querySelector('dialog[open]')) {
        titleScreen.querySelector('[data-menu-action="new"]')?.focus({preventScroll:true});
      }
    }
    window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail:{group:'deity-space',fade:.1}}));
  }
  function close({returnToTitle = true, immediate = false} = {}) {
    if (!isOpen() && !launching) return false;
    if (closing) {
      if (immediate || !returnToTitle) finishClose(true);
      return false;
    }
    const animated = returnToTitle && !immediate && phase === 'ready' && motionAllowed() && !document.hidden;
    ++generation;
    launching = false;
    cancelWaiting();
    locationReveal?.cancel(); locationReveal = null;
    assembly?.cancel(); assembly = null;
    window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail: {group: 'deity-space', fade: .1}}));
    if (!animated || !freezeView()) {
      resetAim(); finishClose(true);
      if (returnToTitle) showTitle();
      return true;
    }
    // Keep the exact displayed camera pose while its live renderer returns to
    // zero. The compositor fades this frozen scene over the restored title.
    const run = closing = {id:`deity-${generation}`, animations:[], guard:0};
    root.inert = true;
    back.disabled = confirm.disabled = true;
    choices.forEach(button => {button.disabled = true;});
    setPhase('closing');
    world.classList.add('deity-returning');
    titleScreen.classList.add('deity-restored');
    showTitle();
    titleScreen.inert = true;
    cue('menu-close', {gain:.65});
    signalReturn('start', {id:run.id, motion:true, duration:780});
    const animate = (element, frames, duration) => {
      const animation = element.animate(frames, {duration, easing:'cubic-bezier(.22,.61,.28,1)', fill:'both'});
      run.animations.push(animation);
      return animation.finished.catch(() => {});
    };
    const fades = [
      animate(root, [{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.988)'}], 780),
      animate(root.querySelector('.deity-location'), [{opacity:1,translate:'0 0'},{opacity:0,translate:'0 -6px'}], 330),
      animate(root.querySelector('.deity-roster'), [{opacity:1},{opacity:0}], 280),
    ];
    const finish = () => {if (closing === run) finishClose();};
    Promise.all(fades).then(finish);
    run.guard = setTimeout(finish, 1050);
    return true;
  }

  choices.forEach(button => {
    button.addEventListener('pointerenter', () => {
      if (phase !== 'ready') return;
      hovering = true; updateLight();
      if (!focusing) cue('ui-focus', {gain: .75, pan: -.2});
    });
    button.addEventListener('pointerleave', () => { hovering = false; updateLight(); });
    button.addEventListener('focus', () => {
      focusing = true; updateLight();
      if (phase === 'ready' && !hovering) cue('ui-focus', {gain: .75, pan: -.2});
    });
    button.addEventListener('blur', () => { focusing = false; updateLight(); });
    button.addEventListener('click', () => {
      if (phase !== 'ready') return;
      setSelection(button.dataset.deityId);
    });
  });
  confirm.addEventListener('click', () => {
    if (!selected || phase !== 'ready' || confirmed) return;
    confirmed = true;
    confirm.disabled = true;
    confirm.querySelector('span').textContent = '已确认';
    const deity = roster.find(item => item.id === selected);
    status.textContent = `已确认 · ${deity.name}`;
    cue('ui-save', {gain: .7});
    window.dispatchEvent(new CustomEvent('infinite:deityselected', {
      cancelable: true, detail: {id: deity.id, name: deity.name},
    }));
  });
  back.addEventListener('click', () => close());
  root.addEventListener('contextmenu', event => event.preventDefault());
  root.addEventListener('dragstart', event => event.preventDefault());
  document.addEventListener('keydown', event => {
    if ((!isOpen() && !launching) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); }
    else if (phase === 'ready' && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home'].includes(event.key)) {
      event.preventDefault();
      const current = choices.indexOf(document.activeElement);
      const step = ['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1;
      const next = event.key === 'Home' ? 0 : (current + step + choices.length) % choices.length;
      choices[next].focus({preventScroll: true});
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (closing) {finishClose(true); return;}
      locationReveal?.finish();
      resetAim();
      hovering = focusing = false; updateLight();
      if (phase === 'assembling') {
        assembly?.cancel(); assembly = null;
        ready(generation);
      }
    }
    syncSpatial();
  });
  function updateMotion() {
    root.classList.toggle('motion-reduced', !motionAllowed());
    if (!motionAllowed()) {
      if (closing) {finishClose(true); return;}
      locationReveal?.finish();
      resetAim();
      if (phase === 'assembling') { assembly?.cancel(); assembly = null; ready(generation); }
    }
    syncSpatial();
  }
  reduced.addEventListener('change', updateMotion);
  window.addEventListener('infinite:settings', updateMotion);
  window.addEventListener('infinite:settingssaved', updateMotion);
  window.addEventListener('infinite:title', () => { if (isOpen() && !restoringTitle) close({returnToTitle:false, immediate:true}); });
  window.addEventListener('pagehide', () => { if (isOpen()) close({returnToTitle:false, immediate:true}); });
  window.addEventListener('resize', () => {if (closing) finishClose(true);}, {passive:true});
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
    getState: () => ({phase, visible: !root.hidden, selected,
      confirmed, launching, loaded: loads, failed: failures, locked: 0, available: roster.map(item => item.id),
      assembly: assembly?.getState?.() ?? null, pointerFrame: Boolean(spatial?.getState().moving),
      spatial: spatial?.getState() ?? null, closing:Boolean(closing), writing:Boolean(locationReveal)}),
  });
  preload();
})();
