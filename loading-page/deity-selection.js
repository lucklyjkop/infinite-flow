/* Reveal the generated frame along its cut corners, including the blossom/knot.
   The two alpha textures replace one another inside complementary stroke masks. */
(() => {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const IDLE = 'assets/deity-space/ui-avatar-frame.webp';
  const ACTIVE = 'assets/deity-space/ui-avatar-active.webp';
  const OUTLINE = 'M 81 39 L 558 39 L 600 81 L 600 548 L 558 589 L 81 589 L 37 546 L 37 81 Z';
  const DURATION = 740;
  let serial = 0;

  function decode(url) {
    return new Promise(resolve => {
      const image = new Image();
      let done = false;
      const finish = value => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        image.onload = image.onerror = null;
        resolve(value);
      };
      const timeout = setTimeout(() => finish(false), 6500);
      image.onload = () => image.decode ? image.decode().then(() => finish(true), () => finish(image.naturalWidth > 0)) : finish(true);
      image.onerror = () => finish(false);
      image.src = url;
    });
  }

  window.createDeitySelection = function createDeitySelection(root) {
    if (!root) return null;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const entries = new Map();
    let current = null, run = null, decoded = false, disposed = false, plays = 0;
    const ready = Promise.all([decode(IDLE), decode(ACTIVE)]).then(results => {
      decoded = results.every(Boolean);
      return decoded;
    });

    root.querySelectorAll('.deity-choice').forEach(button => {
      const avatar = button.querySelector('.deity-avatar');
      if (!avatar) return;
      const prefix = 'deity-frame-' + ++serial;
      const svg = document.createElementNS(NS, 'svg');
      svg.classList.add('deity-selection-trace');
      svg.setAttribute('viewBox', '0 0 640 640');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      svg.innerHTML = `
        <defs>
          <mask id="${prefix}-reveal" maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="640" style="mask-type:luminance">
            <rect width="640" height="640" fill="black"/>
            <path class="deity-selection-reveal" d="${OUTLINE}" pathLength="1" fill="none" stroke="white" stroke-width="132" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 1" stroke-dashoffset="1"/>
          </mask>
          <mask id="${prefix}-retain" maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="640" style="mask-type:luminance">
            <rect width="640" height="640" fill="white"/>
            <path class="deity-selection-retain" d="${OUTLINE}" pathLength="1" fill="none" stroke="black" stroke-width="132" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 1" stroke-dashoffset="1"/>
          </mask>
          <mask id="${prefix}-ink" maskUnits="userSpaceOnUse" x="0" y="0" width="640" height="640" style="mask-type:alpha">
            <image href="${ACTIVE}" width="640" height="640"/>
          </mask>
          <filter id="${prefix}-glow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="7"/></filter>
        </defs>
        <image href="${IDLE}" width="640" height="640" mask="url(#${prefix}-retain)"/>
        <image href="${ACTIVE}" width="640" height="640" mask="url(#${prefix}-reveal)"/>
        <g mask="url(#${prefix}-ink)">
          <path class="deity-selection-wake" d="${OUTLINE}" pathLength="1" fill="none" stroke="#e7b47b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray=".035 1"/>
          <g class="deity-selection-tip">
            <circle r="18" fill="#b74833" opacity=".78" filter="url(#${prefix}-glow)"/>
            <circle r="5.3" fill="#f8d7a2" opacity=".84"/>
            <circle r="2.1" fill="#fff0cf"/>
          </g>
        </g>`;
      avatar.appendChild(svg);
      const path = svg.querySelector('.deity-selection-reveal');
      entries.set(button, {
        button, svg, path, retain: svg.querySelector('.deity-selection-retain'),
        tip: svg.querySelector('.deity-selection-tip'), wake: svg.querySelector('.deity-selection-wake'),
        length: 0,
      });
    });

    function stop() {
      if (!run) return;
      cancelAnimationFrame(run.raf);
      run.entry.button.classList.remove('is-selection-drawing');
      run = null;
    }
    function paint(entry, progress) {
      const offset = String(1 - progress);
      entry.path.setAttribute('stroke-dashoffset', offset);
      entry.retain.setAttribute('stroke-dashoffset', offset);
      const point = entry.path.getPointAtLength(entry.length * progress);
      entry.tip.setAttribute('transform', `translate(${point.x} ${point.y})`);
      // The tip fades before the already-generated glow takes over at the seam.
      const intensity = Math.min(1, progress / .06, (1 - progress) / .12);
      entry.tip.style.opacity = String(intensity);
      entry.wake.style.opacity = String(intensity * .65);
      entry.wake.setAttribute('stroke-dashoffset', String(.035 - progress));
    }
    function select(button, {animate = true} = {}) {
      if (disposed || current === button) return false;
      stop();
      current = button ?? null;
      const entry = entries.get(button);
      if (!entry || !animate || !decoded || reduced.matches || document.hidden) return true;
      entry.length ||= entry.path.getTotalLength();
      if (!(entry.length > 0)) return true;
      paint(entry, 0);
      button.classList.add('is-selection-drawing');
      const active = run = {entry, raf: 0, start: performance.now(), progress: 0};
      ++plays;
      const tick = now => {
        if (run !== active) return;
        if (document.hidden || root.hidden || !button.classList.contains('is-selected')) { stop(); return; }
        const time = Math.max(0, Math.min(1, (now - active.start) / DURATION));
        // Constant drawing speed through the long edges; gentle arrival at each end.
        const progress = time * time * (3 - 2 * time);
        active.progress = progress;
        paint(entry, progress);
        if (time >= 1) { stop(); return; }
        active.raf = requestAnimationFrame(tick);
      };
      active.raf = requestAnimationFrame(tick);
      return true;
    }
    function reset() { stop(); current = null; }
    function settleReduced() { if (reduced.matches) stop(); }
    function settleHidden() { if (document.hidden) stop(); }
    reduced.addEventListener('change', settleReduced);
    document.addEventListener('visibilitychange', settleHidden);
    return Object.freeze({
      ready, select, reset, finish: stop, cancel: stop,
      getState: () => ({selected: current?.dataset.deityId ?? null, playing: Boolean(run), progress: run?.progress ?? null, plays, ready: decoded}),
      dispose() {
        if (disposed) return;
        disposed = true; reset();
        reduced.removeEventListener('change', settleReduced);
        document.removeEventListener('visibilitychange', settleHidden);
        entries.forEach(entry => entry.svg.remove());
        entries.clear();
      },
    });
  };
})();
