/* The existing portrait alpha hides location ink behind the real hair outline.
   Only mask coordinates move: there is no second visible portrait or pixel readback. */
(() => {
  'use strict';
  const GPU_PORTRAIT = 2 * 210 / 255 - 1;
  const FLAT_PORTRAIT = .65;
  const finite = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  function alignment(token, room) {
    if (token === 'left' || token === 'top') return 0;
    if (token === 'right' || token === 'bottom') return room;
    if (token?.endsWith('%')) return room * parseFloat(token) / 100;
    if (token?.endsWith('px')) return parseFloat(token);
    return room / 2;
  }
  window.createDeityOcclusion = (root, wrapper, backdrop, portraitURL) => {
    root.deityOcclusion?.dispose?.();
    const portrait = new Image();
    portrait.decoding = 'async';
    const url = new URL(portraitURL, document.baseURI).href;
    const layers = `linear-gradient(#fff 0 0), url(${JSON.stringify(url)})`;
    const properties = ['-webkit-mask-image', '-webkit-mask-size', '-webkit-mask-position',
      '-webkit-mask-repeat', '-webkit-mask-composite', '-webkit-mask-origin', '-webkit-mask-clip',
      'mask-image', 'mask-size', 'mask-position', 'mask-repeat', 'mask-composite', 'mask-mode', 'mask-origin', 'mask-clip'];
    const original = properties.map(property => ({property,
      value: wrapper.style.getPropertyValue(property), priority: wrapper.style.getPropertyPriority(property)}));
    let loaded = false, failed = false, disposed = false, geometry = null, gateKey = '';
    let warmed = false, warmFrame = 0, warmGeneration = 0;
    let x = 0, y = 0, mode = 'idle', active = false, updates = 0;
    const enabled = () => !disposed && loaded && warmed && !!geometry && !root.hidden &&
      (root.dataset.phase === 'ready' || root.dataset.phase === 'closing' || root.classList.contains('assembly-handoff'));
    const coefficient = () => mode === 'layered-2d' ? FLAT_PORTRAIT : GPU_PORTRAIT;
    const offsets = () => ({dx: active ? coefficient() * x * geometry.sx : 0,
      dy: active ? coefficient() * y * geometry.sy : 0});
    function style(property, value) {
      if (wrapper.style.getPropertyValue(property) !== value) wrapper.style.setProperty(property, value);
    }
    function cancelWarm() {
      warmGeneration++;
      cancelAnimationFrame(warmFrame); warmFrame = 0;
    }
    function warmMask() {
      if (disposed || failed || !loaded || warmed || warmFrame || !geometry || root.hidden || document.hidden) return;
      const token = ++warmGeneration;
      // Two visible compositor paints with the real CSS mask precede activation.
      // Image.decode() alone does not warm the CSS mask resource/alpha surface.
      let paints = 0;
      const afterPaint = () => {
        warmFrame = 0;
        if (disposed || token !== warmGeneration || root.hidden || document.hidden) return;
        if (paints++ < 2) { warmFrame = requestAnimationFrame(afterPaint); return; }
        warmed = true; syncMask();
      };
      warmFrame = requestAnimationFrame(afterPaint);
    }
    function syncMask() {
      if (disposed) return;
      // Install the URL once, while the announcement is still in front. Changing
      // `none` to a cold image at handoff can blank the entire title for one paint.
      // A failed image is replaced by an opaque mask, never an empty mask surface.
      const mask = failed ? 'linear-gradient(#fff 0 0)' : layers;
      style('-webkit-mask-image', mask); style('mask-image', mask);
      const occluding = enabled(), delta = geometry ? offsets() : {dx: 0, dy: 0};
      // Keep the full fitted image size during warm-up. Its top strip intersects
      // the last CSS pixel of the full-viewport mask, well below the location ink.
      // Thus the real alpha stack is painted without hiding the announcement;
      // handoff changes only position, not the image, composite mode or scale.
      const left = geometry ? geometry.left - geometry.wrapperLeft + (occluding ? delta.dx : 0) : 0;
      const top = geometry ? (occluding ? geometry.top - geometry.wrapperTop + delta.dy : geometry.wrapperHeight - 1) : 0;
      const position = `0px 0px, ${left.toFixed(3)}px ${top.toFixed(3)}px`;
      const size = `100% 100%, ${(geometry?.width || 0).toFixed(3)}px ${(geometry?.height || 0).toFixed(3)}px`;
      for (const prefix of ['-webkit-', '']) {
        style(`${prefix}mask-size`, size); style(`${prefix}mask-position`, position);
        style(`${prefix}mask-repeat`, 'no-repeat, no-repeat');
        style(`${prefix}mask-origin`, 'border-box'); style(`${prefix}mask-clip`, 'border-box');
      }
      style('-webkit-mask-composite', 'xor'); style('mask-composite', 'exclude');
      style('mask-mode', 'alpha, alpha');
      warmMask();
    }
    function refresh() {
      if (disposed) return;
      const box = backdrop.getBoundingClientRect(), plane = wrapper.getBoundingClientRect();
      const w = backdrop.clientWidth || box.width, h = backdrop.clientHeight || box.height;
      const iw = backdrop.naturalWidth || portrait.naturalWidth, ih = backdrop.naturalHeight || portrait.naturalHeight;
      if (!(w > 0 && h > 0 && iw > 0 && ih > 0 && plane.width > 0 && plane.height > 0)) {
        geometry = null; syncMask(); return;
      }
      const computed = getComputedStyle(backdrop), fit = computed.objectFit;
      let width = w, height = h;
      if (fit === 'contain' || fit === 'cover' || fit === 'scale-down') {
        const scale = fit === 'cover' ? Math.max(w / iw, h / ih) : Math.min(fit === 'scale-down' ? 1 : Infinity, w / iw, h / ih);
        width = iw * scale; height = ih * scale;
      } else if (fit === 'none') { width = iw; height = ih; }
      const [px, py = '50%'] = computed.objectPosition.split(/\s+/);
      const sx = box.width / w, sy = box.height / h;
      geometry = {left: box.left + alignment(px, w - width) * sx,
        top: box.top + alignment(py, h - height) * sy,
        width: width * sx, height: height * sy, sx, sy,
        wrapperLeft: plane.left, wrapperTop: plane.top, wrapperHeight: plane.height};
      syncMask();
    }
    function update(pose = {}) {
      if (disposed) return;
      x = finite(pose.x); y = finite(pose.y);
      mode = typeof pose.mode === 'string' ? pose.mode : mode;
      active = pose.active === true;
      updates++;
      // Layout is cached by refresh; a spring frame performs no geometry reads.
      syncMask();
    }
    function applyToCanvas(ctx, viewport) {
      if (!enabled()) return false;
      const {dx, dy} = offsets();
      ctx.save();
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'destination-out'; ctx.filter = 'none';
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = ctx.shadowOffsetX = ctx.shadowOffsetY = 0;
      // The destination is the transparent ink layer, never the scene itself.
      // Its transform already maps CSS viewport coordinates to snapshot pixels.
      ctx.drawImage(portrait, geometry.left - viewport.left + dx, geometry.top - viewport.top + dy,
        geometry.width, geometry.height);
      ctx.restore();
      return true;
    }
    const observer = new MutationObserver(() => {
      const next = `${root.hidden}|${root.dataset.phase}|${root.classList.contains('assembly-handoff')}`;
      // SpatialPhoto re-adds its engagement class on each draw. Those redundant
      // class mutations must not cause a layout read on every camera frame.
      if (next === gateKey) return;
      gateKey = next;
      if (root.hidden) cancelWarm();
      if (!root.hidden && !geometry) refresh(); else syncMask();
    });
    observer.observe(root, {attributes: true, attributeFilter: ['class', 'data-phase', 'hidden']});
    window.addEventListener('resize', refresh, {passive: true});
    const visibility = () => { if (document.hidden) cancelWarm(); else warmMask(); };
    document.addEventListener('visibilitychange', visibility);
    function dispose() {
      if (disposed) return;
      disposed = true; cancelWarm(); observer.disconnect(); window.removeEventListener('resize', refresh);
      document.removeEventListener('visibilitychange', visibility);
      for (const {property, value, priority} of original) {
        if (value) wrapper.style.setProperty(property, value, priority);
        else wrapper.style.removeProperty(property);
      }
      if (root.deityOcclusion === controller) delete root.deityOcclusion;
    }
    const ready = new Promise(resolve => {
      portrait.onload = async () => {
        try { await portrait.decode(); } catch {}
        loaded = portrait.naturalWidth > 0; failed = !loaded;
        refresh(); resolve(loaded);
      };
      portrait.onerror = () => { failed = true; cancelWarm(); syncMask(); resolve(false); };
      portrait.src = url;
    });
    const controller = Object.freeze({update, refresh, ready, applyToCanvas, dispose,
      getState: () => ({loaded, failed, warmed, warming: Boolean(warmFrame), enabled: enabled(), active, mode, x, y, coefficient: coefficient(), updates,
        offset: geometry ? offsets() : {dx: 0, dy: 0}, rectangle: geometry ? {...geometry} : null})});
    root.deityOcclusion = controller;
    refresh();
    return controller;
  };
})();
