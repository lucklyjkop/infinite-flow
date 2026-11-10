(() => {
  'use strict';

  const dialog = document.createElement('dialog');
  dialog.id = 'common-confirm-dialog';
  dialog.className = 'common-dialog';
  dialog.setAttribute('aria-labelledby', 'common-dialog-title');
  dialog.setAttribute('aria-describedby', 'common-dialog-message');
  dialog.innerHTML = `
    <h2 id="common-dialog-title"></h2>
    <p id="common-dialog-message"></p>
    <p class="common-dialog-status" role="status" aria-live="polite" hidden></p>
    <div class="dialog-actions">
      <button class="quiet-button" type="button" data-close-dialog autofocus>取消</button>
      <button class="primary-button" type="button" data-confirm>确认</button>
    </div>`;
  document.body.append(dialog);
  const title = dialog.querySelector('h2');
  const message = dialog.querySelector('#common-dialog-message');
  const status = dialog.querySelector('.common-dialog-status');
  const cancelButton = dialog.querySelector('[data-close-dialog]');
  const confirmButton = dialog.querySelector('[data-confirm]');
  let current = null;

  function motion() {
    return !matchMedia('(prefers-reduced-motion: reduce)').matches && window.InfiniteSettings?.getState?.().motion !== false;
  }

  function finish(request, value) {
    if (current !== request) return;
    current = null;
    request.signal?.removeEventListener('abort', request.abort);
    request.animation?.cancel();
    if (dialog.open) dialog.close();
    dialog.classList.remove('is-closing');
    dialog.removeAttribute('aria-busy');
    if (request.opener?.isConnected && !request.opener.disabled && !request.opener.closest('[inert]') && request.opener.getClientRects().length) {
      request.opener.focus({preventScroll: true});
    }
    request.resolve(value);
  }

  async function settle(value, immediate = false) {
    const request = current;
    if (!request) return;
    if (immediate) { finish(request, value); return; }
    if (request.closing) return;
    request.closing = true;
    cancelButton.disabled = confirmButton.disabled = true;
    dialog.classList.add('is-closing');
    if (motion() && !document.hidden) {
      request.animation = dialog.animate([
        {opacity: 1, transform: 'translateY(0) scale(1)'},
        {opacity: 0, transform: 'translateY(5px) scale(.985)'},
      ], {duration: 160, easing: 'ease-in', fill: 'both'});
      await request.animation.finished.catch(() => {});
    }
    finish(request, value);
  }

  function confirm({title: heading = '确认操作', message: content = '', confirmText = '确认', cancelText = '取消', opener = document.activeElement, onConfirm, signal} = {}) {
    if (current || signal?.aborted || document.querySelector('dialog[open]')) return Promise.resolve(false);
    return new Promise(resolve => {
      const request = {resolve, opener, onConfirm, signal, busy: false, closing: false, animation: null};
      request.abort = () => { if (current === request) void settle(false, true); };
      current = request;
      title.textContent = heading;
      message.textContent = content;
      cancelButton.textContent = cancelText;
      confirmButton.textContent = confirmText;
      status.textContent = ''; status.hidden = true;
      cancelButton.disabled = confirmButton.disabled = false;
      dialog.classList.remove('is-closing');
      signal?.addEventListener('abort', request.abort, {once: true});
      try {
        dialog.showModal();
        cancelButton.focus({preventScroll: true});
        window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail: {name: 'menu-open', gain: .65}}));
      } catch {
        finish(request, false);
      }
    });
  }

  confirmButton.addEventListener('click', async () => {
    const request = current;
    if (!request || request.busy || request.closing) return;
    request.busy = true;
    dialog.setAttribute('aria-busy', 'true');
    cancelButton.disabled = confirmButton.disabled = true;
    status.textContent = ''; status.hidden = true;
    try {
      const result = await request.onConfirm?.();
      if (current !== request) return;
      if (result !== false) { await settle(true); return; }
    } catch (error) {
      if (current !== request) return;
      status.textContent = error?.userMessage || '操作未完成，请重试。';
      status.hidden = false;
    }
    if (current !== request) return;
    request.busy = false;
    dialog.removeAttribute('aria-busy');
    cancelButton.disabled = confirmButton.disabled = false;
    cancelButton.focus({preventScroll: true});
  });
  cancelButton.addEventListener('click', () => { if (!current?.busy) void settle(false); });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!current?.busy) void settle(false);
  });
  dialog.addEventListener('close', () => { if (current && !dialog.open) finish(current, false); });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog || current?.busy) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) void settle(false);
  });
  for (const name of ['dragstart', 'contextmenu']) dialog.addEventListener(name, event => event.preventDefault());
  window.addEventListener('pagehide', () => void settle(false, true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) current?.animation?.finish(); });
  window.InfiniteDialog = Object.freeze({confirm, cancel: () => settle(false, true), getState: () => ({open: dialog.open, busy: Boolean(current?.busy)})});
})();
