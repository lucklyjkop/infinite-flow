/* Canvas 2D projection of the same continuous photo surface used by the GPU. */
(() => {
  'use strict';

  function alignment(token, spare) {
    if (token === 'left' || token === 'top') return 0;
    if (token === 'right' || token === 'bottom') return spare;
    if (/^-?[\d.]+%$/.test(token)) return spare * parseFloat(token) / 100;
    if (/^-?[\d.]+px$/.test(token)) return parseFloat(token);
    const calc = /^calc\(\s*(-?[\d.]+)%\s*([+-])\s*([\d.]+)px\s*\)$/.exec(token);
    if (calc) return spare * Number(calc[1]) / 100 + (calc[2] === '-' ? -1 : 1) * Number(calc[3]);
    return spare / 2;
  }

  function smoothRim(distance, width) {
    const t = Math.min(1, Math.max(0, distance / width));
    return t * t * (3 - 2 * t);
  }

  function makeGrid(geometry) {
    const { cols: sourceCols, rows: sourceRows, depth, ringLock } = geometry || {};
    const count = (sourceCols + 1) * (sourceRows + 1);
    if (!Number.isInteger(sourceCols) || !Number.isInteger(sourceRows) ||
        sourceCols < 1 || sourceRows < 1 || count > 65535 || typeof depth !== 'string') return null;
    let bytes, lock;
    try {
      bytes = atob(depth);
      lock = typeof ringLock === 'string' ? atob(ringLock) : '';
    } catch { return null; }
    if (bytes.length !== count || (lock && lock.length !== count)) return null;

    // One extra band next to each picture edge decouples the fixed border
    // from the close-by arc on coarse grids.
    function stops(full, cap) {
      const n = Math.min(cap, full);
      const values = Array.from({ length: n + 1 }, (_, i) => i / n);
      if (n < full) values.push(1 / full, 1 - 1 / full);
      return values.sort((a, b) => a - b);
    }
    const us = stops(sourceCols, 20), vs = stops(sourceRows, 12);
    const cols = us.length - 1, rows = vs.length - 1;
    const points = [], cells = [];
    const read = (x, y) => bytes.charCodeAt(y * (sourceCols + 1) + x);
    for (let y = 0; y <= rows; y++) {
      for (let x = 0; x <= cols; x++) {
        const u = us[x], v = vs[y], sx = u * sourceCols, sy = v * sourceRows;
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const x1 = Math.min(x0 + 1, sourceCols), y1 = Math.min(y0 + 1, sourceRows);
        const wx = sx - x0, wy = sy - y0;
        const top = read(x0, y0) * (1 - wx) + read(x1, y0) * wx;
        const bottom = read(x0, y1) * (1 - wx) + read(x1, y1) * wx;
        const inverseZ = .46 + 1.35 * (top * (1 - wy) + bottom * wy) / 255;
        points.push({ u, v, inverseZ, rigidWeight: 0, x: 0, y: 0, rim: 0, px: 0, py: 0 });
      }
    }
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * (cols + 1) + x;
        const cell = { a: points[i], b: points[i + 1], c: points[i + cols + 1],
          d: points[i + cols + 2], tile: null, minimumArea: 0 };
        // A coarse cell crossed by the hoop must move rigidly all the way
        // through. Checking just its four corners would miss arcs between them.
        if (lock) {
          let strength = 0;
          const left = Math.floor(us[x] * sourceCols), right = Math.ceil(us[x + 1] * sourceCols);
          const top = Math.floor(vs[y] * sourceRows), bottom = Math.ceil(vs[y + 1] * sourceRows);
          for (let row = top; row <= bottom; row++) {
            for (let col = left; col <= right; col++) {
              strength = Math.max(strength, lock.charCodeAt(row * (sourceCols + 1) + col));
            }
          }
          for (const point of [cell.a, cell.b, cell.c, cell.d]) {
            point.rigidWeight = Math.max(point.rigidWeight, strength / 255);
          }
        }
        cells.push(cell);
      }
    }
    return { cols, rows, points, cells };
  }

  window.createSpatialLayerRenderer = function createSpatialLayerRenderer(canvas, image, geometry) {
    if (!canvas || !image?.naturalWidth) return null;
    const grid = makeGrid(geometry);
    const context = canvas.getContext('2d', { alpha: true });
    if (!grid || !context) return null;
    const texture = document.createElement('canvas');
    const textureContext = texture.getContext('2d', { alpha: false });
    if (!textureContext) return null;
    let dpr = 1, layout = null, disposed = false;

    function resize(width, height, fit = 'cover', position = '50% 50%') {
      if (disposed || !(width > 0 && height > 0)) return false;
      dpr = Math.min(devicePixelRatio || 1, 1.25, 3072 / Math.max(width, height));
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      const sx = width / image.naturalWidth, sy = height / image.naturalHeight;
      const scale = fit === 'contain' ? Math.min(sx, sy) : Math.max(sx, sy);
      const w = image.naturalWidth * scale * dpr, h = image.naturalHeight * scale * dpr;
      let [posX, posY] = String(position).match(/calc\([^)]*\)|[^\s]+/g) || [];
      if (posX === 'top' || posX === 'bottom' || posY === 'left' || posY === 'right') [posX, posY] = [posY, posX];
      const x = alignment(posX, canvas.width - w), y = alignment(posY, canvas.height - h);
      const rim = Math.max(20 * dpr, Math.min(145 * dpr, Math.min(w, h) * .14));
      layout = { x, y, w, h, focal: canvas.height * 1.4 };
      for (const point of grid.points) {
        point.x = x + w * point.u - canvas.width / 2;
        point.y = y + h * point.v - canvas.height / 2;
        point.rim = smoothRim(Math.min(point.u, 1 - point.u) * w, rim) *
          smoothRim(Math.min(point.v, 1 - point.v) * h, rim);
      }
      const sampleScale = Math.min(1, w / image.naturalWidth, 3072 / image.naturalWidth);
      const photoWidth = Math.max(1, Math.round(image.naturalWidth * sampleScale));
      const photoHeight = Math.max(1, Math.round(image.naturalHeight * sampleScale));
      // Edge texels serve as a two-pixel sampling guard at the photo boundary.
      texture.width = photoWidth + 4;
      texture.height = photoHeight + 4;
      textureContext.drawImage(image, 2, 2, photoWidth, photoHeight);
      textureContext.drawImage(texture, 2, 2, 1, photoHeight, 0, 2, 2, photoHeight);
      textureContext.drawImage(texture, photoWidth + 1, 2, 1, photoHeight, photoWidth + 2, 2, 2, photoHeight);
      textureContext.drawImage(texture, 0, 2, texture.width, 1, 0, 0, texture.width, 2);
      textureContext.drawImage(texture, 0, photoHeight + 1, texture.width, 1, 0, photoHeight + 2, texture.width, 2);
      for (const cell of grid.cells) {
        const du = cell.b.u - cell.a.u, dv = cell.c.v - cell.a.v;
        const tw = photoWidth * du, th = photoHeight * dv;
        const tx = 2 + photoWidth * cell.a.u, ty = 2 + photoHeight * cell.a.v;
        cell.minimumArea = .18 * (w * du) * (h * dv);
        const l = Math.max(0, tx - 5), t = Math.max(0, ty - 5);
        const r = Math.min(texture.width, tx + tw + 5), b = Math.min(texture.height, ty + th + 5);
        cell.tile = [l, t, r - l, b - t, (l - tx) / tw, (t - ty) / th, (r - l) / tw, (b - t) / th];
      }
      return true;
    }

    function project(dx, dy) {
      const invFocalSquared = .92 / (layout.focal * layout.focal);
      for (const p of grid.points) {
        // Small-angle camera orbit around the focus plane.
        const perspective = 1 / (1 + (dx * p.x + dy * p.y) * invFocalSquared);
        const travel = p.inverseZ - .92;
        const shiftedX = (p.x + travel * dx) * perspective;
        const shiftedY = (p.y + travel * dy) * perspective;
        const relief = p.rim * (1 - p.rigidWeight);
        const rigidTravel = p.rim > 0 ? -.20 * p.rigidWeight : 0;
        p.px = canvas.width / 2 + p.x + (shiftedX - p.x) * relief + dx * rigidTravel;
        p.py = canvas.height / 2 + p.y + (shiftedY - p.y) * relief + dy * rigidTravel;
      }
      // Shared edges and a fixed boundary give a one-to-one surface while
      // every triangle keeps its orientation and a useful positive area.
      for (const { a, b, c, d, minimumArea } of grid.cells) {
        const diagonalX = d.px - a.px, diagonalY = d.py - a.py;
        const upper = (b.px - a.px) * diagonalY - (b.py - a.py) * diagonalX;
        const lower = diagonalX * (c.py - a.py) - diagonalY * (c.px - a.px);
        if (Math.min(upper, lower) < minimumArea) return false;
      }
      return true;
    }

    function paintTriangle(a, b, c, tile, m11, m12, m21, m22) {
      // Independently antialiased clips can leave a hairline between cells.
      // Make only the sample guard extend 1.15 backing pixels past the seam.
      const ab = Math.hypot(b.px - a.px, b.py - a.py);
      const bc = Math.hypot(c.px - b.px, c.py - b.py);
      const ca = Math.hypot(a.px - c.px, a.py - c.py);
      const perimeter = ab + bc + ca;
      const area = (b.px - a.px) * (c.py - a.py) - (b.py - a.py) * (c.px - a.px);
      const ix = (bc * a.px + ca * b.px + ab * c.px) / perimeter;
      const iy = (bc * a.py + ca * b.py + ab * c.py) / perimeter;
      const pad = 1.15 * perimeter / area;
      context.save();
      context.beginPath();
      context.moveTo(a.px + (a.px - ix) * pad, a.py + (a.py - iy) * pad);
      context.lineTo(b.px + (b.px - ix) * pad, b.py + (b.py - iy) * pad);
      context.lineTo(c.px + (c.px - ix) * pad, c.py + (c.py - iy) * pad);
      context.closePath();
      context.clip();
      context.setTransform(m11, m12, m21, m22, a.px, a.py);
      context.drawImage(texture, ...tile);
      context.restore();
    }

    function draw(offsetX = 0, offsetY = 0) {
      if (disposed || !layout || !Number.isFinite(offsetX) || !Number.isFinite(offsetY)) return false;
      let dx = Math.max(-30, Math.min(30, offsetX)) * dpr;
      let dy = Math.max(-16, Math.min(16, offsetY)) * dpr;
      for (let attempt = 0; !project(dx, dy); attempt++) {
        dx *= .6;
        dy *= .6;
        if (attempt === 5) { dx = 0; dy = 0; break; }
      }
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
      const { x, y, w, h } = layout;
      if (!dx && !dy) {
        context.drawImage(image, x, y, w, h);
        return true;
      }
      context.save();
      context.beginPath();
      context.rect(x, y, w, h);
      context.clip();
      for (const { a, b, c, d, tile } of grid.cells) {
        if (Math.max(a.px, b.px, c.px, d.px) < -2 || Math.min(a.px, b.px, c.px, d.px) > canvas.width + 2 ||
            Math.max(a.py, b.py, c.py, d.py) < -2 || Math.min(a.py, b.py, c.py, d.py) > canvas.height + 2) continue;
        paintTriangle(a, b, d, tile, b.px - a.px, b.py - a.py, d.px - b.px, d.py - b.py);
        paintTriangle(a, d, c, tile, d.px - c.px, d.py - c.py, c.px - a.px, c.py - a.py);
      }
      context.restore();
      return true;
    }

    function dispose() {
      if (disposed) return;
      disposed = true;
      layout = null;
      texture.width = texture.height = 1;
      context.setTransform(1, 0, 0, 1, 0, 0);
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
    return { resize, draw, dispose };
  };
})();
