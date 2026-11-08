/* Pointer-driven parallax of the existing photograph. Nothing above the scene moves. */
(() => {
  'use strict';
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  class SpatialPhoto {
    constructor(world, image, canvas, layersCanvas, options = {}) {
      this.world = world;
      this.image = image;
      this.canvas = canvas;
      this.layersCanvas = layersCanvas;
      this.renderOptions = {depthOfField: Math.max(0, Number(options.depthOfField) || 0)};
      this.keepNeutral = this.renderOptions.depthOfField > 0;
      this.onRender = typeof options.onRender === 'function' ? options.onRender : null;
      this.customURLs = Array.isArray(options.urls) && options.urls.length === 2;
      this.urls = this.customURLs ? [...options.urls] :
        ['assets/spatial-photo/plate.webp', 'assets/spatial-photo/portrait.webp'];
      this.view = canvas;
      this.preferLayers = false;
      this.renderer = null;
      this.request = 0;
      this.textures = null;
      this.warmPending = false;
      this.initialization = null;
      this.preparingNeutral = false;
      this.retryAfter = 0;
      this.mode = 'idle';
      this.enabled = false;
      this.blocked = false;
      this.x = this.y = this.goalX = this.goalY = 0;
      this.vx = this.vy = 0;
      this.raf = this.previous = this.draws = 0;
      this.layoutKey = '';
      this.frame = this.frame.bind(this);
      this.pointer = this.pointer.bind(this);
      this.leave = () => this.aim(0, 0);
      this.refresh = this.refresh.bind(this);
      world.addEventListener('pointermove', this.pointer, { passive: true });
      world.addEventListener('pointerleave', this.leave);
      world.addEventListener('pointercancel', this.leave);
      window.addEventListener('blur', this.leave);
      window.addEventListener('resize', this.refresh, { passive: true });
      this.dialogObserver = new MutationObserver(() => {
        this.blocked = !!document.querySelector('dialog[open]');
        if (this.blocked) this.reset();
      });
      document.querySelectorAll('dialog').forEach(dialog => this.dialogObserver.observe(dialog, { attributes: true, attributeFilter: ['open'] }));
      canvas.addEventListener('webglcontextlost', event => {
        event.preventDefault();
        this.preferLayers = true;
        this.release();
      });
      canvas.addEventListener('webglcontextrestored', () => { this.preferLayers = false; this.release(); });
      this.refresh();
    }

    setEnabled(enabled) {
      const wasEnabled = this.enabled;
      this.enabled = !!enabled;
      if (!this.enabled) {
        this.cancelPreparation();
        this.reset();
        if (this.mode === 'loading') { this.request++; this.initialization = null; this.mode = 'idle'; }
      }
      else if (this.mode === 'idle' && !this.warmPending && (this.keepNeutral || window.matchMedia('(any-hover: hover) and (any-pointer: fine)').matches)) {
        // Prepare the full-resolution layers once the menu has settled.
        // The original still stays on screen until the pointer actually moves.
        this.warmPending = true;
        const prepare = () => {
          this.warmPending = false;
          if (this.enabled && !document.hidden && !this.blocked) this.initialize();
        };
        if (window.requestIdleCallback) window.requestIdleCallback(prepare, {timeout: 1200});
        else window.setTimeout(prepare, 250);
      }
      if (!wasEnabled && this.enabled && this.keepNeutral && this.renderer) this.reset();
    }

    refresh() {
      this.bounds = this.world.getBoundingClientRect();
      // Camera travel, not image translation: the focus plane stays put, with
      // the portrait and the distant wall moving to opposite sides of it.
      this.limitX = Math.min(26, this.bounds.width * .014);
      this.limitY = Math.min(13, this.bounds.height * .013);
      const style = getComputedStyle(this.image);
      this.fit = style.objectFit;
      const layout = [this.image.clientWidth, this.image.clientHeight, this.fit, style.objectPosition];
      const key = [...layout, window.devicePixelRatio].join('|');
      if (this.renderer && key !== this.layoutKey) {
        this.renderer.resize(...layout);
        this.layoutKey = key;
      }
      this.reset();
    }

    initialize() {
      if (this.initialization) return this.initialization;
      if (this.mode !== 'idle' || performance.now() < this.retryAfter) return Promise.resolve(!!this.renderer);
      const job = this.buildRenderer();
      this.initialization = job;
      const clear = () => { if (this.initialization === job) this.initialization = null; };
      job.then(clear, clear);
      return job;
    }

    // Warm the neutral photograph beneath an opaque transition frame without
    // enabling pointer input. The scene controller explicitly ends this lease.
    async prepareNeutral() {
      if (!this.keepNeutral || document.hidden || this.blocked) return false;
      this.preparingNeutral = true;
      this.refresh();
      await this.initialize();
      return this.preparingNeutral && this.view.classList.contains('spatial-visible');
    }

    cancelPreparation({deferRetry = 0} = {}) {
      if (!this.preparingNeutral) return;
      this.preparingNeutral = false;
      if (this.mode === 'loading') {
        this.request++;
        this.initialization = null;
        this.mode = 'idle';
        this.retryAfter = Math.max(this.retryAfter, performance.now() + deferRetry);
      }
      if (!this.enabled) this.reset();
    }

    async buildRenderer() {
      this.mode = 'loading';
      const request = ++this.request;
      const current = () => request === this.request;
      const urls = this.urls;
      const factory = window.createProjectSpatialRenderer;
      const canUseGL = !this.preferLayers && location.protocol !== 'file:';
      let renderer = null, mode = 'depthflow-slide', view = this.canvas;
      // The native fast path contains edge samples for the title's exact art.
      // Other scenes use the general factory, which builds their own samples.
      if (canUseGL && !this.customURLs && factory?.fromURLs) {
        try { renderer = await factory.fromURLs(view, urls, current, this.renderOptions); }
        catch { /* Try the public blob factory for browsers without native texture upload. */ }
        if (!current()) { renderer?.dispose(); return; }
      }
      if (!renderer) {
        if (!this.textures) {
          this.textures = Promise.all(urls.map(url => {
            const layer = new Image();
            layer.decoding = 'async';
            layer.src = url;
            return layer.decode().then(() => layer);
          }));
        }
        let images;
        try { images = await this.textures; }
        catch {
          this.textures = null;
          if (current()) {
            // Missing or still-generating layers must not refetch on every
            // pointer event. Retry on a later interaction, without a busy timer.
            this.retryAfter = performance.now() + 3000;
            this.mode = 'idle';
          }
          return;
        }
        if (!current()) return;
        if (canUseGL && factory) {
          try { renderer = await factory(view, ...images, this.renderOptions); }
          catch { /* The same two layers also work without WebGL. */ }
          if (!current()) { renderer?.dispose(); return; }
        }
        if (!renderer) {
          view = this.layersCanvas;
          mode = 'static';
          try {
            renderer = window.createFlatSpatialRenderer?.(view, ...images, this.renderOptions);
            if (renderer) mode = 'layered-2d';
          } catch { /* The original photograph remains visible if both paths fail. */ }
        }
      }
      this.renderer = renderer;
      if (renderer) this.retryAfter = 0;
      this.view = view;
      this.mode = mode;
      if (renderer) {
        const style = getComputedStyle(this.image);
        const layout = [this.image.clientWidth, this.image.clientHeight, style.objectFit, style.objectPosition];
        try {
          if (renderer.resize(...layout) === false) return this.recoverDrawFailure();
        } catch { return this.recoverDrawFailure(); }
        this.layoutKey = [...layout, window.devicePixelRatio].join('|');
      }
      if (renderer && (this.enabled || this.preparingNeutral) && !this.blocked && !document.hidden) {
        if (this.keepNeutral && !this.present(this.x, this.y)) return this.recoverDrawFailure();
        if (this.enabled && (this.goalX || this.goalY)) this.schedule();
      }
      return !!renderer;
    }

    pointer(event) {
      if (!this.enabled || this.blocked || document.hidden) return;
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') { this.leave(); return; }
      const b = this.bounds;
      if (!b.width || !b.height) return;
      const u = clamp(2 * (event.clientX - b.left) / b.width - 1, -1, 1);
      const v = clamp(2 * (event.clientY - b.top) / b.height - 1, -1, 1);
      // Make small movements around the middle legible while capping the corners.
      const response = n => Math.tanh(1.55 * n) / Math.tanh(1.55);
      this.aim(response(u) * this.limitX, response(v) * this.limitY);
      if (this.mode === 'idle' && (this.goalX || this.goalY)) this.initialize();
    }

    aim(x, y) {
      this.goalX = x;
      this.goalY = y;
      if (this.enabled && !this.blocked && !document.hidden &&
          this.renderer && (x !== this.x || y !== this.y)) this.schedule();
    }

    schedule() {
      if (!this.raf) this.raf = requestAnimationFrame(this.frame);
    }

    frame(now) {
      this.raf = 0;
      if (!this.enabled || this.blocked || document.hidden) { this.reset(); return; }
      const dt = this.previous ? clamp((now - this.previous) / 1000, .001, .06) : 1 / 60;
      this.previous = now;
      // Analytic critically damped spring. Reversing the mouse doesn't jerk the view.
      const omega = this.goalX || this.goalY ? 17 : 14;
      const decay = Math.exp(-omega * dt);
      const ex = this.x - this.goalX, ey = this.y - this.goalY;
      const cx = this.vx + omega * ex, cy = this.vy + omega * ey;
      this.x = this.goalX + (ex + cx * dt) * decay;
      this.y = this.goalY + (ey + cy * dt) * decay;
      this.vx = (this.vx - omega * cx * dt) * decay;
      this.vy = (this.vy - omega * cy * dt) * decay;
      if (Math.abs(this.goalX - this.x) < .025 && Math.abs(this.vx) < .35) { this.x = this.goalX; this.vx = 0; }
      if (Math.abs(this.goalY - this.y) < .025 && Math.abs(this.vy) < .35) { this.y = this.goalY; this.vy = 0; }
      if (!this.x && !this.y && !this.goalX && !this.goalY) { this.reset(); return; }
      if (!this.present(this.x, this.y)) {
        this.recoverDrawFailure();
        return;
      }
      this.world.style.setProperty('--mist-view-x', `${(-.13 * this.x).toFixed(2)}px`);
      this.world.style.setProperty('--mist-view-y', `${(-.10 * this.y).toFixed(2)}px`);
      if (this.x !== this.goalX || this.y !== this.goalY || this.vx || this.vy) this.schedule();
      else this.previous = 0;
    }

    reset() {
      cancelAnimationFrame(this.raf);
      this.raf = this.previous = this.x = this.y = this.goalX = this.goalY = this.vx = this.vy = 0;
      // A focused portrait stays sharp over the soft rear plane even at rest.
      // Draw once; this does not keep an idle animation loop alive.
      if (this.renderer && this.keepNeutral && (this.enabled || this.preparingNeutral) && !this.blocked && !document.hidden) {
        if (this.present(0, 0)) return;
        this.recoverDrawFailure();
        return;
      }
      this.view.classList.remove('spatial-visible');
      this.world.classList.remove('spatial-engaged');
      this.notifyRender(false);
    }

    notifyRender(active) {
      try { this.onRender?.({x:active ? this.x : 0, y:active ? this.y : 0, mode:this.mode, active}); }
      catch { /* A decorative label must not interrupt the photograph renderer. */ }
    }

    present(x, y) {
      try { if (!this.renderer || this.renderer.draw(x, y) === false) return false; }
      catch { return false; }
      this.view.classList.add('spatial-visible');
      this.world.classList.add('spatial-engaged');
      this.draws++;
      this.notifyRender(true);
      return true;
    }

    release() {
      this.request++;
      this.initialization = null;
      const renderer = this.renderer;
      this.renderer = null;
      this.reset();
      try { renderer?.dispose(); } catch { /* A failed renderer must not prevent the original image from returning. */ }
      this.mode = 'idle';
      this.layoutKey = '';
    }

    recoverDrawFailure() {
      const tryFallback = this.view === this.canvas && !this.preferLayers;
      if (this.view === this.canvas) this.preferLayers = true;
      this.release();
      if (!tryFallback) {
        // A failed fallback is terminal for this renderer generation. Keep the
        // original photograph visible rather than rebuilding on every frame.
        this.mode = 'static';
        return Promise.resolve(false);
      }
      if ((this.enabled || this.preparingNeutral) && !this.blocked && !document.hidden) return this.initialize();
      return Promise.resolve(false);
    }

    captureSource() {
      if (!this.renderer || !this.view.classList.contains('spatial-visible')) return this.image;
      // WebGL discards its displayed drawing buffer. Redraw this exact camera pose
      // so the caller can copy it synchronously, before the next compositor frame.
      if (this.view === this.canvas && this.renderer.draw(this.x, this.y) === false) return this.image;
      return this.view;
    }

    getState() {
      return { mode: this.mode, enabled: this.enabled, blocked: this.blocked, x: this.x, y: this.y,
        active: this.view.classList.contains('spatial-visible'), depthOfField: this.renderOptions.depthOfField,
        preparing: this.preparingNeutral,
        limitX: this.limitX, limitY: this.limitY, moving: !!this.raf, draws: this.draws,
        retryInMs: Math.max(0, Math.ceil(this.retryAfter - performance.now())) };
    }
  }
  window.SpatialPhoto = SpatialPhoto;
})();
