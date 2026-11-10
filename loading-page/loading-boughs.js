(() => {
  'use strict';

  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const radians = Math.PI / 180;
  const growthDuration = 1980;
  const burnDuration = 1530;
  const fadeDuration = 160;
  const sound = (name, group, gain, pan = 0) => {
    if (!document.hidden) window.dispatchEvent(new CustomEvent('infinite:soundcue', {detail: {name, group, gain, pan}}));
  };
  const stopSound = group => window.dispatchEvent(new CustomEvent('infinite:soundstop', {detail: {group, fade: .08}}));

  // Root x/y, length in viewport widths, angle, vertical reflection.
  // Rear branches are painted first. The portrait has its own openings for the face and fan.
  const wide = [
    [-.07,.17,.45,-9,-1], [.40,-.08,.25,35,1], [1.06,.63,.34,171,1],
    [.10,1.06,.28,-23,1], [-.07,.52,.43,-22,-1], [1.06,.13,.28,146,-1],
    [.92,1.05,.32,-145,1], [-.06,.015,.56,14,1], [-.055,.89,.43,-19,1],
    [.98,-.09,.24,109,-1], [.32,-.07,.22,143,1],
  ];
  const tall = [
    [-.13,.07,.82,-4,-1], [.35,-.035,.48,43,1], [1.13,.49,.53,156,1],
    [.04,1.04,.46,-32,1], [-.14,.5,.64,-36,-1], [1.1,.055,.34,155,-1],
    [1.09,.97,.53,-158,1], [-.09,.015,.79,10,1], [-.10,.76,.67,-24,1],
    [1.02,-.05,.49,96,-1], [.22,-.04,.44,140,1],
  ];
  const sources = [1,0,0,1,0,1,0,1,0,0,1];
  const opacities = [.49,.52,.52,.67,.79,.74,.78,.94,.91,.88,.71];
  const starts = [.0,.12,.14,.07,.06,.20,.18,.015,.12,.08,.25];
  const ignition = [.12,.01,.18,.29,.06,.24,.0,.17,.07,.11,.30];

  function surface(w, h, read = false) {
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    return canvas.getContext('2d', {willReadFrequently: read});
  }

  function unpack(encoded) {
    const text = atob(encoded), bytes = new Uint8Array(text.length);
    for (let i=0; i<text.length; i++) bytes[i] = text.charCodeAt(i);
    return bytes;
  }

  function bakedFields(variant) {
    const record = window.LoadingBoughFields?.[variant];
    if (!record) return null;
    const {width, height, root} = record;
    const points = unpack(record.samples);
    const indices = new Uint16Array((points.length-100)/2);
    for (let i=0; i<indices.length; i++) indices[i] = points[100+2*i] | (points[101+2*i] << 8);
    let start = 0;
    const bins = Array.from(points.subarray(0,100), count => {
      const slice = indices.subarray(start,start+count); start += count; return slice;
    });
    return {width, height, root, bins, field:unpack(record.field), sampleAlpha:false};
  }

  // Fallback if the precomputed field script failed to load. Travel along wood
  // is cheap; crossing the transparent air between forks is expensive.
  function measureFields(image, variant) {
    const width = 176;
    const height = Math.max(24, Math.min(112, Math.round(width * image.height / image.width)));
    const mask = surface(width, height, true);
    mask.drawImage(image, 0, 0, width, height);
    let pixels;
    try { pixels = mask.getImageData(0, 0, width, height).data; }
    catch { /* Local file origins can draw the cutout but may not read it. */ }
    const area = width * height;
    const coverage = new Uint8Array(area);
    const distance = new Float32Array(area).fill(1e6);
    let weight = 0, rootHeight = 0;
    for (let i = 0; i < area && pixels; i++) {
      const a = pixels[i * 4 + 3];
      coverage[i] = a;
      if (i % width < width * .065 && a > 48) {
        weight += a; rootHeight += Math.floor(i / width) * a;
      }
    }
    const root = weight ? rootHeight / weight / height : [0.67,0.32][variant];
    const start = Math.min(height - 1, Math.floor(root * height)) * width;
    distance[start] = 0;
    function relax(i, neighbor, length) {
      const drag = coverage[i] + coverage[neighbor] > 26 ? 1 : 6;
      distance[i] = Math.min(distance[i], distance[neighbor] + length * drag);
    }
    if (pixels) {
      for (let pass = 0; pass < 3; pass++) {
        for (const dir of [1, -1]) {
          for (let j = 0; j < area; j++) {
            const i = dir === 1 ? j : area - j - 1;
            const x = i % width, y = Math.floor(i / width);
            const hasX = x - dir >= 0 && x - dir < width;
            if (hasX) relax(i, i - dir, 1);
            if (y - dir < 0 || y - dir >= height) continue;
            const row = i - dir * width;
            relax(i, row, 1);
            if (hasX) relax(i, row - dir, 1.414);
            if (x + dir >= 0 && x + dir < width) relax(i, row + dir, 1.414);
          }
        }
      }
    }
    const travel = [];
    for (let i = 0; i < area; i++) if (coverage[i] > 46) travel.push(distance[i]);
    travel.sort((a,b) => a-b);
    const end = travel[Math.floor(travel.length * .985)] || width;
    const bins = Array.from({length:100}, () => []);
    const field = new Uint8Array(area);
    for (let i = 0; i < area; i++) {
      const u = (i % width) / (width - 1), v = Math.floor(i / width) / (height - 1);
      const grain = .021 * Math.sin(u * 43 + v * 16) + .011 * Math.sin(u * 127 - v * 47);
      const along = pixels ? .43 * u + .57 * distance[i] / end : u + .12 * Math.sin(v * 6 + 2 * u);
      const t = clamp(along + grain);
      field[i] = Math.round(t * 255);
      if (!pixels || coverage[i] > 110) bins[Math.min(99, Math.floor(t * 100))].push(i);
    }
    return {width, height, root, field, bins, sampleAlpha:!pixels};
  }

  function prepare(image, variant) {
    const {width, height, root, field, bins, sampleAlpha} = bakedFields(variant) || measureFields(image,variant);
    // Keep native artwork separate from the low resolution heat/opacity fields.
    const sw = Math.min(835, image.width), sh = Math.round(sw * image.height / image.width);
    const base = surface(sw, sh);
    base.drawImage(image, 0, 0, sw, sh);
    const opacity = surface(width, height), heat = surface(width, height);
    let emberSamples = null;
    if (sampleAlpha) {
      // A file:// page cannot read a sprite's pixels. Sample the sprite's tinted
      // alpha directly while drawing each ember so empty air still produces none.
      const samples = surface(width, height*2);
      samples.drawImage(image, 0, 0, width, height);
      samples.drawImage(image, 0, height, width, height);
      samples.globalCompositeOperation = 'source-in';
      const tint = samples.createLinearGradient(0, 0, 0, height*2);
      tint.addColorStop(0,'#ffc07f'); tint.addColorStop(.5,'#ffc07f');
      tint.addColorStop(.5,'#aa9687'); tint.addColorStop(1,'#aa9687');
      samples.fillStyle = tint; samples.fillRect(0,0,width,height*2);
      emberSamples = samples.canvas;
    }
    return {base, image, root, width, height, field, bins, scratch:surface(sw, sh), opacity, heat,
      alpha:new Uint8ClampedArray(256), tint:new Uint8ClampedArray(256),
      red:new Uint8Array(256), green:new Uint8Array(256), blue:new Uint8Array(256),
      emberSamples, matte:opacity.createImageData(width, height), edge:heat.createImageData(width, height)};
  }

  // Color the advancing front only on existing pigment via source-atop.
  function painted(asset, growth, burn, fromRoot) {
    if (growth >= 1 && burn <= 0) return asset.base.canvas;
    const {field, scratch, matte, edge, opacity, heat} = asset;
    const w = scratch.canvas.width, h = scratch.canvas.height;
    const growLimit = growth * 264, burnLimit = burn * 290 - 17;
    // A small palette lookup avoids evaluating the frontier once per painted pixel.
    const {alpha, tint, red, green, blue} = asset;
    if (burn) tint.fill(0);
    for (let i = 0; i < 256; i++) {
      const d = (fromRoot ? i : 255 - i) - burnLimit;
      alpha[i] = 255 * clamp((growLimit - i) / 8) * (burn ? clamp((d + 1.8) / 3.6) : 1);
      if (!burn || d < -2 || d > 18) continue;
      if (d < 2.6) { red[i]=255; green[i]=192; blue[i]=100; tint[i]=245; }
      else if (d < 9) {
        const k=(d-2.6)/6.4;
        red[i]=240-112*k; green[i]=117-84*k; blue[i]=50-28*k; tint[i]=241-32*k;
      } else { red[i]=47; green[i]=24; blue[i]=29; tint[i]=(18-d)*21; }
    }
    for (let j = 0; j < field.length; j++) {
      const i = field[j], p = j * 4;
      matte.data[p+3] = alpha[i];
      if (burn) { edge.data[p]=red[i]; edge.data[p+1]=green[i]; edge.data[p+2]=blue[i]; edge.data[p+3]=tint[i]; }
    }
    scratch.clearRect(0, 0, w, h);
    scratch.drawImage(asset.base.canvas, 0, 0);
    if (burn) {
      heat.putImageData(edge, 0, 0);
      scratch.globalCompositeOperation = 'source-atop';
      scratch.drawImage(heat.canvas, 0, 0, w, h);
    }
    opacity.putImageData(matte, 0, 0);
    scratch.globalCompositeOperation = 'destination-in';
    scratch.drawImage(opacity.canvas, 0, 0, w, h);
    scratch.globalCompositeOperation = 'source-over';
    return scratch.canvas;
  }

  class LoadingBoughs {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.motion = true;
      this.state = 'idle';
      this.assets = [];
      this.sparks = [];
      this.lastBins = [];
      this.frame = now => { this.raf = 0; this.draw(now); };
      this.resize = () => { this.dirty = true; this.request(); };
      window.addEventListener('resize', this.resize);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.finished) this.clear();
          cancelAnimationFrame(this.raf); this.raf = 0;
        } else { this.last = 0; this.resize(); }
      });
    }

    loadArt() {
      if (this.loading) return;
      this.loading = true;
      ['bough-a','bough-b'].forEach((name, i) => {
        const image = new Image();
        image.decoding = 'async';
        image.onload = async () => {
          // Decode the source away from the drawing callback before creating its mip.
          try { await image.decode(); }
          catch { if (!image.naturalWidth) return; }
          this.assets[i] = prepare(image,i); this.dirty = true; this.request();
        };
        image.src = 'assets/loading-ui/' + name + '.webp';
      });
    }

    reset() {
      this.clear();
      this.loadArt();
      this.state = 'growing'; this.age = 0; this.growth = .05; this.last = 0;
      this.soundGrowthStage = -1;
      this.dirty = true;
      this.request();
    }

    setMotion(enabled) {
      const value = Boolean(enabled);
      if (value === this.motion) return;
      this.motion = value;
      if (this.state === 'burning') {
        // Keep the last composited frame so a preferences change cannot resurrect burnt twigs.
        this.fadeOnly = true; this.burnAt = performance.now();
      }
      this.dirty = true;
      this.request();
    }

    request() {
      if (!this.raf && this.state !== 'idle' && !document.hidden) this.raf = requestAnimationFrame(this.frame);
    }

    finish() {
      if (this.finished) return this.finished;
      if (this.state !== 'growing' || document.hidden || !this.assets.some(Boolean) || !this.ctx) {
        this.clear(); return Promise.resolve();
      }
      this.finished = new Promise(resolve => { this.resolve = resolve; });
      if (!this.motion || this.growth >= 1) this.beginBurn();
      else this.request();
      return this.finished;
    }

    beginBurn() {
      this.state = 'burning'; this.burnAt = performance.now(); this.fadeOnly = !this.motion;
      stopSound('loading-branches');
      sound('fire-burn', 'loading-burn', this.fadeOnly ? .4 : .75);
      this.lastBins.length = 0;
      this.request();
    }

    clear() {
      cancelAnimationFrame(this.raf); this.raf = 0;
      stopSound('loading-branches');
      stopSound('loading-burn');
      this.state = 'idle'; this.sparks.length = 0;
      if (this.ctx) {
        this.ctx.setTransform(1,0,0,1,0,0);
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      }
      this.canvas.style.opacity = '';
      if (this.resolve) { this.resolve(); this.resolve = null; }
      this.finished = null;
    }

    fit() {
      const {canvas, ctx} = this;
      const w = Math.max(1, canvas.clientWidth), h = Math.max(1, canvas.clientHeight);
      const ratio = Math.min(devicePixelRatio || 1, 1.35, 2200 / Math.max(w, h));
      const pw = Math.round(w * ratio), ph = Math.round(h * ratio);
      if (pw !== canvas.width || ph !== canvas.height) { canvas.width = pw; canvas.height = ph; }
      ctx.setTransform(pw / w, 0, 0, ph / h, 0, 0);
      this.w = w; this.h = h;
    }

    draw(now) {
      if (!this.ctx || this.state === 'idle') return;
      const burning = this.state === 'burning', age = now - this.burnAt;
      if (burning && age >= (this.fadeOnly ? fadeDuration : burnDuration)) { this.clear(); return; }
      if (burning && this.fadeOnly) {
        this.canvas.style.opacity = String(1 - ease(age / fadeDuration));
        this.request(); return;
      }
      const dt = this.last ? Math.min(70, now - this.last) : 16;
      // This full-screen layer runs at 30 fps while the fan and scene keep their own clocks.
      if (this.last && dt < 29 && !this.dirty) { this.request(); return; }
      this.last = now;
      if (this.dirty) this.fit();
      this.dirty = false;
      let advancing = false;
      if (!burning) {
        this.age += dt;
        const target = this.motion ? .05 + .95 * ease(this.age / growthDuration) : 1;
        this.growth = Math.max(this.growth, target);
        advancing = this.motion && this.growth < 1;
        if (this.assets.some(Boolean) && this.growth >= .1) {
          const stage = this.growth >= .65 ? 2 : this.growth >= .35 ? 1 : 0;
          if (stage > this.soundGrowthStage) {
            this.soundGrowthStage = stage;
            sound('branch-grow', 'loading-branches', [.42, .32, .25][stage], [-.4, .35, -.1][stage]);
          }
        }
      }
      const {ctx, w, h} = this;
      ctx.clearRect(0, 0, w, h);
      const portrait = h > w, layout = portrait ? tall : wide;
      const span = Math.min(w, h * 2.15);
      for (let i=0; i<layout.length; i++) {
        const art = this.assets[sources[i]] || this.assets[1 - sources[i]];
        if (!art) continue;
        const g = ease((this.growth - starts[i]) / (.78 - starts[i] * .54));
        if (g < .003) continue;
        const b = burning ? clamp((age/1000 - ignition[i]) / .96) : 0;
        if (b >= 1) continue;
        const [rx, ry, length, degrees, flip] = layout[i];
        const x = rx*w, y = ry*h, sw = length*span, sh = sw * art.image.height / art.image.width;
        const angle = (degrees + (this.motion ? flip * (1 - g) * 4.2 : 0)) * radians;
        const fromRoot = i === 2 || i === 5 || i === 10;
        ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(1, flip);
        ctx.globalAlpha = opacities[i];
        ctx.drawImage(painted(art, g, b, fromRoot), 0, -art.root*sh, sw, sh);
        ctx.restore();
        if (b) this.emit(art, i, g, b, fromRoot, now, x, y, sw, sh, angle, flip);
      }
      if (burning) this.drawSparks(now);
      if (!burning && this.finished && this.growth >= 1) this.beginBurn();
      if (burning || advancing) this.request();
    }

    emit(art, slot, growth, burn, fromRoot, now, x, y, w, h, angle, flip) {
      const t = clamp((burn * 290 - 17)/255);
      const bin = Math.min(99, Math.floor((fromRoot ? t : 1-t)*100));
      if (bin === this.lastBins[slot]) return;
      this.lastBins[slot] = bin;
      const points = art.bins[bin];
      if (!points.length || bin/100 > growth || this.sparks.length >= 110) return;
      const i = points[(bin * 59 + slot * 37) % points.length];
      const u = (i % art.width + .5)/art.width*w;
      const v = ((Math.floor(i/art.width) + .5)/art.height - art.root)*h*flip;
      const sx=x+u*Math.cos(angle)-v*Math.sin(angle), sy=y+u*Math.sin(angle)+v*Math.cos(angle);
      if (sx < 0 || sx > this.w || sy < 0 || sy > this.h) return;
      const seed = (i*7 + slot*61) % 131 / 131;
      const ash = (bin+slot)%3===0;
      this.sparks.push({x:sx,y:sy,born:now,life:230+seed*230,dx:(seed-.35)*45,
        lift:13+seed*31,size:.7+seed*1.25,ash,
        sample:art.emberSamples, u:i%art.width, v:Math.floor(i/art.width)+(ash?art.height:0)});
    }

    drawSparks(now) {
      const ctx = this.ctx;
      for (let i=this.sparks.length-1; i>=0; i--) {
        const p=this.sparks[i], t=(now-p.born)/p.life;
        if (t>=1) { this.sparks.splice(i,1); continue; }
        const x=p.x+p.dx*t+Math.sin(t*4+p.dx)*t*3, y=p.y-p.lift*t;
        ctx.save(); ctx.translate(x,y); ctx.rotate(t*2+p.dx);
        ctx.globalAlpha=(1-t)*(p.ash ? .77 : .98);
        const width=p.size*(1-.4*t), height=p.size*(p.ash ? 1.8 : 1.2);
        if (p.sample) ctx.drawImage(p.sample,p.u,p.v,1,1,-width/2,-height/2,width,height);
        else {
          ctx.fillStyle=p.ash?'#a09287':(t<.35?'#ffd496':'#c66c46');
          ctx.fillRect(-width/2,-height/2,width,height);
        }
        ctx.restore();
      }
    }
  }

  window.LoadingBoughs = LoadingBoughs;
})();
