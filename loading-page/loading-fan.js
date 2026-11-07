/* The five painted pieces share a single source image and registration. */
(() => {
  'use strict';
  const gates = [0, .23, .50, .74, .98];
  const travel = [204, 198, 208, 200, 206];
  const stagger = 60, hold = 80, burst = 505;
  const breakupWarmup = .60;
  const rad = Math.PI / 180;
  // The five silk panels share the virtual pivot where their centrelines meet.
  const hub = [.459444, .970694];
  const directions = [-146.15, -112.04, -77.95, -41.64, -8.53].map(x => x * rad);
  const peakTime = 215, introLength = 495;
  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = t => t * t * t * (10 + t * (6 * t - 15));

  function openingPose(ms) {
    // One short reflection: turn up into the light, then settle at the exact
    // angle and original color used by the first registered blade.
    const rise = smooth(clamp(ms / peakTime));
    const settle = smooth(clamp((ms - peakTime) / (introLength - peakTime)));
    const turn = (-166 + 33 * rise) * rad - directions[0];
    return {
      turn: turn * (1 - settle),
      width: .925 + .075 * rise,
      light: .055 + .945 * rise + .075 * (rise - settle),
    };
  }

  function introPose(intro, now) {
    if (!intro.bridge) return openingPose(now - intro.start);
    const {at, duration, pose, speed} = intro.bridge;
    const t = clamp((now - at) / duration), k = 1 - smooth(t);
    const tail = duration * t * (1 - t) ** 3 * (1 + 3 * t);
    return {
      turn: pose.turn * k + speed.turn * tail,
      width: Math.max(.91, Math.min(1.01, 1 + (pose.width - 1) * k + speed.width * tail)),
      light: Math.max(.055, Math.min(1.075, 1 + (pose.light - 1) * k + speed.light * tail)),
    };
  }

  function rest(to = 0) {
    return {from: to, to, velocity: 0, start: -Infinity, duration: 0};
  }

  function sample(track, now) {
    if (track.duration === 0 || now >= track.start + track.duration) return {q: track.to, v: 0, active: false};
    if (now < track.start) return {q: track.from, v: 0, active: true};
    const t = clamp((now - track.start) / track.duration), left = 1 - t;
    // Retain the incoming velocity on a reversal. Position and speed both
    // match at the landing; the small overshoot is part of this same curve.
    const arrive = smooth(t) + 3.8 * t ** 5 * left ** 2;
    const slope = 30 * t ** 2 * left ** 2 + 3.8 * t ** 4 * left * (5 * left - 2 * t);
    const blend = t * left ** 3 * (1 + 3 * t);
    const blendSlope = left ** 2 * (1 + 2 * t - 15 * t ** 2);
    return {
      q: track.from + (track.to - track.from) * arrive + track.velocity * track.duration * blend,
      v: (track.to - track.from) * slope / track.duration + track.velocity * blendSlope,
      active: true,
    };
  }

  function randomSequence(seed) {
    return () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }

  function polygon(points, w, h) {
    const path = new Path2D();
    points.forEach(([x, y], i) => {
      if (i === 0) path.moveTo(x * w, y * h);
      else path.lineTo(x * w, y * h);
    });
    path.closePath();
    return path;
  }

  // Bake each small texture once. Drawing these canvases also works from file://.
  function cut(image, points, w, h) {
    const xs = points.map(p => p[0] * w), ys = points.map(p => p[1] * h);
    const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(Math.max(...xs)) - x);
    canvas.height = Math.max(1, Math.ceil(Math.max(...ys)) - y);
    const ctx = canvas.getContext('2d');
    ctx.translate(-x, -y);
    ctx.clip(polygon(points, w, h));
    ctx.drawImage(image, 0, 0, w, h);
    return {canvas, x, y, cx: x + canvas.width / 2, cy: y + canvas.height / 2};
  }

  function litBlade(part, brightness) {
    const shade = Math.round(255 * (1 - brightness) * (brightness > 1 ? .4 : 1));
    if (shade === 0) return part.canvas;
    if (!part.side) {
      part.side = document.createElement('canvas');
      part.side.width = part.canvas.width;
      part.side.height = part.canvas.height;
      part.sideContext = part.side.getContext('2d');
    }
    if (shade !== part.lastShade) {
      const ctx = part.sideContext;
      ctx.globalCompositeOperation = 'copy';
      ctx.drawImage(part.canvas, 0, 0);
      // Only the silk darkens. The pierced blossom and its soft
      // edges keep their original alpha through the turn.
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = Math.abs(shade) / 255;
      ctx.fillStyle = shade > 0 ? '#09050a' : '#ffe8de';
      ctx.fillRect(0, 0, part.side.width, part.side.height);
      ctx.globalAlpha = 1;
      part.lastShade = shade;
    }
    return part.side;
  }

  // Upload a single shard atlas to the GPU; the burst reuses it every frame.
  function shardAtlas(image, shards, w, h) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * 1.35);
    let x = 1, y = 1, row = 0;
    for (const piece of shards) {
      if (x + piece.width >= canvas.width) { x = 1; y += row + 2; row = 0; }
      piece.sx = x;
      piece.sy = y;
      x += piece.width + 2;
      row = Math.max(row, piece.height);
    }
    canvas.height = y + row + 1;
    const ctx = canvas.getContext('2d');
    for (const part of shards) {
      ctx.save();
      ctx.translate(part.sx - part.x, part.sy - part.y);
      ctx.clip(polygon(part.points, w, h));
      ctx.drawImage(image, 0, 0, w, h);
      ctx.restore();
    }
    return canvas;
  }

  function emitterPoints(image, w, h, outlines) {
    const probe = document.createElement('canvas');
    probe.width = 100;
    probe.height = Math.max(1, Math.round(100 * h / w));
    const context = probe.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0, probe.width, probe.height);
    let pixels;
    if (location.protocol !== 'file:') {
      try { pixels = context.getImageData(0, 0, probe.width, probe.height).data; }
      catch { /* A protected image can still emit texels from its registered blade outlines. */ }
    }
    const shape = new Path2D();
    outlines.forEach(points => shape.addPath(polygon(points, probe.width, probe.height)));
    const points = [];
    for (let y = 0; y < probe.height; y++) {
      for (let x = 0; x < probe.width; x++) {
        const opaque = pixels ? pixels[4 * (y * probe.width + x) + 3] > 180 :
          context.isPointInPath(shape, x + .5, y + .5);
        if (opaque) points.push([(x + .5) / probe.width, (y + .5) / probe.height]);
      }
    }
    return points;
  }

  function buildBreakup(image, w, h, outlines) {
    const random = randomSequence(98144), shards = [], dust = [];
    const columns = 7, rows = 4;
    const grid = Array.from({length: rows + 1}, (_, row) =>
      Array.from({length: columns + 1}, (_, col) => [
        (col + (col > 0 && col < columns ? (random() - .5) * .76 : 0)) / columns,
        (row + (row > 0 && row < rows ? (random() - .5) * .76 : 0)) / rows,
      ]));
    const velocity = (x, y, speed) => {
      const angle = Math.atan2((y - .50) * 1.3, x - .5) + (random() - .5) * .70;
      return {vx: w * Math.cos(angle) * speed, vy: h * Math.sin(angle) * speed * 1.20};
    };
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < columns; col++) {
        const a = grid[row][col], b = grid[row][col + 1];
        const c = grid[row + 1][col], d = grid[row + 1][col + 1];
        const pair = random() < .5 ? [[a, b, c], [b, d, c]] : [[a, b, d], [a, d, c]];
        for (const points of pair) {
          const xs = points.map(p => p[0] * w), ys = points.map(p => p[1] * h);
          const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
          const width = Math.ceil(Math.max(...xs)) - x, height = Math.ceil(Math.max(...ys)) - y;
          const cx = x + width / 2, cy = y + height / 2;
          const rim = Math.min(1, Math.hypot(2 * cx / w - 1, 2 * cy / h - 1));
          const part = {points, x, y, width, height, cx, cy,
            ...velocity(cx / w, cy / h, .20 + random() * .28),
            spin: (random() - .5) * 3.35, curl: (random() - .5) * .20,
            delay: .12 * (1 - rim) + random() * .025, shrink: .14 + random() * .42,
          };
          shards.push(part);
        }
      }
    }

    // Sample the actual material, leaving the pierced blossom holes empty.
    const emitters = emitterPoints(image, w, h, outlines);
    for (let i = 0; i < 155 && emitters.length; i++) {
      const [u, v] = emitters[Math.floor(random() * emitters.length)];
      dust.push({
        x: u * w, y: v * h,
        sx: Math.floor(u * w), sy: Math.floor(v * h),
        ...velocity(u, v, .3 + random() * .22),
        size: (.003 + random() * .009) * w,
        delay: random() * .16, aspect: .28 + random() * .66,
      });
    }
    return {shards, dust, atlas: shardAtlas(image, shards, w, h)};
  }

  class LoadingFan {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.image = new Image();
      this.image.decoding = 'async';
      this.progress = 0;
      this.started = false;
      this.intro = null;
      this.tracks = gates.map(() => rest());
      this.playHead = 0;
      this.staticPose = false;
      this.done = false;
      this.failed = false;
      this.completion = null;
      this.media = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.media.addEventListener('change', () => this.motionChanged());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden && this.completion) this.end();
        else if (!document.hidden) this.request();
      });
      const resize = () => {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        const width = Math.round(canvas.clientWidth * dpr), height = Math.round(canvas.clientHeight * dpr);
        if (width && height && (width !== canvas.width || height !== canvas.height)) {
          canvas.width = width;
          canvas.height = height;
          if (this.outlines) this.prepareScene();
          this.request();
        }
      };
      if (window.ResizeObserver) {
        this.observer = new ResizeObserver(resize);
        this.observer.observe(canvas);
      }
      window.addEventListener('resize', resize, {passive: true});
      this.image.onload = async () => {
        // A load event only guarantees the compressed bytes have arrived.
        // Decode before the first canvas draw so the silk cannot stall the ink reveal.
        if (this.image.decode) {
          try { await this.image.decode(); }
          catch { this.fail(); return; }
        }
        const outlines = window.FanSlicePolygons;
        if (!Array.isArray(outlines) || outlines.length !== gates.length) { this.fail(); return; }
        this.outlines = outlines;
        resize();
        this.prepareScene();
        if (this.completion) clearTimeout(this.completion.loadTimer);
        if (this.started) this.aim(performance.now());
        this.prewarm();
        this.request();
      };
      this.image.onerror = () => this.fail();
      this.image.src = 'assets/loading-ui/fan-brocade.webp?v=672';
      resize();
    }

    get reduced() { return this.staticPose || this.media.matches; }

    prepareScene() {
      // Use the same pixel-aligned surface for the complete image, the flying
      // blades and the shattered texture. A change of alpha must not switch
      // the browser to a different downsampling filter mid-transition.
      const fit = Math.min(this.canvas.width / (2.2 * this.image.naturalWidth),
                           this.canvas.height / (2.4 * this.image.naturalHeight));
      const w = Math.max(1, Math.round(this.image.naturalWidth * fit));
      const h = Math.max(1, Math.round(this.image.naturalHeight * fit));
      if (this.w === w && this.h === h) return;
      this.w = w; this.h = h;
      const face = this.face = document.createElement('canvas');
      face.width = w; face.height = h;
      const ctx = face.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.image, 0, 0, w, h);
      // Materialize a moving panel only as it opens. Settled panels use the joined face.
      this.pieces = new Array(this.outlines.length);
      const joined = new Path2D();
      this.prefix = this.outlines.map(points => {
        joined.addPath(polygon(points, w, h));
        return new Path2D(joined);
      });
      this.breakup = null;
      this.prewarm();
    }

    fail() {
      this.failed = true;
      if (this.completion) this.end();
    }

    setReducedMotion(value) {
      if (this.staticPose === value) return;
      this.staticPose = value;
      this.motionChanged();
    }

    motionChanged() {
      if (this.reduced) {
        if (this.completion) { this.end(); return; }
        this.intro = null;
        this.tracks = gates.map(gate => rest(this.progress >= gate ? 1 : 0));
      }
      this.request();
    }

    reset() {
      this.end();
      this.done = false;
      this.progress = 0;
      this.started = false;
      this.intro = null;
      this.tracks = gates.map(() => rest());
    }

    end() {
      this.done = true;
      cancelAnimationFrame(this.playHead);
      this.playHead = 0;
      if (this.ctx) {
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      const job = this.completion;
      this.completion = null;
      if (job) { clearTimeout(job.loadTimer); job.resolve(); }
    }

    setProgress(value) {
      if (!Number.isFinite(value)) return;
      const progress = clamp(value);
      if (this.done && progress < 1) this.reset();
      if (this.completion && progress < 1) {
        const job = this.completion;
        this.completion = null;
        clearTimeout(job.loadTimer);
        job.resolve();
      }
      if (this.started && this.progress === progress) return;
      this.started = true;
      this.progress = progress;
      this.prewarm();
      if (this.pieces) this.aim(performance.now());
    }

    aim(now) {
      let changed = false;
      if (this.tracks[0].to === 0) {
        this.tracks[0] = rest(1);
        this.intro = this.reduced ? null : {start: now, bridge: null};
        changed = true;
      }
      if (this.intro && !this.intro.bridge && now - this.intro.start >= introLength) {
        this.intro = null;
        changed = true;
      }
      if (this.intro && !this.intro.bridge) {
        const age = now - this.intro.start;
        if (this.progress < 1) { if (changed) this.request(); return; }
        const dt = .5, pose = openingPose(age);
        const prev = openingPose(age - dt), next = openingPose(age + dt);
        this.intro.bridge = {
          at: now, duration: 105, pose,
          speed: {turn: next.turn - prev.turn, width: next.width - prev.width, light: next.light - prev.light},
        };
        changed = true;
      }
      for (let i = 1; i < gates.length; i++) {
        const target = this.progress >= gates[i] ? 1 : 0;
        const track = this.tracks[i];
        if (target === track.to) continue;
        changed = true;
        const {q, v} = sample(track, now);
        if (this.reduced || (Math.abs(target - q) < .0001 && Math.abs(v) < .00001)) {
          this.tracks[i] = rest(target);
          continue;
        }
        const waiting = target === 1 && i > 0 && q === 0 && v === 0;
        const start = waiting ? Math.max(now, this.tracks[i - 1].start + stagger) : now;
        this.tracks[i] = {from: q, to: target, velocity: v, start,
          duration: travel[i] * Math.max(.38, Math.min(1, Math.sqrt(Math.abs(target - q))))};
      }
      if (changed) this.request();
    }

    prepareBreakup() {
      if (!this.breakup && this.pieces) this.breakup = buildBreakup(this.face, this.w, this.h, this.outlines);
    }

    prewarm() {
      if (this.progress < breakupWarmup || this.reduced || this.done || this.queued || !this.pieces || this.breakup) return;
      this.queued = true;
      const run = () => {
        this.queued = false;
        if (this.progress >= breakupWarmup && !this.done && !this.reduced) this.prepareBreakup();
      };
      if (window.requestIdleCallback) window.requestIdleCallback(run, {timeout: 300});
      else setTimeout(run, 0);
    }

    finish() {
      if (this.completion) return this.completion.promise;
      if (this.done) return Promise.resolve();
      this.setProgress(1);
      if (this.reduced || document.hidden || !this.ctx || this.failed) { this.end(); return Promise.resolve(); }
      let resolve;
      const promise = new Promise(complete => { resolve = complete; });
      this.completion = {promise, resolve, burstAt: null, loadTimer: 0};
      if (!this.pieces) this.completion.loadTimer = setTimeout(() => this.end(), 1100);
      this.request();
      return promise;
    }

    request() {
      if (this.playHead || !this.started || !this.pieces || !this.ctx || this.done || document.hidden) return;
      this.playHead = requestAnimationFrame(now => { this.playHead = 0; this.paint(now); });
    }

    paint(now) {
      const {ctx, canvas, w, h} = this;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.translate(Math.round((canvas.width - w) / 2), Math.round((canvas.height - h) / 2));
      if (this.intro && !this.intro.bridge && now - this.intro.start >= introLength) this.aim(now);
      if (this.intro?.bridge && now - this.intro.bridge.at >= this.intro.bridge.duration) this.intro = null;
      const poses = this.tracks.map(track => sample(track, now));
      const job = this.completion;
      if (job && !this.intro && poses.every(pose => !pose.active && pose.q === 1)) {
        if (job.burstAt === null) job.burstAt = now + hold;
        if (now >= job.burstAt) {
          const t = (now - job.burstAt) / burst;
          if (t >= 1) { this.end(); return; }
          this.scatter(t);
          this.request();
          return;
        }
      }

      let settled = 0;
      while (!this.intro && settled < poses.length && !poses[settled].active && poses[settled].q === 1) settled++;
      const first = this.intro ? introPose(this.intro, now) : {turn: 0, width: 1, light: 1};
      const angles = [directions[0] + first.turn];
      for (let i = 1; i < poses.length; i++) {
        angles[i] = angles[i-1] + (directions[i] - angles[i-1]) * poses[i].q;
      }
      const px = w * hub[0], py = h * hub[1];
      // The next blade emerges behind its physical neighbour, both fixed to
      // the same virtual pin. Narrowing across its own long axis suggests yaw.
      for (let i = poses.length - 1; i >= settled; i--) {
        const q = poses[i].q;
        if (q <= 0) continue;
        const part = this.pieces[i] ??= cut(this.face, this.outlines[i], w, h);
        const width = i === 0 ? first.width : .925 + .075 * clamp(q);
        const light = i === 0 ? first.light : .42 + .58 * smooth(clamp(q));
        ctx.save();
        ctx.globalAlpha = i === 0 ? 1 : smooth(clamp(q / .18));
        ctx.translate(px, py);
        ctx.rotate(angles[i]);
        ctx.scale(1, width);
        ctx.rotate(-directions[i]);
        ctx.drawImage(litBlade(part, light), part.x - px, part.y - py);
        ctx.restore();
      }
      // The registered, settled blades occlude the folded edges underneath.
      if (settled === 5) ctx.drawImage(this.face, 0, 0);
      else if (settled) {
        ctx.save();
        ctx.clip(this.prefix[settled - 1]);
        ctx.drawImage(this.face, 0, 0);
        ctx.restore();
      }
      const swing = this.intro && (this.intro.bridge || now - this.intro.start < introLength);
      if (job || swing || poses.some(pose => pose.active)) this.request();
    }

    scatter(t) {
      const {ctx, face, w, h} = this;
      this.prepareBreakup();
      const {shards, dust, atlas} = this.breakup;
      // Cross-dissolve in premultiplied color. At the first sample the image
      // is exactly the joined leaf, even where antialiasing rounds a cut edge.
      const released = smooth(clamp(t / .12));
      ctx.save();
      if (released < 1) {
        ctx.globalAlpha = 1 - released;
        ctx.drawImage(face, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
      }
      for (const part of shards) {
        const phase = clamp((t - part.delay) / (1 - part.delay));
        const drift = smooth(phase);
        const bend = part.curl * Math.sin(Math.PI * drift);
        ctx.save();
        ctx.globalAlpha = released * (1 - smooth(clamp((phase - .06) / .94)));
        ctx.translate(part.cx + part.vx * drift - (part.vy / h) * w * bend,
                      part.cy + part.vy * drift + (part.vx / w) * h * bend + h * .058 * drift * drift);
        ctx.rotate(part.spin * drift);
        const shrink = 1 - part.shrink * drift;
        ctx.scale(shrink, shrink);
        ctx.drawImage(atlas, part.sx, part.sy, part.width, part.height, part.x - part.cx, part.y - part.cy, part.width, part.height);
        ctx.restore();
      }
      ctx.restore();
      ctx.save();
      for (const speck of dust) {
        const phase = clamp((t - speck.delay) / (1 - speck.delay));
        if (!phase) continue;
        const drift = smooth(phase), glow = smooth(clamp(phase / .22));
        const size = speck.size * (.35 + .65 * glow) * (1 - drift * .61);
        const x = speck.x + speck.vx * drift - size * .5;
        const y = speck.y + speck.vy * drift + h * .09 * drift * drift - size * speck.aspect * .5;
        ctx.globalAlpha = glow * (1 - smooth(clamp((phase - .24) / .76)));
        ctx.drawImage(face, speck.sx, speck.sy, 1, 1, x, y, size, size * speck.aspect);
      }
      ctx.restore();
    }
  }

  window.LoadingFan = LoadingFan;
})();
