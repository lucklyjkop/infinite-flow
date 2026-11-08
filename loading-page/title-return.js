/* The existing calligraphy grows through soft stroke masks, like plum twigs.
   The masks only reveal art: they never redraw the approved lettering. */
(() => {
  'use strict';
  const screen = document.getElementById('title-screen');
  const world = document.getElementById('world');
  const dialog = document.getElementById('settings-dialog');
  const title = document.querySelector('#menu-title > img');
  const branch = document.querySelector('.menu-divider > img');
  if (!screen || !world || !dialog || !title || !branch) return;
  const rows = [...screen.querySelectorAll('.title-menu button')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ns = 'http://www.w3.org/2000/svg';
  let active = null, sequence = 0;
  const stopSound = () => window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail: {group: 'title-return', fade: .06}}));

  const allowed = () => !document.hidden && !reduced.matches
    && !world.classList.contains('motion-off') && !screen.hidden
    && world.dataset.state === 'title';
  function node(name, attributes = {}) {
    const el = document.createElementNS(ns, name);
    Object.entries(attributes).forEach(([key, value]) => el.setAttribute(key, value));
    return el;
  }
  function settle() {
    if (!active) return;
    const previous = active;
    active = null;
    stopSound();
    clearTimeout(previous.guard);
    previous.animations.forEach(animation => animation.cancel());
    previous.layers.forEach(layer => layer.remove());
    screen.classList.remove('title-return-growing');
    delete screen.dataset.returnGrowth;
  }

  function layer(image, width, height, key) {
    const svg = node('svg', {
      class: 'title-growth-layer', viewBox: `0 0 ${width} ${height}`,
      preserveAspectRatio: 'xMinYMid meet', 'aria-hidden': 'true', focusable: 'false',
    });
    const id = `return-${sequence}-${key}`;
    const defs = node('defs');
    const filter = node('filter', {id: `${id}-soft`, x: '-10%', y: '-10%', width: '120%', height: '120%'});
    filter.append(node('feGaussianBlur', {stdDeviation: key === 'type' ? '2.8' : '1.5'}));
    const mask = node('mask', {id, maskUnits: 'userSpaceOnUse', x: 0, y: 0, width, height, 'mask-type': 'alpha'});
    const strokes = node('g', {fill: 'none', stroke: '#fff', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', filter: `url(#${id}-soft)`});
    mask.append(strokes);
    defs.append(filter, mask);
    const art = node('image', {href: image.currentSrc || image.src, x: 0, y: 0, width, height, mask: `url(#${id})`});
    svg.append(defs, art);
    image.parentElement.append(svg);
    active.layers.push(svg);
    return {mask, strokes};
  }

  function animate(element, frames, options) {
    const animation = element.animate(frames, {fill: 'both', easing: 'cubic-bezier(.2,.65,.32,1)', ...options});
    active.animations.push(animation);
    return animation;
  }
  function stroke(host, d, width, delay, duration) {
    const path = node('path', {d, 'stroke-width': width, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1});
    host.append(path);
    animate(path, [{strokeDashoffset: '1'}, {strokeDashoffset: '0'}], {delay, duration});
  }
  function bloom(host, cx, cy, radius, delay) {
    const circle = node('circle', {cx, cy, r: radius, fill: '#fff', stroke: 'none'});
    circle.style.transformOrigin = `${cx}px ${cy}px`;
    host.append(circle);
    animate(circle, [{opacity: 0, transform: 'scale(.15)'}, {opacity: 1, transform: 'scale(1)'}], {delay, duration: 300});
  }

  function begin(event) {
    settle();
    if (!event.detail?.motion || !allowed()) return;
    sequence++;
    const run = active = {id: event.detail.id, animations: [], layers: [], guard: 0};
    screen.dataset.returnGrowth = 'drawing';
    // These layers register with each image's contain box at every viewport size.
    const twig = layer(branch, 1200, 105, 'twig');
    const ink = layer(title, 1600, 443, 'type');
    screen.classList.add('title-return-growing');
    const cue = (name, delay, gain) => window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail: {name, delay, gain, pan: -.35, group: 'title-return'}}));
    // The same clock offsets drive both growth masks and their material sounds.
    cue('branch-grow', .11, .42);
    cue('brush-write', .3, .65);
    cue('menu-open', .82, .52);

    stroke(twig.strokes, 'M 0 80 C 75 35 155 59 228 73 S 345 59 409 78 S 561 93 637 91 S 775 93 843 69 S 961 71 1044 73 S 1134 64 1200 53', 43, 110, 670);
    stroke(twig.strokes, 'M 354 65 Q 373 46 375 12 M 807 77 Q 834 65 854 38', 26, 380, 330);
    bloom(twig.strokes, 326, 48, 55, 390);
    bloom(twig.strokes, 411, 63, 53, 470);
    bloom(twig.strokes, 854, 43, 18, 640);

    // Main limbs first; fine side strokes spread from them. Coordinates are in
    // the source 1600 × 443 image, so every screen retains the exact glyphs.
    const paths = [
      ['M 14 424 Q 180 362 248 249 Q 293 182 300 128', 88, 300, 480],
      ['M 76 245 Q 65 282 146 252 Q 264 187 361 153', 87, 390, 340],
      ['M 209 65 Q 248 114 365 54', 94, 430, 280],
      ['M 322 244 Q 286 351 348 353 Q 490 356 478 296 Q 458 230 487 180', 89, 510, 420],
      ['M 609 349 Q 630 232 610 181', 95, 490, 350],
      ['M 592 111 L 680 62 Q 648 128 675 173 Q 701 235 634 210', 104, 540, 370],
      ['M 721 362 Q 731 246 747 129', 100, 590, 430],
      ['M 741 111 Q 811 75 849 62 L 829 191 L 748 230', 97, 660, 340],
      ['M 763 161 L 838 148', 67, 740, 220],
      ['M 744 255 Q 797 256 875 306 L 949 343 M 718 374 L 765 301', 81, 780, 320],
      ['M 1049 189 Q 1090 203 1071 264 Q 1045 313 1043 348 L 1109 271', 88, 740, 350],
      ['M 1080 75 Q 1132 111 1089 135', 83, 810, 260],
      ['M 1242 32 Q 1291 31 1254 64', 75, 830, 230],
      ['M 1158 145 L 1304 99', 85, 850, 300],
      ['M 1273 129 L 1188 222 L 1284 190', 79, 900, 290],
      ['M 1016 436 Q 1145 393 1190 271', 72, 950, 360],
      ['M 1235 266 L 1228 315 M 1294 237 Q 1269 326 1352 362 Q 1470 420 1599 382', 90, 990, 360],
    ];
    paths.forEach(args => stroke(ink.strokes, ...args));
    // Fine brush hairs beyond the broad paths resolve softly, never in a cut.
    const resolve = node('rect', {x: 0, y: 0, width: 1600, height: 443, fill: '#fff'});
    ink.mask.append(resolve);
    animate(resolve, [{opacity: 0}, {opacity: 1}], {delay: 1190, duration: 230});
    const twigResolve = node('rect', {x: 0, y: 0, width: 1200, height: 105, fill: '#fff'});
    twig.mask.append(twigResolve);
    animate(twigResolve, [{opacity: 0}, {opacity: 1}], {delay: 730, duration: 180});
    rows.forEach((row, i) => animate(row, [
      {opacity: 0, transform: 'translateY(5px)'},
      {opacity: 1, transform: 'translateY(0)'},
    ], {delay: 820 + i * 65, duration: 300}));

    // The modal blocks interaction until it closes; the menu remains usable as
    // soon as the modal releases it. No inert flag or focus ownership is changed.
    Promise.all(run.animations.map(animation => animation.finished.catch(() => {})))
      .then(() => { if (active === run) settle(); });
    run.guard = setTimeout(() => { if (active === run) settle(); }, 1650);
  }
  ['infinite:settingsreturnstart', 'infinite:deityreturnstart'].forEach(type => window.addEventListener(type, begin));
  const cancelReturn = event => {
    if (active && (event.detail?.id === undefined || event.detail.id === active.id)) settle();
  };
  const endReturn = event => {
    if (active && event.detail?.id === active.id && event.detail?.immediate) settle();
  };
  ['infinite:settingsreturncancel', 'infinite:deityreturncancel'].forEach(type => window.addEventListener(type, cancelReturn));
  ['infinite:settingsreturnend', 'infinite:deityreturnend'].forEach(type => window.addEventListener(type, endReturn));
  const settleIfUnavailable = () => { if (active && !allowed()) settle(); };
  reduced.addEventListener('change', settleIfUnavailable);
  document.addEventListener('visibilitychange', settleIfUnavailable);
  window.addEventListener('infinite:settings', settleIfUnavailable);
  // Also catches direct/native reopens and title/start changes made by a host.
  new MutationObserver(() => {
    if (active && dialog.open && dialog.dataset.phase !== 'closing') settle();
  }).observe(dialog, {attributes: true, attributeFilter: ['open', 'data-phase']});
  new MutationObserver(settleIfUnavailable).observe(world, {attributes: true, attributeFilter: ['data-state', 'class']});
  new MutationObserver(settleIfUnavailable).observe(screen, {attributes: true, attributeFilter: ['hidden']});
})();
