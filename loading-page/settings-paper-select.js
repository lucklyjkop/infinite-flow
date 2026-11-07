/* Paper listboxes enhance the actual form selects, preserving their values and change events. */
(() => {
  'use strict';
  const dialog = document.getElementById('settings-dialog');
  const instances = [];
  let opened = null;

  function close(restoreFocus = false) {
    if (!opened) return;
    const current = opened;
    opened = null;
    current.button.setAttribute('aria-expanded', 'false');
    current.button.removeAttribute('aria-activedescendant');
    if (current.list.matches(':popover-open')) current.list.hidePopover();
    if (restoreFocus && !current.button.disabled) current.button.focus({preventScroll: true});
  }

  function place(current) {
    const rect = current.button.getBoundingClientRect();
    const margin = 12, gap = 5;
    const below = innerHeight - rect.bottom - margin, above = rect.top - margin;
    const upwards = below < 190 && above > below;
    const available = Math.max(40, (upwards ? above : below) - gap);
    const width = Math.min(Math.max(rect.width, 150), innerWidth - margin * 2);
    current.list.style.width = `${width}px`;
    current.list.style.maxHeight = `${Math.min(330, available)}px`;
    const height = current.list.getBoundingClientRect().height;
    current.list.style.left = `${Math.max(margin, Math.min(rect.left, innerWidth - width - margin))}px`;
    current.list.style.top = `${Math.max(margin, upwards ? rect.top - height - gap : rect.bottom + gap)}px`;
  }

  function activate(current, index) {
    const entry = current.entries[index];
    if (!entry || entry.option.disabled) return;
    current.active = index;
    current.entries.forEach((item, i) => { item.element.classList.toggle('is-active', i === index); });
    current.button.setAttribute('aria-activedescendant', entry.element.id);
    entry.element.scrollIntoView({block: 'nearest'});
  }

  function refresh(current) {
    const options = [...current.select.options];
    const changed = options.length !== current.entries.length
      || options.some((option, index) => option !== current.entries[index]?.option);
    if (changed) {
      current.entries = options.map((option, index) => {
        const element = document.createElement('div');
        element.id = `${current.select.id}-option-${index}`;
        element.className = 'paper-select-option';
        element.setAttribute('role', 'option');
        element.dataset.index = String(index);
        return {option, element};
      });
      current.list.replaceChildren(...current.entries.map(entry => entry.element));
    }
    for (const {option, element} of current.entries) {
      element.textContent = option.label;
      element.setAttribute('aria-selected', String(option.selected));
      element.setAttribute('aria-disabled', String(option.disabled));
    }
    current.value.textContent = options[current.select.selectedIndex]?.label || '';
    current.button.disabled = current.select.disabled;
    if (current.button.disabled && opened === current) close();
    if (opened === current) place(current);
  }

  function open(current) {
    if (current.select.disabled || dialog.dataset.phase === 'closing') return;
    if (opened === current) { close(); return; }
    close();
    refresh(current);
    opened = current;
    current.button.setAttribute('aria-expanded', 'true');
    current.list.showPopover();
    place(current);
    const index = current.select.selectedIndex >= 0 ? current.select.selectedIndex : 0;
    activate(current, index);
  }

  function choose(current, index) {
    if (!current.entries[index] || current.entries[index].option.disabled || current.select.disabled) return;
    const changed = current.select.selectedIndex !== index;
    current.select.selectedIndex = index;
    refresh(current);
    close(true);
    if (changed) {
      current.select.dispatchEvent(new Event('input', {bubbles: true}));
      current.select.dispatchEvent(new Event('change', {bubbles: true}));
    }
  }

  function move(current, direction) {
    const enabled = current.entries.map((entry, index) => ({entry, index})).filter(item => !item.entry.option.disabled);
    if (!enabled.length) return;
    const position = enabled.findIndex(item => item.index === current.active);
    activate(current, enabled[(position + direction + enabled.length) % enabled.length].index);
  }

  dialog.querySelectorAll('select').forEach(select => {
    const field = select.parentElement;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = `${select.id}-trigger`;
    button.className = 'paper-select-trigger';
    button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    const value = document.createElement('span');
    value.className = 'paper-select-value';
    const arrow = document.createElement('span');
    arrow.className = 'paper-select-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    button.append(value, arrow);
    const list = document.createElement('div');
    list.id = `${select.id}-listbox`;
    list.className = 'paper-select-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('popover', 'manual');
    button.setAttribute('aria-controls', list.id);
    [...select.labels].forEach(label => {
      if (!label.id) label.id = `${select.id}-label`;
      label.htmlFor = button.id;
      button.setAttribute('aria-labelledby', label.id);
      list.setAttribute('aria-labelledby', label.id);
    });
    select.hidden = true;
    select.tabIndex = -1;
    field.append(button, list);
    const current = {select, field, button, value, list, entries: [], active: 0, prefix: '', typedAt: 0};
    instances.push(current);
    refresh(current);
    button.addEventListener('click', () => open(current));
    button.addEventListener('keydown', event => {
      if (event.key === 'Escape' && opened === current) {
        event.preventDefault(); event.stopPropagation(); close(true); return;
      }
      if (event.key === 'Tab') { close(); return; }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (opened === current) choose(current, current.active);
        else open(current);
        return;
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        const wasOpen = opened === current;
        if (!wasOpen) open(current);
        if (event.key === 'Home' || event.key === 'End') {
          const order = current.entries.map((entry, index) => ({entry, index})).filter(item => !item.entry.option.disabled);
          const item = event.key === 'Home' ? order[0] : order[order.length - 1];
          if (item) activate(current, item.index);
        } else if (wasOpen) move(current, event.key === 'ArrowDown' ? 1 : -1);
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.altKey && !event.metaKey) {
        event.preventDefault();
        if (opened !== current) open(current);
        const now = performance.now();
        current.prefix = now - current.typedAt > 650 ? event.key : current.prefix + event.key;
        current.typedAt = now;
        const index = current.entries.findIndex(entry => !entry.option.disabled && entry.option.label.toLocaleLowerCase().startsWith(current.prefix.toLocaleLowerCase()));
        if (index >= 0) activate(current, index);
      }
    });
    list.addEventListener('pointerdown', event => { event.preventDefault(); });
    list.addEventListener('pointermove', event => {
      const option = event.target.closest('.paper-select-option');
      if (option) activate(current, Number(option.dataset.index));
    });
    list.addEventListener('click', event => {
      const option = event.target.closest('.paper-select-option');
      if (option) choose(current, Number(option.dataset.index));
    });
    list.addEventListener('toggle', event => {
      if (event.newState === 'closed' && opened === current && !list.matches(':popover-open')) close();
    });
    select.addEventListener('change', () => refresh(current));
    new MutationObserver(() => refresh(current)).observe(select, {childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'label']});
  });

  document.addEventListener('pointerdown', event => { if (opened && !opened.field.contains(event.target)) close(); }, true);
  document.addEventListener('focusin', event => { if (opened && !opened.field.contains(event.target)) close(); });
  dialog.addEventListener('cancel', event => {
    if (!opened) return;
    event.preventDefault(); event.stopImmediatePropagation(); close(true);
  }, true);
  dialog.addEventListener('close', () => close());
  new MutationObserver(() => {
    if (!dialog.open || dialog.dataset.phase === 'closing') close();
  }).observe(dialog, {attributes: true, attributeFilter: ['open', 'data-phase']});
  window.addEventListener('resize', () => { if (opened) place(opened); });
  window.addEventListener('blur', () => close());
  document.addEventListener('visibilitychange', () => { if (document.hidden) close(); });
  document.addEventListener('scroll', event => {
    if (opened && !opened.list.contains(event.target)) place(opened);
  }, true);

  window.PaperSelects = Object.freeze({refresh: () => instances.forEach(refresh), close: () => close()});
})();
