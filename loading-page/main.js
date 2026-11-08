(() => {
  'use strict';
  const world = document.getElementById('world');
  const inkStage = document.getElementById('ink-reveal');
  const ink = window.InkReveal && inkStage ? new window.InkReveal(inkStage) : null;
  world.addEventListener('contextmenu', event => {
    const target = event.target;
    if (target.matches('.world, .title-screen, .vignette') ||
        target.closest('.scene, .title-composition, .reveal, canvas')) event.preventDefault();
  });
  const art = document.getElementById('world-art');
  const glass = window.GlassRain ? new window.GlassRain(document.getElementById('glass-rain'), art) : null;
  const spatial = window.SpatialPhoto ? new window.SpatialPhoto(world, art, document.getElementById('spatial-art'), document.getElementById('spatial-layers')) : null;
  const backgroundSource = art.getAttribute('src');
  const backgroundFallback = 'assets/hongzhuang-nai-v3-4k.jpg';
  const bootMessage = document.getElementById('boot-message');
  const bootText = document.getElementById('boot-text');
  const retryButton = document.getElementById('retry');
  const number = document.getElementById('progress-number');
  const progress = document.getElementById('progress');
  const fan = window.LoadingFan ? new window.LoadingFan(document.getElementById('loading-fan')) : null;
  const titlePreview = new URLSearchParams(location.search).get('screen') === 'title';
  const boughs = !titlePreview && window.LoadingBoughs ? new window.LoadingBoughs(document.getElementById('loading-boughs')) : null;
  const status = document.getElementById('status-text');
  const media = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (!titlePreview && !media.matches) ink?.prepare();
  const petals = window.PetalField ? new window.PetalField(document.getElementById('petals'), { reducedMotion: media.matches }) : null;
  const rain = window.RainField ? new window.RainField(document.getElementById('rain'), document.getElementById('rain-impact'), {
    reducedMotion: media.matches,
    getSurfaces() {
      const screen = document.getElementById('title-screen');
      if (world.dataset.state !== 'title' || screen.hidden || document.querySelector('dialog[open]')) return [];
      if (Number(getComputedStyle(screen).opacity) < .2) return [];
      const origin = document.getElementById('rain-impact').getBoundingClientRect();
      return [...document.querySelectorAll('#title-menu button')].map(button => {
        const rect = button.getBoundingClientRect();
        return { id: button.dataset.menuAction, x: rect.left - origin.left + 12, y: rect.top - origin.top + 6, width: rect.width - 24 };
      });
    },
  }) : null;
  const demoDuration = 4200;
  const demoLeadIn = 400;
  const rainFadeInAt = 2000; // Matches the existing CSS delay before the rain becomes visible.
  const stages = [
    { at: 0, text: '正在定位世界坐标' },
    { at: 24, text: '正在唤醒万象之境' },
    { at: 57, text: '正在编织命运红线' },
    { at: 84, text: '正在开启轮回之门' },
    { at: 100, text: '世界已就绪' },
  ];
  let elapsed = 0;
  let previous = 0;
  let raf = 0;
  let stage = -1;
  let lastPercent = -1;
  let manualPaused = media.matches;
  let requestedMotion = true;
  let external = false;
  let loaded = false;
  let assetRequest = 0;
  let cancelImageWait = null;
  let reloadOnRetry = false;
  let pendingProgress = 0;
  let titleTimer = 0;
  let playback = 0;
  let finishNow = null;

  function stopTitleSound() {
    window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail: {group: 'title-entrance', fade: .06}}));
  }

  function enterTitle() {
    if (world.dataset.state !== 'ready') return;
    ink?.finish();
    world.classList.add('title-active');
    world.classList.toggle('title-unfold', !titlePreview && !manualPaused && !document.hidden);
    document.getElementById('loading').setAttribute('aria-hidden', 'true');
    window.InfiniteTitle?.show();
    if (!titlePreview && !document.hidden) {
      const cue = (name, delay, gain) => window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail: {name, delay, gain, group: 'title-entrance', pan: -.3}}));
      if (!manualPaused) {
        cue('brush-write', 0, .55);
        cue('branch-grow', .12, .32);
      }
      cue('menu-open', manualPaused ? 0 : .28, .5);
    }
    petals?.setIntensity(.85);
    applyMotion();
  }

  function finishLoading(run) {
    const show = () => {
      if (run !== playback || finishNow !== show || world.dataset.state !== 'ready') return;
      clearTimeout(titleTimer);
      titleTimer = 0;
      finishNow = null;
      fan?.reset?.();
      boughs?.clear();
      enterTitle();
    };
    finishNow = show;
    if (titlePreview || document.hidden) {
      queueMicrotask(show);
      return;
    }

    // Both the fan shatter and the travelling embers finish before the menu opens.
    titleTimer = setTimeout(show, 3200);
    Promise.allSettled([fan, boughs].map(async effect => effect?.finish())).then(show);
  }

  function setProgress(value) {
    const percent = Math.max(0, Math.min(100, Number(value) || 0));
    fan?.setProgress(percent / 100);
    boughs?.setProgress(percent);
    const rounded = Math.floor(percent);
    if (rounded !== lastPercent) {
      number.textContent = rounded;
      progress.setAttribute('aria-valuenow', rounded);
      lastPercent = rounded;
    }
    const nextStage = stages.reduce((result, item, i) => percent >= item.at ? i : result, 0);
    if (nextStage !== stage) {
      stage = nextStage;
      status.textContent = stages[stage].text;
    }
    if (percent >= 100 && world.dataset.state === 'loading') {
      const run = playback;
      world.dataset.state = 'ready';
      window.dispatchEvent(new CustomEvent('infinite:ready'));
      if (run === playback && world.dataset.state === 'ready') finishLoading(run);
    }
  }

  function frame(now) {
    if (!previous) previous = now;
    const before = elapsed;
    elapsed += Math.min(now - previous, 100);
    previous = now;
    if (before < rainFadeInAt && elapsed >= rainFadeInAt) applyMotion();
    if (!external) {
      // Cinematic preview timeline. Production may supply real resource progress below.
      setProgress(100 * (elapsed - demoLeadIn) / demoDuration);
    }
    if (world.dataset.state === 'loading') raf = requestAnimationFrame(frame);
  }

  function syncGlass() {
    const state = world.dataset.state;
    const showing = state === 'title' || ((state === 'loading' || state === 'ready') && elapsed >= rainFadeInAt);
    if (showing && loaded && !manualPaused && !document.hidden && !document.querySelector('dialog[open]')) glass?.start();
    else glass?.stop();
  }

  function applyMotion() {
    ink?.setPlayback(manualPaused, document.hidden);
    if (manualPaused || document.hidden) world.classList.remove('title-unfold');
    world.classList.toggle('is-paused', manualPaused);
    world.classList.toggle('reduced-motion', media.matches);
    world.classList.toggle('is-hidden', document.hidden);
    fan?.setReducedMotion(manualPaused);
    boughs?.setMotion(!manualPaused && !document.hidden);
    if (document.hidden) finishNow?.();
    petals?.setReducedMotion(media.matches);
    rain?.setReducedMotion(media.matches);
    const state = world.dataset.state;
    const backstage = ['exited', 'start-ended', 'deity-arriving', 'deity'].includes(state);
    // A warm camera can track during a replay. The first full-resolution GL
    // upload waits for the menu entrance to finish instead of stalling the opening.
    const canUseCamera = spatial?.renderer || (state === 'title' && !world.classList.contains('title-unfold'));
    spatial?.setEnabled(!manualPaused && !document.hidden && loaded && !backstage && state !== 'starting' && canUseCamera);
    if (manualPaused || document.hidden || !loaded || backstage) {
      petals?.stop();
      rain?.stop();
    } else {
      petals?.start();
      if (state !== 'loading' || elapsed >= rainFadeInAt) rain?.start();
      else if (rain?.running) rain.stop();
    }
    syncGlass();
  }

  function replay() {
    if (!loaded) return;
    stopTitleSound();
    playback++;
    finishNow = null;
    cancelAnimationFrame(raf);
    clearTimeout(titleTimer);
    fan?.reset?.();
    window.InfiniteTitle?.hide();
    world.classList.remove('title-active', 'title-unfold');
    document.getElementById('loading').removeAttribute('aria-hidden');
    world.classList.remove('is-running');
    world.classList.toggle('demo-loading', !external);
    world.dataset.state = 'loading';
    boughs?.reset();
    elapsed = 0;
    previous = 0;
    stage = -1;
    lastPercent = -1;
    setProgress(external ? pendingProgress : 0);
    void world.offsetWidth;
    ink?.start(titlePreview, manualPaused);
    world.classList.add('is-running');
    applyMotion();
    petals?.setIntensity(.85);
    raf = requestAnimationFrame(frame);
  }

  function waitForArtwork(src) {
    return new Promise(resolve => {
      function finish(ok) {
        art.removeEventListener('load', onLoad);
        art.removeEventListener('error', onError);
        cancelImageWait = null;
        resolve(ok);
      }
      const onLoad = () => finish(art.naturalWidth > 0);
      const onError = () => finish(false);
      cancelImageWait = onError;
      art.addEventListener('load', onLoad);
      art.addEventListener('error', onError);
      if (src) art.src = src;
      // A cached image may have finished before deferred scripts run.
      if (art.complete) onLoad();
    });
  }

  function reportBootIssue(message, reload = false) {
    reloadOnRetry = reload;
    bootText.textContent = message;
    retryButton.textContent = reload ? '重新打开' : '重新加载';
    bootMessage.hidden = false;
  }

  async function boot(retryImage = false) {
    const request = ++assetRequest;
    cancelImageWait?.();
    reloadOnRetry = false;
    bootMessage.hidden = true;
    const query = retryImage ? '?retry=' + request : '';
    // A slow image can still finish after the notice. Keep its load listener alive.
    const timer = setTimeout(() => reportBootIssue('正在等待背景图片…'), 12000);
    try {
      let ready = await waitForArtwork(retryImage ? backgroundSource + query : null);
      if (!ready && request === assetRequest) ready = await waitForArtwork(backgroundFallback + query);
      if (request !== assetRequest) return;
      if (!ready) {
        reportBootIssue('背景图片载入失败');
        return;
      }
    } finally { clearTimeout(timer); }
    bootMessage.hidden = true;
    if (!window.InfiniteTitle) {
      reportBootIssue('标题菜单脚本未能载入', true);
      return;
    }
    loaded = true;
    if (titlePreview) {
      external = true;
      pendingProgress = 100;
      world.classList.add('skip-intro');
    }
    try {
      replay();
    } catch (error) {
      loaded = false;
      world.classList.remove('is-running');
      world.dataset.state = 'boot';
      console.error('Game opening failed to initialize', error);
      reportBootIssue('开场画面初始化失败', true);
    }
  }

  retryButton.addEventListener('click', () => {
    if (reloadOnRetry) location.reload();
    else boot(true);
  });
  document.addEventListener('visibilitychange', () => {
    cancelAnimationFrame(raf);
    previous = 0;
    if (!document.hidden && world.dataset.state === 'loading') raf = requestAnimationFrame(frame);
    applyMotion();
  });
  media.addEventListener('change', () => { manualPaused = media.matches || !requestedMotion; applyMotion(); });
  window.addEventListener('infinite:settings', event => {
    requestedMotion = event.detail.motion;
    manualPaused = media.matches || !requestedMotion;
    spatial?.refresh();
    applyMotion();
  });
  window.addEventListener('infinite:exit', applyMotion);
  window.addEventListener('infinite:exit', stopTitleSound);
  window.addEventListener('infinite:starttransition', stopTitleSound);
  window.addEventListener('infinite:starttransition', applyMotion);
  window.addEventListener('infinite:starttransitionend', applyMotion);
  document.getElementById('rain').addEventListener('transitionend', event => {
    if (world.dataset.state === 'starting' && event.propertyName === 'opacity') {
      rain?.stop();
      petals?.stop();
    }
  });
  window.addEventListener('infinite:returntitle', applyMotion);
  document.getElementById('title-menu').addEventListener('animationend', event => {
    if (event.animationName === 'menu-row-in' && event.target.dataset.menuAction === 'exit') {
      world.classList.remove('title-unfold');
      applyMotion();
    }
  });
  const dialogVisibility = new MutationObserver(syncGlass);
  // Each scene owns its effects; stop title rain and camera before deity assembly.
  new MutationObserver(applyMotion).observe(world, {attributes: true, attributeFilter: ['data-state']});
  document.querySelectorAll('dialog').forEach(dialog => {
    dialogVisibility.observe(dialog, {attributes:true, attributeFilter:['open']});
  });
  window.addEventListener('pagehide', () => { petals?.stop(); rain?.stop(); glass?.stop(); spatial?.setEnabled(false); });
  window.addEventListener('pageshow', applyMotion);
  window.InfiniteWeather = Object.freeze({
    getState() { return { rain: rain?.getState(), petals: petals?.getState(), glass: glass?.getState() }; },
  });
  window.InfiniteSpatial = Object.freeze({
    getState: () => spatial?.getState(),
    captureSource: () => spatial?.captureSource(),
  });
  // Integration seam: call useExternalProgress() before the first animation frame,
  // then updateProgress(0..100) from the game's actual resource loader.
  function useExternalProgress() {
    if (external) return;
    external = true;
    world.classList.remove('demo-loading');
  }
  window.InfiniteLoading = Object.freeze({
    replay,
    useExternalProgress,
    updateProgress(value) {
      useExternalProgress();
      pendingProgress = Math.max(0, Math.min(100, Number(value) || 0));
      if (loaded && world.dataset.state === 'loading') setProgress(pendingProgress);
    },
    getState() { return { state: world.dataset.state, progress: lastPercent, motionPaused: manualPaused, demo: !external }; },
  });
  applyMotion();
  // The title menu is a later deferred script. Cached / file:// art can be ready immediately.
  if (document.readyState === 'complete') boot();
  else document.addEventListener('DOMContentLoaded', () => boot(), {once: true});
})();
