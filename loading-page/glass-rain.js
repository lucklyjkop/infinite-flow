/* Rain on the viewer's side of the glass. All positions are in screen pixels. */
(() => {
  'use strict';
  const between = (a, b) => a + Math.random() * (b - a);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const smooth = t => t * t * (3 - 2 * t);
  const period = 1000 / 30;

  function makeBead(lean) {
    // A water bead has a dark upper lip and a small, brighter lower meniscus.
    const shape = new Path2D();
    shape.moveTo(lean, -.98);
    shape.bezierCurveTo(.62, -.98, .94, -.38, .94, .22);
    shape.bezierCurveTo(.94, .72, .48, .97, -.05, .97);
    shape.bezierCurveTo(-.64, .97, -.98, .67, -.94, .16);
    shape.bezierCurveTo(-.87, -.42, -.43, -.94, lean, -.98);
    shape.closePath();
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 40;
    const ctx = sprite.getContext('2d');
    ctx.setTransform(18, 0, 0, 18, 20, 20);
    ctx.clip(shape);
    const shade = ctx.createLinearGradient(-.12, -1, .13, 1);
    shade.addColorStop(0, 'rgba(26,30,34,.26)');
    shade.addColorStop(.23, 'rgba(3,9,16,.63)');
    shade.addColorStop(.53, 'rgba(14,28,35,.20)');
    shade.addColorStop(.78, 'rgba(128,161,171,.09)');
    shade.addColorStop(1, 'rgba(183,203,204,.37)');
    ctx.fillStyle = shade;
    ctx.fillRect(-1, -1, 2, 2);
    ctx.beginPath();
    ctx.moveTo(-.66, .65);
    ctx.bezierCurveTo(-.25, .90, .47, .81, .74, .40);
    ctx.bezierCurveTo(.63, .81, .02, 1.03, -.54, .84);
    ctx.closePath();
    ctx.fillStyle = 'rgba(230,236,227,.72)';
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(lean - .18, -.76, .18, .06, -.32, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(219,228,225,.37)';
    ctx.fill();
    return {sprite, shape};
  }

  class GlassRain {
    constructor(canvas, image) {
      this.canvas = canvas;
      this.image = image;
      this.ctx = canvas.getContext('2d');
      this.beads = [];
      this.sprites = null;
      this.running = false;
      this.slides = 0;
      this.frames = 0;
      this.frame = this.frame.bind(this);
      this.resize = this.resize.bind(this);
      window.addEventListener('resize', this.resize, {passive:true});
    }

    resize() {
      if (!this.running) return;
      this.w = this.canvas.clientWidth;
      this.h = this.canvas.clientHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      this.canvas.width = Math.max(1, Math.round(this.w * this.dpr));
      this.canvas.height = Math.max(1, Math.round(this.h * this.dpr));
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const count = clamp(Math.round(this.w*this.h/39000), 21, 48);
      const columns = Math.max(3, Math.round(Math.sqrt(count*this.w/Math.max(1,this.h))));
      const rows = Math.ceil(count/columns);
      this.beads = Array.from({length:count}, (_, i) => this.bead(
        (i%columns + between(.1,.9))*this.w/columns,
        (Math.floor(i/columns) + between(.1,.9))*this.h/rows, i));
      const style = getComputedStyle(this.image);
      const iw = this.image.naturalWidth || 1, ih = this.image.naturalHeight || 1;
      const scale = style.objectFit === 'contain' ? Math.min(this.w/iw,this.h/ih) : Math.max(this.w/iw,this.h/ih);
      const [px,py] = style.objectPosition.split(' ').map(s => Number.parseFloat(s)/100);
      this.photo = {w:iw*scale, h:ih*scale, x:(this.w-iw*scale)*px, y:(this.h-ih*scale)*py};
    }

    bead(x, y, seed = -1) {
      const radius = between(1.65,4.2) * (this.w > 850 ? 1.24 : 1);
      return {x, y, radius, opacity:between(.64,.94), sprite:this.sprites[Math.floor(between(0,this.sprites.length))],
        age:seed < 0 ? 0 : between(.7,3), life:between(7,16), wait:seed >= 0 && seed%6 === 0 ? between(.15,1) : between(1.2,5.5),
        sliding:false, stretch:0, trail:[], pin:null, dirty:null};
    }

    start() {
      if (this.running || !this.ctx || document.hidden) return;
      this.running = true;
      this.sprites ||= [-.23,.06,.24].map(makeBead);
      this.resize();
      this.last = 0; this.next = 0;
      this.id = requestAnimationFrame(this.frame);
      // The baked miniature is the same original photo. No capture of the
      // full-resolution background or cross-origin pixel read is needed.
      if (!this.thumbnailRequested) {
        this.thumbnailRequested = true;
        const sample = new Image();
        sample.decoding = 'async';
        sample.onload = () => { this.thumbnail = sample; };
        sample.onerror = () => { sample.onerror = null; sample.src = 'assets/hongzhuang-glass-sample.jpg'; };
        sample.src = 'assets/hongzhuang-glass-sample.webp';
      }
    }

    stop() {
      if (!this.running) return;
      this.running = false;
      cancelAnimationFrame(this.id);
      this.ctx.clearRect(0,0,this.w,this.h);
      this.beads.length = 0;
    }

    advance(drop, dt) {
      drop.age += dt;
      for (const point of drop.trail) point.life -= dt;
      while (drop.trail.length && drop.trail[0].life <= 0) drop.trail.shift();
      if (drop.pin) {
        drop.pin.life -= dt;
        if (drop.pin.life <= 0) drop.pin = null;
      }
      if (!drop.sliding) {
        drop.wait -= dt;
        if (drop.wait > 0) return;
        drop.sliding = true;
        this.slides++;
        drop.sx = drop.x; drop.sy = drop.y;
        drop.phase = 0; drop.duration = between(.48,1.12);
        drop.travel = between(3.1,9.4)*drop.radius;
        drop.drift = between(-.12,.12)*drop.travel;
        drop.wobble = between(-1,1)*drop.radius*.45;
        drop.trail.push({x:drop.x,y:drop.y,life:.85});
        drop.pin = {x:drop.x, y:drop.y, life:1.7};
      }
      drop.phase = Math.min(1, drop.phase + dt/drop.duration);
      const t = smooth(drop.phase);
      drop.x = drop.sx + drop.drift*t + drop.wobble*Math.sin(t*Math.PI*2);
      drop.y = drop.sy + drop.travel*t;
      drop.stretch = Math.sin(drop.phase*Math.PI);
      const last = drop.trail[drop.trail.length-1];
      if (!last || drop.y-last.y > 3) drop.trail.push({x:drop.x,y:drop.y,life:.85});
      if (drop.phase === 1) { drop.sliding = false; drop.wait = between(1.1,5.4); }
    }

    draw(drop) {
      const ctx = this.ctx, r = drop.radius;
      const x = drop.x, y = drop.y;
      const opacity = drop.opacity * clamp(drop.age/.55,0,1) * clamp((drop.life-drop.age)/.7,0,1);
      const rx = r*(1-.13*drop.stretch), ry = r*(1.13+.39*drop.stretch);
      const first = drop.trail[0];
      if (first) {
        ctx.beginPath();
        ctx.moveTo(first.x,first.y);
        for (let i=1;i<drop.trail.length;i++) ctx.lineTo(drop.trail[i].x,drop.trail[i].y);
        ctx.lineTo(x,y);
        ctx.lineCap = 'round'; ctx.lineWidth = r*.27;
        ctx.strokeStyle = 'rgba(165,184,186,.22)';
        ctx.globalAlpha = opacity*clamp(drop.trail[drop.trail.length-1].life/.4,0,1);
        ctx.stroke();
      }
      const sprite = drop.sprite.sprite;
      if (drop.pin) {
        const s=r*.72;
        ctx.globalAlpha=opacity*.69*clamp(drop.pin.life/.45,0,1);
        ctx.drawImage(sprite, drop.pin.x-s/2,drop.pin.y-s/2,s,s);
      }
      const photo=this.photo, thumb=this.thumbnail;
      if (thumb && x>photo.x && x<photo.x+photo.w && y>photo.y && y<photo.y+photo.h) {
        const sx = (x-photo.x)/photo.w*thumb.width, sy = (y-photo.y)/photo.h*thumb.height;
        const sw=rx*6.4/photo.w*thumb.width, sh=ry*6.4/photo.h*thumb.height;
        ctx.save();
        ctx.translate(x,y); ctx.scale(rx,ry); ctx.clip(drop.sprite.shape);
        ctx.scale(-1,-1); ctx.globalAlpha=opacity*.43;
        ctx.drawImage(thumb,sx-sw/2,sy-sh/2,sw,sh,-1,-1,2,2);
        ctx.restore();
      }
      ctx.globalAlpha = opacity;
      ctx.drawImage(sprite,x-rx/0.9,y-ry/0.9,rx*2/0.9,ry*2/0.9);
      const top = Math.min(y-ry*1.2, first?.y ?? y, drop.pin?.y ?? y)-r;
      const left = Math.min(x,first?.x ?? x,drop.pin?.x ?? x)-r*2-3;
      const right = Math.max(x,first?.x ?? x,drop.pin?.x ?? x)+r*2+3;
      drop.dirty = [left,top-2,right-left,y+ry*1.2+3-top+2];
    }

    frame(now) {
      if (!this.running) return;
      if (document.hidden) { this.stop(); return; }
      this.id = requestAnimationFrame(this.frame);
      if (now < this.next-.5) return;
      const dt = this.last ? Math.min(.08,(now-this.last)/1000) : 0;
      this.last = now;
      this.next += period;
      if (this.next <= now) this.next = now + period;
      const ctx = this.ctx;
      // Most of the overlay stays untouched, including on high-DPI desktops.
      for (const bead of this.beads) if (bead.dirty) ctx.clearRect(...bead.dirty);
      for (let i=0;i<this.beads.length;i++) {
        let bead = this.beads[i];
        this.advance(bead,dt);
        if (bead.age >= bead.life || bead.y > this.h+bead.radius)
          bead = this.beads[i] = this.bead(between(2,this.w-2),between(4,this.h*.91));
        this.draw(bead);
      }
      ctx.globalAlpha = 1;
      this.frames++;
    }

    getState() {
      return {running:this.running, drops:this.beads.length, sliding:this.beads.filter(b=>b.sliding).length,
        trails:this.beads.filter(b=>b.trail.length>0).length, slides:this.slides, frames:this.frames,
        refracting:!!this.thumbnail};
    }
  }

  window.GlassRain = GlassRain;
})();
