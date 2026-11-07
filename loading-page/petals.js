/* Layered falling sakura petals. Safe to load as a classic file:// script. */
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  class PetalField {
    constructor(canvas, options = {}) {
      if (!canvas || typeof canvas.getContext !== 'function') {
        throw new TypeError('PetalField requires a canvas element.');
      }

      this.canvas = canvas;
      this.context = canvas.getContext('2d', { alpha: true });
      this.world = canvas.closest('.world');
      this.reducedMotion = typeof options.reducedMotion === 'boolean'
        ? options.reducedMotion
        : window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.intensity = 0.85;
      this.width = 1;
      this.height = 1;
      this.dpr = 1;
      this.running = false;
      this.destroyed = false;
      this.frameId = 0;
      this.lastTime = 0;
      this.time = 0;
      this.gust = 0;
      this.particles = [];
      this.sprites = this.createSprites();

      this.onFrame = this.onFrame.bind(this);
      this.onResize = this.resize.bind(this);
      this.onVisibility = this.onVisibility.bind(this);
      window.addEventListener('resize', this.onResize, { passive: true });
      document.addEventListener('visibilitychange', this.onVisibility);
      this.resize();
    }

    // Draw the expensive gradients and soft edges once, not inside the frame loop.
    createSprites() {
      const result = [];
      for (let shape = 0; shape < 3; shape += 1) {
        for (let near = 0; near < 2; near += 1) {
          const sprite = document.createElement('canvas');
          sprite.width = 96;
          sprite.height = 96;
          const ctx = sprite.getContext('2d');
          if (!ctx) continue;

          ctx.translate(48, 48);
          ctx.scale(1, 0.62);
          if (near) ctx.filter = 'blur(0.8px)';
          const color = ctx.createLinearGradient(-25, -28, 26, 29);
          color.addColorStop(0, shape === 1 ? '#bf5650' : '#ac3e46');
          color.addColorStop(0.28, '#a32c40');
          color.addColorStop(0.62, '#761e33');
          color.addColorStop(1, '#3c1523');
          ctx.fillStyle = color;
          ctx.beginPath();
          // Unequal lobes and an off-centre curl give each sliver its own profile.
          if (shape === 0) {
            ctx.moveTo(-24, -17);
            ctx.bezierCurveTo(-7, -34, 27, -25, 29, -4);
            ctx.bezierCurveTo(31, 12, 9, 28, -18, 26);
            ctx.bezierCurveTo(-6, 11, -32, 3, -24, -17);
          } else if (shape === 1) {
            ctx.moveTo(-27, -12);
            ctx.bezierCurveTo(-29, -34, 16, -34, 28, -11);
            ctx.bezierCurveTo(36, 8, 4, 13, -8, 31);
            ctx.bezierCurveTo(-9, 15, -24, 7, -27, -12);
          } else {
            ctx.moveTo(-26, -18);
            ctx.bezierCurveTo(-11, -30, 9, -29, 25, -8);
            ctx.bezierCurveTo(31, 0, 19, 13, 22, 23);
            ctx.bezierCurveTo(-2, 30, -12, 6, -26, -18);
          }
          ctx.closePath();
          ctx.fill();
          ctx.strokeStyle = 'rgba(198, 103, 92, 0.25)';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(-18, -18);
          ctx.bezierCurveTo(-1, -3, 10, 4, 4, 20);
          ctx.strokeStyle = 'rgba(194, 86, 92, 0.22)';
          ctx.lineWidth = 1.1;
          ctx.stroke();
          result.push(sprite);
        }
      }
      return result;
    }

    resetParticle(particle, initial) {
      const random = Math.random;
      const near = random() > 0.85;
      const middle = !near && random() > 0.42;
      const depth = near ? 1 : middle ? 0.62 : 0.30;
      const scale = clamp(this.width / 1440, 0.82, 1.1);

      if (initial) {
        particle.x = random() * this.width;
        particle.y = random() * this.height;
      } else if (random() < 0.88) {
        particle.x = random() * (this.width + 110) - 80;
        particle.y = -35 - random() * 70;
      } else {
        particle.x = -40;
        particle.y = random() * this.height * 0.72;
      }

      particle.size = (near ? 23 + random() * 9 : middle ? 16 + random() * 8 : 9 + random() * 6) * scale;
      particle.depth = depth;
      particle.speed = (8 + depth * 14 + random() * 7) * scale;
      particle.fall = (20 + depth * 34 + random() * 13) * scale;
      particle.angle = random() * TAU;
      particle.spin = (random() - 0.5) * (near ? 1.4 : 0.95);
      particle.phase = random() * TAU;
      particle.frequency = 0.65 + random() * 0.7;
      particle.alpha = near ? 0.6 + random() * 0.2 : middle ? 0.62 + random() * 0.2 : 0.3 + random() * 0.22;
      particle.sprite = Math.floor(random() * 3) * 2 + (near ? 1 : 0);
      return particle;
    }

    resize() {
      if (this.destroyed || !this.context) return this;
      const oldWidth = this.width;
      const oldHeight = this.height;
      this.width = Math.max(1, this.canvas.clientWidth || window.innerWidth);
      this.height = Math.max(1, this.canvas.clientHeight || window.innerHeight);
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      this.canvas.width = Math.round(this.width * this.dpr);
      this.canvas.height = Math.round(this.height * this.dpr);

      const target = this.reducedMotion ? 7 : this.width < 680 ? 22 : 38;
      for (let i = 0; i < this.particles.length; i += 1) {
        this.particles[i].x *= this.width / oldWidth;
        this.particles[i].y *= this.height / oldHeight;
      }
      while (this.particles.length < target) {
        this.particles.push(this.resetParticle({}, true));
      }
      this.particles.length = target;
      this.draw(0);
      return this;
    }

    start() {
      if (this.destroyed || this.running || !this.context || !this.sprites.length) return this;
      this.running = true;
      this.lastTime = 0;
      this.draw(0);
      if (!this.reducedMotion && !document.hidden) {
        this.frameId = window.requestAnimationFrame(this.onFrame);
      }
      return this;
    }

    stop() {
      this.running = false;
      window.cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.lastTime = 0;
      return this;
    }

    setIntensity(value) {
      if (Number.isFinite(value)) this.intensity = clamp(value, 0, 1);
      if (!this.running || this.reducedMotion) this.draw(0);
      return this;
    }

    setReducedMotion(value) {
      const next = Boolean(value);
      if (this.destroyed || next === this.reducedMotion) return this;
      const wasRunning = this.running;
      this.stop();
      this.reducedMotion = next;
      this.resize();
      if (wasRunning) this.start();
      return this;
    }

    // A brief breeze through the existing field, without a confetti-like spawn.
    burst() {
      if (!this.reducedMotion) this.gust = 1;
      return this;
    }

    onVisibility() {
      window.cancelAnimationFrame(this.frameId);
      this.frameId = 0;
      this.lastTime = 0;
      if (!document.hidden && this.running && !this.reducedMotion) {
        this.frameId = window.requestAnimationFrame(this.onFrame);
      }
    }

    onFrame(timestamp) {
      this.frameId = 0;
      if (!this.running || this.destroyed || document.hidden || this.reducedMotion) return;
      const delta = this.lastTime ? Math.min((timestamp - this.lastTime) / 1000, 0.045) : 0;
      this.lastTime = timestamp;
      this.time += delta;
      this.gust = Math.max(0, this.gust - delta * 0.35);
      this.draw(delta);
      this.frameId = window.requestAnimationFrame(this.onFrame);
    }

    draw(delta) {
      const ctx = this.context;
      if (!ctx || this.destroyed) return;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.clearRect(0, 0, this.width, this.height);
      if (this.intensity <= 0 || !this.sprites.length) return;

      const breeze = 1 + Math.sin(this.time * 0.23) * 0.2 + this.gust * 0.65;
      const portrait = this.width < 680 && this.height > this.width;
      const titleVisible = this.world?.dataset.state === 'title';
      for (let i = 0; i < this.particles.length; i += 1) {
        const particle = this.particles[i];
        const flutter = Math.sin(this.time * particle.frequency + particle.phase);
        if (delta > 0) {
          particle.x += (particle.speed * breeze + flutter * 14 * particle.depth) * delta;
          particle.y += (particle.fall + Math.cos(this.time * particle.frequency * 0.7 + particle.phase) * 6 * particle.depth) * delta;
          particle.angle += particle.spin * delta;
          if (particle.x > this.width + 80 || particle.y > this.height + 60) {
            this.resetParticle(particle, false);
          }
        }

        // Keep the face clear, with a soft falloff rather than a rectangular hole.
        const nx = particle.x / this.width;
        const ny = particle.y / this.height;
        const dx = (nx - 0.68) / (portrait ? 0.22 : 0.13);
        const dy = (ny - (portrait ? 0.25 : 0.23)) / 0.17;
        const distance = dx * dx + dy * dy;
        const faceClearance = 0.22 + 0.78 * clamp((distance - 0.18) / 0.95, 0, 1);
        const menuX = (nx - (portrait ? 0.34 : 0.21)) / (portrait ? 0.30 : 0.14);
        const menuY = (ny - (portrait ? 0.72 : 0.53)) / (portrait ? 0.19 : 0.23);
        const menuClearance = titleVisible ? 0.48 + 0.52 * clamp((menuX * menuX + menuY * menuY) / 1.3, 0, 1) : 1;
        const edgeFade = clamp((particle.x + 30) / 60, 0, 1)
          * clamp((this.width + 35 - particle.x) / 70, 0, 1)
          * clamp((particle.y + 30) / 60, 0, 1)
          * clamp((this.height + 35 - particle.y) / 70, 0, 1);
        const alpha = particle.alpha * this.intensity * faceClearance * menuClearance * edgeFade;
        if (alpha < 0.012) continue;

        const angle = particle.angle + flutter * 0.18;
        const cosine = Math.cos(angle);
        const sine = Math.sin(angle);
        const fold = Math.cos(this.time * 0.85 + particle.phase);
        ctx.setTransform(
          this.dpr * cosine, this.dpr * sine,
          -this.dpr * sine * fold, this.dpr * cosine * fold,
          this.dpr * particle.x, this.dpr * particle.y
        );
        ctx.globalAlpha = alpha * (0.82 + 0.18 * fold);
        ctx.drawImage(this.sprites[particle.sprite], -particle.size / 2, -particle.size / 2, particle.size, particle.size);
      }
      ctx.globalAlpha = 1;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    getState() {
      return Object.freeze({ running: this.running, destroyed: this.destroyed,
        particleCount: this.particles.length, reducedMotion: this.reducedMotion,
        intensity: this.intensity, frameScheduled: Boolean(this.frameId), time: this.time });
    }

    destroy() {
      if (this.destroyed) return;
      this.stop();
      window.removeEventListener('resize', this.onResize);
      document.removeEventListener('visibilitychange', this.onVisibility);
      if (this.context) {
        this.context.setTransform(1, 0, 0, 1, 0, 0);
        this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      this.particles.length = 0;
      this.sprites.length = 0;
      this.destroyed = true;
    }
  }

  window.PetalField = PetalField;
})();
