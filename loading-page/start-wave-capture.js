/* Snapshot the art beneath the menu. The scene's live brightness, atmosphere
   and vignette are composited above this texture by the same DOM as before. */
(() => {
  'use strict';

  function align(token, spare) {
    if (token === 'top' || token === 'left') return 0;
    if (token === 'bottom' || token === 'right') return spare;
    if (token?.endsWith('%')) return spare * parseFloat(token) / 100;
    if (token?.endsWith('px')) return parseFloat(token);
    return spare / 2;
  }

  window.captureStartWaveScene = function captureStartWaveScene(world) {
    const photo = world.querySelector('#world-art');
    const viewport = world.querySelector('.scene').getBoundingClientRect();
    if (!photo?.naturalWidth || !viewport.width || !viewport.height) return null;
    // captureSource and drawImage must run in one task to copy the WebGL frame.
    const source = window.InfiniteSpatial?.captureSource?.() || photo;
    const bounds = source.getBoundingClientRect();
    const style = getComputedStyle(source);
    const x = bounds.left - viewport.left, y = bounds.top - viewport.top;
    const contain = style.objectFit === 'contain';
    const fit = contain ? Math.min : Math.max;
    const scale = fit(source.clientWidth / photo.naturalWidth, source.clientHeight / photo.naturalHeight);
    const imageW = photo.naturalWidth * scale, imageH = photo.naturalHeight * scale;
    const [positionX, positionY] = style.objectPosition.split(/\s+/);
    const u = align(positionX, source.clientWidth - imageW);
    const v = align(positionY, source.clientHeight - imageH);
    const sx = bounds.width / source.clientWidth, sy = bounds.height / source.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    // Browsers snap the image's object-fit paint rectangle to device pixels
    // before the outer CSS breathing transform; preserve that origin as well.
    const snap = value => source === photo ? Math.round(value * dpr) / dpr : value;
    const left = x + snap(u) * sx, top = y + snap(v) * sy;
    const w = (snap(u + imageW) - snap(u)) * sx, h = (snap(v + imageH) - snap(v)) * sy;

    const canvas = document.createElement('canvas');
    const density = Math.min(dpr, 2,
      3072 / Math.max(viewport.width, viewport.height),
      Math.sqrt(4194304 / (viewport.width * viewport.height)));
    canvas.width = Math.max(1, Math.round(viewport.width * density));
    canvas.height = Math.max(1, Math.round(viewport.height * density));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.scale(canvas.width / viewport.width, canvas.height / viewport.height);
    if (contain) {
      // The live layered renderer clips edge-extended texels with CSS clip-path.
      ctx.beginPath();
      ctx.rect(left, top, w, h);
      ctx.clip();
    }
    if (source === photo) ctx.drawImage(photo, left, top, w, h);
    else ctx.drawImage(source, x, y, bounds.width, bounds.height);
    return canvas;
  };
})();
