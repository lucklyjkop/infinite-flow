/* Reveal live weather only over the settled part of the left-to-right cube wave.
   The thresholds deliberately match deity-return-wave.js, including its row bend. */
(() => {
  'use strict';
  const active = new WeakMap();
  const clamp = value => Math.max(0, Math.min(1, value));
  const properties = ['clip-path', 'z-index', 'pointer-events'];
  window.createDeityReturnWeather = (world, requestedWidth, requestedHeight) => {
    active.get(world)?.dispose();
    const width = Math.max(1, Number(requestedWidth) || world.clientWidth || innerWidth);
    const height = Math.max(1, Number(requestedHeight) || world.clientHeight || innerHeight);
    const columns = Math.max(8, Math.round(width / Math.sqrt(width * height / 460)));
    const cell = width / columns, rows = Math.ceil(height / cell);
    const thresholds = Array.from({length: rows}, (_, row) => {
      const v = (row + .5) * cell / height;
      return Float64Array.from({length: columns}, (_, column) => {
        const u = (column + .5) * cell / width;
        return (u + .026 * Math.sin(6 * v) * Math.sin(Math.PI * u) + .34) / 1.34;
      });
    });
    const counts = new Uint16Array(rows), settled = new Float64Array(rows), edges = new Float64Array(rows);
    const layers = [...world.children].filter(element => element.matches('#petals,.rain-layer'));
    const originals = layers.map(element => ({element, values: properties.map(property => ({
      property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property),
    }))}));
    let progress = 0, disposed = false, lastClip = '';
    function apply(clip) {
      if (clip === lastClip) return;
      lastClip = clip;
      for (const layer of layers) layer.style.setProperty('clip-path', clip);
    }
    // Apply an empty clip before raising the canvases: an already-painted petal
    // frame must not flash over the unreplaced deity view during initialization.
    apply('inset(0 100% 0 0)');
    for (const layer of layers) {
      layer.style.setProperty('z-index', '9');
      layer.style.setProperty('pointer-events', 'none');
    }
    function update(value) {
      if (disposed) return;
      const next = clamp(Number.isFinite(Number(value)) ? Number(value) : 0);
      if (next < progress) counts.fill(0);
      progress = next;
      if (next <= 0) { counts.fill(0); edges.fill(0); apply('inset(0 100% 0 0)'); return; }
      if (next >= 1) { edges.fill(width); apply('inset(0)'); return; }
      let complete = true;
      for (let row = 0; row < rows; row++) {
        // Progress is normally monotonic: across the entire transition this loop
        // visits only about 460 cells, rather than re-evaluating every cell/frame.
        while (counts[row] < columns && thresholds[row][counts[row]] <= next) counts[row]++;
        settled[row] = counts[row] * cell;
        complete &&= counts[row] === columns;
      }
      if (complete) { edges.fill(width); apply('inset(0)'); return; }
      const points = ['0% 0%'];
      for (let row = 0; row < rows; row++) {
        let safe = settled[row];
        for (let neighbor = Math.max(0, row - 2); neighbor <= Math.min(rows - 1, row + 2); neighbor++) {
          safe = Math.min(safe, settled[neighbor]);
        }
        // Adjacent lifted cubes lean left and project into neighboring rows.
        // A cell of clearance keeps rain off their moving faces and shadows.
        edges[row] = Math.max(0, Math.min(width, safe - cell));
        const x = (edges[row] / width * 100).toFixed(4);
        const top = Math.min(100, row * cell / height * 100).toFixed(4);
        const bottom = Math.min(100, (row + 1) * cell / height * 100).toFixed(4);
        points.push(`${x}% ${top}%`, `${x}% ${bottom}%`);
      }
      points.push('0% 100%');
      apply(`polygon(${points.join(',')})`);
    }
    function dispose() {
      if (disposed) return;
      disposed = true;
      for (const {element, values} of originals) for (const {property, value, priority} of values) {
        if (value) element.style.setProperty(property, value, priority);
        else element.style.removeProperty(property);
      }
      if (active.get(world) === controller) active.delete(world);
    }
    const controller = Object.freeze({update, dispose, getState: () => ({
      progress, disposed, rows, columns, layers: layers.length,
      visibleLeft: Math.min(...edges) / width, visibleRight: Math.max(...edges) / width,
    })});
    active.set(world, controller);
    return controller;
  };
})();
