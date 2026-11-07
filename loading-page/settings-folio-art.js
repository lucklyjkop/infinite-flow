/* Short-lived entrance/exit choreography using the generated, registered art. */
(() => {
  'use strict';

  const root = 'assets/settings-folio/';
  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => value * value * (3 - 2 * value);
  const svgNS = 'http://www.w3.org/2000/svg';
  const sound = (name, group, gain = 1, pan = 0) => {
    if (!document.hidden) window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail: {name, group, gain, pan}}));
  };
  const stopSound = group => window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail: {group, fade: .05}}));

  class SettingsFolioArt {
    constructor(dialog) {
      this.dialog = dialog;
      this.stage = dialog.querySelector('.settings-stage');
      this.screen = dialog.querySelector('.folio-screen');
      this.die = dialog.querySelector('.folio-dice');
      this.thread = dialog.querySelector('.folio-thread');
      this.frame = 0;
      this.serial = 0;
      this.progress = 0;
      this.active = false;
      this.job = null;
      this.atlas = new Image();
      this.media = matchMedia('(prefers-reduced-motion: reduce)');
      if (!this.stage || !this.screen || !this.die || !this.thread) return;

      const image = (file, className, host) => {
        const node = new Image();
        node.src = root + file;
        node.alt = '';
        node.draggable = false;
        node.decoding = 'async';
        if (className) node.className = className;
        host.append(node);
        return node;
      };
      const sources = [
        image('blank-screen.webp', 'folio-empty-screen', this.screen),
        image('screen-figure.webp', 'folio-portrait', this.screen),
      ];
      const lower = dialog.querySelector('.branch-lower');
      const upper = dialog.querySelector('.branch-upper');
      if (lower) sources.push(image('plum-bottom-left.webp', '', lower));
      if (upper) sources.push(image('plum-top-right.webp', '', upper));
      this.fallback = image('die-ruby.webp', 'folio-die-fallback', this.die);
      sources.push(this.fallback);
      this.canvas = document.createElement('canvas');
      this.canvas.setAttribute('aria-hidden', 'true');
      this.canvas.width = this.canvas.height = 384;
      this.die.append(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.atlas.src = root + 'dice-roll.webp';
      this.atlas.decoding = 'async';
      sources.push(this.atlas);
      this.ready = Promise.allSettled(sources.map(node => node.decode())).then(() => {
        if (this.atlas.naturalWidth && this.ctx) {
          this.fallback.hidden = true;
          this.paintDie(this.active ? this.progress : 1);
        }
      });

      this.svg = document.createElementNS(svgNS, 'svg');
      this.svg.setAttribute('aria-hidden', 'true');
      this.svg.setAttribute('preserveAspectRatio', 'none');
      this.paths = ['thread-under', 'thread-light'].map(name => {
        const path = document.createElementNS(svgNS, 'path');
        path.setAttribute('class', name);
        path.setAttribute('pathLength', '1');
        this.svg.append(path);
        return path;
      });
      this.thread.append(this.svg);
      this.observer = new ResizeObserver(() => {
        if (!this.active) return;
        this.layout();
        this.poseDie(this.progress);
        this.drawThread(this.lineProgress ?? 1);
      });
      this.observer.observe(this.stage);
      this.observer.observe(this.screen);
      this.observer.observe(this.die);
      const settleMotion = () => {
        if (!this.active || !this.reduced()) return;
        if (this.dialog.dataset.folioArt === 'closing') this.clear();
        else this.settle();
      };
      this.media.addEventListener('change', settleMotion);
      document.addEventListener('visibilitychange', settleMotion);
      window.addEventListener('infinite:settings', settleMotion);
      dialog.addEventListener('close', () => { if (!dialog.open) this.clear(); });
    }

    reduced() {
      return this.media.matches || document.hidden
        || document.getElementById('world')?.classList.contains('motion-off');
    }

    layout() {
      const stage = this.stage.getBoundingClientRect();
      const screen = this.screen.getBoundingClientRect();
      const die = this.die.getBoundingClientRect();
      if (!stage.width || !stage.height || !die.width) return;
      // Both screen images are 3:4 and use contain, centered horizontally at the bottom.
      const width = Math.min(screen.width, screen.height * .75);
      const height = width / .75;
      const left = screen.left - stage.left + (screen.width - width) / 2;
      const top = screen.bottom - stage.top - height;
      this.geometry = {
        width: stage.width, height: stage.height,
        handX: left + width * .7182,
        handY: top + height * .3557,
        screenWidth: width, screenHeight: height,
        dieX: die.left - stage.left + die.width / 2,
        dieY: die.top - stage.top + die.height / 2,
        dieSize: die.width,
      };
      this.svg.setAttribute('viewBox', '0 0 ' + stage.width + ' ' + stage.height);
    }

    paintDie(value) {
      if (!this.ctx || !this.atlas.naturalWidth) return;
      const cell = 384;
      // Six painted projections show different facets. Only the final pose is held.
      const frame = value >= 1 ? 5 : Math.min(10.999, value * 11.5);
      const first = Math.floor(frame) % 6;
      const second = (first + 1) % 6;
      const blend = value >= 1 ? 0 : frame % 1;
      const ctx = this.ctx;
      ctx.clearRect(0, 0, cell, cell);
      ctx.globalAlpha = 1 - blend;
      ctx.drawImage(this.atlas, first * cell, 0, cell, cell, 0, 0, cell, cell);
      if (blend) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = blend;
        ctx.drawImage(this.atlas, second * cell, 0, cell, cell, 0, 0, cell, cell);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    poseDie(value) {
      this.progress = value;
      const size = this.geometry?.dieSize || 140;
      const fall = clamp(value / .64);
      const impact = clamp((value - .64) / .36);
      const bounce = Math.sin(impact * Math.PI * 2) * (1 - impact) * .15;
      this.dieOffsetX = size * .55 * (1 - ease(value));
      this.dieOffsetY = -size * (.86 * (1 - fall * fall) + Math.abs(bounce));
      const scale = .64 + .36 * ease(fall);
      const angle = -39 * (1 - ease(value)) + Math.sin(impact * Math.PI * 2) * 5 * (1 - impact);
      const transform = 'translate3d(' + this.dieOffsetX.toFixed(2) + 'px,'
        + this.dieOffsetY.toFixed(2) + 'px,0) rotate(' + angle.toFixed(2)
        + 'deg) scale(' + scale.toFixed(3) + ')';
      this.canvas.style.transform = transform;
      this.fallback.style.transform = transform;
      this.die.style.setProperty('--die-shadow-scale', String(.45 + .55 * fall));
      this.die.style.setProperty('--die-shadow-opacity', String(.18 + .82 * fall));
      this.paintDie(value);
    }

    diceSound(value) {
      // Match actual floor contacts in poseDie, including the two shrinking bounces.
      // A delayed frame emits only the most recent contact, never a burst of missed hits.
      const contacts = [.64, .82, 1], levels = [.8, .42, .23];
      let contact = -1;
      contacts.forEach((at, i) => { if (this.dieSoundProgress < at && value >= at) contact = i; });
      this.dieSoundProgress = value;
      if (contact < 0) return;
      const pan = this.geometry ? Math.max(-.5, Math.min(.5, this.geometry.dieX / this.geometry.width * 2 - 1)) : .35;
      sound('dice-land', 'settings-dice', levels[contact], pan);
    }

    drawThread(value) {
      if (!this.geometry) return;
      this.lineProgress = value;
      const g = this.geometry;
      const endX = g.dieX + (this.dieOffsetX || 0);
      const endY = g.dieY + (this.dieOffsetY || 0) - g.dieSize * .27;
      const turnX = Math.max(g.handX, endX) + g.screenWidth * .14;
      const turnY = g.handY + (endY - g.handY) * .5;
      const d = 'M ' + g.handX + ' ' + g.handY
        + ' C ' + (g.handX - g.screenWidth * .03) + ' ' + (g.handY + g.screenHeight * .06)
        + ' ' + turnX + ' ' + (g.handY + g.screenHeight * .1)
        + ' ' + turnX + ' ' + turnY
        + ' C ' + turnX + ' ' + (turnY + g.screenHeight * .16)
        + ' ' + (endX - g.screenWidth * .08) + ' ' + (endY - g.dieSize * .18)
        + ' ' + endX + ' ' + endY;
      for (const path of this.paths) {
        path.setAttribute('d', d);
        path.style.strokeDashoffset = String(1 - value);
      }
    }

    stop(cancelSound = true) {
      cancelAnimationFrame(this.frame);
      this.frame = 0;
      if (cancelSound) {
        stopSound('settings-art');
        stopSound('settings-dice');
      }
      if (this.job) {
        this.job.resolve();
        this.job = null;
      }
    }

    settle() {
      this.stop();
      this.dialog.dataset.folioStill = '';
      this.dialog.dataset.folioArt = 'visible';
      this.layout();
      this.die.style.opacity = '1';
      this.poseDie(1);
      this.drawThread(1);
    }

    open() {
      if (!this.stage || !this.canvas) return Promise.resolve();
      this.stop();
      const serial = ++this.serial;
      this.active = true;
      this.layout();
      this.dieSoundProgress = 0;
      if (this.reduced()) {
        this.settle();
        sound('dice-land', 'settings-dice', .45, .35);
        return Promise.resolve();
      }
      delete this.dialog.dataset.folioStill;
      this.dialog.dataset.folioArt = 'hidden';
      this.die.style.opacity = '0';
      this.poseDie(0);
      this.drawThread(0);
      this.screen.getBoundingClientRect();
      return new Promise(resolve => {
        this.job = {resolve};
        // Let the hidden pose acquire its style before starting transitions.
        this.frame = requestAnimationFrame(() => {
          if (serial !== this.serial || !this.active) return;
          this.dialog.dataset.folioArt = 'visible';
          sound('branch-grow', 'settings-art', .5, -.25);
          const began = performance.now();
          const tick = now => {
            this.frame = 0;
            if (serial !== this.serial || !this.active) return;
            const elapsed = now - began;
            this.layout();
            const roll = clamp((elapsed - 740) / 700);
            this.die.style.opacity = String(clamp((elapsed - 740) / 80));
            this.poseDie(roll);
            this.diceSound(roll);
            this.drawThread(ease(clamp((elapsed - 460) / 400)));
            if (elapsed >= 1440) {
              this.poseDie(1);
              this.drawThread(1);
              this.stop(false);
            } else this.frame = requestAnimationFrame(tick);
          };
          this.frame = requestAnimationFrame(tick);
        });
      });
    }

    close() {
      if (!this.active || !this.canvas) return Promise.resolve();
      this.stop();
      const serial = ++this.serial;
      this.dialog.dataset.folioArt = 'closing';
      if (this.reduced()) { this.clear(); return Promise.resolve(); }
      const initialLine = this.lineProgress || 0;
      const initialOpacity = Number(this.die.style.opacity) || 0;
      return new Promise(resolve => {
        this.job = {resolve};
        const began = performance.now();
        const tick = now => {
          this.frame = 0;
          if (serial !== this.serial) return;
          const elapsed = now - began;
          this.drawThread(initialLine * (1 - ease(clamp(elapsed / 430))));
          this.die.style.opacity = String(initialOpacity * (1 - ease(clamp(elapsed / 260))));
          if (elapsed >= 610) this.clear();
          else this.frame = requestAnimationFrame(tick);
        };
        this.frame = requestAnimationFrame(tick);
      });
    }

    rollDice({animated = true} = {}) {
      if (!this.active || this.dialog.dataset.folioArt === 'closing' || !this.canvas) return Promise.resolve();
      this.stop();
      const serial = ++this.serial;
      this.dieSoundProgress = 0;
      if (!animated || this.reduced()) {
        this.settle();
        sound('dice-land', 'settings-dice', .8, .35);
        return Promise.resolve();
      }
      this.die.style.opacity = '1';
      this.layout();
      return new Promise(resolve => {
        this.job = {resolve};
        const began = performance.now();
        const tick = now => {
          this.frame = 0;
          if (serial !== this.serial || !this.active) return;
          const value = clamp((now - began) / 760);
          this.poseDie(value);
          this.diceSound(value);
          this.drawThread(1);
          if (value === 1) this.stop(false);
          else this.frame = requestAnimationFrame(tick);
        };
        this.frame = requestAnimationFrame(tick);
      });
    }

    clear() {
      this.serial++;
      this.stop();
      this.active = false;
      this.dialog.dataset.folioArt = 'hidden';
      delete this.dialog.dataset.folioStill;
      if (this.die) this.die.style.opacity = '0';
      if (this.paths) this.drawThread(0);
    }
  }

  window.SettingsFolioArt = SettingsFolioArt;
})();
