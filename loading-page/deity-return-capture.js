/* Synchronous, same-origin snapshots for the cube-wave handoff. Paint the live
   photograph and the existing UI assets without SVG foreignObject or a DOM clone. */
(() => {
  'use strict';
  const images = new Map();
  const assets = [
    'assets/menu-ui/sakura-idle.webp', 'assets/menu-ui/sakura-selected.webp',
    'assets/menu-ui/sakura-locked.webp', 'assets/menu-ui/sakura-calligraphy.webp',
    'assets/menu-ui/sakura-branch.webp', 'assets/menu-ui/label-new.png',
    'assets/menu-ui/label-continue.png', 'assets/menu-ui/label-settings.png',
    'assets/menu-ui/label-exit.png', 'assets/deity-space/ui-avatar-frame.webp',
    'assets/deity-space/ui-avatar-active.webp', 'assets/deity-space/ui-confirm.webp',
    'assets/deity-space/nai-avatar.webp', 'assets/deity-space/location-title.webp',
  ];
  const number = (value, fallback = 0) => Number.isFinite(parseFloat(value)) ? parseFloat(value) : fallback;
  function load(url) {
    const key = new URL(url, document.baseURI).href;
    if (images.has(key)) return images.get(key);
    const image = new Image();
    const entry = {image, ready: null};
    images.set(key, entry);
    entry.ready = new Promise(resolve => {
      image.onload = async () => { try { await image.decode(); } catch {} resolve(image); };
      image.onerror = () => resolve(null);
      image.src = key;
    });
    return entry;
  }
  // The controller can await this before enabling its return button. CSS images
  // are decoded ahead of capture, including the menu's three pseudo-element plates.
  const ready = Promise.all(assets.map(url => load(url).ready));
  function split(value) {
    const parts = []; let depth = 0, quote = '', start = 0;
    for (let i = 0; i < value.length; i++) {
      const char = value[i];
      if (quote) { if (char === quote && value[i - 1] !== '\\') quote = ''; continue; }
      if (char === '"' || char === "'") { quote = char; continue; }
      if (char === '(') depth++;
      if (char === ')') depth--;
      if (char === ',' && depth === 0) { parts.push(value.slice(start, i).trim()); start = i + 1; }
    }
    parts.push(value.slice(start).trim());
    return parts;
  }
  function surface(viewport) {
    if (!viewport.width || !viewport.height) return null;
    const image = document.createElement('canvas');
    const density = Math.min(window.devicePixelRatio || 1, 1.5, 1920 / Math.max(viewport.width, viewport.height));
    image.width = Math.max(1, Math.round(viewport.width * density));
    image.height = Math.max(1, Math.round(viewport.height * density));
    const ctx = image.getContext('2d');
    if (!ctx) return null;
    ctx.scale(image.width / viewport.width, image.height / viewport.height);
    return {image, ctx, width: viewport.width, height: viewport.height};
  }
  function box(element, viewport) {
    const rect = element.getBoundingClientRect();
    return {x: rect.left - viewport.left, y: rect.top - viewport.top, width: rect.width, height: rect.height};
  }
  function align(token, spare) {
    if (token === 'left' || token === 'top') return 0;
    if (token === 'right' || token === 'bottom') return spare;
    if (token?.endsWith('%')) return spare * number(token) / 100;
    if (token?.endsWith('px')) return number(token);
    return spare / 2;
  }
  function fitImage(ctx, image, rect, fit = 'fill', position = '50% 50%') {
    const width = image.naturalWidth || image.width, height = image.naturalHeight || image.height;
    if (!width || !height || !rect.width || !rect.height) return;
    let w = rect.width, h = rect.height;
    if (fit === 'contain' || fit === 'cover') {
      const scale = (fit === 'contain' ? Math.min : Math.max)(w / width, h / height);
      w = width * scale; h = height * scale;
    } else if (fit === 'none') { w = width; h = height; }
    const [px, py = '50%'] = position.split(/\s+/);
    ctx.save(); ctx.beginPath(); ctx.rect(rect.x, rect.y, rect.width, rect.height); ctx.clip();
    ctx.drawImage(image, rect.x + align(px, rect.width - w), rect.y + align(py, rect.height - h), w, h);
    ctx.restore();
  }
  function stops(gradient, values, length) {
    const list = values.map(value => {
      const match = value.match(/^(.*?)(?:\s+(-?[\d.]+)(%|px))?$/);
      return {color: match[1], position: match[2] == null ? null : number(match[2]) / (match[3] === '%' ? 100 : Math.max(1, length))};
    });
    if (!list.length) return;
    list[0].position ??= 0; list[list.length - 1].position ??= 1;
    for (let i = 1; i < list.length; i++) {
      if (list[i].position != null) { list[i].position = Math.max(list[i - 1].position, list[i].position); continue; }
      let end = i + 1;
      while (list[end].position == null) end++;
      const from = list[i - 1].position, to = Math.max(from, list[end].position), count = end - i + 1;
      for (let j = i; j < end; j++) list[j].position = from + (to - from) * (j - i + 1) / count;
      i = end - 1;
    }
    list.forEach(stop => { try { gradient.addColorStop(Math.max(0, Math.min(1, stop.position)), stop.color); } catch {} });
  }
  function gradient(ctx, value, rect) {
    const parts = split(value.slice(value.indexOf('(') + 1, -1));
    if (value.startsWith('linear-gradient')) {
      let angle = Math.PI, first = parts[0];
      if (/deg$/.test(first)) { angle = number(first) * Math.PI / 180; parts.shift(); }
      else if (first.startsWith('to ')) {
        angle = first.includes('right') ? Math.PI / 2 : first.includes('left') ? -Math.PI / 2 : first.includes('top') ? 0 : Math.PI;
        parts.shift();
      }
      const dx = Math.sin(angle), dy = -Math.cos(angle), extent = Math.abs(rect.width * dx) + Math.abs(rect.height * dy);
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      const fill = ctx.createLinearGradient(x - dx * extent / 2, y - dy * extent / 2, x + dx * extent / 2, y + dy * extent / 2);
      stops(fill, parts, extent); ctx.fillStyle = fill; ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    } else if (value.startsWith('radial-gradient')) {
      let px = .5, py = .5;
      if (/^(ellipse|circle|at )/.test(parts[0])) {
        const position = parts.shift().match(/at\s+([\d.]+)%\s+([\d.]+)%/);
        if (position) { px = number(position[1]) / 100; py = number(position[2]) / 100; }
      }
      const cx = rect.width * px, cy = rect.height * py;
      // CSS's default ellipse reaches the farthest corner; the ellipse aspect
      // follows the farthest sides, then both radii grow by sqrt(2).
      const rx = Math.max(cx, rect.width - cx) * Math.SQRT2, ry = Math.max(cy, rect.height - cy) * Math.SQRT2;
      ctx.save(); ctx.translate(rect.x + cx, rect.y + cy); ctx.scale(rx, ry);
      const fill = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      stops(fill, parts, Math.max(rx, ry)); ctx.fillStyle = fill;
      ctx.fillRect(-cx / rx, -cy / ry, rect.width / rx, rect.height / ry); ctx.restore();
    }
  }
  function backgrounds(ctx, style, rect) {
    if (style.backgroundColor && style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent') {
      ctx.fillStyle = style.backgroundColor; ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
    }
    const layers = split(style.backgroundImage || 'none');
    const sizes = split(style.backgroundSize || 'auto'), positions = split(style.backgroundPosition || '50% 50%');
    for (let i = layers.length - 1; i >= 0; i--) {
      const value = layers[i];
      if (value.includes('gradient(')) { gradient(ctx, value, rect); continue; }
      const match = value.match(/^url\(["']?(.*?)["']?\)$/);
      if (!match) continue;
      const image = load(match[1]).image;
      if (!image.complete || !image.naturalWidth) continue;
      const size = sizes[i % sizes.length], position = positions[i % positions.length];
      if (size === 'cover' || size === 'contain') { fitImage(ctx, image, rect, size, position); continue; }
      const [a = 'auto', b = 'auto'] = size.split(/\s+/);
      const dimension = (v, extent, fallback) => v === 'auto' ? fallback : v.endsWith('%') ? extent * number(v) / 100 : number(v);
      let w = dimension(a, rect.width, image.naturalWidth), h = dimension(b, rect.height, image.naturalHeight);
      if (a === 'auto' && b !== 'auto') w = h * image.naturalWidth / image.naturalHeight;
      if (b === 'auto' && a !== 'auto') h = w * image.naturalHeight / image.naturalWidth;
      const [px, py = '50%'] = position.split(/\s+/);
      ctx.drawImage(image, rect.x + align(px, rect.width - w), rect.y + align(py, rect.height - h), w, h);
    }
  }
  function text(ctx, node, style, viewport) {
    const value = node.nodeValue;
    if (!value?.trim()) return;
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.fillStyle = style.color; ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fontKerning = 'none';
    const shadow = split(style.textShadow || 'none')[0].match(/^(.*?)\s+(-?[\d.]+)px\s+(-?[\d.]+)px\s+([\d.]+)px$/);
    if (shadow) { ctx.shadowColor = shadow[1]; ctx.shadowOffsetX = number(shadow[2]); ctx.shadowOffsetY = number(shadow[3]); ctx.shadowBlur = number(shadow[4]); }
    const range = document.createRange();
    for (let i = 0; i < value.length;) {
      const glyph = String.fromCodePoint(value.codePointAt(i)), end = i + glyph.length;
      range.setStart(node, i); range.setEnd(node, end); i = end;
      const rect = range.getBoundingClientRect();
      if (!rect.width || !rect.height || !glyph.trim()) continue;
      const metrics = ctx.measureText(glyph), size = number(style.fontSize, 16);
      const ascent = metrics.fontBoundingBoxAscent ?? size * .85, descent = metrics.fontBoundingBoxDescent ?? size * .15;
      ctx.fillText(glyph, rect.left - viewport.left, rect.top - viewport.top + (rect.height - ascent - descent) / 2 + ascent);
    }
    range.detach();
  }
  function paint(ctx, element, viewport, opacity = 1, filters = []) {
    if (!element || element.nodeType !== 1 || element.matches('svg,.sr-only,.deity-heading-words[hidden]')) return;
    const style = getComputedStyle(element), rect = box(element, viewport);
    if (!rect.width || !rect.height || style.display === 'none' || style.visibility === 'hidden' || style.clipPath === 'inset(50%)') return;
    opacity *= number(style.opacity, 1);
    if (opacity < .001) return;
    const chain = style.filter && style.filter !== 'none' ? [...filters, style.filter] : filters;
    ctx.save(); ctx.globalAlpha = opacity; ctx.filter = chain.join(' ') || 'none';
    if (style.mixBlendMode && style.mixBlendMode !== 'normal') ctx.globalCompositeOperation = style.mixBlendMode;
    if (style.overflow === 'hidden' || style.overflowX === 'hidden') {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(rect.x, rect.y, rect.width, rect.height, number(style.borderTopLeftRadius));
      else ctx.rect(rect.x, rect.y, rect.width, rect.height);
      ctx.clip();
    }
    backgrounds(ctx, style, rect);
    // These menu pseudo-elements form the plate beneath z-index:1 label images.
    for (const pseudo of ['::before', '::after']) {
      const decoration = getComputedStyle(element, pseudo);
      if (!decoration.content || decoration.content === 'none' || decoration.content === 'normal') continue;
      ctx.save(); ctx.globalAlpha = opacity * number(decoration.opacity, 1);
      if (decoration.filter && decoration.filter !== 'none') ctx.filter = [...chain, decoration.filter].join(' ');
      backgrounds(ctx, decoration, rect); ctx.restore();
    }
    if (element.tagName === 'IMG') {
      if (element.complete && element.naturalWidth) fitImage(ctx, element, rect, style.objectFit, style.objectPosition);
    } else if (element.tagName === 'CANVAS') {
      if (element.width && element.height) ctx.drawImage(element, rect.x, rect.y, rect.width, rect.height);
    } else for (const child of element.childNodes) {
      if (child.nodeType === 3) { ctx.save(); text(ctx, child, style, viewport); ctx.restore(); }
      else if (child.nodeType === 1) paint(ctx, child, viewport, opacity, chain);
    }
    ctx.restore();
  }
  function sourceFrame(ctx, source, viewport, fallback) {
    if (!source) return;
    const target = source.getBoundingClientRect ? source : fallback;
    const rect = target ? box(target, viewport) : {x: 0, y: 0, width: viewport.width, height: viewport.height};
    const style = target ? getComputedStyle(target) : null;
    // Copy the spatial WebGL frame now, within the same task as captureSource().
    if (source.tagName === 'IMG') fitImage(ctx, source, rect, style?.objectFit || 'cover', style?.objectPosition || '50% 50%');
    else ctx.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  }
  function drawLayer(target, layer, style) {
    target.ctx.save(); target.ctx.globalAlpha = number(style?.opacity, 1);
    target.ctx.filter = style?.filter || 'none';
    target.ctx.drawImage(layer.image, 0, 0, target.width, target.height); target.ctx.restore();
  }
  function finish(frame, root) {
    const style = getComputedStyle(root);
    if (style.filter && style.filter !== 'none') {
      const result = surface({width: frame.width, height: frame.height});
      if (result) { drawLayer(result, frame, style); return {image: result.image, width: frame.width, height: frame.height}; }
    }
    return {image: frame.image, width: frame.width, height: frame.height};
  }
  window.captureDeityReturnFrame = function captureDeityReturnFrame(root, spatialSource) {
    const viewport = root.getBoundingClientRect(), frame = surface(viewport), scene = surface(viewport);
    if (!frame || !scene) return null;
    const backdrop = root.querySelector('.deity-backdrop');
    sourceFrame(scene.ctx, spatialSource || backdrop, viewport, backdrop);
    for (const selector of ['.deity-tone', '.deity-depth-haze', '.deity-scene-light']) paint(scene.ctx, root.querySelector(selector), viewport);
    frame.ctx.fillStyle = getComputedStyle(root).backgroundColor; frame.ctx.fillRect(0, 0, frame.width, frame.height);
    drawLayer(frame, scene, getComputedStyle(root.querySelector('.deity-view')));
    const location = root.querySelector('.deity-location-plane') || root.querySelector('.deity-location');
    const ink = root.deityOcclusion?.applyToCanvas ? surface(viewport) : null;
    if (ink) {
      paint(ink.ctx, location, viewport);
      root.deityOcclusion.applyToCanvas(ink.ctx, viewport);
      frame.ctx.drawImage(ink.image, 0, 0, frame.width, frame.height);
      ink.image.width = ink.image.height = 1;
    } else paint(frame.ctx, location, viewport);
    for (const selector of ['.deity-roster', '.deity-controls', '.deity-return']) paint(frame.ctx, root.querySelector(selector), viewport);
    return finish(frame, root);
  };
  window.captureTitleReturnFrame = function captureTitleReturnFrame(world) {
    const viewport = world.getBoundingClientRect(), frame = surface(viewport), scene = surface(viewport);
    if (!frame || !scene) return null;
    const photo = world.querySelector('#world-art');
    const source = window.InfiniteSpatial?.captureSource?.() || photo;
    sourceFrame(scene.ctx, source, viewport, photo);
    for (const selector of ['.scene-shade', '.world-glow', '.mist-back', '.mist-front']) paint(scene.ctx, world.querySelector(selector), viewport);
    frame.ctx.fillStyle = getComputedStyle(world).backgroundColor; frame.ctx.fillRect(0, 0, frame.width, frame.height);
    drawLayer(frame, scene, getComputedStyle(world.querySelector('.scene')));
    // Live weather is revealed over settled cubes by deity-return-weather.js.
    // Baking these canvases here would leave a second, frozen layer underneath.
    for (const selector of ['.vignette', '#title-screen']) paint(frame.ctx, world.querySelector(selector), viewport);
    return finish(frame, world);
  };
  window.DeityReturnCapture = Object.freeze({ready});
})();
