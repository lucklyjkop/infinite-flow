/* Four lengths of painted silk unwind from outside the viewport to the scroll's roller ends. */
(() => {
  'use strict';

  // Source-space baselines at the two ends of each individual cut of silk.
  const cuts = [
    {file:'upper-left',  left:93, right:79, start:0,    end:.90, width:1.00, bends:[.035,.10]},
    {file:'lower-left',  left:60, right:69, start:.09,  end:1,   width:1.14, bends:[.13,-.11]},
    {file:'upper-right', left:87, right:66, start:.045, end:.92, width:1.08, bends:[-.20,-.09]},
    {file:'lower-right', left:76, right:76, start:.13,  end:.99, width:1.04, bends:[.075,-.065]},
  ];
  const clamp = value => Math.max(0,Math.min(1,value));
  const ease = t => t*t*(3-2*t);

  function counterBounds(dialog) {
    const panel = dialog.querySelector('.shop-counter') || dialog.querySelector('.settings-shop');
    if (!panel?.offsetWidth || !panel.offsetParent) return null;
    // Its opening animation scales the counter. Anchor to the final layout box,
    // so the strands travel toward the suspension points throughout the entrance.
    const parent = panel.offsetParent, base = parent.getBoundingClientRect(), view = dialog.getBoundingClientRect();
    return {
      x:base.left-view.left+parent.clientLeft+panel.offsetLeft-parent.scrollLeft,
      y:base.top-view.top+parent.clientTop+panel.offsetTop-parent.scrollTop,
      w:panel.offsetWidth, h:panel.offsetHeight,
    };
  }

  function ropes(w,h,box) {
    const bleed = Math.max(32,Math.min(w,h)*.11);
    const {x,y,w:pw,h:ph} = box;
    const tall = h > w*1.12;
    const left = x + pw*.10, right = x + pw*.90;
    const upper = y + ph*.17, lower = y + ph*.83;
    const ends = [
      [left, upper], [left, lower],
      [right,upper], [right,lower],
    ];
    const starts = tall ? [
      [w*.065,-bleed],[w*.025,h+bleed],[w*.955,-bleed*.8],[w*.985,h+bleed],
    ] : [
      [-bleed,h*.015],[-bleed,h*.53],[w+bleed,-bleed*.40],[w+bleed,h+bleed*.15],
    ];
    return ends.map(([ex,ey],i) => {
      const [sx,sy] = starts[i], dx=ex-sx, dy=ey-sy, length=Math.max(1,Math.hypot(dx,dy));
      const down = dx>=0 ? 1 : -1;
      return {sx,sy,dx,dy,length,nx:-dy/length*down,ny:dx/length*down};
    });
  }

  // Map short strips of the original painting onto the curved suspension line.
  // A common transverse axis makes neighbouring source strips meet at both hems.
  function silk(ctx, image, cut, line, phase, i, dpr) {
    const reach = ease(clamp((phase-cut.start)/(cut.end-cut.start)));
    if (reach < .002) return;
    const {sx,sy,dx,dy,nx,ny,length} = line;
    const iw=image.naturalWidth, ih=image.naturalHeight;
    const scaleY = Math.min(1.22,Math.max(.18,length/iw)) * cut.width * (.91+.09*reach);
    const [a,b] = cut.bends;
    const wave = Math.sin(reach*Math.PI)*length*.041;
    function top(u) {
      const lead = clamp((u-reach+.27)/.27);
      const bow = 4*u*(1-u)*length*(a*(1-u)+b*u);
      const curl = wave*lead*lead*Math.sin(8*u+1.7*i);
      // Fabric slides through the screen edge. The cut end actually advances
      // with the tip instead of the texture being painted onto a fixed strip.
      const sourceU = 1-reach+u;
      const baseline = cut.left + (cut.right-cut.left)*sourceU;
      const normal = bow+curl-baseline*scaleY;
      return [sx+dx*u+nx*normal, sy+dy*u+ny*normal];
    }
    const segments = Math.max(1,Math.ceil(Math.min(46,Math.max(18,length/19))*reach));
    const step = reach/segments;
    let lhs = top(0);
    for (let n=0; n<segments; n++) {
      const u = n*step, rhs = top(u+step);
      const sourceX = iw*(1-reach+u), sw = Math.min(iw-sourceX,iw*step);
      if (sw <= 0) break;
      const ux=(rhs[0]-lhs[0])/sw, uy=(rhs[1]-lhs[1])/sw;
      ctx.setTransform(dpr*ux,dpr*uy,dpr*nx*scaleY,dpr*ny*scaleY,dpr*lhs[0],dpr*lhs[1]);
      // Subpixel overlap closes rasterization seams in the opaque silk face.
      const extra = n+1<segments ? Math.min(iw-sourceX-sw,.85/(dpr*Math.max(.001,Math.hypot(ux,uy)))) : 0;
      ctx.drawImage(image,sourceX,0,sw+extra,ih,0,0,sw+extra,ih);
      lhs=rhs;
    }
  }

  class SettingsCords {
    constructor(dialog) {
      this.dialog = dialog;
      this.canvas = document.createElement('canvas');
      this.canvas.className = 'settings-cords settings-ribbons';
      this.canvas.setAttribute('aria-hidden','true');
      this.canvas.hidden = true;
      this.ctx = this.canvas.getContext('2d');
      dialog.prepend(this.canvas);
      this.progress = this.target = this.frame = 0;
      this.images = [];
      this.ready = false;
      this.media = matchMedia('(prefers-reduced-motion: reduce)');
      const stopMotion = () => { if (this.reduced() && this.job) this.settle(this.target); };
      this.media.addEventListener('change',stopMotion);
      document.addEventListener('visibilitychange',stopMotion);
      window.addEventListener('infinite:settings',stopMotion);
      dialog.addEventListener('close',() => { if (!dialog.open) this.clear(); });
      this.resize = new ResizeObserver(() => {
        if (!this.canvas.hidden) { this.layout(); this.paint(this.progress); }
      });
      this.resize.observe(dialog);
      const panel = dialog.querySelector('.shop-counter') || dialog.querySelector('.settings-shop');
      if (panel) this.resize.observe(panel);
      Promise.all(cuts.map(async (cut,i) => {
        const image = new Image();
        image.decoding = 'async';
        image.src = 'assets/settings-ui/ribbon-'+cut.file+'.webp';
        try { await image.decode(); this.images[i]=image; }
        catch { /* A missing decoration does not block interaction with the shop. */ }
      })).then(() => {
        this.ready = true;
        if (this.job) this.run();
        else if (!this.canvas.hidden) this.paint(this.progress);
      });
      this.tick = now => {
        this.frame = 0;
        const job = this.job;
        if (!job) return;
        const t = clamp((now-job.start)/job.duration);
        if (t>=1) this.settle(this.target);
        else {
          this.paint(job.from+(this.target-job.from)*t);
          this.frame = requestAnimationFrame(this.tick);
        }
      };
    }

    reduced() {
      return this.media.matches || document.hidden || document.getElementById('world')?.classList.contains('motion-off');
    }

    layout() {
      const w=this.dialog.clientWidth, h=this.dialog.clientHeight;
      if (!w || !h) return;
      const dpr=this.dpr=Math.min(window.devicePixelRatio||1,1.6,2200/Math.max(w,h));
      const pw=Math.max(1,Math.round(w*dpr)), ph=Math.max(1,Math.round(h*dpr));
      if (this.canvas.width!==pw || this.canvas.height!==ph) { this.canvas.width=pw; this.canvas.height=ph; }
      const box = counterBounds(this.dialog) || {x:w*.3,y:h*.16,w:w*.43,h:h*.70};
      this.lines = ropes(w,h,box);
    }

    paint(value) {
      this.progress = value;
      const ctx=this.ctx;
      if (!ctx || !this.lines) return;
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,this.canvas.width,this.canvas.height);
      if (!value) return;
      for (let i=0;i<cuts.length;i++) {
        if (this.images[i]) silk(ctx,this.images[i],cuts[i],this.lines[i],value,i,this.dpr);
      }
    }

    stop() {
      cancelAnimationFrame(this.frame); this.frame = 0;
      if (this.job) { this.job.resolve(); this.job = null; }
    }

    settle(value) {
      this.paint(value);
      this.canvas.hidden = !value;
      this.stop();
    }

    run() {
      if (this.reduced() || !this.ctx || !this.images.some(Boolean)) { this.settle(this.target); return; }
      const job = this.job;
      job.start = performance.now() + (this.target ? 0 : 55);
      job.duration = (this.target ? 720 : 460)*Math.abs(this.target-job.from);
      this.frame = requestAnimationFrame(this.tick);
    }

    play(target) {
      if (this.target===target && this.job) return this.job.promise;
      this.stop();
      this.target=target;
      if (target) { this.canvas.hidden=false; this.layout(); }
      if (this.progress===target || this.reduced()) { this.settle(target); return Promise.resolve(); }
      let resolve;
      const promise = new Promise(done => { resolve=done; });
      this.job={promise,resolve,from:this.progress};
      if (this.ready) this.run();
      return promise;
    }

    open() { return this.play(1); }
    close() { return this.play(0); }
    clear() { this.target=0; this.settle(0); }
  }

  window.SettingsCords = SettingsCords;
})();
