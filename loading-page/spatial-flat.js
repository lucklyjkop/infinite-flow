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

  window.createFlatSpatialRenderer = (canvas, plate, portrait, options = {}) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const requested = options.depthOfField;
    const value = requested === true ? 2.4 : Number(typeof requested === 'object' && requested ? requested.radius : requested);
    const radius = Number.isFinite(value) ? Math.max(0, Math.min(6, value)) : 0;
    let blurredPlate = null, blurKey = '', disposed = false;
    let width, height, left, top, photoWidth, photoHeight;

    function prepareBackground(dpr) {
      if (!radius) return;
      const resolution = Math.min(dpr, 3072 / Math.max(photoWidth, photoHeight));
      const w = Math.max(1, Math.round(photoWidth * resolution));
      const h = Math.max(1, Math.round(photoHeight * resolution));
      const key = `${w}:${h}:${resolution}:${radius}`;
      if (blurredPlate && key === blurKey) return;
      const padding = Math.ceil(radius * resolution * 3) + 2;
      const padded = document.createElement('canvas'), filtered = document.createElement('canvas');
      padded.width = filtered.width = w + padding * 2;
      padded.height = filtered.height = h + padding * 2;
      const preparation = padded.getContext('2d');
      const iw = plate.naturalWidth, ih = plate.naturalHeight;
      // Extend edge pixels before blurring; a transparent padded border would
      // otherwise darken the photo edge when the spatial camera pans across it.
      const xs = [[0, iw, padding, w], [0, 1, 0, padding], [iw - 1, 1, padding + w, padding]];
      const ys = [[0, ih, padding, h], [0, 1, 0, padding], [ih - 1, 1, padding + h, padding]];
      for (const [sx, sw, x, dw] of xs) for (const [sy, sh, y, dh] of ys) {
        preparation.drawImage(plate, sx, sy, sw, sh, x, y, dw, dh);
      }
      const filter = filtered.getContext('2d');
      filter.filter = `blur(${radius * resolution}px)`;
      filter.drawImage(padded, 0, 0);
      if (blurredPlate) blurredPlate.width = blurredPlate.height = 1;
      blurredPlate = document.createElement('canvas');
      blurredPlate.width = w; blurredPlate.height = h;
      blurredPlate.getContext('2d').drawImage(filtered, padding, padding, w, h, 0, 0, w, h);
      padded.width = padded.height = filtered.width = filtered.height = 1;
      blurKey = key;
    }

    function resize(w, h, fit, position) {
      if (disposed || !(w > 0 && h > 0)) return false;
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
      // Prepare once per fitted size, never blur a full-resolution layer per frame.
      prepareBackground(dpr);
      return true;
    }

    function layer(image, dx, dy) {
      const xs = strips(left, photoWidth, dx, image.naturalWidth || image.width);
      const ys = strips(top, photoHeight, dy, image.naturalHeight || image.height);
      for (const [sx, sw, x, w] of xs) {
        for (const [sy, sh, y, h] of ys) {
          ctx.drawImage(image, sx, sy, sw, sh, x, y, w, h);
        }
      }
    }

    function draw(dx, dy) {
      if (disposed) return false;
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.beginPath();
      ctx.rect(left, top, photoWidth, photoHeight);
      ctx.clip();
      layer(blurredPlate || plate, -.20 * dx, -.20 * dy);
      layer(portrait, .65 * dx, .65 * dy);
      ctx.restore();
      return true;
    }
    return { depthOfField: radius, resize, draw, dispose() {
      if (disposed) return;
      disposed = true;
      if (blurredPlate) blurredPlate.width = blurredPlate.height = 1;
      blurredPlate = null; blurKey = '';
      canvas.width = canvas.height = 1;
    } };
  };
})();
