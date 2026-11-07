/* Twelve opacity intervals baked from the original ink field. Each interval
   needs just two small image plates. The compositor interpolates between them. */
(() => {
  'use strict';

  const duration = 2450;
  const columns = 4;
  const rows = 3;
  const intervals = columns * rows;

  function positions(half) {
    return Array.from({length: intervals + 1}, (_, i) => {
      const cell = Math.min(i, intervals - 1);
      const x = -(cell % columns) * 100 / columns;
      const y = -(Math.floor(cell / columns) + half * rows) * 100 / (2 * rows);
      return {offset: i / intervals, transform: 'translate(' + x + '%, ' + y + '%)', easing: 'steps(1, end)'};
    });
  }

  const fade = [];
  for (let i = 0; i < intervals; i++) {
    fade.push({offset: i / intervals, opacity: 1}, {offset: (i + 1) / intervals, opacity: 0});
  }

  class InkReveal {
    constructor(stage) {
      this.stage = stage;
      this.veil = stage.parentElement;
      this.animations = [];
      this.run = 0;
    }

    prepare() {
      if (this.ready || this.decoding || !this.stage.animate) return;
      // Two views of one decoded atlas. Native <picture> selection also handles
      // a rotation during playback without rebuilding any contour on the main thread.
      if (!this.layers) {
        const base = this.stage.querySelector('picture');
        if (!base || !base.querySelector('img')?.decode) return;
        this.top = base.cloneNode(true);
        this.stage.append(this.top);
        this.layers = [base.querySelector('img'), this.top.querySelector('img')];
      }
      this.decoding = Promise.all(this.layers.map(img => img.decode())).then(
        () => (this.ready = true),
        () => { this.decoding = null; return false; }
      );
    }

    start(skip, reduced) {
      this.finish();
      if (skip) return;
      this.veil.classList.remove('veil-clear');
      if (reduced || !this.stage.animate) return;
      this.prepare();
      const run = this.run;
      const started = performance.now();
      const play = () => {
        if (run !== this.run || !this.ready) return;
        const age = performance.now() - started;
        // If artwork arrives late the CSS fallback is already visible. Finish
        // that fade instead of suddenly putting an almost-opaque veil back.
        if (age > 140 && !document.hidden) return;
        const opts = {duration, fill: 'both', easing: 'linear'};
        this.animations = [
          this.layers[0].animate(positions(0), opts),
          this.layers[1].animate(positions(1), opts),
          this.top.animate(fade, opts)
        ];
        for (const animation of this.animations) animation.currentTime = document.hidden ? 0 : age;
        this.animations[2].onfinish = () => { if (this.run === run) this.finish(); };
        this.veil.classList.add('veil-painted');
        this.setPlayback(false, document.hidden);
      };
      if (this.ready) play();
      else this.decoding?.then(play);
    }

    setPlayback(reduced, hidden) {
      if (reduced) {
        if (this.animations.length) this.finish();
        else this.run++; // Discard a pending decode while the CSS fade runs.
        return;
      }
      for (const animation of this.animations) {
        if (hidden && animation.playState !== 'paused') animation.pause();
        if (!hidden && animation.playState === 'paused') animation.play();
      }
    }

    finish() {
      this.run++;
      for (const animation of this.animations) animation.cancel();
      this.animations.length = 0;
      this.veil.classList.remove('veil-painted');
      this.veil.classList.add('veil-clear');
    }
  }

  window.InkReveal = InkReveal;
})();
