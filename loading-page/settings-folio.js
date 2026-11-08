/* Settings belong to the open folio. Only an explicit save commits its draft. */
(() => {
  'use strict';

  const dialog = document.getElementById('settings-dialog');
  const form = document.getElementById('settings-form');
  const world = document.getElementById('world');
  const stage = dialog.querySelector('.settings-stage');
  const tabList = dialog.querySelector('.folio-tabs');
  const tabs = [...tabList.querySelectorAll('[role="tab"]')];
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const horizontalTabs = matchMedia('(orientation: portrait) and (max-width: 720px)');
  const settingsKey = 'infinite.settings.v1';
  const audioDefaultsVersion = 2;
  const secretKey = 'infinite.model-key.v1';
  const defaults = {
    brightness: 100, motion: true, display: 'cover',
    model: { protocol: 'openai', baseUrl: '', name: '' },
    preferences: { details: 'expanded', diceMotion: true, narrativeSize: 'medium' },
    audio: { master: 80, ambience: 25, effects: 70, dice: 100 },
  };
  const input = id => document.getElementById(id);
  const clone = value => JSON.parse(JSON.stringify(value));
  const numeric = (value, fallback, min, max) =>
    value != null && value !== '' && Number.isFinite(Number(value))
      ? Math.max(min, Math.min(max, Math.round(Number(value)))) : fallback;
  const text = value => typeof value === 'string' ? value.trim() : '';
  const radioValue = name => form.querySelector(`input[name="${name}"]:checked`)?.value;
  const audioNames = ['master', 'ambience', 'effects', 'dice'];
  let saved = readSettings();
  let draft = clone(saved);
  let savedSecret = readSecret();
  let opener = null, art = null;
  let activeTab = input('tab-preferences');
  let session = 0, entranceTimer = 0, closeGuard = 0;
  let returnAnimations = [], closingRestoreFocus = true, returning = null;
  let beganOutside = false, restoring = false, fullscreenBusy = false;

  function normalize(value) {
    const data = value && typeof value === 'object' ? value : {};
    const model = data.model || {}, preferences = data.preferences || {}, audio = data.audio || {};
    return {
      brightness: numeric(data.brightness, defaults.brightness, 70, 120),
      motion: typeof data.motion === 'boolean' ? data.motion : defaults.motion,
      display: data.display === 'contain' ? 'contain' : 'cover',
      model: { protocol: model.protocol === 'anthropic' ? 'anthropic' : 'openai', baseUrl: text(model.baseUrl), name: text(model.name) },
      preferences: {
        details: preferences.details === 'collapsed' ? 'collapsed' : 'expanded',
        diceMotion: typeof preferences.diceMotion === 'boolean' ? preferences.diceMotion : true,
        narrativeSize: ['small', 'medium', 'large'].includes(preferences.narrativeSize) ? preferences.narrativeSize : 'medium',
      },
      audio: Object.fromEntries(audioNames.map(name => [name, numeric(audio[name], defaults.audio[name], 0, 100)])),
    };
  }

  function readSettings() {
    try {
      const stored = JSON.parse(localStorage.getItem(settingsKey));
      // Retire the old ambience default. Once saved with this version, even an
      // intentional 60% stays untouched; other legacy choices are retained too.
      if (stored && stored.audioDefaultsVersion == null && Number(stored.audio?.ambience) === 60) {
        stored.audio.ambience = defaults.audio.ambience;
      }
      return normalize(stored);
    }
    catch { return normalize(null); }
  }

  function readSecret() {
    try { return sessionStorage.getItem(secretKey) || ''; }
    catch { return ''; }
  }

  function status(message, id = 'settings-status') {
    const target = input(id);
    if (target) target.textContent = message;
  }

  function syncRange(element) {
    const amount = Number(element.value), min = Number(element.min), max = Number(element.max);
    const fill = `${100 * (amount - min) / (max - min)}%`;
    element.style.setProperty('--range-fill', fill);
    element.closest('.folio-range')?.style.setProperty('--range-fill', fill);
    form.querySelectorAll(`output[for="${element.id}"]`).forEach(output => { output.textContent = `${amount}%`; });
  }

  function setRadios(name, value) {
    form.querySelectorAll(`input[name="${name}"]`).forEach(element => { element.checked = element.value === value; });
  }

  function fillForm() {
    window.ModelCatalogue?.reset();
    input('setting-brightness').value = draft.brightness;
    input('setting-motion').checked = draft.motion;
    input('setting-display').value = draft.display;
    input('model-protocol').value = draft.model.protocol;
    input('model-base-url').value = draft.model.baseUrl;
    input('model-name').value = draft.model.name;
    window.ModelCatalogue?.refresh();
    input('model-api-key').value = savedSecret;
    input('model-api-key').type = 'password';
    input('toggle-api-key')?.setAttribute('aria-pressed', 'false');
    setRadios('dice-details', draft.preferences.details);
    setRadios('narrative-size', draft.preferences.narrativeSize);
    input('dice-motion').checked = draft.preferences.diceMotion;
    audioNames.forEach(name => { input(`volume-${name}`).value = draft.audio[name]; });
    form.querySelectorAll('input[type="range"]').forEach(syncRange);
    syncFullscreen();
    syncRecord();
  }

  function syncRecord() {
    const preview = input('record-preview');
    if (preview) {
      preview.dataset.size = draft.preferences.narrativeSize;
      preview.style.setProperty('--narrative-scale', {small: '.88', medium: '1', large: '1.18'}[draft.preferences.narrativeSize]);
    }
    const details = input('record-details');
    if (details) details.hidden = draft.preferences.details !== 'expanded';
  }

  function applyScene(value) {
    document.documentElement.style.setProperty('--scene-brightness', value.brightness / 100);
    world.classList.toggle('custom-brightness', value.brightness !== 100);
    world.classList.toggle('motion-off', !value.motion);
    world.dataset.display = value.display;
    document.documentElement.dataset.display = value.display;
    window.dispatchEvent(new CustomEvent('infinite:settings', { detail: clone(value) }));
  }

  function applyPreview() {
    dialog.style.setProperty('--folio-brightness', draft.brightness / 100);
    syncRecord();
    applyScene(draft);
  }

  function readForm() {
    draft = normalize({
      brightness: input('setting-brightness').value,
      motion: input('setting-motion').checked,
      display: input('setting-display').value,
      model: { protocol: input('model-protocol').value, baseUrl: input('model-base-url').value, name: input('model-name').value },
      preferences: { details: radioValue('dice-details'), diceMotion: input('dice-motion').checked, narrativeSize: radioValue('narrative-size') },
      audio: Object.fromEntries(audioNames.map(name => [name, input(`volume-${name}`).value])),
    });
  }

  function selectTab(tab, focus = false) {
    activeTab = tab;
    tabs.forEach(item => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      const panel = input(item.getAttribute('aria-controls'));
      if (panel) panel.hidden = !selected;
    });
    if (focus) tab.focus({preventScroll: true});
  }

  function syncOrientation() {
    tabList.setAttribute('aria-orientation', horizontalTabs.matches ? 'horizontal' : 'vertical');
  }
  horizontalTabs.addEventListener('change', syncOrientation);
  tabList.addEventListener('click', event => {
    const tab = event.target.closest('[role="tab"]');
    if (tabs.includes(tab)) selectTab(tab, true);
  });
  tabList.addEventListener('keydown', event => {
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    const previous = horizontalTabs.matches ? 'ArrowLeft' : 'ArrowUp';
    const next = horizontalTabs.matches ? 'ArrowRight' : 'ArrowDown';
    let target;
    if (event.key === previous) target = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === next) target = (index + 1) % tabs.length;
    else if (event.key === 'Home') target = 0;
    else if (event.key === 'End') target = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[target], true);
  });

  function canAnimate() { return draft.motion && !reducedMotion.matches && !document.hidden; }

  function sound(name, group, gain = 1) {
    if (!document.hidden) window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail: {name, group, gain}}));
  }

  function stopSound(group) {
    window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail: {group, fade: .06}}));
  }

  function signalReturn(type, detail) {
    window.dispatchEvent(new CustomEvent(`infinite:settingsreturn${type}`, {detail}));
  }

  function clearAnimation() {
    session++;
    clearTimeout(entranceTimer);
    clearTimeout(closeGuard);
    returnAnimations.forEach(animation => animation.cancel());
    returnAnimations = [];
    stopSound('settings-open');
    stopSound('settings-close');
    if (returning) {
      const interrupted = returning;
      returning = null;
      signalReturn('cancel', {...interrupted, immediate: true});
    }
    art?.clear();
    stage.inert = false;
    delete dialog.dataset.phase;
    beganOutside = false;
  }

  function returnFocus() {
    if (opener && !opener.disabled && opener.getClientRects().length && !document.querySelector('dialog[open]')) {
      opener.focus({preventScroll: true});
    }
    opener = null;
  }

  function discardDraft() {
    draft = clone(saved);
    applyPreview();
    input('model-api-key').value = '';
    input('model-api-key').type = 'password';
  }

  function finishClose(restoreFocus = closingRestoreFocus, immediate = false, cancelled = false) {
    const completed = returning;
    returning = null;
    restoring = true;
    discardDraft();
    restoring = false;
    if (!restoreFocus) opener = null;
    // Remove the fully transparent modal before cancelling its retained end pose.
    if (dialog.open) dialog.close();
    clearAnimation();
    if (restoreFocus) returnFocus();
    if (completed) signalReturn(cancelled ? 'cancel' : 'end', {...completed, immediate});
  }

  function returnPose(element) {
    const style = getComputedStyle(element);
    return {opacity: Number(style.opacity), transform: style.transform};
  }

  function animateReturn(poses) {
    const ease = 'cubic-bezier(.22,.61,.28,1)';
    const play = (element, frames, duration = 880, easing = ease) => {
      const animation = element.animate(frames, {duration, easing, fill: 'both'});
      returnAnimations.push(animation);
      return animation.finished.catch(() => {});
    };
    const page = dialog.querySelector('.folio-paper');
    const cover = dialog.querySelector('.folio-navigation');
    // Continue the exact visible pose, including an interrupted opening animation.
    const jobs = [
      play(dialog, [
        {opacity: poses.dialog.opacity, offset: 0},
        {opacity: poses.dialog.opacity * .86, offset: .25},
        {opacity: poses.dialog.opacity * .35, offset: .62},
        {opacity: 0, offset: 1},
      ], 880, 'cubic-bezier(.4,0,.32,1)'),
      play(page, [
        {...poses.page, offset: 0},
        {opacity: poses.page.opacity * .8, transform: 'translateX(-1%) rotateY(-9deg) scale(.99)', offset: .45},
        {opacity: 0, transform: 'translateX(-2%) rotateY(-23deg) scale(.965)', offset: 1},
      ], 800),
      play(cover, [
        poses.cover,
        {opacity: 0, transform: horizontalTabs.matches ? 'translateY(-3%) scale(.97)' : `${poses.cover.transform === 'none' ? '' : poses.cover.transform} rotateY(42deg) translateX(2%)`},
      ], 700),
    ];
    return Promise.all(jobs);
  }

  function close({immediate = false, restoreFocus = true} = {}) {
    if (!dialog.open) return;
    window.ModelCatalogue?.reset();
    if (immediate) { finishClose(restoreFocus, true, true); return; }
    if (dialog.dataset.phase === 'closing') return;
    closingRestoreFocus = restoreFocus;
    const active = ++session;
    clearTimeout(entranceTimer);
    const animated = canAnimate();
    const poses = animated ? {
      dialog: returnPose(dialog),
      page: returnPose(dialog.querySelector('.folio-paper')),
      cover: returnPose(dialog.querySelector('.folio-navigation')),
    } : null;
    dialog.dataset.phase = 'closing';
    window.PaperSelects?.close();
    stopSound('settings-open');
    if (!animated) { finishClose(restoreFocus); sound('menu-close', 'settings-close', .65); return; }
    sound('menu-close', 'settings-close', .8);
    stage.inert = true;
    dialog.focus({preventScroll: true});
    returning = {motion: true, duration: 880, id: active};
    signalReturn('start', {...returning});
    if (session !== active || !dialog.open) return;
    const pageReturn = animateReturn(poses);
    const artReturn = Promise.resolve(art?.close());
    // Restore the live title beneath the still-opaque folio, not at modal removal.
    restoring = true;
    applyScene(saved);
    restoring = false;
    // The native modal stays in the top layer until the compositor fade completes.
    const finish = () => { if (session === active && dialog.open) finishClose(restoreFocus); };
    closeGuard = setTimeout(finish, 1200);
    Promise.all([pageReturn, artReturn]).then(finish, finish);
  }

  function open(source = document.activeElement) {
    if (dialog.open) return;
    stopSound('title-entrance');
    stopSound('title-return');
    clearAnimation();
    closingRestoreFocus = true;
    saved = readSettings();
    savedSecret = readSecret();
    draft = clone(saved);
    fillForm();
    status('');
    status('未检查', 'model-config-status');
    opener = source;
    const active = session;
    selectTab(activeTab || tabs[0]);
    dialog.dataset.phase = canAnimate() ? 'opening' : 'open';
    dialog.showModal();
    sound('menu-open', 'settings-open', .8);
    activeTab?.focus({preventScroll: true});
    if (!art && window.SettingsFolioArt) art = new window.SettingsFolioArt(dialog);
    art?.open();
    if (dialog.dataset.phase === 'opening') {
      entranceTimer = setTimeout(() => {
        if (session === active && dialog.open) dialog.dataset.phase = 'open';
      }, 1400);
    }
  }

  function settleMotion() {
    if (!dialog.open || restoring || canAnimate()) return;
    if (dialog.dataset.phase === 'closing') finishClose(closingRestoreFocus, true);
    else if (dialog.dataset.phase === 'opening') {
      clearTimeout(entranceTimer);
      dialog.dataset.phase = 'open';
    }
  }
  reducedMotion.addEventListener('change', settleMotion);
  document.addEventListener('visibilitychange', settleMotion);
  window.addEventListener('infinite:settings', settleMotion);
  function outsidePanel(target) {
    return !target.closest('.folio-navigation, .folio-paper');
  }
  dialog.addEventListener('pointerdown', event => { beganOutside = outsidePanel(event.target); });
  dialog.addEventListener('click', event => {
    const outside = outsidePanel(event.target) && (event.detail === 0 || beganOutside);
    if (event.target.closest('[data-close-dialog]') || outside) close();
  });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing || !dialog.open) return;
    // An open paper selector owns the first Escape. Otherwise consume the key
    // before Chromium's repeated close request can bypass the cancel listener.
    if (dialog.querySelector(':popover-open')) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    close();
  }, true);
  dialog.addEventListener('close', () => {
    // A synchronously reopened dialog owns its own phase and draft.
    if (dialog.open) return;
    if (dialog.dataset.phase) finishClose(closingRestoreFocus, true, true);
    else returnFocus();
  });

  function configError(required) {
    if (required && !draft.model.baseUrl) return '请填写接口地址。';
    if (draft.model.baseUrl) {
      try {
        const url = new URL(draft.model.baseUrl);
        if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return '接口地址请使用完整的 HTTP(S) 地址，不含认证信息或查询参数。';
      } catch { return '接口地址格式无效。'; }
    }
    if (required && !draft.model.name) return '请填写模型 ID。';
    return '';
  }

  input('test-model-config')?.addEventListener('click', () => {
    readForm();
    status(configError(true) || '格式正确；打开“模型 ID”可获取列表。', 'model-config-status');
  });
  input('toggle-api-key')?.addEventListener('click', event => {
    const secret = input('model-api-key'), show = secret.type === 'password';
    secret.type = show ? 'text' : 'password';
    event.currentTarget.setAttribute('aria-pressed', String(show));
    event.currentTarget.setAttribute('aria-label', show ? '隐藏 API 密钥' : '显示 API 密钥');
  });

  function save() {
    readForm();
    const error = configError(false);
    if (error) {
      selectTab(input('tab-model'), true);
      status(error, 'model-config-status');
      return;
    }
    const secret = input('model-api-key').value.trim();
    let oldSettings, oldSecret;
    try {
      oldSettings = localStorage.getItem(settingsKey);
      oldSecret = sessionStorage.getItem(secretKey);
      if (secret) sessionStorage.setItem(secretKey, secret);
      else sessionStorage.removeItem(secretKey);
      localStorage.setItem(settingsKey, JSON.stringify({...draft, audioDefaultsVersion}));
    } catch {
      // Keep the previous pair of settings and session-only credentials on partial writes.
      try {
        if (oldSettings === null) localStorage.removeItem(settingsKey);
        else if (oldSettings !== undefined) localStorage.setItem(settingsKey, oldSettings);
        if (oldSecret === null) sessionStorage.removeItem(secretKey);
        else if (oldSecret !== undefined) sessionStorage.setItem(secretKey, oldSecret);
      } catch { /* Storage may remain blocked. Report failure instead of claiming a save. */ }
      status('此浏览器暂时无法保存设置，当前修改仍可预览。');
      return;
    }
    saved = clone(draft);
    savedSecret = secret;
    applyPreview();
    status('设置已保存');
    window.dispatchEvent(new CustomEvent('infinite:settingssaved', { detail: clone(saved) }));
  }

  form.addEventListener('submit', event => { event.preventDefault(); save(); });
  input('save-settings')?.addEventListener('click', event => {
    if (event.currentTarget.type !== 'submit') save();
  });
  function previewChange(event) {
    if (event.target.id === 'display-mode') return;
    readForm();
    if (event.target.type === 'range') syncRange(event.target);
    status('');
    if (event.target.id.startsWith('model-')) {
      status('未检查', 'model-config-status');
      return;
    }
    applyPreview();
  }
  form.addEventListener('input', previewChange);
  form.addEventListener('change', previewChange);
  input('reset-settings').addEventListener('click', () => {
    draft = clone(defaults);
    fillForm();
    input('model-api-key').value = '';
    applyPreview();
    status('已恢复默认，保存后生效');
    status('未检查', 'model-config-status');
  });

  function syncFullscreen() {
    const control = input('display-mode');
    if (control) control.value = document.fullscreenElement ? 'fullscreen' : 'window';
    window.PaperSelects?.refresh();
  }
  document.addEventListener('fullscreenchange', syncFullscreen);
  input('display-mode')?.addEventListener('change', async event => {
    if (fullscreenBusy) { syncFullscreen(); return; }
    fullscreenBusy = true;
    const control = event.currentTarget;
    control.disabled = true;
    try {
      if (control.value === 'fullscreen' && !document.fullscreenElement) await document.documentElement.requestFullscreen();
      else if (control.value === 'window' && document.fullscreenElement) await document.exitFullscreen();
    } catch { status('浏览器未能切换显示模式。'); }
    finally { fullscreenBusy = false; control.disabled = false; syncFullscreen(); }
  });

  async function previewDice() {
    const button = input('preview-dice');
    if (button.disabled) return;
    readForm();
    const audio = window.InfiniteAudio;
    if (!audio) { status('声音资源暂时不可用。'); return; }
    button.disabled = true;
    try {
      if (!await audio.unlock()) { status('此浏览器暂时无法播放声音。'); return; }
      // Wait only for gesture unlock, never play a delayed audition after closing.
      if (!dialog.open || dialog.dataset.phase === 'closing' || document.hidden) return;
      audio.sync?.(draft);
      if (art) art.rollDice({animated: draft.preferences.diceMotion && canAnimate()});
      else sound('dice-land', 'settings-dice');
    } catch { status('声音试听暂时不可用。'); }
    finally { setTimeout(() => { button.disabled = false; }, 600); }
  }
  input('preview-dice')?.addEventListener('click', previewDice);
  window.addEventListener('storage', event => {
    if (event.key !== settingsKey && event.key !== null) return;
    saved = readSettings();
    if (!dialog.open) { draft = clone(saved); applyPreview(); }
    else status('其他窗口已更新设置，保存将使用当前页的修改。');
  });

  window.InfiniteSettings = Object.freeze({ open, close, getState: () => clone(draft) });
  syncOrientation();
  fillForm();
  applyPreview();
})();
