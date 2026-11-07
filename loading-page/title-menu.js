(() => {
  'use strict';

  const world = document.getElementById('world');
  const screen = document.getElementById('title-screen');
  const menu = document.getElementById('title-menu');
  const exitScreen = document.getElementById('exit-screen');
  const exitDialog = document.getElementById('exit-dialog');
  const noticeDialog = document.getElementById('notice-dialog');
  const settingsController = window.InfiniteSettings;
  const continueButton = menu.querySelector('[data-menu-action="continue"]');
  const buttons = [...menu.querySelectorAll('[data-menu-action]')];
  const dialogs = [exitDialog, noticeDialog];
  const dialogOpeners = new WeakMap();
  const saveKey = 'infinite.save.v1';
  let exited = false;
  let starting = null;

  function readStorage(key) {
    try { return JSON.parse(localStorage.getItem(key)); }
    catch { return null; }
  }

  function writeStorage(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch { return false; }
  }

  function normalizeSave(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || typeof value.id !== 'string' || !value.id.trim()) return null;
    try {
      // Make the save independent of the caller and verify it can be persisted.
      return JSON.parse(JSON.stringify({ ...value, id: value.id.trim() }));
    } catch { return null; }
  }

  let save = normalizeSave(readStorage(saveKey));

  function selectButton(button, focus = false, audible = false) {
    if (!button || button.disabled) return;
    const changed = !button.classList.contains('is-selected');
    buttons.forEach(item => {
      item.classList.toggle('is-selected', item === button);
      item.dataset.selected = String(item === button);
    });
    if (focus) button.focus({ preventScroll: true });
    if (changed && audible && world.dataset.state === 'title' && !document.querySelector('dialog[open]')) {
      window.dispatchEvent(new CustomEvent('infinite:soundcue', {
        detail: {name: 'ui-focus', group: 'ui-selection', gain: .8, pan: -.2},
      }));
    }
  }

  function updateContinue() {
    continueButton.disabled = !save;
    continueButton.title = save ? (typeof save.title === 'string' ? save.title : '继续上次的旅程') : '暂无存档';
    if (!save && continueButton.classList.contains('is-selected')) selectButton(buttons[0]);
  }

  function closeDialogs() {
    settingsController.close({immediate: true, restoreFocus: false});
    dialogs.forEach(dialog => { if (dialog.open) dialog.close(); });
  }

  function openDialog(dialog, opener = document.activeElement) {
    if (dialog.open) return;
    closeDialogs();
    dialogOpeners.set(dialog, opener);
    dialog.showModal();
  }

  function cancelStart() {
    if (!starting) return;
    const action = starting;
    starting = null;
    action.player?.cancel();
    screen.inert = false;
    if (world.dataset.state === 'starting' || world.dataset.state === 'start-ended') {
      world.dataset.state = 'title';
      window.dispatchEvent(new Event('infinite:starttransitionend'));
    }
  }

  function show() {
    cancelStart();
    exited = false;
    exitScreen.hidden = true;
    screen.hidden = false;
    world.dataset.state = 'title';
    updateContinue();
    selectButton(buttons.find(button => button.classList.contains('is-selected') && !button.disabled) || buttons[0], true);
    window.dispatchEvent(new CustomEvent('infinite:title'));
  }

  function hide() {
    cancelStart();
    screen.hidden = true;
    exitScreen.hidden = true;
    exited = false;
    closeDialogs();
  }

  function returnToTitle() {
    closeDialogs();
    show();
    window.dispatchEvent(new CustomEvent('infinite:returntitle'));
    selectButton(buttons[0], true);
  }

  function startGame(mode, opener, pointer) {
    if (starting || world.dataset.state !== 'title') return;
    if (mode === 'continue' && !save) return;
    const detail = { mode, save: mode === 'continue' ? normalizeSave(save) : null };
    const action = {player: null};
    if (mode === 'new') {
      starting = action;
      detail.playTransition = () => {
        if (starting !== action) return Promise.resolve(false);
        if (!action.player) {
          screen.inert = true;
          action.player = window.playStartWave(world, {motion: settingsController.getState().motion, pointer});
        }
        return action.player.finished;
      };
    }
    // Keep the original synchronous, cancelable activation for game hosts.
    const unhandled = window.dispatchEvent(new CustomEvent('infinite:startgame', {
      cancelable: true, detail,
    }));
    if (!unhandled) {
      if (starting === action && !action.player) starting = null;
      return;
    }
    const showNotice = () => {
      document.getElementById('notice-message').textContent = '首个世界尚未开放。';
      openDialog(noticeDialog, opener);
    };
    if (mode === 'new') {
      detail.playTransition().then(completed => {
        if (completed && starting === action) showNotice();
      });
    } else {
      showNotice();
    }
  }

  menu.addEventListener('click', event => {
    const button = event.target.closest('[data-menu-action]');
    if (!button || !menu.contains(button) || button.disabled || starting) return;
    // Play activation before its transition changes inert/disabled state. The
    // document's generic click handler skips these actions to avoid a double tap.
    window.dispatchEvent(new CustomEvent('infinite:soundcue', {
      detail: {name: 'ui-tap', group: 'title-click', gain: 1.15, pan: -.2},
    }));
    selectButton(button);
    switch (button.dataset.menuAction) {
      case 'new': startGame('new', button, event.detail ? event : null); break;
      case 'continue': startGame('continue', button); break;
      case 'settings': closeDialogs(); settingsController.open(button); break;
      case 'exit': openDialog(exitDialog, button); break;
    }
  });

  menu.addEventListener('keydown', event => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const enabled = buttons.filter(button => !button.disabled);
    const current = enabled.indexOf(document.activeElement);
    let next;
    if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = enabled.length - 1;
    else if (event.key === 'ArrowDown') next = (current + 1) % enabled.length;
    else next = (current - 1 + enabled.length) % enabled.length;
    event.preventDefault();
    selectButton(enabled[next], true, true);
  });

  buttons.forEach(button => {
    button.addEventListener('pointerenter', () => selectButton(button, false, true));
    button.addEventListener('focus', () => selectButton(button, false, true));
  });

  dialogs.forEach(dialog => {
    dialog.addEventListener('click', event => {
      if (event.target.closest('[data-close-dialog]')) dialog.close();
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right
        || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener('close', () => {
      if (dialog === noticeDialog && !dialog.open && starting && world.dataset.state === 'start-ended') {
        returnToTitle();
        return;
      }
      const opener = dialogOpeners.get(dialog);
      if (opener && !opener.disabled && opener.getClientRects().length
        && !document.querySelector('dialog[open]')) opener.focus({ preventScroll: true });
    });
  });

  document.getElementById('confirm-exit').addEventListener('click', () => {
    hide();
    exited = true;
    exitScreen.hidden = false;
    world.dataset.state = 'exited';
    window.dispatchEvent(new CustomEvent('infinite:exit'));
    document.getElementById('return-title').focus({ preventScroll: true });
  });
  document.getElementById('return-title').addEventListener('click', returnToTitle);

  window.addEventListener('storage', event => {
    if (event.key === saveKey || event.key === null) {
      save = normalizeSave(readStorage(saveKey));
      updateContinue();
    }
  });

  window.InfiniteTitle = Object.freeze({
    show,
    hide,
    returnToTitle,
    setSave(value) {
      const next = normalizeSave(value);
      if (!next) return false;
      save = next;
      const persisted = writeStorage(saveKey, save);
      updateContinue();
      return persisted;
    },
    clearSave() {
      save = null;
      writeStorage(saveKey, null);
      updateContinue();
    },
    getState() { return { visible: !screen.hidden, exited, settings: settingsController.getState(), save: normalizeSave(save) }; },
  });

  selectButton(buttons[0]);
  updateContinue();
})();
