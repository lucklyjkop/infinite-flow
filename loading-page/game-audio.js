/* Recorded title/folio foley and independently synthesized deity material sounds.
   Fetching is silent. The AudioContext is only created by a real user gesture. */
(() => {
  'use strict';
  const world = document.getElementById('world');
  if (!world) return;
  const bank = {
    'rain-loop': {bus: 'ambience', gain: .5, interval: 0, vary: 0},
    'fire-burn': {bus: 'effects', gain: .53, interval: 160, vary: .025},
    'branch-grow': {bus: 'effects', gain: .46, interval: 120, vary: .035},
    'brush-write': {bus: 'effects', gain: .42, interval: 90, vary: .025},
    'menu-open': {bus: 'effects', gain: .47, interval: 130, vary: .03},
    'menu-close': {bus: 'effects', gain: .43, interval: 130, vary: .03},
    'dice-land': {bus: 'dice', gain: .58, interval: 35, vary: .055},
    'ui-tap': {bus: 'effects', gain: .48, interval: 65, vary: .045},
    'ui-tab': {bus: 'effects', gain: .38, interval: 75, vary: .045},
    'ui-toggle-on': {bus: 'effects', gain: .5, interval: 65, vary: .025},
    'ui-toggle-off': {bus: 'effects', gain: .46, interval: 65, vary: .025},
    'ui-slider': {bus: 'effects', gain: .32, interval: 110, vary: .025},
    'ui-select-open': {bus: 'effects', gain: .43, interval: 90, vary: .03},
    'ui-select': {bus: 'effects', gain: .46, interval: 75, vary: .035},
    'ui-save': {bus: 'effects', gain: .52, interval: 200, vary: .015},
    'ui-back': {bus: 'effects', gain: .4, interval: 100, vary: .03},
    'ui-focus': {bus: 'effects', gain: .28, interval: 65, vary: .025},
    // The cube journey has original waveforms; never alias these to folio/title cues.
    'start-cube-wave': {bus: 'effects', gain: .9, interval: 150, vary: 0},
    'start-cube-fracture': {bus: 'effects', gain: .85, interval: 150, vary: 0},
    'deity-cube-assemble': {bus: 'effects', gain: .9, interval: 150, vary: 0},
    'deity-return-wave': {bus: 'effects', gain: .9, interval: 150, vary: 0},
    'deity-inscribe': {bus: 'effects', gain: 1, interval: 100, vary: 0},
    'deity-branch': {bus: 'effects', gain: 1, interval: 100, vary: 0},
    'deity-hover': {bus: 'effects', gain: 1, interval: 600, vary: 0, revision: 'soft-fibre-2'},
    'deity-select': {bus: 'effects', gain: 1, interval: 100, vary: .018},
    'deity-confirm': {bus: 'effects', gain: .9, interval: 200, vary: 0},
    'deity-back': {bus: 'effects', gain: 1, interval: 100, vary: 0},
    // Spatial navigation uses short resonant material cues, separate from paper controls.
    'system-ui-focus': {bus: 'effects', gain: .85, interval: 180, vary: 0},
    'system-ui-select': {bus: 'effects', gain: .9, interval: 80, vary: .015},
    'system-ui-back': {bus: 'effects', gain: .85, interval: 100, vary: 0},
    'system-ui-send': {bus: 'effects', gain: .9, interval: 140, vary: 0},
    // The world map has its own mineral gestures, never aliases of the title tide.
    'world-tectonic-rise': {bus: 'effects', gain: .95, interval: 250, vary: 0},
    'world-tectonic-fold': {bus: 'effects', gain: .9, interval: 250, vary: 0},
    'world-node-focus': {bus: 'effects', gain: .85, interval: 220, vary: 0, revision: 'mineral-resonance-2'},
    'world-node-select': {bus: 'effects', gain: .9, interval: 100, vary: .015, revision: 'mineral-resonance-2'},
  };
  const clamp = (x, min, max) => Math.max(min, Math.min(max, x));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const encoded = new Map(), decoded = new Map(), fetching = new Map(), decoding = new Map();
  const failed = new Set(), voices = new Set(), pending = new Set(), lastRequested = new Map();
  const counts = Object.fromEntries(Object.keys(bank).map(name => [name, 0]));
  const scheduledCounts = {...counts}, recent = [];
  let context = null, master = null, compressor = null, ambient = null, resumeJob = null, suspendJob = null;
  let pageAway = false, mapRain = 0;
  let buses = null, unlocked = false, epoch = 0, dropped = 0;
  let values = {master: 80, ambience: 25, effects: 70, dice: 100};
  const maxVoices = 12;
  const foreground = () => !pageAway && !document.hidden;

  function fetchSample(name) {
    if (encoded.has(name)) return Promise.resolve(encoded.get(name));
    if (fetching.has(name)) return fetching.get(name);
    const revision = bank[name]?.revision ? `?v=${bank[name].revision}` : '';
    const job = fetch(`assets/audio/${name}.ogg${revision}`, {cache: 'force-cache'})
      .then(response => { if (!response.ok) throw Error('Audio asset unavailable'); return response.arrayBuffer(); })
      .then(bytes => { encoded.set(name, bytes); return bytes; })
      .catch(() => { failed.add(name); return null; });
    fetching.set(name, job);
    return job;
  }
  function bufferFor(name) {
    if (decoded.has(name)) return Promise.resolve(decoded.get(name));
    if (decoding.has(name)) return decoding.get(name);
    if (!context) return Promise.resolve(null);
    const job = fetchSample(name).then(bytes => bytes ? context.decodeAudioData(bytes.slice(0)) : null)
      .then(buffer => { if (buffer) decoded.set(name, buffer); return buffer; })
      .catch(() => { failed.add(name); return null; });
    decoding.set(name, job);
    return job;
  }
  // Keep the first interaction responsive without competing with scene images.
  async function preload() {
    const names = Object.keys(bank);
    for (let i = 0; i < names.length; i += 3) await Promise.all(names.slice(i, i + 3).map(fetchSample));
  }

  function ramp(parameter, target, seconds = .05) {
    if (!context) return;
    const now = context.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else { parameter.cancelScheduledValues(now); parameter.setValueAtTime(parameter.value, now); }
    parameter.linearRampToValueAtTime(target, now + Math.max(.005, seconds));
  }
  function gainFor(value) { return Math.pow(clamp(value, 0, 100) / 100, 1.35); }
  function applyVolumes() {
    if (!context) return;
    ramp(master.gain, gainFor(values.master));
    for (const name of ['ambience', 'effects', 'dice']) ramp(buses[name].gain, gainFor(values[name]));
    updateAmbience();
  }
  function sync(settings) {
    const incoming = settings?.audio || settings;
    if (!incoming || typeof incoming !== 'object') return;
    for (const name of Object.keys(values)) if (incoming[name] != null) values[name] = clamp(finite(incoming[name], values[name]), 0, 100);
    applyVolumes();
  }
  function makeContext() {
    const Constructor = window.AudioContext || window.webkitAudioContext;
    if (!Constructor) return false;
    try {
      context = new Constructor({latencyHint: 'interactive'});
      master = context.createGain(); master.gain.value = gainFor(values.master);
      compressor = context.createDynamicsCompressor();
      compressor.threshold.value = -12; compressor.knee.value = 18; compressor.ratio.value = 3;
      compressor.attack.value = .006; compressor.release.value = .18;
      master.connect(compressor); compressor.connect(context.destination);
      buses = {};
      for (const name of ['ambience', 'effects', 'dice']) {
        const gain = context.createGain(); gain.gain.value = gainFor(values[name]); gain.connect(master); buses[name] = gain;
      }
      context.addEventListener('statechange', () => {
        if (context.state === 'running') {
          if (!foreground()) suspendForBackground();
          else updateAmbience();
        } else if (context.state === 'suspended' && foreground() && unlocked) unlock();
      });
      return true;
    } catch { context = null; return false; }
  }
  function suspendForBackground() {
    if (!context || context.state === 'closed') return Promise.resolve();
    if (suspendJob) return suspendJob;
    // Queue even while state is still "suspended": a previous resume() may be
    // in flight. A state-only guard loses this race during a fast tab switch.
    let completed = false;
    const job = context.suspend().then(() => { completed = true; }).catch(() => {}).finally(() => {
      if (suspendJob === job) suspendJob = null;
      if (!completed) return;
      if (foreground() && unlocked && context.state !== 'running') unlock();
      else if (!foreground() && context.state === 'running') suspendForBackground();
    });
    suspendJob = job;
    return job;
  }
  function unlock() {
    if (!foreground()) return Promise.resolve(false);
    if (!context && !makeContext()) return Promise.resolve(false);
    if (context.state === 'running') {
      unlocked = true;
      Object.keys(bank).forEach(bufferFor);
      updateAmbience();
      return Promise.resolve(true);
    }
    // Reassert the current visible intent. A resume promise from before a later
    // suspend can remain pending; returning it here would strand a fast tab switch.
    try {
      const job = context.resume().then(() => {
        if (!foreground()) { suspendForBackground(); return false; }
        const running = context.state === 'running';
        unlocked ||= running;
        if (running) {
          Object.keys(bank).forEach(bufferFor);
          updateAmbience();
        }
        return running;
      }).catch(() => false).finally(() => { if (resumeJob === job) resumeJob = null; });
      resumeJob = job;
    } catch { return Promise.resolve(false); }
    return resumeJob;
  }
  function activate(event) {
    if (!event.isTrusted || document.hidden || (event.type === 'pointerdown' && event.button !== 0)
      || (event.type === 'keydown' && (event.ctrlKey || event.metaKey || ['Shift','Alt','Control','Meta'].includes(event.key)))) return;
    unlock();
  }
  document.addEventListener('pointerdown', activate, {capture: true, passive: true});
  document.addEventListener('keydown', activate, true);

  // BufferSource has no "started" event. Count only after its audio-clock start,
  // so cancelling a delayed fracture does not look like an audible playback.
  function recordStarted(voice) {
    if (voice.recorded || voice.stopped || !voice.source || context.currentTime < voice.at) return;
    voice.recorded = true;
    counts[voice.name]++;
    recent.push({name: voice.name, group: voice.group, time: Math.round(performance.now())});
    if (recent.length > 32) recent.shift();
  }
  function watchVoiceStart(voice) {
    if (voice.cleaned || voice.stopped) return;
    recordStarted(voice);
    if (!voice.recorded) voice.startTimer = setTimeout(() => watchVoiceStart(voice),
      Math.max(8, Math.min(80, (voice.at - context.currentTime) * 1000)));
  }
  function cleanVoice(voice) {
    if (voice.cleaned) return;
    recordStarted(voice);
    clearTimeout(voice.startTimer);
    voice.cleaned = true;
    voices.delete(voice); pending.delete(voice);
    voice.nodes?.forEach(node => { try { node.disconnect(); } catch {} });
  }
  function stopVoice(voice, seconds = .035) {
    if (voice.stopped) return;
    recordStarted(voice);
    clearTimeout(voice.startTimer);
    voice.stopped = true; pending.delete(voice);
    if (!voice.source) return;
    const now = context.currentTime, fade = clamp(finite(seconds, .035), 0, 2);
    if (voice.at > now || fade === 0) {
      try { voice.source.stop(now); } catch {}
      cleanVoice(voice);
    } else {
      ramp(voice.gain.gain, 0, fade);
      try { voice.source.stop(now + fade + .008); } catch {}
    }
  }
  function stopGroup(group, fade = .04) {
    for (const voice of [...voices, ...pending]) if (voice.group === group) stopVoice(voice, fade);
  }
  function play(name, options = {}) {
    const voice = {name, group: String(options.group || name), stopped: false, cleaned: false, source: null, nodes: []};
    const handle = {stop: fade => stopVoice(voice, fade)};
    const spec = bank[name], requested = performance.now(), generation = epoch;
    const delay = clamp(finite(options.delay, 0), 0, 6);
    if (!spec || name === 'rain-loop' || !context || !foreground() || (!unlocked && !resumeJob)) return handle;
    if (requested - (lastRequested.get(name) ?? -Infinity) < spec.interval || pending.size >= maxVoices) { dropped++; return handle; }
    lastRequested.set(name, requested);
    pending.add(voice);
    const accepted = buffer => {
      pending.delete(voice);
      // A sound belongs to the visible gesture, never to a later tab or screen.
      if (!buffer || voice.stopped || generation !== epoch || !foreground() || context.state !== 'running'
        || performance.now() - requested > 180 + delay * 1000) { dropped++; return; }
      if (voices.size >= maxVoices) {
        const oldest = voices.values().next().value;
        stopVoice(oldest, .018); voices.delete(oldest);
      }
      const random = options.variation === false ? 0 : (Math.random() * 2 - 1) * spec.vary;
      const rate = clamp(finite(options.rate, 1) * (1 + random), .65, 1.6);
      const level = spec.gain * clamp(finite(options.gain, 1), 0, 1.5) * (1 - Math.abs(random) * .7);
      if (level <= 0) return;
      const source = context.createBufferSource(), envelope = context.createGain();
      source.buffer = buffer; source.playbackRate.value = rate;
      const remainingDelay = Math.max(0, delay - (performance.now() - requested) / 1000);
      const at = context.currentTime + .004 + remainingDelay, duration = buffer.duration / rate;
      envelope.gain.setValueAtTime(0, context.currentTime);
      envelope.gain.setValueAtTime(0, at);
      const attack = Math.min(.009, duration * .12);
      envelope.gain.linearRampToValueAtTime(level, at + attack);
      envelope.gain.setValueAtTime(level, at + Math.max(attack, duration - Math.min(.065, duration * .22)));
      envelope.gain.linearRampToValueAtTime(0, at + duration);
      source.connect(envelope);
      voice.nodes = [source, envelope];
      if (context.createStereoPanner) {
        const pan = context.createStereoPanner();
        pan.pan.value = clamp(finite(options.pan, 0), -.75, .75);
        envelope.connect(pan); pan.connect(buses[spec.bus]); voice.nodes.push(pan);
      } else envelope.connect(buses[spec.bus]);
      voice.source = source; voice.gain = envelope; voice.at = at;
      voices.add(voice); source.onended = () => cleanVoice(voice);
      source.start(at); source.stop(at + duration + .012);
      scheduledCounts[name]++;
      watchVoiceStart(voice);
      window.dispatchEvent(new CustomEvent('infinite:audioplay', {detail: {name, group: voice.group, at, duration, bus: spec.bus}}));
    };
    if (decoded.has(name) && context.state === 'running') accepted(decoded.get(name));
    else Promise.all([bufferFor(name), resumeJob]).then(([buffer]) => accepted(buffer)).catch(() => { pending.delete(voice); });
    return handle;
  }

  function ambientLevel() {
    if (!foreground()) return 0;
    const modal = document.querySelector('dialog[open]');
    if (world.dataset.state === 'world-map') return bank['rain-loop'].gain * mapRain * (modal ? .47 : .8);
    if (!['loading','ready','title'].includes(world.dataset.state)) return 0;
    return bank['rain-loop'].gain * (modal ? .47 : 1);
  }
  window.addEventListener('infinite:worldweatherchange', event => {
    mapRain = event.detail?.active === false ? 0 : clamp(finite(event.detail?.rain, 0), 0, 1);
    updateAmbience();
  });
  let ambientLoading = false;
  function updateAmbience() {
    if (!context || context.state !== 'running' || !unlocked) return;
    const target = ambientLevel();
    if (ambient) { ramp(ambient.gain.gain, target, target ? .65 : .42); return; }
    if (!target || ambientLoading) return;
    ambientLoading = true;
    bufferFor('rain-loop').then(buffer => {
      ambientLoading = false;
      if (!buffer || !ambientLevel() || context.state !== 'running' || ambient) return;
      const source = context.createBufferSource(), envelope = context.createGain();
      const high = context.createBiquadFilter(), low = context.createBiquadFilter();
      source.buffer = buffer; source.loop = true;
      high.type = 'highpass'; high.frequency.value = 85; high.Q.value = .5;
      low.type = 'lowpass'; low.frequency.value = 6800; low.Q.value = .55;
      envelope.gain.value = 0;
      source.connect(high); high.connect(low); low.connect(envelope); envelope.connect(buses.ambience);
      ambient = {source, gain: envelope, nodes: [source, high, low, envelope]};
      source.start(0, Math.random() * Math.max(0, buffer.duration - 1));
      ramp(envelope.gain, ambientLevel(), 1.35);
    });
  }
  function stopAmbient() {
    if (!ambient) return;
    const previous = ambient; ambient = null;
    try { previous.source.stop(); } catch {}
    previous.nodes.forEach(node => { try { node.disconnect(); } catch {} });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      epoch++;
      [...voices, ...pending].forEach(voice => stopVoice(voice, 0));
      stopAmbient();
      suspendForBackground();
    } else if (unlocked) unlock();
  });
  window.addEventListener('pagehide', () => {
    pageAway = true;
    epoch++;
    [...voices, ...pending].forEach(voice => stopVoice(voice, 0));
    stopAmbient();
    suspendForBackground();
  });
  window.addEventListener('pageshow', () => { pageAway = false; if (unlocked && !document.hidden) unlock(); });
  window.addEventListener('infinite:settings', event => sync(event.detail));
  window.addEventListener('infinite:soundcue', event => {
    const detail = event.detail;
    if (detail && typeof detail.name === 'string') play(detail.name, detail);
  });
  window.addEventListener('infinite:soundstop', event => { if (event.detail?.group) stopGroup(event.detail.group, event.detail.fade); });
  window.addEventListener('infinite:settingssaved', () => play('ui-save', {group: 'ui', variation: false}));
  new MutationObserver(updateAmbience).observe(world, {attributes: true, attributeFilter: ['data-state']});
  document.querySelectorAll('dialog').forEach(dialog => new MutationObserver(updateAmbience)
    .observe(dialog, {attributes: true, attributeFilter: ['open']}));

  function positionPan(element) {
    const bounds = element.getBoundingClientRect();
    return clamp(((bounds.left + bounds.width / 2) / innerWidth - .5) * .6, -.3, .3);
  }
  function controlSound(name, element, options = {}) {
    // Scene controllers explicitly own their hover, selection and action cues.
    if (element?.closest?.('#deity-space, #system-space, #world-map')) return;
    play(name, {group: 'ui', pan: positionPan(element), ...options});
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('button');
    if (!button || button.disabled || button.closest('[inert]') || button.matches('#save-settings, #preview-dice')) return;
    // Title actions emit before switching screens, which can make their button inert.
    // Closing the folio already launches its synchronized paper-fold cue.
    if (button.matches('[data-menu-action], .folio-back, #settings-dialog [data-close-dialog]')) return;
    if (button.matches('[role="tab"]')) controlSound('ui-tab', button);
    else if (button.matches('.paper-select-trigger')) controlSound(button.getAttribute('aria-expanded') === 'true' ? 'ui-select-open' : 'ui-back', button);
    else if (button.matches('[data-close-dialog], #return-title')) controlSound('ui-back', button);
    else controlSound('ui-tap', button);
  });
  const rangePositions = new WeakMap();
  document.addEventListener('input', event => {
    const control = event.target;
    if (!control.matches?.('input[type="range"]') || control.disabled) return;
    const low = finite(control.min, 0), high = finite(control.max, 100);
    const value = clamp((finite(control.value, low) - low) / Math.max(1, high - low), 0, 1);
    const previous = rangePositions.get(control);
    rangePositions.set(control, value);
    if (previous != null && Math.abs(value - previous) < .006) return;
    controlSound('ui-slider', control, {gain: .7, rate: .96 + value * .1});
  });
  document.addEventListener('change', event => {
    const control = event.target;
    if (!control.matches?.('input, select') || control.disabled) return;
    if (control.type === 'checkbox') controlSound(control.checked ? 'ui-toggle-on' : 'ui-toggle-off', control);
    else if (control.type === 'radio' && control.checked) controlSound('ui-tab', control);
    else if (control.tagName === 'SELECT') controlSound('ui-select', document.getElementById(`${control.id}-trigger`) || control);
  });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const control = event.target;
    if (control.matches?.('.paper-select-trigger')) {
      if (['ArrowUp','ArrowDown','Home','End'].includes(event.key)) controlSound('ui-tab', control, {gain: .65});
      else if (['Enter',' '].includes(event.key) && control.getAttribute('aria-expanded') === 'true') controlSound('ui-select-open', control);
    } else if (control.matches?.('[role="tab"]') && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      controlSound('ui-tab', document.activeElement, {gain: .7});
    }
  });

  window.InfiniteAudio = Object.freeze({unlock, play, stopGroup, sync,
    getState: () => {
      voices.forEach(recordStarted);
      return {context: context?.state || 'locked', unlocked,
      resuming: Boolean(resumeJob), suspending: Boolean(suspendJob),
      activeVoices: voices.size, pendingVoices: pending.size, ambient: Boolean(ambient && ambientLevel()),
      loaded: [...decoded.keys()], failed: [...failed], gains: {...values},
      played: {...counts}, scheduled: {...scheduledCounts}, dropped,
      voices: [...voices].map(voice => ({name: voice.name, group: voice.group,
        started: Boolean(voice.recorded), stopped: voice.stopped})),
      recent: recent.map(item => ({...item}))};
    },
  });
  sync(window.InfiniteSettings?.getState?.());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', preload, {once: true});
  else preload();
})();
