/* Local-file / no-WebGL fallback for the same backplate and matted portrait. */
(() => {
  'use strict';

  function positionFraction(value) {
    if (value === 'left' || value === 'top') return 0;
    if (value === 'right' || value === 'bottom') return 1;
    return value?.endsWith('%') ? parseFloat(value) / 100 : .5;
  }

  // Match the GPU's clamp-to-edge sampling at the edge of the photograph.
  function strips(start, size, offset, sourceSize) {
    const parts = [[0, sourceSize, start + offset, size]];
    if (offset > 0) parts.push([0, 1, start, offset]);
    if (offset < 0) parts.push([sourceSize - 1, 1, start + size + offset, -offset]);
    return parts;
  }

  window.createFlatSpatialRenderer = (canvas, plate, portrait) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    let width, height, left, top, photoWidth, photoHeight;

    function resize(w, h, fit, position) {
      width = w;
      height = h;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
      const sx = w / plate.naturalWidth, sy = h / plate.naturalHeight;
      const scale = fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
      photoWidth = plate.naturalWidth * scale;
      photoHeight = plate.naturalHeight * scale;
      const [x, y] = position.split(/\s+/);
      left = (width - photoWidth) * positionFraction(x);
      top = (height - photoHeight) * positionFraction(y);
    }

    function layer(image, dx, dy) {
      const xs = strips(left, photoWidth, dx, image.naturalWidth);
      const ys = strips(top, photoHeight, dy, image.naturalHeight);
      for (const [sx, sw, x, w] of xs) {
        for (const [sy, sh, y, h] of ys) {
          ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
        }
      }
    }

    function draw(dx, dy) {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, photoWidth, photoHeight);
      ctx.clip();
      layer(plate, -.20 * dx, -.20 * dy);
      layer(portrait, .65 * dx, .65 * dy);
      ctx.restore();
      return true;
    }
    return { resize, draw, dispose() { canvas.width = canvas.height = 1; } };
  };
})();
