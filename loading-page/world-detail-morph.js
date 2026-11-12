/* The existing sakura artwork grows along its branches to reveal the dossier. */
(() => {
  'use strict';
  const ns = 'http://www.w3.org/2000/svg';
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = (start, end, value) => { const t = clamp((value - start) / (end - start)); return t * t * (3 - 2 * t); };
  const sources = ['assets/loading-ui/bough-a.webp', 'assets/loading-ui/bough-b.webp'];
  const decorations = new WeakMap();
  let active = null, sequence = 0, preload = null;
  function load() {
    if (!preload) preload = Promise.all(sources.map(url => { const image = new Image(); image.src = url; return image.decode(); })).catch(error => { preload = null; throw error; });
    return preload;
  }
  function svgNode(name, attributes = {}) {
    const element = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }
  function branches(dialog) {
    if (decorations.has(dialog)) { const existing = decorations.get(dialog); existing.syncScroll(); return existing; }
    const layer = document.createElement('div');
    layer.className = 'world-detail-boughs'; layer.setAttribute('aria-hidden', 'true');
    const marks = [], resolves = [], id = ++sequence;
    const paths = [
      [
        ['M -30 319 C 160 360 317 437 455 346 S 558 273 669 249 S 809 282 936 204 S 1090 180 1193 132 S 1351 82 1460 21', 119, 0],
        ['M 178 334 Q 227 237 280 228 L 358 164 L 400 91 M 244 286 L 426 212 L 512 162', 78, .14],
        ['M 602 279 Q 719 208 766 125 L 816 23 M 689 244 L 866 120 M 737 239 L 1001 326', 68, .25],
        ['M 539 313 Q 645 305 734 346 L 878 385 L 920 413', 111, .29],
        ['M 947 203 L 1028 136 M 1054 170 L 1245 95 L 1352 60 M 1088 181 L 1273 248', 95, .38],
      ],
      [
        ['M -35 191 Q 62 151 123 86 T 268 114 T 464 161 T 674 177 T 887 225 T 1100 269 T 1452 391', 116, .04],
        ['M 214 92 L 260 36 L 347 79 L 449 59 M 268 117 L 343 193', 126, .13],
        ['M 471 165 L 571 130 L 618 108 M 530 175 L 579 263 L 639 386 M 310 142 L 295 266 L 405 342', 111, .24],
        ['M 660 181 L 790 165 L 866 155 M 720 203 L 775 321 L 845 368', 112, .33],
        ['M 963 250 L 1119 264 L 1200 280 M 1037 282 L 1144 409', 121, .42],
      ],
    ];
    sources.forEach((url, index) => {
      const svg = svgNode('svg', {class:'world-detail-bough world-detail-bough-' + index, viewBox:'0 0 1440 480', focusable:'false'});
      const defs = svgNode('defs'), maskId = 'detail-bough-' + id + '-' + index;
      const mask = svgNode('mask', {id:maskId, maskUnits:'userSpaceOnUse', x:0, y:0, width:1440, height:480, 'mask-type':'alpha'});
      const group = svgNode('g', {fill:'none', stroke:'#fff', 'stroke-linecap':'round', 'stroke-linejoin':'round'});
      for (const [d, width, delay] of paths[index]) {
        const mark = svgNode('path', {d, 'stroke-width':width, pathLength:1, 'stroke-dasharray':1, 'stroke-dashoffset':1});
        group.append(mark); marks.push({mark, delay});
      }
      const resolve = svgNode('rect', {width:1440, height:480, fill:'#fff', opacity:0});
      mask.append(group, resolve); resolves.push(resolve); defs.append(mask);
      svg.append(defs, svgNode('image', {href:url, width:1440, height:480, mask:'url(#' + maskId + ')'})); layer.append(svg);
    });
    dialog.append(layer);
    const syncScroll = () => {
      dialog.style.setProperty('--detail-scroll', dialog.scrollTop + 'px');
      if (!dialog.open) return;
      const panel = dialog.getBoundingClientRect(), content = dialog.querySelector('.world-detail-layout').getBoundingClientRect();
      dialog.style.setProperty('--detail-mask-size', dialog.clientWidth + 'px ' + dialog.clientHeight + 'px');
      dialog.style.setProperty('--detail-mask-offset', (panel.x - content.x) + 'px ' + (panel.y - content.y) + 'px');
    };
    dialog.addEventListener('scroll', syncScroll, {passive:true}); syncScroll();
    const result = {layer, syncScroll, draw(progress) {
      for (const {mark, delay} of marks) mark.style.strokeDashoffset = String(1 - smooth(delay, Math.min(.93, delay + .52), progress));
      for (const resolve of resolves) resolve.style.opacity = String(smooth(.84, 1, progress));
      layer.style.opacity = String(smooth(0, .1, progress));
    }};
    decorations.set(dialog, result); return result;
  }
  function cancel() {
    if (!active) return null;
    const state = {dialog:active.dialog, progress:active.progress};
    active.finish(); return state;
  }
  async function play(dialog, _node, {reverse = false, motion = true, from} = {}) {
    cancel();
    const boughs = branches(dialog);
    if (!motion || document.hidden || reverse && Number.isFinite(from) && from <= 0) { boughs.draw(reverse ? 0 : 1); return; }
    let stopped = false, frame = 0, resolve;
    const done = new Promise(done => { resolve = done; });
    const paper = document.createElement('div');
    paper.className = 'world-detail-reveal-paper'; paper.setAttribute('aria-hidden', 'true');
    const job = {dialog, progress:reverse ? clamp(Number.isFinite(from) ? from : 1) : 0, finish() {
      if (stopped) return; stopped = true;
      cancelAnimationFrame(frame); paper.remove();
      dialog.classList.remove('is-blossoming', 'is-blossom-preparing');
      for (const name of ['--detail-backdrop', '--detail-reveal', '--detail-controls']) dialog.style.removeProperty(name);
      boughs.draw(reverse ? 0 : 1);
      window.removeEventListener('resize', job.finish); document.removeEventListener('visibilitychange', visibility);
      if (active === job) active = null;
      resolve();
    }};
    function visibility() { if (document.hidden) job.finish(); }
    active = job;
    window.addEventListener('resize', job.finish); document.addEventListener('visibilitychange', visibility);
    if (!reverse) dialog.classList.add('is-blossom-preparing');
    dialog.style.setProperty('--detail-backdrop', String(smooth(0, .8, job.progress)));
    try {
      if (!reverse) await load();
      if (stopped) return;
      const style = getComputedStyle(dialog), edge = getComputedStyle(dialog, '::before');
      paper.style.background = style.background; paper.style.borderRadius = style.borderRadius;
      if (edge.content !== 'none') { paper.style.border = edge.border; paper.style.borderImage = edge.borderImage; }
      dialog.append(paper);
      const reach = Math.hypot(dialog.clientWidth, dialog.clientHeight);
      function draw(progress) {
        job.progress = progress; boughs.draw(smooth(0, .88, progress));
        const radius = -40 + (reach + 80) * smooth(.07, 1, progress);
        const mask = 'radial-gradient(circle at 0% 100%,#000 ' + radius.toFixed(2) + 'px,transparent ' + (radius + 40).toFixed(2) + 'px),radial-gradient(circle at 100% 0%,#000 ' + (radius * .93).toFixed(2) + 'px,transparent ' + (radius * .93 + 40).toFixed(2) + 'px)';
        dialog.style.setProperty('--detail-reveal', mask);
        dialog.style.setProperty('--detail-backdrop', String(smooth(0, .8, progress)));
        dialog.style.setProperty('--detail-controls', String(smooth(.45, .9, progress)));
      }
      dialog.classList.add('is-blossoming'); draw(job.progress); dialog.classList.remove('is-blossom-preparing');
      const startValue = job.progress, endValue = reverse ? 0 : 1, started = performance.now();
      const duration = Math.max(120, (reverse ? 620 : 900) * Math.abs(endValue - startValue));
      function tick(now) {
        if (stopped) return;
        const t = clamp((now - started) / duration); draw(startValue + (endValue - startValue) * t);
        if (t < 1) frame = requestAnimationFrame(tick); else job.finish();
      }
      frame = requestAnimationFrame(tick); await done;
    } catch (error) { console.warn('World detail blossom reveal skipped', error); job.finish(); }
  }
  window.InfiniteWorldDetailMorph = Object.freeze({play, cancel});
})();
