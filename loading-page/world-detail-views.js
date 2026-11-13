/* A blossom disclosure switches dossier views without changing journey progress. */
(() => {
  'use strict';
  const dialog = document.getElementById('world-level-detail');
  if (!dialog) return;
  const copy = dialog.querySelector('.world-detail-copy');
  const actions = copy.querySelector('.world-detail-actions');
  const labels = {details:'详情', tasks:'任务', intel:'世界情报'};
  const ids = Object.keys(labels), reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const stack = document.createElement('div'); stack.className = 'world-detail-view-stack';
  const panels = new Map();
  for (const id of ids) {
    const panel = document.createElement('section');
    panel.className = 'world-detail-pane'; panel.id = 'world-detail-view-' + id;
    panel.dataset.detailPane = id; panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', 'world-detail-tab-' + id);
    panel.tabIndex = 0; panels.set(id, panel); stack.append(panel);
  }
  panels.get('details').append(copy.querySelector('.world-detail-difficulty'), copy.querySelector('.world-detail-traits'), copy.querySelector('.world-detail-description'));
  const objective = copy.querySelector('.world-detail-objective');
  objective.querySelector('span').textContent = '主线任务';
  panels.get('tasks').append(objective);
  const taskState = document.createElement('p'); taskState.className = 'world-detail-task-state'; panels.get('tasks').append(taskState);
  panels.get('intel').innerHTML = '<dl class="world-detail-intel-meta"><div><dt>所属卷</dt><dd data-intel-chapter></dd></div><div><dt>地点</dt><dd data-intel-place></dd></div></dl><p class="world-detail-intel-heading">已知特征</p><ol class="world-detail-intel-list"><li></li><li></li><li></li></ol>';
  copy.insertBefore(stack, actions);
  const switcher = document.createElement('div'); switcher.className = 'world-detail-view-switcher'; switcher.dataset.expanded = 'false';
  switcher.innerHTML = '<div id="world-detail-view-options" class="world-detail-view-options" role="tablist" aria-label="关卡视图" aria-orientation="vertical" aria-hidden="true" inert>' + ids.map((id,index) => '<button type="button" role="tab" id="world-detail-tab-' + id + '" data-detail-view="' + id + '" aria-label="' + labels[id] + '" aria-controls="world-detail-view-' + id + '" style="--view-order:' + index + '"><span class="world-detail-petal-label">' + (id === 'intel' ? '世界<br>情报' : labels[id]) + '</span></button>').join('') + '</div><button type="button" class="world-detail-view-trigger" aria-controls="world-detail-view-options" aria-expanded="false" title="切换视图"><span class="world-detail-view-current">详情</span><img src="assets/world-detail/view-flower.png" width="52" height="52" alt="" draggable="false"></button>';
  dialog.append(switcher);
  const trigger = switcher.querySelector('.world-detail-view-trigger'), options = switcher.querySelector('[role="tablist"]');
  const tabs = [...options.querySelectorAll('[role="tab"]')];
  let current = 'details', expanded = false, sequence = 0, animations = [], stageId = null, focusFrame = 0;
  const motion = () => !reduced.matches && window.InfiniteSettings?.getState?.().motion !== false;
  const cue = name => window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail:{name, group:'world-map', variation:false, gain:.7}}));
  function settle() {
    sequence++; animations.forEach(animation => animation.cancel()); animations = [];
    for (const [id, panel] of panels) { panel.hidden = id !== current; panel.inert = id !== current; panel.setAttribute('aria-hidden', String(id !== current)); }
  }
  function sync() {
    dialog.dataset.detailView = current;
    dialog.setAttribute('aria-describedby', 'world-detail-view-' + current + ' world-detail-state');
    trigger.setAttribute('aria-label', '切换视图，当前：' + labels[current]);
    trigger.querySelector('.world-detail-view-current').textContent = labels[current];
    tabs.forEach(tab => { const selected = tab.dataset.detailView === current; tab.setAttribute('aria-selected', String(selected)); tab.tabIndex = selected ? 0 : -1; });
  }
  function menu(open, {focus = false, sound = false} = {}) {
    cancelAnimationFrame(focusFrame); focusFrame = 0;
    expanded = open; switcher.dataset.expanded = String(open);
    trigger.setAttribute('aria-expanded', String(open)); options.inert = !open; options.setAttribute('aria-hidden', String(!open));
    if (sound) cue(open ? 'ui-select-open' : 'ui-back');
    if (focus) (open ? tabs.find(tab => tab.dataset.detailView === current) : trigger).focus({preventScroll:true});
  }
  function select(id, {animate = true, sound = true} = {}) {
    if (!panels.has(id)) return;
    menu(false);
    if (id === current) return;
    settle(); const previous = panels.get(current); current = id; settle(); sync();
    if (sound) cue('ui-tab');
    if (!animate || !motion() || !dialog.open || dialog.classList.contains('is-blossoming')) return;
    const token = ++sequence, next = panels.get(current);
    previous.hidden = false;
    animations = [
      previous.animate([{opacity:1, transform:'translateY(0)'},{opacity:0, transform:'translateY(-5px)'}], {duration:150, easing:'ease-out', fill:'both'}),
      next.animate([{opacity:0, transform:'translateY(7px)'},{opacity:1, transform:'translateY(0)'}], {duration:280, easing:'cubic-bezier(.2,.7,.2,1)', fill:'both'}),
    ];
    Promise.all(animations.map(animation => animation.finished.catch(() => {}))).then(() => { if (token === sequence) settle(); });
  }
  function fill(item, chapter) {
    const reset = !dialog.open || stageId !== item.id; stageId = item.id;
    taskState.textContent = item.status === 'completed' ? '已通关' : item.status === 'locked' ? '未解锁' : '待探索';
    taskState.dataset.status = item.status;
    panels.get('intel').querySelector('[data-intel-chapter]').textContent = chapter.name;
    panels.get('intel').querySelector('[data-intel-place]').textContent = item.kind.split('·').at(-1).trim() || item.name;
    panels.get('intel').querySelectorAll('li').forEach((row,index) => { row.textContent = item.traits[index]; });
    if (reset) { current = 'details'; settle(); menu(false); }
    sync();
  }
  trigger.addEventListener('click', () => { if (dialog.dataset.state !== 'closing') menu(!expanded, {focus:!expanded, sound:true}); });
  options.addEventListener('click', event => { const tab = event.target.closest('[data-detail-view]'); if (!tab) return; select(tab.dataset.detailView); trigger.focus({preventScroll:true}); });
  dialog.addEventListener('click', event => { if (expanded && !switcher.contains(event.target)) menu(false); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopImmediatePropagation(); menu(false, {focus:true, sound:true}); return; }
    if (event.target === trigger && ['ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); event.stopPropagation(); menu(true, {focus:true, sound:!expanded}); return; }
    if (!expanded || !options.contains(event.target)) return;
    const index = tabs.indexOf(event.target);
    if (index < 0) return;
    let target;
    if (['ArrowUp','ArrowLeft'].includes(event.key)) target = (index + tabs.length - 1) % tabs.length;
    if (['ArrowDown','ArrowRight'].includes(event.key)) target = (index + 1) % tabs.length;
    if (event.key === 'Home') target = 0;
    if (event.key === 'End') target = tabs.length - 1;
    if (target != null) { event.preventDefault(); event.stopPropagation(); tabs.forEach((tab,i) => { tab.tabIndex = i === target ? 0 : -1; }); tabs[target].focus({preventScroll:true}); cue('ui-focus'); }
  }, true);
  function suspend() { menu(false); settle(); }
  dialog.addEventListener('close', suspend);
  switcher.addEventListener('focusout', event => {
    if (switcher.contains(event.relatedTarget)) return;
    // Native focus moves through body between focusout and focusin on pointer input.
    cancelAnimationFrame(focusFrame);
    focusFrame = requestAnimationFrame(() => { focusFrame = 0; if (expanded && !switcher.contains(document.activeElement)) menu(false); });
  });
  reduced.addEventListener('change', () => { if (!motion()) settle(); });
  window.addEventListener('infinite:settings', () => { if (!motion()) settle(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) suspend(); });
  settle(); sync();
  window.InfiniteWorldDetailViews = Object.freeze({fill, suspend, getState:() => ({view:current, expanded, stageId})});
})();
