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
      <div class="deity-tone"></div>
      <div class="deity-depth-haze"></div>
      <div class="deity-scene-light"></div>
    </div>
    <canvas id="deity-assembly" aria-hidden="true"></canvas>
    <canvas id="deity-return-wave" aria-hidden="true" hidden></canvas>
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
  let returnCanvas = root.querySelector('#deity-return-wave');
  const titleScreen = document.getElementById('title-screen');
  let canvas = root.querySelector('#deity-assembly');
  const status = root.querySelector('#deity-selection-status');
  const images = [...root.querySelectorAll('img')];
  const waiting = new Map();
  let generation = 0, phase = 'hidden', assembly = null, preloadJob = null;
  let selected = roster[0].id, confirmed = false, launching = false;
  let hovering = false, focusing = false;
  let loads = 0, failures = 0;
  let locationReveal = null, closing = null, restoringTitle = false;
  let avatarHoverTimer = 0, avatarHoverAt = -Infinity;

  const motionAllowed = () => !reduced.matches && window.InfiniteSettings?.getState().motion !== false;
  const isOpen = () => phase !== 'hidden';
  function cue(name, options = {}) {
    window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail: {name, group: 'deity-space', ...options}}));
  }
  function setPhase(value) {
    if (value !== 'ready') cancelAvatarFeedback();
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
      return Promise.resolve(window.DeityReturnCapture?.ready).then(() => ({loaded: loads, failed: failures}));
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
    // Retire the preserved final frame as soon as the real scene takes over.
    canvas.width = canvas.height = 1;
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
    root.classList.remove('location-written', 'is-returning');
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
    if (animated) { cue('deity-inscribe', {variation:false}); cue('deity-branch', {delay:.65, variation:false}); }
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
    try {
      // Prepare a fresh hidden surface: the previous WebGL drawing buffer held
      // a complete photograph which must never flash before the incoming cubes.
      const fresh = canvas.cloneNode(false);
      fresh.hidden = true;
      fresh.width = fresh.height = 1;
      canvas.replaceWith(fresh); canvas = fresh;
      assembly = window.playDeityAssembly(canvas, frame.image, {
        width: frame.width, height: frame.height, reducedMotion: !motionAllowed(),
      });
      canvas.hidden = false;
      cue('deity-cube-assemble', {variation:false});
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
    canvas.hidden = returnCanvas.hidden = true;
    root.classList.remove('is-returning', 'is-assembling');
    root.setAttribute('aria-busy', 'false');
    back.disabled = false;
    if (run) {
      clearTimeout(run.guard);
      run.player?.cancel();
      for (const frame of run.frames) frame.image.width = frame.image.height = 1;
    }
    returnCanvas.width = returnCanvas.height = 1;
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
    window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail:{group:'deity-return',fade:.1}}));
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
    let from = null;
    if (animated) {
      // Copy the actual spatial camera before setPhase disables its renderer.
      try { from = window.captureDeityReturnFrame?.(root, spatial?.captureSource() || backdrop); }
      catch { /* A missing compositor must never leave the return button inert. */ }
    }
    if (!animated || !from || !window.playDeityReturnWave) {
      resetAim(); finishClose(true);
      if (returnToTitle) showTitle();
      return true;
    }
    const run = closing = {id:`deity-${generation}`, player:null, frames:[from], guard:0, sounded:false};
    root.inert = true;
    back.disabled = confirm.disabled = true;
    choices.forEach(button => {button.disabled = true;});
    setPhase('closing');
    world.classList.add('deity-returning');
    titleScreen.classList.add('deity-restored');
    showTitle();
    titleScreen.inert = true;
    // The full title is already part of the destination texture: do not layer
    // the separate settings-return handwriting or its old sounds on this wave.
    signalReturn('start', {id:run.id, motion:true, presentation:'cube-wave', duration:2200});
    const finish = () => {if (closing === run) finishClose();};
    try {
      const to = window.captureTitleReturnFrame?.(world);
      if (!to) {finishClose(true); return true;}
      run.frames.push(to);
      // A fresh context lets a later visit recover from a WebGL context loss.
      const fresh = returnCanvas.cloneNode(false);
      returnCanvas.replaceWith(fresh); returnCanvas = fresh;
      returnCanvas.hidden = false;
      root.classList.add('is-returning');
      run.player = window.playDeityReturnWave(returnCanvas, from.image, to.image, {
        width:from.width, height:from.height, duration:2200,
        onProgress: progress => {
          if (closing !== run || run.sounded || progress >= 1) return;
          run.sounded = true;
          cue('deity-return-wave', {group:'deity-return', variation:false});
        },
      });
      run.player.finished.then(finish, finish);
      run.guard = setTimeout(finish, 2900);
    } catch {finishClose(true);}
    return true;
  }

  function cancelAvatarFeedback() {
    clearTimeout(avatarHoverTimer); avatarHoverTimer = 0;
    window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail:{group:'deity-hover',fade:.07}}));
  }
  function queueAvatarFeedback(button, dwell = 85) {
    clearTimeout(avatarHoverTimer);
    avatarHoverTimer = setTimeout(() => {
      avatarHoverTimer = 0;
      const now = performance.now();
      if (phase !== 'ready' || document.hidden || now - avatarHoverAt < 600
        || (!button.matches(':hover') && document.activeElement !== button)) return;
      avatarHoverAt = now;
      cue('deity-hover', {group:'deity-hover', pan:-.2, variation:false});
    }, dwell);
  }
  choices.forEach(button => {
    button.addEventListener('pointerenter', event => {
      if (phase !== 'ready' || event.pointerType === 'touch') return;
      hovering = true; updateLight();
      queueAvatarFeedback(button);
    });
    button.addEventListener('pointerleave', () => {
      clearTimeout(avatarHoverTimer); avatarHoverTimer = 0;
      hovering = false; updateLight();
    });
    button.addEventListener('focus', () => {
      focusing = true; updateLight();
      if (phase === 'ready' && !hovering && button.matches(':focus-visible')) queueAvatarFeedback(button, 0);
    });
    button.addEventListener('blur', () => { focusing = false; updateLight(); if (!hovering) cancelAvatarFeedback(); });
    button.addEventListener('click', () => {
      if (phase !== 'ready') return;
      cancelAvatarFeedback();
      cue('deity-select', {group:'deity-ui', pan:-.2});
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
    cue('deity-confirm', {group:'deity-ui'});
    window.dispatchEvent(new CustomEvent('infinite:deityselected', {
      cancelable: true, detail: {id: deity.id, name: deity.name},
    }));
  });
  function requestReturn() {
    if (closing) return;
    cue('deity-back', {group:'deity-ui'});
    close();
  }
  back.addEventListener('click', requestReturn);
  root.addEventListener('contextmenu', event => event.preventDefault());
  root.addEventListener('dragstart', event => event.preventDefault());
  document.addEventListener('keydown', event => {
    if ((!isOpen() && !launching) || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); requestReturn(); }
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
      cancelAvatarFeedback();
      if (closing) {finishClose(true); return;}
      window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail:{group:'deity-space',fade:.08}}));
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
      window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail:{group:'deity-space',fade:.08}}));
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
      spatial: spatial?.getState() ?? null, closing:Boolean(closing), returnWave:closing?.player?.getState() ?? null, writing:Boolean(locationReveal)}),
  });
  preload();
})();
