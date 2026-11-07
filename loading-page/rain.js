/* Two depth planes: distant rain behind the menu, near drops and water above it. */
(() => {
  'use strict';
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const random = (low, high) => low + Math.random() * (high - low);

  class RainField {
    constructor(canvas, impactCanvas, options = {}) {
      this.canvas = canvas;
      this.impactCanvas = impactCanvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.fx = impactCanvas.getContext('2d', { alpha: true });
      this.getSurfaces = options.getSurfaces || (() => []);
      this.reducedMotion = !!options.reducedMotion;
      this.intensity = .85;
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this.running = false;
      this.destroyed = false;
      this.frameId = 0;
      this.lastTime = 0;
      this.time = 0;
      this.surfaceAge = 1;
      this.drops = [];
      this.nearDrops = [];
      this.spray = [];
      this.ripples = [];
      this.surfaces = new Map();
      this.emitters = new Map();
      this.impacts = 0;
      this.impactsBySurface = Object.create(null);
      this.lastImpact = null;
      this.frame = this.frame.bind(this);
      this.resize = this.resize.bind(this);
      this.onVisibility = this.onVisibility.bind(this);
      window.addEventListener('resize', this.resize, { passive: true });
      document.addEventListener('visibilitychange', this.onVisibility);
      this.resize();
    }

    resetDrop(drop, initial = false) {
      const depth = Math.floor(Math.random() * 3);
      drop.depth = depth;
      drop.x = random(-50, this.width + 30);
      drop.y = initial ? random(-30, this.height) : random(-130, -25);
      drop.vx = 32 + depth * 21;
      drop.vy = random(420, 610) + depth * 175;
      drop.length = random(11, 18) + depth * 9;
      return drop;
    }

    resize() {
      if (this.destroyed || !this.ctx || !this.fx) return;
      this.width = Math.max(1, this.canvas.clientWidth);
      this.height = Math.max(1, this.canvas.clientHeight);
      this.dpr = Math.min(devicePixelRatio || 1, 1.5);
      for (const canvas of [this.canvas, this.impactCanvas]) {
        canvas.width = Math.round(this.width * this.dpr);
        canvas.height = Math.round(this.height * this.dpr);
      }
      const count = Math.round(clamp(this.width * this.height / 10000, 70, 260));
      this.drops = Array.from({ length: count }, () => this.resetDrop({}, true));
      this.nearDrops.length = 0;
      this.spray.length = 0;
      this.ripples.length = 0;
      this.surfaceAge = 1;
      this.clear();
    }

    clear() {
      for (const [canvas, ctx] of [[this.canvas, this.ctx], [this.impactCanvas, this.fx]]) {
        if (!ctx) continue;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }

    start() {
      if (this.destroyed || this.running || this.reducedMotion || !this.ctx || !this.fx) return;
      this.running = true;
      this.lastTime = 0;
      this.surfaceAge = 1;
      if (!document.hidden) this.frameId = requestAnimationFrame(this.frame);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.lastTime = 0;
      this.nearDrops.length = 0;
      this.spray.length = 0;
      this.ripples.length = 0;
      this.clear();
    }

    setIntensity(value) {
      if (Number.isFinite(value)) this.intensity = clamp(value, 0, 1);
    }

    setReducedMotion(value) {
      const next = !!value;
      if (next === this.reducedMotion) return;
      const wasRunning = this.running;
      this.stop();
      this.reducedMotion = next;
      if (wasRunning && !next) this.start();
    }

    onVisibility() {
      cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.lastTime = 0;
      if (this.running && !document.hidden && !this.reducedMotion) {
        this.frameId = requestAnimationFrame(this.frame);
      }
    }

    refreshSurfaces() {
      const next = new Map();
      for (const surface of this.getSurfaces()) {
        if (surface.width < 1 || surface.y < 0 || surface.y > this.height) continue;
        next.set(surface.id, surface);
        if (!this.emitters.has(surface.id)) this.emitters.set(surface.id, random(.05, .6));
      }
      for (const id of this.emitters.keys()) if (!next.has(id)) this.emitters.delete(id);
      this.surfaces = next;
      if (!next.size) {
        this.nearDrops.length = 0;
        this.spray.length = 0;
        this.ripples.length = 0;
      }
      this.surfaceAge = 0;
    }

    emitNearDrop(surface) {
      // These drops are in the UI depth plane. Splashes occur only after their
      // falling trajectory crosses the current button edge, never on a timer.
      const vy = random(650, 920);
      const vx = random(38, 72);
      const height = Math.min(surface.y + 25, random(100, 195));
      const landing = surface.x + random(.08, .92) * surface.width;
      this.nearDrops.push({
        id: surface.id, x: landing - vx * height / vy, y: surface.y - height,
        vx, vy, length: random(17, 26), age: 0,
      });
    }

    splash(x, y, surface) {
      this.impacts += 1;
      this.impactsBySurface[surface.id] = (this.impactsBySurface[surface.id] || 0) + 1;
      this.lastImpact = { x, y, surface: { ...surface }, time: this.time };
      const power = random(.8, 1.2);
      if (this.ripples.length < 24) this.ripples.push({ x, y, age: 0, life: .4, power });
      const count = this.width < 680 ? 6 : 8;
      for (let i = 0; i < count && this.spray.length < 180; i++) {
        this.spray.push({
          x, y: y - .5, vx: random(-83, 83) * power,
          vy: -random(45, 130) * power, age: 0, life: random(.3, .55),
          radius: random(.65, 1.25),
        });
      }
    }

    update(delta) {
      this.time += delta;
      this.surfaceAge += delta;
      if (this.surfaceAge >= .16) this.refreshSurfaces();
      for (const drop of this.drops) {
        drop.x += drop.vx * delta;
        drop.y += drop.vy * delta;
        if (drop.y > this.height + 50 || drop.x > this.width + 60) this.resetDrop(drop);
      }
      for (const [id, surface] of this.surfaces) {
        let cooldown = this.emitters.get(id) - delta;
        if (cooldown <= 0) {
          if (this.nearDrops.length < 20) this.emitNearDrop(surface);
          cooldown = random(.5, 1.05) / Math.max(this.intensity, .2);
        }
        this.emitters.set(id, cooldown);
      }
      for (let i = this.nearDrops.length - 1; i >= 0; i--) {
        const drop = this.nearDrops[i];
        const surface = this.surfaces.get(drop.id);
        const previousX = drop.x, previousY = drop.y;
        drop.x += drop.vx * delta;
        drop.y += drop.vy * delta;
        drop.age += delta;
        let hit = false;
        if (surface && previousY <= surface.y && drop.y >= surface.y && drop.y > previousY) {
          // Segment intersection avoids missing thin UI edges on slow frames.
          const t = (surface.y - previousY) / (drop.y - previousY);
          const x = previousX + (drop.x - previousX) * t;
          if (x >= surface.x && x <= surface.x + surface.width) {
            this.splash(x, surface.y, surface);
            hit = true;
          }
        }
        if (hit || !surface || drop.age > 1.2 || drop.y > this.height + 40) this.nearDrops.splice(i, 1);
      }
      for (let i = this.spray.length - 1; i >= 0; i--) {
        const drop = this.spray[i];
        drop.age += delta;
        drop.vy += 340 * delta;
        drop.x += drop.vx * delta;
        drop.y += drop.vy * delta;
        if (drop.age > drop.life) this.spray.splice(i, 1);
      }
      for (let i = this.ripples.length - 1; i >= 0; i--) {
        this.ripples[i].age += delta;
        if (this.ripples[i].age > this.ripples[i].life) this.ripples.splice(i, 1);
      }
    }

    draw() {
      this.clear();
      const ctx = this.ctx, fx = this.fx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      fx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.lineCap = 'round';
      for (let depth = 0; depth < 3; depth++) {
        ctx.lineWidth = .55 + depth * .28;
        ctx.strokeStyle = `rgba(193,213,224,${(.1 + depth * .075) * this.intensity})`;
        ctx.beginPath();
        for (const drop of this.drops) {
          if (drop.depth !== depth) continue;
          ctx.moveTo(drop.x, drop.y);
          ctx.lineTo(drop.x - drop.vx / drop.vy * drop.length, drop.y - drop.length);
        }
        ctx.stroke();
      }
      fx.lineCap = 'round';
      fx.lineWidth = 1;
      fx.strokeStyle = `rgba(208,229,239,${.54 * this.intensity})`;
      fx.beginPath();
      for (const drop of this.nearDrops) {
        fx.moveTo(drop.x, drop.y);
        fx.lineTo(drop.x - drop.vx / drop.vy * drop.length, drop.y - drop.length);
      }
      fx.stroke();
      for (const ripple of this.ripples) {
        const t = ripple.age / ripple.life;
        fx.strokeStyle = `rgba(214,232,238,${(1 - t) * .56 * this.intensity})`;
        fx.lineWidth = .75;
        fx.beginPath();
        fx.ellipse(ripple.x, ripple.y + .7, (2 + t * 16) * ripple.power, .6 + t * 2.1, 0, Math.PI, Math.PI * 2);
        fx.stroke();
        if (t < .3) {
          fx.fillStyle = `rgba(235,244,241,${(1 - t / .3) * .75})`;
          fx.fillRect(ripple.x - 2, ripple.y - .5, 4, 1);
        }
      }
      for (const drop of this.spray) {
        const t = drop.age / drop.life;
        fx.strokeStyle = `rgba(217,237,244,${(1 - t) * .78 * this.intensity})`;
        fx.lineWidth = drop.radius;
        fx.beginPath();
        fx.moveTo(drop.x, drop.y);
        fx.lineTo(drop.x - drop.vx * .015, drop.y - drop.vy * .015);
        fx.stroke();
      }
    }

    frame(now) {
      if (!this.running || this.destroyed || document.hidden || this.reducedMotion) return;
      const delta = this.lastTime ? Math.min((now - this.lastTime) / 1000, .05) : 0;
      this.lastTime = now;
      this.update(delta);
      this.draw();
      this.frameId = requestAnimationFrame(this.frame);
    }

    getState() {
      return {
        running: this.running, reducedMotion: this.reducedMotion,
        drops: this.drops.length, nearDrops: this.nearDrops.length,
        splashParticles: this.spray.length, ripples: this.ripples.length,
        totalImpacts: this.impacts, impactsBySurface: { ...this.impactsBySurface },
        lastImpact: this.lastImpact ? { ...this.lastImpact, surface: { ...this.lastImpact.surface } } : null,
        surfaces: [...this.surfaces.values()].map(surface => ({ ...surface })),
      };
    }

    destroy() {
      this.stop();
      this.destroyed = true;
      window.removeEventListener('resize', this.resize);
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.drops.length = 0;
      this.surfaces.clear();
      this.emitters.clear();
    }
  }
  window.RainField = RainField;
})();
