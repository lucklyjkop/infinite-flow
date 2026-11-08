/* IDs are fetched on opening the paper selector and live only with this draft. */
(() => {
  'use strict';
  const dialog = document.getElementById('settings-dialog');
  const field = document.getElementById('model-name');
  const trigger = document.getElementById('model-name-trigger');
  const label = document.getElementById('model-name-value');
  const popup = document.getElementById('model-catalog-popover');
  const search = document.getElementById('model-catalog-search');
  const refreshButton = document.getElementById('model-catalog-refresh');
  const manualButton = document.getElementById('model-catalog-manual');
  const options = document.getElementById('model-catalog-options');
  const status = document.getElementById('model-catalog-status');
  const count = document.getElementById('model-catalog-count');
  const empty = document.getElementById('model-catalog-empty');
  if (!dialog || !field || !trigger || !popup) return;
  const dependencies = ['model-protocol', 'model-base-url', 'model-api-key'].map(id => document.getElementById(id));
  let ids = [], matches = [], active = -1, serial = 0, controller = null, timer = 0, fetched = false;
  function message(value, error = false) { status.textContent = value; status.classList.toggle('is-error', error); }
  function sound(name) { window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail: {name, group: 'model-catalog'}})); }
  function refresh() {
    label.textContent = field.value || '选择模型';
    trigger.classList.toggle('is-placeholder', !field.value);
    trigger.title = field.value;
  }
  function close(restoreFocus = false) {
    if (popup.matches(':popover-open')) popup.hidePopover();
    trigger.setAttribute('aria-expanded', 'false');
    search.removeAttribute('aria-activedescendant');
    active = -1;
    if (restoreFocus && dialog.open) trigger.focus({preventScroll: true});
  }
  function cancelRequest() {
    ++serial;
    controller?.abort(); controller = null;
    clearTimeout(timer); timer = 0;
    refreshButton.disabled = false;
    refreshButton.textContent = '刷新列表';
    trigger.removeAttribute('aria-busy');
  }
  function reset() {
    cancelRequest();
    ids = []; matches = []; fetched = false; search.value = '';
    close(); options.replaceChildren(); message(''); refresh();
  }
  function place() {
    if (!popup.matches(':popover-open')) return;
    const r = trigger.closest('.paper-field').getBoundingClientRect();
    const margin = 12, below = innerHeight - r.bottom - margin, above = r.top - margin;
    const up = below < 230 && above > below;
    popup.style.width = Math.min(Math.max(r.width, 240), innerWidth - margin * 2) + 'px';
    popup.style.maxHeight = Math.min(360, Math.max(150, (up ? above : below) - 6)) + 'px';
    const height = popup.getBoundingClientRect().height;
    popup.style.left = Math.max(margin, Math.min(r.left, innerWidth - popup.getBoundingClientRect().width - margin)) + 'px';
    popup.style.top = Math.max(margin, up ? r.top - height - 6 : r.bottom + 6) + 'px';
  }
  function activate(index) {
    active = index;
    [...options.children].forEach((element, i) => element.classList.toggle('is-active', i === active));
    const element = options.children[active];
    if (element) { search.setAttribute('aria-activedescendant', element.id); element.scrollIntoView({block: 'nearest'}); }
    else search.removeAttribute('aria-activedescendant');
  }
  function render() {
    const query = search.value.trim().toLocaleLowerCase();
    matches = ids.filter(id => id.toLocaleLowerCase().includes(query));
    options.replaceChildren(...matches.map((id, index) => {
      const element = document.createElement('div');
      element.className = 'paper-select-option model-catalog-option';
      element.id = 'catalogue-option-' + index;
      element.setAttribute('role', 'option');
      element.setAttribute('aria-selected', String(field.value === id));
      element.dataset.index = index;
      element.textContent = id;
      element.title = id;
      return element;
    }));
    count.textContent = fetched ? matches.length + ' / ' + ids.length : '';
    empty.hidden = !fetched || matches.length > 0 || !query;
    manualButton.disabled = !search.value.trim();
    activate(matches.indexOf(field.value));
    place();
  }
  function open() {
    if (!dialog.open || dialog.dataset.phase === 'closing') return;
    window.PaperSelects?.close();
    search.value = '';
    render();
    popup.showPopover();
    trigger.setAttribute('aria-expanded', 'true');
    search.focus({preventScroll: true});
    sound('ui-select-open');
    place();
    if (!fetched && !controller) load();
  }
  function chooseId(value) {
    const next = value.trim();
    if (!next || next.length > 512 || /[\u0000-\u001f]/.test(next)) { message('请填写有效的模型 ID。', true); place(); return; }
    field.value = next;
    field.dispatchEvent(new Event('input', {bubbles: true}));
    field.dispatchEvent(new Event('change', {bubbles: true}));
    refresh(); close(true);
    sound('ui-select');
  }
  async function load() {
    cancelRequest();
    ids = []; matches = []; fetched = false;
    const token = serial;
    const [protocol, address, secret] = dependencies;
    const baseUrl = address.value.trim();
    const error = text => { message(text, true); refreshButton.textContent = '重试'; render(); };
    if (!baseUrl) { error('请先填写接口地址，也可在此手动输入模型 ID。'); return; }
    try {
      const url = new URL(baseUrl);
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.hash || url.search) throw Error();
    } catch { error('请填写有效的 HTTP(S) 接口地址。'); return; }
    if (location.protocol === 'file:') { error('请通过本地预览服务打开页面，再获取模型。'); return; }
    controller = new AbortController();
    const request = controller;
    let timedOut = false;
    timer = setTimeout(() => { timedOut = true; request.abort(); }, 22000);
    refreshButton.disabled = true; refreshButton.textContent = '获取中…'; trigger.setAttribute('aria-busy', 'true');
    message('正在获取可用模型…'); render();
    try {
      const response = await fetch('/api/models', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, cache: 'no-store', credentials: 'same-origin',
        signal: request.signal, body: JSON.stringify({protocol: protocol.value, baseUrl, apiKey: secret.value.trim()}),
      });
      let result;
      try { result = await response.json(); }
      catch { throw Error('预览服务尚未启用模型获取接口，请重启本项目服务。'); }
      if (token !== serial || !dialog.open || dialog.dataset.phase === 'closing') return;
      if (!response.ok) throw Error(typeof result.error === 'string' ? result.error : '获取失败，请检查接口地址。');
      if (!Array.isArray(result.models)) throw Error('接口没有返回可用的模型列表。');
      ids = [...new Set(result.models.map(item => item?.id).filter(id => typeof id === 'string' && id.trim()))];
      fetched = true;
      message(ids.length ? (result.truncated ? '列表已截取，输入可筛选。' : '') : '接口没有返回可用模型，可手动填写模型 ID。', !ids.length);
      render();
    } catch (caught) {
      if (token !== serial || !dialog.open || dialog.dataset.phase === 'closing') return;
      error(timedOut ? '获取模型超时，请稍后重试。' : caught.name === 'AbortError' ? '已取消获取。' : caught instanceof TypeError ? '无法连接预览服务，请检查服务是否仍在运行。' : caught.message);
    } finally {
      if (token === serial) {
        clearTimeout(timer); timer = 0; controller = null;
        refreshButton.disabled = false;
        refreshButton.textContent = fetched ? '刷新列表' : '重试';
        trigger.removeAttribute('aria-busy');
        place();
      }
    }
  }
  trigger.addEventListener('click', () => popup.matches(':popover-open') ? close() : open());
  trigger.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); if (!popup.matches(':popover-open')) open(); }
  });
  refreshButton.addEventListener('click', load);
  manualButton.addEventListener('click', () => chooseId(search.value));
  field.addEventListener('input', refresh);
  field.addEventListener('change', refresh);
  search.addEventListener('input', render);
  search.addEventListener('keydown', event => {
    if (event.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (matches.length) activate(active < 0 ? (event.key === 'ArrowDown' ? 0 : matches.length - 1) : (active + (event.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      if (active >= 0) chooseId(matches[active]);
      else if (matches.length === 1) chooseId(matches[0]);
      else if (search.value.trim()) chooseId(search.value);
    }
  });
  popup.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
  });
  options.addEventListener('pointerdown', event => event.preventDefault());
  options.addEventListener('click', event => {
    const element = event.target.closest('[data-index]');
    if (element) chooseId(matches[Number(element.dataset.index)]);
  });
  dependencies.forEach(element => { element.addEventListener('input', reset); element.addEventListener('change', reset); });
  document.addEventListener('pointerdown', event => { if (!popup.contains(event.target) && !trigger.contains(event.target)) close(); }, true);
  document.addEventListener('focusin', event => { if (!popup.contains(event.target) && !trigger.contains(event.target)) close(); });
  window.addEventListener('resize', place, {passive: true});
  dialog.querySelector('.folio-pages')?.addEventListener('scroll', () => close(), {passive: true});
  dialog.addEventListener('close', reset);
  new MutationObserver(() => { if (!dialog.open || dialog.dataset.phase === 'closing') reset(); }).observe(dialog, {attributes: true, attributeFilter: ['open', 'data-phase']});
  document.getElementById('reset-settings').addEventListener('click', reset);
  new MutationObserver(() => {
    if (document.getElementById('panel-model').hidden) { close(); if (controller) reset(); }
  }).observe(document.getElementById('panel-model'), {attributes: true, attributeFilter: ['hidden']});
  window.ModelCatalogue = Object.freeze({reset, close, refresh, getState: () => ({count: ids.length, loading: Boolean(controller), open: popup.matches(':popover-open')})});
  refresh();
})();
